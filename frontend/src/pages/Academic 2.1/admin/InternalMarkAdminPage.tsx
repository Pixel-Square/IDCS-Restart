/**
 * Academic 2.1 - Internal Marks Admin Page
 * IQAC view for viewing and managing internal marks across all courses
 */

import React, { useState, useEffect } from 'react';
import { Search, Download, Filter, ChevronDown, ChevronRight, BarChart2, RefreshCw } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Semester {
  id: string;
  name: string;
  year: number;
  term: number;
  status: string;
}

interface Course {
  id: string;
  code: string;
  name: string;
  semester_name: string;
  department_name: string;
  class_name: string;
  faculty_name: string;
  total_students: number;
  marks_entered: number;
  marks_published: boolean;
  internal_total: number | null;
}

export default function InternalMarkAdminPage() {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  
  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Stats
  const [stats, setStats] = useState({
    totalCourses: 0,
    marksCompleted: 0,
    marksPublished: 0,
    pendingEntry: 0,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (semesters.length > 0 && !selectedSemester) {
      // Auto-select current/latest semester
      const current = semesters.find(s => s.status === 'CURRENT') || semesters[0];
      if (current) setSelectedSemester(current.id);
    }
  }, [semesters]);

  useEffect(() => {
    if (selectedSemester) {
      loadCourses();
    }
  }, [selectedSemester, selectedDepartment]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      // Load departments and semesters in parallel
      const [deptRes, semRes] = await Promise.all([
        fetchWithAuth('/api/academics/departments/').then(r => r.ok ? r.json() : []),
        fetchWithAuth('/api/academics/semesters/').then(r => r.ok ? r.json() : []),
      ]);
      // Handle both paginated and non-paginated responses
      setDepartments(Array.isArray(deptRes) ? deptRes : (deptRes?.results || []));
      setSemesters(Array.isArray(semRes) ? semRes : (semRes?.results || []));
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCourses = async () => {
    try {
      setLoading(true);
      // Build query params
      const params = new URLSearchParams();
      if (selectedSemester) params.append('semester', selectedSemester);
      if (selectedDepartment) params.append('department', selectedDepartment);
      
      const response = await fetchWithAuth(`/api/academic-v2/courses/?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load courses');
      
      const data = await response.json();
      // Handle both result formats: { courses: [], stats: {} } or direct array
      const courseArray = Array.isArray(data) ? data : (data.courses || data.results || []);
      setCourses(courseArray);
      setStats(data.stats || {
        totalCourses: courseArray.length,
        marksCompleted: 0,
        marksPublished: 0,
        pendingEntry: 0,
      });
    } catch (error) {
      console.error('Failed to load courses:', error);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredCourses = courses.filter(course => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      course.code.toLowerCase().includes(query) ||
      course.name.toLowerCase().includes(query) ||
      course.faculty_name?.toLowerCase().includes(query) ||
      course.class_name?.toLowerCase().includes(query)
    );
  });

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedSemester) params.append('semester', selectedSemester);
      if (selectedDepartment) params.append('department', selectedDepartment);
      
      const response = await fetchWithAuth(`/api/academic-v2/internal-marks/export/?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `internal_marks_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Internal Marks Overview</h1>
        <p className="text-gray-500 mt-1">View and monitor internal marks across all departments</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Courses</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCourses}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <BarChart2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Marks Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.marksCompleted}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <BarChart2 className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Published</p>
              <p className="text-2xl font-bold text-purple-600">{stats.marksPublished}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <BarChart2 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Entry</p>
              <p className="text-2xl font-bold text-orange-600">{stats.pendingEntry}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <BarChart2 className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <div className="flex flex-wrap items-center gap-4">
            {/* Semester Select */}
            <div className="flex-shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="w-48 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Semesters</option>
                {semesters.map(sem => (
                  <option key={sem.id} value={sem.id}>
                    {sem.name} {sem.status === 'CURRENT' ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Department Select */}
            <div className="flex-shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-48 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by course code, name, or faculty..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-end gap-2">
              <button
                onClick={loadCourses}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading courses...</p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No courses found. Try adjusting your filters.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Course
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Class
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Faculty
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Students
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCourses.map((course) => {
                  const progress = course.total_students > 0 
                    ? Math.round((course.marks_entered / course.total_students) * 100) 
                    : 0;
                  
                  return (
                    <tr key={course.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900">{course.code}</div>
                          <div className="text-sm text-gray-500">{course.name}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{course.class_name || '-'}</div>
                        <div className="text-xs text-gray-500">{course.department_name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {course.faculty_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-900">
                        {course.total_students}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                progress === 100 ? 'bg-green-500' : progress > 50 ? 'bg-blue-500' : 'bg-orange-500'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right">{progress}%</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {course.marks_entered} / {course.total_students} entered
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {course.marks_published ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Published
                          </span>
                        ) : progress === 100 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            In Progress
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
