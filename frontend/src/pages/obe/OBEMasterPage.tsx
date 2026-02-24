import React, { useEffect, useMemo, useState } from 'react';

import { analysisOptionLabels, normalizeAnalysisKey } from '../../components/activeLearningAnalysisMapping';
import { fetchAssessmentMasterConfig, fetchGlobalAnalysisMapping, saveAssessmentMasterConfig, saveGlobalAnalysisMapping } from '../../services/cdapDb';

type Mapping = Record<string, boolean[]>;

type Cia1QuestionDef = {
  key: string;
  label: string;
  max: number;
  // 1&2 means split 50/50 into CO-1 and CO-2 (matches common Excel CIA1 template)
  co: 1 | 2 | '1&2';
  btl: 1 | 2 | 3 | 4 | 5 | 6;
};

type AssessmentMasterConfig = {
  termLabel?: string;
  assessments?: {
    ssa1?: {
      maxTotal?: number;
      coMax?: { co1?: number; co2?: number };
      btlMax?: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6', number>>;
    };
    formative1?: {
      maxPart?: number;
      maxTotal?: number;
      maxCo?: number;
      btlMax?: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6', number>>;
    };
    cia1?: {
      questions?: Cia1QuestionDef[];
      coMax?: { co1?: number; co2?: number };
      btlMax?: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6', number>>;
    };
  };
};

const DEFAULT_CIA1_QUESTIONS: Cia1QuestionDef[] = [
  { key: 'q1', label: 'Q1', max: 2, co: 1, btl: 1 },
  { key: 'q2', label: 'Q2', max: 2, co: 1, btl: 3 },
  { key: 'q3', label: 'Q3', max: 2, co: 1, btl: 4 },
  { key: 'q4', label: 'Q4', max: 2, co: 2, btl: 1 },
  { key: 'q5', label: 'Q5', max: 2, co: 2, btl: 1 },
  { key: 'q6', label: 'Q6', max: 2, co: 2, btl: 2 },
  { key: 'q7', label: 'Q7', max: 16, co: 1, btl: 2 },
  { key: 'q8', label: 'Q8', max: 16, co: 2, btl: 3 },
  { key: 'q9', label: 'Q9', max: 16, co: '1&2', btl: 5 },
];

function cia1DerivedCoMax(questions: Cia1QuestionDef[]): { co1: number; co2: number } {
  let co1 = 0;
  let co2 = 0;
  for (const q of questions || []) {
    const max = Number(q.max || 0);
    if (q.co === '1&2') {
      co1 += max / 2;
      co2 += max / 2;
    } else if (q.co === 2) {
      co2 += max;
    } else {
      co1 += max;
    }
  }
  return { co1, co2 };
}

function cia1DerivedBtlMax(questions: Cia1QuestionDef[]): Record<'1' | '2' | '3' | '4' | '5' | '6', number> {
  const out: Record<'1' | '2' | '3' | '4' | '5' | '6', number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };
  for (const q of questions || []) {
    const k = String(q.btl) as '1' | '2' | '3' | '4' | '5' | '6';
    if (k in out) out[k] += Number(q.max || 0);
  }
  return out;
}

function syncCia1DerivedLimits(args: {
  prevQuestions: Cia1QuestionDef[];
  nextQuestions: Cia1QuestionDef[];
  existingCoMax?: { co1?: unknown; co2?: unknown };
  existingBtlMax?: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6', unknown>>;
}): { coMax: { co1: number; co2: number }; btlMax: Record<'1' | '2' | '3' | '4' | '5' | '6', number> } {
  const prevDerivedCo = cia1DerivedCoMax(args.prevQuestions);
  const nextDerivedCo = cia1DerivedCoMax(args.nextQuestions);

  const prevDerivedBtl = cia1DerivedBtlMax(args.prevQuestions);
  const nextDerivedBtl = cia1DerivedBtlMax(args.nextQuestions);

  const rawCo1 = Number((args.existingCoMax as any)?.co1);
  const rawCo2 = Number((args.existingCoMax as any)?.co2);
  const co1 = !Number.isFinite(rawCo1) || rawCo1 === prevDerivedCo.co1 ? nextDerivedCo.co1 : Math.max(0, rawCo1);
  const co2 = !Number.isFinite(rawCo2) || rawCo2 === prevDerivedCo.co2 ? nextDerivedCo.co2 : Math.max(0, rawCo2);

  const btlMax = { ...nextDerivedBtl };
  (['1', '2', '3', '4', '5', '6'] as const).forEach((k) => {
    const raw = Number((args.existingBtlMax as any)?.[k]);
    if (Number.isFinite(raw) && raw !== prevDerivedBtl[k]) {
      btlMax[k] = Math.max(0, raw);
    }
  });

  return { coMax: { co1, co2 }, btlMax };
}

