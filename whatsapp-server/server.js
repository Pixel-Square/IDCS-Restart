/**
 * IDCS WhatsApp Gateway Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on port 3000 (configurable via PORT env var).
 * Manages a single WhatsApp Web session via whatsapp-web.js + Puppeteer.
 * Session is persisted in .wwebjs_auth/ so the phone only needs to pair once.
 *
 * Endpoints (all CORS-open; sensitive ones require X-Api-Key or body api_key):
 *   GET  /status           → current state (DISCONNECTED|INITIALIZING|QR_READY|CONNECTED)
 *   GET  /qr               → JSON QR payload { qr_text, data_url } or error
 *   GET  /qr.png           → QR as PNG image
 *   POST /send-whatsapp    → { to, message } – requires api_key
 *   POST /disconnect       → log out session   – requires api_key
 *   POST /restart          → re-initialize     – requires api_key
 *   GET  /events           → SSE stream (real-time status + QR pushes)
 *   GET  /                 → health / info page
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const QRCode  = require('qrcode');

// Conditionally load whatsapp-web.js (allows the file to be tested without it)
let Client, LocalAuth;
try {
  ({ Client, LocalAuth } = require('whatsapp-web.js'));
} catch (e) {
  console.error('[WA] whatsapp-web.js not found – run npm install first.', e.message);
  process.exit(1);
}

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);

// Accept either env var name to avoid configuration drift between services.
// - `WA_API_KEY` is the gateway's canonical name
// - `OBE_WHATSAPP_API_KEY` matches the Django backend setting
const API_KEYS = Array.from(
  new Set([
    String(process.env.WA_API_KEY || '').trim(),
    String(process.env.OBE_WHATSAPP_API_KEY || '').trim(),
  ].filter(Boolean)),
);

if (API_KEYS.length === 0) {
  console.warn('[WA] WARNING: No API key is set (WA_API_KEY / OBE_WHATSAPP_API_KEY). Authenticated endpoints are unprotected!');
}

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
/** @type {'DISCONNECTED'|'INITIALIZING'|'QR_READY'|'CONNECTED'} */
let waStatus       = 'DISCONNECTED';
let currentQrText  = null;   // raw QR string from whatsapp-web.js
let currentQrDataUrl = null; // data:image/png;base64,... cached render
let connectedNumber = null;  // e.g. "919876543210"
let lastError      = null;   // last error message for diagnostics
let initTime       = null;   // ISO timestamp of last init attempt

/** @type {import('whatsapp-web.js').Client|null} */
let waClient = null;

/** @type {Set<import('express').Response>} */
const sseClients = new Set();

// ─────────────────────────────────────────────
// SSE helpers
// ─────────────────────────────────────────────
function pushSSE(eventName, data) {
  const line = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(line);
    } catch {
      sseClients.delete(res);
    }
  }
}

