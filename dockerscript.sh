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
NODE_ENV=${NODE_ENV:-production}

# Detect environment and set paths accordingly
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS development environment
    echo "🍎 Running on macOS (development)"
    REPOS_PATH="$(pwd)/../private_repos"
    CONTAINER_PREFIX="mgit-repo-server"
    docker network create plebemr_admin_network 2>/dev/null || true
    NETWORK_FLAG="--network plebemr_admin_network"
    HAS_PROXY_TOR=false
    
    # Detect Mac architecture for platform
    if [[ $(uname -m) == "arm64" ]]; then
        PLATFORM="linux/arm64"
        echo "🔧 Detected Apple Silicon (ARM64)"
    else
        PLATFORM="linux/amd64"
        echo "🔧 Detected Intel Mac (AMD64)"
    fi

    # EasyAppointments paths for macOS
    APPOINTMENTS_DATA_PATH="$(pwd)/../app-data"
    EASYAPPOINTMENTS_SOURCE_PATH="$(pwd)/easyappointments"
else
    # Umbrel/Linux environment
    echo "🐧 Running on Umbrel/Linux (production)"
    REPOS_PATH="/home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos"
    CONTAINER_PREFIX="mgitreposerver-mgit-repo-server"
    NETWORK_FLAG="--network umbrel_main_network"
    HAS_PROXY_TOR=true

    # Detect Linux architecture for platform
    if [[ $(uname -m) == "aarch64" ]]; then
        PLATFORM="linux/arm64"
        echo "🔧 Detected ARM64 Linux"
    elif [[ $(uname -m) == "x86_64" ]]; then
        PLATFORM="linux/amd64" 
        echo "🔧 Detected x86_64 Linux"
    else
        PLATFORM="linux/amd64"  # Default fallback
        echo "🔧 Unknown architecture, defaulting to AMD64"
    fi

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

echo "🔨 Building new image on platform $PLATFORM"
docker build --platform ${PLATFORM} --no-cache -t imyjimmy/mgit-repo-server:latest .

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

echo "🚀 Starting new web_1 container, NODE_ENV: $NODE_ENV"
if [ "$NODE_ENV" = 'development' ]; then
    # Mounts the entire current directory into /app in the container
    # Uses nodemon for auto-restarting when files change
    # Anonymous volume for node_modules to avoid conflicts between host and container dependencies
    # Hot reload capability - any changes you make to files locally are immediately reflected in the running container
    docker run -d --name ${CONTAINER_PREFIX}_web_1 \
    $NETWORK_FLAG \
    -v "${REPOS_PATH}:/private_repos" \
    -v "$(pwd):/app" \
    -v "/app/node_modules" \
    -v "$(pwd)/.env:/app/.env" \
    -e "NODE_ENV=${NODE_ENV}" \
    -e "MGITPATH=/usr/local/bin" \
    -p 3003:3003 \
    --restart unless-stopped \
    imyjimmy/mgit-repo-server:latest \
    sh -c "npm install nodemon --save-dev 2>/dev/null; npx nodemon server.js"
else
    # Mounts specific files only - just the exact files needed to run
    # Uses regular node (not nodemon)
    # No hot reload - changes to local files won't affect the running container
    # More secure/isolated - only necessary files are accessible inside container
    docker run -d --name ${CONTAINER_PREFIX}_web_1 \
    $NETWORK_FLAG \
    -v "${REPOS_PATH}:/private_repos" \
    -e "NODE_ENV=${NODE_ENV}" \
    -e "MGITPATH=/usr/local/bin" \
    -e "APPOINTMENTS_DB_HOST=${CONTAINER_PREFIX}_appointments_mysql_1" \
    -p 3003:3003 \
    --restart unless-stopped \
    imyjimmy/mgit-repo-server:latest \
    # sh -c "cd admin && bun install && bun run build && cd .. && node server.js"
fi

if [ "$HAS_PROXY_TOR" = true ]; then
    echo "▶️ Starting other containers..."
    docker start ${CONTAINER_PREFIX}_app_proxy_1 2>/dev/null || echo "Proxy container not found"
    docker start ${CONTAINER_PREFIX}_tor_server_1 2>/dev/null || echo "Tor container not found"
    
    if [ $? -ne 0 ]; then
        echo "⚠️  Some containers failed to start - this is normal if they don't exist yet"
    fi
else
    echo "📝 Skipping Tor/Proxy startup (standalone environment)"
fi

# Exit if container start fails
if [ $? -ne 0 ]; then
    echo "❌ Failed to start main container! Exiting..."
    exit 1
fi

