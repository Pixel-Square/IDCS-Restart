import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { Calendar, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, TrendingUp, BookOpen, User } from 'lucide-react';

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

export default function StudentAttendancePage() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // default to last 30 days
    const today = new Date();
    const ed = today.toISOString().slice(0, 10);
    const sd = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
    setStartDate(sd);
    setEndDate(ed);
  }, []);

  useEffect(() => {
    if (startDate && endDate) fetchRecords();
  }, [startDate, endDate]);

  async function fetchRecords() {
    setLoading(true);
    try {
      const q = `?start_date=${startDate}&end_date=${endDate}`;
      console.log('Fetching student attendance:', { startDate, endDate, url: `/api/academics/student/attendance/${q}` });
      
      const res = await fetchWithAuth(`/api/academics/student/attendance/${q}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to fetch attendance:', res.status, errorText);
        throw new Error(`Failed to fetch (${res.status})`);
      }
      
      const j = await res.json();
      console.log('Student attendance response:', { 
        recordCount: (j.results || []).length, 
        summary: j.summary,
        records: j.results 
      });
      
      setRecords(j.results || []);
      setSummary(j.summary || null);
    } catch (e) {
      console.error('fetchRecords error:', e);
      setRecords([]);
      alert('Failed to load attendance records: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'P': return 'bg-green-100 text-green-800 border-green-200';
      case 'A': return 'bg-red-100 text-red-800 border-red-200';
      case 'LEAVE': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'OD': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'LATE': return 'bg-amber-100 text-amber-800 border-amber-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'P': return <CheckCircle2 className="h-3.5 w-3.5" />;
      case 'A': return <XCircle className="h-3.5 w-3.5" />;
      default: return <AlertCircle className="h-3.5 w-3.5" />;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <CheckCircle2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
              <p className="text-gray-600">View your attendance records and statistics</p>
            </div>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">Select Date Range</h3>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">From Date</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">To Date</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button 
              onClick={fetchRecords}
              disabled={loading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors font-medium flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  Refresh
                </>
              )}
            </button>
          </div>
          {!loading && records.length > 0 && (
            <div className="mt-3 text-sm text-gray-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Showing {records.length} attendance record{records.length !== 1 ? 's' : ''} from {startDate} to {endDate}
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 text-gray-600">
                <Loader2 className="animate-spin h-5 w-5 text-indigo-600" />
                <span>Loading attendance records...</span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {records.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Records Found</h3>
                  <p className="text-gray-600">No attendance records found for the selected date range.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overall Summary */}
                {summary && (
                  <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="h-5 w-5 text-indigo-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Overall Attendance</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                        <div className="text-sm text-green-700 font-medium mb-1">Attendance Rate</div>
                        <div className="text-3xl font-bold text-green-900">
                          {summary.overall.percentage != null ? `${summary.overall.percentage.toFixed(1)}%` : 'N/A'}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                        <div className="text-sm text-blue-700 font-medium mb-1">Present</div>
                        <div className="text-3xl font-bold text-blue-900">{summary.overall.present}</div>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                        <div className="text-sm text-purple-700 font-medium mb-1">Total Periods</div>
                        <div className="text-3xl font-bold text-purple-900">{summary.overall.total_marked_periods}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Subject-wise Summary */}
                {summary && summary.by_subject && summary.by_subject.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="h-5 w-5 text-indigo-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Subject-wise Breakdown</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {summary.by_subject.map((s: any) => {
                        const pct = s.percentage != null ? s.percentage : 0;
                        const counts = s.counts || {};
                        return (
                          <div key={s.subject_key} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex justify-between items-start mb-3">
                              <div className="font-semibold text-gray-900">{s.subject_display || s.subject_key}</div>
                              <div className="text-lg font-bold text-indigo-600">
                                {pct != null ? `${pct.toFixed(1)}%` : 'N/A'}
                              </div>
                            </div>
                            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden mb-3">
                              <div 
                                className={`h-full transition-all ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded border border-green-200">
                                P: {counts['P'] || 0}
                              </span>
                              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded border border-red-200">
                                A: {counts['A'] || 0}
                              </span>
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded border border-blue-200">
                                LEAVE: {counts['LEAVE'] || 0}
                              </span>
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded border border-purple-200">
                                OD: {counts['OD'] || 0}
                              </span>
                              <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded border border-amber-200">
                                LATE: {counts['LATE'] || 0}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Attendance Records Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-indigo-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Attendance Records</h3>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Period</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Section</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Subject</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Marked By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {records.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                {r.date}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {r.period?.label || (r.period?.index ? `Period ${r.period.index}` : '—')}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">{r.section?.name || '—'}</td>
                            <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                              {r.subject_display || '—'}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${getStatusColor(r.status)}`}>
                                {getStatusIcon(r.status)}
                                {r.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              <div className="flex items-center gap-1">
                                <User className="h-3.5 w-3.5 text-gray-400" />
                                {r.marked_by || '—'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
