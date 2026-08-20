import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, Archive, RotateCcw, AlertTriangle, CheckCircle,
  Loader2, ChevronLeft, Info, Lock, Unlock,
  Users, BookOpen, UserCheck, Calendar
} from 'lucide-react';
import {
  fetchBatchYearsWithGraduation,
  graduateBatch,
  ungraduateBatch,
  BatchYearFull,
  GraduateResult,
} from '../../services/academics';

// ─── Confirmation Modal ────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  batch: BatchYearFull | null;
  onConfirm: () => void;
  onCancel: () => void;
  processing: boolean;
}

function ConfirmGraduateModal({ open, batch, onConfirm, onCancel, processing }: ConfirmModalProps) {
  if (!open || !batch) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!processing ? onCancel : undefined} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-amber-500 to-orange-500 flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Archive Batch {batch.name}</h2>
            <p className="text-amber-100 text-sm">This action affects all departments</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* What will happen */}
          <div className="space-y-3">
            <p className="text-slate-700 font-semibold text-sm">The following will happen immediately:</p>
            <ul className="space-y-2.5">
              {[
                { icon: Lock, color: 'text-red-500 bg-red-50', text: 'All sections in batch ' + batch.name + ' will be frozen — semesters will never auto-update again' },
                { icon: UserCheck, color: 'text-orange-500 bg-orange-50', text: 'All active Class Advisor assignments for these sections will be deactivated' },
                { icon: Users, color: 'text-blue-500 bg-blue-50', text: 'All active students in these sections will be set to ALUMNI status' },
                { icon: BookOpen, color: 'text-purple-500 bg-purple-50', text: 'All historical data (attendance, marks, timetables) is fully preserved in the database' },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-lg ${item.color} flex-shrink-0 mt-0.5`}>
                    <item.icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm text-slate-600">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              <span className="font-bold">This is significant but reversible.</span>{' '}
              You can undo this with the "Restore" button, though advisor assignments will need to be manually reassigned.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onCancel}
              disabled={processing}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-bold shadow-md shadow-orange-200 disabled:opacity-50 active:scale-95"
            >
              {processing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Archiving...</>
              ) : (
                <><GraduationCap className="w-4 h-4" /> Graduate Batch {batch.name}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Result Card ───────────────────────────────────────────────────────────────

function ResultCard({ result, onDismiss }: { result: GraduateResult; onDismiss: () => void }) {
  return (
    <div className="mb-6 bg-green-50 border border-green-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 bg-green-100 border-b border-green-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-green-800 font-bold">
          <CheckCircle className="w-5 h-5" />
          Batch Archived Successfully
        </div>
        <button onClick={onDismiss} className="text-green-600 hover:text-green-800 text-xs font-medium">Dismiss</button>
      </div>
      <div className="p-5 grid grid-cols-3 gap-4">
        {[
          { label: 'Batches Deactivated', value: result.batches_deactivated, icon: Archive },
          { label: 'Advisors Deactivated', value: result.advisors_deactivated, icon: UserCheck },
          { label: 'Students → Alumni', value: result.students_set_alumni, icon: Users },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <item.icon className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <div className="text-2xl font-black text-green-700">{item.value}</div>
            <div className="text-xs text-green-600">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BatchArchivalPage() {
  const navigate = useNavigate();
  const [batchYears, setBatchYears] = useState<BatchYearFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null); // batch year id being processed

  const [confirmTarget, setConfirmTarget] = useState<BatchYearFull | null>(null);
  const [lastResult, setLastResult] = useState<GraduateResult | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBatchYearsWithGraduation();
      setBatchYears(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load batch years');
    } finally {
      setLoading(false);
    }
  }

  async function handleGraduateConfirm() {
    if (!confirmTarget) return;
    setProcessing(confirmTarget.id);
    setError(null);
    try {
      const result = await graduateBatch(confirmTarget.id);
      setLastResult(result);
      setConfirmTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to graduate batch');
      setConfirmTarget(null);
    } finally {
      setProcessing(null);
    }
  }

  async function handleUngraduate(by: BatchYearFull) {
    const ok = window.confirm(
      `Restore batch "${by.name}" from graduated state?\n\n` +
      `This will reactivate the batch but will NOT restore class advisor assignments or student statuses — those must be manually reassigned.`
    );
    if (!ok) return;

    setProcessing(by.id);
    setError(null);
    try {
      await ungraduateBatch(by.id);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to restore batch');
    } finally {
      setProcessing(null);
    }
  }

  const activeBatches = batchYears.filter(b => !b.is_graduated);
  const graduatedBatches = batchYears.filter(b => b.is_graduated);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-lg shadow-orange-200">
                <GraduationCap className="w-7 h-7 text-white" />
              </div>
              Batch Archival
            </h1>
            <p className="text-slate-500 mt-1 ml-[3.75rem]">
              Archive completed batches to protect historical data and prevent stale updates.
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mb-8 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 space-y-1">
            <p className="font-semibold">What does archiving a batch do?</p>
            <ul className="list-disc list-inside space-y-1 text-blue-600 ml-1">
              <li>Semester numbers for that batch's sections are <strong>frozen</strong> — future "Shift Semester" operations will skip them</li>
              <li>Class advisor assignments for those sections are <strong>deactivated</strong></li>
              <li>Active students in those sections are marked as <strong>Alumni</strong></li>
              <li>All attendance, marks, and timetable data remain <strong>fully intact</strong> for history and reports</li>
            </ul>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Success Result */}
        {lastResult && <ResultCard result={lastResult} onDismiss={() => setLastResult(null)} />}

        {/* Loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin mb-3" />
            <p>Loading batch years...</p>
          </div>
        ) : (
          <div className="space-y-8">

            {/* Active Batches */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <h2 className="text-lg font-bold text-slate-800">Active Batches</h2>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                  {activeBatches.length}
                </span>
              </div>

              {activeBatches.length === 0 ? (
                <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
                  <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">All batches are graduated — no active batches remain.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {activeBatches.map((by) => (
                      <div
                        key={by.id}
                        className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 bg-indigo-100 rounded-xl">
                            <BookOpen className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-lg">{by.name}</span>
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-semibold">
                                Active
                              </span>
                            </div>
                            {(by.start_year || by.end_year) && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  {by.start_year || '?'} – {by.end_year || '?'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          id={`graduate-btn-${by.id}`}
                          onClick={() => setConfirmTarget(by)}
                          disabled={!!processing}
                          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:from-amber-600 hover:to-orange-600 transition-all shadow-md shadow-orange-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processing === by.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <GraduationCap className="w-4 h-4" />
                          )}
                          Graduate &amp; Archive
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Graduated Batches */}
            {graduatedBatches.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-slate-400 rounded-full" />
                  <h2 className="text-lg font-bold text-slate-800">Graduated / Archived Batches</h2>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                    {graduatedBatches.length}
                  </span>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden opacity-85">
                  <div className="divide-y divide-slate-100">
                    {graduatedBatches.map((by) => (
                      <div
                        key={by.id}
                        className="flex items-center justify-between px-6 py-4 bg-slate-50/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 bg-slate-200 rounded-xl">
                            <Archive className="w-5 h-5 text-slate-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-500 text-lg line-through-subtle">{by.name}</span>
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full font-semibold">
                                <Lock className="w-2.5 h-2.5" />
                                Archived
                              </span>
                            </div>
                            <div className="space-y-0.5 mt-1">
                              {by.graduated_at && (
                                <p className="text-xs text-slate-400 flex items-center gap-1">
                                  <GraduationCap className="w-3 h-3" />
                                  Graduated {new Date(by.graduated_at).toLocaleDateString('en-IN', {
                                    day: 'numeric', month: 'short', year: 'numeric'
                                  })}
                                  {by.graduated_by_name && ` by ${by.graduated_by_name}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          id={`restore-btn-${by.id}`}
                          onClick={() => handleUngraduate(by)}
                          disabled={!!processing}
                          className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-xl hover:bg-white hover:border-indigo-300 hover:text-indigo-600 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processing === by.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-400 flex items-start gap-1.5 px-1">
                  <Unlock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Restoring a batch reactivates it, but class advisor assignments and student statuses must be manually reassigned.
                </p>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmGraduateModal
        open={!!confirmTarget}
        batch={confirmTarget}
        onConfirm={handleGraduateConfirm}
        onCancel={() => setConfirmTarget(null)}
        processing={processing === confirmTarget?.id}
      />
    </div>
  );
}
