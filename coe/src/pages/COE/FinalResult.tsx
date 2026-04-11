import React, { useState } from 'react';
import { fetchCoeFinalResult, type CoeFinalResultEntry } from '../../services/coe';

/* ═══════════════════════════════════════════════════════════════
   STATIC MAPPINGS — EXACT values as specified (case-sensitive)
   ═══════════════════════════════════════════════════════════════ */

/**
 * ONLY these course codes are allowed in the Final Result export.
 * Key = base course code (without -R), Value = exact formatted output.
 * Any course code NOT in this map will be excluded from results.
 */
const ALLOWED_COURSE_CODES: Record<string, string> = {
  '20AI8903': '20AI8903-R',
  '20AM8904': '20AM8904-R',
  '20CE8925': '20CE8925-R',
  '20CE8926': '20CE8926-R',
  '20CS8901': '20CS8901-R',
  '20CS8902': '20CS8902-R',
  '20CS8908': '20CS8908-R',
  '20EC8901': '20EC8901-R',
  '20EC8904': '20EC8904-R',
  '20EC8905': '20EC8905-R',
  '20EE8902': '20EE8902-R',
  '20EE8907': '20EE8907-R',
  '20ME8106': '20ME8106-R',
  '20ME8103': '20ME8103-R',
  '20GE7811': '20GE7811-R',
  '20HS8801': '20HS8801-R',
  '20CE0803': '20CE0803-R',
  '20AI0912': '20AI0912 - R',
  '20EC8803': '20EC8803-R',
  '20CS6801': '20CS6801-R',
  '20GE7812': '20GE7812-R',
  '20AI0913': '20AI0913-R',
  '20CS8802': '20CS8802-R',
  '20EE7802': '20EE7802-R',
  '20CS6802': '20CS6802-R',
  '20RE8801': '20RE8801-R',
};

/**
 * Format course code for the Final Result export.
 * Returns the exact allowed formatted code, or empty string if not allowed.
 */
function formatCourseCode(code: string): string {
  if (!code) return '';
  // Strip any existing -R / - R suffix to get the base code
  const base = code.trim().replace(/\s*-\s*R\s*$/, '').trim();
  if (!base) return '';
  // Return the exact formatted code if allowed, otherwise empty string
  return ALLOWED_COURSE_CODES[base] || '';
}

const DEPARTMENTS = ['CSE', 'MECH', 'ECE', 'EEE', 'CIVIL', 'AI&DS', 'AI&ML', 'IT'] as const;

/** Map from dropdown label ➜ backend dept param */
const DEPT_TO_API: Record<string, string> = {
  CSE: 'CSE',
  MECH: 'MECH',
  ECE: 'ECE',
  EEE: 'EEE',
  CIVIL: 'CIVIL',
  'AI&DS': 'AI&DS',
  'AI&ML': 'AI&ML',
  IT: 'IT',
};

/** Map from dropdown label ➜ Dept/school category Code (exact case) */
const DEPT_CATEGORY_CODE: Record<string, string> = {
  CSE: 'CSE',
  MECH: 'Mech',
  ECE: 'ECE',
  EEE: 'EEE',
  CIVIL: 'CIVIL',
  'AI&DS': 'AI&DS',
  'AI&ML': 'AI&ML',
  IT: 'IT',
};

/** Map from dropdown label ➜ Program Code (exact case & symbols) */
const PROGRAM_CODE: Record<string, string> = {
  CSE: 'B.E-CSE',
  MECH: 'B.E-MECH',
  ECE: 'B.E-ECE',
  EEE: 'B.E-EEE',
  CIVIL: 'B.E-CIVIL',
  'AI&DS': 'B.Tech-AIDS',
  'AI&ML': 'B.Tech-AIML',
  IT: 'B.TECH-IT',
};

/**
 * Semester/Class Code lookup.
 * Key = `${deptDropdownLabel}::${semNumber}`  Value = exact code string.
 */
