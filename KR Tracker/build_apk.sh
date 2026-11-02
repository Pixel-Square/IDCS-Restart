#!/bin/bash
# =======================================================
# KR Track - One-Click APK Build & Download Script
# =======================================================
set -e

# 1. Resolve Project Directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export JAVA_HOME="/home/iqac/jdk-17"
export ANDROID_HOME="/home/iqac/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:/home/iqac/flutter/bin:$PATH"

echo "=========================================="
echo " Preparing KR Track Release APK & Download Server..."
echo "=========================================="

APK_DIR="$SCRIPT_DIR/build/app/outputs/flutter-apk"
mkdir -p "$APK_DIR"
mkdir -p "$SCRIPT_DIR/web"

# 2. Check for existing release APK or build if flutter available
if command -v flutter >/dev/null 2>&1; then
    echo "Flutter SDK detected in PATH. Building fresh release APK..."
    flutter build apk --release
fi

if [ -f "$APK_DIR/app-release.apk" ]; then
    cp -f "$APK_DIR/app-release.apk" "$APK_DIR/KR_Track.apk"
    cp -f "$APK_DIR/app-release.apk" "$SCRIPT_DIR/web/KR_Track.apk"
    cp -f "$APK_DIR/app-release.apk" "$SCRIPT_DIR/web/kr_track.apk"
fi

# Also copy to frontend public and backend media for multi-route downloading
mkdir -p /home/iqac/IDCS-MAIN/frontend/public
mkdir -p /home/iqac/IDCS-MAIN/backend/media
if [ -f "$APK_DIR/KR_Track.apk" ]; then
    cp -f "$APK_DIR/KR_Track.apk" /home/iqac/IDCS-MAIN/frontend/public/KR_Track.apk
    cp -f "$APK_DIR/KR_Track.apk" /home/iqac/IDCS-MAIN/backend/media/KR_Track.apk
fi

# 3. Check if HTTP Download Server on 8088 is running; if not, launch it
if ! lsof -i:8088 > /dev/null 2>&1; then
    echo "Starting download server on port 8088..."
    nohup python3 -m http.server 8088 --directory "$APK_DIR" > /tmp/apk_server.log 2>&1 &
    sleep 1
fi

# 4. Display IP Addresses and Download Links
PRIMARY_IP=$(hostname -I | awk '{print $1}')
LOCAL_IPS=$(hostname -I)

echo ""
echo "=========================================="
echo " KR TRACK APK SERVER READY!"
echo " APK Size: $(ls -lh "$APK_DIR/KR_Track.apk" 2>/dev/null | awk '{print $5}')"
echo "=========================================="
echo ""
echo "Direct Download Links for Mobile / PC Browser:"
for ip in $LOCAL_IPS; do
    echo "  -> http://$ip:8088/"
    echo "  -> http://$ip:8088/KR_Track.apk"
done
echo ""
echo "Alternative Direct Download Links (Via Web Frontend / Media):"
for ip in $LOCAL_IPS; do
    echo "  -> http://$ip:5173/KR_Track.apk"
    echo "  -> http://$ip:8000/media/KR_Track.apk"
done
echo "=========================================="
