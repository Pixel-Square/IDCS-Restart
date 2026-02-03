import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';

type RecordItem = {
  id: number;
  date: string;
  period: { id?: number; index?: number; label?: string; start_time?: string; end_time?: string } | null;
  section: { id?: number; name?: string } | null;
  status: string;
  marked_at?: string;
  marked_by?: string | null;
};

export default function StudentAttendancePage() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // default to last 30 days
    const today = new Date();
    const ed = today.toISOString().slice(0, 10);
    const sd = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
    setStartDate(sd);
    setEndDate(ed);
  }, []);

  useEffect(() => {
    if (startDate && endDate) fetchRecords();
  }, [startDate, endDate]);

  async function fetchRecords() {
    setLoading(true);
    try {
      const q = `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetchWithAuth(`/api/academics/student/attendance/${q}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const j = await res.json();
      setRecords(j.results || []);
      setSummary(j.summary || null);
    } catch (e) {
      console.error(e);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ fontSize: 22, marginBottom: 8 }}>My Attendance</h2>

      <div style={{ marginBottom: 12 }}>
        <label>From: </label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <label style={{ marginLeft: 12 }}>To: </label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button onClick={fetchRecords} style={{ marginLeft: 12 }}>Refresh</button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div>
          {records.length === 0 ? (
            <div>No attendance records found for this range.</div>
          ) : (
            <div>
              {summary && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Overall attendance:</strong>{' '}
                  {summary.overall.percentage != null ? `${summary.overall.percentage.toFixed(1)}%` : 'N/A'}
                  {' '}({summary.overall.present}/{summary.overall.total_marked_periods} periods)
                </div>
              )}

              {summary && summary.by_subject && summary.by_subject.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Subject-wise:</strong>
                  <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
                    {summary.by_subject.map((s: any) => {
                      const pct = s.percentage != null ? s.percentage : 0;
                      const counts = s.counts || {};
                      return (
                        <div key={s.subject_key} style={{ border: '1px solid #eee', padding: 8, borderRadius: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 600 }}>{s.subject_display || s.subject_key}</div>
                            <div>{pct != null ? `${pct.toFixed(1)}%` : 'N/A'}</div>
                          </div>
                          <div style={{ height: 10, background: '#f0f0f0', borderRadius: 6, overflow: 'hidden', marginTop: 8 }}>
                            <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: '#4caf50' }} />
                          </div>
                          <div style={{ marginTop: 8, fontSize: 13 }}>
                            <strong>Counts:</strong>
                            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                              <div>P: {counts['P'] || 0}</div>
                              <div>A: {counts['A'] || 0}</div>
                              <div>LEAVE: {counts['LEAVE'] || 0}</div>
                              <div>OD: {counts['OD'] || 0}</div>
                              <div>LATE: {counts['LATE'] || 0}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 8 }}>Date</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Period</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Section</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Subject</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Marked By</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td style={{ padding: 8 }}>{r.date}</td>
                      <td style={{ padding: 8 }}>{r.period?.label || (r.period?.index ? `Period ${r.period.index}` : '')}</td>
                      <td style={{ padding: 8 }}>{r.section?.name}</td>
                      <td style={{ padding: 8 }}>{r.subject_display || '-'}</td>
                      <td style={{ padding: 8 }}>{r.status}</td>
                      <td style={{ padding: 8 }}>{r.marked_by || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
