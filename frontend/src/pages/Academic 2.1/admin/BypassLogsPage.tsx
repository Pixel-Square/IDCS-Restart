/**
 * BypassLogsPage — shows all bypass sessions and their audit logs.
 * Shared bypass sessions are highlighted.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ShieldAlert, Clock, RotateCcw, MessageCircle,
  Link2, LogIn, LogOut, Edit, CheckCircle, AlertTriangle,
  Copy, Check, QrCode, X,
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface BypassLog {
  id: string;
  action: string;
  description: string;
  extra: Record<string, unknown>;
  created_at: string;
  actor: { id: number; name: string } | null;
}

interface BypassSession {
  id: string;
  admin: { id: number; name: string };
  faculty: { id: number; name: string } | null;
  teaching_assignment_id: number | null;
  course_code: string;
  course_name: string;
  section_name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  share_token: string | null;
  share_expires_at: string | null;
  share_max_uses: number;
  share_use_count: number;
  shared_by: { id: number; name: string } | null;
  shared_accessed_by: { id: number; name: string } | null;
  logs: BypassLog[];
}

/** Small QR popup */
function QRPopup({ url, onClose }: { url: string; onClose: () => void }) {
  const encoded = encodeURIComponent(url);
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-5 flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-blue-600" /> Bypass Share Link QR
          </span>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=220x220&margin=2`}
          alt="QR Code"
          className="w-56 h-56 border rounded-lg"
        />
        <p className="text-xs text-gray-500 break-all max-w-xs text-center">{url}</p>
      </div>
    </div>
  );
}

/** Copy + QR buttons for share log entries */
function ShareLinkActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <>
      {showQr && <QRPopup url={url} onClose={() => setShowQr(false)} />}
      <div className="flex items-center gap-1 ml-1">
        <button
          onClick={copy}
          title="Copy link"
          className="p-1 hover:bg-blue-100 rounded text-blue-600 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => setShowQr(true)}
          title="Show QR code"
          className="p-1 hover:bg-blue-100 rounded text-blue-600 transition-colors"
        >
          <QrCode className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  ENTER: <LogIn className="w-3.5 h-3.5 text-blue-500" />,
  EXIT: <LogOut className="w-3.5 h-3.5 text-gray-500" />,
  RESET_COURSE: <RotateCcw className="w-3.5 h-3.5 text-red-500" />,
  RESET_EXAM: <RotateCcw className="w-3.5 h-3.5 text-orange-500" />,
  MESSAGE: <MessageCircle className="w-3.5 h-3.5 text-green-500" />,
  MARK_EDIT: <Edit className="w-3.5 h-3.5 text-yellow-600" />,
  PUBLISH: <CheckCircle className="w-3.5 h-3.5 text-green-600" />,
  UNPUBLISH: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
  SHARE: <Link2 className="w-3.5 h-3.5 text-blue-600" />,
  SHARE_ACCESSED: <LogIn className="w-3.5 h-3.5 text-purple-500" />,
};

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function SessionCard({ session }: { session: BypassSession }) {
  const [open, setOpen] = useState(false);
  const isShared = !!session.share_token;
  const wasAccessed = !!session.shared_accessed_by;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isShared ? 'border-blue-300' : ''}`}>
      {/* Session header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left p-4 hover:bg-gray-50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  {session.course_code} — {session.section_name}
                </span>
                {isShared && (
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                    wasAccessed ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    <Link2 className="w-3 h-3 inline mr-0.5" />
                    {wasAccessed ? `Link used by ${session.shared_accessed_by!.name}` : 'Shared Link'}
                  </span>
                )}
                {isShared && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-medium">
                    {session.share_use_count}/{session.share_max_uses} uses
                  </span>
                )}
                {!session.ended_at && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Faculty: {session.faculty?.name || '—'} · 
                Admin: {session.admin.name} · 
                {new Date(session.started_at).toLocaleString()}
                {session.ended_at && <> · Duration: {formatDuration(session.duration_seconds)}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{session.logs.length} events</span>
            <span className="text-gray-400">{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {/* Logs */}
      {open && (
        <div className="border-t bg-gray-50 divide-y">
          {session.logs.length === 0 ? (
            <p className="text-xs text-gray-500 p-4">No log entries.</p>
          ) : session.logs.map((log) => (
            <div
              key={log.id}
              className={`px-5 py-2.5 flex items-start gap-3 ${
                log.action === 'SHARE' || log.action === 'SHARE_ACCESSED'
                  ? 'bg-blue-50'
                  : log.action.startsWith('RESET')
                  ? 'bg-red-50'
                  : ''
              }`}
            >
              <div className="mt-0.5">{ACTION_ICONS[log.action] || <Clock className="w-3.5 h-3.5 text-gray-400" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <p className="text-xs font-medium text-gray-800">{log.description}</p>
                  {(log.action === 'SHARE' || log.action === 'SHARE_ACCESSED') &&
                    (log.extra?.share_url as string) && (
                      <ShareLinkActions url={log.extra.share_url as string} />
                  )}
                </div>
                {log.actor && (
                  <p className="text-xs text-gray-400">{log.actor.name}</p>
                )}
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BypassLogsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<BypassSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/api/academic-v2/admin/bypass/sessions/')
      .then((r) => r.json())
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/academic-v2/admin/course-manager')}
            className="p-2 hover:bg-gray-200 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-amber-600" />
              Bypass Logs
            </h1>
            <p className="text-sm text-gray-500">All admin bypass sessions and their audit trail</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p>No bypass sessions yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => <SessionCard key={s.id} session={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