function statusSnapshot() {
  return {
    status:           waStatus,
    connected_number: connectedNumber,
    last_error:       lastError,
    init_time:        initTime,
    timestamp:        new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// WhatsApp client lifecycle
// ─────────────────────────────────────────────
function destroyClient() {
  if (!waClient) return Promise.resolve();
  const c = waClient;
  waClient = null;
  return c.destroy().catch(() => {});
}

async function initClient() {
  await destroyClient();

  waStatus        = 'INITIALIZING';
  currentQrText   = null;
  currentQrDataUrl = null;
  connectedNumber = null;
  lastError       = null;
  initTime        = new Date().toISOString();

  pushSSE('status', statusSnapshot());
  console.log('[WA] Initializing client…');

  waClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: (process.env.WA_SESSION_DIR || './.wwebjs_auth'),
      clientId:  'iqac-main',
    }),
    // Pin a known-working WhatsApp Web version – avoids the "outdated browser" rejection
    webVersion: '2.3000.1034427372-alpha',
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1034427372-alpha.html',
    },
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-accelerated-2d-canvas',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ],
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      defaultViewport: { width: 1920, height: 1080 },
    },
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000,
  });

  waClient.on('qr', async (qr) => {
    waStatus      = 'QR_READY';
    currentQrText = qr;
    try {
      currentQrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    } catch (e) {
      console.error('[WA] QR render error:', e.message);
      currentQrDataUrl = null;
    }
    console.log('[WA] QR ready – waiting for scan');
    pushSSE('qr', {
      ...statusSnapshot(),
      qr_text:  qr,
      data_url: currentQrDataUrl,
    });
  });

  waClient.on('loading_screen', (percent, message) => {
    console.log(`[WA] Loading: ${percent}% – ${message}`);
  });

  waClient.on('authenticated', () => {
    waStatus = 'INITIALIZING';
    console.log('[WA] Authenticated – waiting for ready');
    pushSSE('status', statusSnapshot());
  });

  waClient.on('auth_failure', (msg) => {
    waStatus   = 'DISCONNECTED';
    lastError  = `Auth failure: ${msg}`;
    console.error('[WA]', lastError);
    pushSSE('status', statusSnapshot());
  });

  waClient.on('ready', async () => {
    waStatus        = 'CONNECTED';
    currentQrText   = null;
    currentQrDataUrl = null;
    lastError       = null;
    try {
      const info = waClient.info;
      connectedNumber = (info?.wid?.user || '').replace('@c.us', '');
    } catch {
      connectedNumber = null;
    }
    console.log(`[WA] Connected as ${connectedNumber || '(unknown)'}`);
    pushSSE('status', statusSnapshot());
  });

  waClient.on('disconnected', (reason) => {
    waStatus        = 'DISCONNECTED';
    connectedNumber = null;
    lastError       = `Disconnected: ${reason}`;
    console.warn('[WA]', lastError);
    pushSSE('status', statusSnapshot());
  });

  waClient.on('change_state', (state) => {
    console.log('[WA] State changed:', state);
  });

  try {
    await waClient.initialize();
  } catch (e) {
    waStatus  = 'DISCONNECTED';
    lastError = `Init error: ${e.message}`;
    console.error('[WA] Init error:', e.message);
    pushSSE('status', statusSnapshot());
  }
}

