import React, { useState, useEffect } from 'react';
import CLASS_TYPES from '../../constants/classTypes';
import { normalizeClassType } from '../../constants/classTypes';
import { lsGet, lsSet } from '../../utils/localStorage';

const DEFAULT_INTERNAL_MARK_WEIGHTS = [7.0, 7.0, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0];

const INTERNAL_MARK_LABELS: string[] = [
  'C1-CO1',
  'C1-CO2',
  'CO3-SSA',
  'CO3-CIA',
  'CO3-FA',
  'CO4-SSA',
  'CO4-CIA',
  'CO4-FA',
  'ME-CO1',
  'ME-CO2',
  'ME-CO3',
  'ME-CO4',
  'ME-CO5',
];

type WeightsRow = {
  ssa1: number | string;
  cia1: number | string;
  formative1: number | string;
  internal_mark_weights: Array<number | string>;
};

export default function AcademicControllerWeightsPage() {
  const [weights, setWeights] = useState<Record<string, WeightsRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      const buildDefaults = (): Record<string, WeightsRow> => {
        const out: Record<string, WeightsRow> = {};
        for (const ct of CLASS_TYPES) {
          const k = normalizeClassType(String(ct));
          out[k] = {
            ssa1: k === 'TCPR' ? 2 : k === 'TCPL' || k === 'LAB' ? 1 : 1.5,
            cia1: k === 'TCPR' ? 2.5 : k === 'TCPL' ? 2 : k === 'LAB' ? 1 : 3,
            formative1: k === 'TCPR' ? 2 : k === 'TCPL' ? 3 : k === 'LAB' ? 1 : 2.5,
            internal_mark_weights: [...DEFAULT_INTERNAL_MARK_WEIGHTS],
          };
        }
        return out;
      };

      const applyAny = (src: any) => {
        const defaults = buildDefaults();
        if (!src || typeof src !== 'object') return defaults;
        const out: Record<string, WeightsRow> = { ...defaults };
        for (const ct of CLASS_TYPES) {
          const k = normalizeClassType(String(ct));
          const w = src[k] ?? src[String(ct)] ?? src[k.toUpperCase()] ?? null;
          if (!w || typeof w !== 'object') continue;
          const im = Array.isArray((w as any).internal_mark_weights) ? (w as any).internal_mark_weights : null;
          out[k] = {
            ssa1: (w as any).ssa1 ?? out[k].ssa1,
            cia1: (w as any).cia1 ?? out[k].cia1,
            formative1: (w as any).formative1 ?? out[k].formative1,
            internal_mark_weights: (im && im.length ? im : out[k].internal_mark_weights).slice(0, INTERNAL_MARK_LABELS.length),
          };
          while (out[k].internal_mark_weights.length < INTERNAL_MARK_LABELS.length) out[k].internal_mark_weights.push('');
        }
        return out;
      };

      // Prefer server; fallback localStorage; else defaults
      try {
        const svc = await import('../../services/obe');
        const remote = await svc.fetchClassTypeWeights();
        setWeights(applyAny(remote));
        return;
      } catch {
        // ignore
      }

      try {
        const saved = lsGet<any>('iqac_class_type_weights');
        setWeights(applyAny(saved));
      } catch {
        setWeights(buildDefaults());
      } finally {
        setLoading(false);
      }
    })().finally(() => setLoading(false));
  }, []);

  const handleChange = (classType: string, field: string, value: string) => {
    setWeights((prev: any) => ({
      ...prev,
      [classType]: {
        ...prev[classType],
        [field]: value,
      },
    }));
  };

  const handleInternalWeightChange = (classType: string, index: number, value: string) => {
    setWeights((prev) => {
      const row = prev[classType] || ({ ssa1: '', cia1: '', formative1: '', internal_mark_weights: [...DEFAULT_INTERNAL_MARK_WEIGHTS] } as WeightsRow);
      const next = Array.isArray(row.internal_mark_weights) ? [...row.internal_mark_weights] : [...DEFAULT_INTERNAL_MARK_WEIGHTS];
      while (next.length < INTERNAL_MARK_LABELS.length) next.push('');
      next[index] = value;
      return {
        ...prev,
        [classType]: {
          ...row,
          internal_mark_weights: next,
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // normalize keys to use the canonical form (uppercase)
      const normalized: Record<string, any> = {};
      for (const ct of CLASS_TYPES) {
        const k = normalizeClassType(String(ct));
        const w = weights[k] ?? weights[String(ct)] ?? weights[k.toUpperCase()] ?? {};
        normalized[k] = {
          ssa1: Number(w?.ssa1) || 0,
          cia1: Number(w?.cia1) || 0,
          formative1: Number(w?.formative1) || 0,
          internal_mark_weights: (Array.isArray(w?.internal_mark_weights) ? w.internal_mark_weights : DEFAULT_INTERNAL_MARK_WEIGHTS).map((x: any, i: number) => {
            const v = Number(x);
            return Number.isFinite(v) ? v : (DEFAULT_INTERNAL_MARK_WEIGHTS[i] ?? 0);
          }),
        };
      }

      // Try saving to backend; if it fails, persist to localStorage as fallback
      let savedToServer = false;
      try {
        const svc = await import('../../services/obe');
        await svc.upsertClassTypeWeights(normalized);
        savedToServer = true;
      } catch (e) {
        // fallback to local storage
        lsSet('iqac_class_type_weights', normalized);
      }

      setWeights(normalized);
      if (savedToServer) setSuccess('Weights saved to server successfully.');
      else setSuccess('Saved locally (backend not reachable).');
    } catch (e: any) {
      setError(e?.message || 'Failed to save weights');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h2>Class Type Weights</h2>
      <p>Set the weights for each class type. These weights are IQAC-controlled and are not editable by staff.</p>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>CO Attainment Weights</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>Used in CO Attainment (SSA/CIA/Formative blend).</div>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: 8 }}>Class Type</th>
                  <th style={{ border: '1px solid #ccc', padding: 8 }}>SSA1</th>
                  <th style={{ border: '1px solid #ccc', padding: 8 }}>CIA1</th>
                  <th style={{ border: '1px solid #ccc', padding: 8 }}>Formative1</th>
                </tr>
              </thead>
              <tbody>
                {CLASS_TYPES.map((ctLabel) => {
                  const key = normalizeClassType(String(ctLabel));
                  const label = String(ctLabel).charAt(0).toUpperCase() + String(ctLabel).slice(1);
                  return (
                    <tr key={key}>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{label}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>
                        <input type="number" step="0.1" value={weights[key]?.ssa1 ?? ''} onChange={(e) => handleChange(key, 'ssa1', e.target.value)} required />
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>
                        <input type="number" step="0.1" value={weights[key]?.cia1 ?? ''} onChange={(e) => handleChange(key, 'cia1', e.target.value)} required />
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>
                        <input type="number" step="0.1" value={weights[key]?.formative1 ?? ''} onChange={(e) => handleChange(key, 'formative1', e.target.value)} required />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Internal Mark Weightage</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>This 13-value row controls the INTERNAL MARK table calculation by class type.</div>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: 8 }}>Class Type</th>
                  {INTERNAL_MARK_LABELS.map((lab) => (
                    <th key={lab} style={{ border: '1px solid #ccc', padding: 8, whiteSpace: 'nowrap' }}>{lab}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CLASS_TYPES.map((ctLabel) => {
                  const key = normalizeClassType(String(ctLabel));
                  const label = String(ctLabel).charAt(0).toUpperCase() + String(ctLabel).slice(1);
                  const row = weights[key];
                  const arr = Array.isArray(row?.internal_mark_weights) ? row.internal_mark_weights : DEFAULT_INTERNAL_MARK_WEIGHTS;
                  return (
                    <tr key={key}>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{label}</td>
                      {INTERNAL_MARK_LABELS.map((_, idx) => (
                        <td key={idx} style={{ border: '1px solid #ccc', padding: 8 }}>
                          <input
                            type="number"
                            step="0.1"
                            value={(arr as any)[idx] ?? ''}
                            onChange={(e) => handleInternalWeightChange(key, idx, e.target.value)}
                            required
                            style={{ width: 90 }}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button type="submit" disabled={saving} style={{ padding: '8px 18px', fontWeight: 700 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
          {success && <div style={{ color: 'green', marginTop: 12 }}>{success}</div>}
        </form>
      )}
    </div>
  );
}
