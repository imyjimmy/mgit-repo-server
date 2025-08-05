#!/bin/bash
set -e # exit on ANY command failure

# Get command line arguments
ACTION=${1:-restart}  # Default action is restart
REMOVE_DATA=${2:-Y}   # Default to preserve data

echo "🏥 EasyAppointments Docker Management Script"
echo "Action: $ACTION"

case $ACTION in
  "stop")
    echo "🛑 Stopping EasyAppointments containers..."
    docker stop mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_php_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_phpmyadmin_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_mailpit_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_swagger_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_baikal_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_phpldapadmin_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_openldap_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_mysql_1 || true
    echo "✅ EasyAppointments containers stopped!"
    ;;

  "start")
    echo "🚀 Starting EasyAppointments containers..."
    docker-compose up -d appointments_mysql appointments_openldap appointments_php appointments_nginx appointments_phpmyadmin appointments_mailpit appointments_swagger appointments_baikal appointments_phpldapadmin
    echo "✅ EasyAppointments containers started!"
    ;;

  "restart")
    echo "🔄 Restarting EasyAppointments containers..."
    
    # Stop containers
    echo "🛑 Stopping containers..."
    docker stop mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_php_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_phpmyadmin_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_mailpit_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_swagger_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_baikal_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_phpldapadmin_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_openldap_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_mysql_1 || true

    # Remove containers
    echo "🗑️ Removing containers..."
    docker rm mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_php_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_phpmyadmin_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_mailpit_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_swagger_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_baikal_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_phpldapadmin_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_openldap_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_mysql_1 || true

    # Check if user wants to remove data
    if [[ $REMOVE_DATA =~ ^[Nn]$ ]]; then
        echo "🗑️  Removing EasyAppointments data..."
        rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/* || true
        echo "✅ EasyAppointments data removed"
    else
        echo "📁 Preserving EasyAppointments data..."
    fi

    # Start containers
    echo "🚀 Starting containers..."
    docker-compose up -d appointments_mysql appointments_openldap appointments_php appointments_nginx appointments_phpmyadmin appointments_mailpit appointments_swagger appointments_baikal appointments_phpldapadmin
    echo "✅ EasyAppointments restart complete!"
    ;;

  "clean")
    echo "🧹 Cleaning EasyAppointments setup..."
    
    # Stop and remove containers
    docker stop mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_php_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_phpmyadmin_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_mailpit_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_swagger_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_baikal_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_phpldapadmin_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_openldap_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_mysql_1 || true

    docker rm mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_php_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_phpmyadmin_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_mailpit_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_swagger_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_baikal_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_phpldapadmin_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_openldap_1 || true
    docker rm mgitreposerver-mgit-repo-server_appointments_mysql_1 || true

    # Remove all data
    echo "🗑️ Removing all EasyAppointments data..."
    rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/* || true
    
    # Remove unused images (optional)
    echo "🧹 Cleaning up unused Docker images..."
    docker image prune -f
    
    echo "✅ EasyAppointments cleanup complete!"
    ;;

  "status")
    echo "📊 EasyAppointments Container Status:"
    echo "=================================="
    docker ps -a --filter "name=mgitreposerver-mgit-repo-server_appointments" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    ;;

  "logs")
    SERVICE=${3:-nginx}  # Default to nginx logs
    echo "📋 Showing logs for appointments_$SERVICE..."
    docker logs -f mgitreposerver-mgit-repo-server_appointments_${SERVICE}_1
    ;;

  *)
    echo "❌ Unknown action: $ACTION"
    echo ""
    echo "Usage: $0 [ACTION] [REMOVE_DATA]"
    echo ""
    echo "ACTIONS:"
    echo "  start     - Start EasyAppointments containers"
    echo "  stop      - Stop EasyAppointments containers"
    echo "  restart   - Stop, remove, and restart containers (default)"
    echo "  clean     - Stop, remove containers and all data"
    echo "  status    - Show container status"
    echo "  logs      - Show logs for a service"
    echo ""
    echo "REMOVE_DATA:"
    echo "  Y         - Preserve data (default)"
    echo "  N         - Remove data during restart/clean"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 restart N    # Restart and remove data"
    echo "  $0 logs mysql   # Show MySQL logs"
    echo "  $0 status"
    exit 1
    ;;
esac
