import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import { getApiBase } from '../../services/apiBase';
import { apiClient } from '../../services/auth';

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
  from_date?: string;
  to_date?: string;
  total_records: number;
  present_count: number;
  absent_count: number;
  partial_count: number;
}

interface AttendanceData {
  records: AttendanceRecord[];
  summary: AttendanceSummary;
}

export default function HODStaffAttendancePage() {
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    const today = new Date();
    setSelectedDate(today.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchAttendanceForDate();
    }
  }, [selectedDate]);

  const fetchAttendanceForDate = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${getApiBase()}/api/staff-attendance/records/monthly_records/`;
      const response = await apiClient.get(url, {
        params: {
          from_date: selectedDate,
          to_date: selectedDate
        }
      });
      setAttendanceData(response.data);
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
      setError('Failed to load attendance records for your department');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (direction: 'prev' | 'next') => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + (direction === 'prev' ? -1 : 1));
    setSelectedDate(current.toISOString().split('T')[0]);
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
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const todaysRecords = attendanceData?.records.filter(r => r.date === selectedDate) || [];

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Department Staff Attendance</h1>
            <p className="text-gray-600 mt-1">View staff attendance for your department</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-end gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900 mb-2">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => handleDateChange('prev')}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              ← Previous Day
            </button>
            <button
              onClick={() => handleDateChange('next')}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Next Day →
            </button>
          </div>

          {selectedDate && (
            <p className="text-sm text-gray-600">
              Showing attendance for <strong>{formatDate(selectedDate)}</strong>
            </p>
          )}
        </div>

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
              onClick={fetchAttendanceForDate}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : todaysRecords.length > 0 ? (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff Member</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time In</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Out</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {todaysRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.full_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(record.status)}
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(record.status)}`}>
                            {record.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.morning_in || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.evening_out || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 truncate">{record.notes || '—'}</td>
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
            <p className="text-gray-600">No attendance records for {selectedDate ? formatDate(selectedDate) : 'this date'}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
