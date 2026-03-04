import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Send,
  Smartphone,
  WifiOff,
  XCircle,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import fetchWithAuth from '../../services/fetchAuth';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type WaStatus = 'DISCONNECTED' | 'INITIALIZING' | 'QR_READY' | 'CONNECTED' | null;

type StatusResp = {
  ok: boolean;
  status?: WaStatus;
  connected_number?: string | null;
  detail?: string;
  gateway_base_url?: string;
};

type QrResp =
  | { ok: true; mode: 'image'; data_url: string }
  | { ok: true; mode: 'text'; qr_text: string }
  | { ok: false; detail: string; status?: WaStatus };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function safeJson(text: string): any {
  try { return JSON.parse(text); } catch { return null; }
}

function formatNumber(raw?: string | null): string {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return `+${digits}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: WaStatus }) {
  const classes: Record<string, string> = {
    CONNECTED:     'bg-emerald-100 text-emerald-800 border-emerald-200',
    QR_READY:      'bg-amber-100 text-amber-800 border-amber-200',
    INITIALIZING:  'bg-blue-100 text-blue-800 border-blue-200',
    DISCONNECTED:  'bg-gray-100 text-gray-600 border-gray-200',
  };
  const labels: Record<string, string> = {
    CONNECTED:     '● Connected',
    QR_READY:      '◌ Waiting for QR scan',
    INITIALIZING:  '◌ Initializing…',
    DISCONNECTED:  '○ Disconnected',
  };
  const key = status || 'DISCONNECTED';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${classes[key] || classes.DISCONNECTED}`}>
      {labels[key] || 'Unknown'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────
export default function WhatsAppSenderPage() {
  const navigate = useNavigate();

  // Gateway status
  const [waStatus, setWaStatus]             = useState<WaStatus>(null);
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean>(true);
  const [statusError, setStatusError]       = useState<string | null>(null);
  const [statusLoading, setStatusLoading]   = useState(false);

  // QR
  const [qr, setQr]               = useState<QrResp | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);  // seconds until auto-refresh
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Disconnect / restart
  const [actionLoading, setActionLoading] = useState<'disconnect' | 'restart' | null>(null);
  const [actionMsg, setActionMsg]         = useState<string | null>(null);

  // Test send
  const [testTo, setTestTo]           = useState('');
  const [testMsg, setTestMsg]         = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult]   = useState<{ ok: boolean; detail: string } | null>(null);

  // ─── Fetch status ────────────────────────────────────────────────────────
  const loadStatus = useCallback(async (silent = false) => {
    if (!silent) setStatusLoading(true);
    setStatusError(null);
    try {
      const resp  = await fetchWithAuth('/api/accounts/settings/whatsapp/status/');
      const text  = await resp.text();
      const data  = safeJson(text) as StatusResp | null;
      if (!data) { setStatusError('Invalid response from server.'); return; }

      const gwConfigured = Boolean(data.gateway_base_url || data.ok);
      setGatewayConfigured(gwConfigured);

      // data.status may be a string (direct WaStatus) OR the full Node.js
      // JSON payload object — unwrap either form.
      let nodePayload: any = null;
      if (data.status && typeof data.status === 'object') {
        nodePayload = data.status as any;
      }
      const rawStatus =
        nodePayload?.status ??
        (typeof data.status === 'string' ? data.status : null) ??
        (data.ok ? 'DISCONNECTED' : 'DISCONNECTED');
      const newStatus = (rawStatus || 'DISCONNECTED') as WaStatus;
      setWaStatus(newStatus);
      setConnectedNumber(data.connected_number || nodePayload?.connected_number || null);
      if (!data.ok && data.detail) setStatusError(data.detail);
    } catch (e: any) {
      setStatusError(String(e?.message || 'Could not reach backend.'));
    } finally {
      if (!silent) setStatusLoading(false);
    }
  }, []);

  // ─── Fetch QR ────────────────────────────────────────────────────────────
  const loadQr = useCallback(async () => {
    setQrLoading(true);
    setQr(null);
    stopQrTimer();
    try {
      const resp = await fetchWithAuth('/api/accounts/settings/whatsapp/qr/');
      const text = await resp.text();
      const data = safeJson(text) as QrResp | null;
      setQr(data || { ok: false, detail: 'Invalid QR response.' });
      // Start countdown for auto-refresh (QR expires in ~20 s, refresh at 15 s)
      if (data?.ok) startQrCountdown(15);
    } catch (e: any) {
      setQr({ ok: false, detail: String(e?.message || 'Failed to load QR.') });
    } finally {
      setQrLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── QR countdown timer ──────────────────────────────────────────────────
  function stopQrTimer() {
    if (qrTimerRef.current) { clearInterval(qrTimerRef.current); qrTimerRef.current = null; }
    setQrCountdown(0);
  }

  function startQrCountdown(seconds: number) {
    stopQrTimer();
    setQrCountdown(seconds);
    let remaining = seconds;
    qrTimerRef.current = setInterval(() => {
      remaining -= 1;
      setQrCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(qrTimerRef.current!);
        qrTimerRef.current = null;
        // auto-refresh QR
        loadQr();
      }
    }, 1000);
  }

  // ─── Auto-poll status every 5 s ──────────────────────────────────────────
  useEffect(() => {
    loadStatus();
    const poller = setInterval(() => loadStatus(true), 5000);
    return () => {
      clearInterval(poller);
      stopQrTimer();
    };
  }, [loadStatus]);

  // When status switches to QR_READY, auto-fetch QR;
  // stop the countdown when authentication is in progress so we don't
  // accidentally overwrite the QR while WhatsApp is completing the handshake.
  useEffect(() => {
    if (waStatus === 'QR_READY' && !qr?.ok) {
      loadQr();
    }
    // Stop auto-refresh while auth handshake is in progress
    if (waStatus === 'INITIALIZING') {
      stopQrTimer();
    }
    // When connected or disconnected, clear QR
    if (waStatus === 'CONNECTED' || waStatus === 'DISCONNECTED') {
      setQr(null);
      stopQrTimer();
    }
  }, [waStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Connect (restart gateway client) ────────────────────────────────────
  const handleConnect = async () => {
    setActionLoading('restart');
    setActionMsg(null);
    try {
      const resp = await fetchWithAuth('/api/accounts/settings/whatsapp/restart/', { method: 'POST' });
      const text = await resp.text();
      const data = safeJson(text);
      setActionMsg(data?.detail || 'Restarting…');
      loadStatus();
    } catch (e: any) {
      setActionMsg(String(e?.message || 'Request failed.'));
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Clear session (wipe auth data + fresh QR) ───────────────────────────
  const handleClearSession = async () => {
    if (!window.confirm('This will wipe the WhatsApp session and generate a new QR code. Continue?')) return;
    setActionLoading('disconnect');
    setActionMsg(null);
    setQr(null);
    stopQrTimer();
    try {
      const resp = await fetchWithAuth('/api/accounts/settings/whatsapp/clear-session/', { method: 'POST' });
      const text = await resp.text();
      const data = safeJson(text);
      setActionMsg(data?.detail || 'Session cleared – generating new QR…');
      setTimeout(() => loadStatus(), 2000);
    } catch (e: any) {
      setActionMsg(String(e?.message || 'Request failed.'));
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Disconnect ───────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp? You will need to scan a QR again to reconnect.')) return;
    setActionLoading('disconnect');
    setActionMsg(null);
    try {
      const resp = await fetchWithAuth('/api/accounts/settings/whatsapp/disconnect/', { method: 'POST' });
      const text = await resp.text();
      const data = safeJson(text);
      setActionMsg(data?.detail || 'Disconnected.');
      loadStatus();
    } catch (e: any) {
      setActionMsg(String(e?.message || 'Request failed.'));
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Test send ────────────────────────────────────────────────────────────
  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTo.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const resp = await fetchWithAuth('/api/accounts/settings/whatsapp/send-test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim(), message: testMsg.trim() || undefined }),
      });
      const text = await resp.text();
      const data = safeJson(text);
      setTestResult({ ok: Boolean(data?.ok), detail: data?.detail || (data?.ok ? 'Sent!' : 'Failed.') });
    } catch (e: any) {
      setTestResult({ ok: false, detail: String(e?.message || 'Request failed.') });
    } finally {
      setTestSending(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────
  const isLoading  = waStatus === null || statusLoading;
  const isConnect  = waStatus === 'DISCONNECTED' || waStatus === null;
  const isInit     = waStatus === 'INITIALIZING';
  const isQrReady  = waStatus === 'QR_READY';
  const isConnected = waStatus === 'CONNECTED';

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-10 space-y-6 max-w-3xl mx-auto">

        {/* ── Header ── */}
        <div className="bg-white rounded-xl p-6 shadow-md flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">WhatsApp Sender Number</h1>
              <p className="text-gray-500 text-sm mt-1">
                Pair the IQAC WhatsApp account. All OTP and notification messages will be sent from this number.
              </p>
              <div className="mt-2">
                <StatusBadge status={waStatus} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => loadStatus()}
              disabled={statusLoading}
              title="Refresh status"
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </div>

        {/* ── Gateway not configured warning ── */}
        {!gatewayConfigured && waStatus !== null && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="font-semibold text-amber-900 flex items-center gap-2">
              <WifiOff className="w-5 h-5" />
              WhatsApp Gateway Not Configured
            </div>
            <p className="text-sm text-amber-800 mt-2 leading-relaxed">
              The gateway service is not set up. Start the Node.js server in{' '}
              <code className="bg-white px-1 py-0.5 rounded text-xs font-mono">whatsapp-server/</code> and
              add the required environment variables to{' '}
              <code className="bg-white px-1 py-0.5 rounded text-xs font-mono">backend/.env</code>.
            </p>
            <div className="mt-3 text-xs text-amber-700 space-y-0.5 font-mono bg-white rounded-lg p-3 border border-amber-100">
              <div>SMS_BACKEND=whatsapp</div>
              <div>OBE_WHATSAPP_API_URL=http://127.0.0.1:3000/send-whatsapp</div>
              <div>OBE_WHATSAPP_GATEWAY_BASE_URL=http://127.0.0.1:3000</div>
              <div>OBE_WHATSAPP_API_KEY=&lt;your-secret-key&gt;</div>
            </div>
          </div>
        )}

        {/* ── Main connection card ── */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">

          {/* Loading initial state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <span className="text-gray-500 text-sm">Checking gateway status…</span>
            </div>
          )}

          {/* CONNECTED state */}
          {!isLoading && isConnected && (
            <div className="p-6 sm:p-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                </div>
                <div>
                  <div className="text-xl font-semibold text-gray-900">WhatsApp Connected</div>
                  <div className="flex items-center justify-center gap-2 mt-2 text-gray-600">
                    <Phone className="w-4 h-4 text-emerald-500" />
                    <span className="text-lg font-mono font-medium">{formatNumber(connectedNumber)}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    All notifications and OTP messages will be sent from this number.
                  </p>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading === 'disconnect'}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-medium text-sm transition-colors disabled:opacity-60"
                >
                  {actionLoading === 'disconnect'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <XCircle className="w-4 h-4" />}
                  Disconnect
                </button>
              </div>

              {/* Test send form */}
              <div className="mt-8 border-t pt-6">
                <div className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                  <Send className="w-4 h-4 text-indigo-500" />
                  Send Test Message
                </div>
                <form onSubmit={handleTestSend} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone number <span className="text-gray-400 font-normal">(with country code, e.g. 919876543210)</span>
                    </label>
                    <input
                      type="tel"
                      value={testTo}
                      onChange={e => setTestTo(e.target.value)}
                      placeholder="919876543210"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message <span className="text-gray-400 font-normal">(optional – default test message used if blank)</span>
                    </label>
                    <textarea
                      value={testMsg}
                      onChange={e => setTestMsg(e.target.value)}
                      rows={2}
                      placeholder="Test message from IDCS…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={testSending || !testTo.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                  >
                    {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send
                  </button>
                  {testResult && (
                    <div className={`text-sm rounded-lg px-4 py-2.5 ${testResult.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                      {testResult.ok ? '✅ ' : '❌ '}{testResult.detail}
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* DISCONNECTED state */}
          {!isLoading && isConnect && (
            <div className="p-6 sm:p-8 flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <Smartphone className="w-9 h-9 text-gray-400" />
              </div>
              <div>
                <div className="text-xl font-semibold text-gray-800">Not Connected</div>
                <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
                  Connect your WhatsApp account so the platform can send OTP and notification messages to users.
                </p>
              </div>
              <button
                onClick={handleConnect}
                disabled={actionLoading === 'restart'}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-600 text-white font-semibold text-base hover:bg-green-700 shadow-md hover:shadow-lg transition-all disabled:opacity-60"
              >
                {actionLoading === 'restart'
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <MessageCircle className="w-5 h-5" />}
                Connect to WhatsApp
              </button>
              {actionMsg && (
                <p className="text-sm text-gray-600">{actionMsg}</p>
              )}
              {statusError && (
                <p className="text-sm text-red-600">{statusError}</p>
              )}
            </div>
          )}

          {/* INITIALIZING state */}
          {!isLoading && isInit && (
            <div className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <div>
                <div className="text-lg font-semibold text-gray-800">Connecting to WhatsApp…</div>
                <p className="text-sm text-gray-500 mt-1">
                  QR was scanned — finishing authentication. This may take up to 30 seconds.
                </p>
              </div>
              <p className="text-xs text-gray-400">Status updates automatically every 5 seconds.</p>
              <div className="mt-2 text-center">
                <p className="text-xs text-gray-400 mb-2">If this is stuck for more than 60 seconds:</p>
                <button
                  onClick={handleClearSession}
                  disabled={actionLoading === 'disconnect'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-medium hover:bg-red-100 disabled:opacity-60 transition-colors"
                >
                  {actionLoading === 'disconnect' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                  Clear session &amp; try again
                </button>
              </div>
            </div>
          )}

          {/* QR_READY state */}
          {!isLoading && isQrReady && (
            <div className="p-6 sm:p-8">
              <div className="flex flex-col items-center gap-4">
                <div className="text-lg font-semibold text-gray-800">Scan QR to Pair</div>
                <p className="text-sm text-gray-500 text-center max-w-xs">
                  Open WhatsApp → <span className="font-medium">⋯ → Linked devices → Link a device</span> and scan this QR code.
                </p>

                {/* QR display */}
                <div className="relative">
                  {qrLoading && (
                    <div className="w-64 h-64 flex items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    </div>
                  )}
                  {!qrLoading && qr?.ok && qr.mode === 'image' && (
                    <img
                      src={qr.data_url}
                      alt="WhatsApp QR Code"
                      className="w-64 h-64 object-contain rounded-xl border border-gray-200 shadow-sm bg-white"
                    />
                  )}
                  {!qrLoading && qr?.ok && qr.mode === 'text' && (
                    <div className="w-64 p-4 bg-gray-50 rounded-xl border text-xs font-mono break-all text-gray-600">
                      {qr.qr_text}
                    </div>
                  )}
                  {!qrLoading && qr && !qr.ok && (
                    <div className="w-64 h-40 flex flex-col items-center justify-center gap-2 bg-yellow-50 rounded-xl border border-yellow-200">
                      <WifiOff className="w-6 h-6 text-yellow-600" />
                      <p className="text-sm text-yellow-800 text-center px-4">
                        {(qr as any).detail || 'QR not available'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Auto-refresh countdown */}
                <div className="flex items-center gap-3">
                  {qrCountdown > 0 && (
                    <span className="text-xs text-gray-400">
                      Auto-refresh in {qrCountdown}s
                    </span>
                  )}
                  <button
                    onClick={loadQr}
                    disabled={qrLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3 h-3 ${qrLoading ? 'animate-spin' : ''}`} />
                    Refresh QR
                  </button>
                </div>

                {/* Cancel / Clear session */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handleClearSession}
                    disabled={actionLoading === 'disconnect'}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 disabled:opacity-60 transition-colors"
                  >
                    {actionLoading === 'disconnect' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Clear session &amp; get new QR
                  </button>
                  <p className="text-xs text-gray-400">Use this if scanning doesn't connect</p>
                </div>
              </div>
            </div>
          )}

          {/* Action message (shared) */}
          {!isLoading && (isConnected || isQrReady) && actionMsg && (
            <div className="px-6 pb-4">
              <p className="text-sm text-gray-600 text-center">{actionMsg}</p>
            </div>
          )}
        </div>

        {/* ── How it works ── */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-500" />
            How it works
          </div>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600">
            <li>Click <span className="font-medium text-gray-800">"Connect to WhatsApp"</span> — the gateway initializes and generates a QR code.</li>
            <li>Open WhatsApp on the <span className="font-medium text-gray-800">IQAC phone</span> → ⋯ (menu) → <span className="font-medium text-gray-800">Linked devices</span> → <span className="font-medium text-gray-800">Link a device</span>.</li>
            <li>Scan the QR code displayed here.</li>
            <li>The page will show <span className="font-medium text-emerald-700">Connected ●</span> with the paired number.</li>
            <li>All subsequent OTP and WhatsApp notifications will be sent from that number automatically.</li>
          </ol>
          <p className="text-xs text-gray-400 mt-4">
            The session persists across server restarts. The phone must have WhatsApp active (not logged out of linked devices).
          </p>
        </div>

      </div>
    </DashboardLayout>
  );
}
