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
  AlertCircle
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
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [availableFilters, setAvailableFilters] = useState<FiltersData | null>(null);

  // Data
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [departmentStats, setDepartmentStats] = useState<DepartmentStat[]>([]);
  const [classStats, setClassStats] = useState<ClassStat[]>([]);
  const [studentStats, setStudentStats] = useState<StudentStat[]>([]);

  useEffect(() => {
    loadFilters();
    
    // Set default dates (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
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
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          disabled={loading}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
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
        <div className="flex gap-2">
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
          <div className="overflow-x-auto">
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
          <div className="overflow-x-auto">
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

      {/* Student View */}
      {!loading && viewType === 'student' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
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
