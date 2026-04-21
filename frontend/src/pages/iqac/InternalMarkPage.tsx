import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { normalizeClassType, normalizeObeClassType } from '../../constants/classTypes';
import { fetchDeptRows, fetchMasters } from '../../services/curriculum';
import { fetchClassTypeWeights, fetchInternalMarkMapping, upsertClassTypeWeights, upsertInternalMarkMapping } from '../../services/obe';
import fetchWithAuth from '../../services/fetchAuth';

type CqiPublishedData = {
  publishedAt?: string;
  coNumbers?: number[];
  entries?: Record<string, Record<string, number | null>>;
};

export default function InternalMarkPage(): JSX.Element {
  const { courseCode, taId } = useParams<{ courseCode: string; taId: string }>();
  const subjectId = String(courseCode || '');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, any> | null>(null);
  const [classType, setClassType] = useState<string | null>(null);

  // SPECIAL exam-level weights state
  const SPECIAL_EXAMS = ['SSA1', 'SSA2', 'CIA1', 'CIA2', 'MODEL'] as const;
  const DEFAULT_SPECIAL_WEIGHTS: Record<string, number> = { SSA1: 10, SSA2: 10, CIA1: 5, CIA2: 5, MODEL: 10 };
  const [specialWeights, setSpecialWeights] = useState<Record<string, number>>({ ...DEFAULT_SPECIAL_WEIGHTS });
  const [specialLoaded, setSpecialLoaded] = useState(false);

  // Slider tab state
  const [activeTab, setActiveTab] = useState<'actual' | 'after-cqi'>('actual');
  const [cqiLoading, setCqiLoading] = useState(false);
  const [cqiPublished, setCqiPublished] = useState<CqiPublishedData | null>(null);
  const [cqiError, setCqiError] = useState<string | null>(null);
  const [cqiFetched, setCqiFetched] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subjectId) return;
      try {
        const [rows, masters] = await Promise.all([fetchDeptRows(), fetchMasters()]);
        if (!mounted) return;
        const code = String(subjectId).trim().toUpperCase();
        const matches = (rows || []).filter((r: any) => String(r?.course_code || '').trim().toUpperCase() === code);
        const pick = matches[0];
        if (pick) {
          setClassType(pick?.class_type ? String(pick.class_type) : null);
        } else {
          const m = (masters || []).find((mm: any) => String(mm?.course_code || '').trim().toUpperCase() === code);
          setClassType(m?.class_type ? String(m.class_type) : null);
        }
      } catch {
        if (!mounted) return;
        setClassType(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectId]);

  // Fetch SPECIAL exam weights from ClassTypeWeights when class_type is SPECIAL
  const isSpecial = normalizeObeClassType(classType) === 'SPECIAL';
  useEffect(() => {
    if (!isSpecial) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const all = await fetchClassTypeWeights();
        if (!mounted) return;
        const sp = all?.SPECIAL;
        const im = sp?.internal_mark_weights;
        if (im && typeof im === 'object' && (im as any).type === 'special_exam_weights' && (im as any).weights) {
          const w = (im as any).weights as Record<string, number>;
          setSpecialWeights({ ...DEFAULT_SPECIAL_WEIGHTS, ...w });
        }
        setSpecialLoaded(true);
      } catch {
        if (mounted) setSpecialLoaded(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isSpecial]);

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

  // Fetch CQI published data when switching to After CQI tab
  useEffect(() => {
    if (activeTab !== 'after-cqi' || !taId || cqiFetched) return;
    let mounted = true;
    (async () => {
      setCqiLoading(true);
      setCqiError(null);
      try {
        const res = await fetchWithAuth(
          `/api/obe/cqi-published/${encodeURIComponent(subjectId)}?teaching_assignment_id=${encodeURIComponent(taId)}`
        );
        if (!mounted) return;
        if (res.ok) {
          const j = await res.json().catch(() => null);
          setCqiPublished(j?.published ?? null);
        } else {
          setCqiError('Failed to load CQI data');
        }
      } catch (e: any) {
        if (!mounted) return;
        setCqiError(e?.message || String(e));
      } finally {
        if (mounted) {
          setCqiLoading(false);
          setCqiFetched(true);
        }
      }
    })();
    return () => { mounted = false; };
  }, [activeTab, taId, subjectId, cqiFetched]);

  // Compute per-CO average CQI input from published entries
  const cqiCoAverages = useMemo(() => {
    if (!cqiPublished?.entries) return {} as Record<string, number>;
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const studentEntry of Object.values(cqiPublished.entries)) {
      if (!studentEntry || typeof studentEntry !== 'object') continue;
      for (const [coKey, val] of Object.entries(studentEntry)) {
        if (val == null) continue;
        const n = Number(val);
        if (!Number.isFinite(n)) continue;
        sums[coKey] = (sums[coKey] ?? 0) + n;
        counts[coKey] = (counts[coKey] ?? 0) + 1;
      }
    }
    const avgs: Record<string, number> = {};
    for (const k of Object.keys(sums)) {
      avgs[k] = Math.round((sums[k] / counts[k]) * 100) / 100;
    }
    return avgs;
  }, [cqiPublished]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isSpecial) {
        // Save SPECIAL exam weights to ClassTypeWeights
        await upsertClassTypeWeights({
          SPECIAL: {
            internal_mark_weights: { type: 'special_exam_weights', weights: { ...specialWeights } },
          },
        });
        try { window.dispatchEvent(new CustomEvent('internal-mark:updated', { detail: { subjectId } })); } catch {}
        navigate(-1);
      } else {
        const payload = normalizeMapping(mapping ?? ensureDefault());
        await upsertInternalMarkMapping(subjectId, payload);
        try { window.dispatchEvent(new CustomEvent('internal-mark:updated', { detail: { subjectId } })); } catch {}
        navigate(-1);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 18 }}>Loading…</div>;

  // ── SPECIAL: exam-level weights (SSA1, SSA2, CIA1, CIA2, MODEL) ──────
  if (isSpecial) {
    const spTotal = SPECIAL_EXAMS.reduce((s, k) => s + (Number(specialWeights[k]) || 0), 0);
    return (
      <main style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Internal Mark Weights — {subjectId} (Special)</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="obe-btn" onClick={() => navigate(-1)}>Back</button>
            <button className="obe-btn obe-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
          Special courses use exam-level weights. Each exam is scaled to its configured weight.
          Total must equal 40.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {SPECIAL_EXAMS.map((e) => (
                  <th key={e} style={{ border: '1px solid #d1d5db', padding: '10px 18px', background: '#f3f4f6', fontWeight: 700, fontSize: 14 }}>{e}</th>
                ))}
                <th style={{ border: '1px solid #d1d5db', padding: '10px 18px', background: '#e0e7ff', fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {SPECIAL_EXAMS.map((e) => (
                  <td key={e} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb' }}>
                    <input
                      type="number"
                      step="0.5"
                      value={specialWeights[e] ?? 0}
                      onChange={(ev) => {
                        const n = ev.target.value === '' ? 0 : Number(ev.target.value);
                        setSpecialWeights((prev) => ({ ...prev, [e]: Number.isFinite(n) ? n : 0 }));
                      }}
                      style={{ width: 80, padding: 8, fontSize: 14, textAlign: 'center' }}
                    />
                  </td>
                ))}
                <td style={{
                  border: '1px solid #e5e7eb',
                  padding: '10px 18px',
                  background: spTotal === 40 ? '#dcfce7' : '#fef9c3',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: 16,
                  color: spTotal === 40 ? '#166534' : '#854d0e',
                }}>
                  {spTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {spTotal !== 40 && (
          <div style={{ marginTop: 10, color: '#854d0e', fontSize: 13, background: '#fef9c3', padding: '8px 14px', borderRadius: 6, border: '1px solid #fde047', display: 'inline-block' }}>
            Total is {spTotal}. Expected: 40.
          </div>
        )}
        {error ? <div style={{ color: 'red', marginTop: 12 }}>{error}</div> : null}
      </main>
    );
  }

  const m = normalizeMapping(mapping ?? ensureDefault());
  const headers: string[] = m.header;
  const weightsArr: any[] = m.weights;
  const cycles: string[] = m.cycles;
  const isTcpl = normalizeClassType(classType) === 'TCPL';

  // Per-CO internal weight totals (cycle components + ME column)
  // Columns layout (non-TCPL 17-slot):
  //   CO1: [0,1,2] cycle + [12] ME
  //   CO2: [3,4,5] cycle + [13] ME
  //   CO3: [6,7,8] cycle + [14] ME
  //   CO4: [9,10,11] cycle + [15] ME
  //   CO5: [16] ME only
  const coInternalMax = useMemo(() => {
    const w = weightsArr.map((x) => Number(x) || 0);
    return {
      co1: (w[0] ?? 0) + (w[1] ?? 0) + (w[2] ?? 0) + (w[12] ?? 0),
      co2: (w[3] ?? 0) + (w[4] ?? 0) + (w[5] ?? 0) + (w[13] ?? 0),
      co3: (w[6] ?? 0) + (w[7] ?? 0) + (w[8] ?? 0) + (w[14] ?? 0),
      co4: (w[9] ?? 0) + (w[10] ?? 0) + (w[11] ?? 0) + (w[15] ?? 0),
      co5: (w[16] ?? 0),
    };
  }, [weightsArr]);

  const coList = ['co1', 'co2', 'co3', 'co4', 'co5'] as const;
  const publishedCoSet = new Set((cqiPublished?.coNumbers ?? []).map((n) => `co${n}`));

  return (
    <main style={{ padding: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Internal Mark Mapping - {subjectId}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="obe-btn" onClick={() => navigate(-1)}>Back</button>
          {activeTab === 'actual' && (
            <button className="obe-btn obe-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Slider Tab Bar */}
      <div style={{ position: 'relative', display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' }}>
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: activeTab === 'actual' ? 4 : 'calc(50% + 2px)',
            width: 'calc(50% - 6px)',
            height: 'calc(100% - 8px)',
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            transition: 'left 0.25s cubic-bezier(.4,0,.2,1)',
          }}
        />
        <button
          onClick={() => setActiveTab('actual')}
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '8px 28px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'actual' ? 600 : 400,
            color: activeTab === 'actual' ? '#1d4ed8' : '#6b7280',
            borderRadius: 8,
            fontSize: 14,
            transition: 'color 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          Actual
        </button>
        <button
          onClick={() => setActiveTab('after-cqi')}
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '8px 28px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'after-cqi' ? 600 : 400,
            color: activeTab === 'after-cqi' ? '#1d4ed8' : '#6b7280',
            borderRadius: 8,
            fontSize: 14,
            transition: 'color 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          After CQI
        </button>
      </div>

      {/* ── Tab 1: Actual ── */}
      {activeTab === 'actual' && (
        <>
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
                    <th key={`cy-${i}`} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb', fontWeight: 600 }}>
                      {isTcpl && String(c).toLowerCase() === 'fa' ? 'Lab' : c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {weightsArr.map((w, i) => (
                    <td key={i} style={{ border: '1px solid #e5e7eb', padding: 6, background: '#f3f4f6' }}>
                      <input
                        type="number"
                        step="0.1"
                        value={w === '' ? '' : String(w)}
                        onChange={(e) => handleCellChange(i, e.target.value)}
                        style={{ width: 70, padding: 6 }}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {error ? <div style={{ color: 'red', marginTop: 12 }}>{error}</div> : null}
        </>
      )}

      {/* ── Tab 2: After CQI ── */}
      {activeTab === 'after-cqi' && (
        <div>
          {!taId ? (
            <div style={{ padding: 16, background: '#fef9c3', borderRadius: 8, border: '1px solid #fde047', color: '#854d0e' }}>
              No teaching assignment context available. Open this page from a specific teaching assignment to view CQI data.
            </div>
          ) : cqiLoading ? (
            <div style={{ padding: 16, color: '#6b7280' }}>Loading CQI data…</div>
          ) : cqiError ? (
            <div style={{ padding: 16, color: 'red' }}>{cqiError}</div>
          ) : !cqiPublished ? (
            <div style={{ padding: 16, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', color: '#0c4a6e' }}>
              CQI has not been published yet for this course. Once CQI is published, the combined marks will appear here.
            </div>
          ) : (
            <>
              {/* Published badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 20, padding: '4px 14px', fontWeight: 600, fontSize: 13, border: '1px solid #86efac' }}>
                  ✓ CQI Published
                </span>
                {cqiPublished.publishedAt && (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>
                    on {new Date(cqiPublished.publishedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Read-only base weights table */}
              <div style={{ marginBottom: 20, overflowX: 'auto' }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#374151', fontSize: 13 }}>Base Internal Weights</div>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} style={{ border: '1px solid #d1d5db', padding: 8, background: '#f3f4f6', fontSize: 13 }}>{h}</th>
                      ))}
                    </tr>
                    <tr>
                      {cycles.map((c, i) => (
                        <th key={`cy-${i}`} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb', fontWeight: 600, fontSize: 13 }}>
                          {isTcpl && String(c).toLowerCase() === 'fa' ? 'Lab' : c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {weightsArr.map((w, i) => (
                        <td key={i} style={{ border: '1px solid #e5e7eb', padding: 8, background: '#f9fafb', textAlign: 'center', fontSize: 13 }}>
                          {w === '' ? '—' : String(w)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Per-CO summary: Internal Max + Avg CQI Mark = Total After CQI */}
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151', fontSize: 13 }}>CO-wise Summary After CQI</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr>
                      {['CO', 'Internal Max', 'Avg CQI Mark', 'Total After CQI', 'CQI Applied'].map((h) => (
                        <th
                          key={h}
                          style={{
                            border: '1px solid #d1d5db',
                            padding: '10px 16px',
                            background: '#1d4ed8',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 13,
                            textAlign: 'center',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coList.map((coKey, idx) => {
                      const internalMax = coInternalMax[coKey];
                      if (internalMax <= 0) return null;
                      const avgCqi = cqiCoAverages[coKey] ?? null;
                      const hasCqi = publishedCoSet.has(coKey) && avgCqi !== null;
                      const total = hasCqi ? Math.round((internalMax + avgCqi!) * 100) / 100 : internalMax;
                      const label = `CO${idx + 1}`;
                      return (
                        <tr key={coKey} style={{ background: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                          <td style={{ border: '1px solid #e5e7eb', padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#1d4ed8', fontSize: 14 }}>
                            {label}
                          </td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '10px 16px', textAlign: 'center', fontSize: 13 }}>
                            {internalMax}
                          </td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '10px 16px', textAlign: 'center', fontSize: 13, color: hasCqi ? '#065f46' : '#9ca3af' }}>
                            {hasCqi ? `+${avgCqi}` : '—'}
                          </td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '10px 16px', textAlign: 'center', fontWeight: 700, fontSize: 14, color: hasCqi ? '#1d4ed8' : '#374151' }}>
                            {total}
                          </td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '10px 16px', textAlign: 'center', fontSize: 13 }}>
                            {hasCqi ? (
                              <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '2px 10px', fontWeight: 600, fontSize: 12 }}>Yes</span>
                            ) : (
                              <span style={{ background: '#f3f4f6', color: '#9ca3af', borderRadius: 12, padding: '2px 10px', fontSize: 12 }}>No</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 10, color: '#6b7280', fontSize: 12 }}>
                * Avg CQI Mark is the average of all published CQI inputs for each CO across enrolled students.
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
