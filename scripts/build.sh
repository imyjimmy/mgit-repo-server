#!/bin/bash
# Build and push Docker images
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

# Build scheduler API
echo "📦 Building plebdoc-scheduler-api..."
docker build --no-cache -t plebdoc-scheduler-api ../plebdoc-scheduler-service/api

echo "📤 Pushing images to Docker Hub..."
docker push imyjimmy/mgit-repo-server:latest
docker push imyjimmy/mgit-gateway:latest

echo "✅ Build and push complete!"