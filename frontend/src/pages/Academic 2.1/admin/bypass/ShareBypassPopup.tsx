/**
 * ShareBypassPopup — allows admin to generate a time-limited shared bypass link + QR code.
 */
import React, { useState } from 'react';
import { X, Link2, QrCode, Copy, Check } from 'lucide-react';
import fetchWithAuth from '../../../../services/fetchAuth';
import { useBypass } from './BypassContext';

// QR code rendered via a simple SVG-based approach (no library needed — uses a free QR API)
function QRImage({ value }: { value: string }) {
  const encoded = encodeURIComponent(value);
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=200x200&margin=2`}
      alt="QR Code"
      className="w-48 h-48 border rounded-lg"
    />
  );
}

export default function ShareBypassPopup({ onClose }: { onClose: () => void }) {
  const { session, addLog } = useBypass();
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  });
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  const generate = async () => {
    setLoading(true);
    setError('');
    setShareUrl('');
    try {
      const res = await fetchWithAuth(
        `/api/academic-v2/admin/bypass/${session.session_id}/share/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expires_at: new Date(expiresAt).toISOString() }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Failed to generate link.');
        return;
      }
      setShareUrl(data.share_url);
      setToken(data.share_token);
      await addLog('SHARE', `Bypass link generated. Expires: ${expiresAt}`);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-600" />
            Share Bypass Link
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Generate a time-limited link that allows an authorised user to access the bypass
          for <strong>{session.course_code} — {session.section_name}</strong> without
          further admin interaction. They must log in first.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Expires at
          </label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {!shareUrl ? (
          <button
            onClick={generate}
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Generating...' : 'Generate Link & QR'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 border rounded-lg px-3 py-2 text-xs bg-gray-50 text-gray-700"
              />
              <button
                onClick={copy}
                className="p-2 border rounded-lg hover:bg-gray-50"
                title="Copy link"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex flex-col items-center gap-2">
              <QRImage value={shareUrl} />
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <QrCode className="w-3 h-3" />
                Scan to access bypass
              </p>
            </div>
            <button
              onClick={generate}
              className="w-full py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
