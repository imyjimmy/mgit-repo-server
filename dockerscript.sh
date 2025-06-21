#!/bin/bash
docker build --no-cache -t imyjimmy/mgit-repo-server:latest .
docker push imyjimmy/mgit-repo-server:latest
docker stop mgitreposerver-mgit-repo-server_web_1
# docker rm mgitreposerver-mgit-repo-server_web_1
# docker rmi imyjimmy/mgit-repo-server:latest
docker stop mgitreposerver-mgit-repo-server_tor_server_1  
docker stop mgitreposerver-mgit-repo-server_app_proxy_1

# echo "🗑️  Removing test repositories..."
# rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/*

# Only remove repos if you want a clean slate
read -p "Remove existing repositories? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Removing existing repositories..."
    rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/*
else
    echo "📁 Preserving existing repositories..."
fi

docker pull imyjimmy/mgit-repo-server:latest
docker rm mgitreposerver-mgit-repo-server_web_1
docker run -d --name mgitreposerver-mgit-repo-server_web_1 \
  --network umbrel_main_network \
  -v /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos:/private_repos \
  imyjimmy/mgit-repo-server:latest
docker start mgitreposerver-mgit-repo-server_app_proxy_1
docker start mgitreposerver-mgit-repo-server_tor_server_1
