#!/bin/bash

echo "🔨 Building and deploying MGit repo server..."

# Build and push new image
echo "📦 Building Docker image..."
docker build --no-cache -t imyjimmy/mgit-repo-server:latest .

echo "📤 Pushing to Docker Hub..."
docker push imyjimmy/mgit-repo-server:latest

# Stop containers (exactly like working version)
echo "⏹️  Stopping containers..."
docker stop mgitreposerver-mgit-repo-server_web_1
docker stop mgitreposerver-mgit-repo-server_tor_server_1  
docker stop mgitreposerver-mgit-repo-server_app_proxy_1

# Clean up test repositories BEFORE pulling new image
echo "🗑️  Removing test repositories..."
rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/test-* 2>/dev/null || true
rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/hello-world 2>/dev/null || true
rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/*-test 2>/dev/null || true
echo "✅ Test repositories cleaned"

# Pull and start (exactly like working version)
echo "📥 Pulling latest image..."
docker pull imyjimmy/mgit-repo-server:latest

echo "🧹 Removing old container..."
docker rm mgitreposerver-mgit-repo-server_web_1

echo "🚀 Starting new container..."
docker run -d --name mgitreposerver-mgit-repo-server_web_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos:/private_repos \
  imyjimmy/mgit-repo-server:latest

echo "▶️  Starting other containers..."
docker start mgitreposerver-mgit-repo-server_app_proxy_1
docker start mgitreposerver-mgit-repo-server_tor_server_1

echo "✅ Deployment complete!"
