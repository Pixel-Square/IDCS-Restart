import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';

export default function StudentAcademics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [tab, setTab] = useState<'cycle1' | 'cycle2'>('cycle1');

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth('/api/academics/student/marks/');
        if (!mounted) return;
        if (!res.ok) {
          setData(null);
          return;
        }
        const j = await res.json();
        if (mounted) setData(j);
      } catch (e) {
        if (mounted) setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const courses = Array.isArray(data?.courses) ? data.courses : [];

  const clamp = (v: any, lo = 0, hi = 0) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    if (hi > lo) return Math.max(lo, Math.min(hi, n));
    return Math.max(lo, n);
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">My Academics</h1>
        <p className="text-sm text-gray-600 mt-1">Your subject marks (personal view).</p>

        <div className="mt-6 bg-white shadow rounded p-4">
          {loading ? (
            <div className="text-gray-600">Loading marks…</div>
          ) : (
            <div>
              <div className="flex gap-2 mb-4">
                <button onClick={() => setTab('cycle1')} className={`px-3 py-1 rounded ${tab==='cycle1' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>Cycle I</button>
                <button onClick={() => setTab('cycle2')} className={`px-3 py-1 rounded ${tab==='cycle2' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>Cycle II</button>
              </div>

              <div className="space-y-4">
                {courses.length === 0 ? (
                  <div className="text-gray-600">No courses found for your semester.</div>
                ) : courses.map((c: any) => {
                  const m = c.marks || {};
                  const cia = tab === 'cycle1' ? m.cia1 : m.cia2;
                  const ciaMax = (m.cia_max !== null && m.cia_max !== undefined) ? Number(m.cia_max) : 30;

                  const internalObj = m.internal || {};
                  const internal = tab === 'cycle1'
                    ? (internalObj.cycle1 ?? internalObj.computed ?? null)
                    : (internalObj.cycle2 ?? internalObj.computed ?? null);
                  const internalMax = tab === 'cycle1'
                    ? (internalObj.max_cycle1 ?? internalObj.max_total ?? null)
                    : (internalObj.max_cycle2 ?? internalObj.max_total ?? null);

                  const internalMaxNum = internalMax !== null && internalMax !== undefined ? Number(internalMax) : null;

                  const hasCqi = !!m.has_cqi;

                  const totalMax = (Number.isFinite(ciaMax) ? ciaMax : 0) + (internalMaxNum ? internalMaxNum : 0);
                  const ciaObt = cia !== null && cia !== undefined ? clamp(cia, 0, ciaMax || 0) : 0;
                  const internalObt = internal !== null && internal !== undefined && internalMaxNum
                    ? clamp(internal, 0, internalMaxNum)
                    : (internal !== null && internal !== undefined ? clamp(internal, 0) : 0);

                  const ciaWidth = totalMax > 0 ? (ciaObt / totalMax) * 100 : 0;
                  const internalWidth = totalMax > 0 ? (internalMaxNum ? (internalObt / totalMax) * 100 : 0) : 0;

                  return (
                    <div key={c.id} className="p-3 border rounded">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{c.code} — {c.name}</div>
                          <div className="text-sm text-gray-500">{data?.semester ? `Semester ${data.semester.number}` : ''}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            CIA: <span className="font-medium">{cia !== null && cia !== undefined ? String(cia) : '—'}</span>
                            {Number.isFinite(ciaMax) ? <span className="text-gray-400">/{String(ciaMax)}</span> : null}
                          </div>
                          <div className="text-sm text-gray-600">
                            Internal: <span className="font-medium">{internal !== null && internal !== undefined ? String(internal) : '—'}</span>
                            {internalMaxNum ? <span className="text-gray-400">/{String(internalMaxNum)}</span> : null}
                          </div>
                          {hasCqi ? <div className="text-sm text-green-700">CQI available</div> : null}
                        </div>
                      </div>

                      {/* Taskbar style summary */}
                      <div className="mt-3 h-3 bg-gray-100 rounded overflow-hidden relative">
                        <div className="flex h-3">
                          <div className="h-3 bg-blue-400" style={{ width: `${Math.max(0, Math.min(100, ciaWidth))}%` }} />
                          <div className="h-3 bg-yellow-400" style={{ width: `${Math.max(0, Math.min(100, internalWidth))}%` }} />
                        </div>
                        {hasCqi ? <div className="absolute right-0 top-0 bottom-0 w-2 bg-green-500" title="CQI available" /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
