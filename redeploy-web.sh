
#!/bin/bash

docker stop mgitreposerver-mgit-repo-server_web_1
docker rm mgitreposerver-mgit-repo-server_web_1
docker run -d --name mgitreposerver-mgit-repo-server_web_1 \
    --network umbrel_main_network \
    -v "/home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos:/private_repos" \
    -v "$(pwd)/server.js:/app/server.js" \
    -v "$(pwd)/provider-endpoints.js:/app/provider-endpoints.js" \
    -v "$(pwd)/admin-routes.js:/app/admin-routes.js" \
    -v "$(pwd)/auth-persistence.js:/app/auth-persistence.js" \
    -v "$(pwd)/utils.js:/app/utils.js" \
    -v "$(pwd)/package.json:/app/package.json" \
    -v "$(pwd)/.env:/app/.env" \
    -e "NODE_ENV=production" \
    -e "MGITPATH=/usr/local/bin" \
    -p 3003:3003 \
    --restart unless-stopped \
    imyjimmy/mgit-repo-server:latest \
