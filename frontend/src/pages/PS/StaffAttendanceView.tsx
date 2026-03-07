import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, AlertCircle, Clock, Filter } from 'lucide-react';
import { getApiBase } from '../../services/apiBase';
import { apiClient } from '../../services/auth';

interface AttendanceRecord {
  id: number;
  user_id: number;
  staff_id?: string;
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
  year?: number;
  month?: number;
  total_records: number;
  present_count: number;
  absent_count: number;
  partial_count: number;
}

interface AttendanceData {
  records: AttendanceRecord[];
  summary: AttendanceSummary;
}

interface Department {
  id: number;
  name: string;
  code: string;
  short_name: string;
}

export default function PSStaffAttendanceViewPage() {
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Initialize to today
  useEffect(() => {
    const today = new Date();
    setSelectedDate(today.toISOString().split('T')[0]);
  }, []);

  // Fetch available departments
  useEffect(() => {
    fetchDepartments();
  }, []);

  // Fetch attendance when date/department changes
  useEffect(() => {
    if (selectedDate) {
      fetchAllAttendance();
    }
  }, [selectedDate, selectedDepartment]);

  const fetchDepartments = async () => {
    try {
      setLoadingDepts(true);
      const url = `${getApiBase()}/api/staff-attendance/records/available_departments/`;
      const response = await apiClient.get(url);
      setDepartments(response.data.departments);
    } catch (err) {
      console.error('Failed to fetch departments:', err);
    } finally {
      setLoadingDepts(false);
    }
  };

  const fetchAllAttendance = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${getApiBase()}/api/staff-attendance/records/monthly_records/`;
      const params: any = {
        from_date: selectedDate,
        to_date: selectedDate
      };
      
      // Only add department filter if selected
      if (selectedDepartment) {
        params.department_id = selectedDepartment;
      }
      
      const response = await apiClient.get(url, { params });
      setAttendanceData(response.data);
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
      setError('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (direction: 'prev' | 'next') => {
    const current = new Date(selectedDate);
    if (direction === 'prev') {
      current.setDate(current.getDate() - 1);
    } else {
      current.setDate(current.getDate() + 1);
    }
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

  // Helper to check if time in is late (> 8:45 AM)
  const isTimeInLate = (timeStr: string | null): boolean => {
    if (!timeStr || timeStr === '—') return false;
    try {
      const time = new Date(`2000-01-01 ${timeStr.replace(/\s+/g, ' ')}`);
      const cutoffTime = new Date('2000-01-01 08:45 AM');
      return time > cutoffTime;
    } catch {
      return false;
    }
  };

  // Helper to check if time out is early (< 5:45 PM)
  const isTimeOutEarly = (timeStr: string | null): boolean => {
    if (!timeStr || timeStr === '—') return false;
    try {
      const time = new Date(`2000-01-01 ${timeStr.replace(/\s+/g, ' ')}`);
      const cutoffTime = new Date('2000-01-01 05:45 PM');
      return time < cutoffTime;
    } catch {
      return false;
    }
  };



  // Filter records by search term
  const filteredRecords = attendanceData?.records.filter(record => 
    record.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.staff_id || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const selectedDeptName = selectedDepartment 
    ? departments.find(d => d.id === selectedDepartment)?.name || 'All Departments'
    : 'All Departments';

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organization Staff Attendance Analytics</h1>
            <p className="text-gray-600 mt-1">Comprehensive attendance view across all departments</p>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          {/* Department Filter */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filter by Department (Optional)
              </div>
            </label>
            {loadingDepts ? (
              <p className="text-gray-600">Loading departments...</p>
            ) : (
              <select
                value={selectedDepartment || ''}
                onChange={(e) => setSelectedDepartment(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} {dept.code && `(${dept.code})`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date Range and Navigation */}
          <div className="border-t pt-6">
            <div className="flex items-end gap-2 mb-4">
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
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                ← Previous
              </button>
              <button
                onClick={() => handleDateChange('next')}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Next →
              </button>
            </div>

            {selectedDate && (
              <p className="text-sm text-gray-600 mb-4">
                Showing attendance for <strong>{formatDate(selectedDate)}</strong> {selectedDepartment && `for <strong>${selectedDeptName}</strong>`}
              </p>
            )}

            {/* Summary Cards */}
            {attendanceData && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-8 h-8 text-blue-600" />
                      <div>
                        <p className="text-sm text-blue-600 font-medium">Total Records</p>
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

                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Overall Attendance Percentage</span>
                    <span className="font-semibold text-gray-900">{getAttendancePercentage()}%</span>
                  </div>
                  <div className="mt-2 bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${getAttendancePercentage()}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Search Filter */}
          {attendanceData && filteredRecords.length > 0 && (
            <div className="border-t pt-6 mt-6">
              <label className="block text-sm font-medium text-gray-900 mb-2">Search Staff Member</label>
              <input
                type="text"
                placeholder="Search by name or staff id..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {filteredRecords.length} of {attendanceData.records.length} records shown
              </p>
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
              onClick={() => fetchAllAttendance()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : attendanceData && attendanceData.records.length > 0 ? (
          <>
            {(() => {
              const todaysRecords = attendanceData.records.filter(r => r.date === selectedDate);
              const displayedRecords = todaysRecords.filter(record =>
                record.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (record.staff_id || '').toLowerCase().includes(searchTerm.toLowerCase())
              );
              return displayedRecords.length > 0 ? (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Staff ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Staff Member
                          </th>
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
                        {displayedRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {record.staff_id || '—'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {record.full_name}
                            </td>
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
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${isTimeInLate(record.morning_in) ? 'bg-red-100 text-red-900' : 'text-gray-900'}`}>
                              {record.morning_in || '—'}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${isTimeOutEarly(record.evening_out) ? 'bg-amber-100 text-amber-900' : 'text-gray-900'}`}>
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
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Matching Records</h3>
                  <p className="text-gray-600">
                    No attendance records match your search criteria.
                  </p>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="bg-gray-50 rounded-lg p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Records Found</h3>
            <p className="text-gray-600">
              No attendance records found for the selected date {selectedDepartment && 'and department'}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
