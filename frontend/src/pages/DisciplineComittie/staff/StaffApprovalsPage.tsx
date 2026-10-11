import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Calendar,
  ArrowRight,
  Check,
  User,
  Building2,
  GraduationCap,
  FileText,
  IndianRupee,
  Eye,
  RefreshCw,
  Search,
  Filter,
  X,
  AlertCircle,
  AlertTriangle,
  Lock,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Send,
  Loader2,
  FileCheck,
  History,
  ChevronRight
} from 'lucide-react';
import { getApiBase } from '../../../services/apiBase';
import {
  DisciplineLog,
  fetchDisciplineApprovals,
  fixDisciplineFine,
  forwardDisciplineIncident,
  approveDisciplineIncident
} from '../../../services/discipline';

function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiBase()}${url.startsWith('/') ? '' : '/'}${url}`;
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

export default function StaffApprovalsPage() {
  const [approvals, setApprovals] = useState<DisciplineLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Selected Log for Action Modal
  const [activeLog, setActiveLog] = useState<DisciplineLog | null>(null);
  const [showTrailModal, setShowTrailModal] = useState<boolean>(false);

  // Form State inside Action Modal
  const [hasFineSwitch, setHasFineSwitch] = useState<boolean>(false);
  const [fineAmount, setFineAmount] = useState<string>('0');
  const [initialHasFine, setInitialHasFine] = useState<boolean>(false);
  const [initialFineAmount, setInitialFineAmount] = useState<string>('0');
  const [comments, setComments] = useState<string>('');
  const [actionNotes, setActionNotes] = useState<string>('');

  const [processing, setProcessing] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const loadApprovals = async () => {
    setLoading(true);
    try {
      const data = await fetchDisciplineApprovals();
      setApprovals(data);
    } catch (e) {
      console.error('Failed to load approvals:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApprovals();
  }, []);

  const handleOpenActionModal = (log: DisciplineLog) => {
    setActiveLog(log);
    const initialFine = Boolean(log.has_fine);
    const initialAmount = log.fine_amount ? String(log.fine_amount) : '0';
    setHasFineSwitch(initialFine);
    setFineAmount(initialAmount);
    setInitialHasFine(initialFine);
    setInitialFineAmount(initialAmount);
    setComments('');
    setActionNotes(log.action_notes || '');
    setActionSuccessMsg(null);
  };

  const handleCloseModal = () => {
    setActiveLog(null);
    setShowTrailModal(false);
    setActionSuccessMsg(null);
  };

  // 1. FIX / SAVE FINE ACTION (Handles both Fine amount fixing and No Fine saving)
  const handleFixFine = async (overrideNoFine?: boolean) => {
    if (!activeLog) return;
    const isFine = overrideNoFine === true ? false : hasFineSwitch;

    if (isFine && (isNaN(Number(fineAmount)) || Number(fineAmount) < 0)) {
      alert('Please enter a valid fine amount.');
      return;
    }

    setProcessing(true);
    try {
      const updated = await fixDisciplineFine(activeLog.id, {
        has_fine: isFine,
        fine_amount: isFine ? Number(fineAmount) : 0,
        comments: comments.trim() || (isFine ? `Fine fixed at ₹${fineAmount}` : 'Set to No Fine (Cleared)'),
      });
      setActiveLog(updated);
      setApprovals((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setActionSuccessMsg(
        isFine
          ? `Fine amount ₹${fineAmount} saved & notified to student!`
          : 'Fine cleared successfully! Set to No Fine.'
      );
      setTimeout(() => {
        handleCloseModal();
        loadApprovals();
      }, 1200);
    } catch (err: any) {
      alert(err.message || 'Failed to update fine');
    } finally {
      setProcessing(false);
    }
  };

  // 2. FORWARD ACTION
  const handleForward = async () => {
    if (!activeLog) return;
    setProcessing(true);
    try {
      const updated = await forwardDisciplineIncident(activeLog.id, {
        comments: comments.trim() || 'Forwarded to next approver role',
      });
      setActiveLog(updated);
      setApprovals((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setActionSuccessMsg(`Request forwarded to ${updated.current_role}!`);
      setTimeout(() => {
        handleCloseModal();
        loadApprovals();
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'Failed to forward request');
    } finally {
      setProcessing(false);
    }
  };

  // 3. FINAL APPROVE ACTION
  const handleFinalApprove = async () => {
    if (!activeLog) return;
    setProcessing(true);
    try {
      const updated = await approveDisciplineIncident(activeLog.id, {
        comments: comments.trim() || 'Final discipline approval granted. Incident closed.',
        action_notes: actionNotes.trim(),
      });
      setActiveLog(updated);
      setApprovals((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setActionSuccessMsg('Incident approved and marked as resolved!');
      setTimeout(() => {
        handleCloseModal();
        loadApprovals();
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'Failed to approve incident');
    } finally {
      setProcessing(false);
    }
  };

  const filteredApprovals = approvals.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.student_name.toLowerCase().includes(q) ||
      a.reg_no.toLowerCase().includes(q) ||
      a.username.toLowerCase().includes(q) ||
      (a.category_title && a.category_title.toLowerCase().includes(q))
    );
  });

  const isPendingForUser = (log: DisciplineLog) => {
    if (log.status === 'RESOLVED' || log.status === 'DISMISSED') return false;
    if (typeof log.is_actionable === 'boolean') {
      return log.is_actionable;
    }
    return true;
  };

  const pendingApprovals = filteredApprovals.filter(isPendingForUser);
  const historyApprovals = filteredApprovals.filter((log) => !isPendingForUser(log));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-amber-500 to-indigo-600 text-white rounded-2xl shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Discipline Approvals
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Review assigned student discipline requests, inspect fine payments, and forward or approve resolutions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadApprovals}
            disabled={loading}
            className="p-2.5 text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Split Summary */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search approval requests by student name, register number, violation category..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            {pendingApprovals.length} Pending Action
          </span>
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
            {historyApprovals.length} Forwarded / Approved
          </span>
        </div>
      </div>

      {/* ── SECTION 1 (TOP & IMPORTANT): PENDING APPROVALS QUEUE ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse inline-block" />
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Pending Approvals</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                {pendingApprovals.length} Important
              </span>
            </h2>
          </div>
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 font-bold px-2.5 py-1 rounded-lg hidden sm:inline-flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Action Required Now
          </span>
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin mx-auto mb-2" />
            <h3 className="text-xs font-bold text-slate-700">Loading Pending Approvals...</h3>
          </div>
        ) : pendingApprovals.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-xs">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Pending Approvals Waiting</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
              All discipline incident requests assigned to your current role have been processed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pendingApprovals.map((log) => {
              const flow = log.flow_roles || [];
              const isFinalStep = log.current_step_index === flow.length - 1;
              const hasReceipt = Boolean(log.receipt_document || log.receipt_document_url);

              return (
                <div
                  key={log.id}
                  className="bg-white rounded-2xl border-2 border-amber-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                >
                  <div className="p-5 space-y-4">
                    {/* Top Profile + Step Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center overflow-hidden shrink-0">
                          {log.profile_image_url ? (
                            <img
                              src={resolveMediaUrl(log.profile_image_url)!}
                              alt={log.student_name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <User className="w-6 h-6 text-indigo-600" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {log.student_name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded">
                              {log.reg_no}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                          isFinalStep
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {log.current_role || 'Approver'}
                      </span>
                    </div>

                    {/* Violation Category & Status Details */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="font-semibold text-slate-500">Category:</span>
                        <span className="font-bold text-slate-900">{log.category_title || 'Violation'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="font-semibold text-slate-500">Department:</span>
                        <span className="font-medium text-slate-800">{log.department_name || '-'}</span>
                      </div>
                      {log.assigned_approver_name && (
                        <div className="flex items-center justify-between text-slate-700">
                          <span className="font-semibold text-slate-500">Assigned Approver:</span>
                          <span className="font-bold text-indigo-700">
                            {log.assigned_approver_name}
                            {log.assigned_approver_department ? ` (${log.assigned_approver_department})` : ''}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="font-semibold text-slate-500">Fine Status:</span>
                        <span className="font-bold text-indigo-700 flex items-center gap-0.5">
                          <IndianRupee className="w-3 h-3" />
                          {log.has_fine ? `${Number(log.fine_amount).toFixed(2)}` : 'No Fine'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span className="font-semibold text-slate-500">Receipt Proof:</span>
                        <span
                          className={`font-bold text-[11px] px-2 py-0.5 rounded-md flex items-center gap-1 ${
                            hasReceipt
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.has_fine
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : 'bg-slate-200/80 text-slate-600'
                          }`}
                        >
                          {hasReceipt ? (
                            'Uploaded'
                          ) : log.has_fine ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block animate-pulse"></span>
                              <span>Pending Upload</span>
                            </>
                          ) : (
                            'Not Applicable'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Remarks */}
                    {log.remarks && (
                      <div className="p-2.5 bg-rose-50/80 rounded-xl border border-rose-200/90 text-xs text-rose-700 font-semibold italic flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span className="leading-snug">"{log.remarks}"</span>
                      </div>
                    )}
                  </div>

                  {/* Footer View Action */}
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.incident_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>

                    <button
                      onClick={() => handleOpenActionModal(log)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View & Action</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 2 (BOTTOM): FORWARDED & APPROVED SUBMISSIONS (ROWS WISE) ── */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Forwarded & Approved Submissions</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                {historyApprovals.length}
              </span>
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
            Applications forwarded to next roles or finalized
          </span>
        </div>

        {historyApprovals.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500 shadow-xs">
            No forwarded or approved applications recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Violation / Severity</th>
                    <th className="py-3 px-4">Flow Status</th>
                    <th className="py-3 px-4">Fine / Receipt</th>
                    <th className="py-3 px-4">Incident Date</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyApprovals.map((log) => {
                    const hasReceipt = Boolean(log.receipt_document || log.receipt_document_url);
                    const isResolved = log.status === 'RESOLVED';
                    const isDismissed = log.status === 'DISMISSED';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition">
                        {/* Student */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center overflow-hidden shrink-0">
                              {log.profile_image_url ? (
                                <img
                                  src={resolveMediaUrl(log.profile_image_url)!}
                                  alt={log.student_name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <User className="w-4 h-4 text-indigo-600" />
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 leading-tight">
                                {log.student_name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded">
                                  {log.reg_no}
                                </span>
                                {log.department_name && (
                                  <span className="text-[11px] text-slate-400">
                                    • {log.department_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Violation / Severity */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">
                            {log.category_title || 'General Incident'}
                          </div>
                          <span
                            className={`inline-block mt-0.5 text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${
                              log.severity === 'CRITICAL'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : log.severity === 'HIGH'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {log.severity || 'LOW'}
                          </span>
                        </td>

                        {/* Status / Pending At */}
                        <td className="py-3 px-4">
                          {isResolved ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Resolved & Cleared</span>
                            </span>
                          ) : isDismissed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <span>Dismissed</span>
                            </span>
                          ) : log.status === 'PENDING_FINE_PAYMENT' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                              <IndianRupee className="w-3 h-3 text-rose-600" />
                              <span>Pending Student Fine</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Clock className="w-3 h-3 text-indigo-600" />
                              <span>Pending at {log.current_role ? log.current_role.replace(/_/g, ' ') : 'Next Role'}</span>
                            </span>
                          )}
                        </td>

                        {/* Fine / Proof */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800 flex items-center gap-0.5">
                            <IndianRupee className="w-3 h-3 text-slate-500" />
                            {log.has_fine ? Number(log.fine_amount).toFixed(2) : '0 (No Fine)'}
                          </div>
                          <span
                            className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              hasReceipt
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.has_fine
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {hasReceipt ? 'Receipt Uploaded' : log.has_fine ? 'Receipt Pending' : 'N/A'}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(log.incident_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenActionModal(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── ACTION / APPROVAL POPUP DIALOG ── */}
      {activeLog && (() => {
        const isFineImposed = activeLog.has_fine && Number(activeLog.fine_amount) > 0;
        const hasReceiptUploaded = Boolean(activeLog.receipt_document || activeLog.receipt_document_url);
        const isReceiptPending = isFineImposed && !hasReceiptUploaded;

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
                <span>Incident Details & Action</span>
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notification Alert Message */}
            {actionSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{actionSuccessMsg}</span>
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              {/* 1. Student Profile Card */}
              <div className="p-3.5 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 border border-indigo-100/90 rounded-2xl flex items-center gap-3.5 shadow-xs">
                {activeLog.profile_image_url ? (
                  <img
                    src={resolveMediaUrl(activeLog.profile_image_url)!}
                    alt={activeLog.student_name}
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
                    {activeLog.student_name}
                  </div>
                  <div className="text-[11px] font-mono text-indigo-700 font-semibold mt-0.5">
                    {activeLog.reg_no}
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="w-3 h-3 text-slate-400" />
                      {activeLog.department_name || 'General Department'}
                    </span>
                    {activeLog.section_name && (
                      <span className="text-slate-400">• Sec {activeLog.section_name}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Violation Category & Current Stage Info */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                    Violation Category
                  </span>
                  <span className="text-slate-900 font-semibold block truncate">
                    {activeLog.category_title || 'General Incident'}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                    Current Stage / Role
                  </span>
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 inline-block">
                    {activeLog.current_role || 'Approver'}
                  </span>
                </div>
              </div>

              {activeLog.assigned_approver_name && (
                <div className="p-2.5 bg-amber-50/60 border border-amber-200/70 rounded-xl flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-800">
                    Designated Approver:
                  </span>
                  <span className="font-bold text-slate-900 text-xs">
                    {activeLog.assigned_approver_name} {activeLog.assigned_approver_department ? `(${activeLog.assigned_approver_department})` : ''}
                  </span>
                </div>
              )}

              {/* 3. FINE CONFIGURATION SECTION (Switch & Amount & Fix Button) */}
              {(() => {
                const currentFineNum = hasFineSwitch ? (Number(fineAmount) || 0) : 0;
                const initialFineNum = initialHasFine ? (Number(initialFineAmount) || 0) : 0;
                const isFineChanged = (hasFineSwitch !== initialHasFine) || (hasFineSwitch && currentFineNum !== initialFineNum);

                return (
                  <div className="p-3.5 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                          Fine Penalty Assessment
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {isFineChanged
                            ? 'Unsaved changes detected. Click save to update fine.'
                            : 'Fine status as configured.'}
                        </p>
                      </div>

                      {/* Fine / No Fine Switch */}
                      <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => setHasFineSwitch(false)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            !hasFineSwitch
                              ? 'bg-slate-800 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          No Fine
                        </button>
                        <button
                          type="button"
                          onClick={() => setHasFineSwitch(true)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            hasFineSwitch
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Fine
                        </button>
                      </div>
                    </div>

                    {/* When Fine is selected: Amount Input with ₹ Symbol and conditionally rendered "Save Fine" Button */}
                    {hasFineSwitch ? (
                      <div className="space-y-2 pt-2 border-t border-indigo-100">
                        <label className="block text-[11px] font-bold text-slate-700">
                          Enter Fine Amount (in Rupees)
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <div className="absolute left-3 top-2.5 text-slate-400 font-bold flex items-center gap-0.5">
                              <IndianRupee className="w-3.5 h-3.5 text-indigo-600" />
                            </div>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={fineAmount}
                              onChange={(e) => setFineAmount(e.target.value)}
                              placeholder="e.g. 200"
                              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          {/* SAVE FINE BUTTON: Shown ONLY if fine value or switch changed */}
                          {isFineChanged && (
                            <button
                              type="button"
                              onClick={() => handleFixFine(false)}
                              disabled={processing}
                              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer animate-in zoom-in-95"
                            >
                              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              <span>Save Fine</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* When No Fine is selected: Show Save No Fine button ONLY if changed from previous fine */
                      <div className="pt-2 border-t border-indigo-100 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">
                            Confirmed: No Monetary Fine
                          </span>
                          <p className="text-[10px] text-slate-500">
                            {isFineChanged ? 'Click save to confirm clearing the fine.' : 'No fine is assessed for this record.'}
                          </p>
                        </div>

                        {isFineChanged && (
                          <button
                            type="button"
                            onClick={() => handleFixFine(true)}
                            disabled={processing}
                            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer animate-in zoom-in-95"
                          >
                            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span>Save No Fine</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 4. STUDENT ATTACHED RECEIPT PROOF DOCUMENT */}
              <div className={`p-3.5 rounded-2xl border space-y-2 shadow-xs ${
                isReceiptPending
                  ? 'bg-rose-50/70 border-rose-200'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-600" />
                    <span>Student Payment Receipt Proof</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      hasReceiptUploaded
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/80'
                        : isFineImposed
                        ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {hasReceiptUploaded
                      ? 'Proof Available'
                      : isFineImposed
                      ? 'Receipt Pending (Required)'
                      : 'No Fine / Not Required'}
                  </span>
                </div>

                {hasReceiptUploaded ? (
                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                        <FileCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Fine Payment Receipt</p>
                        <p className="text-[10px] text-slate-500">
                          {activeLog.receipt_uploaded_at
                            ? `Uploaded ${new Date(activeLog.receipt_uploaded_at).toLocaleString()}`
                            : 'Attached by student'}
                        </p>
                      </div>
                    </div>

                    <a
                      href={resolveMediaUrl(activeLog.receipt_document || activeLog.receipt_document_url)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>View Receipt</span>
                    </a>
                  </div>
                ) : isFineImposed ? (
                  <div className="p-2.5 bg-white/95 border border-rose-200 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-700 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Student Fee Receipt Pending</span>
                    </div>
                    <p className="text-[11px] text-rose-600 leading-relaxed pl-5.5">
                      The student has been assessed a fine of <strong>₹{Number(activeLog.fine_amount).toFixed(2)}</strong> but has not uploaded payment receipt proof yet. Approval is blocked until receipt verification.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    No monetary fine is active for this record.
                  </p>
                )}
              </div>

              {/* Action History Trail */}
              {activeLog.actions && activeLog.actions.length > 0 && (() => {
                const reversedActions = [...activeLog.actions].reverse();
                const latestAction = reversedActions[0];

                return (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                        <History className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Approval Workflow Trail</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-mono">
                          {activeLog.actions.length} {activeLog.actions.length === 1 ? 'event' : 'events'}
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

              {/* 5. ── HIGHLIGHTED REPORTED BY FACULTY SECTION ── */}
              <div className="p-3.5 bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-50/40 border border-amber-200/90 rounded-2xl space-y-2.5 shadow-xs">
                <div className="text-[10px] uppercase font-bold tracking-wider text-amber-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse"></span>
                  <span>Reported By Faculty Member</span>
                </div>

                <div className="flex items-center gap-3">
                  {activeLog.reported_by_profile_image_url ? (
                    <img
                      src={resolveMediaUrl(activeLog.reported_by_profile_image_url) || ''}
                      alt={activeLog.reported_by_name || 'Faculty'}
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
                      {activeLog.reported_by_name || 'Staff Member'}
                    </div>
                    {activeLog.reported_by_department ? (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100/90 border border-amber-300/80 rounded-md text-[10px] font-bold text-amber-900 mt-1">
                        <Building2 className="w-3 h-3 text-amber-700" />
                        <span>{activeLog.reported_by_department}</span>
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
                    <span>Date: <strong className="text-slate-900">{formatDateDisplay(activeLog.incident_date)}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Time: <strong className="text-slate-900">{format12HourTime(activeLog.incident_date)}</strong></span>
                  </div>
                </div>

                {/* Faculty Remarks / Recorded Incident Notes */}
                {activeLog.remarks && (
                  <div className="pt-2 border-t border-amber-200/60 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-rose-700">
                      <span className="w-2 h-2 rounded-full bg-rose-600 inline-block animate-ping" />
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 animate-pulse" />
                      <span className="text-[10px] font-extrabold uppercase tracking-wider block">
                        Faculty Remarks / Incident Notes:
                      </span>
                    </div>
                    <p className="p-2.5 bg-rose-50/90 border-2 border-rose-300/90 rounded-xl text-rose-700 font-bold text-xs italic leading-relaxed shadow-xs animate-in fade-in duration-200">
                      "{activeLog.remarks}"
                    </p>
                  </div>
                )}
              </div>

              {/* 6. Comments Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Approval Remarks / Action Notes
                </label>
                <textarea
                  rows={2}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Record resolution notes, counselor feedback, or approval remarks..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              {/* 6.5 APPROVAL FLOW LINE: Status of Pending, Forwarded, Finalizer with Roles & Names */}
              <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Approval Flow Pipeline & Stage Status
                  </span>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/60">
                    Step {Math.min((activeLog.current_step_index ?? 0) + 1, activeLog.flow_stages?.length ?? ((activeLog.flow_roles?.length ?? 1) + 1))} of {activeLog.flow_stages?.length ?? ((activeLog.flow_roles?.length ?? 1) + 1)}
                  </span>
                </div>

                {/* Flow line pipeline with node indicators */}
                <div className="relative py-2">
                  <div className="absolute top-5.5 left-6 right-6 h-1 bg-slate-200 rounded-full z-0" />

                  <div className="relative z-10 flex items-start justify-between gap-1 overflow-x-auto pb-1">
                    {activeLog.flow_stages && activeLog.flow_stages.length > 0 ? (
                      activeLog.flow_stages.map((stage, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === activeLog.flow_stages!.length - 1;

                        return (
                          <div key={stage.role_key + idx} className="flex flex-col items-center min-w-[76px] text-center">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-xs ring-4 ring-white ${
                              stage.is_done
                                ? 'bg-emerald-500 text-white'
                                : stage.is_current
                                ? 'bg-amber-500 text-white animate-pulse ring-amber-100'
                                : 'bg-slate-200 text-slate-500'
                            }`}>
                              {stage.is_done ? '✓' : stage.is_current ? '🕒' : isLast ? '★' : (idx + 1)}
                            </div>
                            <span className={`mt-1 text-[9px] font-extrabold uppercase tracking-tight ${
                              stage.is_done ? 'text-emerald-700' : stage.is_current ? 'text-amber-700 font-black' : 'text-slate-400'
                            }`}>
                              {stage.status === 'SUBMITTED' ? 'Submitted' : stage.status === 'FORWARDED' ? 'Forwarded' : stage.status === 'PENDING' ? 'Pending' : stage.status === 'FINALIZER' ? 'Finalizer' : 'Upcoming'}
                            </span>
                            <span className="text-[10px] font-extrabold text-slate-900 leading-tight">
                              {stage.assigned_name}
                            </span>
                            <span className={`text-[8px] font-semibold px-1.5 py-0.2 rounded mt-0.5 ${
                              isFirst || isLast ? 'text-slate-400' : 'text-indigo-700 bg-indigo-50'
                            }`}>
                              {stage.role_title}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <>
                        {/* Origin Node: Submitter */}
                        <div className="flex flex-col items-center min-w-[76px] text-center">
                          <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-black shadow-xs ring-4 ring-white">
                            ✓
                          </div>
                          <span className="mt-1 text-[9px] font-extrabold text-emerald-700 uppercase tracking-tight">
                            Submitted
                          </span>
                          <span className="text-[10px] font-extrabold text-slate-900 leading-tight">
                            {activeLog.reported_by_name || 'Reporting Staff'}
                          </span>
                          <span className="text-[8px] font-semibold text-slate-400">
                            Submitter (Origin)
                          </span>
                        </div>

                        {/* Intermediate Stages in Flow */}
                        {activeLog.flow_roles?.map((role, idx) => {
                          const currIdx = activeLog.current_step_index ?? 0;
                          const isPast = idx < currIdx;
                          const isCurrent = idx === currIdx && activeLog.status !== 'RESOLVED';
                          const isDone = isPast || activeLog.status === 'RESOLVED';

                          const pastAction = activeLog.actions?.find(a =>
                            a.role_performed?.toUpperCase() === role.toUpperCase() &&
                            (a.action_type === 'FORWARDED' || a.action_type === 'APPROVED')
                          );
                          const authorityName = activeLog.flow_authorities?.[role.toUpperCase()] || (isCurrent ? activeLog.assigned_approver_name : '') || role.replace(/_/g, ' ');
                          const performerName = pastAction?.user_name || authorityName;

                          return (
                            <div key={role + idx} className="flex flex-col items-center min-w-[76px] text-center">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-xs ring-4 ring-white ${
                                isDone
                                  ? 'bg-emerald-500 text-white'
                                  : isCurrent
                                  ? 'bg-amber-500 text-white animate-pulse ring-amber-100'
                                  : 'bg-slate-200 text-slate-500'
                              }`}>
                                {isDone ? '✓' : isCurrent ? '🕒' : (idx + 2)}
                              </div>
                              <span className={`mt-1 text-[9px] font-extrabold uppercase tracking-tight ${
                                isDone ? 'text-emerald-700' : isCurrent ? 'text-amber-700 font-black' : 'text-slate-400'
                              }`}>
                                {isDone ? 'Forwarded' : isCurrent ? 'Pending' : 'Upcoming'}
                              </span>
                              <span className="text-[10px] font-extrabold text-slate-900 leading-tight">
                                {performerName}
                              </span>
                              <span className="text-[8px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded mt-0.5">
                                {role.replace(/_/g, ' ')}
                              </span>
                            </div>
                          );
                        })}

                        {/* Final Approver Node */}
                        <div className="flex flex-col items-center min-w-[76px] text-center">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-xs ring-4 ring-white ${
                            activeLog.status === 'RESOLVED'
                              ? 'bg-emerald-600 text-white ring-emerald-100'
                              : 'bg-slate-200 text-slate-500'
                          }`}>
                            ★
                          </div>
                          <span className={`mt-1 text-[9px] font-extrabold uppercase tracking-tight ${
                            activeLog.status === 'RESOLVED' ? 'text-emerald-700' : 'text-slate-400'
                          }`}>
                            {activeLog.status === 'RESOLVED' ? 'Finalized' : 'Finalizer'}
                          </span>
                          <span className="text-[10px] font-extrabold text-slate-900 leading-tight">
                            {activeLog.flow_authorities?.[activeLog.flow_roles?.[activeLog.flow_roles.length - 1]?.toUpperCase() ?? ''] || 'Final Approver'}
                          </span>
                          <span className="text-[8px] font-semibold text-slate-400">
                            Clearance
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 7. Action Buttons & Workflow Gate */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                {isReceiptPending && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200/80 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Approval Blocked: Awaiting student's payment receipt proof upload.</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                  >
                    Close
                  </button>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {(() => {
                      if (activeLog.status === 'RESOLVED') {
                        return (
                          <div className="px-3.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Incident Resolved & Cleared</span>
                          </div>
                        );
                      }

                      const isIntermediate = Boolean(
                        activeLog.flow_roles &&
                        typeof activeLog.current_step_index === 'number' &&
                        activeLog.current_step_index < activeLog.flow_roles.length - 1
                      );
                      const nextRoleName = isIntermediate
                        ? activeLog.flow_roles![activeLog.current_step_index! + 1] || 'Next Role'
                        : 'Final Approver';

                      if (isIntermediate) {
                        return (
                          /* INTERMEDIATE ROLE: Show Forward to <Role> button */
                          <button
                            type="button"
                            onClick={handleForward}
                            disabled={processing || isReceiptPending}
                            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 ${
                              isReceiptPending
                                ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60'
                                : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white cursor-pointer disabled:opacity-50'
                            }`}
                            title={isReceiptPending ? "Blocked: Receipt not uploaded" : `Forward to ${nextRoleName}`}
                          >
                            {processing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isReceiptPending ? (
                              <Lock className="w-3.5 h-3.5" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>Forward to {nextRoleName}</span>
                          </button>
                        );
                      }

                      /* FINAL ROLE: Show Approve & Resolve */
                      return (
                        <button
                          type="button"
                          onClick={handleFinalApprove}
                          disabled={processing || isReceiptPending}
                          className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 ${
                            isReceiptPending
                              ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 cursor-pointer disabled:opacity-50'
                          }`}
                          title={isReceiptPending ? "Blocked: Receipt not uploaded" : "Approve & Resolve"}
                        >
                          {processing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isReceiptPending ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>{isReceiptPending ? 'Approval Blocked' : 'Approve & Resolve'}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── FULL WORKFLOW TRAIL TIMELINE POPUP MODAL (SLIDE-IN MODAL) ── */}
      {showTrailModal && activeLog && (
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
                    Full history for {activeLog.student_name} ({activeLog.reg_no})
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
              {(!activeLog.actions || activeLog.actions.length === 0) ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No approval history recorded yet.
                </div>
              ) : (
                [...activeLog.actions].reverse().map((act, index) => (
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
