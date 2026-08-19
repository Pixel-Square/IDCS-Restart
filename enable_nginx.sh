#!/bin/bash
# Run this script with sudo to enable the new Nginx configurations and restart services

# Copy Nginx configs
sudo cp /home/iqac2/Desktop/idcs-mt/db5.krgi.co.in.conf /etc/nginx/sites-available/db5.krgi.co.in
sudo cp /home/iqac2/Desktop/idcs-mt/idcs5.krgi.co.in.conf /etc/nginx/sites-available/idcs5.krgi.co.in

# Enable the sites
sudo ln -sf /etc/nginx/sites-available/db5.krgi.co.in /etc/nginx/sites-enabled/db5.krgi.co.in
sudo ln -sf /etc/nginx/sites-available/idcs5.krgi.co.in /etc/nginx/sites-enabled/idcs5.krgi.co.in

# Test and reload Nginx
sudo nginx -t && sudo systemctl reload nginx

# Restart cloudflared to pick up the new ingress routes
sudo systemctl restart cloudflared
echo "Done! The production sites are now live."
