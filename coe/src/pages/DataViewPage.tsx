import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Database } from 'lucide-react';
import fetchWithAuth from '../services/fetchAuth';
import { fetchCoeStudentsMap, CoeStudentsMapResponse } from '../services/coe';

type Department = {
  code: string;
  name: string;
};

type Semester = {
  name: string;
};

export default function DataViewPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [studentsData, setStudentsData] = useState<CoeStudentsMapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'departments' | 'semesters' | 'courses' | 'students'>('departments');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSem, setSelectedSem] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch departments
      const deptRes = await fetchWithAuth('/api/academics/departments/');
      if (!deptRes.ok) throw new Error('Failed to fetch departments');
      const deptData = await deptRes.json();
      setDepartments(deptData || []);
      if (deptData && deptData.length > 0) {
        setSelectedDept(deptData[0].code);
      }

      // Fetch semesters
      const semRes = await fetchWithAuth('/api/academics/semesters/');
      if (!semRes.ok) throw new Error('Failed to fetch semesters');
      const semData = await semRes.json();
      setSemesters(semData || []);
      if (semData && semData.length > 0) {
        setSelectedSem(semData[0].name);
      }
    } catch (err) {
      setError(`Error fetching data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentsForDeptSem(dept: string, sem: string) {
    if (!dept || !sem) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCoeStudentsMap({ department: dept, semester: sem });
      setStudentsData(data);
    } catch (err) {
      setError(`Error fetching students: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStudentsData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'courses' || activeTab === 'students') {
      loadStudentsForDeptSem(selectedDept, selectedSem);
    }
  }, [activeTab, selectedDept, selectedSem]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      {/* Header */}
      <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-3">
            <Database className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Database View</h1>
            <p className="text-sm text-blue-700">Departments, Semesters, Courses, and Students</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900">Error</h3>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap border-b border-gray-200">
          {(['departments', 'semesters', 'courses', 'students'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
              <span className="text-gray-600">Loading data...</span>
            </div>
          )}

          {!loading && (
            <>
              {/* Departments Tab */}
              {activeTab === 'departments' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900">All Departments ({departments.length})</h2>
                  {departments.length === 0 ? (
                    <p className="text-gray-500">No departments found</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {departments.map((dept) => (
                        <div key={dept.code} className="rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-blue-100 p-2 flex-shrink-0">
                              <div className="w-8 h-8 flex items-center justify-center text-xs font-bold text-blue-600">
                                {dept.code.slice(0, 2)}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{dept.name}</p>
                              <p className="text-sm text-gray-500">Code: {dept.code}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Semesters Tab */}
              {activeTab === 'semesters' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900">All Semesters ({semesters.length})</h2>
                  {semesters.length === 0 ? (
                    <p className="text-gray-500">No semesters found</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {semesters.map((sem) => (
                        <div key={sem.name} className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-indigo-200 p-2 flex-shrink-0">
                              <span className="text-sm font-bold text-indigo-700">SEM</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900">{sem.name}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Courses Tab */}
              {activeTab === 'courses' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                      <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {departments.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.name} ({d.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
                      <select
                        value={selectedSem}
                        onChange={(e) => setSelectedSem(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {semesters.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <h2 className="text-lg font-semibold text-gray-900">
                    Courses - {selectedDept} / {selectedSem}
                  </h2>

                  {studentsData && studentsData.departments.length > 0 ? (
                    <div className="space-y-4">
                      {studentsData.departments.map((deptBlock) => (
                        <div key={deptBlock.department} className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-900">{deptBlock.department}</h3>
                            <p className="text-sm text-gray-600">{deptBlock.courses.length} courses</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Course Code</th>
                                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Course Name</th>
                                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Students</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {deptBlock.courses.map((course) => (
                                  <tr key={course.course_code} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{course.course_code}</td>
                                    <td className="px-4 py-2 text-sm text-gray-700">{course.course_name}</td>
                                    <td className="px-4 py-2 text-sm text-gray-600">{course.students?.length || 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">No courses found for selected filters</p>
                  )}
                </div>
              )}

              {/* Students Tab */}
              {activeTab === 'students' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                      <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {departments.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.name} ({d.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
                      <select
                        value={selectedSem}
                        onChange={(e) => setSelectedSem(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {semesters.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <h2 className="text-lg font-semibold text-gray-900">
                    Students - {selectedDept} / {selectedSem}
                  </h2>

                  {studentsData && studentsData.departments.length > 0 ? (
                    <div className="space-y-6">
                      {studentsData.departments.map((deptBlock) => {
                        let totalStudents = 0;
                        deptBlock.courses.forEach((course) => {
                          totalStudents += course.students?.length || 0;
                        });

                        return (
                          <div key={deptBlock.department} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                              <h3 className="font-semibold text-gray-900">{deptBlock.department}</h3>
                              <p className="text-sm text-gray-600">{totalStudents} students across {deptBlock.courses.length} courses</p>
                            </div>

                            <div className="space-y-4 p-4">
                              {deptBlock.courses.map((course) => (
                                <div key={course.course_code} className="border border-gray-200 rounded p-3 hover:bg-gray-50">
                                  <h4 className="font-medium text-gray-900 mb-2">
                                    {course.course_code} - {course.course_name}
                                  </h4>
                                  <div className="text-sm text-gray-600 mb-2">
                                    {course.students?.length || 0} students enrolled
                                  </div>
                                  {course.students && course.students.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {course.students.slice(0, 12).map((student) => (
                                        <div
                                          key={student.id}
                                          className="rounded bg-blue-50 px-3 py-2 border border-blue-100 text-xs"
                                        >
                                          <p className="font-semibold text-blue-900">{student.reg_no}</p>
                                          <p className="text-blue-700 truncate">{student.name}</p>
                                          {student.is_arrear && (
                                            <span className="inline-block mt-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                              Arrear
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {(course.students?.length || 0) > 12 && (
                                    <p className="text-xs text-gray-500 mt-2">
                                      ... and {(course.students?.length || 0) - 12} more students
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500">No students found for selected filters</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
