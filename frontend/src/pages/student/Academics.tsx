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
    const val = internalObj?.[cycleKey] ?? internalObj?.computed;
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
    <div className="p-6">
      <div className="max-w-7xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-gray-900">My Marks</h1>
        <p className="text-sm text-gray-600 mt-1">
          {semesterNumber ? `Semester ${semesterNumber} · ` : ''}All enrolled courses and marks.
        </p>

        <div className="mt-6 obe-card">
          {loading ? (
            <div className="text-gray-600" role="status">Loading marks…</div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-red-800 text-sm">{error}</div>
          ) : (
            <div>
              {courses.length === 0 ? (
                <div className="text-gray-600">No courses found for your semester.</div>
              ) : (
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="min-w-[1100px] w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-left">
                        {[
                          'Code',
                          'Subject',
                          'Type',
                          'CQI',
                          'SSA 1',
                          'CIA 1',
                          'Review 1',
                          'Formative 1',
                          'Internal (C1)',
                          'SSA 2',
                          'CIA 2',
                          'Review 2',
                          'Formative 2',
                          'Internal (C2)',
                        ].map((h) => (
                          <th
                            key={h}
                            className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200 px-3 py-2 text-xs font-extrabold tracking-wide text-slate-700 uppercase whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((c: any, idx: number) => {
                        const m = c.marks || {};
                        const internalObj = m.internal || {};
                        const hasCqi = !!m.has_cqi;
                        const zebra = idx % 2 === 0;

                        return (
                          <tr key={c.code || String(c.id)} className={zebra ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                              {c.code ? <span className="obe-pill obe-neutral-pill">{String(c.code)}</span> : '—'}
                            </td>
                            <td className="px-3 py-2 border-b border-slate-100 min-w-[260px]">
                              <div className="font-semibold text-slate-900 leading-snug">{c.name || '—'}</div>
                              {semesterNumber ? <div className="mt-0.5 obe-small-muted">Semester {semesterNumber}</div> : null}
                            </td>
                            <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap text-slate-700">
                              {c.class_type ? String(c.class_type) : '—'}
                            </td>
                            <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                              {hasCqi ? <span className="obe-pill">Available</span> : <span className="obe-pill obe-neutral-pill">—</span>}
                            </td>

                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{fmt(m.ssa1)}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{fmt(m.cia1)}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{fmt(m.review1)}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{fmt(m.formative1)}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{internalDisplay(internalObj, 'cycle1')}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{fmt(m.ssa2)}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{fmt(m.cia2)}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{fmt(m.review2)}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{fmt(m.formative2)}</td>
                            <td className="px-3 py-2 border-b border-slate-100 tabular-nums whitespace-nowrap">{internalDisplay(internalObj, 'cycle2')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
