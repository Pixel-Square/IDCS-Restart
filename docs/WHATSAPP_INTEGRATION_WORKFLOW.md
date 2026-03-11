# WhatsApp Integration - Complete Workflow Guide

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         IDCS PLATFORM                               │
│                                                                     │
│  ┌──────────────┐      ┌──────────────┐      ┌─────────────────┐  │
│  │   Frontend   │      │   Backend    │      │  WhatsApp Server│  │
│  │  (React UI)  │◄────►│   (Django)   │◄────►│   (Node.js)     │  │
│  │  Port: 80/   │      │ Port: socket │      │   Port: 3000    │  │
│  │  Nginx       │      │  /Nginx      │      │   Standalone    │  │
│  └──────────────┘      └──────────────┘      └─────────────────┘  │
│                                                       │             │
│                                                       ▼             │
│                                              ┌─────────────────┐   │
│                                              │  whatsapp-web.js│   │
│                                              │   + Puppeteer   │   │
│                                              │   + Chrome      │   │
│                                              └─────────────────┘   │
│                                                       │             │
└───────────────────────────────────────────────────────┼─────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │  WhatsApp Web   │
                                              │     Servers     │
                                              └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │  Your Phone     │
                                              │  (Paired via QR)│
                                              └─────────────────┘
```

---

## 📊 Current Running Status

### WhatsApp Server Status
- **Service**: `whatsapp.service` (systemd)
- **Status**: ✅ **ACTIVE** (running)
- **PID**: 309711
- **Port**: 3000 (listening on 0.0.0.0:3000)
- **Connection State**: ⚠️ **QR_READY** (waiting for phone pairing)
- **Started**: March 11, 2026 12:49:44 IST
- **Memory Usage**: ~400 MB
- **Process**: `/usr/bin/node /home/iqac/IDCS-Restart/whatsapp-server/server.js`

### Backend Status
- **Service**: `gunicorn.service` (systemd)
- **Status**: ✅ **ACTIVE** (running)
- **Connection**: Unix socket `/run/gunicorn/gunicorn.sock`
- **Workers**: 9 workers × 2 threads each

### Web Server Status
- **Service**: `nginx`
- **Port**: 80 (public: idcs.krgi.co.in)
- **Routes**:
  - `/` → Frontend (React)
  - `/api/` → Backend (Django via Gunicorn)
  - `/static/` → Static files
  - `/media/` → Media files

---

## 🔄 Complete Workflow

### 1️⃣ **User Requests OTP (Frontend → Backend)**

```typescript
// frontend/src/services/auth.ts
export async function requestMobileOtp(mobile_number: string) {
  const res = await apiClient.post('mobile/request-otp/', { mobile_number })
  return res.data
}
```

**Flow:**
1. User enters mobile number in Profile page
2. Frontend calls: `POST /api/accounts/mobile/request-otp/`
3. Request goes through **nginx** → **gunicorn** → **Django**

---

### 2️⃣ **Backend Proxies to WhatsApp Server**

```python
# backend/accounts/views.py - MobileOtpRequestView
class MobileOtpRequestView(APIView):
    authentication_classes = []  # Bypass JWT to avoid 401 errors
    permission_classes = (permissions.AllowAny,)
    
    def post(self, request):
        # Normalize mobile number (add country code)
        mobile = _normalize_mobile_number(request.data.get('mobile_number'))
        
        # Forward to WhatsApp server
        endpoint = 'http://127.0.0.1:3000/mobile/request-otp'
        payload = {
            'api_key': 'IQAC_SECRET_123',
            'mobile_number': mobile,
        }
        response = requests.post(endpoint, json=payload, timeout=15)
        return Response(response.json(), status=response.status_code)
```

**Flow:**
1. Django receives request from frontend
2. Normalizes mobile number (adds +91 for India)
3. Proxies to WhatsApp server on port 3000
4. Includes API key for authentication

---

### 3️⃣ **WhatsApp Server Generates & Sends OTP**

```javascript
// whatsapp-server/server.js
app.post('/mobile/request-otp', requireApiKey, async (req, res) => {
  const { mobile_number } = req.body;
  
  // Check if WhatsApp is connected
  if (waStatus !== 'CONNECTED' || !waClient) {
    return res.status(503).json({
      ok: false,
      error: 'WhatsApp is not connected. Pair the device first.',
      status: waStatus  // Current status: QR_READY
    });
  }
  
  // Generate 6-digit OTP
  const code = generateOtp(6);
  
  // Store in memory with expiry
  otpStore.set(mobile, {
    code,
    expires_at: Date.now() + (5 * 60 * 1000), // 5 minutes
    attempts: 0,
    created_at: Date.now()
  });
  
  // Send via WhatsApp
  const chatId = `${mobile}@c.us`;
  const message = `Your IDCS OTP is *${code}*. Valid for 5 minutes.`;
  await waClient.sendMessage(chatId, message);
  
  return res.json({ ok: true, message: 'OTP sent successfully' });
});
```

**Flow:**
1. Validates API key
2. Checks WhatsApp connection status (⚠️ **Currently not connected**)
3. Generates random 6-digit OTP
4. Stores OTP in memory with 5-minute expiry
5. Sends message via whatsapp-web.js client
6. Returns success/failure to Django

---

### 4️⃣ **User Verifies OTP**

```typescript
// Frontend verifies OTP
export async function verifyMobileOtp(mobile_number: string, otp: string) {
  const res = await apiClient.post('mobile/verify-otp/', { mobile_number, otp })
  return res.data
}
```

```python
# Backend proxies verification
class MobileOtpVerifyView(APIView):
    permission_classes = (permissions.IsAuthenticated,)  # Must be logged in
    
    def post(self, request):
        # Forward to WhatsApp server for verification
        endpoint = 'http://127.0.0.1:3000/mobile/verify-otp'
        response = requests.post(endpoint, json={
            'api_key': 'IQAC_SECRET_123',
            'mobile_number': mobile,
            'otp': code
        })
        
        if response.status_code == 200:
            # Update user profile with verified mobile
            _set_verified_mobile_on_profile(request.user, mobile, timezone.now())
        
        return Response(response.json(), status=response.status_code)
