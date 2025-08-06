#!/bin/bash
# Stop ALL containers
docker stop $(docker ps -q) 2>/dev/null || true

# Remove ALL containers
docker container prune -f

# Remove ALL images (including cached layers)
docker image prune -a -f

# Remove ALL volumes
docker volume prune -f

# Remove ALL networks (except default)
docker network prune -f

# Remove ALL build cache
docker builder prune -a -f

# Remove ALL unused data (most aggressive)
docker system prune -a --volumes -f

rm -rf ../app-data