// ─────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logger
app.use((req, _res, next) => {
  const skip = ['/events', '/status'].includes(req.path);
  if (!skip) console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// ─── API key middleware ───────────────────────
function requireApiKey(req, res, next) {
  if (API_KEYS.length === 0) return next(); // not configured → allow all (dev only)
  const key =
    req.headers['x-api-key'] ||
    (req.body && req.body.api_key) ||
    req.query.api_key;
  if (!key || !API_KEYS.includes(String(key).trim())) {
    return res.status(401).json({ ok: false, detail: 'Invalid or missing API key.' });
  }
  next();
}

// ─── GET / ───────────────────────────────────
app.get('/', (_req, res) => {
  const snap = statusSnapshot();
  res.json({
    service: 'IDCS WhatsApp Gateway',
    version: '1.0.0',
    ...snap,
  });
});

// ─── GET /status ─────────────────────────────
app.get('/status', (_req, res) => {
  res.json({ ok: true, ...statusSnapshot() });
});

// ─── GET /qr ─────────────────────────────────
app.get('/qr', (_req, res) => {
  if (waStatus === 'CONNECTED') {
    return res.json({
      ok: false,
      status: waStatus,
      detail: 'Already connected – no QR required.',
      connected_number: connectedNumber,
    });
  }
  if (waStatus !== 'QR_READY' || !currentQrText) {
    return res.json({
      ok: false,
      status: waStatus,
      detail:
        waStatus === 'INITIALIZING'
          ? 'Still initializing WhatsApp – please wait a few seconds and try again.'
          : 'QR not available. Use POST /restart to re-initialize.',
    });
  }
  res.json({
    ok:       true,
    status:   waStatus,
    qr_text:  currentQrText,
    data_url: currentQrDataUrl,
  });
});

// ─── GET /qr.png ─────────────────────────────
app.get('/qr.png', async (_req, res) => {
  if (waStatus !== 'QR_READY' || !currentQrText) {
    return res.status(404).json({
      ok:     false,
      status: waStatus,
      detail: 'QR not available.',
    });
  }
  try {
    const buf = await QRCode.toBuffer(currentQrText, { type: 'png', width: 350, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ ok: false, detail: `QR render error: ${e.message}` });
  }
});

// ─── POST /send-whatsapp ─────────────────────
app.post('/send-whatsapp', requireApiKey, async (req, res) => {
  if (waStatus !== 'CONNECTED' || !waClient) {
    return res.status(503).json({
      ok:     false,
      status: waStatus,
      detail: 'WhatsApp is not connected. Pair the device first.',
    });
  }

  let { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({ ok: false, detail: '"to" and "message" are required.' });
  }

  // Normalise number: digits only, drop leading +
  to = String(to).replace(/[^\d]/g, '');
  if (!to || to.length < 10) {
    return res.status(400).json({ ok: false, detail: 'Invalid "to" number.' });
  }

  const chatId = `${to}@c.us`;
  try {
    await waClient.sendMessage(chatId, String(message).trim());
    console.log(`[WA] Sent to ${chatId}`);
    res.json({ ok: true, to: chatId });
  } catch (e) {
    console.error(`[WA] Send error to ${chatId}:`, e.message);
    res.status(500).json({ ok: false, detail: e.message });
  }
});

// ─── POST /disconnect ─────────────────────────
app.post('/disconnect', requireApiKey, async (_req, res) => {
  try {
    if (waClient && waStatus !== 'DISCONNECTED') {
      try { await waClient.logout(); } catch (e) { console.warn('[WA] Logout error (ignored):', e.message); }
    }
    await destroyClient();
  } catch (e) {
    console.warn('[WA] Destroy error (ignored):', e.message);
  }
  waStatus        = 'DISCONNECTED';
  connectedNumber = null;
  currentQrText   = null;
  currentQrDataUrl = null;
  // Wipe saved session so next restart forces fresh QR
  try {
    const fs   = require('fs');
    const path = require('path');
    const dir  = path.resolve(process.env.WA_SESSION_DIR || './.wwebjs_auth');
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('[WA] Session directory cleared:', dir);
    }
  } catch (e) {
    console.warn('[WA] Could not clear session directory:', e.message);
  }
  pushSSE('status', statusSnapshot());
  console.log('[WA] Logged out and disconnected.');
  res.json({ ok: true, detail: 'Disconnected and session cleared.' });
});

// ─── POST /clear-session ──────────────────────
app.post('/clear-session', requireApiKey, async (_req, res) => {
  try {
    if (waClient) {
      try { await waClient.logout(); } catch {}
      await destroyClient();
    }
  } catch {}
  waStatus         = 'DISCONNECTED';
  connectedNumber  = null;
  currentQrText    = null;
  currentQrDataUrl = null;
  lastError        = null;
  try {
    const fs   = require('fs');
    const path = require('path');
    const dir  = path.resolve(process.env.WA_SESSION_DIR || './.wwebjs_auth');
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('[WA] Session directory wiped:', dir);
    }
  } catch (e) {
    console.warn('[WA] Could not wipe session directory:', e.message);
  }
  pushSSE('status', statusSnapshot());
  setTimeout(() => initClient(), 200);
  res.json({ ok: true, detail: 'Session cleared – reinitializing with fresh QR.' });
});

// ─── POST /restart ────────────────────────────
app.post('/restart', requireApiKey, (_req, res) => {
  res.json({ ok: true, detail: 'Restarting WhatsApp client – check /events or poll /status.' });
  // Small delay so the response is sent before blocking init
  setTimeout(() => initClient(), 100);
});

// ─── GET /events (SSE) ───────────────────────
app.get('/events', (req, res) => {
  res.setHeader('Content-Type',                'text/event-stream');
  res.setHeader('Cache-Control',               'no-cache');
  res.setHeader('Connection',                  'keep-alive');
  res.setHeader('X-Accel-Buffering',           'no'); // nginx passthrough
  res.flushHeaders();

  // Send current state immediately
  const snap = statusSnapshot();
  let initial = `event: status\ndata: ${JSON.stringify(snap)}\n\n`;
  if (waStatus === 'QR_READY' && currentQrText) {
    initial += `event: qr\ndata: ${JSON.stringify({ ...snap, qr_text: currentQrText, data_url: currentQrDataUrl })}\n\n`;
  }
  res.write(initial);

  // Keepalive ping every 25s to prevent proxy timeouts
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
  }, 25000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[WA] Gateway listening on http://0.0.0.0:${PORT}`);
  console.log(`[WA] API key protection: ${API_KEYS.length ? `ENABLED (${API_KEYS.length} key(s))` : 'DISABLED (set WA_API_KEY or OBE_WHATSAPP_API_KEY)'}`);
  // Auto-start the WhatsApp client
  initClient();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[WA] SIGTERM – shutting down');
  await destroyClient();
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('[WA] SIGINT – shutting down');
  await destroyClient();
  process.exit(0);
});
