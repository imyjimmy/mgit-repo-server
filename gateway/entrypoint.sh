#!/bin/sh
envsubst '${CONTAINER_PREFIX}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
exec nginx -g 'daemon off;'