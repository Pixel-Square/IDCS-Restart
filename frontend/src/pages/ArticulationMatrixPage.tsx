import React, { useEffect, useState } from 'react';
import ArticulationMatrix from '../components/ArticulationMatrix';
import { fetchArticulationMatrix } from '../services/cdapDb';

type Props = { courseId?: string };

export default function ArticulationMatrixPage({ courseId }: Props) {
  const [subject, setSubject] = useState<string>(courseId || '');
  const [matrix, setMatrix] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!subject) return;
    // Auto-load matrix from backend (computed from saved CDAP revision)
    (async () => {
      setStatus('loading');
      setMessage(null);
      try {
        const data = await fetchArticulationMatrix(subject);
        setMatrix(data);
        setStatus('success');
      } catch (e: any) {
        setMatrix(null);
        setStatus('error');
        setMessage(e?.message || 'Articulation Matrix fetch failed.');
      }
    })();
  }, [subject]);

  async function refresh() {
    if (!subject) return;
    setStatus('loading');
    setMessage(null);
    try {
      const data = await fetchArticulationMatrix(subject);
      setMatrix(data);
      setStatus('success');
      const unitCount = Array.isArray(data?.units) ? data.units.length : 0;
      setMessage(`Loaded articulation matrix from saved CDAP. Units: ${unitCount}.`);
    } catch (e: any) {
      setStatus('error');
      setMessage(e?.message || 'Articulation Matrix fetch failed.');
    }
  }

  return (
    <div>
      <h2>Articulation Matrix - {subject || 'No course selected'}</h2>
      {!courseId && (
        <div style={{ marginBottom: 12 }}>
          <label>Course ID: </label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter course id" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={refresh} disabled={status === 'loading' || !subject}>
          {status === 'loading' ? 'Loading...' : 'Refresh'}
        </button>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          Uses saved CDAP ticks + hours (no upload).
        </span>
      </div>

      {message && (
        <div style={{ marginBottom: 12, fontSize: 12, color: status === 'error' ? '#b91c1c' : '#166534' }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <ArticulationMatrix subjectId={subject} matrix={matrix} />
      </div>
    </div>
  );
}
