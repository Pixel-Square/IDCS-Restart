import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Clock, Plus, AlertTriangle } from 'lucide-react';
import { apiClient } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';
import { getMyRequests, getColClaimableInfo, getActiveTemplates } from '../../services/staffRequests';
import NewRequestModal from '../staff-requests/NewRequestModal';
import LeaveBalanceBadges from '../../components/LeaveBalanceBadges';
import type { StaffRequest } from '../../types/staffRequests';

interface AttendanceRecord {
  id: number;
  date: string;
  status: string;  // Any status: 'present', 'absent', 'partial', 'OD', 'CL', 'ML', 'COL', etc.
  fn_status: string;
  an_status: string;
  morning_in: string | null;
  evening_out: string | null;
  has_approved_col_form: boolean;
}

interface AttendanceSummary {
  year: number;
  month: number;
  total_records: number;
  present_count: number;
  absent_count: number;
  partial_count: number;
}

interface Holiday {
  id: number;
  date: string;
  name: string;
  notes: string;
  is_sunday: boolean;
  is_removable: boolean;
  department_ids: number[];
  departments_info: { id: number; name: string; code: string; short_name: string }[];
}

interface AttendanceSettings {
  id: number;
  attendance_in_time_limit: string;
  mid_time_split: string;
  attendance_out_time_limit: string;
  apply_time_based_absence: boolean;
}

