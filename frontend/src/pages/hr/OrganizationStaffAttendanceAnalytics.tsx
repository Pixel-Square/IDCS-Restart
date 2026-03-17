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
    if (!fromDate) {
      setError('Please select From date');
      return;
    }

    if (toDate && new Date(fromDate) > new Date(toDate)) {
      setError('From date must be before To date');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        from_date: fromDate,
        format: 'json',
      });

      if (toDate) params.append('to_date', toDate);

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
    if (!fromDate) {
      setError('Please select From date');
      return;
    }

    try {
      const params = new URLSearchParams({
        from_date: fromDate,
        format: 'csv',
      });

      if (toDate) params.append('to_date', toDate);

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
      const filename = toDate ? `organization_attendance_${fromDate}_to_${toDate}.csv` : `organization_attendance_${fromDate}.csv`;
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/** Determine if this is a single-day view */}
              {(() => {
                const isSingleDay = analyticsData.date_range.from_date === analyticsData.date_range.to_date;
                return (
                  isSingleDay && (
                    <>
                      <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-600">
                        <p className="text-slate-600 text-sm font-medium">No. of Staff Present</p>
                        <p className="text-3xl font-bold text-green-600">
                          {analyticsData.summary.staff_present_count}
                        </p>
                      </div>

                      <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-red-600">
                        <p className="text-slate-600 text-sm font-medium">No. of Staff Absent</p>
                        <p className="text-3xl font-bold text-red-600">
                          {analyticsData.summary.staff_absent_count}
                        </p>
                      </div>
                    </>
                  )
                );
              })()}
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-600">
                <p className="text-slate-600 text-sm font-medium">Total Staff</p>
                <p className="text-3xl font-bold text-slate-900">
                  {analyticsData.summary.total_staff}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-600">
                <p className="text-slate-600 text-sm font-medium">No. of Staff with CL</p>
                <p className="text-3xl font-bold text-purple-600">
                  {analyticsData.summary.staff_cl_count}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-indigo-600">
                <p className="text-slate-600 text-sm font-medium">No. of Staff with OD</p>
                <p className="text-3xl font-bold text-indigo-600">
                  {analyticsData.summary.staff_od_count}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-orange-600">
                <p className="text-slate-600 text-sm font-medium">No. of Staff with Late Entry</p>
                <p className="text-3xl font-bold text-orange-600">
                  {analyticsData.summary.staff_late_entry_count}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-teal-600">
                <p className="text-slate-600 text-sm font-medium">No. of Staff with COL</p>
                <p className="text-3xl font-bold text-teal-600">
                  {analyticsData.summary.staff_col_count}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-pink-600">
                <p className="text-slate-600 text-sm font-medium">No. of Staff with Others</p>
                <p className="text-3xl font-bold text-pink-600">
                  {analyticsData.summary.staff_others_count}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-slate-600">
                <p className="text-slate-600 text-sm font-medium">Total Working Days (excluding holidays)</p>
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
                            <th className="px-6 py-3 text-center text-sm font-semibold text-purple-700">
                              CL
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-indigo-700">
                              OD
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-orange-700">
                              Late Entry
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-teal-700">
                              COL
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-pink-700">
                              Others
                            </th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-blue-700">
                              Attendance %
                            </th>
                          </tr>
                        </thead>
                  <tbody>
                      {analyticsData.staff_analytics.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-6 py-8 text-center text-slate-500">
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
                            {staff.present.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-red-600">
                            {staff.absent.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-purple-600">
                            {staff.cl_count}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-indigo-600">
                            {staff.od_count}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-orange-600">
                            {staff.late_entry_count}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-teal-600">
                            {staff.col_count}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-pink-600">
                            {staff.others_count}
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