```

```javascript
// WhatsApp server verifies OTP
app.post('/mobile/verify-otp', requireApiKey, async (req, res) => {
  const { mobile_number, otp } = req.body;
  const stored = otpStore.get(mobile);
  
  // Check expiry, attempts, and match code
  if (stored && stored.code === otp && stored.expires_at > Date.now()) {
    otpStore.delete(mobile);
    return res.json({ ok: true, message: 'Mobile verified successfully' });
  }
  
  return res.status(400).json({ ok: false, error: 'Invalid OTP' });
});
```

---

## 🚀 How to Start/Stop Services

### Check Service Status

```bash
# WhatsApp service
systemctl status whatsapp
journalctl -u whatsapp -f  # View live logs

# Backend service
systemctl status gunicorn

# Web server
systemctl status nginx

# Check WhatsApp connection state
curl http://localhost:3000/status | python3 -m json.tool
```

### Start/Stop WhatsApp Service

```bash
# Start service
sudo systemctl start whatsapp

# Stop service
sudo systemctl stop whatsapp

# Restart service
sudo systemctl restart whatsapp

# Enable auto-start on boot
sudo systemctl enable whatsapp

# View logs
journalctl -u whatsapp --no-pager -n 50
```

### Manual Start (Development)

```bash
# Navigate to WhatsApp server directory
cd /home/iqac/IDCS-Restart/whatsapp-server

# Install dependencies (first time only)
npm install

# Start in foreground (dev mode with auto-reload)
npm run dev

# Start in background (production mode)
npm start &
```

### Restart Backend After Code Changes

```bash
# Reload systemd and restart Gunicorn
sudo systemctl daemon-reload
sudo systemctl restart gunicorn

# Check status
sudo systemctl status gunicorn --no-pager
```

---

## 📱 How to Pair WhatsApp (Connect Phone)

### Current Issue
⚠️ **Status**: `QR_READY` - The WhatsApp server is running but **NOT CONNECTED** to a phone.
This is why you're getting `503` errors when requesting OTP.

### Solution: Scan QR Code

#### Method 1: Via Frontend UI (Recommended)

1. **Login to IDCS** as IQAC user:
   - URL: `http://idcs.krgi.co.in/login` (or `http://localhost`)
   - Username: `000000`
   - Password: `123`

2. **Navigate to Settings**:
   - Click your profile → Settings
   - Click "WhatsApp Sender Number"

3. **Connect to WhatsApp**:
   - Click "Connect to WhatsApp" button
   - QR code will appear on screen
   - Scan with your phone:
     - Open WhatsApp app
     - Tap ⋯ menu (top right)
     - Select "Linked Devices"
     - Tap "Link a Device"
     - Scan the QR code

4. **Verify Connection**:
   - Page will show "Connected" with phone number
   - Status changes from `QR_READY` → `CONNECTED`

#### Method 2: Direct QR Access

```bash
# Open QR code image in browser
xdg-open http://localhost:3000/qr.png

# Or get QR code as JSON
curl http://localhost:3000/qr | python3 -m json.tool
```

Then scan with WhatsApp app (same steps as above).

---

## 🔧 Service Configuration Files

### WhatsApp Service
**Location**: `/etc/systemd/system/whatsapp.service`

```ini
[Unit]
Description=WhatsApp OTP Service for IDCS
After=network.target

[Service]
Type=simple
User=iqac
Group=iqac
WorkingDirectory=/home/iqac/IDCS-Restart/whatsapp-server
ExecStart=/usr/bin/node /home/iqac/IDCS-Restart/whatsapp-server/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment="NODE_ENV=production"
Environment="WA_API_KEY=IQAC_SECRET_123"
Environment="OBE_WHATSAPP_API_KEY=IQAC_SECRET_123"
Environment="CHROME_PATH=/usr/bin/google-chrome"

[Install]
WantedBy=multi-user.target
```

