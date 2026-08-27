# Automated Deployment Rule

**CRITICAL RULE:** Do NOT manually execute `npm run build` inside the `frontend` directory, nor `sudo systemctl restart gunicorn` inside the `backend` directory.

These commands are now handled exclusively and automatically by the Antigravity post-task automation hook (`post_task_deploy.sh`).

The agent should continue working normally on code changes without wasting model tokens repeatedly deciding whether to run these commands. 

If the user explicitly asks for a manual build or restart, kindly remind them that it is handled automatically after the task completes, and do NOT run the commands.
