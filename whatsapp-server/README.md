# IDCS WhatsApp Gateway

A lightweight Node.js microservice that wraps [whatsapp-web.js](https://wwebjs.dev/) to provide **WhatsApp message delivery** for the IDCS platform.

---

## Features

| What | Detail |
|-------|--------|
| Session persistence | Phone needs to pair **once**; session survives server restarts |
| QR-code pairing | `GET /qr.png` serves the QR as an image; frontend polls and shows it |
| Message send | `POST /send-whatsapp` – accepts `{ to, message }` |
| Real-time status | `GET /events` – Server-Sent Events stream (QR + connection state) |
| REST status | `GET /status` – JSON snapshot (polled by frontend every 5 s) |
| API-key guard | All write/send endpoints require `X-Api-Key` or body `api_key` |

---

## Prerequisites

| Requirement | Why |
|-------------|-----|
| Node.js ≥ 18 | JavaScript runtime |
| Chromium / Google Chrome | Puppeteer needs a browser for WhatsApp Web |
| Linux server with display (or headless Chrome flags) | `--no-sandbox` flag is used |

**Install Chromium on Ubuntu/Debian:**
```bash
sudo apt-get install -y chromium-browser
# or
sudo apt-get install -y google-chrome-stable
```

---

## Setup

```bash
# 1. Enter the directory
cd whatsapp-server

# 2. Install dependencies  (~400 MB including Puppeteer's bundled Chromium)
npm install

# 3. Create .env
cp .env.example .env
# Edit .env and set a strong WA_API_KEY that matches the Django backend's OBE_WHATSAPP_API_KEY
# (The gateway also accepts OBE_WHATSAPP_API_KEY directly for convenience.)

# 4. Start the server
npm start
# Server logs appear in the terminal; WhatsApp starts initialising immediately.
```

---

## Pairing (first run)

1. Start the server — it will log **"QR ready – waiting for scan"**.
2. Log in to the IDCS portal as the IQAC user (`000000` / `123`).
3. Navigate to **Settings → WhatsApp Sender Number**.
4. Click **"Connect to WhatsApp"** — the QR code is displayed.
5. Open WhatsApp on the phone → ⋯ menu → **Linked devices → Link a device**.
6. Scan the QR.
7. The page shows **"Connected"** with the paired phone number.

Session data is stored in `.wwebjs_auth/`. The phone must remain active (unrestricted background/battery).

---

## Connecting to Django

Add the following lines to `backend/.env`:

```dotenv
SMS_BACKEND=whatsapp
OBE_WHATSAPP_API_URL=http://127.0.0.1:3000/send-whatsapp
OBE_WHATSAPP_GATEWAY_BASE_URL=http://127.0.0.1:3000
OBE_WHATSAPP_API_KEY=<same value as WA_API_KEY above>
OBE_WHATSAPP_DEFAULT_COUNTRY_CODE=91
OBE_WHATSAPP_TIMEOUT_SECONDS=10
OBE_WHATSAPP_ALLOW_NON_LOCAL_URL=False
```

Then **restart the Django server** so the new env vars are picked up.

---

## API Reference

### `GET /status`
Returns the current connection state (no auth required).

```json
{
  "ok": true,
  "status": "CONNECTED",
  "connected_number": "919876543210",
  "last_error": null,
  "init_time": "2026-03-04T09:00:00.000Z",
  "timestamp": "2026-03-04T10:30:00.000Z"
}
```

`status` values: `DISCONNECTED` | `INITIALIZING` | `QR_READY` | `CONNECTED`

---

### `GET /qr`
Returns the current QR code as JSON (only meaningful when `status=QR_READY`).

```json
{
  "ok": true,
  "status": "QR_READY",
  "qr_text": "2@xxxx...",
  "data_url": "data:image/png;base64,..."
}
```

---

### `GET /qr.png`
Returns the QR as a `image/png` response. Returns 404 if QR is not ready.

---

### `POST /send-whatsapp`
Send a text message. Requires `X-Api-Key` header or `api_key` in the JSON body.

**Request:**
```json
{ "to": "919876543210", "message": "Your OTP is 123456" }
```
**Response:**
```json
{ "ok": true, "to": "919876543210@c.us" }
```

---

### `POST /disconnect`
Logs out and clears the session. Requires API key.

---

### `POST /restart`
Destroys the current client and re-initialises (useful to force a new QR). Requires API key.

---

### `GET /events`
Server-Sent Events stream. Emits:

| Event name | When |
|------------|------|
| `status` | Status changes (INITIALIZING, CONNECTED, DISCONNECTED) |
| `qr` | New QR available (includes `qr_text` and `data_url`) |

Format:
```
event: status
data: {"status":"CONNECTED","connected_number":"91987..."}

event: qr
data: {"status":"QR_READY","qr_text":"2@xxx","data_url":"data:image/png;base64,..."}
```

---

## Running as a Systemd Service

```ini
# /etc/systemd/system/idcs-whatsapp.service
[Unit]
Description=IDCS WhatsApp Gateway
After=network.target

[Service]
Type=simple
User=iqac2
WorkingDirectory=/home/iqac2/IDCS-Restart/whatsapp-server
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/home/iqac2/IDCS-Restart/whatsapp-server/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now idcs-whatsapp
sudo journalctl -u idcs-whatsapp -f
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Failed to launch the browser process` | Install Chromium; or set `CHROME_PATH` |
| QR keeps cycling without pairing | Phone must be on the same WhatsApp account; check network |
| `401 Invalid API key` | Ensure `WA_API_KEY` matches `OBE_WHATSAPP_API_KEY` in Django |
| Session lost after restart | Check `.wwebjs_auth/` directory permissions and disk space |
| Gateway not reachable from Django | Confirm server is running (`curl http://127.0.0.1:3000/status`) |