export default function MyCalendarPage() {
  const [attendanceData, setAttendanceData] = useState<{ records: AttendanceRecord[]; summary: AttendanceSummary } | null>(null);
  const [myRequests, setMyRequests] = useState<StaffRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [colInfo, setColInfo] = useState<any>(null);
  const [attendanceSettings, setAttendanceSettings] = useState<AttendanceSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [lateEntryTemplateId, setLateEntryTemplateId] = useState<number | null>(null);
  const [mobileWeekIndex, setMobileWeekIndex] = useState(0);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    fetchMonthlyAttendance();
    fetchMyRequests();
    fetchHolidays();
    fetchColInfo();
    fetchLateEntryTemplate();
    fetchAttendanceSettings();
  }, [selectedYear, selectedMonth]);

  const fetchLateEntryTemplate = async () => {
    try {
      const templates = await getActiveTemplates();
      const lateEntryTemplate = templates.find(t => t.name === 'Late Entry Permission');
      if (lateEntryTemplate) {
        setLateEntryTemplateId(lateEntryTemplate.id || null);
      }
    } catch (err) {
      // ignore error
    }
  };

  const fetchAttendanceSettings = async () => {
    try {
      const response = await apiClient.get(`${getApiBase()}/api/staff-attendance/settings/current/`);
      setAttendanceSettings(response.data);
    } catch (err) {
      // Use default values if fetch fails
      setAttendanceSettings({
        id: 1,
        attendance_in_time_limit: '08:45:00',
        mid_time_split: '13:00:00',
        attendance_out_time_limit: '17:00:00',
        apply_time_based_absence: true
      });
    }
  };

  const fetchMonthlyAttendance = async () => {
    try {
      setLoading(true);
      const url = `${getApiBase()}/api/staff-attendance/records/monthly_records/`;
      const response = await apiClient.get(url, {
        params: { year: selectedYear, month: selectedMonth, self_only: 'true' }
      });
      setAttendanceData(response.data);
    } catch (err) {
      setError('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRequests = async () => {
    try {
      const requests = await getMyRequests();
      setMyRequests(requests);
    } catch (err) {
      // ignore fetch errors for requests
    }
  };

  const fetchHolidays = async () => {
    try {
      const response = await apiClient.get(`${getApiBase()}/api/staff-attendance/holidays/`);
      setHolidays(response.data);
    } catch (err) {
      // ignore holidays fetch errors
    }
  };

  const fetchColInfo = async () => {
    try {
      const info = await getColClaimableInfo();
      setColInfo(info);
    } catch (err) {
      // ignore
    }
  };

  const isHoliday = (dateStr: string): Holiday | null => {
    // Normalize stored holiday date (may be YYYY-MM-DD or ISO string) by taking first 10 chars
    return holidays.find(h => String(h.date).slice(0, 10) === dateStr) || null;
  };

  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const getStatusIcon = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'present') {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    } else if (s === 'partial' || s === 'half_day') {
      return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    } else if (s === 'od' || s === 'on duty' || s === 'cl' || s === 'ml' || s === 'col' || s === 'leave') {
      return <CheckCircle className="w-4 h-4 text-purple-600" />;  // Leave/OD = purple check
    } else {
      return <XCircle className="w-4 h-4 text-red-600" />;  // Absent = red X
    }
  };

  const getStatusBgColor = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'present') {
      return 'bg-green-50 border-green-200';
    } else if (s === 'partial' || s === 'half_day') {
      return 'bg-yellow-50 border-yellow-200';
    } else if (s === 'od' || s === 'on duty' || s === 'cl' || s === 'ml' || s === 'col' || s === 'leave') {
      return 'bg-purple-50 border-purple-200';  // Leave/OD = purple
    } else {
      return 'bg-red-50 border-red-200';  // Absent = red
    }
  };

  const getAttendanceForDate = (date: number): AttendanceRecord | undefined => {
    if (!attendanceData) return undefined;
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return attendanceData.records.find(r => r.date === dateStr);
  };

  const getDaysInMonth = () => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  };

  const getFirstDayOfMonth = () => {
    return new Date(selectedYear, selectedMonth - 1, 1).getDay();
  };

  // Helpers to determine late/early times for highlighting
  const parseTime = (timeStr?: string | null) => {
    if (!timeStr) return null;
    // Some records may already be in 24h or 12h with AM/PM. Rely on Date parsing for consistency.
    const parsed = new Date(`2000-01-01 ${timeStr}`);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const isTimeInLate = (timeStr?: string | null) => {
    const t = parseTime(timeStr);
    if (!t || !attendanceSettings) return false;
    // Parse attendance_in_time_limit (format: HH:MM:SS)
    const cutoff = new Date(`2000-01-01 ${attendanceSettings.attendance_in_time_limit}`);
    return t > cutoff;
  };

  const handleLateEntryClick = (e: React.MouseEvent, day: number) => {
    e.stopPropagation();
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setShowNewRequestModal(true);
  };

  const isTimeOutEarly = (timeStr?: string | null) => {
    const t = parseTime(timeStr);
    if (!t || !attendanceSettings) return false;
    // Parse attendance_out_time_limit (format: HH:MM:SS)
    const cutoff = new Date(`2000-01-01 ${attendanceSettings.attendance_out_time_limit}`);
    return t < cutoff;
  };

  const handleDateClick = (day: number) => {
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setShowNewRequestModal(true);
  };

  const handleRequestCreated = () => {
    setShowNewRequestModal(false);
    fetchMyRequests();
    fetchColInfo();
  };

  // Calculate permission count by duration
  const permissionCountByDuration = useMemo(() => {
    const counts: Record<string, number> = {};
    
    myRequests
      .filter(req => req.template.name === 'Late Entry Permission')
      .forEach(req => {
        const duration = req.form_data?.late_duration;
        if (duration) {
          counts[duration] = (counts[duration] || 0) + 1;
        }
      });
    
    return counts;
  }, [myRequests]);

  // Get leave status for a specific date from approved requests
  const getLeaveStatusForDate = (date: number): string | null => {
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    const dateObj = new Date(dateStr);
    
    // Find approved requests that cover this date
    for (const request of myRequests) {
      if (request.status !== 'approved') continue;
      
      const statusCode = request.template?.leave_policy?.attendance_status;
      if (!statusCode) continue;
      
      // Get date range from form_data
      const formData = request.form_data;
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      
      // Try different field name patterns
      for (const startKey of ['start_date', 'from_date', 'startDate', 'fromDate', 'date']) {
        if (formData[startKey]) {
          startDate = new Date(formData[startKey]);
          break;
        }
      }
      
      for (const endKey of ['end_date', 'to_date', 'endDate', 'toDate']) {
        if (formData[endKey]) {
          endDate = new Date(formData[endKey]);
          break;
        }
      }
      
      // If only start date, assume single day
      if (startDate && !endDate) {
        endDate = startDate;
      }
      
      // Check if date falls within range
      if (startDate && endDate && dateObj >= startDate && dateObj <= endDate) {
        return statusCode;
      }
    }
    
    return null;
  };

  const requestCoversDate = (request: any, dateStr: string) => {
    if (!request || !request.form_data) return false;
    const fd = request.form_data as Record<string, any>;

    const getIso = (v: any) => {
      if (!v) return null;
      if (typeof v === 'string') return String(v).slice(0, 10);
      try {
        return (new Date(v)).toISOString().slice(0, 10);
      } catch {
        return String(v).slice(0, 10);
      }
    };

    const start = getIso(fd.start_date || fd.from_date || fd.startDate || fd.fromDate || fd.date);
    const end = getIso(fd.end_date || fd.to_date || fd.endDate || fd.toDate || fd.date) || start;
    if (!start) return false;
    return dateStr >= start && dateStr <= end;
  };

  const isPaidByCol = (dateStr: string) => {
    if (!myRequests || !Array.isArray(myRequests)) return false;
    return myRequests.some(r => r.status === 'approved' && r.form_data && (r.form_data.claim_col === true || r.form_data.claim_col === 'true') && requestCoversDate(r, dateStr));
  };

  const isEarnedCol = (dateStr: string) => {
    // First check earned_dates from colInfo (attendance on holidays)
    if (colInfo && Array.isArray(colInfo.earned_dates) && colInfo.earned_dates.length > 0) {
      if (colInfo.earned_dates.some((e: any) => String(e.date).slice(0, 10) === dateStr)) return true;
    }

    if (!myRequests || !Array.isArray(myRequests)) return false;
    // Check if there's an approved COL/Compensatory leave earn request for this date
    return myRequests.some(r => {
      const isColTemplate = r.template?.name && (r.template.name.toLowerCase().includes('compensatory') || r.template.name.toLowerCase().includes('col'));
      const isEarnAction = r.template?.leave_policy?.action === 'earn';
      return r.status === 'approved' && isColTemplate && isEarnAction && requestCoversDate(r, dateStr);
    });
  };

  const getAttendancePercentage = () => {
    if (!attendanceData || attendanceData.summary.total_records === 0) return 0;
    return Math.round((attendanceData.summary.present_count / attendanceData.summary.total_records) * 100);
  };

  const calendarDays = [];
  const firstDay = getFirstDayOfMonth();
  const daysInMonth = getDaysInMonth();

  // Add empty cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  // Pad to full weeks so mobile week-wise pagination always has 7 cells.
  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
  }

  const totalWeeks = Math.max(1, Math.ceil(calendarDays.length / 7));
  const mobileWeekStart = mobileWeekIndex * 7;
  const mobileWeekEnd = mobileWeekStart + 6;

  useEffect(() => {
    const now = new Date();
    if (selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1) {
      const weekOfToday = Math.floor((firstDay + now.getDate() - 1) / 7);
      setMobileWeekIndex(Math.min(Math.max(weekOfToday, 0), totalWeeks - 1));
    } else {
      setMobileWeekIndex(0);
    }
  }, [selectedYear, selectedMonth, firstDay, totalWeeks]);

  useEffect(() => {
    if (mobileWeekIndex > totalWeeks - 1) {
      setMobileWeekIndex(Math.max(0, totalWeeks - 1));
    }
  }, [mobileWeekIndex, totalWeeks]);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Calendar</h1>
          <p className="text-gray-600 mt-1">Attendance calendar and request submissions</p>
        </div>

        {/* Leave Balances */}
        <LeaveBalanceBadges />

        {/* Permission Count Split - moved under Leave Balances */}
        {Object.keys(permissionCountByDuration).length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <h4 className="font-semibold text-gray-900 mb-2 text-sm">Permission Count Split</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              {Object.entries(permissionCountByDuration)
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .map(([duration, count]) => {
                  const label = duration === '10' ? '10 mins'
                    : duration === '30' ? '30 mins'
                    : duration === '60' ? '1 hr'
                    : duration === '90' ? '1.5 hrs'
                    : duration === '120' ? '2 hrs'
                    : `${duration} mins`;

                  return (
                    <div key={duration} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      <span className="text-amber-900 font-medium">{label}</span>
                      <span className="text-amber-700 font-bold ml-1">{count}</span>
                    </div>
                  );
                })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Total late entry permissions: {Object.values(permissionCountByDuration).reduce((sum, count) => sum + count, 0)}
            </p>
          </div>
        )}

        {/* Info Box for Late Entry Feature */}
        {attendanceData && attendanceData.summary.absent_count > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 mb-1">Request Permission or Apply Leave</h3>
                <p className="text-sm text-yellow-800">
                  You have absent sessions (FN or AN). 
                  Click the yellow "Apply" button on dates with absent FN/AN to request Late Entry Permission, apply Leave, or On Duty. 
                  You can specify whether you're applying for Forenoon (FN) or Afternoon (AN) session.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Month Navigation & Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={goToPreviousMonth}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <h2 className="text-2xl font-bold text-gray-900">
              {months[selectedMonth - 1]} {selectedYear}
            </h2>

            <button
              onClick={goToNextMonth}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Summary Stats */}
          {attendanceData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-blue-50 rounded p-3">
                <p className="text-xs text-blue-600 font-medium">Total Days</p>
                <p className="text-2xl font-bold text-blue-900">{attendanceData.summary.total_records}</p>
              </div>
              <div className="bg-green-50 rounded p-3">
                <p className="text-xs text-green-600 font-medium">Present</p>
                <p className="text-2xl font-bold text-green-900">{attendanceData.summary.present_count}</p>
              </div>
              <div className="bg-yellow-50 rounded p-3">
                <p className="text-xs text-yellow-600 font-medium">Partial</p>
                <p className="text-2xl font-bold text-yellow-900">{attendanceData.summary.partial_count}</p>
              </div>
              <div className="bg-red-50 rounded p-3">
                <p className="text-xs text-red-600 font-medium">Absent</p>
                <p className="text-2xl font-bold text-red-900">{attendanceData.summary.absent_count}</p>
              </div>
            </div>
          )}

          {attendanceData && (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Attendance Rate</span>
                <span className="font-semibold text-gray-900">{getAttendancePercentage()}%</span>
              </div>
              <div className="bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${getAttendancePercentage()}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Clock className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading calendar...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <XCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
            <p className="text-red-800 font-medium">{error}</p>
            <button
              onClick={fetchMonthlyAttendance}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Legend */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Calendar Legend</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 border-2 border-green-300 rounded"></div>
                  <span className="text-gray-700">Present</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-100 border-2 border-red-300 rounded"></div>
                  <span className="text-gray-700">Absent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-100 border-2 border-yellow-300 rounded"></div>
                  <span className="text-gray-700">Partial/Half Day</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-purple-100 border-2 border-purple-300 rounded"></div>
                  <span className="text-gray-700">Leave/OD/COL</span>
                </div>
              </div>
              {attendanceSettings && (
                <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
                  <span className="font-medium">Time Limits: </span>
                  In-time after {attendanceSettings.attendance_in_time_limit} or 
                  Out-time before {attendanceSettings.attendance_out_time_limit} highlighted in <span className="text-red-600 font-semibold">red</span>
                </div>
              )}
              
            </div>

            <div className="bg-white rounded-lg shadow-md p-3 sm:p-6 mb-6">
            {/* Day headers - hidden on mobile, shown on desktop */}
            <div className="hidden sm:grid grid-cols-7 gap-1 sm:gap-2 mb-3 sm:mb-4">
              {daysOfWeek.map(day => (
                <div key={day} className="text-center font-semibold text-gray-600 text-xs sm:text-sm py-1.5 sm:py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="sm:hidden flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setMobileWeekIndex(prev => Math.max(0, prev - 1))}
                disabled={mobileWeekIndex === 0}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev Week
              </button>
              <span className="text-xs font-semibold text-gray-600">
                Week {mobileWeekIndex + 1} / {totalWeeks}
              </span>
              <button
                type="button"
                onClick={() => setMobileWeekIndex(prev => Math.min(totalWeeks - 1, prev + 1))}
                disabled={mobileWeekIndex >= totalWeeks - 1}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next Week
              </button>
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-1 sm:gap-2">
              {calendarDays.map((day, index) => {
                const hideOnMobile = index < mobileWeekStart || index > mobileWeekEnd;
                if (day === null) {
                  return <div key={`empty-${index}`} className={`${hideOnMobile ? 'hidden sm:block ' : ''}min-h-[92px] sm:aspect-square`} />;
                }

                const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const holidayInfo = isHoliday(dateStr);
                const attendance = getAttendanceForDate(day);
                const hasAttendance = !!attendance;
                const lateIn = attendance && isTimeInLate(attendance.morning_in);
                const earlyOut = attendance && isTimeOutEarly(attendance.evening_out);
                const highlightClass = lateIn || earlyOut ? 'ring-2 ring-yellow-300' : '';
                const leaveStatusFromRequest = getLeaveStatusForDate(day);
                
                // Determine which status to display:
                // Priority: holiday > attendance record with FN/AN > request status (only if no attendance) > no data
                // If attendance record exists, ALWAYS show FN/AN breakdown, never just the leave badge
                const displayLeaveStatus = !hasAttendance ? leaveStatusFromRequest : null;
                
                // Check if this is a half-day leave (one session has leave status, other is present/absent)
                const isHalfDayLeave = attendance && attendance.status === 'half_day' && (
                  !['present', 'absent', 'partial', 'half_day'].includes(attendance.fn_status.toLowerCase()) ||
                  !['present', 'absent', 'partial', 'half_day'].includes(attendance.an_status.toLowerCase())
                );

                return (
                  <div
                    key={day}
                    onClick={() => handleDateClick(day)}
                    className={`${hideOnMobile ? 'hidden sm:block ' : ''}min-h-[92px] sm:aspect-square border-2 rounded-lg p-1.5 sm:p-2 cursor-pointer transition-all hover:shadow-md overflow-hidden ${
                      holidayInfo
                        ? holidayInfo.is_sunday 
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-orange-50 border-orange-300'
                        : displayLeaveStatus
                        ? 'bg-purple-50 border-purple-300'
                        : hasAttendance
                        ? `${getStatusBgColor(attendance.status)} ${highlightClass}`
                        : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="h-full flex flex-col justify-between">
                      {/* Day number */}
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900 text-xl sm:text-2xl">{day}</span>
                        {holidayInfo ? (
                          <span 
                            className={`text-[10px] sm:text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded uppercase ${
                              holidayInfo.is_sunday 
                                ? 'text-blue-700 bg-blue-200' 
                                : 'text-orange-700 bg-orange-200'
                            }`}
                            title={holidayInfo.notes || holidayInfo.name}
                          >
                            HOL
                          </span>
                        ) : displayLeaveStatus ? (
                          <span className="text-[10px] sm:text-xs font-bold text-purple-700 bg-purple-200 px-1 sm:px-1.5 py-0.5 rounded uppercase">
                            {displayLeaveStatus}
                          </span>
                        ) : (
                          hasAttendance && getStatusIcon(attendance.status)
                        )}
                      </div>

                      {/* Compact mobile content */}
                      <div className="sm:hidden text-[10px] leading-tight space-y-0">
                        {holidayInfo ? (
                          <>
                            <div className="font-semibold text-gray-700 truncate">{holidayInfo.name}</div>
                            {hasAttendance && (
                              <div className="text-gray-700">
                                {attendance.fn_status?.toUpperCase() === 'PRESENT' ? 'P' : attendance.fn_status?.slice(0, 2)} /
                                {attendance.an_status?.toUpperCase() === 'PRESENT' ? 'P' : attendance.an_status?.slice(0, 2)}
                              </div>
                            )}
                          </>
                        ) : displayLeaveStatus ? (
                          <div className="font-semibold text-purple-700 truncate">{displayLeaveStatus}</div>
                        ) : hasAttendance ? (
                          <>
                            {attendance.morning_in && <div className={`${lateIn ? 'text-red-700 font-semibold' : 'text-gray-700'} truncate`}>In {attendance.morning_in}</div>}
                            {attendance.evening_out && <div className={`${earlyOut ? 'text-red-700 font-semibold' : 'text-gray-700'} truncate`}>Out {attendance.evening_out}</div>}
                            <div className="font-medium text-gray-700 truncate">FN {attendance.fn_status} / AN {attendance.an_status}</div>
                          </>
                        ) : isEarnedCol(dateStr) ? (
                          <div className="font-semibold text-blue-700">Worked</div>
                        ) : (
                          <div className="text-gray-500 text-[10px] flex items-center gap-1"><Plus className="w-3 h-3" />Add</div>
                        )}
                      </div>

                      {/* Leave, Holiday, or Attendance info */}
                      <div className="hidden sm:block">
                      {holidayInfo ? (
                        <div className="text-center mt-1">
                          <div className={`text-xs font-semibold capitalize ${
                            holidayInfo.is_sunday ? 'text-blue-900' : 'text-orange-900'
                          }`}>
                            {holidayInfo.name}
                          </div>
                          {hasAttendance && (
                            <div className="text-sm text-gray-700 space-y-0.5 mt-1">
                              {/* Show IN/OUT times on holidays */}
                              {attendance.morning_in && (
                                <div title={attendance.morning_in} className={`${lateIn ? 'text-red-700 font-semibold' : ''}`}>
                                  In: {attendance.morning_in}
                                </div>
                              )}
                              {attendance.evening_out && (
                                <div title={attendance.evening_out} className={`${earlyOut ? 'text-red-700 font-semibold' : ''}`}>
                                  Out: {attendance.evening_out}
                                </div>
                              )}
                              {/* Show FN/AN status on holidays */}
                              <div className="text-sm space-y-0.5 mt-1">
                                {attendance.fn_status && (
                                  <div className={`font-medium ${
                                    attendance.fn_status === 'present' ? 'text-green-700' : 
                                    attendance.fn_status === 'absent' ? 'text-red-700' : 
                                    !['present', 'absent', 'partial', 'half_day'].includes(attendance.fn_status.toLowerCase()) ? 'text-purple-700' :
                                    'text-yellow-700'
                                  }`}>
                                    FN: {attendance.fn_status === 'CL' ? 'Cas.Leave' :
                                         attendance.fn_status === 'OD' ? 'On Duty' :
                                         attendance.fn_status === 'COL' ? 'Comp Off' :
                                         attendance.fn_status === 'ML' ? 'Med.Leave' :
                                         attendance.fn_status}
                                  </div>
                                )}
                                {attendance.an_status && (
                                  <div className={`font-medium ${
                                    attendance.an_status === 'present' ? 'text-green-700' : 
                                    attendance.an_status === 'absent' ? 'text-red-700' : 
                                    !['present', 'absent', 'partial', 'half_day'].includes(attendance.an_status.toLowerCase()) ? 'text-purple-700' :
                                    'text-yellow-700'
                                  }`}>
                                    AN: {attendance.an_status === 'CL' ? 'Cas.Leave' :
                                         attendance.an_status === 'OD' ? 'On Duty' :
                                         attendance.an_status === 'COL' ? 'Comp Off' :
                                         attendance.an_status === 'ML' ? 'Med.Leave' :
                                         attendance.an_status}
                                  </div>
                                )}
                              </div>
                              {attendance.has_approved_col_form && (
                                <div className="font-medium text-blue-700 mt-1">✓ Worked (COL)</div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : displayLeaveStatus ? (
                        <div className="text-center mt-1">
                          <div className="text-xs font-semibold text-purple-900 capitalize">
                            {displayLeaveStatus === 'CL' ? 'Casual Leave' :
                             displayLeaveStatus === 'OD' ? 'On Duty' :
                             displayLeaveStatus === 'COL' ? 'Compensatory' :
                             displayLeaveStatus === 'LOP' ? 'Loss of Pay' :
                             displayLeaveStatus === 'ML' ? 'Medical Leave' :
                             displayLeaveStatus === 'LEAVE' ? 'Leave' :
                             displayLeaveStatus}
                          </div>
                              {isPaidByCol(dateStr) && (
                                <div className="text-xs text-green-700 font-medium mt-1">Paid (COL)</div>
                              )}
                        </div>
                      ) : isEarnedCol(dateStr) ? (
                        <div className="text-center mt-1">
                          <div className="text-xs font-semibold text-blue-700">
                            Worked (COL)
                          </div>
                        </div>
                      ) : hasAttendance ? (
                          <div className="text-sm text-gray-700 space-y-0.5">
                          {(() => {
                            // Display times as-is from backend (no swapping)
                            // Backend stores: morning_in (entry time), evening_out (exit time)
                            const inTime = attendance.morning_in;
                            const outTime = attendance.evening_out;
                            
                            return (
                              <>
                                {inTime && (
                                  <div title={inTime} className={`${lateIn ? 'text-red-700 font-semibold' : ''}`}>
                                    In: {inTime}
                                  </div>
                                )}
                                {outTime && (
                                  <div title={outTime} className={`${earlyOut ? 'text-red-700 font-semibold' : ''}`}>
                                    Out: {outTime}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          <div className="text-sm space-y-0.5 mt-1">
                            {attendance.fn_status && (
                              <div className={`font-medium ${
                                attendance.fn_status === 'present' ? 'text-green-700' : 
                                attendance.fn_status === 'absent' ? 'text-red-700' : 
                                !['present', 'absent', 'partial', 'half_day'].includes(attendance.fn_status.toLowerCase()) ? 'text-purple-700' :
                                'text-yellow-700'
                              }`}>
                                FN: {attendance.fn_status === 'CL' ? 'Cas.Leave' :
                                     attendance.fn_status === 'OD' ? 'On Duty' :
                                     attendance.fn_status === 'COL' ? 'Comp Off' :
                                     attendance.fn_status === 'ML' ? 'Med.Leave' :
                                     attendance.fn_status}
                              </div>
                            )}
                            {attendance.an_status && (
                              <div className={`font-medium ${
                                attendance.an_status === 'present' ? 'text-green-700' : 
                                attendance.an_status === 'absent' ? 'text-red-700' : 
                                !['present', 'absent', 'partial', 'half_day'].includes(attendance.an_status.toLowerCase()) ? 'text-purple-700' :
                                'text-yellow-700'
                              }`}>
                                AN: {attendance.an_status === 'CL' ? 'Cas.Leave' :
                                     attendance.an_status === 'OD' ? 'On Duty' :
                                     attendance.an_status === 'COL' ? 'Comp Off' :
                                     attendance.an_status === 'ML' ? 'Med.Leave' :
                                     attendance.an_status}
                              </div>
                            )}
                            {isHalfDayLeave && (
                              <div className="text-sm text-purple-600 font-bold mt-0.5">
                                HALF DAY
                              </div>
                            )}
                          </div>
                          {isEarnedCol(dateStr) && (
                            <div className="text-xs text-blue-700 font-medium mt-1">Worked (COL)</div>
                          )}
                          {/* Add Late Entry/Request Button for Absent Days */}
                          {(attendance.fn_status === 'absent' || attendance.an_status === 'absent') && lateEntryTemplateId && (
                            <button
                              onClick={(e) => handleLateEntryClick(e, day)}
                              className="mt-2 w-full text-xs bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-1.5 px-2 rounded transition-colors flex items-center justify-center gap-1"
                              title="Request permission or apply leave"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Apply
                            </button>
                          )}
                        </div>
                      ) : isEarnedCol(dateStr) ? (
                        <div className="text-center mt-1">
                          <div className="text-xs font-semibold text-blue-700">
                            Worked (COL)
                          </div>
                        </div>
                      ) : null}
                      </div>

                      {/* Click to add request hint */}
                      {!holidayInfo && !displayLeaveStatus && !hasAttendance && (
                        <div className="hidden sm:flex text-xs text-gray-500 text-center items-center justify-center gap-1">
                          <Plus className="w-3 h-3" />
                          Add
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Click on any date to submit a new request
            </p>
            </div>
          </>
        )}

        {/* My Requests Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">My Requests</h2>

          {myRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>No requests submitted yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myRequests.map(request => (
                <div key={request.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{request.template.name}</h3>
                      <p className="text-sm text-gray-600">
                        Submitted: {new Date(request.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${
                        request.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : request.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600">Approval Progress</span>
                      <span className="text-gray-900 font-medium">
                        {request.completed_steps || 0}/{request.total_steps || 0}
                      </span>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${
                            request.total_steps
                              ? ((request.completed_steps || 0) / request.total_steps) * 100
                              : 0
                          }%`
                        }}
                      />
                    </div>
                  </div>

                  {/* Request data preview */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    {Object.entries(request.form_data).slice(0, 4).map(([key, value]) => (
                      <div key={key} className="bg-gray-50 p-2 rounded">
                        <span className="text-gray-600">{key}:</span>
                        <span className="font-medium ml-1">
                          {String(value).substring(0, 20)}
                          {String(value).length > 20 ? '...' : ''}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Approval logs */}
                  {request.approval_logs && request.approval_logs.length > 0 && (
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2">Approvals:</p>
                      <div className="space-y-1">
                        {request.approval_logs.map((log, idx) => (
                          <div key={idx} className="text-xs text-gray-600 flex items-center gap-2">
                            {log.action === 'approved' ? (
                              <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-600 flex-shrink-0" />
                            )}
                            <span>
                              {log.approver_role} - {log.action} {log.comments && `(${log.comments})`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Request Modal */}
        {showNewRequestModal && (
          <NewRequestModal
            preselectedDate={selectedDate}
            onClose={() => setShowNewRequestModal(false)}
            onSuccess={handleRequestCreated}
          />
        )}
      </div>
    </div>
  );
}
