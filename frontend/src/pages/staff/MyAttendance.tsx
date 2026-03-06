import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Clock, Filter } from 'lucide-react';
import { apiClient } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';

interface AttendanceRecord {
  id: number;
  user_id: number;
  username: string;
  full_name: string;
  date: string;
  status: 'present' | 'absent' | 'partial' | 'half_day';
  morning_in: string | null;
  evening_out: string | null;
  notes: string;
}

interface AttendanceSummary {
  year: number;
  month: number;
  total_records: number;
  present_count: number;
  absent_count: number;
  partial_count: number;
}

interface AttendanceData {
  records: AttendanceRecord[];
  summary: AttendanceSummary;
}

export default function MyAttendancePage() {
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getCurrentMonthName = () => months[selectedMonth - 1];

  useEffect(() => {
    fetchMonthlyAttendance();
  }, [selectedYear, selectedMonth]);

  const fetchMonthlyAttendance = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${getApiBase()}/api/staff-attendance/records/monthly_records/`;
      const response = await apiClient.get(url, {
        params: {
          year: selectedYear,
          month: selectedMonth
        }
      });
      setAttendanceData(response.data);
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
      setError('Failed to load attendance records');
    } finally {
      setLoading(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 text-green-800';
      case 'partial':
      case 'half_day':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-red-100 text-red-800';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      day: 'numeric',
      month: 'short'
    });
  };

  const getAttendancePercentage = () => {
    if (!attendanceData || attendanceData.summary.total_records === 0) return 0;
    return Math.round((attendanceData.summary.present_count / attendanceData.summary.total_records) * 100);
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
            <p className="text-gray-600 mt-1">View your monthly attendance records</p>
          </div>
          <div className="flex items-center gap-4">
            <Calendar className="w-5 h-5 text-gray-500" />
          </div>
        </div>

        {/* Month Navigation */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goToPreviousMonth}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900">
                {getCurrentMonthName()} {selectedYear}
              </h2>
            </div>
            
            <button
              onClick={goToNextMonth}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Summary Cards */}
          {attendanceData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Total Days</p>
                    <p className="text-2xl font-bold text-blue-900">{attendanceData.summary.total_records}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="text-sm text-green-600 font-medium">Present</p>
                    <p className="text-2xl font-bold text-green-900">{attendanceData.summary.present_count}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-8 h-8 text-yellow-600" />
                  <div>
                    <p className="text-sm text-yellow-600 font-medium">Partial</p>
                    <p className="text-2xl font-bold text-yellow-900">{attendanceData.summary.partial_count}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <XCircle className="w-8 h-8 text-red-600" />
                  <div>
                    <p className="text-sm text-red-600 font-medium">Absent</p>
                    <p className="text-2xl font-bold text-red-900">{attendanceData.summary.absent_count}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {attendanceData && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Attendance Percentage</span>
                <span className="font-semibold text-gray-900">{getAttendancePercentage()}%</span>
              </div>
              <div className="mt-2 bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${getAttendancePercentage()}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Clock className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading attendance records...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <XCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
            <p className="text-red-800 font-medium">{error}</p>
            <button 
              onClick={fetchMonthlyAttendance}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : attendanceData && attendanceData.records.length > 0 ? (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time In
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time Out
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {attendanceData.records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(record.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(record.status)}
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(record.status)}`}>
                            {record.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.morning_in || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.evening_out || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {record.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Records Found</h3>
            <p className="text-gray-600">
              No attendance records found for {getCurrentMonthName()} {selectedYear}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}