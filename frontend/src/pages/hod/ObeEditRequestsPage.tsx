import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, Send } from 'lucide-react';
import {
  fetchHodPendingEditRequests,
  hodApproveEditRequest,
  hodRejectEditRequest,
  PendingEditRequestItem,
} from '../../services/obe';

export default function ObeEditRequestsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingEditRequestItem[]>([]);
  const [busyIds, setBusyIds] = useState<Record<number, boolean>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const pendingRes = await fetchHodPendingEditRequests();
      const pending = Array.isArray(pendingRes?.results) ? pendingRes.results : [];
      setPendingItems(pending);
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

  async function forwardToIqac(id: number) {
    setBusyIds((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      await hodApproveEditRequest(id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Forward failed');
    } finally {
      setBusyIds((p) => ({ ...p, [id]: false }));
    }
  }

  async function reject(id: number) {
    setBusyIds((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      await hodRejectEditRequest(id);
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
          <div style={{ fontSize: 24, fontWeight: 950, color: '#111827' }}>HOD: OBE Edit Requests</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Approve requests from your department before they go to IQAC</div>
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

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 950, color: '#111827' }}>Pending with HOD</div>
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
              const scopeLabel = item.scope === 'MARK_MANAGER' ? 'Mark Manager' : 'Mark Entry';

              return (
                <div
                  key={item.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    background: '#fff',
                    padding: 12,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
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
                      flex: '0 0 auto',
                    }}
                  >
                    {initials(staffLabel)}
                  </div>

                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontWeight: 900, color: '#111827' }}>{staffLabel}</div>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>
                      {item.subject_code} — <span style={{ color: '#2563eb', fontWeight: 800 }}>{item.subject_name || item.subject_code}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {scopeLabel} • {String(item.assessment || '').toUpperCase()} • {formatDate(item.requested_at)}
                    </div>
                    {item.reason ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#374151' }}>
                        <span style={{ fontWeight: 800 }}>Reason:</span> {String(item.reason)}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '0 0 auto' }}>
                    <div style={{ background: '#fef3c7', color: '#92400e', padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      Pending
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button className="obe-btn obe-btn-success" onClick={() => forwardToIqac(item.id)} disabled={busy}>
                        <Send size={16} style={{ marginRight: 6 }} />
                        {busy ? 'Forwarding…' : 'Forward to IQAC'}
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
    </div>
  );
}
