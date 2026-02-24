import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, TrendingUp,
  BookOpen, Clock, ChevronLeft, ChevronRight, BarChart2, ListX,
} from 'lucide-react';

type RecordItem = {
  id: number;
  date: string;
  period: { id?: number; index?: number; label?: string; start_time?: string; end_time?: string } | null;
  section: { id?: number; name?: string } | null;
  status: string;
  marked_at?: string;
  marked_by?: string | null;
  subject_display?: string;
};

type Summary = {
  overall: {
    percentage: number | null;
    present: number;
    total_marked_periods: number;
    status_counts: Record<string, number>;
  };
  by_subject: {
    subject_key: string;
    subject_display: string | null;
    counts: Record<string, number>;
    total: number;
    percentage: number | null;
  }[];
};

type Tab = 'overall' | 'subjects' | 'records';

const PRESETS = [
  { label: 'This Month', days: 30 },
  { label: '3 Months', days: 90 },
  { label: '6 Months', days: 180 },
  { label: 'This Year', days: 365 },
  { label: 'All Time', days: 0 },
];

export default function StudentAttendancePage() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overall');
  const [presetIdx, setPresetIdx] = useState(1); // default 3 months

  useEffect(() => { fetchRecords(presetIdx); }, [presetIdx]);

  async function fetchRecords(idx: number) {
    setLoading(true);
    try {
      const preset = PRESETS[idx];
      let q = '';
      if (preset.days > 0) {
        const today = new Date();
        const ed = today.toISOString().slice(0, 10);
        const sd = new Date(today.getTime() - 1000 * 60 * 60 * 24 * preset.days).toISOString().slice(0, 10);
        q = `?start_date=${sd}&end_date=${ed}`;
      }
      const res = await fetchWithAuth(`/api/academics/student/attendance/${q}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const j = await res.json();
      setRecords(j.results || []);
      setSummary(j.summary || null);
    } catch {
      setRecords([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  const sc = summary?.overall?.status_counts ?? {};
  const total = summary?.overall?.total_marked_periods ?? 0;
  const present = summary?.overall?.present ?? 0;
  const absent = sc['A'] ?? 0;
  const od = sc['OD'] ?? 0;
  const leave = sc['LEAVE'] ?? 0;
  const pct = summary?.overall?.percentage ?? null;

  const badRecords = records.filter(r => r.status === 'A' || r.status === 'LEAVE');

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overall',  label: 'Overall',       icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'subjects', label: 'Subject-wise',   icon: <BarChart2  className="h-4 w-4" /> },
    { key: 'records',  label: 'Records',         icon: <ListX      className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-5 border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex-shrink-0">
            <CheckCircle2 className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
            <p className="text-sm text-gray-500">View your attendance statistics and absence records</p>
          </div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-indigo-400 flex-shrink-0" />}
        </div>

        {/* Period navigation */}
        <div className="bg-white rounded-2xl shadow-sm p-3 mb-5 border border-gray-100 flex items-center gap-2">
          <button
            onClick={() => setPresetIdx(i => Math.max(0, i - 1))}
            disabled={presetIdx === 0}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors flex-shrink-0"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <div className="flex-1 flex gap-1.5 justify-center flex-wrap">
            {PRESETS.map((p, idx) => (
              <button
                key={p.label}
                onClick={() => setPresetIdx(idx)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  presetIdx === idx
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPresetIdx(i => Math.min(PRESETS.length - 1, i + 1))}
            disabled={presetIdx === PRESETS.length - 1}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors flex-shrink-0"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white rounded-2xl shadow-sm p-1.5 mb-5 border border-gray-100">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === t.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 border border-gray-100 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Loader2 className="animate-spin h-8 w-8 text-indigo-400" />
              <span className="text-sm">Loading attendance…</span>
            </div>
          </div>
        ) : total === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 border border-gray-100 flex flex-col items-center gap-3 text-gray-400">
            <AlertCircle className="h-10 w-10" />
            <p className="text-sm">No attendance records found for this period.</p>
          </div>
        ) : (
          <>
            {/* ── OVERALL TAB ── */}
            {activeTab === 'overall' && (
              <div className="space-y-4">
                {/* Circular % gauge */}
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 flex flex-col items-center gap-3">
                  <div className="relative w-36 h-36">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                      <circle
                        cx="60" cy="60" r="50" fill="none"
                        stroke={pct == null ? '#d1d5db' : pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="12"
                        strokeDasharray={`${2 * Math.PI * 50}`}
                        strokeDashoffset={`${2 * Math.PI * 50 * (1 - (pct ?? 0) / 100)}`}
                        strokeLinecap="round"
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-3xl font-bold ${pct == null ? 'text-gray-400' : pct >= 75 ? 'text-green-700' : pct >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                        {pct != null ? `${pct.toFixed(1)}%` : '—'}
                      </span>
                      <span className="text-xs text-gray-500 mt-0.5">Overall</span>
                    </div>
                  </div>
                  <p className={`text-sm font-semibold ${pct == null ? 'text-gray-400' : pct >= 75 ? 'text-green-700' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {pct == null ? 'No data' : pct >= 75 ? 'Good Standing' : pct >= 50 ? 'Needs Improvement' : 'Below Requirement'}
                  </p>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {([
                    { label: 'Total Periods', value: total,   text: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200',  icon: <Clock        className="h-4 w-4 text-indigo-400" /> },
                    { label: 'Present',        value: present, text: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200',   icon: <CheckCircle2 className="h-4 w-4 text-green-400" />  },
                    { label: 'Absent',         value: absent,  text: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200',     icon: <XCircle      className="h-4 w-4 text-red-400" />    },
                    { label: 'On Duty',        value: od,      text: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200',  icon: <CheckCircle2 className="h-4 w-4 text-purple-400" /> },
                    { label: 'Leave',          value: leave,   text: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200',   icon: <AlertCircle  className="h-4 w-4 text-amber-400" />  },
                  ] as const).map(card => (
                    <div key={card.label} className={`rounded-2xl p-4 border ${card.bg} ${card.border} flex flex-col gap-2`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${card.text}`}>{card.label}</span>
                        {card.icon}
                      </div>
                      <span className={`text-3xl font-bold ${card.text}`}>{card.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SUBJECT-WISE TAB ── */}
            {activeTab === 'subjects' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-6">
                  <BookOpen className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-base font-semibold text-gray-900">Subject-wise Attendance</h2>
                </div>
                {(!summary?.by_subject || summary.by_subject.length === 0) ? (
                  <p className="text-sm text-gray-400 text-center py-8">No subject data available.</p>
                ) : (
                  <div className="space-y-6">
                    {[...summary.by_subject]
                      .sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0))
                      .map(s => {
                        const p = s.percentage ?? 0;
                        const barColor   = p >= 75 ? 'bg-green-500'  : p >= 50 ? 'bg-amber-500'  : 'bg-red-500';
                        const textColor  = p >= 75 ? 'text-green-700': p >= 50 ? 'text-amber-700': 'text-red-700';
                        const cnt = s.counts;
                        return (
                          <div key={s.subject_key}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-semibold text-gray-800 truncate max-w-[65%]">
                                {s.subject_display || s.subject_key}
                              </span>
                              <span className={`text-sm font-bold ${textColor}`}>
                                {s.percentage != null ? `${s.percentage.toFixed(1)}%` : '—'}
                              </span>
                            </div>
                            <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                                style={{ width: `${Math.max(0, Math.min(100, p))}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-xs">
                              <span className="px-2 py-0.5 rounded bg-green-100  text-green-800  font-medium">P {cnt['P']     ?? 0}</span>
                              <span className="px-2 py-0.5 rounded bg-red-100    text-red-800    font-medium">A {cnt['A']     ?? 0}</span>
                              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-medium">OD {cnt['OD']   ?? 0}</span>
                              <span className="px-2 py-0.5 rounded bg-amber-100  text-amber-800  font-medium">Leave {cnt['LEAVE'] ?? 0}</span>
                              <span className="px-2 py-0.5 rounded bg-gray-100   text-gray-600   font-medium">Total {s.total}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* ── RECORDS TAB ── */}
            {activeTab === 'records' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListX className="h-5 w-5 text-red-500" />
                    <h2 className="text-base font-semibold text-gray-900">Absent &amp; Leave Records</h2>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                    {badRecords.length} record{badRecords.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {badRecords.length === 0 ? (
                  <div className="p-12 flex flex-col items-center gap-3">
                    <CheckCircle2 className="h-10 w-10 text-green-400" />
                    <p className="text-sm font-medium text-green-600">No absences or leaves in this period!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {badRecords.map(r => {
                      const isLeave = r.status === 'LEAVE';
                      return (
                        <div
                          key={r.id}
                          className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors ${isLeave ? 'bg-amber-50/40' : ''}`}
                        >
                          <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            isLeave
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-red-100 text-red-800 border-red-200'
                          }`}>
                            {isLeave ? 'Leave' : 'Absent'}
                          </span>
                          <div className="min-w-[88px] text-sm font-semibold text-gray-800">{r.date}</div>
                          <div className="flex-shrink-0 text-xs text-gray-500">
                            {r.period?.label || (r.period?.index ? `P${r.period.index}` : '—')}
                            {r.period?.start_time && (
                              <span className="ml-1 text-gray-400">{r.period.start_time}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 text-sm font-medium text-gray-700 truncate">
                            {r.subject_display || '—'}
                          </div>
                          {r.section?.name && (
                            <span className="flex-shrink-0 text-xs text-gray-400 hidden sm:block">
                              {r.section.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
