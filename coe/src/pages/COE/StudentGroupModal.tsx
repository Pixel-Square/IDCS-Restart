import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Users, Check, Loader2, AlertCircle, Building2 } from 'lucide-react';
import { CoeCourseStudent, fetchCoeStudentsMap } from '../../services/coe';

export interface StudentGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: string[];
  semesters: string[];
  initialDepartment?: string;
  initialSemester?: string;
  enriched?: {
    department_filter: string;
    semester_filter: string | null;
    departments: Array<{
      department: string;
      courses: Array<{
        course_code: string;
        course_name: string;
        is_elective?: boolean;
        students: CoeCourseStudent[];
      }>;
    }>;
  } | null;
  onSave: (groupName: string, regNos: string[], department?: string, semester?: string) => void;
}

export interface DeptStudentItem {
  id: number | string;
  reg_no: string;
  name: string;
  department: string;
  is_arrear?: boolean;
}


export function normDept(d: string): string {
  const u = String(d || '').trim().toUpperCase();
  if (!u || u === 'ALL') return 'ALL';
  if (u === 'CIVIL' || u === 'CE' || u.includes('CIVIL')) return 'CE';
  if (u === 'MECH' || u === 'ME' || u.includes('MECHANICAL')) return 'ME';
  if (u === 'AIDS' || u === 'AI&DS' || u === 'AI & DS' || u === 'AI AND DS' || u.includes('DATA SCIENCE')) return 'AIDS';
  if (u === 'AIML' || u === 'AI&ML' || u === 'AI & ML' || u === 'AI AND ML' || u.includes('MACHINE LEARNING')) return 'AIML';
  if (u === 'CSE' || u.includes('COMPUTER SCIENCE')) return 'CSE';
  if (u === 'ECE' || (u.includes('ELECTRONICS') && u.includes('COMMUNICATION'))) return 'ECE';
  if (u === 'EEE' || (u.includes('ELECTRICAL') && u.includes('ELECTRONICS'))) return 'EEE';
  if (u === 'IT' || u.includes('INFORMATION TECHNOLOGY')) return 'IT';
  return u;
}

export function matchesDept(deptA?: string | null, deptB?: string | null): boolean {
  if (!deptA || !deptB) return true;
  const nA = normDept(deptA);
  const nB = normDept(deptB);
  if (nA === 'ALL' || nB === 'ALL') return true;
  return nA === nB;
}

