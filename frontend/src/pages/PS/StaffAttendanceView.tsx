import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, AlertCircle, Clock, Filter, Download } from 'lucide-react';
import { getApiBase } from '../../services/apiBase';
import { apiClient } from '../../services/auth';

interface AttendanceRecord {
  id: number;
  user?: number;
  user_id?: number;
  user_name?: string;
  staff_id?: string;
  full_name: string;
  date: string;
  status: 'present' | 'absent' | 'partial' | 'half_day';
  fn_status: string;
  an_status: string;
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

interface FacultyDirectoryStaff {
  user_id: number | null;
  staff_id?: string | null;
  user?: {
    username?: string;
    first_name?: string;
    last_name?: string;
  } | null;
}

interface FacultyDirectoryDepartment {
  staffs?: FacultyDirectoryStaff[];
}

interface FacultyDirectoryResponse {
  results?: FacultyDirectoryDepartment[];
}

export default function PSStaffAttendanceViewPage() {
  const [attendanceData, setAttendanceData] = useState<AttendanceData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facultyNameByUserId, setFacultyNameByUserId] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<number[]>([]);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Initialize to today
  useEffect(() => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    setFromDate(dateStr);
    setToDate(dateStr);
  }, []);

  // Fetch available departments
  useEffect(() => {
    fetchDepartments();
    fetchFacultyDirectoryNames();
  }, []);

  // Fetch attendance when date/department changes
  useEffect(() => {
    if (fromDate && toDate) {
      fetchAllAttendance();
    }
  }, [fromDate, toDate, selectedDepartmentIds]);

  // Close department dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = () => setShowDeptDropdown(false);
    if (showDeptDropdown) {
      document.addEventListener('click', handleOutsideClick);
    }
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [showDeptDropdown]);

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

  const fetchFacultyDirectoryNames = async () => {
    try {
      const url = `${getApiBase()}/api/academics/staffs-page/`;
      const response = await apiClient.get(url);
      const data: FacultyDirectoryResponse = response.data || {};
      const map: Record<number, string> = {};

      (data.results || []).forEach((dept) => {
        (dept.staffs || []).forEach((staff) => {
          const userId = Number(staff.user_id || 0);
          if (!userId) return;

          const firstName = String(staff.user?.first_name || '').trim();
          const lastName = String(staff.user?.last_name || '').trim();
          const fullName = `${firstName} ${lastName}`.trim();
          const username = String(staff.user?.username || '').trim();
          const staffId = String(staff.staff_id || '').trim();

          const displayName = fullName || username || staffId;
          if (displayName) {
            map[userId] = displayName;
          }
        });
      });

      setFacultyNameByUserId(map);
    } catch (err) {
      console.error('Failed to fetch faculty directory names:', err);
    }
  };

  const fetchAllAttendance = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${getApiBase()}/api/staff-attendance/records/monthly_records/`;

      const normalizedFromDate = fromDate <= toDate ? fromDate : toDate;
      const normalizedToDate = fromDate <= toDate ? toDate : fromDate;

      const baseParams: any = {
        from_date: normalizedFromDate,
        to_date: normalizedToDate
      };

      if (selectedDepartmentIds.length === 0) {
        const response = await apiClient.get(url, { params: baseParams });
        setAttendanceData(response.data);
      } else {
        const responses = await Promise.all(
          selectedDepartmentIds.map((departmentId) =>
            apiClient.get(url, {
              params: {
                ...baseParams,
                department_id: departmentId
              }
            })
          )
        );

        const mergedById = new Map<number, AttendanceRecord>();
        responses.forEach((resp) => {
          const records: AttendanceRecord[] = resp?.data?.records || [];
          records.forEach((record) => mergedById.set(record.id, record));
        });

        const mergedRecords = Array.from(mergedById.values()).sort((a, b) => {
          const dateDiff = b.date.localeCompare(a.date);
          const aUserId = Number(a.user_id || a.user || 0);
          const bUserId = Number(b.user_id || b.user || 0);
          return dateDiff !== 0 ? dateDiff : aUserId - bUserId;
        });

        const mergedSummary: AttendanceSummary = {
          from_date: normalizedFromDate,
          to_date: normalizedToDate,
          total_records: mergedRecords.length,
          present_count: mergedRecords.filter((r) => r.status === 'present').length,
          absent_count: mergedRecords.filter((r) => r.status === 'absent').length,
          partial_count: mergedRecords.filter((r) => r.status === 'partial' || r.status === 'half_day').length,
        };

        setAttendanceData({
          records: mergedRecords,
          summary: mergedSummary,
        });
      }
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
      setError('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeShift = (direction: 'prev' | 'next') => {
    if (!fromDate || !toDate) return;

    const from = new Date(fromDate);
    const to = new Date(toDate);
    const step = direction === 'prev' ? -1 : 1;

    from.setDate(from.getDate() + step);
    to.setDate(to.getDate() + step);

    setFromDate(from.toISOString().split('T')[0]);
    setToDate(to.toISOString().split('T')[0]);
  };

  const toggleDepartment = (deptId: number) => {
    setSelectedDepartmentIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  };

  const clearDepartmentFilter = () => {
    setSelectedDepartmentIds([]);
  };

  const formatTimeForCsv = (timeValue: string | null) => timeValue || '-';

  const downloadCurrentView = () => {
    if (filteredRecords.length === 0) return;

    const selectedDeptLabel =
      selectedDepartmentIds.length === 0
        ? 'All Departments'
        : departments
            .filter((d) => selectedDepartmentIds.includes(d.id))
            .map((d) => d.short_name || d.code || d.name)
            .join(', ');

    const rows: string[][] = [
      ['From Date', fromDate],
      ['To Date', toDate],
      ['Departments', selectedDeptLabel],
      [],
      ['Staff ID', 'Staff Member', 'Date', 'Status', 'FN', 'AN', 'Time In', 'Time Out', 'Notes'],
      ...filteredRecords.map((record) => [
        record.staff_id || '-',
        record.full_name,
        record.date,
        record.status,
        record.fn_status,
        record.an_status,
        formatTimeForCsv(record.morning_in),
        formatTimeForCsv(record.evening_out),
        record.notes || '-',
      ]),
    ];

    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? '');
            return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `staff_attendance_${fromDate}_to_${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  const getDisplayName = (record: AttendanceRecord): string => {
    const recordUserId = Number(record.user_id || record.user || 0);
    if (recordUserId && facultyNameByUserId[recordUserId]) {
      return facultyNameByUserId[recordUserId];
    }

    const fullName = (record.full_name || '').trim();
    if (fullName) return fullName;

    const userName = (record.user_name || '').trim();
    if (userName) return userName;

    const staffId = (record.staff_id || '').trim();
    if (staffId) return staffId;
    return recordUserId ? `Staff ${recordUserId}` : 'Unknown Staff';
  };



  // Filter records by search term
  const filteredRecords = attendanceData?.records.filter(record => 
    getDisplayName(record).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.staff_id || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const selectedDepartments = departments.filter((d) => selectedDepartmentIds.includes(d.id));
  const selectedDeptLabel =
    selectedDepartments.length === 0
      ? 'All Departments'
      : selectedDepartments.map((d) => d.short_name || d.code || d.name).join(', ');

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
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setShowDeptDropdown((prev) => !prev)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {selectedDepartments.length === 0
                    ? 'All Departments'
                    : `${selectedDepartments.length} department${selectedDepartments.length > 1 ? 's' : ''} selected`}
                </button>

                {showDeptDropdown && (
                  <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                    <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDepartmentIds.length === 0}
                        onChange={clearDepartmentFilter}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-800">All Departments</span>
                    </label>
                    {departments.map((dept) => (
                      <label
                        key={dept.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDepartmentIds.includes(dept.id)}
                          onChange={() => toggleDepartment(dept.id)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-800">
                          {dept.name} {dept.code && `(${dept.code})`}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">Selected: {selectedDeptLabel}</p>
          </div>

          {/* Date Range and Navigation */}
          <div className="border-t pt-6">
            <div className="flex items-end gap-2 mb-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-900 mb-2">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-900 mb-2">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => handleDateRangeShift('prev')}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                ← Previous
              </button>
              <button
                onClick={() => handleDateRangeShift('next')}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Next →
              </button>
            </div>

            {fromDate && toDate && (
              <p className="text-sm text-gray-600 mb-4">
                Showing attendance from <strong>{formatDate(fromDate)}</strong> to <strong>{formatDate(toDate)}</strong> for <strong>{selectedDeptLabel}</strong>
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
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div className="flex-1">
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
                <button
                  type="button"
                  onClick={downloadCurrentView}
                  disabled={filteredRecords.length === 0}
                  className="inline-flex items-center px-4 py-2 border border-green-600 text-sm font-medium rounded-md text-green-700 bg-white hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Shown Data
                </button>
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
              onClick={() => fetchAllAttendance()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : attendanceData && attendanceData.records.length > 0 ? (
          <>
            {(() => {
              const displayedRecords = attendanceData.records.filter(record =>
                getDisplayName(record).toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                            FN
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            AN
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
                              {getDisplayName(record)}
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
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(record.fn_status)}`}>
                                {record.fn_status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(record.an_status)}`}>
                                {record.an_status}
                              </span>
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
              No attendance records found for the selected date range and department filter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
