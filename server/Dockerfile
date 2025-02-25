# Stage 1: Build the mgit binary
FROM golang:1.20-alpine AS builder

# Install required dependencies for building
RUN apk add --no-cache git

# We'll add the source code later during run time
WORKDIR /go/src/mgit
# Create a placeholder script that will build mgit when the container starts
RUN echo '#!/bin/sh' > /build-mgit.sh && \
    echo 'cd /go/src/mgit && go build -o /usr/local/bin/mgit && chmod +x /usr/local/bin/mgit' >> /build-mgit.sh && \
    chmod +x /build-mgit.sh

# Stage 2: Create the application container
FROM node:18-alpine

RUN apk add --no-cache curl net-tools go git

WORKDIR /app

# Create the private_repos directory
RUN mkdir -p /private_repos

# Copy the build script
COPY --from=builder /build-mgit.sh /build-mgit.sh

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3002

# Set the REPOS_PATH environment variable to point to our created directory
ENV REPOS_PATH=/private_repos
ENV NODE_DEBUG=*
# Run the build script then start the app
CMD /build-mgit.sh && npm start