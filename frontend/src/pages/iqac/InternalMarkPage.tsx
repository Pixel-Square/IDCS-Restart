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

  const DEFAULTS = {
    header: ['CO1', 'CO1', 'CO1', 'CO2', 'CO2', 'CO2', 'CO3', 'CO3', 'CO3', 'CO4', 'CO4', 'CO4', 'CO1', 'CO2', 'CO3', 'CO4', 'CO5'],
    weights: [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0],
    cycles: ['ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ssa', 'cia', 'fa', 'ME', 'ME', 'ME', 'ME', 'ME'],
  };

  const splitCycleWeight = (total: unknown): [number, number, number] => {
    const t = Number(total);
    if (!Number.isFinite(t) || t <= 0) return [0, 0, 0];
    const ssaW = 1.5;
    const ciaW = 3.0;
    const faW = 2.5;
    const sum = ssaW + ciaW + faW;
    const a = Math.round(((t * ssaW) / sum) * 100) / 100;
    const b = Math.round(((t * ciaW) / sum) * 100) / 100;
    const c = Math.round(((t * faW) / sum) * 100) / 100;
    return [a, b, c];
  };

  const normalizeMapping = (m: any): Record<string, any> => {
    const raw = m && typeof m === 'object' ? m : {};
    let weights: any[] = Array.isArray((raw as any).weights) ? [...(raw as any).weights] : [];
    weights = weights.map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    });

    // Backward compatibility: old mapping had 13 weights with CO1/CO2 as single "cycle 1" columns.
    if (weights.length === 13) {
      const [co1Ssa, co1Cia, co1Fa] = splitCycleWeight(weights[0] ?? 0);
      const [co2Ssa, co2Cia, co2Fa] = splitCycleWeight(weights[1] ?? 0);
      weights = [co1Ssa, co1Cia, co1Fa, co2Ssa, co2Cia, co2Fa, ...weights.slice(2)];
    }

    while (weights.length < DEFAULTS.weights.length) weights.push(DEFAULTS.weights[weights.length] ?? 0);
    weights = weights.slice(0, DEFAULTS.weights.length);

    return {
      ...raw,
      header: DEFAULTS.header,
      cycles: DEFAULTS.cycles,
      weights,
    };
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchInternalMarkMapping(subjectId);
        if (!mounted) return;
        setMapping(res?.mapping ? normalizeMapping(res.mapping) : null);
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
    if (mapping) return normalizeMapping(mapping);
    setMapping(DEFAULTS);
    return DEFAULTS;
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
      const payload = normalizeMapping(mapping ?? ensureDefault());
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

  const m = normalizeMapping(mapping ?? ensureDefault());
  const headers: string[] = m.header;
  const weightsArr: any[] = m.weights;
  const cycles: string[] = m.cycles;

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
