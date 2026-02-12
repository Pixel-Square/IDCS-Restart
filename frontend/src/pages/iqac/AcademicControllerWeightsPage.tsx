import React, { useState, useEffect } from 'react';
import CLASS_TYPES from '../../constants/classTypes';
import { normalizeClassType } from '../../constants/classTypes';
import { lsGet, lsSet } from '../../utils/localStorage';

const DEFAULT_INTERNAL_MARK_WEIGHTS = [7.0, 7.0, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0];

const INTERNAL_MARK_TABLE_CLASS_TYPES = ['THEORY1', 'THEORY2', 'THEORY3', 'TCPR', 'TCPL', 'LAB', 'AUDIT', 'PRACTICAL', 'SPECIAL'] as const;

const THEORY_INTERNAL_SCHEMA = {
  groupHeaders: ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'] as const,
  // 3*4 + 1 = 13
  subHeaders: [
    ['SSA', 'FA', 'CIA'],
    ['SSA', 'FA', 'CIA'],
    ['SSA', 'FA', 'CIA'],
    ['SSA', 'FA', 'CIA'],
    ['MODEL'],
  ] as const,
} as const;

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

type TheoryEnabledState = Record<string, boolean[]>;

const INTERNAL_CELL_PADDING = 6;
const INTERNAL_INPUT_WIDTH = 64;

