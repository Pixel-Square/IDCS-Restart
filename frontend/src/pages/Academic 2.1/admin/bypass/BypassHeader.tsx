/**
 * BypassHeader — floating pinned header shown during admin bypass.
 * Left: "Admin Bypass" label + faculty name + session start time + elapsed timer.
 * Right: Message button, Reset Course button, Exit Bypass button.
 */
import React, { useEffect, useState } from 'react';
import { ShieldAlert, LogOut, RotateCcw, MessageCircle, X } from 'lucide-react';
import { useBypass } from './BypassContext';
import fetchWithAuth from '../../../../services/fetchAuth';

interface BypassHeaderProps {
  onExit: () => void;
  onResetCourse?: () => void;
  /** Faculty phone for WhatsApp (optional override) */
  facultyMobile?: string;
}

function useElapsed(startedAt: string | undefined) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ─── Message Popup ─── */
function MessagePopup({
  sessionId,
  facultyName,
  facultyMobile,
  onClose,
}: {
  sessionId: string;
  facultyName: string;
  facultyMobile: string;
  onClose: () => void;
}) {
  const { addLog } = useBypass();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetchWithAuth(
        `/api/academic-v2/admin/bypass/${sessionId}/send-message/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message.trim() }),
        },
      );
      if (res.ok) {
        setResult({ ok: true, text: 'Message sent successfully!' });
        await addLog('MESSAGE', `WhatsApp sent to ${facultyName}: ${message.slice(0, 80)}`);
      } else {
        const d = await res.json().catch(() => ({}));
        setResult({ ok: false, text: d.detail || 'Failed to send message.' });
      }
    } catch {
      setResult({ ok: false, text: 'Network error.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            WhatsApp Message
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          To: <strong>{facultyName}</strong>
        </p>
        {facultyMobile && (
          <p className="text-xs text-gray-400 mb-3">Mobile: {facultyMobile}</p>
        )}
        <textarea
          className="w-full border rounded-lg p-3 text-sm h-32 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
        />
        {result && (
          <p className={`text-sm mt-2 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
            {result.text}
          </p>
        )}
        <div className="flex gap-2 mt-4 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || !message.trim()}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Reset Confirm Popup ─── */
function ResetConfirmPopup({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <RotateCcw className="w-6 h-6 text-red-500" />
          <h2 className="text-lg font-semibold text-red-700">Confirm Reset</h2>
        </div>
        <p className="text-sm text-gray-700 mb-2">
          Are you sure you want to <strong>reset {label}</strong>?
        </p>
        <p className="text-xs text-red-500 mb-6">
          This will permanently delete all marks and revert publish status to DRAFT.
          This action cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Yes, Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── BypassHeader ─── */
export default function BypassHeader({ onExit, onResetCourse, facultyMobile }: BypassHeaderProps) {
  const { session } = useBypass();
  const elapsed = useElapsed(session?.started_at);
  const [showMessage, setShowMessage] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!session) return null;

  const startTime = session.started_at
    ? new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleResetConfirmed = () => {
    setShowResetConfirm(false);
    onResetCourse?.();
  };

  return (
    <>
      {/* Pinned floating header */}
      <div
        className="fixed top-0 left-0 right-0 z-[1000] bg-amber-900 text-white shadow-lg"
        style={{ paddingLeft: '1rem', paddingRight: '1rem' }}
      >
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between h-12">
          {/* Left: badge + info */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-amber-700 rounded-full px-3 py-1 text-sm font-semibold">
              <ShieldAlert className="w-4 h-4" />
              Admin Bypass
            </div>
            <span className="text-amber-200 text-sm hidden sm:block">
              {session.faculty_name} — {session.course_code} {session.section_name}
            </span>
            <span className="text-amber-300 text-xs hidden md:block">
              Since {startTime}
            </span>
            <span className="bg-amber-700 rounded px-2 py-0.5 text-xs font-mono">
              {elapsed}
            </span>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2">
            {/* WhatsApp Message */}
            <button
              onClick={() => setShowMessage(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 rounded-lg transition"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Message
            </button>

            {/* Reset Course */}
            {onResetCourse && (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 rounded-lg transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Course
              </button>
            )}

            {/* Exit Bypass */}
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white text-amber-900 hover:bg-amber-50 rounded-lg font-medium transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Exit Bypass
            </button>
          </div>
        </div>
      </div>

      {/* Spacer so content doesn't hide under fixed header */}
      <div className="h-12" />

      {/* Popups */}
      {showMessage && (
        <MessagePopup
          sessionId={session.session_id}
          facultyName={session.faculty_name}
          facultyMobile={facultyMobile || ''}
          onClose={() => setShowMessage(false)}
        />
      )}

      {showResetConfirm && (
        <ResetConfirmPopup
          label={`all exams in ${session.course_code} ${session.section_name}`}
          onConfirm={handleResetConfirmed}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </>
  );
}
