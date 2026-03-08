#!/usr/bin/env bash
# Start n8n with IDCS configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; source "$SCRIPT_DIR/.n8n.env"; set +a
echo "Starting n8n on http://localhost:${N8N_PORT:-5678} …"
n8n start
