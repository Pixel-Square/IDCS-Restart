import React, { useState } from 'react';
import { Download, Calendar, BarChart3, Loader } from 'lucide-react';
import { getApiBase } from '../../services/apiBase';
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
    total_partial: number;
  };
  staff_analytics: Array<{
    staff_id: number;
    name: string;
    email: string;
    department: string;
    present: number;
    absent: number;
    partial: number;
    no_record: number;
  }>;
}

export default function OrganizationStaffAttendanceAnalytics() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);

  // Load departments on mount
  React.useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const response = await fetchWithAuth(
        `${getApiBase()}/api/staff-attendance/records/available_departments/`
      );
      const data = await response.json();
      if (data.departments) {
        setDepartments(data.departments);
      }
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
  };

  const loadAnalytics = async () => {
    if (!fromDate || !toDate) {
      setError('Please select both From and To dates');
      return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
      setError('From date must be before To date');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        from_date: fromDate,
        to_date: toDate,
        format: 'json',
      });

      if (departmentId) {
        params.append('department_id', departmentId);
      }

      const response = await fetchWithAuth(
        `${getApiBase()}/api/staff-attendance/records/organization_analytics/?${params.toString()}`
      );

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
    if (!fromDate || !toDate) {
      setError('Please select both From and To dates');
      return;
    }

    try {
      const params = new URLSearchParams({
        from_date: fromDate,
        to_date: toDate,
        format: 'csv',
      });

      if (departmentId) {
        params.append('department_id', departmentId);
      }

      const response = await fetchWithAuth(
        `${getApiBase()}/api/staff-attendance/records/organization_analytics/?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to download analytics');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `organization_attendance_${fromDate}_to_${toDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download analytics');
    }
  };

  const calculateAttendancePercentage = (staff: AnalyticsData['staff_analytics'][0]) => {
    const totalDays = staff.present + staff.absent + staff.partial;
    if (totalDays === 0) return 0;
    return ((staff.present / totalDays) * 100).toFixed(2);
  };

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* From Date */}
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

            {/* To Date */}
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

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Analytics Results */}
        {analyticsData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-600">
                <p className="text-slate-600 text-sm font-medium">Total Staff</p>
                <p className="text-3xl font-bold text-slate-900">
                  {analyticsData.summary.total_staff}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-600">
                <p className="text-slate-600 text-sm font-medium">Total Present Days</p>
                <p className="text-3xl font-bold text-green-600">
                  {analyticsData.summary.total_present}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-red-600">
                <p className="text-slate-600 text-sm font-medium">Total Absent Days</p>
                <p className="text-3xl font-bold text-red-600">
                  {analyticsData.summary.total_absent}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-yellow-600">
                <p className="text-slate-600 text-sm font-medium">Total Partial Days</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {analyticsData.summary.total_partial}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-slate-600">
                <p className="text-slate-600 text-sm font-medium">Working Days</p>
                <p className="text-3xl font-bold text-slate-900">
                  {analyticsData.date_range.working_days}
                </p>
              </div>
            </div>

            {/* Download Button */}
            <div className="mb-6 flex justify-end">
              <button
                onClick={downloadCSV}
                className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download as CSV
              </button>
            </div>

            {/* Staff Table */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 bg-slate-100 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">
                  Staff-wise Attendance Details
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">
                              Staff ID
                            </th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">
                              Staff Name
                            </th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">
                              Department
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-green-700">
                              Present
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-red-700">
                              Absent
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-yellow-700">
                              Partial
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-blue-700">
                              Attendance %
                            </th>
                          </tr>
                        </thead>
                  <tbody>
                      {analyticsData.staff_analytics.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                          No staff data available for the selected period
                        </td>
                      </tr>
                    ) : (
                      analyticsData.staff_analytics.map((staff, idx) => (
                        <tr
                          key={`${staff.staff_id}-${idx}`}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                        >
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">
                            {staff.staff_id}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">
                            {staff.name}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {staff.department}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-green-600">
                            {staff.present}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-red-600">
                            {staff.absent}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-yellow-600">
                            {staff.partial}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-blue-600">
                            {calculateAttendancePercentage(staff)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-sm text-slate-600">
                Total: {analyticsData.staff_analytics.length} staff members
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
