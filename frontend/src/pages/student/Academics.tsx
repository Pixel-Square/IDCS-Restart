import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { AlertCircle, Target, Award, BookOpen } from 'lucide-react';

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
    <div className="min-h-screen bg-gray-100/50 p-4 md:p-6 lg:p-8 font-inter">
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
              const ct = String(c.class_type || '').toUpperCase();

              // Collect the assessments based on class type
              let c1Items: any[] = [];
              let c2Items: any[] = [];
              let modelItems: any[] = [];

              if (ct === 'LAB') {
                c1Items = [{ label: 'CIA 1 LAB', val: m.cia1, prefix: 'cia1', cqiPrefix: 'cqi_c1' }];
                c2Items = [{ label: 'CIA 2 LAB', val: m.cia2, prefix: 'cia2', cqiPrefix: 'cqi_c2' }];
                modelItems = [{ label: 'MODEL LAB', val: m.model ?? m.model_exam, prefix: 'model' }];
              } else if (ct === 'PRACTICAL') {
                c1Items = [{ label: 'CIA 1 Review', val: m.cia1, prefix: 'cia1', cqiPrefix: 'cqi_c1' }];
                c2Items = [{ label: 'CIA 2 Review', val: m.cia2, prefix: 'cia2', cqiPrefix: 'cqi_c2' }];
                modelItems = [{ label: 'MODEL Review', val: m.model ?? m.model_exam, prefix: 'model' }];
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
                  <div className="bg-indigo-900 text-white p-5 border-b-4 border-indigo-500">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-800 text-indigo-100 tracking-widest uppercase mb-3">
                          {c.code || 'CODE'}
                        </div>
                        <h2 className="text-lg font-bold leading-tight line-clamp-2">{c.name || 'Course Name'}</h2>
                      </div>
                      <div className="bg-indigo-800/50 p-2 rounded-xl flex items-center justify-center border border-indigo-700">
                        <Award className="text-indigo-300" size={24} />
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-5 flex-grow grid grid-cols-1 md:grid-cols-2 gap-5 xl:gap-8">
                    {/* Cycle 1 Area */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cycle 1</h3>
                      </div>
                      {c1Items.map((item, idx) => (
                        <React.Fragment key={idx}>
                          {renderAssessmentWithCOs(item.label, item.val, bi, item.prefix, item.cqiPrefix)}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Cycle 2 Area */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Cycle 2</h3>
                      </div>
                      {c2Items.map((item, idx) => (
                        <React.Fragment key={idx}>
                          {renderAssessmentWithCOs(item.label, item.val, bi, item.prefix, item.cqiPrefix)}
                        </React.Fragment>
                      ))}

                      {/* Model Area - Rendered under cycle 2 for layout balance if present */}
                      {modelItems.map((item, idx) => item.val != null && item.val !== '' && (
                        <div className="mt-6 pt-4 border-t-2 border-dashed border-gray-100" key={`model-${idx}`}>
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Model</h3>
                            </div>
                            {renderAssessmentWithCOs(item.label, item.val, bi, item.prefix, null)}
                        </div>
                      ))}
                    </div>
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