const DEFAULT_CONFIG: AssessmentMasterConfig = {
  termLabel: 'KRCT AY25-26',
  assessments: {
    ssa1: {
      maxTotal: 20,
      coMax: { co1: 10, co2: 10 },
      btlMax: { '1': 0, '2': 0, '3': 10, '4': 10, '5': 0, '6': 0 },
    },
    formative1: {
      maxPart: 5,
      maxTotal: 20,
      maxCo: 10,
      btlMax: { '1': 0, '2': 0, '3': 10, '4': 10, '5': 0, '6': 0 },
    },
    cia1: {
      questions: DEFAULT_CIA1_QUESTIONS,
      coMax: cia1DerivedCoMax(DEFAULT_CIA1_QUESTIONS),
      btlMax: cia1DerivedBtlMax(DEFAULT_CIA1_QUESTIONS),
    },
  },
};

const poLabels = Array.from({ length: 11 }, (_, i) => `PO${i + 1}`);

function ensureRow(mapping: Mapping, label: string): boolean[] {
  const key = normalizeAnalysisKey(label);
  const existing = mapping?.[key];
  if (Array.isArray(existing) && existing.length === 11) return existing;
  return Array.from({ length: 11 }, () => false);
}

export default function OBEMasterPage(): JSX.Element {
  const [mapping, setMapping] = useState<Mapping>({});
  const [assessmentConfig, setAssessmentConfig] = useState<AssessmentMasterConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<'po' | 'assessments'>('assessments');

  const [selectedCia1Keys, setSelectedCia1Keys] = useState<Record<string, boolean>>({});
  const [bulkCia1Max, setBulkCia1Max] = useState<string>('');
  const [bulkCia1Co, setBulkCia1Co] = useState<'' | '1' | '2' | '1&2'>('');
  const [bulkCia1Btl, setBulkCia1Btl] = useState<'' | '1' | '2' | '3' | '4' | '5' | '6'>('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchGlobalAnalysisMapping();
        if (mounted) setMapping(data || {});
      } catch (e: any) {
        if (mounted) setMessage(e?.message || 'Failed to load global mapping');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchAssessmentMasterConfig();
        if (!mounted) return;
        const merged: AssessmentMasterConfig = {
          ...DEFAULT_CONFIG,
          ...(data || {}),
          assessments: {
            ...(DEFAULT_CONFIG.assessments || {}),
            ...((data as any)?.assessments || {}),
          },
        };
        // ensure CIA1 questions exist
        const qs = (merged.assessments?.cia1?.questions || []) as any[];
        const safeQs = (Array.isArray(qs) && qs.length ? (qs as Cia1QuestionDef[]) : DEFAULT_CIA1_QUESTIONS) as Cia1QuestionDef[];
        const derivedCia1CoMax = cia1DerivedCoMax(safeQs);
        const derivedCia1BtlMax = cia1DerivedBtlMax(safeQs);

        const storedCia1CoMax = (merged.assessments?.cia1 as any)?.coMax as { co1?: unknown; co2?: unknown } | undefined;
        const storedCo1 = Number(storedCia1CoMax?.co1);
        const storedCo2 = Number(storedCia1CoMax?.co2);

        const storedCia1BtlMax = (merged.assessments?.cia1 as any)?.btlMax as Partial<Record<'1' | '2' | '3' | '4' | '5' | '6', unknown>> | undefined;
        const safeBtlMax = (k: '1' | '2' | '3' | '4' | '5' | '6') => {
          const raw = Number((storedCia1BtlMax as any)?.[k]);
          return Number.isFinite(raw) ? Math.max(0, raw) : derivedCia1BtlMax[k];
        };

        merged.assessments = {
          ...(merged.assessments || {}),
          cia1: {
            ...(merged.assessments?.cia1 || {}),
            questions: safeQs,
            coMax: {
              co1: Number.isFinite(storedCo1) ? Math.max(0, storedCo1) : derivedCia1CoMax.co1,
              co2: Number.isFinite(storedCo2) ? Math.max(0, storedCo2) : derivedCia1CoMax.co2,
            },
            btlMax: {
              '1': safeBtlMax('1'),
              '2': safeBtlMax('2'),
              '3': safeBtlMax('3'),
              '4': safeBtlMax('4'),
              '5': safeBtlMax('5'),
              '6': safeBtlMax('6'),
            },
          },
        };
        setAssessmentConfig(merged);
      } catch (e: any) {
        if (mounted) setMessage(e?.message || 'Failed to load assessment master config');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(
    () => analysisOptionLabels.map((label) => ({
      label,
      key: normalizeAnalysisKey(label),
      values: ensureRow(mapping, label),
    })),
    [mapping]
  );

  const updateCell = (label: string, idx: number, checked: boolean) => {
    const key = normalizeAnalysisKey(label);
    setMapping((prev) => {
      const current = Array.isArray(prev?.[key]) ? [...prev[key]] : Array.from({ length: 11 }, () => false);
      current[idx] = checked;
      return { ...prev, [key]: current };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (tab === 'po') {
        await saveGlobalAnalysisMapping(mapping);
        setMessage('Saved global mapping.');
      } else {
        await saveAssessmentMasterConfig(assessmentConfig);
        setMessage('Saved assessment master config.');
      }
    } catch (e: any) {
      setMessage(e?.message || 'Failed to save global mapping');
    } finally {
      setSaving(false);
    }
  };

  const cia1Questions = useMemo(() => {
    const qs = assessmentConfig?.assessments?.cia1?.questions;
    return Array.isArray(qs) && qs.length ? qs : DEFAULT_CIA1_QUESTIONS;
  }, [assessmentConfig]);

  const selectedCia1List = useMemo(() => cia1Questions.filter((q) => selectedCia1Keys[q.key]), [cia1Questions, selectedCia1Keys]);

  const applyBulkToSelectedCia1 = () => {
    if (!selectedCia1List.length) return;
    setAssessmentConfig((prev) => {
      const qs = (prev.assessments?.cia1?.questions || DEFAULT_CIA1_QUESTIONS).slice();
      const next = qs.map((q) => {
        if (!selectedCia1Keys[q.key]) return q;
        const nextQ: Cia1QuestionDef = { ...q };
        if (bulkCia1Max !== '' && Number.isFinite(Number(bulkCia1Max))) nextQ.max = Math.max(0, Number(bulkCia1Max));
        if (bulkCia1Co === '1' || bulkCia1Co === '2') nextQ.co = Number(bulkCia1Co) as 1 | 2;
        if (bulkCia1Co === '1&2') nextQ.co = '1&2';
        if (bulkCia1Btl && ['1', '2', '3', '4', '5', '6'].includes(bulkCia1Btl)) nextQ.btl = Number(bulkCia1Btl) as 1 | 2 | 3 | 4 | 5 | 6;
        return nextQ;
      });

      // Keep CIA1 CO/BTL limits in sync with question headers unless the user explicitly overrode them.
      const synced = syncCia1DerivedLimits({
        prevQuestions: qs,
        nextQuestions: next,
        existingCoMax: (prev.assessments?.cia1 as any)?.coMax,
        existingBtlMax: (prev.assessments?.cia1 as any)?.btlMax,
      });
      return {
        ...prev,
        assessments: {
          ...(prev.assessments || {}),
          cia1: {
            ...(prev.assessments?.cia1 || {}),
            questions: next,
            coMax: synced.coMax,
            btlMax: synced.btlMax,
          },
        },
      };
    });
  };

  return (
    <main className="obe-master-page" style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
      <div style={{ padding: '0px', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>OBE Master</h2>
            <div style={{ color: '#666', marginTop: 4 }}>Global settings for OBE pages</div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => setTab('assessments')}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: tab === 'assessments' ? '#111827' : '#fff', color: tab === 'assessments' ? '#fff' : '#111827' }}
            >
              Assessment Headers
            </button>
            <button
              onClick={() => setTab('po')}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: tab === 'po' ? '#111827' : '#fff', color: tab === 'po' ? '#fff' : '#111827' }}
            >
              Active Learning PO Mapping
            </button>
          </div>

          {message && (
            <div style={{ marginBottom: 12, fontSize: 12, color: message.startsWith('Saved') ? '#166534' : '#b91c1c' }}>
              {message}
            </div>
          )}

          {tab === 'po' ? (
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: '1px solid #e5e7eb', padding: 10, textAlign: 'left', background: '#f8fafc' }}>Activity</th>
                    {poLabels.map((po) => (
                      <th key={po} style={{ borderBottom: '1px solid #e5e7eb', padding: 10, textAlign: 'center', background: '#fff7ed' }}>{po}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.key} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ borderTop: '1px solid #f1f5f9', padding: 10, fontWeight: 600 }}>{row.label}</td>
                      {row.values.map((val, i) => (
                        <td key={`${row.key}-${i}`} style={{ borderTop: '1px solid #f1f5f9', padding: 10, textAlign: 'center' }}>
                          <input type="checkbox" checked={Boolean(val)} onChange={(e) => updateCell(row.label, i, e.target.checked)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Global Term Label</div>
                <input
                  value={assessmentConfig.termLabel ?? ''}
                  onChange={(e) => setAssessmentConfig((p) => ({ ...p, termLabel: e.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db', width: 260 }}
                />
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>SSA1 Headers</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ fontSize: 12 }}>
                    Total Max
                    <input
                      type="number"
                      value={String(assessmentConfig.assessments?.ssa1?.maxTotal ?? 20)}
                      onChange={(e) =>
                        setAssessmentConfig((p) => ({
                          ...p,
                          assessments: {
                            ...(p.assessments || {}),
                            ssa1: {
                              ...(p.assessments?.ssa1 || {}),
                              maxTotal: Number(e.target.value || 0),
                            },
                          },
                        }))
                      }
                      style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90 }}
                    />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    CO1 Max
                    <input
                      type="number"
                      value={String(assessmentConfig.assessments?.ssa1?.coMax?.co1 ?? 10)}
                      onChange={(e) =>
                        setAssessmentConfig((p) => ({
                          ...p,
                          assessments: {
                            ...(p.assessments || {}),
                            ssa1: {
                              ...(p.assessments?.ssa1 || {}),
                              coMax: { ...(p.assessments?.ssa1?.coMax || {}), co1: Number(e.target.value || 0) },
                            },
                          },
                        }))
                      }
                      style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90 }}
                    />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    CO2 Max
                    <input
                      type="number"
                      value={String(assessmentConfig.assessments?.ssa1?.coMax?.co2 ?? 10)}
                      onChange={(e) =>
                        setAssessmentConfig((p) => ({
                          ...p,
                          assessments: {
                            ...(p.assessments || {}),
                            ssa1: {
                              ...(p.assessments?.ssa1 || {}),
                              coMax: { ...(p.assessments?.ssa1?.coMax || {}), co2: Number(e.target.value || 0) },
                            },
                          },
                        }))
                      }
                      style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90 }}
                    />
                  </label>
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Formative 1 Headers</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ fontSize: 12 }}>
                    Part Max
                    <input
                      type="number"
                      value={String(assessmentConfig.assessments?.formative1?.maxPart ?? 5)}
                      onChange={(e) =>
                        setAssessmentConfig((p) => ({
                          ...p,
                          assessments: {
                            ...(p.assessments || {}),
                            formative1: {
                              ...(p.assessments?.formative1 || {}),
                              maxPart: Number(e.target.value || 0),
                            },
                          },
                        }))
                      }
                      style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90 }}
                    />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Total Max
                    <input
                      type="number"
                      value={String(assessmentConfig.assessments?.formative1?.maxTotal ?? 20)}
                      onChange={(e) =>
                        setAssessmentConfig((p) => ({
                          ...p,
                          assessments: {
                            ...(p.assessments || {}),
                            formative1: {
                              ...(p.assessments?.formative1 || {}),
                              maxTotal: Number(e.target.value || 0),
                            },
                          },
                        }))
                      }
                      style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90 }}
                    />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    CO Max
                    <input
                      type="number"
                      value={String(assessmentConfig.assessments?.formative1?.maxCo ?? 10)}
                      onChange={(e) =>
                        setAssessmentConfig((p) => ({
                          ...p,
                          assessments: {
                            ...(p.assessments || {}),
                            formative1: {
                              ...(p.assessments?.formative1 || {}),
                              maxCo: Number(e.target.value || 0),
                            },
                          },
                        }))
                      }
                      style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90 }}
                    />
                  </label>
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>CIA 1</div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 12 }}>
                  <div style={{ flex: '1 1 360px', border: '1px solid #eef2f7', borderRadius: 12, padding: 12, background: '#fbfdff' }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>CIA1 Limits</div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                      <label style={{ fontSize: 12 }}>
                        CO-1 Max
                        <input
                          type="number"
                          value={String(assessmentConfig.assessments?.cia1?.coMax?.co1 ?? cia1DerivedCoMax(cia1Questions).co1)}
                          onChange={(e) =>
                            setAssessmentConfig((p) => ({
                              ...p,
                              assessments: {
                                ...(p.assessments || {}),
                                cia1: {
                                  ...(p.assessments?.cia1 || {}),
                                  coMax: {
                                    ...(p.assessments?.cia1 as any)?.coMax,
                                    co1: Math.max(0, Number(e.target.value || 0)),
                                  },
                                },
                              },
                            }))
                          }
                          style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90, textAlign: 'center' }}
                        />
                      </label>
                      <label style={{ fontSize: 12 }}>
                        CO-2 Max
                        <input
                          type="number"
                          value={String(assessmentConfig.assessments?.cia1?.coMax?.co2 ?? cia1DerivedCoMax(cia1Questions).co2)}
                          onChange={(e) =>
                            setAssessmentConfig((p) => ({
                              ...p,
                              assessments: {
                                ...(p.assessments || {}),
                                cia1: {
                                  ...(p.assessments?.cia1 || {}),
                                  coMax: {
                                    ...(p.assessments?.cia1 as any)?.coMax,
                                    co2: Math.max(0, Number(e.target.value || 0)),
                                  },
                                },
                              },
                            }))
                          }
                          style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90, textAlign: 'center' }}
                        />
                      </label>
                    </div>

                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>BTL Max Marks (1 to 6)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(70px, 1fr))', gap: 8 }}>
                      {(['1', '2', '3', '4', '5', '6'] as const).map((k) => (
                        <label key={k} style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ color: '#111827' }}>BTL-{k}</span>
                          <input
                            type="number"
                            value={String((assessmentConfig.assessments?.cia1 as any)?.btlMax?.[k] ?? cia1DerivedBtlMax(cia1Questions)[k])}
                            onChange={(e) =>
                              setAssessmentConfig((p) => ({
                                ...p,
                                assessments: {
                                  ...(p.assessments || {}),
                                  cia1: {
                                    ...(p.assessments?.cia1 || {}),
                                    btlMax: {
                                      ...((p.assessments?.cia1 as any)?.btlMax || {}),
                                      [k]: Math.max(0, Number(e.target.value || 0)),
                                    },
                                  },
                                },
                              }))
                            }
                            style={{ padding: 6, borderRadius: 8, border: '1px solid #d1d5db', textAlign: 'center' }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ flex: '2 1 520px', border: '1px solid #eef2f7', borderRadius: 12, padding: 12, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>CIA1 Question Headers</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Select question rows and apply Max / CO / BTL in bulk.</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          placeholder="Max"
                          value={bulkCia1Max}
                          onChange={(e) => setBulkCia1Max(e.target.value)}
                          style={{ padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90 }}
                        />
                        <select value={bulkCia1Co} onChange={(e) => setBulkCia1Co(e.target.value as any)} style={{ padding: 6, borderRadius: 8, border: '1px solid #d1d5db' }}>
                          <option value="">CO</option>
                          <option value="1">CO-1</option>
                          <option value="2">CO-2</option>
                          <option value="1&2">CO-1&CO-2 (split)</option>
                        </select>
                        <select value={bulkCia1Btl} onChange={(e) => setBulkCia1Btl(e.target.value as any)} style={{ padding: 6, borderRadius: 8, border: '1px solid #d1d5db' }}>
                          <option value="">BTL</option>
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={String(n)}>
                              BTL-{n}
                            </option>
                          ))}
                        </select>
                        <button onClick={applyBulkToSelectedCia1} disabled={!selectedCia1List.length} style={{ padding: '8px 10px' }}>
                          Apply to Selected ({selectedCia1List.length})
                        </button>
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto', marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                        <thead>
                          <tr>
                            <th style={{ borderBottom: '1px solid #e5e7eb', padding: 10, background: '#f8fafc', textAlign: 'center' }}>Sel</th>
                            <th style={{ borderBottom: '1px solid #e5e7eb', padding: 10, background: '#f8fafc', textAlign: 'left' }}>Key</th>
                            <th style={{ borderBottom: '1px solid #e5e7eb', padding: 10, background: '#f8fafc', textAlign: 'left' }}>Label</th>
                            <th style={{ borderBottom: '1px solid #e5e7eb', padding: 10, background: '#f8fafc', textAlign: 'center' }}>Max</th>
                            <th style={{ borderBottom: '1px solid #e5e7eb', padding: 10, background: '#f8fafc', textAlign: 'center' }}>CO</th>
                            <th style={{ borderBottom: '1px solid #e5e7eb', padding: 10, background: '#f8fafc', textAlign: 'center' }}>BTL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cia1Questions.map((q, idx) => (
                            <tr key={q.key} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                              <td style={{ borderTop: '1px solid #f1f5f9', padding: 10, textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedCia1Keys[q.key])}
                                  onChange={(e) => setSelectedCia1Keys((p) => ({ ...p, [q.key]: e.target.checked }))}
                                />
                              </td>
                              <td style={{ borderTop: '1px solid #f1f5f9', padding: 10 }}>{q.key}</td>
                              <td style={{ borderTop: '1px solid #f1f5f9', padding: 10 }}>
                                <input
                                  value={q.label}
                                  onChange={(e) =>
                                    setAssessmentConfig((p) => {
                                      const qs = (p.assessments?.cia1?.questions || DEFAULT_CIA1_QUESTIONS).slice();
                                      const next = qs.map((x) => (x.key === q.key ? { ...x, label: e.target.value } : x));
                                      return { ...p, assessments: { ...(p.assessments || {}), cia1: { ...(p.assessments?.cia1 || {}), questions: next } } };
                                    })
                                  }
                                  style={{ padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: '100%' }}
                                />
                              </td>
                              <td style={{ borderTop: '1px solid #f1f5f9', padding: 10, textAlign: 'center' }}>
                                <input
                                  type="number"
                                  value={String(q.max)}
                                  onChange={(e) =>
                                    setAssessmentConfig((p) => {
                                      const v = Math.max(0, Number(e.target.value || 0));
                                      const qs = (p.assessments?.cia1?.questions || DEFAULT_CIA1_QUESTIONS).slice();
                                      const next = qs.map((x) => (x.key === q.key ? { ...x, max: v } : x));
                                      const synced = syncCia1DerivedLimits({
                                        prevQuestions: qs,
                                        nextQuestions: next,
                                        existingCoMax: (p.assessments?.cia1 as any)?.coMax,
                                        existingBtlMax: (p.assessments?.cia1 as any)?.btlMax,
                                      });
                                      return {
                                        ...p,
                                        assessments: {
                                          ...(p.assessments || {}),
                                          cia1: { ...(p.assessments?.cia1 || {}), questions: next, coMax: synced.coMax, btlMax: synced.btlMax },
                                        },
                                      };
                                    })
                                  }
                                  style={{ padding: 6, borderRadius: 8, border: '1px solid #d1d5db', width: 90, textAlign: 'center' }}
                                />
                              </td>
                              <td style={{ borderTop: '1px solid #f1f5f9', padding: 10, textAlign: 'center' }}>
                                <select
                                  value={String(q.co)}
                                  onChange={(e) =>
                                    setAssessmentConfig((p) => {
                                      const raw = String(e.target.value);
                                      const v = raw === '1&2' ? ('1&2' as const) : ((Number(raw) === 2 ? 2 : 1) as 1 | 2);
                                      const qs = (p.assessments?.cia1?.questions || DEFAULT_CIA1_QUESTIONS).slice();
                                      const next = qs.map((x) => (x.key === q.key ? { ...x, co: v } : x));
                                      const synced = syncCia1DerivedLimits({
                                        prevQuestions: qs,
                                        nextQuestions: next,
                                        existingCoMax: (p.assessments?.cia1 as any)?.coMax,
                                        existingBtlMax: (p.assessments?.cia1 as any)?.btlMax,
                                      });
                                      return {
                                        ...p,
                                        assessments: {
                                          ...(p.assessments || {}),
                                          cia1: { ...(p.assessments?.cia1 || {}), questions: next, coMax: synced.coMax, btlMax: synced.btlMax },
                                        },
                                      };
                                    })
                                  }
                                  style={{ padding: 6, borderRadius: 8, border: '1px solid #d1d5db' }}
                                >
                                  <option value="1">1</option>
                                  <option value="2">2</option>
                                  <option value="1&2">1&2</option>
                                </select>
                              </td>
                              <td style={{ borderTop: '1px solid #f1f5f9', padding: 10, textAlign: 'center' }}>
                                <select
                                  value={String(q.btl)}
                                  onChange={(e) =>
                                    setAssessmentConfig((p) => {
                                      const v = Math.min(6, Math.max(1, Number(e.target.value || 1))) as 1 | 2 | 3 | 4 | 5 | 6;
                                      const qs = (p.assessments?.cia1?.questions || DEFAULT_CIA1_QUESTIONS).slice();
                                      const next = qs.map((x) => (x.key === q.key ? { ...x, btl: v } : x));
                                      const synced = syncCia1DerivedLimits({
                                        prevQuestions: qs,
                                        nextQuestions: next,
                                        existingCoMax: (p.assessments?.cia1 as any)?.coMax,
                                        existingBtlMax: (p.assessments?.cia1 as any)?.btlMax,
                                      });
                                      return {
                                        ...p,
                                        assessments: {
                                          ...(p.assessments || {}),
                                          cia1: { ...(p.assessments?.cia1 || {}), questions: next, coMax: synced.coMax, btlMax: synced.btlMax },
                                        },
                                      };
                                    })
                                  }
                                  style={{ padding: 6, borderRadius: 8, border: '1px solid #d1d5db' }}
                                >
                                  {[1, 2, 3, 4, 5, 6].map((n) => (
                                    <option key={n} value={String(n)}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              {saving ? 'Saving...' : tab === 'po' ? 'Save Global PO Mapping' : 'Save Assessment Headers'}
            </button>
          </div>
      </div>
    </main>
  );
}
