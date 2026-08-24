import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { Building2, Calendar, Clock, MapPin, UserCheck, AlertCircle, CheckCircle2, Printer, RefreshCw } from 'lucide-react';

interface StudentAllocation {
  reg_no: string;
  hall_name: string;
  seat_label: string;
  row_number: number;
  column_letter: string;
  department: string;
  exam_title: string;
  semester_text: string;
  exam_date: string;
  session: string;
  published_at?: string;
}

interface StudentHallPlanResponse {
  published: boolean;
  reg_no?: string;
  student_name?: string;
  allocations: StudentAllocation[];
  message?: string;
}

export default function StudentHallPlanPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StudentHallPlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHallPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/coe/student-hall-plan/');
      if (!res.ok) {
        throw new Error(`Failed to load hall plan (HTTP ${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Error loading student hall plan:', err);
      setError(err?.message || 'Unable to retrieve hall plan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHallPlan();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7f2] text-[#1f493d]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#5b1a30]">Exam Hall Plan</h1>
              <p className="text-sm text-[#6a4a40]">
                View your allocated examination hall and seat position.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchHallPlan}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#d8a791] bg-white px-4 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fbeee8] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {data?.published && data.allocations.length > 0 && (
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-[#3c6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f5649] transition-all"
            >
              <Printer className="h-4 w-4" />
              Print Slip
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold">Error Loading Plan</h3>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#ead7d0] bg-white p-12 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#3c6a5a] border-t-transparent" />
          <p className="mt-4 text-sm font-semibold text-[#6a4a40]">Checking for published hall plan...</p>
        </div>
      ) : !data?.published || !data.allocations || data.allocations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d8a791] bg-white/95 p-12 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fce8dc] text-[#b2472e]">
            <Calendar className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[#5b1a30]">No Hall Plan Published Yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#6a4a40]">
            The Controller of Examinations has not published the seating plan for your register number yet. Please check back closer to the exam date.
          </p>
          {data?.reg_no && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#f7e8df] px-4 py-1.5 text-xs font-semibold text-[#7a2038]">
              Register Number: {data.reg_no}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {data.allocations.map((alloc, idx) => (
            <div
              key={`${alloc.hall_name}-${alloc.seat_label}-${idx}`}
              className="overflow-hidden rounded-2xl border border-[#deb9ac] bg-white shadow-md"
            >
              {/* Exam Header */}
              <div className="border-b border-[#f0e4dc] bg-[#fffbf9] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-[#edf7f2] border border-[#3c6a5a] px-3 py-1 text-xs font-bold text-[#1f493d]">
                      {alloc.session} Session
                    </span>
                    <h2 className="mt-2 text-xl font-bold text-[#5b1a30]">{alloc.exam_title}</h2>
                    <p className="text-sm font-medium text-[#7a6055]">
                      {alloc.semester_text} {alloc.department ? `• ${alloc.department}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div className="rounded-xl border border-[#ead7d0] bg-white px-4 py-2 text-center">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#9b8077]">
                        Exam Date
                      </span>
                      <span className="text-base font-bold text-[#5b1a30]">{alloc.exam_date || 'TBA'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Seating Details Card */}
              <div className="p-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Hall Allocation Card */}
                  <div className="rounded-2xl border border-[#3c6a5a]/30 bg-gradient-to-br from-[#edf7f2] to-[#e1f2ec] p-6 text-center shadow-inner">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#3c6a5a] text-white shadow-md">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#3c6a5a]">
                      Assigned Exam Hall
                    </span>
                    <h3 className="mt-1 text-3xl font-extrabold tracking-tight text-[#16382f]">
                      {alloc.hall_name}
                    </h3>
                  </div>

                  {/* Seat Position Card */}
                  <div className="rounded-2xl border border-[#b2472e]/30 bg-gradient-to-br from-[#fff5ee] to-[#fce8dc] p-6 text-center shadow-inner">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#b2472e] text-white shadow-md">
                      <UserCheck className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#b2472e]">
                      Your Seat Position
                    </span>
                    <h3 className="mt-1 text-3xl font-extrabold tracking-tight text-[#7a2038]">
                      Seat {alloc.seat_label}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-[#a3442c]">
                      Column {alloc.column_letter} — Row {alloc.row_number}
                    </p>
                  </div>
                </div>

                {/* Student Info Bar */}
                <div className="mt-6 flex flex-wrap items-center justify-between rounded-xl border border-[#f0e4dc] bg-[#fffbf9] px-4 py-3 text-sm">
                  <div>
                    <span className="text-xs text-[#9b8077]">Student Register No: </span>
                    <span className="font-mono font-bold text-[#5b1a30]">{alloc.reg_no}</span>
                  </div>
                  {data.student_name && (
                    <div>
                      <span className="text-xs text-[#9b8077]">Candidate: </span>
                      <span className="font-semibold text-[#5b1a30]">{data.student_name}</span>
                    </div>
                  )}
                </div>

                {/* Important Guidelines */}
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                    <Clock className="h-4 w-4 text-amber-700" />
                    Examination Hall Instructions
                  </h4>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-900/90">
                    <li>Please occupy your assigned seat (<strong>{alloc.seat_label}</strong> in <strong>{alloc.hall_name}</strong>) at least 15 minutes before the exam start time.</li>
                    <li>Ensure you have your College ID card and Hall Ticket before entering the hall.</li>
                    <li>Electronic gadgets, mobile phones, smartwatches, and programmable calculators are strictly prohibited inside the hall.</li>
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
