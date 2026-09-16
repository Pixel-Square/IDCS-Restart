import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  Search,
  Filter,
  RefreshCw,
  Eye,
  User,
  Building2,
  GraduationCap,
  CheckCircle2,
  Clock,
  Calendar,
  X,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  IndianRupee,
  FileText,
  ExternalLink,
  ShieldCheck,
  History,
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getApiBase } from '../../../services/apiBase';
import { getCachedMe } from '../../../services/auth';
import { DisciplineLog, fetchDisciplineLogs } from '../../../services/discipline';

function resolveProfileImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiBase()}${url.startsWith('/') ? '' : '/'}${url}`;
}

function getUserDefaultDepartment(): string {
  try {
    const me = getCachedMe();
    const roles: string[] = Array.isArray(me?.roles)
      ? me.roles.map((r: any) => (typeof r === 'string' ? r : r?.name || '')).filter(Boolean)
      : [];
    const rolesUpper = roles.map((r) => r.toUpperCase());
    const isGlobalAdmin = rolesUpper.some((r) =>
      ['IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DISCIPLINECOMMITTEEADMIN'].includes(r)
    );
    if (isGlobalAdmin) return 'ALL';

    const dept = me?.profile?.department;
    if (dept) {
      return (typeof dept === 'object' ? (dept.short_name || dept.name || dept.code) : dept) || 'ALL';
    }
  } catch {
    /* ignore */
  }
  return 'ALL';
}

function format12HourTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return dateString;
  }
}

function formatDateDisplay(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateString;
  }
}

export default function StaffLogsPage() {
  const [logs, setLogs] = useState<DisciplineLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [backendDepts, setBackendDepts] = useState<string[]>([]);

  // Filters State — default department auto-selected for HOD, AHOD, and Staff
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState<string>(() => getUserDefaultDepartment());
  const [selectedDate, setSelectedDate] = useState('');

  // View Details Modal
  const [selectedLog, setSelectedLog] = useState<DisciplineLog | null>(null);
  const [showTrailModal, setShowTrailModal] = useState<boolean>(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchDisciplineLogs({
        search,
        status: statusFilter,
        severity: severityFilter,
        department: deptFilter,
        date: selectedDate,
      });
      setLogs(data.results || []);
      if (data.departments && data.departments.length > 0) {
        setBackendDepts(data.departments);
      }
    } catch (e) {
      console.error('Failed to load staff discipline logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [statusFilter, severityFilter, deptFilter, selectedDate]);

  // Derived departments combining backend master depts & logs
  const departmentOptions = useMemo(() => {
    const depts = new Set<string>(backendDepts);
    logs.forEach((l) => {
      if (l.department_name) depts.add(l.department_name);
    });
    const defaultDept = getUserDefaultDepartment();
    if (defaultDept && defaultDept !== 'ALL') depts.add(defaultDept);
    return Array.from(depts).filter(Boolean).sort();
  }, [logs, backendDepts]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  const handleExportExcel = () => {
    const exportData = logs.map((l) => ({
      'Log ID': l.id,
      'Student Name': l.student_name,
      'Register Number': l.reg_no,
      'Username': l.username,
      'Department': l.department_name || '-',
      'Section': l.section_name || '-',
      'Violation Category': l.category_title || '-',
      'Severity': l.severity,
      'Status': l.status,
      'Reported By': l.reported_by_name || 'Staff',
      'Reported At': new Date(l.incident_date).toLocaleString(),
      'Remarks': l.remarks || '',
      'Action Notes': l.action_notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'StaffDisciplineLogs');
    XLSX.writeFile(wb, `staff_discipline_logs_${Date.now()}.xlsx`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'RECEIPT_UPLOADED':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'IN_APPROVAL':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'PENDING_FINE_PAYMENT':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'ACTION_TAKEN':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DISMISSED':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'REPORTED':
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'HIGH':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'MEDIUM':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'LOW':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Recorded Incident Logs</h3>
            <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
              {logs.length} Records
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadLogs}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Filter Inputs */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, reg no, category..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="REPORTED">Reported</option>
              <option value="ACTION_TAKEN">Action Taken</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </div>

          <div>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Departments</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        </form>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">Loading Incident Logs...</h3>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <ClipboardList className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Incident Records Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Scan student barcodes using the Scanner tab to record new discipline logs.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Student Details</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Severity</th>
                  <th className="py-3.5 px-4">Date / Time</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-indigo-50/20 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{log.student_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {log.reg_no} • {log.department_name || 'Dept'}{' '}
                        {log.section_name ? `(${log.section_name})` : ''}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{log.category_title}</div>
                      {log.remarks && (
                        <div className="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate">
                          {log.remarks}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getSeverityBadge(
                          log.severity
                        )}`}
                      >
                        {log.severity}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">
                        {formatDateDisplay(log.incident_date)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {format12HourTime(log.incident_date)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-md border ${getStatusBadge(
                          log.status
                        )}`}
                      >
                        {log.status.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-lg text-xs font-semibold flex items-center gap-1 ml-auto transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DETAIL VIEW MODAL ── */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <span>Incident Details</span>
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Student Profile Card */}
              <div className="p-3.5 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 border border-indigo-100/90 rounded-2xl flex items-center gap-3.5 shadow-xs">
                {selectedLog.profile_image_url ? (
                  <img
                    src={resolveProfileImageUrl(selectedLog.profile_image_url) || ''}
                    alt={selectedLog.student_name}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm ring-2 ring-indigo-100 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-indigo-100/80 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-200 shadow-sm shrink-0">
                    <User className="w-7 h-7 text-indigo-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {selectedLog.student_name}
                  </div>
                  <div className="text-[11px] font-mono text-indigo-700 font-semibold mt-0.5">
                    {selectedLog.reg_no}
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="w-3 h-3 text-slate-400" />
                      {selectedLog.department_name || 'Department'}
                    </span>
                    {selectedLog.section_name && (
                      <span className="text-slate-400">• Sec {selectedLog.section_name}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Violation Info */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                    Violation Category
                  </span>
                  <span className="text-slate-900 font-semibold block truncate">
                    {selectedLog.category_title}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                    Severity & Status
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSeverityBadge(selectedLog.severity)}`}>
                      {selectedLog.severity}
                    </span>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${getStatusBadge(selectedLog.status)}`}>
                      {selectedLog.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fine Status & Amount Card */}
              <div className={`p-3 rounded-2xl border flex items-center justify-between shadow-xs ${
                selectedLog.has_fine
                  ? 'bg-rose-50/80 border-rose-200/90 text-rose-950'
                  : 'bg-emerald-50/80 border-emerald-200/90 text-emerald-950'
              }`}>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider block opacity-70">
                    Fine Penalty Assessment
                  </span>
                  <span className="text-xs font-extrabold flex items-center gap-1 mt-0.5">
                    {selectedLog.has_fine ? (
                      <span className="text-rose-700">Monetary Fine Imposed</span>
                    ) : (
                      <span className="text-emerald-700">No Fine (Cleared)</span>
                    )}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider block opacity-70">
                    Amount
                  </span>
                  <span className={`text-sm font-black flex items-center justify-end gap-0.5 ${
                    selectedLog.has_fine ? 'text-rose-700' : 'text-emerald-700'
                  }`}>
                    <IndianRupee className="w-3.5 h-3.5" />
                    {selectedLog.has_fine ? Number(selectedLog.fine_amount || 0).toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>

              {/* Payment Receipt Document Proof */}
              {(selectedLog.receipt_document || selectedLog.receipt_document_url) ? (
                <div className="p-3 bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white border border-emerald-200/90 rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Student Payment Receipt Proof</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-md border border-emerald-300/80">
                      Uploaded
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-600">Document attached by student</span>
                    <a
                      href={resolveProfileImageUrl(selectedLog.receipt_document || selectedLog.receipt_document_url) || (selectedLog.receipt_document || selectedLog.receipt_document_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>View Receipt</span>
                    </a>
                  </div>
                </div>
              ) : selectedLog.has_fine ? (
                <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-center justify-between text-xs text-amber-900 shadow-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold block">Payment Receipt Pending</span>
                      <span className="text-[11px] text-amber-700">Student has not yet uploaded payment receipt</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedLog.action_notes && (
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Action & Counseling Notes:</span>
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 leading-relaxed">
                    {selectedLog.action_notes}
                  </p>
                </div>
              )}

              {/* Action History Trail */}
              {selectedLog.actions && selectedLog.actions.length > 0 && (() => {
                // Show newest/last update first
                const reversedActions = [...selectedLog.actions].reverse();
                const latestAction = reversedActions[0];

                return (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                        <History className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Approval Workflow Trail</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-mono">
                          {selectedLog.actions.length} {selectedLog.actions.length === 1 ? 'event' : 'events'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowTrailModal(true)}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5 cursor-pointer bg-indigo-50/70 hover:bg-indigo-100/80 px-2 py-0.5 rounded-md transition"
                      >
                        <span>See All</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Latest Action Highlight Card */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl text-[11px] text-slate-700 space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          Latest: {latestAction.action_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-slate-500 font-medium">{format12HourTime(latestAction.created_at)}</span>
                      </div>
                      <p className="text-slate-600 mt-1">
                        {latestAction.comments || `Action performed by ${latestAction.user_name} (${latestAction.role_performed})`}
                      </p>
                      <div className="text-[10px] text-slate-400 pt-1 flex items-center justify-between border-t border-slate-200/50">
                        <span>By {latestAction.user_name || 'System'} ({latestAction.role_performed})</span>
                        <span>{formatDateDisplay(latestAction.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── HIGHLIGHTED REPORTED BY FACULTY SECTION ── */}
              <div className="p-3.5 bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-50/40 border border-amber-200/90 rounded-2xl space-y-2.5 shadow-xs">
                <div className="text-[10px] uppercase font-bold tracking-wider text-amber-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse"></span>
                  <span>Reported By Faculty Member</span>
                </div>

                <div className="flex items-center gap-3">
                  {selectedLog.reported_by_profile_image_url ? (
                    <img
                      src={resolveProfileImageUrl(selectedLog.reported_by_profile_image_url) || ''}
                      alt={selectedLog.reported_by_name || 'Faculty'}
                      className="w-11 h-11 rounded-xl object-cover border-2 border-white shadow-xs ring-2 ring-amber-200 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-amber-200/80 text-amber-800 flex items-center justify-center font-bold border border-amber-300 shadow-xs shrink-0">
                      <User className="w-5 h-5 text-amber-700" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-xs truncate">
                      {selectedLog.reported_by_name || 'Staff Member'}
                    </div>
                    {selectedLog.reported_by_department ? (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100/90 border border-amber-300/80 rounded-md text-[10px] font-bold text-amber-900 mt-1">
                        <Building2 className="w-3 h-3 text-amber-700" />
                        <span>{selectedLog.reported_by_department}</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-800/80 mt-0.5 font-medium">Faculty / Staff Member</div>
                    )}
                  </div>
                </div>

                {/* Date & 12-hour AM/PM Time formatted clearly below */}
                <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-[11px] text-slate-700">
                  <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    <span>Date: <strong className="text-slate-900">{formatDateDisplay(selectedLog.incident_date)}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Time: <strong className="text-slate-900">{format12HourTime(selectedLog.incident_date)}</strong></span>
                  </div>
                </div>

                {/* Faculty Remarks / Recorded Incident Notes */}
                {selectedLog.remarks && (
                  <div className="pt-2 border-t border-amber-200/60 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-rose-700">
                      <span className="w-2 h-2 rounded-full bg-rose-600 inline-block animate-ping" />
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 animate-pulse" />
                      <span className="text-[10px] font-extrabold uppercase tracking-wider block">
                        Faculty Remarks / Incident Notes:
                      </span>
                    </div>
                    <p className="p-2.5 bg-rose-50/90 border-2 border-rose-300/90 rounded-xl text-rose-700 font-bold text-xs italic leading-relaxed shadow-xs animate-in fade-in duration-200">
                      "{selectedLog.remarks}"
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FULL WORKFLOW TRAIL TIMELINE POPUP MODAL (SLIDE-IN MODAL) ── */}
      {showTrailModal && selectedLog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-right-8 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Complete Approval Workflow Trail</h3>
                  <p className="text-[11px] text-slate-500">
                    Full history for {selectedLog.student_name} ({selectedLog.reg_no})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTrailModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Timeline List (Latest update at top) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {(!selectedLog.actions || selectedLog.actions.length === 0) ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No approval history recorded yet.
                </div>
              ) : (
                [...selectedLog.actions].reverse().map((act, index) => (
                  <div
                    key={act.id || index}
                    className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs space-y-1.5 relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md text-[11px]">
                          {act.action_type.replace(/_/g, ' ')}
                        </span>
                        {index === 0 && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                            Latest Update
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatDateDisplay(act.created_at)} • {format12HourTime(act.created_at)}
                      </span>
                    </div>

                    <p className="text-slate-700 font-medium text-[11px] bg-white p-2 rounded-xl border border-slate-100">
                      {act.comments || 'Action recorded successfully.'}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>
                        Action by: <strong className="text-slate-800">{act.user_name || 'System User'}</strong>
                      </span>
                      <span className="font-mono text-[10px] bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                        Role: {act.role_performed || 'Approver'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTrailModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Back to Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
