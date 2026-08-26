import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ChevronRight, 
  Fingerprint, 
  Layers, 
  Sparkles,
  ArrowLeft,
  CalendarDays,
  History
} from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useNavigate } from 'react-router-dom';

import fetchWithAuth from '../../../services/fetchAuth';

interface BatchLog {
  batch_id: number;
  batch_name: string;
  start_time: string;
  end_time: string;
  placed: boolean;
  status: 'Placed' | 'Missed' | 'Pending';
  verified_at?: string | null;
  finger_name?: string;
}

export default function BioSecureStudentLogsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');
  const [groupName, setGroupName] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [logs, setLogs] = useState<BatchLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deviceBusy, setDeviceBusy] = useState<boolean>(false);

  const fetchLogs = async (dateStr: string) => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/idscan/biosecure/student/logs/?date=${dateStr}`);
      if (res && res.ok) {
        const data = await res.json();
        setGroupName(data.group_name || '');
        setLogs(data.logs || []);
        setAvailableDates(data.available_dates || []);
        setDeviceBusy(Boolean(data.device_busy));
      }
    } catch (err: any) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(selectedDate);

    // If viewing today's logs, poll in background every 3s so placement & busy state updates in real time
    if (selectedDate === todayStr) {
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchWithAuth(`/api/idscan/biosecure/student/logs/?date=${todayStr}`)
            .then((res) => res && res.ok && res.json())
            .then((data) => {
              if (data) {
                setGroupName(data.group_name || '');
                setLogs(data.logs || []);
                setAvailableDates(data.available_dates || []);
                setDeviceBusy(Boolean(data.device_busy));
              }
            })
            .catch(() => {});
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedDate]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayStr;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Student Dashboard
          </button>
        </div>

        {/* Device Busy Banner if Enrollment window active */}
        {deviceBusy && (
          <div className="rounded-2xl border-2 border-amber-400/80 bg-gradient-to-r from-amber-500/20 via-amber-600/10 to-amber-500/20 p-4 text-amber-200 shadow-md backdrop-blur-md flex items-center justify-between gap-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-ping flex-shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-amber-300">Biometric Scanner is Currently Busy (Orange Mode)</h4>
                <p className="text-xs text-amber-200/90 mt-0.5">
                  Fingerprint registration is in progress on the scanner. Attendance inputs are temporarily suspended until the registration window closes.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold px-3 py-1 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-xl shrink-0">
              ENROLLMENT ACTIVE
            </span>
          </div>
        )}

        {/* Hero Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-2xl border border-indigo-500/20">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2 border border-indigo-500/30">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                BioSecure Student Attendance
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                {groupName ? groupName : 'Biometric Security Protocol'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                Real-time chronological timeline of your required biometric fingerprint verification batches and audit records.
              </p>
            </div>

            {/* Slidebar Tabs */}
            <div className="flex items-center bg-white/10 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md self-start md:self-auto">
              <button
                onClick={() => {
                  setActiveTab('today');
                  setSelectedDate(todayStr);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === 'today'
                    ? 'bg-white text-indigo-950 shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Calendar className="w-4 h-4" />
                Today's Batches
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === 'history'
                    ? 'bg-white text-indigo-950 shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <History className="w-4 h-4" />
                View All Logs
              </button>
            </div>
          </div>
        </div>

        {/* Date Selector / Filter Bar (Visible in View All Logs tab) */}
        {activeTab === 'history' && (
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              Select Date for Historical BioSecure Audit:
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {availableDates.length > 0 && (
                <select
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Recent Logged Dates</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d} {d === todayStr ? '(Today)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* ── VERTICAL TIMELINE OF BATCHES ── */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                {isToday ? "Today's Biometric Batches" : `Batches for ${selectedDate}`}
              </h2>
              <p className="text-xs text-slate-500">
                Track your verification status across each scheduled session.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
              {logs.length} {logs.length === 1 ? 'Batch' : 'Batches'}
            </span>
          </div>

          {loading ? (
            <div className="py-16 text-center">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="mt-3 text-xs font-medium text-slate-500">Loading timeline...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Clock className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Batches Scheduled</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                There are no mandatory BioSecure batches assigned to your section for this date.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 sm:pl-8 space-y-8">
              {/* Continuous Vertical Line Status Bar */}
              <div className="absolute left-[11px] sm:left-[15px] top-4 bottom-4 w-1 bg-slate-200 rounded-full"></div>

              {logs.map((log, index) => {
                const isPlaced = log.placed;
                const isMissed = log.status === 'Missed';
                const isPending = log.status === 'Pending';

                let dotBg = 'bg-slate-300 border-slate-100';
                let cardBorder = 'border-slate-200 hover:border-slate-300';
                let badgeBg = 'bg-amber-50 text-amber-700 border-amber-200';
                let Icon = Clock;

                if (isPlaced) {
                  dotBg = 'bg-emerald-500 ring-4 ring-emerald-100 text-white';
                  cardBorder = 'border-emerald-200 bg-emerald-50/20';
                  badgeBg = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                  Icon = CheckCircle2;
                } else if (isMissed) {
                  dotBg = 'bg-rose-500 ring-4 ring-rose-100 text-white';
                  cardBorder = 'border-rose-200 bg-rose-50/20';
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  Icon = XCircle;
                }

                return (
                  <div key={log.batch_id} className="relative group flex items-start gap-4 sm:gap-6">
                    {/* Status Dot on Vertical Bar */}
                    <div
                      className={`absolute -left-[27px] sm:-left-[31px] top-3.5 w-6 h-6 rounded-full flex items-center justify-center transition-all ${dotBg}`}
                    >
                      {isPlaced ? (
                        <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      ) : isMissed ? (
                        <XCircle className="w-4 h-4 stroke-[2.5]" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      )}
                    </div>

                    {/* Batch Card Details */}
                    <div
                      className={`flex-1 rounded-2xl border p-5 shadow-sm transition-all ${cardBorder}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">
                              {log.batch_name}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeBg}`}
                            >
                              <Icon className="w-3 h-3" />
                              {log.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mt-1">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span>
                              {log.start_time} — {log.end_time}
                            </span>
                          </div>
                        </div>

                        {/* Placed Verification Timestamp or Missed Indicator */}
                        <div className="text-left sm:text-right">
                          {isPlaced ? (
                            <div className="text-xs">
                              <span className="text-emerald-700 font-bold">✓ Verified on Finger Scanner</span>
                              {log.verified_at && (
                                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  {log.verified_at}
                                </p>
                              )}
                            </div>
                          ) : isMissed ? (
                            <div className="text-xs">
                              <span className="text-rose-600 font-bold">✗ Verification Window Expired</span>
                              <p className="text-[11px] text-rose-500 mt-0.5">Fingerprint not placed in time</p>
                            </div>
                          ) : (
                            <div className="text-xs">
                              <span className="text-slate-500 font-medium">Session in progress / upcoming</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
