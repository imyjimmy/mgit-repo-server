FROM node:20-bullseye-slim

# Install system dependencies + Go + unzip for bun
RUN apt-get update && \
    apt-get install -y curl git ca-certificates wget build-essential python3 unzip && \
    rm -rf /var/lib/apt/lists/*

# Install Go
RUN wget -O go.tar.gz https://go.dev/dl/go1.20.5.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go.tar.gz && \
    rm go.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

# Install bun
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/ && \
    bun --version

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

# Copy specific files (NOT everything)
COPY *.js ./
COPY public/ ./public/

# Build admin React app
COPY admin/ ./admin/
WORKDIR /app/admin
RUN bun install && bun run build && ls -la dist/

# Return to main app directory
WORKDIR /app

# Final setup
RUN mkdir -p /private_repos && \
    chown -R node:node /app /private_repos

USER node
EXPOSE 3003

ENV REPOS_PATH=/private_repos
CMD ["npm", "start"]
