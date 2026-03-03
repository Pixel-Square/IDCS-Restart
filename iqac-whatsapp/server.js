const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// 🔐 Change this to your own secret key (prefer env var)
// Supports both env var names to match the Django backend config.
const API_KEY = process.env.OBE_WHATSAPP_API_KEY || process.env.WHATSAPP_API_KEY || "IQAC_SECRET_123";

const SEND_TIMEOUT_MS = Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || 12000);

function withTimeout(promise, ms, label) {
    const timeoutMs = Number(ms || SEND_TIMEOUT_MS || 12000);
    const name = String(label || 'operation');

    return Promise.race([
        promise,
        new Promise((_, reject) => {
            const id = setTimeout(() => {
                clearTimeout(id);
                const err = new Error(`${name} timed out after ${timeoutMs}ms`);
                err.code = 'TIMEOUT';
                reject(err);
            }, timeoutMs);
        })
    ]);
}

let IS_READY = false;
let LAST_QR_AT = null;
let LAST_AUTH_FAILURE = null;
let LAST_DISCONNECT = null;
let RESTARTING = false;
let LAST_RESTART_AT = null;
let LAST_RESTART_REASON = null;

async function restartClient(reason) {
    if (RESTARTING) return;
    RESTARTING = true;
    IS_READY = false;
    LAST_RESTART_AT = new Date().toISOString();
    LAST_RESTART_REASON = String(reason || 'restart');

    try {
        console.warn('🔄 Restarting WhatsApp client:', LAST_RESTART_REASON);
        try {
            if (typeof client.destroy === 'function') {
                await client.destroy();
            }
        } catch (e) {
            console.warn('client.destroy() failed:', String(e && (e.message || e) || e));
        }

        await new Promise((r) => setTimeout(r, 750));

        try {
            if (typeof client.initialize === 'function') {
                client.initialize();
            }
        } catch (e) {
            console.warn('client.initialize() failed:', String(e && (e.message || e) || e));
        }
    } finally {
        RESTARTING = false;
    }
}

// WhatsApp Client Setup
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: "./session"
    }),
    puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
});

// QR Code generation
client.on("qr", (qr) => {
    console.log("Scan this QR with IQAC WhatsApp:");
    qrcode.generate(qr, { small: true });

    IS_READY = false;
    LAST_QR_AT = new Date().toISOString();
});

client.on("ready", () => {
    console.log("✅ WhatsApp Client is Ready!");

    IS_READY = true;
    LAST_AUTH_FAILURE = null;
    LAST_DISCONNECT = null;
});

client.on("auth_failure", msg => {
    console.error("❌ Authentication failed:", msg);

    IS_READY = false;
    LAST_AUTH_FAILURE = String(msg || "auth_failure");
});

client.on("disconnected", reason => {
    console.log("⚠️ WhatsApp disconnected:", reason);

    IS_READY = false;
    LAST_DISCONNECT = String(reason || "disconnected");
});

client.initialize();

app.get("/health", (req, res) => {
    return res.json({
        ok: true,
        ready: IS_READY,
        last_qr_at: LAST_QR_AT,
        last_auth_failure: LAST_AUTH_FAILURE,
        last_disconnect: LAST_DISCONNECT,
        restarting: RESTARTING,
        last_restart_at: LAST_RESTART_AT,
        last_restart_reason: LAST_RESTART_REASON,
    });
});

// 📩 Send WhatsApp Message Endpoint
app.post("/send-whatsapp", async (req, res) => {
    try {
        const { api_key, to, message } = req.body;

        if (api_key !== API_KEY) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        if (!to || !message) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        if (!IS_READY) {
            return res.status(503).json({
                error: "WhatsApp client not ready",
                last_qr_at: LAST_QR_AT,
                last_auth_failure: LAST_AUTH_FAILURE,
                last_disconnect: LAST_DISCONNECT,
            });
        }

        // Normalize incoming number: accept +91... or 9191... or 91... or 739... etc.
        const digits = String(to).replace(/\D/g, "");

        // Ensure we have something that looks like a national+country number
        if (!digits || digits.length < 8) {
            return res.status(400).json({ error: "Invalid recipient number" });
        }

        // Use whatsapp-web.js helper to verify the number is registered on WhatsApp
        const numberId = await withTimeout(client.getNumberId(digits), SEND_TIMEOUT_MS, 'getNumberId');
        if (!numberId) {
            return res.status(400).json({ error: "Number not registered on WhatsApp" });
        }

        const formattedNumber = numberId._serialized || `${digits}@c.us`;

        await withTimeout(client.sendMessage(formattedNumber, message), SEND_TIMEOUT_MS, 'sendMessage');

        return res.json({ status: "Message sent successfully", to: formattedNumber });

    } catch (error) {
        console.error("Send Error:", error);

        const code = String(error && (error.code || error.name) || '');
        if (code === 'TIMEOUT') {
            return res.status(504).json({
                error: 'WhatsApp send timed out',
                detail: String(error && (error.message || error) || 'timeout'),
            });
        }

        const msg = String(error && (error.message || error) || '').toLowerCase();
        const looksLikeBrowserCrashed =
            msg.includes('detached frame') ||
            msg.includes('execution context was destroyed') ||
            msg.includes('target closed') ||
            msg.includes('session closed') ||
            msg.includes('protocol error');

        if (looksLikeBrowserCrashed) {
            await restartClient(msg || 'browser-crash');
            return res.status(503).json({
                error: 'WhatsApp client crashed; restarting',
                detail: String(error && (error.message || error) || 'crashed'),
            });
        }

        return res.status(500).json({
            error: "Failed to send message",
            detail: String(error && (error.message || error) || "unknown"),
        });
    }
});

// 🔒 Bind ONLY to localhost
app.listen(3000, "127.0.0.1", () => {
    console.log("🚀 WhatsApp API running on http://127.0.0.1:3000");
});
