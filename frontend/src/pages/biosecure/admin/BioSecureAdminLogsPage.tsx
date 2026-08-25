import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Fingerprint,
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import { getApiBase } from '../../../services/apiBase';

interface AdminLog {
  id: number | string;
  user_id: number;
  user_name: string;
  username: string;
  email: string;
  identifier: string;
  user_type: 'STUDENT' | 'STAFF' | 'USER';
  department: string;
  section: string;
  profile_image_url?: string | null;
  group_id: number;
  group_name: string;
  batch_id: number;
  batch_name: string;
  batch_start: string;
  batch_end: string;
  date: string;
  placed: boolean;
  status: 'Placed' | 'Missed';
  verified_at?: string | null;
  finger_name: string;
  slot_id?: number | null;
}

function resolveProfileImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiBase()}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default function BioSecureAdminLogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [placedCount, setPlacedCount] = useState<number>(0);
  const [missedCount, setMissedCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [userTypeFilter, setUserTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  // Filter Options from Server
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [availableDepts, setAvailableDepts] = useState<Array<{ id: number; name: string; short_name: string }>>([]);

  // Stationary Pop-in Card on Row Hover (both Placed and Missed)
  const [hoveredRowId, setHoveredRowId] = useState<string | number | null>(null);

  const fetchAdminLogs = async (targetPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(targetPage));
      params.append('page_size', '25');

      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedDate) params.append('date', selectedDate);
      if (userTypeFilter !== 'ALL') params.append('user_type', userTypeFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (selectedGroup !== 'ALL') params.append('group_id', selectedGroup);
      if (selectedDept !== 'ALL') params.append('department', selectedDept);

      const res = await fetchWithAuth(`/api/idscan/biosecure/admin/logs/?${params.toString()}`);
      if (res && res.ok) {
        const data = await res.json();
        setLogs(data.results || []);
        setTotalCount(data.total_count || 0);
        setPlacedCount(data.placed_count || 0);
        setMissedCount(data.missed_count || 0);
        setPage(data.page || 1);
        setTotalPages(data.total_pages || 1);
        if (data.filter_options) {
          setAvailableGroups(data.filter_options.groups || []);
          setAvailableDepts(data.filter_options.departments || []);
        }
      }
    } catch (err) {
      console.error('Error fetching admin logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchAdminLogs(1);
  }, [selectedDate, userTypeFilter, statusFilter, selectedGroup, selectedDept]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAdminLogs(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setUserTypeFilter('ALL');
    setStatusFilter('ALL');
    setSelectedGroup('ALL');
    setSelectedDept('ALL');
  };

  const exportToCSV = () => {
    if (!logs.length) return;
    const headers = ['ID', 'Name', 'Reg No/Staff ID', 'User Type', 'Department', 'Section', 'Group', 'Batch', 'Date', 'Status', 'Verified At', 'Finger'];
    const rows = logs.map(l => [
      l.id,
      `"${l.user_name}"`,
      `"${l.identifier || l.username}"`,
      l.user_type,
      `"${l.department}"`,
      `"${l.section}"`,
      `"${l.group_name}"`,
      `"${l.batch_name} (${l.batch_start}-${l.batch_end})"`,
      l.date,
      l.status,
      l.verified_at || 'N/A',
      l.finger_name || 'N/A'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `biosecure_logs_${selectedDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 text-white shadow-lg border border-slate-700/60">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-200 text-[11px] font-bold tracking-wider uppercase border border-indigo-500/30 mb-2">
              <Shield className="w-3.5 h-3.5" />
              BioSecure Management
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              BioSecure Audit Logs
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Centralized biometric attendance monitoring and institutional audit records for students and staff.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Cohort</p>
              <p className="text-lg font-black text-white font-mono">{totalCount}</p>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Placed</p>
              <p className="text-lg font-black text-emerald-300 font-mono">{placedCount}</p>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Missed</p>
              <p className="text-lg font-black text-rose-300 font-mono">{missedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Live Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by student/staff name, register number, or username..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            Search
          </button>

          <button
            type="button"
            onClick={handleResetFilters}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            type="button"
            onClick={exportToCSV}
            disabled={!logs.length}
            className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </form>

        {/* Dropdown Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
          {/* Date Picker */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          {/* User Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              User Role
            </label>
            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="ALL">All Users (Students & Staff)</option>
              <option value="STUDENT">Students Only</option>
              <option value="STAFF">Staff Members Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Verification Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="PLACED">Placed (Verified on time)</option>
              <option value="MISSED">Missed / Absent</option>
            </select>
          </div>

          {/* Group Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Class Group
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="ALL">All Class Groups</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Department
            </label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="ALL">All Departments</option>
              {availableDepts.map((d) => (
                <option key={d.id} value={d.short_name || d.name}>
                  {d.short_name ? `${d.short_name} - ${d.name}` : d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5">User / Candidate</th>
                <th className="px-5 py-3.5">Role & Department</th>
                <th className="px-5 py-3.5">Class Group & Batch</th>
                <th className="px-5 py-3.5">Scheduled Window</th>
                <th className="px-5 py-3.5">Scan Status</th>
                <th className="px-5 py-3.5">Verification Time</th>
                <th className="px-5 py-3.5">Finger Sample</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading audit records...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
                      <Clock className="w-6 h-6" />
                    </div>
                    <p className="font-bold text-slate-700">No attendance records found</p>
                    <p className="text-[11px] text-slate-500 mt-1">Try adjusting the date, user role, or search filters above.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isHovered = hoveredRowId === log.id;
                  const profileImg = resolveProfileImageUrl(log.profile_image_url);
                  const fallback = log.user_name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

                  return (
                    <tr
                      key={log.id}
                      onMouseEnter={() => setHoveredRowId(log.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                      className={`relative transition-colors duration-150 cursor-pointer ${
                        log.placed
                          ? isHovered ? 'bg-emerald-50/70' : 'bg-white hover:bg-emerald-50/40'
                          : isHovered ? 'bg-rose-50/50' : 'bg-white hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Candidate Column with Hover Pop Card */}
                      <td className="px-5 py-3.5 relative">
                        <div className="flex items-center gap-3">
                          <div className="relative w-8 h-8 flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 overflow-hidden shadow-xs">
                              {profileImg ? (
                                <img
                                  src={profileImg}
                                  alt={log.user_name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span>{fallback}</span>
                              )}
                            </div>
                            {log.placed ? (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
                            ) : (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-400 ring-2 ring-white"></span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 leading-snug">{log.user_name}</div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {log.identifier || log.username}
                            </div>
                          </div>
                        </div>

                        {/* Stationary Row Hover Pop-in Card (Pops for Both Placed and Missed) */}
                        <div
                          className={`absolute left-6 top-full z-40 mt-1.5 p-4 rounded-2xl shadow-2xl bg-white border flex flex-col min-w-[310px] max-w-sm pointer-events-none transition-all duration-200 origin-top-left ${
                            log.placed ? 'border-emerald-200' : 'border-rose-200'
                          } ${
                            isHovered
                              ? 'opacity-100 scale-100 translate-y-0 visible'
                              : 'opacity-0 scale-90 -translate-y-2 invisible'
                          }`}
                        >
                          <div className="flex items-start gap-3.5">
                            <div className={`flex-shrink-0 w-14 h-14 rounded-2xl overflow-hidden border-2 shadow-sm flex justify-center items-center ${
                              log.placed ? 'border-emerald-500/40 bg-emerald-50/50' : 'border-rose-400/40 bg-rose-50/50'
                            }`}>
                              {profileImg ? (
                                <img src={profileImg} alt={log.user_name} className="w-full h-full object-cover" />
                              ) : (
                                <span className={`text-lg font-bold ${log.placed ? 'text-emerald-700' : 'text-rose-700'}`}>{fallback}</span>
                              )}
                            </div>

                            <div className="flex flex-col flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                {log.placed ? (
                                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded tracking-wider uppercase border border-emerald-300">
                                    BIOSECURE VERIFIED
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded tracking-wider uppercase border border-rose-300">
                                    MISSED / ABSENT
                                  </span>
                                )}
                              </div>
                              <span className="text-sm font-extrabold text-slate-900 leading-tight truncate">{log.user_name}</span>
                              <span className="text-xs font-bold text-indigo-600 font-mono mt-0.5">{log.identifier || log.username}</span>
                              <span className="text-xs text-slate-500 mt-0.5 truncate">{log.department} {log.section ? `• ${log.section}` : ''}</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Class Group</p>
                              <p className="font-semibold text-slate-700 truncate">{log.group_name}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Batch Window</p>
                              <p className="font-mono text-slate-700 text-[10.5px]">{log.batch_start} - {log.batch_end}</p>
                            </div>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-600 flex items-center gap-1">
                              <Fingerprint className={`w-3.5 h-3.5 ${log.placed ? 'text-emerald-500' : 'text-slate-400'}`} />
                              {log.placed ? `${log.finger_name || 'Fingerprint'} (Slot ${log.slot_id || 'Auto'})` : 'No Fingerprint Placed'}
                            </span>
                            <span className={`font-black font-mono ${log.placed ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {log.verified_at ? log.verified_at : 'No Scan Recorded'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            log.user_type === 'STUDENT'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {log.user_type}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          {log.department || 'N/A'} {log.section ? `• ${log.section}` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">{log.group_name}</div>
                        <div className="text-[11px] text-indigo-600 font-medium">{log.batch_name}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 font-mono text-[11px]">
                        {log.batch_start} – {log.batch_end}
                      </td>
                      <td className="px-5 py-3.5">
                        {log.placed ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Placed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-200">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            Missed
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 font-medium">
                        {log.verified_at ? (
                          <span className="text-emerald-700 font-mono">{log.verified_at}</span>
                        ) : (
                          <span className="text-slate-400 italic">No Scan</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-slate-600 font-medium">{log.finger_name || '-'}</span>
                        {log.slot_id && (
                          <span className="ml-1 text-[10px] text-slate-400 font-mono">(Slot {log.slot_id})</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {!loading && logs.length > 0 && (
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Showing page <span className="font-bold text-slate-900">{page}</span> of{' '}
              <span className="font-bold text-slate-900">{totalPages}</span> ({totalCount} records)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAdminLogs(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => fetchAdminLogs(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
