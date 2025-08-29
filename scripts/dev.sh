#!/bin/bash
# Start development environment
set -e

echo "🍎 Starting development environment..."

# Parse arguments
REBUILD=${1:-N}  # Default: don't rebuild
RESTORE_BACKUP=${2:-Y}  # Default: restore backup if available

# Create network if it doesn't exist
docker network create $NETWORK 2>/dev/null || true

# Create required directories
mkdir -p "$(pwd)/../private_repos"
mkdir -p "$(pwd)/../app-data"/{mysql,openldap/{certificates,slapd/{database,config}},mailpit,baikal/{config,data}}

# Stop any running services first
echo "🛑 Stopping existing services..."
docker-compose -f docker-compose.yml -f docker-compose.development.yml --env-file .env.development down

# Rebuild images if requested
if [[ $REBUILD =~ ^[Yy]$ ]]; then
    echo "🔨 Rebuilding images..."
    
    # Remove existing images to force rebuild
    docker rmi imyjimmy/mgit-repo-server:latest 2>/dev/null || true
    docker rmi imyjimmy/mgit-gateway:latest 2>/dev/null || true
    docker rmi plebdoc-scheduler-api:latest 2>/dev/null || true
    
    # Build fresh images
    ./scripts/build.sh
fi

# Check for backup and restore if available
BACKUP_PATH="./mysql-backups/easyappointments_latest.sql"
RESTORE_FLAG=""
if [[ -f "$BACKUP_PATH" && $RESTORE_BACKUP =~ ^[Yy]$ ]]; then
    echo "📋 Found backup: $BACKUP_PATH"
    echo "🔄 Will restore after MySQL starts..."
    RESTORE_FLAG="--restore"
fi

# Start services
echo "🚀 Starting development services..."
docker-compose -f docker-compose.yml -f docker-compose.development.yml --env-file .env.development up -d

# Restore backup if available
if [[ -n "$RESTORE_FLAG" && -f "$BACKUP_PATH" ]]; then
    echo "⏳ Waiting for MySQL to be ready..."
    sleep 10
    
    echo "📥 Restoring database from backup..."
    docker exec -i ${CONTAINER_PREFIX}_plebdoc_mysql_1 mysql \
        -u user -ppassword easyappointments < "$BACKUP_PATH" || \
        echo "⚠️ Backup restore failed (this is OK if starting fresh)"
fi

echo "✅ Development environment started!"
echo ""
echo "🌐 Services available at:"
echo "   📝 Git Server: http://localhost:3003"
echo "   💾 PHPMyAdmin: http://localhost:8089"
echo "   📊 MySQL: localhost:3306"
echo "   🔧 Scheduler API: http://localhost:3005"
echo "   📖 Swagger UI: http://localhost:8090"