#!/bin/bash
# post_task_deploy.sh
# Automated post-task deployment sequence
# Triggered automatically via Antigravity hooks. DO NOT RUN RECURSIVELY.

# Prevent recursive loop by checking if we are already in the hook
if [ "$ANTIGRAVITY_HOOK_ACTIVE" = "1" ]; then
    echo "Hook already running. Skipping to prevent loop."
    exit 0
fi
export ANTIGRAVITY_HOOK_ACTIVE=1

echo "Starting automated post-task deployment sequence..."

cd /home/iqac/IDCS-Restart/frontend || { echo "Failed to cd to frontend"; exit 1; }

echo "Building frontend..."
if npm run build; then
    echo "Frontend build succeeded."
    
    cd /home/iqac/IDCS-Restart/backend || { echo "Failed to cd to backend"; exit 1; }
    
    echo "Restarting backend gunicorn..."
    if sudo systemctl restart gunicorn; then
        echo "Backend restarted successfully. Automation complete."
    else
        echo "ERROR: Backend restart failed."
        exit 1
    fi
else
    echo "ERROR: Frontend build failed. Stopping automated sequence. Backend will not be restarted."
    exit 1
fi
