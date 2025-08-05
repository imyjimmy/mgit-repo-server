# EasyAppointments Integration Guide

This guide explains how to integrate EasyAppointments as a submodule into the mgit-repo-server project and deploy it on a subdomain.

## Overview

EasyAppointments will be deployed as a separate service stack alongside mgit-repo-server, accessible via `appointments.plebemr.com` while the main application remains at `plebemr.com`.

## Prerequisites

- Existing mgit-repo-server deployment
- Cloudflare tunnel configured
- Docker and docker-compose
- Access to Cloudflare DNS settings

## Step 1: Add EasyAppointments as a Git Submodule

```bash
# Navigate to your mgit-repo-server directory
cd /path/to/mgit-repo-server

# Add EasyAppointments as a submodule
git submodule add https://github.com/alextselegidis/easyappointments.git easyappointments

# Initialize and update the submodule
git submodule update --init --recursive

# Verify the submodule was added correctly
ls -la easyappointments/
ls -la easyappointments/docker/
```

## Step 2: Update Docker Compose Configuration

Add the EasyAppointments services to your main `docker-compose.yml` file:

```yaml
version: "3.7"

services:
  # Existing mgit-repo-server services...
  app_proxy:
    environment:
      BASE_URL: "https://plebemr.com"
      APP_HOST: mgitreposerver-mgit-repo-server_web_1
      APP_PORT: 3003
      
  web:
    # ... existing web service config

  # EasyAppointments Services
  appointments_php:
    build: ./easyappointments/docker/php-fpm
    working_dir: /var/www/html
    extra_hosts:
      - host.docker.internal:host-gateway
    volumes:
      - './easyappointments:/var/www/html'
      - './easyappointments/docker/php-fpm/php-ini-overrides.ini:/usr/local/etc/php/conf.d/99-overrides.ini'
    depends_on:
      - appointments_mysql

  appointments_nginx:
    image: 'nginx:1.23.3-alpine'
    working_dir: /var/www/html
    volumes:
      - './easyappointments:/var/www/html'
      - './easyappointments/docker/nginx/nginx.conf:/etc/nginx/conf.d/default.conf'
    depends_on:
      - appointments_php

  appointments_mysql:
    image: 'mysql:8.0'
    restart: unless-stopped
    volumes:
      - '${APP_DATA_DIR}/appointments/mysql:/var/lib/mysql'
    environment:
      - MYSQL_ROOT_PASSWORD=secret
      - MYSQL_DATABASE=easyappointments
      - MYSQL_USER=user
      - MYSQL_PASSWORD=password

  appointments_phpmyadmin:
    image: 'phpmyadmin:5.2.1'
    environment:
      - 'PMA_HOST=appointments_mysql'
      - 'UPLOAD_LIMIT=102400K'
    depends_on:
      - appointments_mysql

  appointments_mailpit:
    image: 'axllent/mailpit:v1.7'
    volumes:
      - '${APP_DATA_DIR}/appointments/mailpit:/data'

  # ... other appointment services as needed
```

## Step 3: Fix Nginx Configuration

The default EasyAppointments nginx config references the wrong PHP container name:

```bash
# Edit the nginx configuration
vim easyappointments/docker/nginx/nginx.conf

# Find this line:
# fastcgi_pass php-fpm:9000;

# Change it to:
# fastcgi_pass mgitreposerver-mgit-repo-server_appointments_php_1:9000;
```

## Step 4: Build Required Images

Build the PHP-FPM image from EasyAppointments:

```bash
# Build the custom PHP image
docker build -t easyappt-php:latest easyappointments/docker/php-fpm
```

## Step 5: Update Deployment Scripts

### Modify Main Deployment Script

Add EasyAppointments container management to your main `dockerscript.sh`:

**In the stopping section:**
```bash
# Stop EasyAppointments containers
docker stop mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
docker stop mgitreposerver-mgit-repo-server_appointments_php_1 || true
docker stop mgitreposerver-mgit-repo-server_appointments_mysql_1 || true
# ... other appointment containers
```

**In the removing section:**
```bash
# Remove EasyAppointments containers
docker rm mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
docker rm mgitreposerver-mgit-repo-server_appointments_php_1 || true
docker rm mgitreposerver-mgit-repo-server_appointments_mysql_1 || true
# ... other appointment containers
```

**Add container creation after mgit container creation:**
```bash
echo "🏗️ Creating EasyAppointments containers..."

# Create MySQL container
docker run -d --name mgitreposerver-mgit-repo-server_appointments_mysql_1 \
  --network umbrel_main_network \
  -v ${APP_DATA_DIR}/appointments/mysql:/var/lib/mysql \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=easyappointments \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=password \
  mysql:8.0

# Wait for MySQL to initialize
echo "⏳ Waiting for MySQL to initialize..."
sleep 10

# Create PHP-FPM container
docker run -d --name mgitreposerver-mgit-repo-server_appointments_php_1 \
  --network umbrel_main_network \
  --add-host host.docker.internal:host-gateway \
  -v /path/to/mgit-repo-server/easyappointments:/var/www/html \
  -v /path/to/mgit-repo-server/easyappointments/docker/php-fpm/php-ini-overrides.ini:/usr/local/etc/php/conf.d/99-overrides.ini \
  --workdir /var/www/html \
  easyappt-php:latest

# Create Nginx container
docker run -d --name mgitreposerver-mgit-repo-server_appointments_nginx_1 \
  --network umbrel_main_network \
  -v /path/to/mgit-repo-server/easyappointments:/var/www/html \
  -v /path/to/mgit-repo-server/easyappointments/docker/nginx/nginx.conf:/etc/nginx/conf.d/default.conf \
  --workdir /var/www/html \
  nginx:1.23.3-alpine

# Create other supporting containers as needed...

echo "✅ EasyAppointments containers created!"
```

