#!/bin/bash

# Detect environment and set container prefix
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS development environment
    echo "🍎 Running on macOS (development)"
    CONTAINER_PREFIX="mgit-repo-server"
else
    # Umbrel/Linux environment
    echo "🐧 Running on Umbrel/Linux (production)"
    CONTAINER_PREFIX="mgitreposerver-mgit-repo-server"
fi

echo "🎯 Targeting mgit and easyappointment containers only..."
echo "🔧 Using container prefix: ${CONTAINER_PREFIX}"

# Stop and remove mgit repo server containers
echo "🛑 Stopping mgit repo server containers..."
docker stop ${CONTAINER_PREFIX}_web_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_tor_server_1 2>/dev/null || true  
docker stop ${CONTAINER_PREFIX}_app_proxy_1 2>/dev/null || true

echo "🗑️ Removing mgit repo server containers..."
docker rm ${CONTAINER_PREFIX}_web_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_tor_server_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_app_proxy_1 2>/dev/null || true

# Stop and remove easyappointment containers
echo "🛑 Stopping easyappointment containers..."
docker stop ${CONTAINER_PREFIX}_appointments_nginx_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_appointments_phpldapadmin_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_appointments_baikal_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_appointments_swagger_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_appointments_mailpit_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_appointments_phpmyadmin_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_appointments_php_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_appointments_openldap_1 2>/dev/null || true
docker stop ${CONTAINER_PREFIX}_appointments_mysql_1 2>/dev/null || true

echo "🗑️ Removing easyappointment containers..."
docker rm ${CONTAINER_PREFIX}_appointments_nginx_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_appointments_phpldapadmin_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_appointments_baikal_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_appointments_swagger_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_appointments_mailpit_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_appointments_phpmyadmin_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_appointments_php_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_appointments_openldap_1 2>/dev/null || true
docker rm ${CONTAINER_PREFIX}_appointments_mysql_1 2>/dev/null || true

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
    rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server 2>/dev/null || true
fi

echo "✅ Targeted cleanup complete! Other services left untouched."