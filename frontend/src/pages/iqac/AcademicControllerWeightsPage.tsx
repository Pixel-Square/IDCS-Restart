import React, { useState, useEffect } from 'react';
import CLASS_TYPES from '../../constants/classTypes';
import { normalizeClassType } from '../../constants/classTypes';
import { lsGet, lsSet } from '../../utils/localStorage';

const DEFAULT_INTERNAL_MARK_WEIGHTS_17 = [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0];

// TCPL has an extra column per CO: CIA Exam (split from LAB/Formative slot).
// Slot order (21):
// CO1: SSA, CIA, LAB, CIA Exam
// CO2: SSA, CIA, LAB, CIA Exam
// CO3: SSA, CIA, LAB, CIA Exam
// CO4: SSA, CIA, LAB, CIA Exam
// ME: CO1..CO5
const DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21 = [
  1.0, 3.25, 3.5, 0,
  1.0, 3.25, 3.5, 0,
  1.0, 3.25, 3.5, 0,
  1.0, 3.25, 3.5, 0,
  3.0, 3.0, 3.0, 3.0, 7.0,
];

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

function internalWeightsExpectedLen(classType: string): number {
  const k = normalizeClassType(classType);
  return k === 'TCPL' ? 21 : 17;
}

function defaultInternalWeightsForClassType(classType: string): Array<number | string> {
  const k = normalizeClassType(classType);
  if (k === 'TCPL') return [...DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21];
  return [...DEFAULT_INTERNAL_MARK_WEIGHTS_17];
}

