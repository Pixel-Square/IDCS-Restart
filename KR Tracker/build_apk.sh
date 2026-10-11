#!/bin/bash
# =======================================================
# KR Track - One-Click APK Build & Download Script
# =======================================================
set -e

# 1. Navigate to Project Directory
cd "/home/iqac2/Desktop/idcs-mt/KR Tracker"

# 2. Configure JDK 17 Environment
export JAVA_HOME="/home/iqac2/Android/jdk-17/jdk-17.0.12+7"
export PATH="$JAVA_HOME/bin:$PATH"

echo "=========================================="
echo " Building KR Track Release APK..."
echo "=========================================="

# 3. Build Release APK
flutter build apk --release

# 4. Copy and Rename for Easy Download
APK_DIR="/home/iqac2/Desktop/idcs-mt/KR Tracker/build/app/outputs/flutter-apk"
cp "$APK_DIR/app-release.apk" "$APK_DIR/KR_Track.apk"
mkdir -p web
cp "$APK_DIR/app-release.apk" web/KR_Track.apk
cp "$APK_DIR/app-release.apk" web/kr_track.apk

# 5. Check if HTTP Download Server on 8088 is running; if not, launch it
if ! lsof -i:8088 > /dev/null 2>&1; then
    echo "Starting download server on port 8088..."
    nohup python3 -m http.server 8088 --directory "$APK_DIR" > /tmp/apk_server.log 2>&1 &
fi

# 6. Display IP Addresses and Download Links
PRIMARY_IP=$(hostname -I | awk '{print $1}')
LOCAL_IPS=$(hostname -I)

echo ""
echo "=========================================="
echo " BUILD SUCCESSFUL!"
echo " APK Size: $(ls -lh "$APK_DIR/KR_Track.apk" | awk '{print $5}')"
echo "=========================================="
echo ""
echo "Direct Download Links for Mobile / PC Browser:"
for ip in $LOCAL_IPS; do
    echo "  -> http://$ip:8088/KR_Track.apk"
done
echo ""
echo "Windows PowerShell Download Command:"
echo "  Invoke-WebRequest -Uri \"http://$PRIMARY_IP:8088/KR_Track.apk\" -OutFile \"KR_Track.apk\""
echo ""
echo "Windows SCP Command:"
echo "  scp iqac2@$PRIMARY_IP:\"/home/iqac2/Desktop/idcs-mt/KR\\ Tracker/build/app/outputs/flutter-apk/KR_Track.apk\" ./KR_Track.apk"
echo "=========================================="
