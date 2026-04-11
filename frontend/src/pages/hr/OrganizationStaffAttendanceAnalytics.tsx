import React, { useState, useMemo } from 'react';
import { Download, Calendar, BarChart3, Loader, Search, Plus, Trash2 } from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';

interface AnalyticsData {
  date_range: {
    from_date: string;
    to_date: string;
    working_days: number;
  };
  summary: {
    total_staff: number;
    total_records: number;
    total_present: number;
    total_absent: number;
    staff_present_count: number;
    staff_absent_count: number;
    staff_cl_count: number;
    staff_od_count: number;
    staff_late_entry_count: number;
    staff_col_count: number;
    staff_others_count: number;
  };
  staff_analytics: Array<{
    staff_id: number;
    name: string;
    email: string;
    department: string;
    present: number;
    absent: number;
    no_record: number;
    cl_count: number;
    od_count: number;
    late_entry_count: number;
    col_count: number;
    others_count: number;
  }>;
}

interface MonthlyMatrixData {
  report_type: string;
  month: string;
  date_range: {
    from_date: string;
    to_date: string;
    working_days: number;
  };
  columns: string[];
  day_columns: string[];
  total_staff: number;
  staff_rows: Array<{
    staff_user_id: number;
    staff_id: string;
    staff_name: string;
    department: string;
    days?: number;
    values: Record<string, { value: string; is_holiday: boolean }>;
  }>;
}

interface SpecialLimitItem {
  id: number;
  name: string;
  description?: string;
  from_date: string;
  to_date: string | null;
  attendance_in_time_limit: string;
  attendance_out_time_limit: string;
  mid_time_split: string;
  lunch_from: string | null;
  lunch_to: string | null;
  apply_time_based_absence: boolean;
  enabled: boolean;
  departments: number[];
  departments_info: Array<{ id: number; name: string; code?: string }>;
}

