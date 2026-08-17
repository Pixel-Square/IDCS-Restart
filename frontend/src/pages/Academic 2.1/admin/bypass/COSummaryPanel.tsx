/**
 * COSummaryPanel — lightweight CO summary for admin bypass view.
 * Fetches data from the standard faculty CO summary endpoint and renders
 * a tabular view (raw & weighted) without the complex cell-selection logic.
 */
import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, BarChart3 } from 'lucide-react';
import fetchWithAuth from '../../../../services/fetchAuth';

interface COExam {
  id: string;
  name: string;
  short_name: string;
  max_marks: number;
  weight: number;
  co_weights: Record<string, number>;
  covered_cos: number[];
  weight_per_co: number;
  max_per_co: number;
  co_max_map: Record<string, number>;
  status: string;
}

interface COStudent {
  reg_no: string;
  name: string;
  exam_marks: Record<string, Record<string, number | boolean>>;
  weighted_marks: Record<string, number>;
  co_totals: number[];
  final_mark: number;
}

interface COSummary {
  course_code: string;
  course_name: string;
  co_count: number;
  total_internal_marks: number;
  exams: COExam[];
  students: COStudent[];
}

export default function COSummaryPanel({ courseId }: { courseId: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<COSummary | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'raw' | 'weighted'>('weighted');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`/api/academic-v2/faculty/courses/${courseId}/co-summary/`);
      if (!res.ok) throw new Error('Failed to load CO summary');
      setData(await res.json());
    } catch {
      setError('Failed to load CO summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [courseId]);

  const exportCSV = () => {
    if (!data) return;
    const coNums = Array.from({ length: data.co_count }, (_, i) => i + 1);
    const headers = ['Reg No', 'Name', ...data.exams.map(e => e.short_name || e.name), ...coNums.map(c => `CO${c}`), `Final (/${data.total_internal_marks})`];
    const rows = data.students.map(s => {
      const examVals = data.exams.map(ex => {
        const em = s.exam_marks[ex.id];
        return em ? String(em.total ?? '') : '';
      });
      const coVals = s.co_totals.map(v => String(v ?? ''));
      return [s.reg_no, s.name, ...examVals, ...coVals, String(s.final_mark ?? '')];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.course_code}_co_summary.csv`;
    a.click();
  };

  if (loading) return (
    <div className="p-8 flex justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600 text-sm mb-3">{error}</p>
      <button onClick={load} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Retry</button>
    </div>
  );

  if (!data) return (
    <div className="p-8 text-center text-gray-400">
      <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
      <p>No CO summary data available.</p>
    </div>
  );

  const coNums = Array.from({ length: data.co_count }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b">
        <div className="flex border rounded-lg overflow-hidden text-sm">
          <button onClick={() => setView('weighted')}
            className={`px-4 py-1.5 ${view === 'weighted' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            Weighted
          </button>
          <button onClick={() => setView('raw')}
            className={`px-4 py-1.5 ${view === 'raw' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            Raw Marks
          </button>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        <span className="text-xs text-gray-400">{data.students.length} students · {data.co_count} COs</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto px-4 pb-4">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="border px-2 py-1.5 text-left text-gray-600 font-medium sticky left-0 bg-gray-50 z-10">Reg No</th>
              <th className="border px-2 py-1.5 text-left text-gray-600 font-medium min-w-[140px] sticky left-16 bg-gray-50 z-10">Name</th>
              {view === 'raw' && data.exams.map(ex => (
                <th key={ex.id} className="border px-2 py-1.5 text-center text-blue-600 font-medium">
                  {ex.short_name || ex.name}
                  <div className="text-gray-400 font-normal">/{ex.max_marks}</div>
                </th>
              ))}
              {coNums.map(co => (
                <th key={co} className="border px-2 py-1.5 text-center text-green-700 font-medium">
                  CO{co}
                  {view === 'weighted' && <div className="text-gray-400 font-normal">/total</div>}
                </th>
              ))}
              {view === 'weighted' && (
                <th className="border px-2 py-1.5 text-center text-purple-700 font-medium">
                  Final<div className="text-gray-400 font-normal">/{data.total_internal_marks}</div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.students.map((s, i) => {
              const isAbsent = Object.values(s.exam_marks).some(em => em?.is_absent);
              return (
                <tr key={s.reg_no} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isAbsent ? 'opacity-50' : ''}`}>
                  <td className="border px-2 py-1 sticky left-0 bg-inherit font-mono">{s.reg_no}</td>
                  <td className="border px-2 py-1 sticky left-16 bg-inherit max-w-[160px] truncate">{s.name}</td>
                  {view === 'raw' && data.exams.map(ex => {
                    const em = s.exam_marks[ex.id];
                    return (
                      <td key={ex.id} className="border px-2 py-1 text-center">
                        {em ? String(em.total ?? '—') : '—'}
                      </td>
                    );
                  })}
                  {coNums.map((co, ci) => (
                    <td key={co} className="border px-2 py-1 text-center text-green-800 font-medium">
                      {s.co_totals[ci] != null ? s.co_totals[ci].toFixed(2) : '—'}
                    </td>
                  ))}
                  {view === 'weighted' && (
                    <td className="border px-2 py-1 text-center text-purple-800 font-bold">
                      {s.final_mark != null ? s.final_mark.toFixed(2) : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