function extractHomeDeptStudentsFromCourses(
  deptName: string,
  courses: Array<{ course_code: string; course_name: string; is_elective?: boolean; students: CoeCourseStudent[] }>
): DeptStudentItem[] {
  const seen = new Set<string>();
  const result: DeptStudentItem[] = [];

  for (const c of courses || []) {
    for (const s of c.students || []) {
      const regNo = String(s?.reg_no || '').trim();
      if (!regNo || seen.has(regNo)) continue;
      seen.add(regNo);
      result.push({
        id: s.id || regNo,
        reg_no: regNo,
        name: s.name || regNo,
        department: (s as any).department || deptName,
        is_arrear: Boolean(s.is_arrear),
      });
    }
  }

  return result.sort((a, b) => {
    const numA = parseInt(a.reg_no.slice(-3), 10);
    const numB = parseInt(b.reg_no.slice(-3), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
    return a.reg_no.localeCompare(b.reg_no);
  });
}

export default function StudentGroupModal({
  isOpen,
  onClose,
  departments,
  semesters,
  initialDepartment = 'ALL',
  initialSemester = 'SEM1',
  enriched,
  onSave,
}: StudentGroupModalProps) {
  const [selectedDept, setSelectedDept] = useState(initialDepartment);
  const [selectedSem, setSelectedSem] = useState(initialSemester);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedRegNos, setSelectedRegNos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deptStudents, setDeptStudents] = useState<DeptStudentItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync initial values when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedDept(initialDepartment || 'ALL');
      setSelectedSem(initialSemester || 'SEM1');
      setSearchQuery('');
      setGroupName('');
      setSelectedRegNos(new Set());
      setValidationError(null);
      setError(null);
    }
  }, [isOpen, initialDepartment, initialSemester]);

  // Extract / fetch unique students department-wise whenever selectedDept or selectedSem changes
  useEffect(() => {
    if (!isOpen) return;

    // Check if we can extract directly from parent's enriched data
    const canUseEnriched =
      enriched &&
      enriched.departments &&
      selectedSem === initialSemester &&
      matchesDept(selectedDept, initialDepartment || 'ALL');

    if (canUseEnriched) {
      const allStudents: DeptStudentItem[] = [];
      enriched.departments.forEach((deptBlock) => {
        if (matchesDept(selectedDept, deptBlock.department)) {
          const list = extractHomeDeptStudentsFromCourses(deptBlock.department, deptBlock.courses || []);
          allStudents.push(...list);
        }
      });

      // Deduplicate across depts if ALL
      const uniqueMap = new Map<string, DeptStudentItem>();
      allStudents.forEach((st) => {
        if (!uniqueMap.has(st.reg_no)) {
          uniqueMap.set(st.reg_no, st);
        }
      });

      const list = Array.from(uniqueMap.values()).sort((a, b) => {
        const numA = parseInt(a.reg_no.slice(-3), 10);
        const numB = parseInt(b.reg_no.slice(-3), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return a.reg_no.localeCompare(b.reg_no);
      });

      setDeptStudents(list);
      setLoading(false);
      setError(null);
      return;
    }

    // Otherwise fetch department & semester student map dynamically
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetchCoeStudentsMap({
          department: selectedDept,
          semester: selectedSem,
        });
        if (!active) return;

        const allStudents: DeptStudentItem[] = [];
        (res.departments || []).forEach((deptBlock) => {
          if (matchesDept(selectedDept, deptBlock.department)) {
            const list = extractHomeDeptStudentsFromCourses(deptBlock.department, deptBlock.courses || []);
            allStudents.push(...list);
          }
        });

        const uniqueMap = new Map<string, DeptStudentItem>();
        allStudents.forEach((st) => {
          if (!uniqueMap.has(st.reg_no)) {
            uniqueMap.set(st.reg_no, st);
          }
        });

        const list = Array.from(uniqueMap.values()).sort((a, b) => {
          const numA = parseInt(a.reg_no.slice(-3), 10);
          const numB = parseInt(b.reg_no.slice(-3), 10);
          if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
          return a.reg_no.localeCompare(b.reg_no);
        });

        setDeptStudents(list);
      } catch (err) {
        if (!active) return;
        setError('Unable to fetch students for the selected department and semester.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, selectedDept, selectedSem, enriched, initialDepartment, initialSemester]);

  // Filter students by search query
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return deptStudents;
    return deptStudents.filter(
      (s) =>
        s.reg_no.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query) ||
        s.department.toLowerCase().includes(query)
    );
  }, [deptStudents, searchQuery]);

  // Group filtered students by department (useful if selectedDept === 'ALL')
  const groupedByDept = useMemo(() => {
    const map = new Map<string, DeptStudentItem[]>();
    filteredStudents.forEach((s) => {
      const deptList = map.get(s.department) || [];
      deptList.push(s);
      map.set(s.department, deptList);
    });
    return Array.from(map.entries()).map(([dept, students]) => ({
      department: dept,
      students,
    }));
  }, [filteredStudents]);

  const toggleStudent = (regNo: string) => {
    if (!regNo) return;
    setSelectedRegNos((prev) => {
      const next = new Set(prev);
      if (next.has(regNo)) {
        next.delete(regNo);
      } else {
        next.add(regNo);
      }
      return next;
    });
    setValidationError(null);
  };

  const selectAllDeptStudents = (students: DeptStudentItem[]) => {
    setSelectedRegNos((prev) => {
      const next = new Set(prev);
      students.forEach((s) => {
        if (s.reg_no) next.add(s.reg_no);
      });
      return next;
    });
    setValidationError(null);
  };

  const deselectAllDeptStudents = (students: DeptStudentItem[]) => {
    setSelectedRegNos((prev) => {
      const next = new Set(prev);
      students.forEach((s) => {
        if (s.reg_no) next.delete(s.reg_no);
      });
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedRegNos((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => {
        if (s.reg_no) next.add(s.reg_no);
      });
      return next;
    });
    setValidationError(null);
  };

  const clearAllSelected = () => {
    setSelectedRegNos(new Set());
  };

  const handleSave = () => {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setValidationError('Please enter a group name.');
      return;
    }
    if (selectedRegNos.size === 0) {
      setValidationError('Please select at least one student.');
      return;
    }

    onSave(trimmedName, Array.from(selectedRegNos), selectedDept, selectedSem);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Department Bulk Student Selection</h2>
              <p className="text-xs text-gray-500">
                Select Department & Semester to cluster students. Group selections automatically apply to all courses in that choice.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="p-4 bg-gray-50/80 border-b border-gray-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Department
              </label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Semester
              </label>
              <select
                value={selectedSem}
                onChange={(e) => setSelectedSem(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                {semesters.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search bar & quick toggles */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student name or reg no..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
              <span className="font-semibold text-gray-600 mr-1">
                {deptStudents.length} Students Enrolled
              </span>
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={loading || filteredStudents.length === 0}
                className="px-2.5 py-1.5 font-medium rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40"
              >
                Select All Visible
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={clearAllSelected}
                disabled={selectedRegNos.size === 0}
                className="px-2.5 py-1.5 font-medium rounded-md text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
              >
                Clear Selected
              </button>
            </div>
          </div>
        </div>

        {/* Content Body: Department-wise student lists */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-500 space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm">Loading department enrolled students...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <p className="font-medium text-gray-700">No students enrolled</p>
              <p className="text-xs text-gray-400 mt-1">
                No students found for {selectedDept} in {selectedSem}. Try another department or semester.
              </p>
            </div>
          ) : (
            groupedByDept.map((group) => {
              const groupRegNos = group.students.map((s) => s.reg_no).filter(Boolean);
              const selectedInDeptCount = groupRegNos.filter((r) => selectedRegNos.has(r)).length;
              const allDeptSelected =
                groupRegNos.length > 0 && selectedInDeptCount === groupRegNos.length;

              return (
                <div
                  key={group.department}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
                >
                  {/* Department Banner */}
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-sm text-gray-900">
                        {group.department} Department
                      </span>
                      <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                        {selectedSem}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        ({selectedInDeptCount} of {group.students.length} selected)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        allDeptSelected
                          ? deselectAllDeptStudents(group.students)
                          : selectAllDeptStudents(group.students)
                      }
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      {allDeptSelected ? 'Deselect All in Dept' : 'Select All in Dept'}
                    </button>
                  </div>

                  {/* Students Grid */}
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {group.students.map((student) => {
                      const isChecked = selectedRegNos.has(student.reg_no);
                      return (
                        <label
                          key={student.reg_no}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-sm cursor-pointer transition-all select-none ${
                            isChecked
                              ? 'bg-indigo-50/90 border-indigo-400 text-indigo-950 font-medium shadow-xs'
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50/80'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500"
                            checked={isChecked}
                            onChange={() => toggleStudent(student.reg_no)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-xs font-bold text-gray-900 truncate">
                                {student.reg_no}
                              </span>
                              {student.is_arrear && (
                                <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-800 px-1 rounded">
                                  Arr
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 truncate">{student.name}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Validation Alert */}
        {validationError && (
          <div className="px-6 py-2 bg-red-50 border-t border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-auto flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                setValidationError(null);
              }}
              placeholder="e.g. Fast Learners, Batch A, Remedial..."
              className="flex-1 sm:w-72 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-semibold whitespace-nowrap">
              <Check className="w-3.5 h-3.5" />
              <span>{selectedRegNos.size} students selected</span>
            </div>
            <span className="text-xs text-gray-500 font-medium">
              Applied for: <span className="font-semibold text-gray-800">{selectedDept} • {selectedSem}</span>
            </span>
          </div>

          <div className="w-full sm:w-auto flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
            >
              Save & Apply Group
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
