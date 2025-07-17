#!/bin/bash

# Get command line argument, default to "Y" (preserve) if not provided
REMOVE_REPOS=${1:-Y}

echo "🔨 Building new image..."
docker build --no-cache -t imyjimmy/mgit-repo-server:latest .

echo "📤 Pushing to Docker Hub..."
docker push imyjimmy/mgit-repo-server:latest

echo "🛑 Stopping containers..."
docker stop mgitreposerver-mgit-repo-server_web_1
docker stop mgitreposerver-mgit-repo-server_tor_server_1  
docker stop mgitreposerver-mgit-repo-server_app_proxy_1

echo "🗑️ Removing old container and image..."
docker rm mgitreposerver-mgit-repo-server_web_1
docker rmi imyjimmy/mgit-repo-server:latest

# Check if user wants to remove repositories
if [[ $REMOVE_REPOS =~ ^[Nn]$ ]]; then
    echo "🗑️  Removing existing repositories..."
    rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/*
else
    echo "📁 Preserving existing repositories..."
fi

echo "📥 Pulling fresh image from Docker Hub..."
docker pull imyjimmy/mgit-repo-server:latest

echo "🚀 Starting new container..."
docker run -d --name mgitreposerver-mgit-repo-server_web_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos:/private_repos \
  imyjimmy/mgit-repo-server:latest

echo "▶️ Starting other containers..."
docker start mgitreposerver-mgit-repo-server_app_proxy_1
docker start mgitreposerver-mgit-repo-server_tor_server_1

echo "✅ Deployment complete!"