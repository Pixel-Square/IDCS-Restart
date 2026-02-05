import React, { useEffect, useState } from 'react';

import {
  approvePublishRequest,
  fetchPendingPublishRequests,
  PendingPublishRequestItem,
  rejectPublishRequest,
} from '../services/obe';

export default function OBERequestsPage(): JSX.Element {
  const [items, setItems] = useState<PendingPublishRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState(120);

  const reload = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const resp = await fetchPendingPublishRequests();
      setItems(resp.results || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const doApprove = async (id: number) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await approvePublishRequest(id, windowMinutes);
      setMessage('Approved. Staff can publish within the window.');
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Approve failed');
      setLoading(false);
    }
  };

  const doReject = async (id: number) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await rejectPublishRequest(id);
      setMessage('Rejected.');
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Reject failed');
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
      <div style={{ padding: 18 }}>
        <div className="welcome" style={{ marginBottom: 14 }}>
          <div className="welcome-left">
            <div>
              <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>OBE Requests</h2>
              <div className="welcome-sub">Approve/Reject staff publish requests after due time is over.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#374151', fontWeight: 700 }}>
              Approval Window (minutes)
              <input
                type="number"
                min={10}
                max={1440}
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(Number(e.target.value || 120))}
                style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 10, border: '1px solid #e5e7eb', width: 120 }}
              />
            </label>
            <button className="obe-btn" onClick={reload} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ background: '#ecfdf5', border: '1px solid #10b98133', color: '#065f46', padding: 10, borderRadius: 10, marginBottom: 10 }}>
            {message}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div style={{ color: '#6b7280', padding: 10 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ color: '#6b7280', padding: 10 }}>No pending requests.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>
            {items.map((it) => (
              <div key={it.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{it.staff?.name || it.staff?.username || '—'}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{it.staff?.username || '—'}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{it.requested_at ? new Date(it.requested_at).toLocaleString() : '—'}</div>
                </div>

                <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 13 }}>
                  <div><b>Assessment:</b> {String(it.assessment || '').toUpperCase()}</div>
                  <div><b>Course:</b> {it.subject_code} {it.subject_name ? `— ${it.subject_name}` : ''}</div>
                  <div><b>Academic Year:</b> {it.academic_year?.name || '—'}</div>
                  <div><b>Reason:</b></div>
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, whiteSpace: 'pre-wrap' }}>{it.reason || '—'}</div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="obe-btn" disabled={loading} onClick={() => doReject(it.id)} style={{ borderColor: '#ef4444', color: '#991b1b' }}>Reject</button>
                  <button className="obe-btn obe-btn-primary" disabled={loading} onClick={() => doApprove(it.id)}>Approve</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
