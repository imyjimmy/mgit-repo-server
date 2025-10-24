FROM node:20-bullseye-slim AS base

# Install system dependencies
RUN apt-get update && \
    apt-get install -y curl git ca-certificates wget build-essential python3 unzip && \
    rm -rf /var/lib/apt/lists/*

# Platform-specific Go installation
FROM base AS go-installer
ARG TARGETPLATFORM
RUN case "$TARGETPLATFORM" in \
    "linux/amd64") GO_ARCH="amd64" ;; \
    "linux/arm64") GO_ARCH="arm64" ;; \
    *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
    esac && \
    wget -O go.tar.gz "https://go.dev/dl/go1.20.5.linux-${GO_ARCH}.tar.gz" && \
    tar -C /usr/local -xzf go.tar.gz && \
    rm go.tar.gz

FROM go-installer AS builder
ENV PATH="/usr/local/go/bin:${PATH}"

# Install bun
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/

# Copy and build mgit with proper architecture
COPY mgit/ /go/src/mgit/
ARG TARGETPLATFORM
RUN cd /go/src/mgit && \
    case "$TARGETPLATFORM" in \
    "linux/amd64") export GOARCH=amd64 ;; \
    "linux/arm64") export GOARCH=arm64 ;; \
    esac && \
    go build -buildvcs=false -o /usr/local/bin/mgit && \
    chmod +x /usr/local/bin/mgit

# Final stage
FROM base
COPY --from=builder /usr/local/bin/mgit /usr/local/bin/mgit
COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun

# Create directories with proper ownership BEFORE copying files
RUN mkdir -p /app /private_repos && \
    chown -R node:node /app /private_repos

# Switch to node user BEFORE doing heavy operations
USER node
WORKDIR /app

# Install Node dependencies (now as node user)
COPY --chown=node:node package*.json ./
RUN npm ci --only=production

# Copy application files (now as node user)
COPY --chown=node:node *.js ./
COPY --chown=node:node public/ ./public/
COPY --chown=node:node admin/ ./admin/
COPY --chown=node:node .env ./

# Build admin React app (now as node user)
WORKDIR /app/admin
RUN bun install && bun run build

WORKDIR /app
EXPOSE 3003
ENV REPOS_PATH=/private_repos
CMD ["npm", "start"]