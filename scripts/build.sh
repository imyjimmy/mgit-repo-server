#!/bin/bash
# Build and push Docker images
# The build.sh script is focused on:
# Published images that get pushed to Docker Hub (mgit-repo-server, gateway)
# Shared services like the scheduler API
set -e

# Detect platform for builds
if [[ $(uname -m) == "arm64" || $(uname -m) == "aarch64" ]]; then
    PLATFORM="linux/arm64"
    echo "🔧 Detected ARM64 architecture"
else
    PLATFORM="linux/amd64"
    echo "🔧 Detected x86_64 architecture"
fi

echo "🔨 Building images for platform: $PLATFORM"

# Build main mgit-repo-server
echo "📦 Building mgit-repo-server..."
docker build --platform ${PLATFORM} --no-cache -t imyjimmy/mgit-repo-server:latest .

# Build gateway
echo "📦 Building gateway..."
(cd gateway && docker build --no-cache -t imyjimmy/mgit-gateway:latest .)

# Verify gateway template was copied correctly
echo "🔍 Verifying gateway template was copied..."
# Create temporary container without running entrypoint
TEMP_ID=$(docker create imyjimmy/mgit-gateway:latest)
# Copy file out of container
docker cp $TEMP_ID:/etc/nginx/nginx.conf.template /tmp/gateway-template-check.conf
# Remove temporary container
docker rm $TEMP_ID > /dev/null

# Check the file
ADMIN_COUNT=$(grep -c "admin_frontend" /tmp/gateway-template-check.conf || echo "0")
rm /tmp/gateway-template-check.conf

if [ "$ADMIN_COUNT" -eq "0" ]; then
    echo "❌ ERROR: Gateway template does not contain admin_frontend!"
    exit 1
else
    echo "✅ Gateway template verified ($ADMIN_COUNT references to admin_frontend)"
fi

# Build scheduler API
echo "📦 Building plebdoc-scheduler-api..."
docker build --no-cache -t plebdoc-scheduler-api ../plebdoc-scheduler-service/api

echo "📤 Pushing images to Docker Hub..."
docker push imyjimmy/mgit-repo-server:latest
docker push imyjimmy/mgit-gateway:latest

echo "✅ Build and push complete!"