### Create Dedicated EasyAppointments Management Script

Create `dockerscript-easyappt.sh` for managing just the appointments containers:

```bash
#!/bin/bash
set -e

ACTION=${1:-restart}
REMOVE_DATA=${2:-Y}

echo "🏥 EasyAppointments Docker Management Script"

case $ACTION in
  "start")
    echo "🚀 Starting EasyAppointments containers..."
    docker start mgitreposerver-mgit-repo-server_appointments_mysql_1 || true
    docker start mgitreposerver-mgit-repo-server_appointments_php_1 || true
    docker start mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
    # ... other containers
    ;;

  "stop")
    echo "🛑 Stopping EasyAppointments containers..."
    docker stop mgitreposerver-mgit-repo-server_appointments_nginx_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_php_1 || true
    docker stop mgitreposerver-mgit-repo-server_appointments_mysql_1 || true
    # ... other containers
    ;;

  "status")
    echo "📊 EasyAppointments Container Status:"
    docker ps -a --filter "name=mgitreposerver-mgit-repo-server_appointments" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    ;;

  *)
    echo "Usage: $0 [start|stop|restart|status]"
    exit 1
    ;;
esac
```

## Step 6: Configure Cloudflare DNS and Tunnel

### Add DNS Record

In your Cloudflare dashboard:

1. Go to **DNS** section for `plebemr.com`
2. Add a new **A record**:
   - **Name:** `appointments`
   - **Content:** Your server's IP address (same as main domain)
   - **Proxy status:** Proxied (orange cloud)

### Update Cloudflare Tunnel

Add a new public hostname to your existing tunnel:

1. Go to **Zero Trust → Access → Tunnels**
2. Edit your existing tunnel (`d224c22a-1447-4885-b8f4-3b7151470d3b`)
3. Add new public hostname:
   - **Subdomain:** `appointments`
   - **Domain:** `plebemr.com`
   - **Service:** `http://mgitreposerver-mgit-repo-server_appointments_nginx_1:80`

## Step 7: Configure EasyAppointments

### Create Configuration File

```bash
# Copy sample configuration
cp easyappointments/config-sample.php easyappointments/config.php

# Edit the configuration
vim easyappointments/config.php
```

Update the database settings in `config.php`:

```php
$config['hostname'] = 'mgitreposerver-mgit-repo-server_appointments_mysql_1';
$config['username'] = 'user';
$config['password'] = 'password';
$config['database'] = 'easyappointments';
```

### Complete Installation

1. Navigate to `https://appointments.plebemr.com`
2. Follow the EasyAppointments installation wizard
3. Create your admin account
4. Configure your appointment settings

## Deployment Commands

```bash
# Build PHP image (run once or when EasyAppointments updates)
docker build -t easyappt-php:latest easyappointments/docker/php-fpm

# Deploy everything (creates all containers)
./dockerscript.sh

# Manage just EasyAppointments containers
./dockerscript-easyappt.sh start   # Start appointments
./dockerscript-easyappt.sh stop    # Stop appointments
./dockerscript-easyappt.sh status  # Check status
```

## Troubleshooting

### 502 Bad Gateway
- Check if nginx container is running: `docker ps | grep appointments_nginx`
- Check nginx logs: `docker logs mgitreposerver-mgit-repo-server_appointments_nginx_1`
- Verify nginx config points to correct PHP container name

### Database Connection Errors
- Ensure MySQL container is running: `docker ps | grep appointments_mysql`
- Check MySQL logs: `docker logs mgitreposerver-mgit-repo-server_appointments_mysql_1`
- Verify config.php has correct database settings

### Container Creation Failures
- Check volume mount paths exist
- Verify Docker network exists: `docker network ls | grep umbrel_main_network`
- Ensure all required images are built/pulled

## File Structure

After completing setup, your project structure should look like:

```
mgit-repo-server/
├── docker-compose.yml           # Updated with appointments services
├── dockerscript.sh             # Updated with appointments containers
├── dockerscript-easyappt.sh    # Appointments management script
├── easyappointments/           # Git submodule
│   ├── config.php              # Created from config-sample.php
│   ├── docker/
│   │   ├── nginx/
│   │   │   └── nginx.conf      # Modified for correct PHP container name
│   │   └── php-fpm/
│   └── ... (rest of EasyAppointments files)
└── ... (rest of mgit-repo-server files)
```