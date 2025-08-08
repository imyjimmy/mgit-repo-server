#!/bin/bash

echo "🎯 Targeting mgit and easyappointment containers only..."

# Stop and remove mgit repo server containers
echo "🛑 Stopping mgit repo server containers..."
docker stop mgitreposerver-mgit-repo-server_web_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_tor_server_1 2>/dev/null || true  
docker stop mgitreposerver-mgit-repo-server_app_proxy_1 2>/dev/null || true

echo "🗑️ Removing mgit repo server containers..."
docker rm mgitreposerver-mgit-repo-server_web_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_tor_server_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_app_proxy_1 2>/dev/null || true

# Stop and remove easyappointment containers
echo "🛑 Stopping easyappointment containers..."
docker stop mgitreposerver-mgit-repo-server_appointments_nginx_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_appointments_phpldapadmin_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_appointments_baikal_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_appointments_swagger_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_appointments_mailpit_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_appointments_phpmyadmin_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_appointments_php_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_appointments_openldap_1 2>/dev/null || true
docker stop mgitreposerver-mgit-repo-server_appointments_mysql_1 2>/dev/null || true

echo "🗑️ Removing easyappointment containers..."
docker rm mgitreposerver-mgit-repo-server_appointments_nginx_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_appointments_phpldapadmin_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_appointments_baikal_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_appointments_swagger_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_appointments_mailpit_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_appointments_phpmyadmin_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_appointments_php_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_appointments_openldap_1 2>/dev/null || true
docker rm mgitreposerver-mgit-repo-server_appointments_mysql_1 2>/dev/null || true

# Remove only mgit-related images
echo "🗑️ Removing mgit-related images..."
docker rmi imyjimmy/mgit-repo-server:latest 2>/dev/null || true
docker rmi easyappt-php:latest 2>/dev/null || true

# Remove only unused images (safer than -a flag)
echo "🧹 Cleaning up unused images..."
docker image prune -f

# Remove mgit-specific app data
# echo "🗑️ Removing mgit app data..."
# rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server 2>/dev/null || true

echo "✅ Targeted cleanup complete! Other services left untouched."
