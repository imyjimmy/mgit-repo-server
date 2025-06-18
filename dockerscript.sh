#!/bin/bash
echo "🔨 Building and deploying MGit repo server..."

# Build and push new image
echo "📦 Building Docker image..."
docker build --no-cache -t imyjimmy/mgit-repo-server:latest .

echo "📤 Pushing to Docker Hub..."
docker push imyjimmy/mgit-repo-server:latest

# Stop all containers
echo "⏹️  Stopping containers..."
docker stop mgitreposerver-mgit-repo-server_web_1
docker stop mgitreposerver-mgit-repo-server_tor_server_1  
docker stop mgitreposerver-mgit-repo-server_app_proxy_1

# Clean up old container and test repos
# echo "🧹 Cleaning up..."
# docker rm mgitreposerver-mgit-repo-server_web_1
# docker rmi imyjimmy/mgit-repo-server:latest

# Clean up test repositories
echo "🗑️  Removing test repositories..."
rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/test-*
rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/hello-world
rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/*-test
echo "✅ Test repositories cleaned"

# Pull latest image
echo "📥 Pulling latest image..."
docker pull imyjimmy/mgit-repo-server:latest

# Start new container with environment variable
echo "🚀 Starting new container..."
docker run -d --name mgitreposerver-mgit-repo-server_web_1 \
  --network umbrel_main_network \
  -e MGIT_SERVER_URL="https://plebemr.com" \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos:/private_repos \
  imyjimmy/mgit-repo-server:latest

# Start other containers
echo "▶️  Starting other containers..."
docker start mgitreposerver-mgit-repo-server_app_proxy_1
docker start mgitreposerver-mgit-repo-server_tor_server_1

echo "✅ Deployment complete! Server should be available at https://plebemr.com"

# Optional: Show container status
echo "📊 Container status:"
docker ps | grep mgitreposerver