#!/bin/bash
set -e # exit on ANY command failure
# Get command line argument, default to "Y" (preserve) if not provided
REMOVE_REPOS=${1:-Y}

echo "🛑 Stopping containers..."
docker stop mgitreposerver-mgit-repo-server_web_1
docker stop mgitreposerver-mgit-repo-server_tor_server_1  
docker stop mgitreposerver-mgit-repo-server_app_proxy_1

echo "🗑️ Removing old container and image..."
docker rm mgitreposerver-mgit-repo-server_web_1
docker rmi imyjimmy/mgit-repo-server:latest

echo "🔨 Building new image..."
docker build --no-cache -t imyjimmy/mgit-repo-server:latest .

echo "📤 Pushing to Docker Hub..."
docker push imyjimmy/mgit-repo-server:latest

# Check if user wants to remove repositories
if [[ $REMOVE_REPOS =~ ^[Nn]$ ]]; then
    echo "🗑️  Removing existing repositories..."
    rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/*
else
    echo "📁 Preserving existing repositories..."
fi

echo "📥 Pulling fresh image from Docker Hub..."
docker pull imyjimmy/mgit-repo-server:latest

echo "🚀 Starting new container..."
docker run -d --name mgitreposerver-mgit-repo-server_web_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos:/private_repos \
  imyjimmy/mgit-repo-server:latest

echo "🏗️ Creating EasyAppointments containers..."

# Create MySQL container
docker run -d --name mgitreposerver-mgit-repo-server_appointments_mysql_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/mysql:/var/lib/mysql \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=easyappointments \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=password \
  mysql:8.0

# Wait for MySQL to be ready
echo "⏳ Waiting for MySQL to initialize..."
sleep 10

# Create OpenLDAP container
docker run -d --name mgitreposerver-mgit-repo-server_appointments_openldap_1 \
  --network umbrel_main_network \
  --hostname openldap \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/openldap/certificates:/container/service/slapd/assets/certs \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/openldap/slapd/database:/var/lib/ldap \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/openldap/slapd/config:/etc/ldap/slapd.d \
  -e LDAP_ORGANISATION=example \
  -e LDAP_DOMAIN=example.org \
  -e LDAP_ADMIN_USERNAME=admin \
  -e LDAP_ADMIN_PASSWORD=admin \
  -e LDAP_CONFIG_PASSWORD=config_pass \
  -e LDAP_BASE_DN=dc=example,dc=org \
  -e LDAP_READONLY_USER=true \
  -e LDAP_READONLY_USER_USERNAME=user \
  -e LDAP_READONLY_USER_PASSWORD=password \
  osixia/openldap:1.5.0

# Create PHP-FPM container
docker run -d --name mgitreposerver-mgit-repo-server_appointments_php_1 \
  --network umbrel_main_network \
  --add-host host.docker.internal:host-gateway \
  -v /home/imyjimmy/dev/mgit-repo-server/easyappointments:/var/www/html \
  -v /home/imyjimmy/dev/mgit-repo-server/easyappointments/docker/php-fpm/php-ini-overrides.ini:/usr/local/etc/php/conf.d/99-overrides.ini \
  --workdir /var/www/html \
  easyappt-php:latest #php:8.1-fpm #imyjimmy/mgit-repo-server-easyappt-php:latest

# Create Nginx container
docker run -d --name mgitreposerver-mgit-repo-server_appointments_nginx_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/dev/mgit-repo-server/easyappointments:/var/www/html \
  -v /home/imyjimmy/dev/mgit-repo-server/easyappointments/docker/nginx/nginx.conf:/etc/nginx/conf.d/default.conf \
  --workdir /var/www/html \
  nginx:1.23.3-alpine

# Create other supporting containers
docker run -d --name mgitreposerver-mgit-repo-server_appointments_phpmyadmin_1 \
  --network umbrel_main_network \
  -e PMA_HOST=mgitreposerver-mgit-repo-server_appointments_mysql_1 \
  -e UPLOAD_LIMIT=102400K \
  phpmyadmin:5.2.1

docker run -d --name mgitreposerver-mgit-repo-server_appointments_mailpit_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/mailpit:/data \
  axllent/mailpit:v1.7

docker run -d --name mgitreposerver-mgit-repo-server_appointments_swagger_1 \
  --network umbrel_main_network \
  --platform linux/amd64 \
  -v /home/imyjimmy/dev/mgit-repo-server/easyappointments/openapi.yml:/usr/share/nginx/html/openapi.yml \
  -e API_URL=openapi.yml \
  swaggerapi/swagger-ui:v5.10.5

docker run -d --name mgitreposerver-mgit-repo-server_appointments_baikal_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/baikal:/var/www/html \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/baikal/config:/var/www/baikal/config \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/baikal/data:/var/www/baikal/Specific \
  ckulka/baikal:0.10.1-apache

docker run -d --name mgitreposerver-mgit-repo-server_appointments_phpldapadmin_1 \
  --network umbrel_main_network \
  --hostname phpldapadmin \
  -e PHPLDAPADMIN_LDAP_HOSTS=mgitreposerver-mgit-repo-server_appointments_openldap_1 \
  -e PHPLDAPADMIN_HTTPS=false \
  osixia/phpldapadmin:0.9.0

echo "✅ EasyAppointments containers created!"

echo "▶️ Starting other containers..."
docker start mgitreposerver-mgit-repo-server_app_proxy_1
docker start mgitreposerver-mgit-repo-server_tor_server_1

echo "✅ Deployment complete!"
