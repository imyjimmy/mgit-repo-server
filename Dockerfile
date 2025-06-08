FROM node:18-buster-slim

# Install system dependencies + Go
RUN apt-get update && \
    apt-get install -y curl git ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

# Install Go
RUN wget -O go.tar.gz https://go.dev/dl/go1.20.5.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go.tar.gz && \
    rm go.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

# Use existing node user (UID 1000) instead of creating new one
WORKDIR /app

# Copy and build mgit
COPY mgit/ /go/src/mgit/
RUN cd /go/src/mgit && \
    go build -buildvcs=false -o /usr/local/bin/mgit && \
    chmod +x /usr/local/bin/mgit

# Install Node dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app code
COPY . .
RUN mkdir -p /private_repos && \
    chown -R node:node /app /private_repos

USER node
EXPOSE 3003

ENV REPOS_PATH=/private_repos
CMD ["npm", "start"]