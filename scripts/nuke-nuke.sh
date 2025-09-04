# Stop everything, remove everything
docker stop $(docker ps -aq) 2>/dev/null || true && \
docker rm $(docker ps -aq) 2>/dev/null || true && \
docker rmi $(docker images -aq) --force 2>/dev/null || true && \
docker system prune -af --volumes