create_appointments_service_containers() {
    echo "🏗️ Creating Appointments Service containers..."
    
    # Set backup path based on environment
    if [[ "$OSTYPE" == "darwin"* ]]; then
        local backup_path="./mysql-backups"
    else
        local backup_path="/home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/mysql-backups"
    fi
    
    local latest_backup="${backup_path}/easyappointments_latest.sql"
    
    # Create appointments MySQL container (remove existing first)
    docker rm -f ${CONTAINER_PREFIX}_appointments_mysql_1 2>/dev/null || true
    
    # Check if we have a backup to restore
    if [ -f "$latest_backup" ]; then
        echo "📋 Found existing backup: $latest_backup"
        echo "🔄 Automatically restoring from backup..."
        
        # Start MySQL container
        docker run -d --name ${CONTAINER_PREFIX}_appointments_mysql_1 \
          $NETWORK_FLAG \
          -v "${APPOINTMENTS_DATA_PATH}/mysql:/var/lib/mysql" \
          -v "$(pwd)/../plebdoc-scheduler-service/init-scripts:/docker-entrypoint-initdb.d" \
          -e MYSQL_ROOT_PASSWORD=secret \
          -e MYSQL_DATABASE=easyappointments \
          -e MYSQL_USER=user \
          -e MYSQL_PASSWORD=password \
          $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 3306:3306"; fi) \
          mysql:8.0
        
        # Wait for MySQL to be ready
        echo "⏳ Waiting for MySQL to initialize..."
        if wait_for_mysql; then
            echo "📥 Restoring database from backup..."
            if docker exec -i ${CONTAINER_PREFIX}_appointments_mysql_1 mysql \
                -u user -ppassword easyappointments < "$latest_backup"; then
                echo "✅ Database restored successfully!"
            else
                echo "❌ Database restoration failed"
            fi
        fi
    else
        echo "ℹ️ No backup found, starting fresh MySQL container..."
        start_fresh_mysql
    fi

    # Create PHPMyAdmin container
    docker rm -f ${CONTAINER_PREFIX}_plebdoc_phpmyadmin_1 2>/dev/null || true
    docker run -d --name ${CONTAINER_PREFIX}_plebdoc_phpmyadmin_1 \
        $NETWORK_FLAG \
        -p 8089:80 \
        -e PMA_HOST=${CONTAINER_PREFIX}_appointments_mysql_1 \
        -e UPLOAD_LIMIT=102400K \
        -e PMA_USER=user \
        -e PMA_PASSWORD=password \
        phpmyadmin:5.2.1

    echo "⏳ Waiting for PHPMyAdmin to be ready..."
    sleep 5

    echo "✅ Appointments Service containers created!"
    echo "📊 PHPMyAdmin available at:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "   🍎 macOS: http://localhost:8089"
    else
        echo "   🐧 Umbrel: http://$(hostname -I | awk '{print $1}'):8089"
        echo "   🌐 External: http://your-umbrel-ip:8089"
    fi
    ## can access via ssh -L 8089:localhost:8089 imyjimmy@[...].org
}

# Wait for MySQL to be ready
wait_for_mysql() {
    for i in {1..60}; do
        if docker exec ${CONTAINER_PREFIX}_appointments_mysql_1 mysqladmin ping -h"localhost" -u"user" -p"password" --silent 2>/dev/null; then
            echo "✅ MySQL is ready!"
            return 0
        fi
        echo "Attempt $i/60: MySQL not ready yet, waiting 5 seconds..."
        sleep 5
    done
    echo "❌ MySQL failed to start within 5 minutes"
    return 1
}

start_fresh_mysql() {
    docker run -d --name ${CONTAINER_PREFIX}_appointments_mysql_1 \
      $NETWORK_FLAG \
      -v "${APPOINTMENTS_DATA_PATH}/mysql:/var/lib/mysql" \
      -v "$(pwd)/../plebdoc-scheduler-service/init-scripts:/docker-entrypoint-initdb.d" \
      -e MYSQL_ROOT_PASSWORD=secret \
      -e MYSQL_DATABASE=easyappointments \
      -e MYSQL_USER=user \
      -e MYSQL_PASSWORD=password \
      $(if [[ "$OSTYPE" == "darwin"* ]]; then echo "-p 3306:3306"; fi) \
      mysql:8.0

    # Wait for MySQL to be ready
    echo "⏳ Waiting for MySQL to initialize..."
    wait_for_mysql
}

# Only start additional containers on Umbrel
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "▶️ Starting other containers..."
    docker start ${CONTAINER_PREFIX}_app_proxy_1 2>/dev/null || echo "Proxy container not found"
    docker start ${CONTAINER_PREFIX}_tor_server_1 2>/dev/null || echo "Tor container not found"
fi

# Add EasyAppointments creation at the end
if [[ "${2:-}" != "no-appt" ]]; then
    create_appointments_service_containers
fi

echo "✅ Deployment complete!"

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ""
    echo "🌐 Appointments services available at:"
    echo "   - PHPMyAdmin: http://localhost:8081"
    echo "   - MySQL: localhost:3306"
else
    echo "🌐 Server available through Umbrel interface"
fi