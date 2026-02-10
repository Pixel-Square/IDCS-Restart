import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  GraduationCap, 
  Building2,
  Calendar,
  Download,
  Filter,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  X,
  Loader2
} from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';

interface AnalyticsSummary {
  total_sessions: number;
  total_records: number;
  present_count: number;
  absent_count: number;
  attendance_rate: number;
}

interface DepartmentStat {
  department_id: number;
  department_name: string;
  department_short: string;
  total_records: number;
  present: number;
  absent: number;
  leave: number;
  on_duty: number;
  attendance_rate: number;
}

interface ClassStat {
  section_id: number;
  section_name: string;
  course_name: string;
  department: string;
  total_records: number;
  present: number;
  absent: number;
  leave: number;
  on_duty: number;
  attendance_rate: number;
}

interface StudentStat {
  student_id: number;
  reg_no: string;
  name: string;
  section: string;
  total_records: number;
  present: number;
  absent: number;
  leave: number;
  on_duty: number;
  late: number;
  attendance_rate: number;
}

interface ClassReport {
  date: string;
  section_id: number;
  section_name: string;
  total_strength: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  on_duty: number;
  batch_name?: string;
  department_name?: string;
  department_short?: string;
  absent_list: string[];
  leave_list: string[];
  od_list: string[];
  late_list: string[];
  attendance_percentage: number;
}

interface DailyTrend {
  day: string;
  total: number;
  present: number;
  absent: number;
}

interface Department {
  id: number;
  name: string;
  short_name: string;
}

interface Section {
  id: number;
  name: string;
  batch__course__name: string;
  batch__course__department__id: number;
  batch__course__department__short_name: string;
}

interface FiltersData {
  permission_level: 'all' | 'department' | 'class';
  departments: Department[];
  sections: Section[];
}

type ViewType = 'overview' | 'department' | 'class' | 'student';

