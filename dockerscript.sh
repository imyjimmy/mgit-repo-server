#!/bin/bash
# Usage:
#   ./dockerscript.sh [Y|N] [no-appt]
#   Y/N: Preserve repositories (default: Y)
#   no-appt: Skip EasyAppointments containers (default: deploy EasyAppointments)
set -e # exit on ANY command failure
# Get command line argument, default to "Y" (preserve) if not provided
REMOVE_REPOS=${1:-Y}

if [[ -f .env ]]; then
    echo "📄 Loading environment variables from .env"
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  No .env file found, using defaults"
fi

# Now you can use the environment variables
PHP_ENV=${PHP_ENV:-production}

# Detect environment and set paths accordingly
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS development environment
    echo "🍎 Running on macOS (development)"
    REPOS_PATH="$(pwd)/../private_repos"
    CONTAINER_PREFIX="mgit-repo-server"
    docker network create plebemr_admin_network 2>/dev/null || true
    NETWORK_FLAG="--network plebemr_admin_network"

    # EasyAppointments paths for macOS
    APPOINTMENTS_DATA_PATH="$(pwd)/../app-data"
    EASYAPPOINTMENTS_SOURCE_PATH="$(pwd)/easyappointments"
else
    # Umbrel/Linux environment
    echo "🐧 Running on Umbrel/Linux (production)"
    REPOS_PATH="/home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos"
    CONTAINER_PREFIX="mgitreposerver-mgit-repo-server"
    NETWORK_FLAG="--network umbrel_main_network"

    # EasyAppointments paths for Umbrel
    APPOINTMENTS_DATA_PATH="/home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments"
    EASYAPPOINTMENTS_SOURCE_PATH="/home/imyjimmy/dev/mgit-repo-server/easyappointments"

fi

if [[ "$OSTYPE" == "darwin"* ]] && [[ "${2:-}" != "no-appt" ]]; then
    if [[ ! -d "$EASYAPPOINTMENTS_SOURCE_PATH" ]]; then
        echo "❌ EasyAppointments source not found at: $EASYAPPOINTMENTS_SOURCE_PATH"
        echo "💡 Please ensure the easyappointments directory exists or adjust EASYAPPOINTMENTS_SOURCE_PATH"
        exit 1
    fi
fi

echo "📁 Using repos path: $REPOS_PATH"
echo "📁 Using appointments data path: $APPOINTMENTS_DATA_PATH"

# Create repos directory if it doesn't exist (for macOS)
mkdir -p "$REPOS_PATH"
mkdir -p "$APPOINTMENTS_DATA_PATH"/{mysql,openldap/{certificates,slapd/{database,config}},mailpit,baikal/{config,data}}

echo "🛑 Stopping containers..."
docker stop ${CONTAINER_PREFIX}_web_1 2>/dev/null || echo "Container ${CONTAINER_PREFIX}_web_1 not running"
docker stop ${CONTAINER_PREFIX}_tor_server_1 2>/dev/null || echo "Container ${CONTAINER_PREFIX}_tor_server_1 not running"
docker stop ${CONTAINER_PREFIX}_app_proxy_1 2>/dev/null || echo "Container ${CONTAINER_PREFIX}_app_proxy_1 not running"

echo "🗑️ Removing old container and image..."
docker rm ${CONTAINER_PREFIX}_web_1 2>/dev/null || echo "Container ${CONTAINER_PREFIX}_web_1 already removed"
docker rmi imyjimmy/mgit-repo-server:latest 2>/dev/null || echo "Image imyjimmy/mgit-repo-server:latest not found locally"

echo "🔨 Building new image..."
docker build --platform linux/amd64 --no-cache -t imyjimmy/mgit-repo-server:latest .

# Exit if build fails (this is critical)
if [ $? -ne 0 ]; then
    echo "❌ Docker build failed! Exiting..."
    exit 1
fi

echo "📤 Pushing to Docker Hub..."
docker push imyjimmy/mgit-repo-server:latest

# Exit if push fails (this is critical)
if [ $? -ne 0 ]; then
    echo "❌ Docker push failed! Exiting..."
    exit 1
fi