const SEMESTER_CLASS_CODE: Record<string, string> = {
  // CSE
  'CSE::1': 'BCSE-1', 'CSE::2': 'BCSE-2', 'CSE::3': 'BCSE-3', 'CSE::4': 'BCSE-4',
  'CSE::5': 'BCSE-5', 'CSE::6': 'BCSE-6', 'CSE::7': 'BCSE-7', 'CSE::8': 'BCSE-8',
  // MECH
  'MECH::1': 'BMEC-1', 'MECH::2': 'BMEC-2', 'MECH::3': 'BMEC-3', 'MECH::4': 'BMEC-4',
  'MECH::5': 'BMEC-5', 'MECH::6': 'BMEC-6', 'MECH::7': 'BMEC-7', 'MECH::8': 'BMEC-8',
  // ECE
  'ECE::1': 'BECE-1', 'ECE::2': 'BECE-2', 'ECE::3': 'BECE-3', 'ECE::4': 'BECE-4',
  'ECE::5': 'BECE-5', 'ECE::6': 'BECE-6', 'ECE::7': 'BECE-7', 'ECE::8': 'BECE-8',
  // EEE
  'EEE::1': 'BEEE-1', 'EEE::2': 'BEEE-2', 'EEE::3': 'BEEE-3', 'EEE::4': 'BEEE-4',
  'EEE::5': 'BEEE-5', 'EEE::6': 'BEEE-6', 'EEE::7': 'BEEE-7', 'EEE::8': 'BEEE-8',
  // CIVIL
  'CIVIL::1': 'BCE-1', 'CIVIL::2': 'BCE-2', 'CIVIL::3': 'BCE-3',
  'CIVIL::5': 'BCE-5', 'CIVIL::6': 'BCE-6', 'CIVIL::7': 'BCE-7', 'CIVIL::8': 'BCE-8',
  // AI&DS
  'AI&DS::1': 'BAIDS-1', 'AI&DS::2': 'BAIDS-2', 'AI&DS::3': 'BAIDS-3', 'AI&DS::4': 'BAIDS-4',
  'AI&DS::5': 'BAIDS-5', 'AI&DS::6': 'BAIDS-6', 'AI&DS::7': 'BAIDS-7', 'AI&DS::8': 'BAIDS-8',
  // AI&ML
  'AI&ML::1': 'BAIML', 'AI&ML::2': 'BAIML-2', 'AI&ML::3': 'BAIML-3', 'AI&ML::4': 'BAIML-4',
  'AI&ML::5': 'BAIML-5', 'AI&ML::6': 'BAIML-6', 'AI&ML::7': 'BAIML-7', 'AI&ML::8': 'BAIML-8',
  // IT
  'IT::1': 'BIT-1', 'IT::2': 'BIT-2', 'IT::3': 'BIT-3', 'IT::4': 'BIT-4',
  'IT::5': 'BIT-5', 'IT::6': 'BIT-6', 'IT::7': 'BIT-7', 'IT::8': 'BIT-8',
};

/* ═══════════════════════════════════════════════════════════════ */

/**
 * Max mark per QP type — must match OnePageReport's getMaxMarksForQpType.
 */
function getMaxMarksForQpType(qpType: string | undefined): number {
  switch ((qpType || 'QP1').trim().toUpperCase()) {
    case 'TCPR': return 80;
    case 'OE':   return 60;
    case 'QP1':
    case 'QP2':
    case 'TCPL':
    default:     return 100;
  }
}

type ExcelRow = {
  'Register Number*': string;
  'Student Name': string;
  'Degree Code*': string;
  'Program Code*': string;
  'Dept/school category Code*': string;
  'Semester/Class Code*': string;
  'Course Code*': string;
  'Sub Exam Code*': string;
  'Assessment Type': string;
  'Examination Code*': string;
  'External Mark*': string | number;
};

