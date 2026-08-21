import React, { useState, useMemo } from 'react';
import { Download, Calendar, BarChart3, Loader, Search, Plus, Trash2, TrendingDown, Users, Building2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

interface LOPEmployeeDetail {
  staff_user_id: number;
  staff_id: string;
  name: string;
  email: string;
  department: string;
  department_code: string;
  lop_days: number;
}

interface LOPDeptSummary {
  department: string;
  department_code: string;
  total_lop_days: number;
  total_staff: number;
  staff_with_lop: number;
}

interface LOPDashboardData {
  month: string;
  date_range: { from_date: string; to_date: string };
  summary: {
    total_lop_days: number;
    total_staff: number;
    staff_with_lop: number;
  };
  department_summary: LOPDeptSummary[];
  employee_details: LOPEmployeeDetail[];
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

  // LOP Dashboard state
  const [lopMonth, setLopMonth] = useState(new Date().toISOString().slice(0, 7));
  const [lopDeptIds, setLopDeptIds] = useState<string[]>([]);
  const [lopPage, setLopPage] = useState(1);
  const [lopData, setLopData] = useState<LOPDashboardData | null>(null);
  const [lopLoading, setLopLoading] = useState(false);
  const [lopError, setLopError] = useState<string | null>(null);
  const [lopSearch, setLopSearch] = useState('');
  const [lopExpandedDepts, setLopExpandedDepts] = useState<Set<string>>(new Set());
  const [lopShowOnlyWithLOP, setLopShowOnlyWithLOP] = useState(false);
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

  const loadLopDashboard = async () => {
    if (!lopMonth) {
      setLopError('Please select a month');
      return;
    }
    setLopLoading(true);
    setLopError(null);
    try {
      const params = new URLSearchParams({ month: lopMonth });
      if (lopDeptIds.length > 0) params.append('department_id', lopDeptIds.join(','));
      const response = await fetchWithAuth(
        `/api/staff-attendance/records/monthly-lop-dashboard/?${params.toString()}`
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to load LOP dashboard');
      }
      const data = await response.json();
      setLopData(data);
      setLopExpandedDepts(new Set());
    } catch (err: any) {
      setLopError(err.message || 'Failed to load LOP dashboard');
    } finally {
      setLopLoading(false);
    }
  };

  const downloadLopExcel = async () => {
    if (!lopMonth) return;
    try {
      const params = new URLSearchParams({ month: lopMonth, export: 'excel' });
      if (lopDeptIds.length > 0) params.append('department_id', lopDeptIds.join(','));
      const response = await fetchWithAuth(
        `/api/staff-attendance/records/monthly-lop-dashboard/?${params.toString()}`
      );
      if (!response.ok) throw new Error('Failed to download LOP report');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `monthly_lop_${lopMonth}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setLopError(err.message || 'Failed to download LOP report');
    }
  };

  const downloadLopPDF = () => {
    if (!lopData) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    // Title
    doc.setFontSize(16);
    doc.setTextColor(31, 41, 55);
    doc.text(`Monthly LOP Report - ${lopMonth}`, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Date Range: ${lopData.date_range.from_date} to ${lopData.date_range.to_date}`, 14, 21);

    // Summary stats
    doc.setFontSize(11);
    doc.setTextColor(55, 65, 81);
    doc.text(`Summary Stats:`, 14, 29);
    doc.setFontSize(9);
    doc.text(`• Total LOP Days: ${lopData.summary.total_lop_days.toFixed(1)}`, 16, 34);
    doc.text(`• Staff with LOP: ${lopData.summary.staff_with_lop} (out of ${lopData.summary.total_staff} total)`, 16, 39);
    const avgLop = lopData.summary.staff_with_lop > 0 
      ? (lopData.summary.total_lop_days / lopData.summary.staff_with_lop).toFixed(2)
      : '0.00';
    doc.text(`• Avg LOP per Affected Staff: ${avgLop}`, 16, 44);

    // Section 1: Department Summary
    doc.setFontSize(12);
    doc.setTextColor(55, 65, 81);
    doc.text(`1. Department-wise LOP Summary`, 14, 52);

    const summaryHeaders = [['Department', 'Total Staff', 'Staff with LOP', 'Total LOP Days']];
    const summaryBody = lopData.department_summary.map(d => [
      d.department,
      d.total_staff,
      d.staff_with_lop,
      d.total_lop_days.toFixed(1)
    ]);

    autoTable(doc, {
      head: summaryHeaders,
      body: summaryBody,
      startY: 55,
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] }, // Red theme for LOP
      styles: { fontSize: 8, cellPadding: 2.5 },
    });

    const firstTableBottom = (doc as any).lastAutoTable?.finalY ?? 100;

    // Section 2: Employee Details (Filtered)
    const filteredEmployees = lopData.employee_details.filter(emp => {
      const q = lopSearch.toLowerCase();
      const matchSearch =
        !lopSearch ||
        emp.name.toLowerCase().includes(q) ||
        emp.staff_id.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q);
      const matchLOP = !lopShowOnlyWithLOP || emp.lop_days > 0;
      return matchSearch && matchLOP;
    });

    // Sort descending by LOP days to show "top" staff
    filteredEmployees.sort((a, b) => b.lop_days - a.lop_days);

    doc.setFontSize(12);
    doc.setTextColor(55, 65, 81);
    doc.text(`2. Employee-wise LOP Details`, 14, firstTableBottom + 12);

    const empHeaders = [['Staff ID', 'Name', 'Department', 'LOP Days']];
    const empBody = filteredEmployees.map(emp => [
      emp.staff_id,
      emp.name,
      emp.department,
      emp.lop_days.toFixed(1)
    ]);

    autoTable(doc, {
      head: empHeaders,
      body: empBody,
      startY: firstTableBottom + 16,
      theme: 'striped',
      headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255] }, // Slate gray header
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 55 },
        2: { cellWidth: 70 },
        3: { cellWidth: 25 }
      }
    });

    doc.save(`monthly_lop_${lopMonth}.pdf`);
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

        {/* ==================== Monthly LOP Dashboard ==================== */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8 border border-slate-100">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-lg p-2">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Monthly LOP Dashboard</h2>
                <p className="text-red-100 text-sm mt-0.5">
                  Track Loss of Pay (LOP) days — total, department-wise and employee-wise
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Month
                </label>
                <input
                  type="month"
                  value={lopMonth}
                  onChange={(e) => setLopMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Department (Optional)
                </label>
                <div className="relative group">
                  <div className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white cursor-pointer hover:border-slate-400">
                    <span className="text-slate-600 block truncate">
                      {lopDeptIds.length === 0 ? 'All Departments' : `${lopDeptIds.length} selected`}
                    </span>
                  </div>
                  <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 hidden group-hover:block max-h-60 overflow-y-auto p-2">
                    <label className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer border-b border-slate-100 mb-1">
                      <input
                        type="checkbox"
                        checked={lopDeptIds.length === 0}
                        onChange={() => setLopDeptIds([])}
                        className="rounded border-slate-300 text-red-500 focus:ring-red-400"
                      />
                      <span className="text-sm font-medium text-slate-700">Clear All (All Departments)</span>
                    </label>
                    {departments.map((dept) => (
                      <label key={dept.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={lopDeptIds.includes(String(dept.id))}
                          onChange={(e) => {
                            if (e.target.checked) setLopDeptIds([...lopDeptIds, String(dept.id)]);
                            else setLopDeptIds(lopDeptIds.filter(id => id !== String(dept.id)));
                          }}
                          className="rounded border-slate-300 text-red-500 focus:ring-red-400"
                        />
                        <span className="text-sm text-slate-700">{dept.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-end">
                <button
                  onClick={loadLopDashboard}
                  disabled={lopLoading}
                  className="w-full px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:bg-slate-400 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {lopLoading ? (
                    <><Loader className="w-4 h-4 animate-spin" /> Loading...</>
                  ) : (
                    <><TrendingDown className="w-4 h-4" /> Load LOP Data</>
                  )}
                </button>
              </div>
              {lopData && (
                <div className="flex items-end gap-2">
                  <button
                    onClick={downloadLopExcel}
                    className="flex-1 px-3 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 text-sm shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Excel
                  </button>
                  <button
                    onClick={downloadLopPDF}
                    className="flex-1 px-3 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5 text-sm shadow-sm"
                  >
                    <Download className="w-4 h-4" /> PDF
                  </button>
                </div>
              )}
            </div>

            {/* Error */}
            {lopError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {lopError}
              </div>
            )}

            {/* Results */}
            {lopData && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="relative overflow-hidden bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200 p-5">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-red-200/40 rounded-full -mr-6 -mt-6" />
                    <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Total LOP Days</p>
                    <p className="text-4xl font-bold text-red-700">{lopData.summary.total_lop_days.toFixed(1)}</p>
                    <p className="text-xs text-red-500 mt-1">
                      {lopData.date_range.from_date} — {lopData.date_range.to_date}
                    </p>
                  </div>
                  <div className="relative overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border border-orange-200 p-5">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-orange-200/40 rounded-full -mr-6 -mt-6" />
                    <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-1">Staff with LOP</p>
                    <p className="text-4xl font-bold text-orange-700">{lopData.summary.staff_with_lop}</p>
                    <p className="text-xs text-orange-500 mt-1">out of {lopData.summary.total_staff} total staff</p>
                  </div>
                  <div className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-5">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-slate-200/40 rounded-full -mr-6 -mt-6" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Avg LOP per Staff</p>
                    <p className="text-4xl font-bold text-slate-700">
                      {lopData.summary.staff_with_lop > 0
                        ? (lopData.summary.total_lop_days / lopData.summary.staff_with_lop).toFixed(2)
                        : '0.00'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">days per affected staff</p>
                  </div>
                </div>

                {/* Department-wise Summary */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-5 h-5 text-slate-600" />
                    <h3 className="text-base font-semibold text-slate-800">Department-wise LOP Summary</h3>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Department</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Total Staff</th>
                          <th className="px-4 py-3 text-center font-semibold text-orange-700">Staff with LOP</th>
                          <th className="px-4 py-3 text-center font-semibold text-red-700">Total LOP Days</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">LOP Distribution</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-600">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lopData.department_summary.length === 0 ? (
                          <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No LOP data found</td></tr>
                        ) : (
                          lopData.department_summary.map((dept, idx) => {
                            const maxLop = Math.max(...lopData.department_summary.map(d => d.total_lop_days), 1);
                            const barPct = (dept.total_lop_days / maxLop) * 100;
                            const isExpanded = lopExpandedDepts.has(dept.department);
                            const deptEmployees = lopData.employee_details.filter(e => e.department === dept.department);
                            return (
                              <React.Fragment key={dept.department}>
                                <tr
                                  className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${
                                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                  }`}
                                >
                                  <td className="px-4 py-3 font-medium text-slate-800">
                                    <span className="inline-block bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded mr-2">
                                      {dept.department_code || dept.department.slice(0, 4).toUpperCase()}
                                    </span>
                                    {dept.department}
                                  </td>
                                  <td className="px-4 py-3 text-center text-slate-600">{dept.total_staff}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`font-semibold ${
                                      dept.staff_with_lop > 0 ? 'text-orange-600' : 'text-slate-400'
                                    }`}>{dept.staff_with_lop}</span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`font-bold text-base ${
                                      dept.total_lop_days > 0 ? 'text-red-600' : 'text-slate-400'
                                    }`}>{dept.total_lop_days.toFixed(1)}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                                        <div
                                          className="h-2 rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500"
                                          style={{ width: `${barPct}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-slate-500 w-10 text-right">{barPct.toFixed(0)}%</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() => {
                                        setLopExpandedDepts(prev => {
                                          const next = new Set(prev);
                                          if (next.has(dept.department)) next.delete(dept.department);
                                          else next.add(dept.department);
                                          return next;
                                        });
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
                                    >
                                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      {isExpanded ? 'Hide' : 'Show'}
                                    </button>
                                  </td>
                                </tr>
                                {/* Expandable employee sub-rows */}
                                {isExpanded && (
                                  <tr className="bg-red-50/40 border-b border-red-100">
                                    <td colSpan={6} className="px-6 py-3">
                                      <div className="rounded-lg overflow-hidden border border-red-100">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-red-100/60">
                                              <th className="px-3 py-2 text-left font-semibold text-red-700">Staff ID</th>
                                              <th className="px-3 py-2 text-left font-semibold text-red-700">Name</th>
                                              <th className="px-3 py-2 text-center font-semibold text-red-700">LOP Days</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {deptEmployees.filter(e => e.lop_days > 0).length === 0 ? (
                                              <tr><td colSpan={3} className="px-3 py-2 text-center text-slate-500">No LOP for any employee in this department</td></tr>
                                            ) : (
                                              deptEmployees
                                                .filter(e => e.lop_days > 0)
                                                .sort((a, b) => b.lop_days - a.lop_days)
                                                .map((emp) => (
                                                  <tr key={emp.staff_user_id} className="border-t border-red-100 hover:bg-red-50">
                                                    <td className="px-3 py-1.5 text-slate-600">{emp.staff_id}</td>
                                                    <td className="px-3 py-1.5 font-medium text-slate-800">{emp.name}</td>
                                                    <td className="px-3 py-1.5 text-center font-bold text-red-600">{emp.lop_days.toFixed(1)}</td>
                                                  </tr>
                                                ))
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Employee-wise LOP Details */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-slate-600" />
                      <h3 className="text-base font-semibold text-slate-800">Employee-wise LOP Details</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={lopShowOnlyWithLOP}
                          onChange={(e) => setLopShowOnlyWithLOP(e.target.checked)}
                          className="rounded border-slate-300 text-red-500 focus:ring-red-400"
                        />
                        Show only staff with LOP
                      </label>
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search staff..."
                          value={lopSearch}
                          onChange={(e) => {
                            setLopSearch(e.target.value);
                            setLopPage(1);
                          }}
                          className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 w-48"
                        />
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const filtered = lopData.employee_details.filter(emp => {
                      const q = lopSearch.toLowerCase();
                      const matchSearch = !q || emp.name.toLowerCase().includes(q) || String(emp.staff_id).toLowerCase().includes(q) || emp.department.toLowerCase().includes(q);
                      const matchLOP = !lopShowOnlyWithLOP || emp.lop_days > 0;
                      return matchSearch && matchLOP;
                    });
                    
                    // Sort descending by LOP days to show "top" staff
                    filtered.sort((a, b) => b.lop_days - a.lop_days);

                    const pageSize = 10;
                    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
                    // Ensure page is in bounds
                    const safePage = Math.max(1, Math.min(lopPage, totalPages));
                    const currentData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

                    return (
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">#</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">Staff ID</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">Name</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">Department</th>
                              <th className="px-4 py-3 text-center font-semibold text-red-700">LOP Days</th>
                              <th className="px-4 py-3 text-left font-semibold text-slate-700">LOP Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                  No staff found matching your filters
                                </td>
                              </tr>
                            ) : (
                              currentData.map((emp, idx) => {
                                const realIdx = (safePage - 1) * pageSize + idx + 1;
                                return (
                                  <tr
                                    key={emp.staff_user_id}
                                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                    }`}
                                  >
                                    <td className="px-4 py-3 text-slate-400 text-xs">{realIdx}</td>
                                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{emp.staff_id}</td>
                                    <td className="px-4 py-3 font-medium text-slate-800">{emp.name}</td>
                                    <td className="px-4 py-3">
                                      <span className="inline-block bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">
                                        {emp.department}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {emp.lop_days > 0 ? (
                                        <span className="inline-block bg-red-100 text-red-700 font-bold text-sm px-3 py-0.5 rounded-full">
                                          {emp.lop_days.toFixed(1)}
                                        </span>
                                      ) : (
                                        <span className="inline-block bg-green-100 text-green-600 font-medium text-sm px-3 py-0.5 rounded-full">
                                          0
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      {emp.lop_days === 0 ? (
                                        <span className="text-xs text-green-600 font-medium">✓ No LOP</span>
                                      ) : emp.lop_days <= 1 ? (
                                        <span className="text-xs text-yellow-600 font-medium">⚠ Minor LOP</span>
                                      ) : emp.lop_days <= 3 ? (
                                        <span className="text-xs text-orange-600 font-medium">⚠ Moderate LOP</span>
                                      ) : (
                                        <span className="text-xs text-red-600 font-bold">✖ High LOP</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
                          <span>Showing {currentData.length} of {filtered.length} staff</span>
                          
                          <div className="flex items-center gap-2">
                            <button
                              disabled={safePage === 1}
                              onClick={() => setLopPage(p => Math.max(1, p - 1))}
                              className="px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Prev
                            </button>
                            <span className="font-medium text-slate-700">
                              Page {safePage} of {totalPages}
                            </span>
                            <button
                              disabled={safePage === totalPages}
                              onClick={() => setLopPage(p => Math.min(totalPages, p + 1))}
                              className="px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!lopData && !lopLoading && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <TrendingDown className="w-14 h-14 mb-3 opacity-40" />
                <p className="text-base font-medium">Select a month and click "Load LOP Data"</p>
                <p className="text-sm mt-1">to view Loss of Pay statistics for the selected period</p>
              </div>
            )}
          </div>
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