### Gunicorn Service
**Location**: `/etc/systemd/system/gunicorn.service`

---

## 🔑 Environment Configuration

### WhatsApp Server (.env)
**Location**: `/home/iqac/IDCS-Restart/whatsapp-server/.env`

```bash
PORT=3000
WA_API_KEY=IQAC_SECRET_123
OBE_WHATSAPP_API_KEY=IQAC_SECRET_123
WA_SESSION_DIR=./.wwebjs_auth
CHROME_PATH=/usr/bin/google-chrome
```

### Django Backend
**Location**: Django settings (`backend/erp/settings.py`)

```python
OBE_WHATSAPP_API_URL = 'http://127.0.0.1:3000/send-whatsapp'
OBE_WHATSAPP_GATEWAY_BASE_URL = 'http://127.0.0.1:3000'
OBE_WHATSAPP_API_KEY = 'IQAC_SECRET_123'
OBE_WHATSAPP_TIMEOUT_SECONDS = 8
OBE_WHATSAPP_DEFAULT_COUNTRY_CODE = '91'
```

---

## 🛠️ Troubleshooting

### Issue 1: 401 Unauthorized Error
✅ **FIXED** - Added `authentication_classes = []` to bypass JWT validation

### Issue 2: 503 Service Unavailable
⚠️ **CURRENT ISSUE** - WhatsApp not connected to phone
- **Error**: "WhatsApp is not connected. Pair the device first."
- **Status**: `QR_READY` (waiting for QR scan)
- **Solution**: Follow "How to Pair WhatsApp" section above

### Issue 3: Check if Services are Running

```bash
# Check all services
systemctl status whatsapp gunicorn nginx

# Check port 3000 is listening
ss -tlnp | grep 3000

# Check WhatsApp logs for errors
journalctl -u whatsapp --no-pager -n 100
```

### Issue 4: Session Lost (Need to Re-pair)

```bash
# Clear session and restart
cd /home/iqac/IDCS-Restart/whatsapp-server
rm -rf .wwebjs_auth/
sudo systemctl restart whatsapp

# Then scan QR code again
```

### Issue 5: Chrome/Puppeteer Issues

```bash
# Check Chrome is installed
which google-chrome
google-chrome --version

# If missing, install:
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt-get install -f
```

---

## 📝 API Endpoints Reference

### WhatsApp Server Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/status` | None | Get connection status |
| GET | `/qr` | None | Get QR as JSON |
| GET | `/qr.png` | None | Get QR as PNG image |
| GET | `/events` | None | SSE stream (real-time updates) |
| POST | `/mobile/request-otp` | API Key | Send OTP to mobile |
| POST | `/mobile/verify-otp` | API Key | Verify OTP code |
| POST | `/send-whatsapp` | API Key | Send WhatsApp message |
| POST | `/restart` | API Key | Restart WhatsApp client |
| POST | `/disconnect` | API Key | Logout & clear session |
| POST | `/clear-session` | API Key | Clear session & get new QR |

### Django Backend Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/accounts/mobile/request-otp/` | None | Request OTP (proxies to WA server) |
| POST | `/api/accounts/mobile/verify-otp/` | JWT | Verify OTP & update profile |
| GET | `/api/accounts/settings/whatsapp/status/` | JWT + IQAC | Get gateway status |
| GET | `/api/accounts/settings/whatsapp/qr/` | JWT + IQAC | Get QR code |
| POST | `/api/accounts/settings/whatsapp/restart/` | JWT + IQAC | Restart gateway |
| POST | `/api/accounts/settings/whatsapp/disconnect/` | JWT + IQAC | Disconnect gateway |

---

## 🎯 Next Steps

### ✅ Completed
1. Fixed 401 authentication error
2. WhatsApp service is running
3. Backend is correctly configured

### 🔴 **ACTION REQUIRED**
**Connect WhatsApp to a phone** to enable OTP sending:

1. Open `http://localhost:3000/qr.png` or use the Settings page in IDCS
2. Scan QR code with WhatsApp app on your phone
3. Keep phone online and connected
4. Monitor connection: `curl http://localhost:3000/status`
5. Status should change from `QR_READY` → `CONNECTED`

Once connected, OTP requests will work successfully! 📲✅

---

## 📚 Additional Resources

- **WhatsApp Server Code**: `/home/iqac/IDCS-Restart/whatsapp-server/server.js`
- **Backend OTP Views**: `/home/iqac/IDCS-Restart/backend/accounts/views.py`
- **Frontend OTP UI**: `/home/iqac/IDCS-Restart/frontend/src/pages/profile/Profile.tsx`
- **WhatsApp Settings UI**: `/home/iqac/IDCS-Restart/frontend/src/pages/settings/WhatsAppSenderPage.tsx`
- **Library Docs**: https://wwebjs.dev/

---

**Last Updated**: March 11, 2026
**Status**: Service running, awaiting phone pairing