export default function FinalResult() {
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedSem, setSelectedSem] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ExcelRow[]>([]);

  /* ─── Fetch data from backend (all resolution done server-side) ─── */
  async function handleFetch() {
    if (!selectedDept || !selectedSem) {
      setError('Please select both department and semester.');
      return;
    }

    setLoading(true);
    setError(null);
    setRows([]);

    try {
      const apiDept = DEPT_TO_API[selectedDept] || selectedDept;
      const semesterLabel = `SEM${selectedSem}`;

      // Call the backend final-result endpoint — it handles all
      // KV-store → dummy → student → marks resolution server-side
      const resp = await fetchCoeFinalResult(apiDept, semesterLabel);

      if (!resp.results || resp.results.length === 0) {
        setError(resp.message || 'No results found for the selected department and semester.');
        setLoading(false);
        return;
      }

      // Static values for this selection
      const programCode = PROGRAM_CODE[selectedDept] || '';
      const deptCategoryCode = DEPT_CATEGORY_CODE[selectedDept] || '';
      const semClassCode = SEMESTER_CLASS_CODE[`${selectedDept}::${selectedSem}`] || '';

      // Build Excel rows — only for ALLOWED course codes.
      // Backend now returns total_marks already capped by qp_type (OE≤60, TCPR≤80, etc.)
      // We apply a safety cap on the frontend as well using the returned qp_type.
      const result: ExcelRow[] = resp.results
        .filter((r: CoeFinalResultEntry) => {
          const formatted = formatCourseCode(r.course_code);
          return formatted !== '';
        })
        .map((r: CoeFinalResultEntry) => {
          const maxMark = getMaxMarksForQpType(r.qp_type);
          const rawMark = Math.max(0, Math.floor(Number(r.total_marks || 0)));
          const externalMark = Math.min(rawMark, maxMark);
          return {
            'Register Number*': r.reg_no || '',
            'Student Name': r.name || '',
            'Degree Code*': 'UG',
            'Program Code*': programCode,
            'Dept/school category Code*': deptCategoryCode,
            'Semester/Class Code*': semClassCode,
            'Course Code*': formatCourseCode(r.course_code),
            'Sub Exam Code*': 'Theory-1',
            'Assessment Type': '',
            'Examination Code*': 'End Semester Examination',
            'External Mark*': externalMark,
          };
        });

      setRows(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch data.');
    } finally {
      setLoading(false);
    }
  }

  /* ─── Download Excel ─── */
  async function handleDownload() {
    if (rows.length === 0) return;

    const xlsx = await import('xlsx');

    const headers = [
      'Register Number*',
      'Student Name',
      'Degree Code*',
      'Program Code*',
      'Dept/school category Code*',
      'Semester/Class Code*',
      'Course Code*',
      'Sub Exam Code*',
      'Assessment Type',
      'Examination Code*',
      'External Mark*',
    ];

    const ws = xlsx.utils.json_to_sheet(rows, { header: headers });

    /* Auto-size columns */
    ws['!cols'] = headers.map((h) => {
      let maxLen = h.length;
      for (const row of rows) {
        const val = String((row as any)[h] ?? '');
        if (val.length > maxLen) maxLen = val.length;
      }
      return { wch: Math.min(maxLen + 2, 40) };
    });

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Final Result');
    xlsx.writeFile(wb, `Final_Result_${selectedDept}_SEM${selectedSem}.xlsx`);
  }

  /* ─── UI ─── */
  return (
    <div className="mx-auto max-w-7xl space-y-6 py-2">
      {/* Header Card */}
      <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
        <h1 className="text-2xl font-bold text-[#5b1a30]">Final Result</h1>
        <p className="mt-1 text-sm text-[#6f4a3f]">
          Select department &amp; semester, preview data, and download the result in Excel format.
        </p>

        {/* Dropdowns */}
        <div className="mt-5 flex flex-wrap items-end gap-4">
          {/* Department */}
          <div className="w-52">
            <label className="mb-1 block text-xs font-semibold text-[#5b1a30]">Department</label>
            <select
              value={selectedDept}
              onChange={(e) => { setSelectedDept(e.target.value); setRows([]); setError(null); }}
              className="w-full rounded-lg border border-[#c8917f]/60 bg-white px-3 py-2 text-sm text-[#3b1520] shadow-sm focus:border-[#6f1d34] focus:outline-none focus:ring-1 focus:ring-[#6f1d34]"
            >
              <option value="">-- Select --</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Semester */}
          <div className="w-40">
            <label className="mb-1 block text-xs font-semibold text-[#5b1a30]">Semester</label>
            <select
              value={selectedSem}
              onChange={(e) => { setSelectedSem(e.target.value); setRows([]); setError(null); }}
              className="w-full rounded-lg border border-[#c8917f]/60 bg-white px-3 py-2 text-sm text-[#3b1520] shadow-sm focus:border-[#6f1d34] focus:outline-none focus:ring-1 focus:ring-[#6f1d34]"
            >
              <option value="">-- Select --</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>SEM-{s}</option>
              ))}
            </select>
          </div>

          {/* Fetch */}
          <button
            onClick={handleFetch}
            disabled={loading || !selectedDept || !selectedSem}
            className="rounded-lg bg-[#6f1d34] px-5 py-2 text-sm font-semibold text-white shadow hover:bg-[#591729] disabled:opacity-50"
          >
            {loading ? 'Loading\u2026' : 'Fetch Data'}
          </button>

          {/* Download */}
          {rows.length > 0 && (
            <button
              onClick={handleDownload}
              className="rounded-lg bg-[#1d6f3c] px-5 py-2 text-sm font-semibold text-white shadow hover:bg-[#155a2f]"
            >
              Download Excel
            </button>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>

      {/* Data Preview */}
      {rows.length > 0 && (
        <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#5b1a30]">
              Preview ({rows.length} row{rows.length !== 1 ? 's' : ''})
            </h2>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#deb9ac]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[#6f1d34] text-white">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">#</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Register Number*</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Student Name</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Degree Code*</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Program Code*</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Dept/school category Code*</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Semester/Class Code*</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Course Code*</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Sub Exam Code*</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Assessment Type</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">Examination Code*</th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">External Mark*</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fdf6f3]'}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#6f4a3f]">{i + 1}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium text-[#3b1520]">{r['Register Number*']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Student Name']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Degree Code*']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Program Code*']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Dept/school category Code*']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Semester/Class Code*']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Course Code*']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Sub Exam Code*']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Assessment Type']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#3b1520]">{r['Examination Code*']}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-semibold text-[#5b1a30]">{r['External Mark*']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && (
              <p className="bg-[#fdf6f3] px-4 py-2 text-xs text-[#6f4a3f]">
                Showing first 200 of {rows.length} rows. Download Excel for full data.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