function ensureInternalWeightsLen(classType: string, arr: Array<number | string> | null | undefined): Array<number | string> {
  const expected = internalWeightsExpectedLen(classType);
  const base = defaultInternalWeightsForClassType(classType);
  const next = Array.isArray(arr) ? [...arr] : [...base];
  while (next.length < expected) next.push('');
  return next.slice(0, expected);
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

function normalizeInternalWeights(
  classType: string,
  arr: Array<number | string> | null | undefined,
  row?: { ssa1?: any; cia1?: any; formative1?: any },
): Array<number | string> {
  const k = normalizeClassType(classType);
  const defaults = defaultInternalWeightsForClassType(k);
  let next = Array.isArray(arr) ? [...arr] : [...defaults];

  const sanitizeLabPractical = (input: Array<number | string>) => {
    const out = ensureInternalWeightsLen(k, input);
    const labCiaFallback = Number((defaults as any)?.[1] ?? DEFAULT_INTERNAL_MARK_WEIGHTS_17[1] ?? 3);
    const modelFallback = Number((defaults as any)?.[16] ?? DEFAULT_INTERNAL_MARK_WEIGHTS_17[16] ?? 4);
    const pickLabCia = (legacy: unknown) => {
      if (legacy === '' || legacy == null) return '';
      const n = Number(legacy);
      if (Number.isFinite(n)) return n;
      return labCiaFallback;
    };
    out[1] = pickLabCia(out[1]);
    out[4] = pickLabCia(out[4]);
    out[7] = pickLabCia(out[7]);
    out[10] = pickLabCia(out[10]);
    if (out[16] === '' || out[16] == null) {
      out[16] = '';
    } else {
      const meCo5Raw = Number(out[16]);
      out[16] = Number.isFinite(meCo5Raw) ? meCo5Raw : modelFallback;
    }
    return out;
  };
  // Backward compatibility: old format had 13 weights with CO1/CO2 as single cycle columns.
  if (next.length === 13) {
    if (k === 'LAB' || k === 'PRACTICAL') {
      const labCiaFallback = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_17[1] ?? 3);
      const modelFallback = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_17[16] ?? 4);
      const pickLabCia = (legacy: unknown) => {
        if (legacy === '' || legacy == null) return '';
        const n = Number(legacy);
        if (Number.isFinite(n)) return n;
        return labCiaFallback;
      };
      const co1Cia = pickLabCia(next[0]);
      const co2Cia = pickLabCia(next[1]);
      const co3Cia = pickLabCia(next[3]);
      const co4Cia = pickLabCia(next[6]);
      const meCo5 = next[12] === '' || next[12] == null ? '' : (Number.isFinite(Number(next[12])) ? Number(next[12]) : modelFallback);
      next = [0, co1Cia, 0, 0, co2Cia, 0, 0, co3Cia, 0, 0, co4Cia, 0, 0, 0, 0, 0, meCo5];
    } else {
      const [co1Ssa, co1Cia, co1Fa] = splitCycleWeight(next[0] ?? 0, row?.ssa1 ?? 1.5, row?.cia1 ?? 3, row?.formative1 ?? 2.5);
      const [co2Ssa, co2Cia, co2Fa] = splitCycleWeight(next[1] ?? 0, row?.ssa1 ?? 1.5, row?.cia1 ?? 3, row?.formative1 ?? 2.5);
      next = [co1Ssa, co1Cia, co1Fa, co2Ssa, co2Cia, co2Fa, ...next.slice(2)];
    }
  }
  // TCPL upgrade: old 17-slot schema -> new 21-slot schema by inserting CIA Exam weights.
  if (k === 'TCPL' && next.length === 17) {
    const out: Array<number | string> = [];
    for (let co = 0; co < 4; co++) {
      const baseIdx = co * 3;
      out.push(next[baseIdx] ?? '', next[baseIdx + 1] ?? '', next[baseIdx + 2] ?? '', '');
    }
    out.push(...next.slice(12, 17));
    next = out;
  }

  next = ensureInternalWeightsLen(k, next);
  if (k === 'LAB' || k === 'PRACTICAL') {
    next = sanitizeLabPractical(next);
  }
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

  if (k === 'TCPL') {
    const coGroupTcpl = (coNum: 1 | 2 | 3 | 4, baseIndex: number): InternalWeightsGroup => ({
      header: `CO${coNum}`,
      cols: [
        { label: ssaLabelForCo(coNum), index: baseIndex },
        { label: ciaLabelForCo(coNum), index: baseIndex + 1 },
        { label: thirdLabelForCo(coNum), index: baseIndex + 2 },
        { label: 'CIA Exam', index: baseIndex + 3 },
      ],
    });

    return [
      coGroupTcpl(1, 0),
      coGroupTcpl(2, 4),
      coGroupTcpl(3, 8),
      coGroupTcpl(4, 12),
      {
        header: 'ME',
        cols: [
          { label: 'CO1', index: 16 },
          { label: 'CO2', index: 17 },
          { label: 'CO3', index: 18 },
          { label: 'CO4', index: 19 },
          { label: 'CO5', index: 20 },
        ],
      },
    ];
  }

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
          let internalWeights: Array<number | string> = [...DEFAULT_INTERNAL_MARK_WEIGHTS_17];
          if (k === 'THEORY') {
            internalWeights = [...DEFAULT_INTERNAL_MARK_WEIGHTS_17];
          } else if (k === 'TCPL') {
            // CO1..CO4 => SSA/CIA/LAB/CIAExam repeated, ME COs => 3,3,3,3,7
            internalWeights = [];
            for (let i = 0; i < 4; i++) internalWeights.push(ssaDef, ciaDef, formDef, 0);
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
            internal_mark_weights: [...DEFAULT_INTERNAL_MARK_WEIGHTS_17],
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
            internal_mark_weights: normalizeInternalWeights(k, (im && im.length ? im : out[k].internal_mark_weights) as any, seedRow),
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
      const row = prev[classType] || ({ ssa1: '', cia1: '', formative1: '', internal_mark_weights: defaultInternalWeightsForClassType(classType) } as WeightsRow);
      const next = Array.isArray(row.internal_mark_weights) ? [...row.internal_mark_weights] : defaultInternalWeightsForClassType(classType);
      const expected = internalWeightsExpectedLen(classType);
      while (next.length < expected) next.push('');
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
        const normalizedIm = normalizeInternalWeights(
          k,
          Array.isArray(w?.internal_mark_weights) ? w.internal_mark_weights : defaultInternalWeightsForClassType(k),
          { ssa1: w?.ssa1, cia1: w?.cia1, formative1: w?.formative1 },
        );
        const expected = internalWeightsExpectedLen(k);
        const defaults = defaultInternalWeightsForClassType(k) as number[];
        normalized[k] = {
          ssa1: Number(w?.ssa1) || 0,
          cia1: Number(w?.cia1) || 0,
          formative1: Number(w?.formative1) || 0,
          internal_mark_weights: ensureInternalWeightsLen(k, normalizedIm).map((x: any, i: number) => {
            const v = Number(x);
            return Number.isFinite(v) ? v : (defaults[i] ?? 0);
          }),
        };

        // Safety: ensure exact length persisted.
        if (Array.isArray(normalized[k].internal_mark_weights)) {
          normalized[k].internal_mark_weights = normalized[k].internal_mark_weights.slice(0, expected);
        }
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
              const arr = normalizeInternalWeights(key, Array.isArray(row?.internal_mark_weights) ? row.internal_mark_weights : defaultInternalWeightsForClassType(key), row);
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

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '8px 18px',
              fontWeight: 700,
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
          {success && <div style={{ color: 'green', marginTop: 12 }}>{success}</div>}
        </form>
      )}
    </div>
  );
}
