#!/bin/bash

# Detect environment and set container prefix
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS development environment
    echo "🍎 Running on macOS (development)"
    CONTAINER_PREFIX="mgit-repo-server"
    BACKUP_PATH="./mysql-backups"
else
    # Umbrel/Linux environment
    echo "🐧 Running on Umbrel/Linux (production)"
    CONTAINER_PREFIX="mgitreposerver-mgit-repo-server"
    BACKUP_PATH="/home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/mysql-backups"
fi

echo "🎯 Targeting mgit and easyappointment containers only..."
echo "🔧 Using container prefix: ${CONTAINER_PREFIX}"

# Function to backup MySQL data
backup_mysql_data() {
    local mysql_container="${CONTAINER_PREFIX}_plebdoc_mysql_1"
    
    echo "🔍 Checking if MySQL container exists..."
    if docker ps -a --format "table {{.Names}}" | grep -q "^${mysql_container}$"; then
        echo "📦 Found MySQL container: ${mysql_container}"
        
        # Create backup directory
        mkdir -p "${BACKUP_PATH}"
        
        # Generate timestamp for backup file
        local timestamp=$(date +"%Y%m%d_%H%M%S")
        local backup_file="${BACKUP_PATH}/easyappointments_backup_${timestamp}.sql"
        
        echo "💾 Creating MySQL backup..."
        if docker exec "${mysql_container}" mysqldump \
            -u user -ppassword \
            --single-transaction \
            --routines \
            --triggers \
            easyappointments > "${backup_file}" 2>/dev/null; then
            
            echo "✅ MySQL backup created: ${backup_file}"
            
            # Also create a "latest" backup for easy reference
            local latest_backup="${BACKUP_PATH}/easyappointments_latest.sql"
            cp "${backup_file}" "${latest_backup}"
            echo "📋 Latest backup updated: ${latest_backup}"
            
            # Compress the timestamped backup to save space
            gzip "${backup_file}"
            echo "🗜️ Backup compressed: ${backup_file}.gz"
            
        else
            echo "⚠️ MySQL backup failed, but continuing with container removal..."
            echo "   (Container might be stopped or database inaccessible)"
        fi
    else
        echo "ℹ️ MySQL container not found, skipping backup"
    fi
}

# Backup MySQL data before destroying containers
backup_mysql_data

# Stop and remove mgit repo server containers
echo "🛑 Stopping mgit repo server containers..."
docker stop ${CONTAINER_PREFIX}_web_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_tor_server_1 2>/dev/null || true  
docker stop ${CONTAINER_PREFIX}_app_proxy_1 2>/dev/null || true

echo "🗑️ Removing mgit repo server containers..."
docker rm ${CONTAINER_PREFIX}_web_1 2>/dev/null || true
# docker rm ${CONTAINER_PREFIX}_tor_server_1 2>/dev/null || true
# docker rm ${CONTAINER_PREFIX}_app_proxy_1 2>/dev/null || true

# Stop and remove easyappointment containers
echo "🛑 Stopping easyappointment containers..."
docker stop ${CONTAINER_PREFIX}_plebdoc_api_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_plebdoc_phpmyadmin_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_plebdoc_mysql_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_plebdoc_swagger_1 2>/dev/null || true

echo "🗑️ Removing easyappointment containers..."
docker rm ${CONTAINER_PREFIX}_plebdoc_api_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_plebdoc_phpmyadmin_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_plebdoc_mysql_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_plebdoc_swagger_1 2>/dev/null || true

# remove the gateway!
docker stop ${CONTAINER_PREFIX}_gateway_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_gateway_1 2>/dev/null || true

# Remove only mgit-related images
echo "🗑️ Removing mgit-related images..."
docker rmi imyjimmy/mgit-repo-server:latest 2>/dev/null || true
docker rmi easyappt-php:latest 2>/dev/null || true

# Remove only unused images (safer than -a flag)
echo "🧹 Cleaning up unused images..."
docker image prune -f

# Remove mgit-specific app data (only on Umbrel)
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "🗑️ Removing mgit app data..."
    rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/mysql 2>/dev/null || true
    # rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos 2>/dev/null || true
fi

echo "✅ Targeted cleanup complete! Other services left untouched."
echo "📁 MySQL backups stored in: ${BACKUP_PATH}"