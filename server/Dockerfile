# Stage 1: Build the mgit binary
FROM golang:1.20-alpine AS builder

# Install required dependencies for building
RUN apk add --no-cache git

# We'll need to copy the mgit source code into the container
WORKDIR /go/src/mgit
# Since this is outside the immediate Docker context, we'll handle this in the docker-compose

# Build the mgit binary once the source is mounted
RUN if [ -d "/go/src/mgit" ]; then \
        cd /go/src/mgit && \
        go build -o /go/bin/mgit; \
    else \
        echo "Error: mgit source directory not found"; \
        exit 1; \
    fi

# Stage 2: Create the application container
FROM node:18-alpine

RUN apk add --no-cache curl net-tools

WORKDIR /app

# Create the private_repos directory
RUN mkdir -p /private_repos

# Copy the mgit binary from the builder stage
COPY --from=builder /go/bin/mgit /usr/local/bin/
RUN chmod +x /usr/local/bin/mgit

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3002

# Set the REPOS_PATH environment variable to point to our created directory
ENV REPOS_PATH=/private_repos
ENV NODE_DEBUG=*
CMD ["npm", "start"]