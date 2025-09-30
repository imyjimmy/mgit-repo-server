# Multi-stage build for React app
FROM node:20-bullseye-slim as builder

# Install system dependencies including curl
RUN apt-get update && \
    apt-get install -y curl zip unzip ca-certificates git build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb* ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Clear esbuild cache and reinstall esbuild to fix version mismatch
RUN rm -rf node_modules/.vite && \
    rm -rf node_modules/esbuild && \
    bun install --force
    
# Build the app
RUN bun run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]