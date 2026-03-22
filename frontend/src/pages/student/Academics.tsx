import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { AlertCircle, Target, Award, BookOpen } from 'lucide-react';
import { normalizeClassType } from '../../constants/classTypes';

export default function StudentAcademics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'cycle1' | 'cycle2' | 'model'>('cycle1');

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth('/api/academics/student/marks/');
        if (!mounted) return;
        if (!res.ok) {
          setError(`Failed to load marks (HTTP ${res.status}).`);
          setData(null);
          return;
        }
        const j = await res.json();
        if (mounted) setData(j);
      } catch (e) {
        if (mounted) {
          setError('Failed to load marks.');
          setData(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const courses = Array.isArray(data?.courses) ? data.courses : [];
  const semesterNumber = data?.semester?.number ?? null;

  const fmt = (v: any) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (Number.isFinite(n)) return String(n);
    return String(v);
  };

  const sumNums = (...vals: any[]) => {
    const nums = vals
      .map((v) => (v === null || v === undefined || v === '' ? null : Number(v)))
      .filter((n) => Number.isFinite(n)) as number[];
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0);
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const calcWeightedPct = (
    bi: any,
    items: Array<{ prefix: string; co: number; weight: number }>
  ): number | null => {
    if (!bi || typeof bi !== 'object') return null;
    let maxW = 0;
    let score = 0;
    let hasAny = false;

    for (const it of items) {
      const w = Number(it.weight) || 0;
      if (w <= 0) continue;
      maxW += w;

      const vRaw = bi[`${it.prefix}_co${it.co}`];
      const mxRaw = bi[`${it.prefix}_co${it.co}_max`];
      const v = vRaw == null || vRaw === '' ? null : Number(vRaw);
      const mx = mxRaw == null || mxRaw === '' ? null : Number(mxRaw);
      if (v == null || !Number.isFinite(v) || mx == null || !Number.isFinite(mx) || mx <= 0) {
        continue;
      }
      hasAny = true;
      score += (v / mx) * w;
    }

    if (!maxW) return null;
    if (!hasAny) return null;
    return round2((score / maxW) * 100);
  };

  const internalPctForView = (
    classType: string,
    enabledSet: Set<string>,
    bi: any,
    view: 'cycle1' | 'cycle2' | 'model'
  ): number | null => {
    // Internal Mark page weights (default theory-like mapping)
    const W = {
      ssa: 1.5,
      cia: 3.0,
      fa: 2.5,
    };
    const ME = { co1: 2.0, co2: 2.0, co3: 2.0, co4: 2.0, co5: 4.0 };

    const ct = normalizeClassType(classType);
    const isSpecial = ct === 'SPECIAL' && enabledSet.size > 0;
    const allow = (k: string) => (!isSpecial ? true : enabledSet.has(String(k || '').trim().toLowerCase()));

    const fa1 = ct === 'TCPR' || ct === 'PROJECT' ? 'review1' : 'formative1';
    const fa2 = ct === 'TCPR' || ct === 'PROJECT' ? 'review2' : 'formative2';

    if (view === 'cycle1') {
      if (ct === 'LAB' || ct === 'PRACTICAL') {
        return calcWeightedPct(bi, [
          { prefix: 'cia1', co: 1, weight: W.cia },
          { prefix: 'cia1', co: 2, weight: W.cia },
        ]);
      }
      if (ct === 'PROJECT') {
        return calcWeightedPct(bi, [
          { prefix: 'review1', co: 1, weight: W.fa },
          { prefix: 'review1', co: 2, weight: W.fa },
        ]);
      }
      const items: Array<{ prefix: string; co: number; weight: number }> = [];
      if (allow('ssa1')) {
        items.push({ prefix: 'ssa1', co: 1, weight: W.ssa }, { prefix: 'ssa1', co: 2, weight: W.ssa });
      }
      if (allow('cia1')) {
        items.push({ prefix: 'cia1', co: 1, weight: W.cia }, { prefix: 'cia1', co: 2, weight: W.cia });
      }
      if (allow('formative1')) {
        items.push({ prefix: fa1, co: 1, weight: W.fa }, { prefix: fa1, co: 2, weight: W.fa });
      }
      return calcWeightedPct(bi, items);
    }

    if (view === 'cycle2') {
      if (ct === 'LAB' || ct === 'PRACTICAL') {
        return calcWeightedPct(bi, [
          { prefix: 'cia2', co: 3, weight: W.cia },
          { prefix: 'cia2', co: 4, weight: W.cia },
        ]);
      }
      if (ct === 'PROJECT') {
        return calcWeightedPct(bi, [
          { prefix: 'review2', co: 3, weight: W.fa },
          { prefix: 'review2', co: 4, weight: W.fa },
        ]);
      }
      const items: Array<{ prefix: string; co: number; weight: number }> = [];
      if (allow('ssa2')) {
        items.push({ prefix: 'ssa2', co: 3, weight: W.ssa }, { prefix: 'ssa2', co: 4, weight: W.ssa });
      }
      if (allow('cia2')) {
        items.push({ prefix: 'cia2', co: 3, weight: W.cia }, { prefix: 'cia2', co: 4, weight: W.cia });
      }
      if (allow('formative2')) {
        items.push({ prefix: fa2, co: 3, weight: W.fa }, { prefix: fa2, co: 4, weight: W.fa });
      }
      return calcWeightedPct(bi, items);
    }

    // MODEL: BI view currently does not expose ME per-CO columns; keep null (UI shows )
    // If BI adds me_co1..me_co5 in future, we can compute using ME weights.
    return null;
  };

  const renderAssessmentWithCOs = (label: string, mainValue: any, biData: any, biPrefix: string, cqiPrefix: string | null) => {
    if (mainValue == null || mainValue === '') return null;
    
    const coKeys = [1, 2, 3, 4, 5, 6];
    const coMarks: any[] = [];
    coKeys.forEach(coNum => {
      const coVal = biData?.[`${biPrefix}_co${coNum}`];
      let cqiNeedsAction = false;
      if (cqiPrefix && biData) {
        cqiNeedsAction = !!biData[`${cqiPrefix}_flag_co${coNum}`];
      }
      if (coVal != null) {
        coMarks.push({ co: `CO${coNum}`, val: coVal, cqi: cqiNeedsAction });
      }
    });

    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-3">
        <div className="flex justify-between items-center px-4 py-3 bg-gray-50/50 border-b border-gray-100">
          <span className="font-semibold text-gray-700 text-sm tracking-wide">{label}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Total</span>
            <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-100">{fmt(mainValue)}</span>
          </div>
        </div>
        
        {coMarks.length > 0 && (
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 ml-1">CO Breakdown</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {coMarks.map((m: any) => (
                <div key={m.co} title={m.cqi ? 'CQI Needs Action' : ''} className={`flex flex-col rounded-lg p-2 border ${m.cqi ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex justify-between items-center mb-1 gap-1">
                    <span className="text-xs font-bold text-gray-600">{m.co}</span>
                    <span className="text-sm font-black text-gray-900">{fmt(m.val)}</span>
                  </div>
                  {m.cqi && (
                    <div className="flex items-center justify-center gap-1 mt-0.5 text-[9px] font-bold text-red-600 bg-red-100 py-0.5 px-1 rounded w-full">
                      <AlertCircle size={10} strokeWidth={3} />
                      CQI ATTAINED
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8 font-inter">
      <div className="max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
              <BookOpen className="text-indigo-600" size={32} />
              Academic Progress
            </h1>
            <p className="text-sm text-gray-500 mt-2 font-medium">
              {semesterNumber ? `Semester ${semesterNumber} · ` : ''}Detailed breakdown of internal continuous assessments and CQI status.
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveView('cycle1')}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${activeView === 'cycle1' ? 'bg-slate-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Cycle 1
            </button>
            <button
              type="button"
              onClick={() => setActiveView('cycle2')}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${activeView === 'cycle2' ? 'bg-slate-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Cycle 2
            </button>
            <button
              type="button"
              onClick={() => setActiveView('model')}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${activeView === 'model' ? 'bg-slate-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Model
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48 bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm flex items-start gap-3">
            <AlertCircle className="text-red-500 mt-0.5" size={20} />
            <span className="text-red-800 text-sm font-medium">{error}</span>
          </div>
        ) : !courses.length ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-200 shadow-sm">
            <Target className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-gray-900">No courses found</h3>
            <p className="text-gray-500 mt-1">No academic data available for the current semester.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
            {courses.map((c: any) => {
              const m = c.marks || {};
              const bi = m.bi || {};
              const ct = normalizeClassType(c.class_type);
              const enabledSet = new Set<string>(
                (Array.isArray(c.enabled_assessments) ? c.enabled_assessments : [])
                  .map((x: any) => String(x || '').trim().toLowerCase())
                  .filter(Boolean)
              );
              const isSpecial = ct === 'SPECIAL' && enabledSet.size > 0;
              const allow = (k: string) => (!isSpecial ? true : enabledSet.has(String(k || '').trim().toLowerCase()));
              const modelRaw = m.model ?? m.model_exam;
              const modelPctFallback =
                activeView === 'model' && modelRaw != null && modelRaw !== '' && Number.isFinite(Number(modelRaw))
                  ? round2(Number(modelRaw))
                  : null;
              const internalPct = internalPctForView(ct, enabledSet, bi, activeView) ?? modelPctFallback;

              // Collect the assessments based on class type
              let c1Items: any[] = [];
              let c2Items: any[] = [];
              let modelItems: any[] = [];

              if (ct === 'LAB') {
                c1Items = [{ label: 'CIA 1 LAB', val: m.cia1, prefix: 'cia1', cqiPrefix: 'cqi_c1' }];
                c2Items = [{ label: 'CIA 2 LAB', val: m.cia2, prefix: 'cia2', cqiPrefix: 'cqi_c2' }];
                modelItems = [{ label: 'MODEL LAB', val: m.model ?? m.model_exam, prefix: 'model' }];
              } else if (ct === 'PRACTICAL') {
                c1Items = [{ label: 'CIA 1', val: m.cia1, prefix: 'cia1', cqiPrefix: 'cqi_c1' }];
                c2Items = [{ label: 'CIA 2', val: m.cia2, prefix: 'cia2', cqiPrefix: 'cqi_c2' }];
                modelItems = [{ label: 'MODEL', val: m.model ?? m.model_exam, prefix: 'model' }];
              } else if (ct === 'PROJECT') {
                c1Items = [{ label: 'Review 1', val: m.review1, prefix: 'review1', cqiPrefix: 'cqi_c1' }];
                c2Items = [{ label: 'Review 2', val: m.review2, prefix: 'review2', cqiPrefix: 'cqi_c2' }];
                modelItems = [{ label: 'MODEL', val: m.model ?? m.model_exam, prefix: 'model' }];
              } else if (ct === 'TCPR') {
                c1Items = [
                  { label: 'SSA 1', val: m.ssa1, prefix: 'ssa1', cqiPrefix: 'cqi_c1' },
                  { label: 'Review 1', val: m.review1, prefix: 'review1', cqiPrefix: 'cqi_c1' },
                  { label: 'CIA 1', val: m.cia1, prefix: 'cia1', cqiPrefix: 'cqi_c1' }
                ];
                c2Items = [
                  { label: 'SSA 2', val: m.ssa2, prefix: 'ssa2', cqiPrefix: 'cqi_c2' },
                  { label: 'Review 2', val: m.review2, prefix: 'review2', cqiPrefix: 'cqi_c2' },
                  { label: 'CIA 2', val: m.cia2, prefix: 'cia2', cqiPrefix: 'cqi_c2' }
                ];
                modelItems = [{ label: 'Model Exam', val: m.model ?? m.model_exam, prefix: 'model' }];
              } else if (ct === 'TCPL') {
                c1Items = [
                  { label: 'SSA 1', val: m.ssa1, prefix: 'ssa1', cqiPrefix: 'cqi_c1' },
                  { label: 'LAB 1', val: m.formative1, prefix: 'formative1', cqiPrefix: 'cqi_c1' },
                  { label: 'CIA 1', val: m.cia1, prefix: 'cia1', cqiPrefix: 'cqi_c1' }
                ];
                c2Items = [
                  { label: 'SSA 2', val: m.ssa2, prefix: 'ssa2', cqiPrefix: 'cqi_c2' },
                  { label: 'LAB 2', val: m.formative2, prefix: 'formative2', cqiPrefix: 'cqi_c2' },
                  { label: 'CIA 2', val: m.cia2, prefix: 'cia2', cqiPrefix: 'cqi_c2' }
                ];
                modelItems = [{ label: 'Model Exam', val: m.model ?? m.model_exam, prefix: 'model' }];
              } else if (isSpecial) {
                // SPECIAL: only the enabled subset of SSA/CIA/Formative and no MODEL
                c1Items = [
                  ...(allow('ssa1') ? [{ label: 'SSA 1', val: m.ssa1, prefix: 'ssa1', cqiPrefix: 'cqi_c1' }] : []),
                  ...(allow('formative1') ? [{ label: 'Formative 1', val: m.formative1, prefix: 'formative1', cqiPrefix: 'cqi_c1' }] : []),
                  ...(allow('cia1') ? [{ label: 'CIA 1', val: m.cia1, prefix: 'cia1', cqiPrefix: 'cqi_c1' }] : []),
                ];
                c2Items = [
                  ...(allow('ssa2') ? [{ label: 'SSA 2', val: m.ssa2, prefix: 'ssa2', cqiPrefix: 'cqi_c2' }] : []),
                  ...(allow('formative2') ? [{ label: 'Formative 2', val: m.formative2, prefix: 'formative2', cqiPrefix: 'cqi_c2' }] : []),
                  ...(allow('cia2') ? [{ label: 'CIA 2', val: m.cia2, prefix: 'cia2', cqiPrefix: 'cqi_c2' }] : []),
                ];
                modelItems = [];
              } else {
                c1Items = [
                  { label: 'SSA 1', val: m.ssa1, prefix: 'ssa1', cqiPrefix: 'cqi_c1' },
                  { label: 'Formative 1', val: m.formative1, prefix: 'formative1', cqiPrefix: 'cqi_c1' },
                  { label: 'CIA 1', val: m.cia1, prefix: 'cia1', cqiPrefix: 'cqi_c1' }
                ];
                c2Items = [
                  { label: 'SSA 2', val: m.ssa2, prefix: 'ssa2', cqiPrefix: 'cqi_c2' },
                  { label: 'Formative 2', val: m.formative2, prefix: 'formative2', cqiPrefix: 'cqi_c2' },
                  { label: 'CIA 2', val: m.cia2, prefix: 'cia2', cqiPrefix: 'cqi_c2' }
                ];
                modelItems = [{ label: 'Model Exam', val: m.model ?? m.model_exam, prefix: 'model' }];
              }

              return (
                <div key={c.id || c.code} className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-200 overflow-hidden flex flex-col">
                  {/* Card Header */}
                  <div className="bg-slate-900 text-white p-5 border-b border-slate-800">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/10 text-white tracking-widest uppercase mb-3 border border-white/10">
                          {c.code || 'CODE'}
                        </div>
                        <h2 className="text-lg font-bold leading-tight line-clamp-2">{c.name || 'Course Name'}</h2>
                      </div>
                      <div className="bg-white/10 p-2 rounded-xl flex items-center justify-center border border-white/10">
                        <Award className="text-white/80" size={24} />
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-5 flex-grow">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <div className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mr-2">Internal</span>
                        <span className="text-sm font-extrabold text-gray-900">{internalPct == null ? '—' : `${fmt(internalPct)}%`}</span>
                      </div>
                      <div className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mr-2">Total</span>
                        <span className="text-sm font-extrabold text-gray-900">
                          {internalPct == null ? '— / 100' : `${fmt(internalPct)} / 100`}
                        </span>
                      </div>
                    </div>

                    {activeView === 'cycle1' ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                          <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cycle 1</h3>
                        </div>
                        {c1Items.some((it) => it.val != null && it.val !== '') ? (
                          c1Items.map((item, idx) => (
                            <React.Fragment key={idx}>
                              {renderAssessmentWithCOs(item.label, item.val, bi, item.prefix, item.cqiPrefix)}
                            </React.Fragment>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">No Cycle 1 marks available yet.</div>
                        )}
                      </div>
                    ) : activeView === 'cycle2' ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                          <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cycle 2</h3>
                        </div>
                        {c2Items.some((it) => it.val != null && it.val !== '') ? (
                          c2Items.map((item, idx) => (
                            <React.Fragment key={idx}>
                              {renderAssessmentWithCOs(item.label, item.val, bi, item.prefix, item.cqiPrefix)}
                            </React.Fragment>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">No Cycle 2 marks available yet.</div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                          <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Model</h3>
                        </div>
                        {modelItems.some((it) => it.val != null && it.val !== '') ? (
                          modelItems.map((item, idx) => (
                            <React.Fragment key={`model-${idx}`}>
                              {renderAssessmentWithCOs(item.label, item.val, bi, item.prefix, null)}
                            </React.Fragment>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">No model marks available yet.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