export default function OrganizationStaffAttendanceAnalytics() {
  const analyticsEndpoint = '/api/staff-attendance/records/organization-analytics/';
  const legacyAnalyticsEndpoint = '/api/staff-attendance/records/organization_analytics/';

  const fetchAnalyticsWithFallback = async (query: string) => {
    const primary = await fetchWithAuth(`${analyticsEndpoint}?${query}`);
    if (primary.status !== 404) return primary;
    return fetchWithAuth(`${legacyAnalyticsEndpoint}?${query}`);
  };

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportType, setReportType] = useState('1');
  const [departmentId, setDepartmentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | MonthlyMatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [specialLimits, setSpecialLimits] = useState<SpecialLimitItem[]>([]);
  const [loadingSpecialLimits, setLoadingSpecialLimits] = useState(false);
  const [savingSpecialLimit, setSavingSpecialLimit] = useState(false);
  const [showSpecialForm, setShowSpecialForm] = useState(false);
  const [specialName, setSpecialName] = useState('');
  const [specialDescription, setSpecialDescription] = useState('');
  const [specialFromDate, setSpecialFromDate] = useState('');
  const [specialToDate, setSpecialToDate] = useState('');
  const [specialInTime, setSpecialInTime] = useState('08:45');
  const [specialOutTime, setSpecialOutTime] = useState('17:00');
  const [specialNoonTime, setSpecialNoonTime] = useState('13:00');
  const [specialLunchFrom, setSpecialLunchFrom] = useState('');
  const [specialLunchTo, setSpecialLunchTo] = useState('');
  const [specialDeptIds, setSpecialDeptIds] = useState<number[]>([]);

  // Load departments on mount
  React.useEffect(() => {
    loadDepartments();
    loadSpecialLimits();
  }, []);

  const loadDepartments = async () => {
    try {
      const response = await fetchWithAuth(
        '/api/staff-attendance/records/available_departments/'
      );
      const data = await response.json();
      if (data.departments) {
        setDepartments(data.departments);
      }
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
  };

  const loadSpecialLimits = async () => {
    try {
      setLoadingSpecialLimits(true);
      const response = await fetchWithAuth(
        '/api/staff-attendance/special-department-date-limits/'
      );
      if (!response.ok) {
        throw new Error('Failed to load special attendance limits');
      }
      const data = await response.json();
      setSpecialLimits(Array.isArray(data) ? data : (data?.results || []));
    } catch (err: any) {
      setError(err.message || 'Failed to load special attendance limits');
    } finally {
      setLoadingSpecialLimits(false);
    }
  };

  const resetSpecialForm = () => {
    setSpecialName('');
    setSpecialDescription('');
    setSpecialFromDate('');
    setSpecialToDate('');
    setSpecialInTime('08:45');
    setSpecialOutTime('17:00');
    setSpecialNoonTime('13:00');
    setSpecialLunchFrom('');
    setSpecialLunchTo('');
    setSpecialDeptIds([]);
  };

  const handleToggleSpecialDept = (deptId: number) => {
    setSpecialDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  };

  const handleCreateSpecialLimit = async () => {
    if (!specialName.trim()) {
      setError('Special limit name is required');
      return;
    }
    if (!specialFromDate) {
      setError('From date is required');
      return;
    }
    if (specialToDate && new Date(specialToDate) < new Date(specialFromDate)) {
      setError('To date must be on or after From date');
      return;
    }
    if (specialDeptIds.length === 0) {
      setError('Select at least one department');
      return;
    }

    try {
      setSavingSpecialLimit(true);
      setError(null);
      const response = await fetchWithAuth(
        '/api/staff-attendance/special-department-date-limits/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: specialName.trim(),
            description: specialDescription,
            from_date: specialFromDate,
            to_date: specialToDate || null,
            attendance_in_time_limit: `${specialInTime}:00`,
            attendance_out_time_limit: `${specialOutTime}:00`,
            mid_time_split: `${specialNoonTime}:00`,
            lunch_from: specialLunchFrom ? `${specialLunchFrom}:00` : null,
            lunch_to: specialLunchTo ? `${specialLunchTo}:00` : null,
            apply_time_based_absence: true,
            enabled: true,
            departments: specialDeptIds,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData?.error || errData?.detail || 'Failed to save special attendance limit');
      }

      resetSpecialForm();
      setShowSpecialForm(false);
      await loadSpecialLimits();
    } catch (err: any) {
      setError(err.message || 'Failed to save special attendance limit');
    } finally {
      setSavingSpecialLimit(false);
    }
  };

  const handleDeleteSpecialLimit = async (id: number) => {
    if (!window.confirm('Delete this special attendance time limit?')) return;
    try {
      const response = await fetchWithAuth(
        `/api/staff-attendance/special-department-date-limits/${id}/`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error('Failed to delete special attendance limit');
      }
      await loadSpecialLimits();
    } catch (err: any) {
      setError(err.message || 'Failed to delete special attendance limit');
    }
  };

  const handleReapplySpecialLimit = async (id: number) => {
    try {
      setError(null);
      const response = await fetchWithAuth(
        `/api/staff-attendance/special-department-date-limits/${id}/reapply/`,
        { method: 'POST' }
      );
      if (!response.ok) {
        throw new Error('Failed to reapply special attendance limit');
      }
      await loadSpecialLimits();
    } catch (err: any) {
      setError(err.message || 'Failed to reapply special attendance limit');
    }
  };

  const loadAnalytics = async () => {
    if (reportType === '1') {
      if (!fromDate) {
        setError('Please select From date');
        return;
      }

      if (toDate && new Date(fromDate) > new Date(toDate)) {
        setError('From date must be before To date');
        return;
      }
    } else if (!month) {
      setError('Please select Month');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ export: 'json', report_type: reportType });

      if (reportType === '1') {
        params.append('from_date', fromDate);
        if (toDate) params.append('to_date', toDate);
      } else {
        params.append('month', month);
      }

      if (departmentId) {
        params.append('department_id', departmentId);
      }

      const response = await fetchAnalyticsWithFallback(params.toString());

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load analytics');
      }

      const data = await response.json();
      setAnalyticsData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = async () => {
    if (reportType === '1') {
      if (!fromDate) {
        setError('Please select From date');
        return;
      }
    } else if (!month) {
      setError('Please select Month');
      return;
    }

    try {
      const params = new URLSearchParams({ export: 'excel', report_type: reportType });

      if (reportType === '1') {
        params.append('from_date', fromDate);
        if (toDate) params.append('to_date', toDate);
      } else {
        params.append('month', month);
      }

      if (departmentId) {
        params.append('department_id', departmentId);
      }

      const response = await fetchAnalyticsWithFallback(params.toString());

      if (!response.ok) {
        throw new Error('Failed to download analytics');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = reportType === '1'
        ? (toDate ? `organization_attendance_${fromDate}_to_${toDate}.xlsx` : `organization_attendance_${fromDate}.xlsx`)
        : `organization_attendance_type_${reportType}_${month}.xlsx`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download analytics');
    }
  };

  const calculateAttendancePercentage = (staff: AnalyticsData['staff_analytics'][0]) => {
    const workingDays = analyticsData?.date_range?.working_days || 0;
    if (workingDays === 0) return '0.00';
    return ((staff.present / workingDays) * 100).toFixed(2);
  };

  // Filter data based on search query
  const filteredAnalyticsData = useMemo(() => {
    if (!analyticsData) return null;
    
    const query = searchQuery.toLowerCase();
    
    if (reportType === '1' && 'staff_analytics' in analyticsData) {
      const data = analyticsData as AnalyticsData;
      return {
        ...data,
        staff_analytics: data.staff_analytics.filter(staff =>
          staff.name.toLowerCase().includes(query) ||
          String(staff.staff_id).includes(query)
        )
      } as AnalyticsData;
    }
    
    if (reportType !== '1' && 'staff_rows' in analyticsData) {
      const data = analyticsData as MonthlyMatrixData;
      return {
        ...data,
        staff_rows: data.staff_rows.filter(row =>
          row.staff_name.toLowerCase().includes(query) ||
          String(row.staff_id).includes(query)
        )
      } as MonthlyMatrixData;
    }
    
    return analyticsData;
  }, [analyticsData, searchQuery, reportType]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-slate-900">
              Organization Staff Attendance Analytics
            </h1>
          </div>
          <p className="text-slate-600">
            View and analyze attendance data across your organization
          </p>
        </div>

        {/* Filter Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Report Type
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1">Type 1 - Summary</option>
                <option value="2">Type 2 - Effective Hours by Day</option>
                <option value="3">Type 3 - In/Out Time by Day</option>
                <option value="4">Type 4 - Combined View</option>
                <option value="5">Type 5 - Weighted Attendance (0-1 Scale)</option>
              </select>
            </div>

            {reportType === '1' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    From Date
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    To Date
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Month
                </label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Department Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Department (Optional)
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Load Button */}
            <div className="flex items-end">
              <button
                onClick={loadAnalytics}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load Analytics'
                )}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {analyticsData && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Search className="w-4 h-4 inline mr-1" />
                Search Staff
              </label>
              <input
                type="text"
                placeholder="Search by staff name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* HR Special Department-Specific Time Limits */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Special Department-Specific Time Limits</h2>
              <p className="text-sm text-slate-600">
                HR can define date-wise override time limits per department. Existing saved attendance in that date range is reprocessed automatically.
              </p>
            </div>
            <button
              onClick={() => {
                setShowSpecialForm((p) => !p);
                if (showSpecialForm) resetSpecialForm();
              }}
              className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {showSpecialForm ? 'Close' : 'Add Special Limit'}
            </button>
          </div>

          {showSpecialForm && (
            <div className="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={specialName}
                    onChange={(e) => setSpecialName(e.target.value)}
                    placeholder="e.g. CSE Special Shift"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">From Date</label>
                  <input
                    type="date"
                    value={specialFromDate}
                    onChange={(e) => setSpecialFromDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">To Date (Optional)</label>
                  <input
                    type="date"
                    value={specialToDate}
                    onChange={(e) => setSpecialToDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={specialDescription}
                    onChange={(e) => setSpecialDescription(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">In Time</label>
                  <input
                    type="time"
                    value={specialInTime}
                    onChange={(e) => setSpecialInTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Out Time</label>
                  <input
                    type="time"
                    value={specialOutTime}
                    onChange={(e) => setSpecialOutTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Noon Split</label>
                  <input
                    type="time"
                    value={specialNoonTime}
                    onChange={(e) => setSpecialNoonTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lunch From</label>
                  <input
                    type="time"
                    value={specialLunchFrom}
                    onChange={(e) => setSpecialLunchFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lunch To</label>
                  <input
                    type="time"
                    value={specialLunchTo}
                    onChange={(e) => setSpecialLunchTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700 mb-2">Departments</label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-auto p-2 border border-slate-200 rounded bg-white">
                  {departments.map((dept) => (
                    <label key={`special-${dept.id}`} className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={specialDeptIds.includes(dept.id)}
                        onChange={() => handleToggleSpecialDept(dept.id)}
                      />
                      {dept.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleCreateSpecialLimit}
                  disabled={savingSpecialLimit}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-400"
                >
                  {savingSpecialLimit ? 'Saving...' : 'Save Special Limit'}
                </button>
                <button
                  onClick={() => {
                    resetSpecialForm();
                    setShowSpecialForm(false);
                  }}
                  className="px-4 py-2 rounded border border-slate-300 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Date Range</th>
                  <th className="px-3 py-2 text-left">Departments</th>
                  <th className="px-3 py-2 text-left">In</th>
                  <th className="px-3 py-2 text-left">Out</th>
                  <th className="px-3 py-2 text-left">Noon</th>
                  <th className="px-3 py-2 text-left">Lunch From</th>
                  <th className="px-3 py-2 text-left">Lunch To</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingSpecialLimits ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-slate-500">Loading special limits...</td>
                  </tr>
                ) : specialLimits.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-slate-500">No special limits configured</td>
                  </tr>
                ) : (
                  specialLimits.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{item.name}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {item.from_date}
                        {item.to_date ? ` to ${item.to_date}` : ''}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {(item.departments_info || []).map((d) => d.name).join(', ')}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{item.attendance_in_time_limit?.substring(0, 5)}</td>
                      <td className="px-3 py-2 text-slate-700">{item.attendance_out_time_limit?.substring(0, 5)}</td>
                      <td className="px-3 py-2 text-slate-700">{item.mid_time_split?.substring(0, 5)}</td>
                      <td className="px-3 py-2 text-slate-700">{item.lunch_from ? item.lunch_from.substring(0, 5) : '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{item.lunch_to ? item.lunch_to.substring(0, 5) : '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleReapplySpecialLimit(item.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 mr-2"
                        >
                          Reapply
                        </button>
                        <button
                          onClick={() => handleDeleteSpecialLimit(item.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Analytics Results */}
        {filteredAnalyticsData && reportType === '1' && 'summary' in filteredAnalyticsData && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {(() => {
                const a1 = analyticsData as AnalyticsData;
                const isSingleDay = a1.date_range.from_date === a1.date_range.to_date;
                return (
                  isSingleDay && (
                    <>
                      <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-600">
                        <p className="text-slate-600 text-sm font-medium">No. of Staff Present</p>
                        <p className="text-3xl font-bold text-green-600">{a1.summary.staff_present_count}</p>
                      </div>
                      <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-red-600">
                        <p className="text-slate-600 text-sm font-medium">No. of Staff Absent</p>
                        <p className="text-3xl font-bold text-red-600">{a1.summary.staff_absent_count}</p>
                      </div>
                    </>
                  )
                );
              })()}
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-600"><p className="text-slate-600 text-sm font-medium">Total Staff</p><p className="text-3xl font-bold text-slate-900">{(analyticsData as AnalyticsData).summary.total_staff}</p></div>
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-600"><p className="text-slate-600 text-sm font-medium">No. of Staff with CL</p><p className="text-3xl font-bold text-purple-600">{(analyticsData as AnalyticsData).summary.staff_cl_count}</p></div>
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-indigo-600"><p className="text-slate-600 text-sm font-medium">No. of Staff with OD</p><p className="text-3xl font-bold text-indigo-600">{(analyticsData as AnalyticsData).summary.staff_od_count}</p></div>
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-orange-600"><p className="text-slate-600 text-sm font-medium">No. of Staff with Late Entry</p><p className="text-3xl font-bold text-orange-600">{(analyticsData as AnalyticsData).summary.staff_late_entry_count}</p></div>
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-teal-600"><p className="text-slate-600 text-sm font-medium">No. of Staff with COL</p><p className="text-3xl font-bold text-teal-600">{(analyticsData as AnalyticsData).summary.staff_col_count}</p></div>
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-pink-600"><p className="text-slate-600 text-sm font-medium">No. of Staff with Others</p><p className="text-3xl font-bold text-pink-600">{(analyticsData as AnalyticsData).summary.staff_others_count}</p></div>
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-slate-600"><p className="text-slate-600 text-sm font-medium">Total Working Days (excluding holidays)</p><p className="text-3xl font-bold text-slate-900">{(analyticsData as AnalyticsData).date_range.working_days}</p></div>
            </div>

            <div className="mb-6 flex justify-end">
              <button onClick={downloadCSV} className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download as Excel
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 bg-slate-100 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Staff-wise Attendance Details</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Staff ID</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Staff Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Department</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-green-700">Present</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-red-700">Absent</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-purple-700">CL</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-indigo-700">OD</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-orange-700">Late Entry</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-teal-700">COL</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-pink-700">Others</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-blue-700">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filteredAnalyticsData as AnalyticsData).staff_analytics.length === 0 ? (
                      <tr><td colSpan={11} className="px-6 py-8 text-center text-slate-500">No staff data available for the selected period</td></tr>
                    ) : (
                      (filteredAnalyticsData as AnalyticsData).staff_analytics.map((staff, idx) => (
                        <tr key={`${staff.staff_id}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{staff.staff_id}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{staff.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{staff.department}</td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-green-600">{staff.present.toFixed(1)}</td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-red-600">{staff.absent.toFixed(1)}</td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-purple-600">{staff.cl_count}</td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-indigo-600">{staff.od_count}</td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-orange-600">{staff.late_entry_count}</td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-teal-600">{staff.col_count}</td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-pink-600">{staff.others_count}</td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-blue-600">{calculateAttendancePercentage(staff)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-sm text-slate-600">
                Total: {(filteredAnalyticsData as AnalyticsData).staff_analytics.length} staff members
              </div>
            </div>
          </>
        )}

        {filteredAnalyticsData && reportType !== '1' && 'columns' in filteredAnalyticsData && (
          <>
            <div className="mb-6 flex justify-between items-center">
              <div className="text-sm text-slate-600">
                Report Type {reportType} | Month {(filteredAnalyticsData as MonthlyMatrixData).month} | Total Staff {(filteredAnalyticsData as MonthlyMatrixData).staff_rows.length}
              </div>
              <button onClick={downloadCSV} className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download as Excel
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-slate-200">
              <div className="px-6 py-4 bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Staff Monthly Matrix</h2>
                {reportType === '5' ? (
                  <p className="text-xs text-slate-600 mt-1">Weighted attendance score: 0 = present, 0.5 = half-day absent, 1 = full-day absent. Holiday cells are highlighted.</p>
                ) : (
                  <p className="text-xs text-slate-600 mt-1">Holiday cells are highlighted. Type 2/4 include FN/AN status and effective time. Type 3/4 include FN/AN with IN/OUT where available.</p>
                )}
              </div>
              <div className="overflow-x-auto max-h-[72vh]">
                <table className="min-w-max w-full text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-0 z-30 bg-slate-100 border-r border-slate-200 min-w-[110px]">Staff ID</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-[110px] z-30 bg-slate-100 border-r border-slate-200 min-w-[180px]">Staff Name</th>
                      {(filteredAnalyticsData as MonthlyMatrixData).columns.includes('days') && (
                        <th className="px-3 py-2 text-center font-semibold text-slate-700 sticky left-[290px] z-30 bg-slate-100 border-r border-slate-200 min-w-[78px]">Days</th>
                      )}
                      {(filteredAnalyticsData as MonthlyMatrixData).day_columns?.map((d) => (
                        <th key={d} className="px-2 py-2 text-center font-semibold text-slate-700 min-w-[124px]">{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(filteredAnalyticsData as MonthlyMatrixData).staff_rows?.map((row, idx) => (
                      <tr key={row.staff_user_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                        <td className="px-3 py-2 font-semibold text-slate-900 sticky left-0 z-10 bg-inherit border-r border-slate-200">{row.staff_id}</td>
                        <td className="px-3 py-2 text-slate-900 sticky left-[110px] z-10 bg-inherit border-r border-slate-200">{row.staff_name}</td>
                        {(filteredAnalyticsData as MonthlyMatrixData).columns.includes('days') && (
                          <td className="px-3 py-2 text-center text-slate-700 font-semibold sticky left-[290px] z-10 bg-inherit border-r border-slate-200">{Number(row.days ?? 0).toFixed(1)}</td>
                        )}
                        {(filteredAnalyticsData as MonthlyMatrixData).day_columns?.map((d) => {
                          const cell = row.values[d] || { value: '-', is_holiday: false };
                          return (
                            <td
                              key={`${row.staff_user_id}-${d}`}
                              className={`px-2 py-2 text-center align-top ${cell.is_holiday ? 'bg-amber-100/70 text-amber-900 font-semibold' : 'text-slate-700'}`}
                              title={cell.is_holiday ? 'Holiday' : cell.value}
                            >
                              <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 leading-tight whitespace-pre-line ${cell.is_holiday ? 'bg-amber-200/70' : 'bg-slate-100'}`}>
                                {cell.value}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* No Data State */}
        {!analyticsData && !loading && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 text-lg">
              Select a date range and click "Load Analytics" to view staff attendance data
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