# Check if user wants to remove repositories (only on Umbrel)
if [[ "$OSTYPE" != "darwin"* ]]; then
    if [[ $REMOVE_REPOS =~ ^[Nn]$ ]]; then
        echo "🗑️  Removing existing repositories..."
        rm -rf ${REPOS_PATH}/*
    else
        echo "📁 Preserving existing repositories..."
    fi
fi

echo "📥 Pulling fresh image from Docker Hub..."
docker pull imyjimmy/mgit-repo-server:latest

echo "🚀 Starting new container..."
docker run -d --name ${CONTAINER_PREFIX}_web_1 \
  $NETWORK_FLAG \
  -v "${REPOS_PATH}:/private_repos" \
  -p 3003:3003 \
  imyjimmy/mgit-repo-server:latest

# Exit if container start fails
if [ $? -ne 0 ]; then
    echo "❌ Failed to start main container! Exiting..."
    exit 1
fi

# EasyAppointments container creation function
create_easyappointments_containers() {
    echo "🏗️ Creating EasyAppointments containers..."
    
    # # create a netowrk
    # if [[ "$OSTYPE" == "darwin"* ]]; then
    #     docker network create easyappt-network 2>/dev/null || true
    #     NETWORK_FLAG="--network easyappt-network"
    # fi

    # Generate nginx config with correct container name
    NGINX_CONFIG_TEMP="$(pwd)/nginx-easyappt-${CONTAINER_PREFIX}.conf"
    cat > "$NGINX_CONFIG_TEMP" << EOF
server {
    listen 80 default;
    
    server_name localhost;

    client_max_body_size 128M;

    access_log /var/log/nginx/application.access.log;

    root /var/www/html;
    
    index index.php index.html;
    
    location / {
        try_files \$uri \$uri/ /index.php?\$args;
    }
        
    location ~ ^.+.php {
        fastcgi_pass ${CONTAINER_PREFIX}_appointments_php_1:9000;
        fastcgi_split_path_info ^(.+?.php)(/.*)$;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_param PHP_VALUE "error_log=/var/log/nginx/application_php_errors.log";
        fastcgi_buffers 16 16k;
        fastcgi_buffer_size 32k;
        fastcgi_index index.php;
        include fastcgi_params;
    }
    
    location ~ /\.ht {
        deny all;
    }
}
EOF

    echo "Generated config file at: $NGINX_CONFIG_TEMP"
    ls -la "$NGINX_CONFIG_TEMP"
    cat "$NGINX_CONFIG_TEMP"

    # Build required custom images if they don't exist
    if ! docker images | grep -q "easyappt-php.*latest"; then
        echo "🔨 Building easyappt-php image..."
        cd "${EASYAPPOINTMENTS_SOURCE_PATH}"
        docker build -f docker/php-fpm/Dockerfile --no-cache -t easyappt-php:latest .
        cd - > /dev/null
    fi

    # Clear mysql data for fresh install
    if [[ "$REMOVE_REPOS" =~ ^[Nn]$ ]] || [[ "${3:-}" == "fresh-db" ]]; then
        echo "🗑️ Clearing MySQL data for fresh installation..."
        rm -rf "${APPOINTMENTS_DATA_PATH}/mysql"
        mkdir -p "${APPOINTMENTS_DATA_PATH}/mysql"
    fi

    # Create MySQL container (remove existing first)
    docker rm -f ${CONTAINER_PREFIX}_appointments_mysql_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_mysql_1 \
      $NETWORK_FLAG \
      -v "${APPOINTMENTS_DATA_PATH}/mysql:/var/lib/mysql" \
      -e MYSQL_ROOT_PASSWORD=secret \
      -e MYSQL_DATABASE=easyappointments \
      -e MYSQL_USER=user \
      -e MYSQL_PASSWORD=password \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 3306:3306"; fi) \
      mysql:8.0

    # Wait for MySQL to be ready
    echo "⏳ Waiting for MySQL to initialize..."
    sleep 10

    # Create OpenLDAP container
    docker rm -f ${CONTAINER_PREFIX}_appointments_openldap_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_openldap_1 \
      $NETWORK_FLAG \
      --hostname openldap \
      -v "${APPOINTMENTS_DATA_PATH}/openldap/certificates:/container/service/slapd/assets/certs" \
      -v "${APPOINTMENTS_DATA_PATH}/openldap/slapd/database:/var/lib/ldap" \
      -v "${APPOINTMENTS_DATA_PATH}/openldap/slapd/config:/etc/ldap/slapd.d" \
      -e LDAP_ORGANISATION=example \
      -e LDAP_DOMAIN=example.org \
      -e LDAP_ADMIN_USERNAME=admin \
      -e LDAP_ADMIN_PASSWORD=admin \
      -e LDAP_CONFIG_PASSWORD=config_pass \
      -e LDAP_BASE_DN=dc=example,dc=org \
      -e LDAP_READONLY_USER=true \
      -e LDAP_READONLY_USER_USERNAME=user \
      -e LDAP_READONLY_USER_PASSWORD=password \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 389:389 -p 636:636"; fi) \
      osixia/openldap:1.5.0

    # Create PHP-FPM container
    docker rm -f ${CONTAINER_PREFIX}_appointments_php_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_php_1 \
      $NETWORK_FLAG \
      --add-host host.docker.internal:host-gateway \
      -e PHP_ENV="$PHP_ENV" \
      -v "${EASYAPPOINTMENTS_SOURCE_PATH}:/var/www/html" \
      -v "${EASYAPPOINTMENTS_SOURCE_PATH}/docker/php-fpm/php-ini-overrides.ini:/usr/local/etc/php/conf.d/99-overrides.ini" \
      --workdir /var/www/html \
      easyappt-php:latest

    # Create PHPMyAdmin container
    docker rm -f ${CONTAINER_PREFIX}_appointments_phpmyadmin_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_phpmyadmin_1 \
      $NETWORK_FLAG \
      -e PMA_HOST=${CONTAINER_PREFIX}_appointments_mysql_1 \
      -e UPLOAD_LIMIT=102400K \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 8081:80"; fi) \
      phpmyadmin:5.2.1

    echo "⏳ Waiting for PHP container to be ready..."
    sleep 5

    # Create Mailpit container
    docker rm -f ${CONTAINER_PREFIX}_appointments_mailpit_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_mailpit_1 \
      $NETWORK_FLAG \
      -v "${APPOINTMENTS_DATA_PATH}/mailpit:/data" \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 8025:8025 -p 1025:1025"; fi) \
      axllent/mailpit:latest

    # Create Swagger container
    docker rm -f ${CONTAINER_PREFIX}_appointments_swagger_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_swagger_1 \
      $NETWORK_FLAG \
      --platform linux/amd64 \
      -v "${EASYAPPOINTMENTS_SOURCE_PATH}/openapi.yml:/usr/share/nginx/html/openapi.yml" \
      -e API_URL=openapi.yml \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 8082:8080"; fi) \
      swaggerapi/swagger-ui:v5.10.5

    # Create Baikal container
    docker rm -f ${CONTAINER_PREFIX}_appointments_baikal_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_baikal_1 \
      $NETWORK_FLAG \
      -v "${APPOINTMENTS_DATA_PATH}/baikal:/var/www/html" \
      -v "${APPOINTMENTS_DATA_PATH}/baikal/config:/var/www/baikal/config" \
      -v "${APPOINTMENTS_DATA_PATH}/baikal/data:/var/www/baikal/Specific" \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 8083:80"; fi) \
      ckulka/baikal:0.10.1-apache

    # Create phpLDAPadmin container
    docker rm -f ${CONTAINER_PREFIX}_appointments_phpldapadmin_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_phpldapadmin_1 \
      $NETWORK_FLAG \
      --hostname phpldapadmin \
      -e PHPLDAPADMIN_LDAP_HOSTS=${CONTAINER_PREFIX}_appointments_openldap_1 \
      -e PHPLDAPADMIN_HTTPS=false \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 8084:80"; fi) \
      osixia/phpldapadmin:0.9.0

    # Create Nginx container
    docker rm -f ${CONTAINER_PREFIX}_appointments_nginx_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_appointments_nginx_1 \
      $NETWORK_FLAG \
      -v "${EASYAPPOINTMENTS_SOURCE_PATH}:/var/www/html" \
      -v "$NGINX_CONFIG_TEMP:/etc/nginx/conf.d/default.conf" \
      --workdir /var/www/html \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 8080:80"; fi) \
      nginx:1.23.3-alpine

    # Clean up temp file
    # rm -f "$NGINX_CONFIG_TEMP"

    echo "✅ EasyAppointments containers created!"
    
    # Show access info for macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo ""
        echo "🌐 EasyAppointments services available at:"
        echo "   - Nginx (main app): http://localhost:8080"
        echo "   - PHPMyAdmin: http://localhost:8081"
        echo "   - Swagger UI: http://localhost:8082"
        echo "   - Baikal CalDAV: http://localhost:8083"
        echo "   - phpLDAPadmin: http://localhost:8084"
        echo "   - Mailpit: http://localhost:8025"
        echo "   - MySQL: localhost:3306"
    fi
}

# Only start additional containers on Umbrel
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "▶️ Starting other containers..."
    docker start ${CONTAINER_PREFIX}_app_proxy_1 2>/dev/null || echo "Proxy container not found"
    docker start ${CONTAINER_PREFIX}_tor_server_1 2>/dev/null || echo "Tor container not found"
fi

# Add EasyAppointments creation at the end
if [[ "${2:-}" != "no-appt" ]]; then
    create_easyappointments_containers
fi

echo "✅ Deployment complete!"

# Show access info
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🌐 MGit server available at: http://localhost:3003"
else
    echo "🌐 Server available through Umbrel interface"
fi
