#!/bin/bash
# Deploy to production (Umbrel)
set -e

echo "🐧 Deploying to production (Umbrel)..."

# Parse arguments
REMOVE_REPOS=${1:-Y}
SKIP_APPOINTMENTS=${2:-}

# Create required directories
sudo mkdir -p /opt/plebdoc-scheduler-service/{mysql,openldap/{certificates,slapd/{database,config}},mailpit,baikal/{config,data}}
sudo mkdir -p /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos

# Handle repository cleanup
if [[ $REMOVE_REPOS =~ ^[Nn]$ ]]; then
    echo "🗑️ Removing existing repositories..."
    sudo rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/*
else
    echo "📁 Preserving existing repositories..."
fi

# Check for backup and restore if available
BACKUP_PATH="/home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/mysql-backups/easyappointments_latest.sql"
RESTORE_FLAG=""
if [[ -f "$BACKUP_PATH" ]]; then
    echo "📋 Found backup: $BACKUP_PATH"
    echo "🔄 Will restore after MySQL starts..."
    RESTORE_FLAG="--restore"
fi

# Pull latest images
echo "📥 Pulling latest images..."
docker pull imyjimmy/mgit-repo-server:latest
docker pull imyjimmy/mgit-gateway:latest

# Stop existing services
echo "🛑 Stopping existing services..."
docker-compose -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production down

# Conditional startup based on arguments
if [[ "$SKIP_APPOINTMENTS" == "no-appt" ]]; then
    echo "⏭️ Skipping appointments services..."
    docker-compose -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d mgit-web gateway
else
    echo "🚀 Starting all production services..."
    docker-compose -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d
fi

# Restore backup if available
if [[ -n "$RESTORE_FLAG" && -f "$BACKUP_PATH" ]]; then
    echo "⏳ Waiting for MySQL to be ready..."
    sleep 15
    
    echo "📥 Restoring database from backup..."
    docker exec -i mgitreposerver-mgit-repo-server_plebdoc_mysql_1 mysql \
        -u user -ppassword easyappointments < "$BACKUP_PATH" || \
        echo "⚠️ Backup restore failed (this is OK if starting fresh)"
fi

echo "✅ Production deployment complete!"
echo ""
echo "🌐 Services available at:"
echo "   📝 Git Server: http://$(hostname -I | awk '{print $1}'):3003"
echo "   💾 PHPMyAdmin: http://$(hostname -I | awk '{print $1}'):8089"
echo "   🔧 Scheduler API: http://$(hostname -I | awk '{print $1}'):3005"
echo "   📖 Swagger UI: http://$(hostname -I | awk '{print $1}'):8090"