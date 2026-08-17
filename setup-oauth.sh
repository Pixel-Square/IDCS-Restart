#!/bin/bash
# Setup Google OAuth credentials for IDCS

set -e

CREDENTIAL_DIR="$HOME/.config/idcs"
CREDENTIAL_FILE="$CREDENTIAL_DIR/client_secret.json"

echo "Creating credential directory: $CREDENTIAL_DIR"
mkdir -p "$CREDENTIAL_DIR"

# Check if the file exists
if [ ! -f "$CREDENTIAL_FILE" ]; then
    echo ""
    echo "========================================"
    echo "ERROR: No credentials file found"
    echo "========================================"
    echo ""
    echo "Steps to fix:"
    echo "1. Go to https://console.cloud.google.com/"
    echo "2. Create/select your project"
    echo "3. Enable Google Sheets API and Google Drive API"
    echo "4. Go to APIs & Services → Credentials"
    echo "5. Create OAuth 2.0 Client ID (Desktop app)"
    echo "6. Add these redirect URIs:"
    echo "   - http://localhost:8000/api/academic-v2/google-sheets/oauth/callback/"
    echo "   - http://127.0.0.1:8000/api/academic-v2/google-sheets/oauth/callback/"
    echo "7. Download the JSON file"
    echo "8. Save it to: $CREDENTIAL_FILE"
    echo ""
    exit 1
fi

echo "✓ Credentials file found at: $CREDENTIAL_FILE"
echo ""
echo "You can now run:"
echo "  python3 backend/test_drive_oauth.py \\"
echo "    --client-secret $CREDENTIAL_FILE \\"
echo "    --folder YOUR_FOLDER_ID"
