import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  RefreshCw, CheckCircle, AlertCircle, Calendar, ArrowRight, 
  Loader2, ChevronLeft, History, User, Clock 
} from 'lucide-react';
import { 
  fetchAcademicYears, shiftSemester, fetchTransitionLogs, 
  AcademicYearRow, TransitionLog 
} from '../../services/academics';

export default function SystemTransitionsPage() {
  const navigate = useNavigate();
  const [academicYears, setAcademicYears] = useState<AcademicYearRow[]>([]);
  const [logs, setLogs] = useState<TransitionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [ayData, logsData] = await Promise.all([
        fetchAcademicYears(),
        fetchTransitionLogs()
      ]);
      setAcademicYears(ayData);
      setLogs(logsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load system data');
    } finally {
      setLoading(false);
    }
  }

  async function handleShift(ayId: number, ayName: string) {
    const confirm = window.confirm(
      `Are you sure you want to shift all sections to ${ayName}? \n\nThis will globally update the semester for every student group based on their batch start year.`
    );
    if (!confirm) return;

    setProcessing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await shiftSemester(ayId);
      setSuccess(result.message);
      await loadData(); // refresh list and logs
    } catch (err: any) {
      setError(err.message || 'Failed to perform semester shift');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Navigation & Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <button 
          onClick={() => navigate('/dashboard')}
          className="hover:text-indigo-600 transition-colors"
        >
          Dashboard
        </button>
        <ArrowRight className="w-3 h-3" />
        <span className="text-slate-900 font-medium">System Transitions</span>
      </nav>

      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <RefreshCw className={`w-8 h-8 text-indigo-600 ${processing ? 'animate-spin' : ''}`} />
            System Transitions
          </h1>
          <p className="text-slate-600 mt-2">
            Manage global semester shifts and academic year transitions.
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Action Section */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800">Academic Year Transition</h2>
                <p className="text-xs text-slate-500">Select a year to activate and recalculate semesters.</p>
              </div>
            </div>

            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p>Loading academic years...</p>
              </div>
            ) : academicYears.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No academic years defined in the system.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {academicYears.map((ay) => (
                  <div key={ay.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${ay.is_active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                        <Calendar className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">
                          {ay.name} 
                          {ay.is_active && (
                            <span className="ml-3 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-slate-500 font-medium">Parity: {ay.parity}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleShift(ay.id, ay.name)}
                      disabled={processing || ay.is_active}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all ${
                        ay.is_active 
                          ? 'bg-slate-100 text-slate-400 cursor-default' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg active:scale-95'
                      }`}
                    >
                      {ay.is_active ? 'Current Active' : 'Shift to this Year'}
                      {!ay.is_active && <ArrowRight className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl">
            <h3 className="text-amber-800 font-bold flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5" />
              Important Note
            </h3>
            <p className="text-sm text-amber-700 leading-relaxed">
              Shifting the semester will update all <b>Sections</b> to their new semester numbers 
              calculated based on the selected Academic Year and the section's Batch start year. 
              Student profiles will remain in their current departments, batches, and sections, 
              but their <b>academic level</b> will advance.
            </p>
          </div>
        </div>

        {/* Sidebar / History Section */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden sticky top-24">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
              <History className="w-5 h-5 text-slate-600" />
              <h2 className="font-bold text-slate-800">Transition History</h2>
            </div>
            
            <div className="max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-xs">Loading logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic text-sm">
                  No previous transitions recorded.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-bold text-slate-900">{log.academic_year}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded uppercase">
                          {log.parity}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <User className="w-3.5 h-3.5" />
                          <span>{log.performed_by}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{new Date(log.performed_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-green-600">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{log.updated_count} sections updated</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