const AttendanceAnalytics: React.FC = () => {
  const [viewType, setViewType] = useState<ViewType>('overview');
  const [permissionLevel, setPermissionLevel] = useState<'all' | 'department' | 'class'>('class');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [singleDay, setSingleDay] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [availableFilters, setAvailableFilters] = useState<FiltersData | null>(null);

  // Data
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [departmentStats, setDepartmentStats] = useState<DepartmentStat[]>([]);
  const [classStats, setClassStats] = useState<ClassStat[]>([]);
  const [studentStats, setStudentStats] = useState<StudentStat[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [classReport, setClassReport] = useState<ClassReport | null>(null);
  // Requests modal
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const pendingCount = requests.filter(r => r.status === 'PENDING').length;

  // Auto-refresh requests when modal opens
  useEffect(() => {
    if (requestsOpen) {
      loadRequests();
    }
  }, [requestsOpen]);

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const res = await fetchWithAuth('/api/academics/attendance-unlock-requests/');
      const data = await res.json();
      console.log('Unlock requests response:', data);
      if (res.ok) {
        const requestsList = Array.isArray(data) ? data : (data.results || data.data || []);
        console.log('Setting requests:', requestsList);
        console.log('Request IDs:', requestsList.map((r: any) => ({ requestId: r.id, sessionId: r.session, status: r.status })));
        setRequests(requestsList);
      } else {
        console.error('Failed to load requests:', data);
        setRequests([]);
      }
    } catch (e) {
      console.error('Error loading requests:', e);
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleRequestAction = async (id: number, action: 'approve' | 'reject') => {
    console.log(`Attempting to ${action} request with ID:`, id);
    if (!window.confirm(`Are you sure you want to ${action} this request?`)) return;
    setRequestsLoading(true);
    try {
      const res = await fetchWithAuth(`/api/academics/attendance-unlock-requests/${id}/${action}/`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || 'Failed');
      }
      alert(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully!`);
      // Reload all requests to get fresh data from server
      await loadRequests();
    } catch (e: any) {
      alert('Failed: ' + (e?.message || String(e)));
      setRequestsLoading(false);
    }
  };

  const fetchClassReport = async (sectionId: number) => {
    setReportLoading(true);
    setReportOpen(true);
    setClassReport(null);
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const params = new URLSearchParams({ section_id: String(sectionId), date: todayIso });
      const resp = await fetchWithAuth(`/api/academics/analytics/class-report/?${params}`);
      const data = await resp.json();
      if (resp.ok) {
        setClassReport(data);
      } else {
        setClassReport(null);
      }
    } catch (err) {
      setClassReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    loadFilters();
    
    // Set default dates (today)
    const today = new Date();
    const isoToday = today.toISOString().split('T')[0];
    setEndDate(isoToday);
    setStartDate(isoToday);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      loadAnalytics();
    }
  }, [viewType, startDate, endDate, selectedDepartment, selectedSection]);

  const loadFilters = async () => {
    try {
      const response = await fetchWithAuth('/api/academics/analytics/filters/');
      const data = await response.json();
      
      if (response.ok) {
        setAvailableFilters(data);
        setPermissionLevel(data.permission_level);
      } else {
        setError(data.error || 'Failed to load filters');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        view_type: viewType,
        start_date: startDate,
        end_date: endDate,
      });
      
      if (selectedDepartment) {
        params.append('department_id', selectedDepartment);
      }
      if (selectedSection) {
        params.append('section_id', selectedSection);
      }
      
      const response = await fetchWithAuth(`/api/academics/analytics/attendance/?${params}`);
      const data = await response.json();
      
      if (response.ok) {
        setPermissionLevel(data.permission_level);
        
        if (viewType === 'overview' && data.data.summary) {
          setSummary(data.data.summary);
          setDailyTrend(data.data.daily_trend || []);
        } else if (viewType === 'department' && data.data.departments) {
          setDepartmentStats(data.data.departments);
        } else if (viewType === 'class' && data.data.classes) {
          setClassStats(data.data.classes);
        } else if (viewType === 'student' && data.data.students) {
          setStudentStats(data.data.students);
        }
      } else {
        setError(data.error || data.detail || 'Failed to load analytics');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (rate: number) => {
    if (rate >= 85) return 'text-green-600 bg-green-50';
    if (rate >= 75) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const exportToCSV = () => {
    let csvContent = '';
    let filename = 'attendance_analytics.csv';

    if (viewType === 'department' && departmentStats.length > 0) {
      csvContent = 'Department,Total Records,Present,Absent,Leave,OD,Attendance Rate\n';
      departmentStats.forEach(dept => {
        csvContent += `${dept.department_name},${dept.total_records},${dept.present},${dept.absent},${dept.leave},${dept.on_duty},${dept.attendance_rate}%\n`;
      });
      filename = 'department_analytics.csv';
    } else if (viewType === 'class' && classStats.length > 0) {
      csvContent = 'Section,Course,Department,Total Records,Present,Absent,Leave,OD,Attendance Rate\n';
      classStats.forEach(cls => {
        csvContent += `${cls.section_name},${cls.course_name},${cls.department},${cls.total_records},${cls.present},${cls.absent},${cls.leave},${cls.on_duty},${cls.attendance_rate}%\n`;
      });
      filename = 'class_analytics.csv';
    } else if (viewType === 'student' && studentStats.length > 0) {
      csvContent = 'Reg No,Name,Section,Total Records,Present,Absent,Leave,OD,Late,Attendance Rate\n';
      studentStats.forEach(student => {
        csvContent += `${student.reg_no},${student.name},${student.section},${student.total_records},${student.present},${student.absent},${student.leave},${student.on_duty},${student.late},${student.attendance_rate}%\n`;
      });
      filename = 'student_analytics.csv';
    }

    if (csvContent) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    }
  };

  const filteredSections = availableFilters?.sections.filter(
    s => !selectedDepartment || s.batch__course__department__id === parseInt(selectedDepartment)
  ) || [];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attendance Analytics</h1>
          <p className="text-gray-600 mt-1">
            {permissionLevel === 'all' && 'All Departments Access'}
            {permissionLevel === 'department' && 'Department Level Access'}
            {permissionLevel === 'class' && 'Class Level Access'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setRequestsOpen(true)}
            className="relative flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <AlertCircle className="w-4 h-4" />
            {permissionLevel === 'all' ? 'All Requests' : 'My Requests'}
            {pendingCount > 0 && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-600 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            disabled={loading}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Requests Modal */}
      {requestsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-white" />
                <h3 className="text-xl font-bold text-white">
                  {permissionLevel === 'all' ? 'All Unlock Requests' : 'My Unlock Requests'}
                </h3>
                {pendingCount > 0 && (
                  <span className="px-2 py-1 bg-white/20 text-white text-sm rounded-lg font-medium">
                    {pendingCount} Pending
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={loadRequests}
                  disabled={requestsLoading}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-5 h-5 text-white ${requestsLoading ? 'animate-spin' : ''}`} />
                </button>
                <button 
                  onClick={() => { setRequestsOpen(false); setRequests([]); }}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {requestsLoading && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                  <p className="text-gray-600">Loading requests...</p>
                </div>
              )}
              
              {!requestsLoading && requests.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="bg-gray-100 p-4 rounded-full">
                    <AlertCircle className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">No Requests Found</h3>
                  <p className="text-gray-600 text-sm text-center max-w-md">
                    {permissionLevel === 'all' 
                      ? 'There are no unlock requests at this time' 
                      : 'You have no unlock requests. To request an unlock, go to the attendance marking page and click "Unlock Session" on a locked period.'}
                  </p>
                </div>
              )}
              
              {!requestsLoading && requests.length > 0 && (
                <div className="space-y-3">
                  {requests.map((r) => {
                    const statusColors = {
                      PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                      APPROVED: 'bg-green-100 text-green-800 border-green-300',
                      REJECTED: 'bg-red-100 text-red-800 border-red-300'
                    };
                    const statusIcons = {
                      PENDING: Clock,
                      APPROVED: CheckCircle,
                      REJECTED: XCircle
                    };
                    const StatusIcon = statusIcons[r.status as keyof typeof statusIcons] || Clock;
                    
                    return (
                      <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-4">
                          {/* Left: Request Info */}
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-500">Request #{r.id} (Session: {r.session_id || r.session})</span>
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${statusColors[r.status as keyof typeof statusColors] || statusColors.PENDING}`}>
                                <StatusIcon className="w-3 h-3" />
                                {r.status}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-gray-500">Session:</span>
                                <span className="ml-2 font-medium text-gray-900">{r.session_display || `Session #${r.session && r.session.id || 'N/A'}`}</span>
                              </div>
                              {permissionLevel === 'all' && (
                                <div>
                                  <span className="text-gray-500">Requested by:</span>
                                  <span className="ml-2 font-medium text-gray-900">
                                    {r.requested_by && typeof r.requested_by === 'object' 
                                      ? r.requested_by.username || r.requested_by.staff_id || r.requested_by.id 
                                      : r.requested_by_display || 'N/A'}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="text-gray-500">Requested at:</span>
                                <span className="ml-2 font-medium text-gray-900">
                                  {r.requested_at ? new Date(r.requested_at).toLocaleString() : 'N/A'}
                                </span>
                              </div>
                              {r.note && (
                                <div className="col-span-2">
                                  <span className="text-gray-500">Note:</span>
                                  <span className="ml-2 text-gray-700 italic">{r.note}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center gap-2">
                            {r.status === 'PENDING' ? (
                              permissionLevel === 'all' ? (
                                <>
                                  <button
                                    onClick={() => handleRequestAction(r.id, 'approve')}
                                    disabled={requestsLoading}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRequestAction(r.id, 'reject')}
                                    disabled={requestsLoading}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <div className="text-sm text-gray-500 italic flex items-center gap-1.5">
                                  <Clock className="w-4 h-4" />
                                  Waiting for approval
                                </div>
                              )
                            ) : (
                              <div className="text-sm text-gray-500">
                                {(r.reviewed_by_display || r.reviewed_by) && (
                                  <div>
                                    <span className="text-gray-500">Reviewed by:</span>
                                    <span className="ml-1 font-medium">{r.reviewed_by_display || `Staff #${r.reviewed_by}`}</span>
                                  </div>
                                )}
                                {r.reviewed_at && (
                                  <div className="text-xs text-gray-400">
                                    {new Date(r.reviewed_at).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Picker */}
          <div className="col-span-1 md:col-span-2 lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Options</label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center">
                <input type="checkbox" checked={singleDay} onChange={(e) => {
                  const val = e.target.checked;
                  setSingleDay(val);
                  // when switching to single day, ensure start/end align
                  const todayIso = new Date().toISOString().split('T')[0];
                  if (val) {
                    const dateToUse = startDate || todayIso;
                    setStartDate(dateToUse);
                    setEndDate(dateToUse);
                  }
                }} className="mr-2" />
                Single Day
              </label>
              <button type="button" onClick={() => {
                const todayIso = new Date().toISOString().split('T')[0];
                setStartDate(todayIso);
                setEndDate(todayIso);
              }} className="px-2 py-1 text-xs bg-gray-100 rounded">Today</button>
            </div>

            {singleDay ? (
              <div className="mt-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    const todayIso = new Date().toISOString().split('T')[0];
                    if (!val) {
                      setStartDate(todayIso);
                      setEndDate(todayIso);
                    } else {
                      setStartDate(val);
                      setEndDate(val);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-2"
                />
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      const todayIso = new Date().toISOString().split('T')[0];
                      setStartDate(todayIso);
                    } else {
                      setStartDate(val);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      const todayIso = new Date().toISOString().split('T')[0];
                      setEndDate(todayIso);
                    } else {
                      setEndDate(val);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Department Filter (for 'all' permission) */}
          {permissionLevel === 'all' && availableFilters && availableFilters.departments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  setSelectedSection(''); // Reset section when department changes
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Departments</option>
                {availableFilters.departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.short_name} - {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Section Filter (for 'all' and 'department' permissions) */}
          {(permissionLevel === 'all' || permissionLevel === 'department') && filteredSections.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Section
              </label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Sections</option>
                {filteredSections.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name} - {section.batch__course__name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* View Type Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
        {/* Small screens: compact select */}
        <div className="sm:hidden">
          <select
            value={viewType}
            onChange={(e) => setViewType(e.target.value as ViewType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="overview">Overview</option>
            <option value="department">By Department</option>
            <option value="class">By Class</option>
            <option value="student">By Student</option>
          </select>
        </div>

        {/* Larger screens: button tabs */}
        <div className="hidden sm:flex gap-2">
          <button
            onClick={() => setViewType('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewType === 'overview'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Overview
          </button>

          <button
            onClick={() => setViewType('department')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewType === 'department'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            By Department
          </button>

          <button
            onClick={() => setViewType('class')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewType === 'class'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            By Class
          </button>

          <button
            onClick={() => setViewType('student')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewType === 'student'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4" />
            By Student
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Overview View */}
      {!loading && viewType === 'overview' && summary && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Sessions</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total_sessions}</p>
                </div>
                <Calendar className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Records</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total_records}</p>
                </div>
                <Users className="w-8 h-8 text-purple-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Present</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{summary.present_count}</p>
                </div>
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 font-bold">✓</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Absent</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{summary.absent_count}</p>
                </div>
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold">✗</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Attendance Rate</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    summary.attendance_rate >= 85 ? 'text-green-600' :
                    summary.attendance_rate >= 75 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {summary.attendance_rate}%
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Daily Trend Chart */}
          {dailyTrend.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Attendance Trend</h3>
              <div className="overflow-x-auto">
                <div className="min-w-full">
                  {dailyTrend.map((day, idx) => {
                    const rate = day.total > 0 ? (day.present / day.total * 100) : 0;
                    return (
                      <div key={idx} className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-b-0">
                        <div className="w-24 text-sm text-gray-600">
                          {new Date(day.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden">
                              <div
                                className="h-full bg-green-500 transition-all duration-300"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-700 w-12 text-right">
                              {rate.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500 w-32 text-right">
                          <span className="text-green-600">{day.present}</span> / {day.total}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Department View */}
      {!loading && viewType === 'department' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Mobile cards */}
          <div className="sm:hidden p-4 space-y-3">
            {departmentStats.map((dept) => (
              <div key={dept.department_id} className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold">{dept.department_short} - {dept.department_name}</div>
                    <div className="text-xs text-gray-500">Total: {dept.total_records}</div>
                  </div>
                  <div className="text-sm text-right">
                    <div className="text-green-600 font-semibold">{dept.present}</div>
                    <div className="text-xs text-gray-500">Present</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-center">
                  <div className="text-red-600">{dept.absent}<div className="text-gray-400">Absent</div></div>
                  <div className="">{dept.leave}<div className="text-gray-400">Leave</div></div>
                  <div className="">{dept.on_duty}<div className="text-gray-400">OD</div></div>
                  <div className="">{dept.attendance_rate}%<div className="text-gray-400">Rate</div></div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Present
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Absent
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Leave
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    OD
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {departmentStats.map((dept) => (
                  <tr key={dept.department_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{dept.department_short}</div>
                      <div className="text-xs text-gray-500">{dept.department_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {dept.total_records}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600 font-medium">
                      {dept.present}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600 font-medium">
                      {dept.absent}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {dept.leave}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {dept.on_duty}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(dept.attendance_rate)}`}>
                        {dept.attendance_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {departmentStats.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No data available for the selected period
            </div>
          )}
        </div>
      )}

      {/* Class View */}
      {!loading && viewType === 'class' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Mobile cards */}
          <div className="sm:hidden p-4 space-y-3">
            {classStats.map((cls) => (
              <div key={cls.section_id} className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold">{cls.section_name}</div>
                    <div className="text-xs text-gray-500">{cls.course_name} — {cls.department}</div>
                  </div>
                  <div className="text-sm text-right">
                    <div className="text-green-600 font-semibold">{cls.present}</div>
                    <div className="text-xs text-gray-500">Present</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-center">
                  <div className="text-gray-900">{cls.total_records}<div className="text-gray-400">Total</div></div>
                  <div className="text-red-600">{cls.absent}<div className="text-gray-400">Absent</div></div>
                  <div className="">{cls.leave}<div className="text-gray-400">Leave</div></div>
                  <div className="">{cls.on_duty}<div className="text-gray-400">OD</div></div>
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <div className="text-sm text-gray-600">Rate: {cls.attendance_rate}%</div>
                  <button onClick={() => fetchClassReport(cls.section_id)} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded">Report</button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Section
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Course
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dept
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Present
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Absent
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Leave
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    OD
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {classStats.map((cls) => (
                  <tr key={cls.section_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {cls.section_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {cls.course_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {cls.department}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {cls.total_records}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600 font-medium">
                      {cls.present}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600 font-medium">
                      {cls.absent}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {cls.leave}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {cls.on_duty}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(cls.attendance_rate)}`}>
                        {cls.attendance_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => fetchClassReport(cls.section_id)}
                        className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {classStats.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No data available for the selected period
            </div>
          )}
        </div>
      )}

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-11/12 max-w-md p-6">
            {reportLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              </div>
            ) : classReport ? (
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Class Report</h3>
                    <p className="text-sm text-gray-600">{classReport.department_short} / {classReport.batch_name} / {classReport.section_name} — {new Date(classReport.date).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => setReportOpen(false)} className="text-gray-500">Close</button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 rounded text-sm">
                    <div className="text-xs text-gray-500">Total Strength</div>
                    <div className="text-lg font-bold">{classReport.total_strength}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded text-sm">
                    <div className="text-xs text-gray-500">Attendance %</div>
                    <div className="text-lg font-bold">{classReport.attendance_percentage}%</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded text-sm">
                    <div className="text-xs text-gray-500">Present</div>
                    <div className="text-lg font-bold text-green-600">{classReport.present}</div>
                  </div>
                  <div className="p-3 bg-red-50 rounded text-sm">
                    <div className="text-xs text-gray-500">Absent</div>
                    <div className="text-lg font-bold text-red-600">{classReport.absent}</div>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded text-sm">
                    <div className="text-xs text-gray-500">Leave</div>
                    <div className="text-lg font-bold">{classReport.leave}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded text-sm">
                    <div className="text-xs text-gray-500">OD</div>
                    <div className="text-lg font-bold">{classReport.on_duty}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded text-sm col-span-2">
                    <div className="text-xs text-gray-500">Late</div>
                    <div className="text-lg font-bold">{classReport.late}</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Students (last 3 digits)</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500">Absent</div>
                      <div className="font-mono">{(classReport.absent_list && classReport.absent_list.length) ? classReport.absent_list.join(', ') : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Leave</div>
                      <div className="font-mono">{(classReport.leave_list && classReport.leave_list.length) ? classReport.leave_list.join(', ') : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">OD</div>
                      <div className="font-mono">{(classReport.od_list && classReport.od_list.length) ? classReport.od_list.join(', ') : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Late</div>
                      <div className="font-mono">{(classReport.late_list && classReport.late_list.length) ? classReport.late_list.join(', ') : '—'}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No report available.</div>
            )}
          </div>
        </div>
      )}

      {/* Student View */}
      {!loading && viewType === 'student' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Mobile cards */}
          <div className="sm:hidden p-4 space-y-3">
            {studentStats.map((student) => (
              <div key={student.student_id} className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold">{student.reg_no} — {student.name}</div>
                    <div className="text-xs text-gray-500">{student.section}</div>
                  </div>
                  <div className="text-sm text-right">
                    <div className="text-green-600 font-semibold">{student.present}</div>
                    <div className="text-xs text-gray-500">Present</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-center">
                  <div className="text-gray-900">{student.total_records}<div className="text-gray-400">Total</div></div>
                  <div className="text-red-600">{student.absent}<div className="text-gray-400">Absent</div></div>
                  <div className="">{student.leave}<div className="text-gray-400">Leave</div></div>
                  <div className="">{student.late}<div className="text-gray-400">Late</div></div>
                </div>
                <div className="mt-3 text-sm text-gray-600">Rate: {student.attendance_rate}%</div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reg No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Section
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Present
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Absent
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Leave
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    OD
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Late
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {studentStats.map((student) => (
                  <tr key={student.student_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {student.reg_no}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {student.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {student.section}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {student.total_records}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600 font-medium">
                      {student.present}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600 font-medium">
                      {student.absent}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {student.leave}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {student.on_duty}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {student.late}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(student.attendance_rate)}`}>
                        {student.attendance_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {studentStats.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No data available for the selected period
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AttendanceAnalytics;
