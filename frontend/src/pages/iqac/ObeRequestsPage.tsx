import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import {
  approveEditRequest,
  EditRequestHistoryItem,
  fetchEditRequestsHistory,
  fetchPendingEditRequests,
  PendingEditRequestItem,
  rejectEditRequest,
} from '../../services/obe';

export default function ObeRequestsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingEditRequestItem[]>([]);
  const [historyItems, setHistoryItems] = useState<EditRequestHistoryItem[]>([]);
  const [minutesById, setMinutesById] = useState<Record<number, number>>({});
  const [busyIds, setBusyIds] = useState<Record<number, boolean>>({});

  const [detail, setDetail] = useState<null | { kind: 'pending' | 'history'; item: PendingEditRequestItem | EditRequestHistoryItem }>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, historyRes] = await Promise.all([
        fetchPendingEditRequests(),
        fetchEditRequestsHistory({ statuses: ['APPROVED', 'REJECTED'], limit: 200 }),
      ]);

      const pending = Array.isArray(pendingRes?.results) ? pendingRes.results : [];
      const history = Array.isArray(historyRes?.results) ? historyRes.results : [];

      setPendingItems(pending);
      setHistoryItems(history);
      setMinutesById((p) => {
        const next = { ...p };
        for (const it of pending) {
          if (next[it.id] == null) next[it.id] = 120;
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sortedPending = useMemo(() => {
    return [...pendingItems].sort((a, b) => String(b.requested_at || '').localeCompare(String(a.requested_at || '')));
  }, [pendingItems]);

  const sortedHistory = useMemo(() => {
    return [...historyItems].sort((a, b) => String((b.reviewed_at || b.requested_at || '')).localeCompare(String((a.reviewed_at || a.requested_at || ''))));
  }, [historyItems]);

  function initials(nameOrUsername: string) {
    const raw = String(nameOrUsername || '').trim();
    if (!raw) return '?';
    const parts = raw.split(/\s+/g).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatDate(v: string | null | undefined) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  }

  async function approve(id: number) {
    const minutes = Number(minutesById[id] ?? 120);
    setBusyIds((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      await approveEditRequest(id, Number.isFinite(minutes) ? minutes : 120);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Approve failed');
    } finally {
      setBusyIds((p) => ({ ...p, [id]: false }));
    }
  }

  async function reject(id: number) {
    setBusyIds((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      await rejectEditRequest(id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Reject failed');
    } finally {
      setBusyIds((p) => ({ ...p, [id]: false }));
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <Clock size={24} color="#9a3412" />
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, color: '#111827' }}>OBE Edit Requests</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Manage pending requests for Mark Entry and Mark Manager edits from faculty</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="obe-btn obe-btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 12, borderRadius: 12, marginBottom: 20 }}>
          <XCircle size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 18 }}>
        {/* Answered Now (Pending) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 950, color: '#111827' }}>Answered Now</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>({sortedPending.length})</div>
          </div>

          {sortedPending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 22, color: '#6b7280', border: '1px dashed #e5e7eb', borderRadius: 14, background: '#fff' }}>
              <CheckCircle size={34} color="#10b981" style={{ marginBottom: 8 }} />
              <div>No pending requests</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {sortedPending.map((item) => {
                const busy = Boolean(busyIds[item.id]);
                const staffLabel = String(item.staff?.name || item.staff?.username || 'Unknown');
                const dept = (item.staff as any)?.department as string | null | undefined;
                return (
                  <div
                    key={item.id}
                    onClick={() => setDetail({ kind: 'pending', item })}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 14,
                      background: '#fff',
                      padding: 12,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 999,
                        background: '#fff7ed',
                        border: '1px solid #fed7aa',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 950,
                        color: '#9a3412',
                      }}
                    >
                      {initials(staffLabel)}
                    </div>

                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 900, color: '#111827' }}>{staffLabel}</div>
                        {dept ? <div style={{ fontSize: 12, color: '#6b7280' }}>• {dept}</div> : null}
                      </div>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>
                        {item.subject_code} — <span style={{ color: '#2563eb', fontWeight: 800 }}>{item.subject_name || item.subject_code}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        Mark Manager • {item.assessment.toUpperCase()} • {formatDate(item.requested_at)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ background: '#fef3c7', color: '#92400e', padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
                        <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Pending
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          value={minutesById[item.id] ?? 120}
                          onChange={(e) => setMinutesById((p) => ({ ...p, [item.id]: Number(e.target.value) }))}
                          min={1}
                          max={1440}
                          style={{ width: 82, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 10 }}
                          disabled={busy}
                          title="Window minutes"
                        />
                        <button className="obe-btn obe-btn-success" onClick={() => approve(item.id)} disabled={busy}>
                          {busy ? 'Approving…' : 'Approve'}
                        </button>
                        <button className="obe-btn obe-btn-danger" onClick={() => reject(item.id)} disabled={busy}>
                          {busy ? 'Rejecting…' : 'Reject'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 950, color: '#111827' }}>History</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>({sortedHistory.length})</div>
          </div>

          {sortedHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 22, color: '#6b7280', border: '1px dashed #e5e7eb', borderRadius: 14, background: '#fff' }}>
              <div>No reviewed requests yet</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {sortedHistory.map((item) => {
                const staffLabel = String(item.staff?.name || item.staff?.username || 'Unknown');
                const dept = (item.staff as any)?.department as string | null | undefined;
                const isApproved = item.status === 'APPROVED';
                const badgeBg = isApproved ? '#ecfdf5' : '#fef2f2';
                const badgeFg = isApproved ? '#065f46' : '#991b1b';
                const badgeBorder = isApproved ? '#10b98133' : '#ef444433';
                return (
                  <div
                    key={item.id}
                    onClick={() => setDetail({ kind: 'history', item })}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 14,
                      background: '#fff',
                      padding: 12,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 999,
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 950,
                        color: '#111827',
                      }}
                    >
                      {initials(staffLabel)}
                    </div>

                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 900, color: '#111827' }}>{staffLabel}</div>
                        {dept ? <div style={{ fontSize: 12, color: '#6b7280' }}>• {dept}</div> : null}
                      </div>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>
                              {item.subject_code} — <span style={{ color: '#2563eb', fontWeight: 800 }}>{item.subject_name || item.subject_code}</span>
                            </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        Mark Manager • {item.assessment.toUpperCase()} • Reviewed {formatDate(item.reviewed_at)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ background: badgeBg, color: badgeFg, border: `1px solid ${badgeBorder}`, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>
                        {isApproved ? 'Approved' : 'Rejected'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {detail ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60 }}
          onClick={() => setDetail(null)}
        >
          <div
            style={{ width: 'min(760px, 96vw)', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 950, color: '#111827' }}>Request Details</div>
              <div style={{ marginLeft: 'auto' }}>
                <button className="obe-btn" onClick={() => setDetail(null)}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#f9fafb' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, columnGap: 10, fontSize: 13 }}>
                <div style={{ color: '#6b7280', fontWeight: 800 }}>Status</div>
                <div style={{ color: '#111827', fontWeight: 900 }}>{(detail.item as any).status}</div>

                <div style={{ color: '#6b7280', fontWeight: 800 }}>Staff</div>
                <div style={{ color: '#111827', fontWeight: 900 }}>
                  {String(detail.item.staff?.name || detail.item.staff?.username || 'Unknown')}
                  {(detail.item.staff as any)?.department ? <span style={{ color: '#6b7280', fontWeight: 700 }}> • {(detail.item.staff as any).department}</span> : null}
                </div>

                <div style={{ color: '#6b7280', fontWeight: 800 }}>Subject</div>
                <div style={{ color: '#111827' }}>
                  <span style={{ fontWeight: 900 }}>{detail.item.subject_code}</span> — <span style={{ color: '#2563eb', fontWeight: 800 }}>{detail.item.subject_name || detail.item.subject_code}</span>
                </div>

                <div style={{ color: '#6b7280', fontWeight: 800 }}>Assessment</div>
                <div style={{ color: '#111827', fontWeight: 900 }}>{detail.item.assessment.toUpperCase()}</div>

                <div style={{ color: '#6b7280', fontWeight: 800 }}>Requested At</div>
                <div style={{ color: '#111827' }}>{formatDate(detail.item.requested_at)}</div>

                <div style={{ color: '#6b7280', fontWeight: 800 }}>Reason</div>
                <div style={{ color: '#111827', whiteSpace: 'pre-wrap' }}>{detail.item.reason || '—'}</div>

                {'reviewed_at' in (detail.item as any) ? (
                  <>
                    <div style={{ color: '#6b7280', fontWeight: 800 }}>Reviewed At</div>
                    <div style={{ color: '#111827' }}>{formatDate((detail.item as any).reviewed_at)}</div>

                    <div style={{ color: '#6b7280', fontWeight: 800 }}>Reviewed By</div>
                    <div style={{ color: '#111827' }}>{String((detail.item as any).reviewed_by?.name || (detail.item as any).reviewed_by?.username || '—')}</div>

                    <div style={{ color: '#6b7280', fontWeight: 800 }}>Approved Until</div>
                    <div style={{ color: '#111827' }}>{formatDate((detail.item as any).approved_until)}</div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
