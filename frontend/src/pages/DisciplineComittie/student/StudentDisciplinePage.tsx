import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  IndianRupee, 
  UploadCloud, 
  FileCheck, 
  FileText, 
  AlertCircle, 
  ExternalLink, 
  RefreshCw, 
  User, 
  Building2, 
  GraduationCap, 
  Loader2, 
  X,
  Check,
  CreditCard,
  Wallet,
  Receipt,
  Scale
} from 'lucide-react';
import { getApiBase } from '../../../services/apiBase';
import { 
  DisciplineLog, 
  fetchStudentMyIncidents, 
  uploadDisciplineReceipt 
} from '../../../services/discipline';

function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getApiBase()}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default function StudentDisciplinePage() {
  const [pendingActions, setPendingActions] = useState<DisciplineLog[]>([]);
  const [completedActions, setCompletedActions] = useState<DisciplineLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Upload Receipt Modal
  const [activeUploadLog, setActiveUploadLog] = useState<DisciplineLog | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [receiptNotes, setReceiptNotes] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStudentIncidents = async () => {
    setLoading(true);
    try {
      const data = await fetchStudentMyIncidents();
      setPendingActions(data.pending_actions || []);
      setCompletedActions(data.completed_actions || []);
    } catch (e) {
      console.error('Failed to load student discipline records:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentIncidents();
  }, []);

  const handleOpenUploadModal = (log: DisciplineLog) => {
    setActiveUploadLog(log);
    setSelectedFile(null);
    setReceiptNotes('');
    setErrorMessage(null);
    setUploadSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUploadLog || !selectedFile) {
      setErrorMessage('Please select a receipt document / image to upload.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    try {
      const updated = await uploadDisciplineReceipt(activeUploadLog.id, selectedFile, receiptNotes.trim());
      setUploadSuccess(true);
      setTimeout(() => {
        setActiveUploadLog(null);
        setUploadSuccess(false);
        loadStudentIncidents();
      }, 1600);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload receipt proof.');
    } finally {
      setUploading(false);
    }
  };

  // ── ANALYTICS CALCULATIONS ──
  const pendingFineAmount = pendingActions.reduce(
    (sum, item) => sum + (item.has_fine ? Number(item.fine_amount || 0) : 0),
    0
  );
  const pendingFineCount = pendingActions.filter(
    (item) => item.has_fine && Number(item.fine_amount || 0) > 0
  ).length;

  const totalPaidAmount = completedActions.reduce(
    (sum, item) => sum + (item.has_fine ? Number(item.fine_amount || 0) : 0),
    0
  );
  const totalPaidCount = completedActions.filter(
    (item) => item.has_fine && Number(item.fine_amount || 0) > 0
  ).length;

  const totalAllFinesAssessed = pendingFineAmount + totalPaidAmount;
  const totalIncidentsCount = pendingActions.length + completedActions.length;

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-rose-600 to-indigo-600 text-white rounded-2xl shadow-sm">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              My Discipline Records & Fine Actions
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Review any reported discipline incidents, assigned fine penalties, upload payment proofs, and track approval status.
            </p>
          </div>
        </div>

        <button
          onClick={loadStudentIncidents}
          disabled={loading}
          className="p-2.5 text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer w-fit"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── ANALYTICS STAT CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Pending Fine Amount */}
        <div className="bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-white border border-rose-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-rose-300 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl -mr-6 -mt-6 group-hover:scale-110 transition" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
              Pending Amount
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-100/90 text-rose-700 flex items-center justify-center shadow-xs">
              <Wallet className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-rose-700 flex items-center gap-0.5 tracking-tight">
              <IndianRupee className="w-6 h-6 stroke-[2.5]" />
              <span>{pendingFineAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-rose-900/80 mt-1.5 pt-2 border-t border-rose-100">
              <span className="font-semibold">Unresolved Fines:</span>
              <span className="font-extrabold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md">
                {pendingFineCount} {pendingFineCount === 1 ? 'fine' : 'fines'} ({pendingActions.length} pending actions)
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Amount Paid */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white border border-emerald-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-emerald-300 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 group-hover:scale-110 transition" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              Total Amount Paid
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100/90 text-emerald-700 flex items-center justify-center shadow-xs">
              <Receipt className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 flex items-center gap-0.5 tracking-tight">
              <IndianRupee className="w-6 h-6 stroke-[2.5]" />
              <span>{totalPaidAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-emerald-900/80 mt-1.5 pt-2 border-t border-emerald-100">
              <span className="font-semibold">Cleared Payments:</span>
              <span className="font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                {totalPaidCount} {totalPaidCount === 1 ? 'paid' : 'paid'} ({completedActions.length} resolved)
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Overall Assessment & Records */}
        <div className="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white border border-indigo-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-indigo-300 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-6 -mt-6 group-hover:scale-110 transition" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">
              Total Fines Assessed
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-100/90 text-indigo-700 flex items-center justify-center shadow-xs">
              <Scale className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-indigo-700 flex items-center gap-0.5 tracking-tight">
              <IndianRupee className="w-6 h-6 stroke-[2.5]" />
              <span>{totalAllFinesAssessed.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-indigo-900/80 mt-1.5 pt-2 border-t border-indigo-100">
              <span className="font-semibold">Total Discipline Logs:</span>
              <span className="font-extrabold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                {totalIncidentsCount} {totalIncidentsCount === 1 ? 'incident' : 'incidents'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: TOP PENDING ACTIONS ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">
              Pending Actions ({pendingActions.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">Requires payment or awaiting committee approval</span>
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-600 font-semibold">Loading your discipline incidents...</p>
          </div>
        ) : pendingActions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm flex items-center justify-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-slate-800">No Pending Discipline Actions</h3>
              <p className="text-xs text-slate-500">You have no active or pending fines under review.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {pendingActions.map((log) => {
              const hasFine = Boolean(log.has_fine && Number(log.fine_amount) > 0);
              const hasReceipt = Boolean(log.receipt_document || log.receipt_document_url);

              return (
                <div
                  key={log.id}
                  className="bg-white rounded-2xl border-2 border-rose-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                >
                  <div className="p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                          {log.status.replace(/_/g, ' ')}
                        </span>
                        <h3 className="text-base font-extrabold text-slate-900 mt-1.5 leading-snug">
                          {log.category_title || 'Discipline Record'}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Reported on {new Date(log.incident_date).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Fine Amount Pill Badge */}
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Fine Amount</span>
                        <span className="text-lg font-black text-rose-600 flex items-center justify-end">
                          <IndianRupee className="w-4 h-4 stroke-[2.5]" />
                          {hasFine ? Number(log.fine_amount).toFixed(2) : '0.00'}
                        </span>
                      </div>
                    </div>

                    {/* Incident Details Card */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                      {log.remarks && (
                        <div className="p-2.5 bg-rose-50/80 rounded-xl border border-rose-200/90 space-y-1 text-xs">
                          <div className="flex items-center gap-1.5 text-rose-700 font-extrabold text-[10px] uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 inline-block animate-ping" />
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 animate-pulse" />
                            <span>Faculty Remarks / Violation Details:</span>
                          </div>
                          <p className="italic text-rose-700 font-bold bg-white/90 p-2 rounded-lg border border-rose-200/70 shadow-2xs leading-relaxed">
                            "{log.remarks}"
                          </p>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-slate-700 pt-1 border-t border-slate-200">
                        <span className="font-semibold text-slate-500">Current Approver in Flow:</span>
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          {log.current_role || 'Discipline Committee'}
                        </span>
                      </div>
                    </div>

                    {/* Receipt Status */}
                    {hasReceipt && (
                      <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                          <FileCheck className="w-4 h-4 text-emerald-600" />
                          <span>Receipt Proof Submitted</span>
                        </div>
                        <a
                          href={resolveMediaUrl(log.receipt_document || log.receipt_document_url)!}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>View Proof</span>
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Action Button Footer */}
                  <div className="p-4 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {hasReceipt
                        ? 'Under review by approvers'
                        : hasFine
                        ? 'Upload payment receipt to proceed'
                        : 'Under review'}
                    </span>

                    {/* SUBMIT RECEIPT PROOF BUTTON */}
                    {hasFine && (
                      <button
                        onClick={() => handleOpenUploadModal(log)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>{hasReceipt ? 'Re-upload Receipt' : 'Upload Receipt Proof'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 2: BELOW COMPLETED ACTIONS ── */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">
              Completed & Resolved Actions ({completedActions.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">Approved and closed discipline cases</span>
        </div>

        {completedActions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
            <p className="text-xs text-slate-400 font-semibold">No past completed discipline records.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            {completedActions.map((log) => (
              <div key={log.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5 font-bold" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-snug">
                      {log.category_title || 'Discipline Record'}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>Reported: {new Date(log.incident_date).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="text-emerald-700 font-bold">Approved & Resolved</span>
                    </div>
                    {log.action_notes && (
                      <p className="text-xs text-slate-600 mt-1 italic">
                        Resolution Notes: "{log.action_notes}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-right">
                  {log.has_fine && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Fine Paid</span>
                      <span className="text-xs font-bold text-slate-800 flex items-center justify-end">
                        <IndianRupee className="w-3 h-3" />
                        {Number(log.fine_amount).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {(log.receipt_document || log.receipt_document_url) && (
                    <a
                      href={resolveMediaUrl(log.receipt_document || log.receipt_document_url)!}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Receipt</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── RECEIPT UPLOAD MODAL POPUP ── */}
      {activeUploadLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Upload Fine Receipt Proof</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Attach payment receipt / transaction screenshot for verification.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveUploadLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Receipt proof uploaded successfully! Sent to approver.</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmitReceipt} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                <span className="font-semibold text-slate-600">Payable Fine Amount:</span>
                <span className="text-base font-extrabold text-indigo-700 flex items-center">
                  <IndianRupee className="w-4 h-4 stroke-[2.5]" />
                  {Number(activeUploadLog.fine_amount).toFixed(2)}
                </span>
              </div>

              {/* File Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Receipt Document / Screenshot <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded-xl p-2 bg-slate-50"
                  required
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Transaction Reference / Notes
                </label>
                <textarea
                  rows={2}
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="e.g., Paid via UPI / College Cash Counter Ref #12345..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveUploadLog(null)}
                  disabled={uploading}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-200 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                  <span>Submit Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
