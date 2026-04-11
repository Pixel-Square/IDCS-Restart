import React, { useState, useEffect } from 'react';
import CLASS_TYPES from '../../constants/classTypes';
import { normalizeClassType } from '../../constants/classTypes';
import { lsGet, lsSet } from '../../utils/localStorage';
import { fetchSpecialCoursesList, saveSpecialCourseCoWeights, SpecialCourseItem } from '../../services/obe';

const DEFAULT_INTERNAL_MARK_WEIGHTS_17 = [1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 1.5, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 4.0];

// TCPL has an extra column per CO: CIA Exam (split from LAB/Formative slot).
// Slot order (21):
// CO1: SSA, CIA, LAB, CIA Exam
// CO2: SSA, CIA, LAB, CIA Exam
// CO3: SSA, CIA, LAB, CIA Exam
// CO4: SSA, CIA, LAB, CIA Exam
// ME: CO1..CO5
const DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21 = [
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
  1.0, 3.25, 2.0, 1.5,
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

function splitLegacyTcplCombinedWeight(total: unknown): [number, number] {
  const labDefault = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21[2] ?? 2);
  const ciaExamDefault = Number(DEFAULT_INTERNAL_MARK_WEIGHTS_TCPL_21[3] ?? 1.5);
  const totalDefault = labDefault + ciaExamDefault;
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return [labDefault, ciaExamDefault];
  const lab = Math.round(((n * labDefault) / totalDefault) * 100) / 100;
  const ciaExam = Math.round((n - lab) * 100) / 100;
  return [lab, ciaExam];
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
      const [labWeight, ciaExamWeight] = splitLegacyTcplCombinedWeight(next[baseIdx + 2]);
      out.push(next[baseIdx] ?? '', next[baseIdx + 1] ?? '', labWeight, ciaExamWeight);
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

// ---------------------------------------------------------------------------
// Module-level helpers (not inside useEffect) so they can be used by both
// the load effect AND handleSave.
// ---------------------------------------------------------------------------

function buildDefaults(): Record<string, WeightsRow> {
  const out: Record<string, WeightsRow> = {};
  for (const ct of CLASS_TYPES) {
    const k = normalizeClassType(typeof ct === "string" ? ct : (ct as any).value);
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
}

function applyAny(src: any): Record<string, WeightsRow> {
  const defaults = buildDefaults();
  if (!src || typeof src !== 'object') return defaults;
  const out: Record<string, WeightsRow> = { ...defaults };
  const all = Array.from(new Set<string>([...CLASS_TYPES.map((ct) => normalizeClassType(typeof ct === "string" ? ct : (ct as any).value)), 'THEORY', ...INTERNAL_MARK_TABLE_CLASS_TYPES.map(ct => normalizeClassType(String(ct)))]));

  // Normalise a THEORY alias so any casing variant from the server is accepted.
  const theorySeed = src['THEORY'] ?? src['Theory'] ?? src['theory'] ?? null;
  if (theorySeed && typeof theorySeed === 'object') {
    src = { ...src, THEORY: theorySeed };
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
}

export default function AcademicControllerWeightsPage() {
  // --- sidebar state ---
  const [activeSection, setActiveSection] = useState<'standard' | 'special'>('standard');

  const [weights, setWeights] = useState<Record<string, WeightsRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      // Prefer server; fallback localStorage; else defaults.
      // After our save pipeline, server is always the source of truth.
      try {
        const svc = await import('../../services/obe');
        const remote = await svc.fetchClassTypeWeights();
        const applied = applyAny(remote);
        setWeights(applied);
        // Keep localStorage in sync with what the server returns so that
        // if the server is temporarily unreachable the last-good state is used.
        try { lsSet('iqac_class_type_weights', applied); } catch {}
        return;
      } catch {
        // Server unreachable — fall through to localStorage / defaults.
      }

      try {
        const saved = lsGet<any>('iqac_class_type_weights');
        const applied = applyAny(saved);
        setWeights(applied);
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
      const keysToSave = Array.from(new Set<string>([...CLASS_TYPES.map((ct) => normalizeClassType(typeof ct === "string" ? ct : (ct as any).value)), 'THEORY', ...INTERNAL_MARK_TABLE_CLASS_TYPES.map(ct => normalizeClassType(String(ct)))]));

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

      // ------------------------------------------------------------------ //
      // STEP 1: POST the normalised weights to the server.
      // ------------------------------------------------------------------ //
      const svc = await import('../../services/obe');
      try {
        await svc.upsertClassTypeWeights(normalized);
      } catch (e: any) {
        // POST itself failed (network / auth / server error).
        // Keep the user's edits alive in localStorage so they can retry.
        try { lsSet('iqac_class_type_weights', normalized); } catch {}
        setWeights(applyAny(normalized));
        setError(
          `Server save failed: ${(e as any)?.message || 'Network or permission error'}. ` +
          'Your changes are saved in this browser only and will be lost on refresh. ' +
          'Please contact an administrator if the problem persists.'
        );
        return;
      }

      // ------------------------------------------------------------------ //
      // STEP 2: Re-fetch from server to verify what was actually stored.
      // This guarantees the UI always reflects real DB state after a save.
      // ------------------------------------------------------------------ //
      try {
        const remote = await svc.fetchClassTypeWeights();
        const verified = applyAny(remote);
        lsSet('iqac_class_type_weights', verified);
        setWeights(verified);
        setSuccess('Weights saved and verified from server successfully.');
      } catch {
        // Save succeeded but re-fetch failed (e.g. temporary network blip).
        // Use the payload we just sent as the best available state.
        const optimistic = applyAny(normalized);
        lsSet('iqac_class_type_weights', optimistic);
        setWeights(optimistic);
        setSuccess('Weights saved to server (could not re-verify — will confirm on next refresh).');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save weights');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h2 style={{ margin: '0 0 4px 0' }}>Class Type Weights</h2>
      <p style={{ margin: '0 0 18px 0', color: '#6b7280', fontSize: 14 }}>
        Set the weights for each class type. These weights are IQAC-controlled and are not editable by staff.
      </p>

      {/* Sidebar layout */}
      <div style={{ display: 'flex', gap: 0, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        {/* Sidebar */}
        <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#f8fafc', padding: '12px 0' }}>
          {(['standard', 'special'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 18px',
                fontWeight: activeSection === key ? 800 : 500,
                fontSize: 14,
                background: activeSection === key ? '#ecfdf5' : 'transparent',
                color: activeSection === key ? '#059669' : '#374151',
                border: 'none',
                borderLeft: activeSection === key ? '3px solid #10b981' : '3px solid transparent',
                cursor: 'pointer',
              }}
            >
              {key === 'standard' ? 'Standard' : 'Special Courses'}
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div style={{ flex: 1, padding: 24, minWidth: 0, overflowX: 'auto' }}>
          {activeSection === 'standard' && (
            <>
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
                  const key = normalizeClassType(typeof ctLabel === "string" ? ctLabel : (ctLabel as any).value);
                  const label = typeof ctLabel === "string"
                    ? String(ctLabel).charAt(0).toUpperCase() + String(ctLabel).slice(1)
                    : (ctLabel as any).label;
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
            </>
          )}

          {activeSection === 'special' && (
            <SpecialCoWeightsPanel />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Special Courses CO Weights Panel
// ---------------------------------------------------------------------------

const CO_KEYS = ['co1', 'co2', 'co3', 'co4', 'co5'] as const;

function SpecialCoWeightsPanel() {
  const [courses, setCourses] = useState<SpecialCourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // local edits: taId -> co weights
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState<Record<number, string>>({});

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSpecialCoursesList()
      .then((list) => {
        setCourses(list);
        // Seed edits from existing weights
        const initial: Record<number, Record<string, string>> = {};
        for (const c of list) {
          const row: Record<string, string> = {};
          for (const k of CO_KEYS) {
            row[k] = c.co_weights?.[k] != null ? String(c.co_weights[k]) : '';
          }
          initial[c.id] = row;
        }
        setEdits(initial);
      })
      .catch((e: any) => setError(e?.message || 'Failed to load special courses'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (taId: number, co: string, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [taId]: { ...(prev[taId] || {}), [co]: value },
    }));
  };

  const handleSave = async (taId: number) => {
    setSavingId(taId);
    setSaveMsg((p) => ({ ...p, [taId]: '' }));
    try {
      const row = edits[taId] || {};
      const weights: Record<string, number> = {};
      for (const k of CO_KEYS) {
        const v = Number(row[k]);
        if (Number.isFinite(v)) weights[k] = v;
      }
      await saveSpecialCourseCoWeights(taId, weights);
      setSaveMsg((p) => ({ ...p, [taId]: 'Saved' }));
      // Update local courses list
      setCourses((prev) => prev.map((c) => c.id === taId ? { ...c, co_weights: weights } : c));
    } catch (e: any) {
      setSaveMsg((p) => ({ ...p, [taId]: `Error: ${e?.message || 'Failed'}` }));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div style={{ padding: 20, color: '#6b7280' }}>Loading special courses…</div>;
  if (error) return <div style={{ padding: 12, color: '#b91c1c', background: '#fef2f2', borderRadius: 8 }}>{error}</div>;
  if (!courses.length) return (
    <div style={{ padding: 20, color: '#6b7280', textAlign: 'center' }}>
      No active SPECIAL class-type courses found.
    </div>
  );

  return (
    <div>
      <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 15 }}>Special Courses — CO Weights</div>
      <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 18 }}>
        Set CO attainment weights for each SPECIAL course. These define how much each CO contributes to the internal mark calculation.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={thStyle}>Course</th>
              <th style={thStyle}>Section</th>
              <th style={thStyle}>Department</th>
              <th style={thStyle}>Staff</th>
              <th style={thStyle}>Year</th>
              {CO_KEYS.map((k) => (
                <th key={k} style={{ ...thStyle, textAlign: 'center', minWidth: 72 }}>
                  {k.toUpperCase()}
                </th>
              ))}
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => {
              const row = edits[course.id] || {};
              const isSaving = savingId === course.id;
              const msg = saveMsg[course.id] || '';
              return (
                <tr key={course.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{course.subject_code}</div>
                    {course.subject_name && (
                      <div style={{ fontSize: 11, color: '#64748b' }}>{course.subject_name}</div>
                    )}
                  </td>
                  <td style={tdStyle}>{course.section_name || '—'}</td>
                  <td style={tdStyle}>{course.department || '—'}</td>
                  <td style={tdStyle}>{course.staff_name || '—'}</td>
                  <td style={tdStyle}>{course.academic_year || '—'}</td>
                  {CO_KEYS.map((k) => (
                    <td key={k} style={{ ...tdStyle, textAlign: 'center' }}>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={row[k] ?? ''}
                        onChange={(e) => handleChange(course.id, k, e.target.value)}
                        className="obe-input"
                        style={{ width: 64, textAlign: 'center' }}
                      />
                    </td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="obe-btn obe-btn-success"
                      style={{ padding: '5px 14px', fontSize: 13 }}
                      disabled={isSaving}
                      onClick={() => handleSave(course.id)}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    {msg && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: msg.startsWith('Error') ? '#b91c1c' : '#059669' }}>
                        {msg}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontWeight: 700,
  color: '#475569',
  fontSize: 12,
  whiteSpace: 'nowrap',
  borderBottom: '2px solid #e2e8f0',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'middle',
  borderBottom: '1px solid #f1f5f9',
};

