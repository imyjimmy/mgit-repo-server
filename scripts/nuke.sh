#!/bin/bash
# Nuclear option: completely destroy and rebuild everything
set -e

# Detect environment and set container prefix
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Running on macOS (development)"
    CONTAINER_PREFIX="mgit-repo-server"
    BACKUP_PATH="./mysql-backups"
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.development.yml --env-file .env.development"
else
    echo "🐧 Running on Umbrel/Linux (production)"
    CONTAINER_PREFIX="mgitreposerver-mgit-repo-server"
    BACKUP_PATH="/home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/mysql-backups"
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.production.yml --env-file .env.production"
fi

echo "🎯 Targeting mgit and easyappointment containers only..."
echo "🔧 Using container prefix: ${CONTAINER_PREFIX}"

# # Function to backup MySQL data
# backup_mysql_data() {
#     local mysql_container="${CONTAINER_PREFIX}_plebdoc_mysql_1"
    
#     echo "🔍 Checking if MySQL container exists: ${mysql_container}"
#     if docker ps -a --format "table {{.Names}}" | grep -q "^${mysql_container}$"; then
#         echo "📦 Found MySQL container: ${mysql_container}"
        
#         # Create backup directory
#         mkdir -p "${BACKUP_PATH}"
        
#         # Generate timestamp for backup file
#         local timestamp=$(date +"%Y%m%d_%H%M%S")
#         local backup_file="${BACKUP_PATH}/easyappointments_backup_${timestamp}.sql"
        
#         echo "💾 Creating MySQL backup..."
#         if docker exec "${mysql_container}" mysqldump \
#             -u user -ppassword \
#             --single-transaction \
#             --routines \
#             --triggers \
#             easyappointments > "${backup_file}" 2>/dev/null; then
            
#             echo "✅ MySQL backup created: ${backup_file}"
            
#             # Also create a "latest" backup for easy reference
#             local latest_backup="${BACKUP_PATH}/easyappointments_latest.sql"
#             cp "${backup_file}" "${latest_backup}"
#             echo "📋 Latest backup updated: ${latest_backup}"
            
#             # Compress the timestamped backup to save space
#             gzip "${backup_file}"
#             echo "🗜️ Backup compressed: ${backup_file}.gz"
            
#         else
#             echo "⚠️ MySQL backup failed, but continuing with container removal..."
#             echo "   (Container might be stopped or database inaccessible)"
#         fi
#     else
#         echo "ℹ️ MySQL container not found, skipping backup"
#     fi
# }

# # Backup MySQL data before destroying containers
# backup_mysql_data

# Nuclear shutdown: stop and remove everything
echo "🛑 Nuclear shutdown: stopping all services..."
docker-compose $COMPOSE_FILES down -v --remove-orphans

# Remove mgit-related images (force fresh rebuild)
echo "🗑️ Removing mgit-related images..."
docker rmi imyjimmy/mgit-repo-server:latest 2>/dev/null || true
docker rmi imyjimmy/mgit-gateway:latest 2>/dev/null || true
docker rmi plebdoc-scheduler-api:latest 2>/dev/null || true
docker rmi mgit-repo-server-plebdoc-api 2>/dev/null || true

docker rmi mgit-repo-server_plebdoc-api:latest 2>/dev/null || true
docker rmi plebdoc-scheduler-service-api 2>/dev/null || true

docker rmi mgit-repo-server-patient-frontend 2>/dev/null || true
docker rmi mgit-repo-server-admin-frontend 2>/dev/null || true

# Clean up unused images
echo "🧹 Cleaning up unused images..."
docker image prune -f

# Remove app data (only on Umbrel)
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "🗑️ Removing app data..."
    sudo rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/mysql 2>/dev/null || true
fi

echo "✅ Nuclear cleanup complete!"
echo "📁 MySQL backups stored in: ${BACKUP_PATH}"
echo ""
echo "🚀 To rebuild and restart:"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "   npm run dev rebuild"
else
    echo "   npm run prod rebuild"
fi