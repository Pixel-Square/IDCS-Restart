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

// 📱 OTP Storage (in-memory)
// Structure: { mobile_number: { code, expires_at, attempts, created_at } }
const otpStore = new Map();
const OTP_EXPIRY_MINUTES = 5;
const OTP_COOLDOWN_SECONDS = 30;
const MAX_VERIFY_ATTEMPTS = 3;

// Helper: Generate random OTP
function generateOtp(length = 6) {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
}

// Helper: Normalize phone number
function normalizePhoneNumber(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    
    // Remove all non-digit characters
    let digits = s.replace(/\D/g, '');
    
    // Handle various formats
    if (digits.startsWith('91') && digits.length === 12) {
        // Already has country code: 91XXXXXXXXXX
        return digits;
    } else if (digits.startsWith('0') && digits.length === 11) {
        // Format: 0XXXXXXXXXX -> 91XXXXXXXXXX
        return '91' + digits.slice(1);
    } else if (digits.length === 10) {
        // Format: XXXXXXXXXX -> 91XXXXXXXXXX
        return '91' + digits;
    }
    
    // Return as-is if we can't parse it
    return digits;
}

// Helper: Clean old OTPs (run periodically)
function cleanExpiredOtps() {
    const now = Date.now();
    for (const [mobile, data] of otpStore.entries()) {
        if (data.expires_at < now) {
            otpStore.delete(mobile);
        }
    }
}

// Clean expired OTPs every minute
setInterval(cleanExpiredOtps, 60000);

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

// � Mobile OTP Request Endpoint
app.post("/mobile/request-otp", async (req, res) => {
    try {
        const { api_key, mobile_number } = req.body;

        // Verify API key
        if (api_key !== API_KEY) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const mobile = normalizePhoneNumber(mobile_number);
        if (!mobile || mobile.length < 10) {
            return res.status(400).json({ error: "Invalid mobile number" });
        }

        // Check if WhatsApp client is ready
        if (!IS_READY) {
            return res.status(503).json({
                error: "WhatsApp client not ready",
                detail: "Please wait for WhatsApp to connect or scan QR code"
            });
        }

        const now = Date.now();

        // Check cooldown
        const existing = otpStore.get(mobile);
        if (existing && existing.created_at) {
            const secondsSinceCreation = (now - existing.created_at) / 1000;
            if (secondsSinceCreation < OTP_COOLDOWN_SECONDS) {
                const retryAfter = Math.ceil(OTP_COOLDOWN_SECONDS - secondsSinceCreation);
                return res.status(429).json({
                    error: "Please wait before requesting another OTP",
                    retry_after_seconds: retryAfter
                });
            }
        }

        // Generate OTP
        const otp = generateOtp(6);
        const expiresAt = now + (OTP_EXPIRY_MINUTES * 60 * 1000);

        // Store OTP
        otpStore.set(mobile, {
            code: otp,
            expires_at: expiresAt,
            attempts: 0,
            created_at: now
        });

        // Verify number is registered on WhatsApp
        let numberId;
        try {
            numberId = await withTimeout(
                client.getNumberId(mobile),
                SEND_TIMEOUT_MS,
                'getNumberId'
            );
        } catch (error) {
            otpStore.delete(mobile);
            return res.status(400).json({
                error: "Failed to verify WhatsApp number",
                detail: String(error?.message || error || 'unknown')
            });
        }

        if (!numberId) {
            otpStore.delete(mobile);
            return res.status(400).json({
                error: "Number not registered on WhatsApp"
            });
        }

        const formattedNumber = numberId._serialized || `${mobile}@c.us`;

        // Send OTP via WhatsApp
        const message = `Your OTP is ${otp}. It is valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`;

        try {
            await withTimeout(
                client.sendMessage(formattedNumber, message),
                SEND_TIMEOUT_MS,
                'sendMessage'
            );
        } catch (error) {
            otpStore.delete(mobile);
            const code = String(error?.code || error?.name || '');
            if (code === 'TIMEOUT') {
                return res.status(504).json({
                    error: 'WhatsApp send timed out',
                    detail: String(error?.message || error || 'timeout')
                });
            }
            return res.status(500).json({
                error: "Failed to send OTP",
                detail: String(error?.message || error || 'unknown')
            });
        }

        return res.json({
            ok: true,
            mobile_number: mobile,
            expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
            cooldown_seconds: OTP_COOLDOWN_SECONDS,
            message: "OTP sent successfully via WhatsApp"
        });

    } catch (error) {
        console.error("OTP Request Error:", error);
        return res.status(500).json({
            error: "Failed to process OTP request",
            detail: String(error?.message || error || 'unknown')
        });
    }
});

// 🔓 Mobile OTP Verify Endpoint
app.post("/mobile/verify-otp", async (req, res) => {
    try {
        const { api_key, mobile_number, otp } = req.body;

        // Verify API key
        if (api_key !== API_KEY) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const mobile = normalizePhoneNumber(mobile_number);
        const otpCode = String(otp || '').trim();

        if (!mobile || mobile.length < 10) {
            return res.status(400).json({ error: "Invalid mobile number" });
        }

        if (!otpCode) {
            return res.status(400).json({ error: "OTP is required" });
        }

        // Get stored OTP
        const stored = otpStore.get(mobile);
        if (!stored) {
            return res.status(400).json({
                error: "No OTP found for this number",
                detail: "Please request a new OTP"
            });
        }

        const now = Date.now();

        // Check expiry
        if (stored.expires_at < now) {
            otpStore.delete(mobile);
            return res.status(400).json({
                error: "OTP has expired",
                detail: "Please request a new OTP"
            });
        }

        // Check attempts
        if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
            otpStore.delete(mobile);
            return res.status(400).json({
                error: "Too many failed attempts",
                detail: "Please request a new OTP"
            });
        }

        // Verify OTP
        if (stored.code !== otpCode) {
            stored.attempts += 1;
            const remainingAttempts = MAX_VERIFY_ATTEMPTS - stored.attempts;
            
            if (remainingAttempts <= 0) {
                otpStore.delete(mobile);
                return res.status(400).json({
                    error: "Invalid OTP. Too many failed attempts.",
                    detail: "Please request a new OTP"
                });
            }
            
            return res.status(400).json({
                error: "Invalid OTP",
                remaining_attempts: remainingAttempts
            });
        }

        // Success! Delete the OTP
        otpStore.delete(mobile);

        return res.json({
            ok: true,
            mobile_number: mobile,
            mobile_verified: true,
            message: "OTP verified successfully"
        });

    } catch (error) {
        console.error("OTP Verify Error:", error);
        return res.status(500).json({
            error: "Failed to verify OTP",
            detail: String(error?.message || error || 'unknown')
        });
    }
});

// �📩 Send WhatsApp Message Endpoint
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
