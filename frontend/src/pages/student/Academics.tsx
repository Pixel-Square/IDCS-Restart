import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';

export default function StudentAcademics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth('/api/academics/student/marks/');
        if (!mounted) return;
        if (!res.ok) {
          const msg = `Failed to load marks (HTTP ${res.status}).`;
          setError(msg);
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

  const fmt = (v: any) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (Number.isFinite(n)) return String(n);
    return String(v);
  };

  const semesterNumber = data?.semester?.number ?? null;

  const internalDisplay = (internalObj: any, cycleKey: 'cycle1' | 'cycle2') => {
    const val = internalObj?.[cycleKey];
    const max =
      cycleKey === 'cycle1'
        ? (internalObj?.max_cycle1 ?? internalObj?.max_total)
        : (internalObj?.max_cycle2 ?? internalObj?.max_total);

    return (
      <span>
        {fmt(val)}
        {max ? <span className="text-gray-400">/{fmt(max)}</span> : null}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-gray-900">My Marks</h1>
        <p className="text-sm text-gray-600 mt-1">
          {semesterNumber ? `Semester ${semesterNumber} · ` : ''}All enrolled courses and marks.
        </p>

        <div className="mt-6">
          {loading ? (
            <div className="text-gray-600 obe-card p-6" role="status">Loading marks…</div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800 text-sm">{error}</div>
          ) : (
            <div>
              {courses.length === 0 ? (
                <div className="text-gray-600 obe-card p-6">No courses found for your semester.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {courses.map((c: any) => {
                    const m = c.marks || {};
                    const internalObj = m.internal || {};
                    const hasCqi = !!m.has_cqi;
                    
                    const ct = String(c.class_type || '').toUpperCase();
                    
                    let c1Keys: Array<{ key: string, label: string, val: any }> = [];
                    let c2Keys: Array<{ key: string, label: string, val: any }> = [];
                    let modelLabel = 'Model Exam';
                    
                    if (ct === 'LAB') {
                      c1Keys = [{ key: 'cia1', label: 'CIA 1 LAB', val: m.cia1 }];
                      c2Keys = [{ key: 'cia2', label: 'CIA 2 LAB', val: m.cia2 }];
                      modelLabel = 'MODEL LAB';
                    } else if (ct === 'PRACTICAL') {
                      c1Keys = [{ key: 'cia1', label: 'CIA 1 Review', val: m.cia1 }];
                      c2Keys = [{ key: 'cia2', label: 'CIA 2 Review', val: m.cia2 }];
                      modelLabel = 'MODEL Review';
                    } else if (ct === 'PROJECT') {
                      c1Keys = [{ key: 'review1', label: 'Review 1', val: m.review1 }];
                      c2Keys = [{ key: 'review2', label: 'Review 2', val: m.review2 }];
                      modelLabel = 'MODEL';
                    } else if (ct === 'TCPR') {
                      c1Keys = [
                        { key: 'ssa1', label: 'SSA 1', val: m.ssa1 },
                        { key: 'review1', label: 'Review 1', val: m.review1 },
                        { key: 'cia1', label: 'CIA 1', val: m.cia1 }
                      ];
                      c2Keys = [
                        { key: 'ssa2', label: 'SSA 2', val: m.ssa2 },
                        { key: 'review2', label: 'Review 2', val: m.review2 },
                        { key: 'cia2', label: 'CIA 2', val: m.cia2 }
                      ];
                    } else if (ct === 'TCPL') {
                      c1Keys = [
                        { key: 'ssa1', label: 'SSA 1', val: m.ssa1 },
                        { key: 'formative1', label: 'LAB 1', val: m.formative1 },
                        { key: 'cia1', label: 'CIA 1', val: m.cia1 }
                      ];
                      c2Keys = [
                        { key: 'ssa2', label: 'SSA 2', val: m.ssa2 },
                        { key: 'formative2', label: 'LAB 2', val: m.formative2 },
                        { key: 'cia2', label: 'CIA 2', val: m.cia2 }
                      ];
                    } else { // THEORY or DEFAULT
                      c1Keys = [
                        { key: 'ssa1', label: 'SSA 1', val: m.ssa1 },
                        { key: 'formative1', label: 'Formative 1', val: m.formative1 },
                        { key: 'cia1', label: 'CIA 1', val: m.cia1 }
                      ];
                      c2Keys = [
                        { key: 'ssa2', label: 'SSA 2', val: m.ssa2 },
                        { key: 'formative2', label: 'Formative 2', val: m.formative2 },
                        { key: 'cia2', label: 'CIA 2', val: m.cia2 }
                      ];
                    }

                    const c1Shown = c1Keys.filter(k => k.val != null && k.val !== '');
                    const c2Shown = c2Keys.filter(k => k.val != null && k.val !== '');

                    const hasCycle1 = c1Shown.length > 0 || (internalObj?.cycle1 != null);
                    const hasCycle2 = c2Shown.length > 0 || (internalObj?.cycle2 != null);
                    
                    const modelVal = m.model ?? m.model_exam;
                    const hasModel = modelVal != null && modelVal !== '';

                    // Helper to get CO values safely
                    const coKeys = ['co1', 'co2', 'co3', 'co4', 'co5', 'co6'];
                    const hasAnyCo = m.cos ? Object.keys(m.cos).length > 0 : coKeys.some(k => m[k] != null);

                    return (
                      <div key={c.code || String(c.id)} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                          <div className="flex justify-between items-start gap-4 mb-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                              {c.code || '—'}
                            </span>
                            {hasCqi && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                CQI Available
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-gray-900 leading-snug line-clamp-2" title={c.name || ''}>{c.name || '—'}</h3>
                          <div className="mt-2 text-xs text-gray-500 font-medium tracking-wide uppercase">
                            {c.class_type ? String(c.class_type) : 'Course'}
                          </div>
                        </div>

                        <div className="p-5 flex-grow">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {/* Cycle 1 */}
                            {hasCycle1 && (
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Cycle 1</h4>
                                <div className="space-y-2.5">
                                  {c1Shown.map(k => (
                                    <div key={k.key} className="flex justify-between items-center text-sm">
                                      <span className="text-gray-500">{k.label}</span>
                                      <span className="font-semibold text-gray-900">{fmt(k.val)}</span>
                                    </div>
                                  ))}
                                  {internalObj?.cycle1 != null && (
                                    <div className="flex justify-between items-center text-sm pt-2.5 mt-1 border-t border-gray-100">
                                      <span className="font-semibold text-indigo-600">Internal</span>
                                      <span className="font-bold text-indigo-700">{internalDisplay(internalObj, 'cycle1')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Cycle 2 */}
                            {hasCycle2 && (
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Cycle 2</h4>
                                <div className="space-y-2.5">
                                  {c2Shown.map(k => (
                                    <div key={k.key} className="flex justify-between items-center text-sm">
                                      <span className="text-gray-500">{k.label}</span>
                                      <span className="font-semibold text-gray-900">{fmt(k.val)}</span>
                                    </div>
                                  ))}
                                  {internalObj?.cycle2 != null && (
                                    <div className="flex justify-between items-center text-sm pt-2.5 mt-1 border-t border-gray-100">
                                      <span className="font-semibold text-indigo-600">Internal</span>
                                      <span className="font-bold text-indigo-700">{internalDisplay(internalObj, 'cycle2')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Model */}
                            {hasModel && (
                              <div className="space-y-3 col-span-1 sm:col-span-2 mt-2 pt-4 border-t border-gray-100">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider pb-1">Model</h4>
                                <div className="flex justify-between items-center text-sm max-w-sm">
                                  <span className="text-gray-500">{modelLabel}</span>
                                  <span className="font-semibold text-gray-900">{fmt(modelVal)}</span>
                                </div>
                              </div>
                            )}

                            {/* CQI / COs */}
                            {hasCqi && (
                              <div className="col-span-1 sm:col-span-2 pt-4 mt-2 border-t border-gray-100">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider pb-3">Course Outcomes (CO)</h4>
                                <div className="flex flex-wrap gap-2.5">
                                  {hasAnyCo ? (
                                    coKeys.map(k => {
                                      const val = m.cos?.[k] ?? m[k];
                                      if (val == null || val === '') return null;
                                      return (
                                        <div key={k} className="flex flex-col items-center justify-center min-w-[52px] bg-emerald-50 rounded p-1.5 border border-emerald-100">
                                          <div className="text-[9px] text-emerald-600 font-bold uppercase">{k}</div>
                                          <div className="text-sm font-bold text-emerald-900 mt-0.5">{fmt(val)}</div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <span className="text-xs italic text-gray-400">CO marks not published or unavailable yet.</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
