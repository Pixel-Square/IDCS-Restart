import React, { useState, useEffect } from 'react';
import CLASS_TYPES from '../../constants/classTypes';
import { normalizeClassType } from '../../constants/classTypes';
import { lsGet, lsSet } from '../../utils/localStorage';

const DEFAULT_INTERNAL_MARK_WEIGHTS = [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0];

const INTERNAL_MARK_TABLE_CLASS_TYPES = ['THEORY', 'TCPR', 'TCPL', 'LAB', 'AUDIT', 'PRACTICAL', 'SPECIAL'] as const;


type WeightsRow = {
  ssa1: number | string;
  cia1: number | string;
  formative1: number | string;
  internal_mark_weights: Array<number | string>;
};

const INTERNAL_CELL_PADDING = 6;
const INTERNAL_INPUT_WIDTH = 64;

function displayClassTypeName(ct: string): string {
  const s = normalizeClassType(ct);
  if (s === 'THEORY') return 'Theory';
  if (s === 'TCPL') return 'TCPL';
  if (s === 'TCPR') return 'TCPR';
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function ensureInternalWeightsLen17(arr: Array<number | string> | null | undefined): Array<number | string> {
  const next = Array.isArray(arr) ? [...arr] : [...DEFAULT_INTERNAL_MARK_WEIGHTS];
  while (next.length < 17) next.push('');
  return next.slice(0, 17);
}

function splitCycleWeight(total: unknown, ssaW: unknown, ciaW: unknown, faW: unknown): [number, number, number] {
  const t = Number(total);
  const s = Number(ssaW);
  const c = Number(ciaW);
  const f = Number(faW);
  const sum = (Number.isFinite(s) ? s : 0) + (Number.isFinite(c) ? c : 0) + (Number.isFinite(f) ? f : 0);
  if (!Number.isFinite(t) || t <= 0 || !sum) return [0, 0, 0];
  const a = Math.round(((t * (s || 0)) / sum) * 100) / 100;
  const b = Math.round(((t * (c || 0)) / sum) * 100) / 100;
  const d = Math.round(((t * (f || 0)) / sum) * 100) / 100;
  return [a, b, d];
}

function normalizeInternalWeightsLen17(
  arr: Array<number | string> | null | undefined,
  row?: { ssa1?: any; cia1?: any; formative1?: any },
): Array<number | string> {
  let next = Array.isArray(arr) ? [...arr] : [...DEFAULT_INTERNAL_MARK_WEIGHTS];
  // Backward compatibility: old format had 13 weights with CO1/CO2 as single cycle columns.
  if (next.length === 13) {
    const [co1Ssa, co1Cia, co1Fa] = splitCycleWeight(next[0] ?? 0, row?.ssa1 ?? 1.5, row?.cia1 ?? 3, row?.formative1 ?? 2.5);
    const [co2Ssa, co2Cia, co2Fa] = splitCycleWeight(next[1] ?? 0, row?.ssa1 ?? 1.5, row?.cia1 ?? 3, row?.formative1 ?? 2.5);
    next = [co1Ssa, co1Cia, co1Fa, co2Ssa, co2Cia, co2Fa, ...next.slice(2)];
  }
  next = ensureInternalWeightsLen17(next);
  return next;
}

type InternalWeightsCol = { label: string; index: number };
type InternalWeightsGroup = { header: string; cols: InternalWeightsCol[] };

function buildInternalWeightsGroups(classType: string): InternalWeightsGroup[] {
  const k = normalizeClassType(classType);

  // Lab-like classes use CIA1/CIA2 + MODEL only.
  if (k === 'LAB' || k === 'PRACTICAL') {
    return [
      { header: 'CO1', cols: [{ label: 'CIA 1', index: 1 }] },
      { header: 'CO2', cols: [{ label: 'CIA 1', index: 4 }] },
      { header: 'CO3', cols: [{ label: 'CIA 2', index: 7 }] },
      { header: 'CO4', cols: [{ label: 'CIA 2', index: 10 }] },
      { header: 'ME', cols: [{ label: 'MODEL', index: 16 }] },
    ];
  }

  const thirdLabelForCo = (coNum: 1 | 2 | 3 | 4) => {
    if (k === 'TCPR') return (coNum === 1 || coNum === 2) ? 'Review 1' : 'Review 2';
    if (k === 'TCPL') return (coNum === 1 || coNum === 2) ? 'LAB 1' : 'LAB 2';
    return (coNum === 1 || coNum === 2) ? 'Formative 1' : 'Formative 2';
  };

  const ciaLabelForCo = (coNum: 1 | 2 | 3 | 4) => (coNum === 1 || coNum === 2 ? 'CIA 1' : 'CIA 2');
  const ssaLabelForCo = (coNum: 1 | 2 | 3 | 4) => (coNum === 1 || coNum === 2 ? 'SSA 1' : 'SSA 2');

  const coGroup = (coNum: 1 | 2 | 3 | 4, baseIndex: number): InternalWeightsGroup => ({
    header: `CO${coNum}`,
    cols: [
      { label: ssaLabelForCo(coNum), index: baseIndex },
      { label: ciaLabelForCo(coNum), index: baseIndex + 1 },
      { label: thirdLabelForCo(coNum), index: baseIndex + 2 },
    ],
  });

  return [
    coGroup(1, 0),
    coGroup(2, 3),
    coGroup(3, 6),
    coGroup(4, 9),
    {
      header: 'ME',
      cols: [
        { label: 'CO1', index: 12 },
        { label: 'CO2', index: 13 },
        { label: 'CO3', index: 14 },
        { label: 'CO4', index: 15 },
        { label: 'CO5', index: 16 },
      ],
    },
  ];
}

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
          // defaults for TCPR/TCPL as requested; others keep previous defaults
          let ssaDef: number | string = 1.5;
          let ciaDef: number | string = 3;
          let formDef: number | string = 2.5;
          if (k === 'TCPL') {
            ssaDef = 1;
            ciaDef = 3.25;
            formDef = 3.5; // Lab
          } else if (k === 'TCPR') {
            ssaDef = 1;
            ciaDef = 3.25;
            formDef = 4.0; // Review
          } else if (k === 'LAB') {
            ssaDef = 1;
            ciaDef = 1;
            formDef = 1;
          }

          // build internal weights: for theory-like classes we use a 17-value pattern
          let internalWeights: Array<number | string> = [...DEFAULT_INTERNAL_MARK_WEIGHTS];
          if (k === 'THEORY') {
            internalWeights = [...DEFAULT_INTERNAL_MARK_WEIGHTS];
          } else if (k === 'TCPL') {
            // CO1..CO4 => SSA/CIA/FA repeated, ME COs => 3,3,3,3,7
            internalWeights = [];
            for (let i = 0; i < 4; i++) internalWeights.push(ssaDef, ciaDef, formDef);
            internalWeights.push(3.0, 3.0, 3.0, 3.0, 7.0);
          } else if (k === 'TCPR') {
            // CO1..CO4 => SSA/CIA/FA repeated, ME COs => 3,3,3,3,10
            internalWeights = [];
            for (let i = 0; i < 4; i++) internalWeights.push(ssaDef, ciaDef, formDef);
            internalWeights.push(3.0, 3.0, 3.0, 3.0, 10.0);
          }

          out[k] = {
            ssa1: ssaDef,
            cia1: ciaDef,
            formative1: formDef,
            internal_mark_weights: internalWeights,
          };
        }

        // Ensure single THEORY key exists (server or CLASS_TYPES may provide it)
        if (!out['THEORY']) {
          out['THEORY'] = {
            ssa1: 1.5,
            cia1: 3,
            formative1: 2.5,
            internal_mark_weights: [...DEFAULT_INTERNAL_MARK_WEIGHTS],
          };
        }

        return out;
      };

      const applyAny = (src: any) => {
        const defaults = buildDefaults();
        if (!src || typeof src !== 'object') return defaults;
        const out: Record<string, WeightsRow> = { ...defaults };
        const all = Array.from(new Set<string>([...CLASS_TYPES.map((ct) => normalizeClassType(String(ct))), 'THEORY']));

        // Prefer explicit single THEORY key only
        const theorySeed = src['THEORY'] ?? src['Theory'] ?? src['theory'] ?? null;
        if (theorySeed && typeof theorySeed === 'object') {
          src['THEORY'] = theorySeed;
        }

        for (const k of all) {
          const w = src[k] ?? src[String(k)] ?? src[String(k).toUpperCase()] ?? null;
          if (!w || typeof w !== 'object') continue;
          const im = Array.isArray((w as any).internal_mark_weights) ? (w as any).internal_mark_weights : null;
          const seedRow = {
            ssa1: (w as any).ssa1 ?? out[k].ssa1,
            cia1: (w as any).cia1 ?? out[k].cia1,
            formative1: (w as any).formative1 ?? out[k].formative1,
          };
          out[k] = {
            ssa1: seedRow.ssa1,
            cia1: seedRow.cia1,
            formative1: seedRow.formative1,
            internal_mark_weights: normalizeInternalWeightsLen17((im && im.length ? im : out[k].internal_mark_weights) as any, seedRow),
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
        return;
      } catch {
        // ignore
      }

      try {
        const saved = lsGet<any>('iqac_class_type_weights');
        const applied = applyAny(saved);
        setWeights(applied);
      } catch {
        const applied = buildDefaults();
        setWeights(applied);
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
      while (next.length < 17) next.push('');
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
      const keysToSave = Array.from(new Set<string>([...CLASS_TYPES.map((ct) => normalizeClassType(String(ct))), 'THEORY']));

      for (const k of keysToSave) {
        const w = (weights[k] ?? weights[k.toLowerCase()] ?? weights[k.toUpperCase()] ?? {}) as any;
        const normalizedIm = normalizeInternalWeightsLen17(
          Array.isArray(w?.internal_mark_weights) ? w.internal_mark_weights : DEFAULT_INTERNAL_MARK_WEIGHTS,
          { ssa1: w?.ssa1, cia1: w?.cia1, formative1: w?.formative1 },
        );
        normalized[k] = {
          ssa1: Number(w?.ssa1) || 0,
          cia1: Number(w?.cia1) || 0,
          formative1: Number(w?.formative1) || 0,
          internal_mark_weights: ensureInternalWeightsLen17(normalizedIm).map((x: any, i: number) => {
            const v = Number(x);
            return Number.isFinite(v) ? v : (DEFAULT_INTERNAL_MARK_WEIGHTS[i] ?? 0);
          }),
        };
      }

      // Ensure single THEORY key exists
      if (!normalized.THEORY) {
        normalized.THEORY = normalized.THEORY || null;
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
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                              {key === 'TCPL' ? 'Lab' : key === 'TCPR' ? 'Review' : 'Formative'}
                            </div>
                          </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Internal Mark Weightage</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>Inputs are mapped exactly to class-type exam assignments used in Internal Mark calculation.</div>
          </div>
          <div style={{ marginBottom: 24 }}>
            {INTERNAL_MARK_TABLE_CLASS_TYPES.map((ct) => {
              const key = normalizeClassType(String(ct));
              const row = weights[key];
              const arr = normalizeInternalWeightsLen17(Array.isArray(row?.internal_mark_weights) ? row.internal_mark_weights : DEFAULT_INTERNAL_MARK_WEIGHTS, row);
              const groups = buildInternalWeightsGroups(key);
              const cols = groups.flatMap((g) => g.cols);
              return (
                <div key={key} style={{ marginBottom: 18, overflowX: 'auto' }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{displayClassTypeName(key)}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {groups.map((g) => (
                          <th
                            key={g.header}
                            colSpan={g.cols.length}
                            style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 13 }}
                          >
                            {g.header}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {cols.map((c) => (
                          <th key={`${c.label}_${c.index}`} style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {cols.map((c) => (
                          <td key={c.index} style={{ border: '1px solid #ccc', padding: INTERNAL_CELL_PADDING, textAlign: 'center' }}>
                            <input
                              type="number"
                              step="0.1"
                              value={(arr as any)[c.index] ?? ''}
                              onChange={(e) => handleInternalWeightChange(key, c.index, e.target.value)}
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
