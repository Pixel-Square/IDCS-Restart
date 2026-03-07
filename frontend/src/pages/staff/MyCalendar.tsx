import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Clock, Plus } from 'lucide-react';
import { apiClient } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';
import { getMyRequests } from '../../services/staffRequests';
import NewRequestModal from '../staff-requests/NewRequestModal';
import type { StaffRequest } from '../../types/staffRequests';

interface AttendanceRecord {
  id: number;
  date: string;
  status: 'present' | 'absent' | 'partial' | 'half_day';
  morning_in: string | null;
  evening_out: string | null;
}

interface AttendanceSummary {
  year: number;
  month: number;
  total_records: number;
  present_count: number;
  absent_count: number;
  partial_count: number;
}

export default function MyCalendarPage() {
  const [attendanceData, setAttendanceData] = useState<{ records: AttendanceRecord[]; summary: AttendanceSummary } | null>(null);
  const [myRequests, setMyRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    fetchMonthlyAttendance();
    fetchMyRequests();
  }, [selectedYear, selectedMonth]);

  const fetchMonthlyAttendance = async () => {
    try {
      setLoading(true);
      const url = `${getApiBase()}/api/staff-attendance/records/monthly_records/`;
      const response = await apiClient.get(url, {
        params: { year: selectedYear, month: selectedMonth }
      });
      setAttendanceData(response.data);
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
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
      console.error('Failed to fetch requests:', err);
    }
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
    switch (status) {
      case 'present':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'partial':
      case 'half_day':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default:
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-50 border-green-200';
      case 'partial':
      case 'half_day':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-red-50 border-red-200';
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
    if (!t) return false;
    const cutoff = new Date('2000-01-01 08:45 AM');
    return t > cutoff;
  };

  const isTimeOutEarly = (timeStr?: string | null) => {
    const t = parseTime(timeStr);
    if (!t) return false;
    const cutoff = new Date('2000-01-01 05:45 PM');
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

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Calendar</h1>
          <p className="text-gray-600 mt-1">Attendance calendar and request submissions</p>
        </div>

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
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {daysOfWeek.map(day => (
                <div key={day} className="text-center font-semibold text-gray-600 text-sm py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const attendance = getAttendanceForDate(day);
                const hasAttendance = !!attendance;
                const lateIn = attendance && isTimeInLate(attendance.morning_in);
                const earlyOut = attendance && isTimeOutEarly(attendance.evening_out);
                const highlightClass = lateIn || earlyOut ? 'ring-2 ring-yellow-300' : '';

                return (
                  <div
                    key={day}
                    onClick={() => handleDateClick(day)}
                    className={`aspect-square border-2 rounded-lg p-2 cursor-pointer transition-all hover:shadow-md ${
                      hasAttendance
                        ? `${getStatusBgColor(attendance.status)} ${highlightClass}`
                        : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="h-full flex flex-col justify-between">
                      {/* Day number */}
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">{day}</span>
                        {hasAttendance && getStatusIcon(attendance.status)}
                      </div>

                      {/* Time info */}
                      {hasAttendance && (
                        <div className="text-xs text-gray-700 space-y-0.5">
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
                          <div className="capitalize font-medium text-gray-900">
                            {attendance.status}
                          </div>
                        </div>
                      )}

                      {/* Click to add request hint */}
                      {!hasAttendance && (
                        <div className="text-xs text-gray-500 text-center flex items-center justify-center gap-1">
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
