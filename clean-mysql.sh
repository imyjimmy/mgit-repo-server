#!/bin/bash
echo "🗑️ Removing MySQL data for fresh installation..."
rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/mysql
mkdir -p /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/appointments/mysql
echo "✅ MySQL data cleared and directory recreated"