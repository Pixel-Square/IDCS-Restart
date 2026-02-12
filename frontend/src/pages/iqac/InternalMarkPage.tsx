import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchInternalMarkMapping, upsertInternalMarkMapping } from '../../services/obe';

export default function InternalMarkPage(): JSX.Element {
  const { courseCode, taId } = useParams<{ courseCode: string; taId: string }>();
  const subjectId = String(courseCode || '');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchInternalMarkMapping(subjectId);
        if (!mounted) return;
        setMapping(res?.mapping ?? null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [subjectId]);

  const ensureDefault = () => {
    if (mapping) return mapping;
    const defaults = {
      header: ['CO1','CO2','CO3','CO3','CO3','CO4','CO4','CO4','CO1','CO2','CO3','CO4','CO5'],
      weights: [7.0,7.0,1.5,3.0,2.5,1.5,3.0,2.5,2.0,2.0,2.0,2.0,4.0],
      cycles: ['cycle 1','cycle 1','ssa','cia','fa','ssa','cia','fa','ME','ME','ME','ME','ME'],
    };
    setMapping(defaults);
    return defaults;
  };

  const handleCellChange = (idx: number, value: string) => {
    const num = value === '' ? '' : Number(value);
    setMapping((m) => {
      const copy: any = { ...(m || ensureDefault()) };
      const w = Array.isArray(copy.weights) ? [...copy.weights] : [];
      w[idx] = num;
      copy.weights = w;
      return copy;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = mapping ?? ensureDefault();
      await upsertInternalMarkMapping(subjectId, payload);
      // notify other parts of app
      try { window.dispatchEvent(new CustomEvent('internal-mark:updated', { detail: { subjectId } })); } catch {}
      navigate(-1);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 18 }}>Loading…</div>;

  const m = mapping ?? ensureDefault();
  const headers: string[] = Array.isArray(m.header) ? m.header : [];
  const weightsArr: any[] = Array.isArray(m.weights) ? m.weights : [];
  const cycles: string[] = Array.isArray(m.cycles) ? m.cycles : [];

  return (
    <main style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Internal Mark Mapping - {subjectId}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="obe-btn" onClick={() => navigate(-1)}>Back</button>
          <button className="obe-btn obe-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{ border: '1px solid #d1d5db', padding: 8, background: '#f3f4f6' }}>{h}</th>
              ))}
            </tr>
            <tr>
              {cycles.map((c, i) => (
                <th key={`cy-${i}`} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb', fontWeight: 600 }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {weightsArr.map((w, i) => (
                <td key={i} style={{ border: '1px solid #e5e7eb', padding: 6, background: '#f3f4f6' }}>
                  <input type="number" step="0.1" value={w === '' ? '' : String(w)} onChange={(e) => handleCellChange(i, e.target.value)} style={{ width: 70, padding: 6 }} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {error ? <div style={{ color: 'red', marginTop: 12 }}>{error}</div> : null}
    </main>
  );
}