function displayClassTypeName(ct: string): string {
  const s = normalizeClassType(ct);
  if (s === 'THEORY1') return 'Theory A';
  if (s === 'THEORY2') return 'Theory B';
  if (s === 'THEORY3') return 'Theory C';
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function ensureInternalWeightsLen13(arr: Array<number | string> | null | undefined): Array<number | string> {
  const next = Array.isArray(arr) ? [...arr] : [...DEFAULT_INTERNAL_MARK_WEIGHTS];
  while (next.length < 13) next.push('');
  return next.slice(0, 13);
}

function buildTheoryEnabledState(src: Record<string, WeightsRow>): TheoryEnabledState {
  const out: TheoryEnabledState = {};
  for (const k of ['THEORY1', 'THEORY2', 'THEORY3']) {
    // Default locked/dim until the user explicitly enables editing.
    out[k] = new Array(13).fill(false);
  }
  return out;
}

export default function AcademicControllerWeightsPage() {
  const [weights, setWeights] = useState<Record<string, WeightsRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [theoryEnabled, setTheoryEnabled] = useState<TheoryEnabledState>({});

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

        // Extra theory variants (used only for internal mark weightage UI)
        for (const k of ['THEORY1', 'THEORY2', 'THEORY3']) {
          if (!out[k]) {
            out[k] = {
              ssa1: out['THEORY']?.ssa1 ?? 1.5,
              cia1: out['THEORY']?.cia1 ?? 3,
              formative1: out['THEORY']?.formative1 ?? 2.5,
              internal_mark_weights: [...DEFAULT_INTERNAL_MARK_WEIGHTS],
            };
          }
        }
        return out;
      };

      const applyAny = (src: any) => {
        const defaults = buildDefaults();
        if (!src || typeof src !== 'object') return defaults;
        const out: Record<string, WeightsRow> = { ...defaults };
        const all = Array.from(new Set<string>([...CLASS_TYPES.map((ct) => normalizeClassType(String(ct))), 'THEORY1', 'THEORY2', 'THEORY3']));

        // If server has only THEORY, seed THEORY1/2/3 from THEORY
        const theorySeed = src['THEORY'] ?? src['Theory'] ?? src['theory'] ?? null;
        if (theorySeed && typeof theorySeed === 'object') {
          for (const tk of ['THEORY1', 'THEORY2', 'THEORY3']) {
            if (src[tk] == null) src[tk] = theorySeed;
          }
        }

        for (const k of all) {
          const w = src[k] ?? src[String(k)] ?? src[String(k).toUpperCase()] ?? null;
          if (!w || typeof w !== 'object') continue;
          const im = Array.isArray((w as any).internal_mark_weights) ? (w as any).internal_mark_weights : null;
          out[k] = {
            ssa1: (w as any).ssa1 ?? out[k].ssa1,
            cia1: (w as any).cia1 ?? out[k].cia1,
            formative1: (w as any).formative1 ?? out[k].formative1,
            internal_mark_weights: ensureInternalWeightsLen13((im && im.length ? im : out[k].internal_mark_weights) as any),
          };
        }
        return out;
      };

      // Prefer server; fallback localStorage; else defaults
      try {
        const svc = await import('../../services/obe');
        const remote = await svc.fetchClassTypeWeights();
        const applied = applyAny(remote);
        setWeights(applied);
        setTheoryEnabled(buildTheoryEnabledState(applied));
        return;
      } catch {
        // ignore
      }

      try {
        const saved = lsGet<any>('iqac_class_type_weights');
        const applied = applyAny(saved);
        setWeights(applied);
        setTheoryEnabled(buildTheoryEnabledState(applied));
      } catch {
        const applied = buildDefaults();
        setWeights(applied);
        setTheoryEnabled(buildTheoryEnabledState(applied));
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
      while (next.length < 13) next.push('');
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

  const toggleTheoryCol = (theoryKey: string, index: number, checked: boolean) => {
    setTheoryEnabled((prev) => {
      const cur = Array.isArray(prev[theoryKey]) ? [...prev[theoryKey]] : new Array(13).fill(true);
      while (cur.length < 13) cur.push(true);
      cur[index] = checked;
      return { ...prev, [theoryKey]: cur.slice(0, 13) };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // normalize keys to use the canonical form (uppercase)
      const normalized: Record<string, any> = {};
      const keysToSave = Array.from(new Set<string>([...CLASS_TYPES.map((ct) => normalizeClassType(String(ct))), 'THEORY1', 'THEORY2', 'THEORY3']));

      for (const k of keysToSave) {
        const w = weights[k] ?? weights[k.toLowerCase()] ?? weights[k.toUpperCase()] ?? {};
        normalized[k] = {
          ssa1: Number(w?.ssa1) || 0,
          cia1: Number(w?.cia1) || 0,
          formative1: Number(w?.formative1) || 0,
          internal_mark_weights: ensureInternalWeightsLen13(Array.isArray(w?.internal_mark_weights) ? w.internal_mark_weights : DEFAULT_INTERNAL_MARK_WEIGHTS).map((x: any, i: number) => {
            const v = Number(x);
            return Number.isFinite(v) ? v : (DEFAULT_INTERNAL_MARK_WEIGHTS[i] ?? 0);
          }),
        };
      }

      // Backward compatibility: keep THEORY in sync with THEORY1 (so existing pages that use THEORY continue to work).
      if (normalized.THEORY1) {
        normalized.THEORY = { ...normalized.THEORY, ...normalized.THEORY1 };
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
          <div style={{ marginBottom: 24 }}>
            {INTERNAL_MARK_TABLE_CLASS_TYPES.map((ct) => {
              const key = normalizeClassType(String(ct));
              const row = weights[key];
              const arr = ensureInternalWeightsLen13(Array.isArray(row?.internal_mark_weights) ? row.internal_mark_weights : DEFAULT_INTERNAL_MARK_WEIGHTS);

              const isTheoryVariant = key === 'THEORY1' || key === 'THEORY2' || key === 'THEORY3';
              if (isTheoryVariant) {
                const enabledArr = Array.isArray(theoryEnabled[key]) ? theoryEnabled[key] : new Array(13).fill(true);
                const inputStyle = (enabled: boolean): React.CSSProperties => ({
                  width: INTERNAL_INPUT_WIDTH,
                  opacity: enabled ? 1 : 0.45,
                  pointerEvents: enabled ? 'auto' : 'none',
                });

                // Map UI cells to 13 indexes (CO1..CO4 => SSA/FA/CIA, CO5 => MODEL)
                const idxMap: number[][] = [
                  [0, 1, 2],
                  [3, 4, 5],
                  [6, 7, 8],
                  [9, 10, 11],
                  [12],
                ];

                return (
                  <div key={key} style={{ marginBottom: 18, overflowX: 'auto' }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>{displayClassTypeName(key)}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {THEORY_INTERNAL_SCHEMA.groupHeaders.map((g, gi) => (
                            <th
                              key={g}
                              colSpan={THEORY_INTERNAL_SCHEMA.subHeaders[gi].length}
                              style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 13 }}
                            >
                              {g}
                            </th>
                          ))}
                        </tr>
                        <tr>
                          {THEORY_INTERNAL_SCHEMA.subHeaders.flat().map((sub, flatIdx) => {
                            const enabled = Boolean(enabledArr[flatIdx] ?? true);
                            return (
                              <th key={`${sub}_${flatIdx}`} style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12 }}>
                                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', userSelect: 'none' }}>
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => toggleTheoryCol(key, flatIdx, e.target.checked)}
                                    style={{ transform: 'scale(0.9)' }}
                                  />
                                  {sub}
                                </label>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {idxMap.flat().map((idx) => {
                            const enabled = Boolean(enabledArr[idx] ?? true);
                            return (
                              <td key={idx} style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center' }}>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={(arr as any)[idx] ?? ''}
                                  onChange={(e) => handleInternalWeightChange(key, idx, e.target.value)}
                                  disabled={!enabled}
                                  style={inputStyle(enabled)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              }

              // Non-theory: keep the 13-value schema, but split into separate tables per class type
              return (
                <div key={key} style={{ marginBottom: 18, overflowX: 'auto' }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{displayClassTypeName(key)}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {INTERNAL_MARK_LABELS.map((lab) => (
                          <th key={lab} style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, whiteSpace: 'nowrap', fontSize: 12 }}>{lab}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {INTERNAL_MARK_LABELS.map((_, idx) => (
                          <td key={idx} style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING }}>
                            <input
                              type="number"
                              step="0.1"
                              value={(arr as any)[idx] ?? ''}
                              onChange={(e) => handleInternalWeightChange(key, idx, e.target.value)}
                              required
                              style={{ width: INTERNAL_INPUT_WIDTH }}
                            />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
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
