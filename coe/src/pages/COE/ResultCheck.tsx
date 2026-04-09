import React, { useState } from 'react';
import {
  fetchResultCheck,
  type ResultCheckEntry,
} from '../../services/coe';

const DEPARTMENTS = ['CSE', 'MECH', 'ECE', 'EEE', 'CIVIL', 'AI&DS', 'AI&ML', 'IT'] as const;
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export default function ResultCheck() {
  /* ── selected filters ──────────────────────────────────── */
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSem, setSelectedSem] = useState('');

  /* ── data state ─────────────────────────────────────────── */
  const [rows, setRows] = useState<ResultCheckEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  /* ── search ─────────────────────────────────────────────── */
  const [search, setSearch] = useState('');

  /* ── Fetch data ────────────────────────────────────────── */
  async function handleFetch() {
    if (!selectedDept || !selectedSem) {
      setError('Please select both department and semester.');
      return;
    }
    setLoading(true);
    setError('');
    setRows([]);
    setTotalCount(0);
    try {
      const semesterLabel = `SEM${selectedSem}`;
      const data = await fetchResultCheck(selectedDept, semesterLabel);
      setRows(data.results || []);
      setTotalCount(data.count || 0);
    } catch (err: any) {
      setError(err?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  /* ── Filtered rows (client-side search) ────────────────── */
  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.trim().toLowerCase();
        return (
          r.reg_no.toLowerCase().includes(q) ||
          r.student_name.toLowerCase().includes(q) ||
          r.course_code.toLowerCase().includes(q) ||
          r.course_name.toLowerCase().includes(q) ||
          r.dummy_number.toLowerCase().includes(q)
        );
      })
    : rows;

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
      {/* Header Card */}
      <div className="rounded-xl bg-white shadow-md">
        <div className="rounded-t-xl bg-[#6f1d34] px-6 py-4">
          <h1 className="text-xl font-bold text-white tracking-wide">
            Result Check
          </h1>
          <p className="mt-1 text-sm text-[#f5d6c3]">
            View final result data as stored in the database
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-end gap-4">
            {/* Department */}
            <div className="flex flex-col">
              <label className="mb-1 text-sm font-semibold text-[#5b1a30]">
                Department
              </label>
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#6f1d34] focus:outline-none focus:ring-1 focus:ring-[#6f1d34] min-w-[160px]"
                value={selectedDept}
                onChange={(e) => { setSelectedDept(e.target.value); setRows([]); setError(''); }}
              >
                <option value="">-- Select --</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Semester */}
            <div className="flex flex-col">
              <label className="mb-1 text-sm font-semibold text-[#5b1a30]">
                Semester
              </label>
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#6f1d34] focus:outline-none focus:ring-1 focus:ring-[#6f1d34] min-w-[140px]"
                value={selectedSem}
                onChange={(e) => { setSelectedSem(e.target.value); setRows([]); setError(''); }}
              >
                <option value="">-- Select --</option>
                {SEMESTERS.map((s) => (
                  <option key={s} value={s}>SEM-{s}</option>
                ))}
              </select>
            </div>

            {/* Fetch button */}
            <button
              className="rounded-lg bg-[#6f1d34] px-5 py-2 text-sm font-semibold text-white shadow hover:bg-[#5b1a30] disabled:opacity-50 transition-colors"
              onClick={handleFetch}
              disabled={loading || !selectedDept || !selectedSem}
            >
              {loading ? 'Loading…' : 'Fetch Data'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {rows.length > 0 && (
        <div className="rounded-xl bg-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl bg-[#f9f1ec] px-6 py-3 border-b border-[#e8d5c4]">
            <div className="text-sm font-semibold text-[#5b1a30]">
              {selectedDept} &bull; {selectedSem} &mdash;{' '}
              <span className="font-normal text-gray-600">{totalCount} rows</span>
              {search.trim() && filtered.length !== rows.length && (
                <span className="ml-2 text-gray-500">
                  (showing {filtered.length})
                </span>
              )}
            </div>

            {/* Search box */}
            <input
              type="text"
              placeholder="Search reg no, name, course…"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#6f1d34] focus:outline-none focus:ring-1 focus:ring-[#6f1d34] w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#6f1d34] text-white text-left">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Dummy Number</th>
                  <th className="px-4 py-3 font-semibold">Reg No</th>
                  <th className="px-4 py-3 font-semibold">Student Name</th>
                  <th className="px-4 py-3 font-semibold">Course Code</th>
                  <th className="px-4 py-3 font-semibold">Course Name</th>
                  <th className="px-4 py-3 font-semibold">QP Type</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Marks</th>
                  <th className="px-4 py-3 font-semibold text-right">Max Marks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={`${r.reg_no}-${r.course_code}-${i}`}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-[#fdf6f0]'}
                  >
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-mono">{r.dummy_number}</td>
                    <td className="px-4 py-2 font-mono text-[#5b1a30]">{r.reg_no}</td>
                    <td className="px-4 py-2">{r.student_name}</td>
                    <td className="px-4 py-2 font-mono">{r.course_code}</td>
                    <td className="px-4 py-2">{r.course_name}</td>
                    <td className="px-4 py-2">{r.qp_type}</td>
                    <td className="px-4 py-2 text-right font-semibold">{r.total_marks}</td>
                    <td className="px-4 py-2 text-right">{r.max_marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-400">
              No rows match your search.
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="rounded-xl bg-white px-6 py-12 text-center text-gray-400 shadow-md">
          Select a department and semester, then click <strong>Fetch Data</strong>.
        </div>
      )}
    </div>
  );
}
