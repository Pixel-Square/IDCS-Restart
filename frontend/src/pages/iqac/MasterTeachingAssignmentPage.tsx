import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  Filter,
  BookOpen,
  UserCheck,
  UserPlus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  X,
  Layers,
  GraduationCap,
  Calendar,
  Building,
  Sparkles,
  ArrowRight,
  School,
  Save,
  Check,
  Loader2,
  Plus
} from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';
import { getCachedMe } from '../../services/auth';

interface Department {
  id: number;
  code: string;
  name: string;
  short_name?: string;
}

interface BatchYear {
  id: number;
  name: string;
  start_year?: number;
  end_year?: number;
}

interface AcademicYear {
  id: number;
  name: string;
  is_active: boolean;
}

interface Section {
  id: number;
  name: string;
  batch?: string | { id?: number; name?: string; course?: { department?: { id?: number; code?: string; name?: string } } };
  batch_id?: number;
  batch_name?: string;
  batch_regulation?: { id: number; code: string; name?: string } | null;
  department_id?: number;
  department_code?: string;
  department_short_name?: string;
  department?: { id: number; code?: string; name?: string; short_name?: string };
  semester?: number;
  managing_department_id?: number;
}

interface StaffUser {
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface StaffMember {
  id: number;
  staff_id: string;
  user: StaffUser | string | null;
  designation?: string | null;
  department?: number | { id?: number; code?: string; name?: string; short_name?: string } | null;
  current_department?: { id?: number; code?: string; name?: string; short_name?: string } | null;
}

interface SectionAdvisor {
  id: number;
  section_id: number;
  advisor: string;
  advisor_id: number;
  is_active: boolean;
  academic_year?: number;
}

interface CurriculumCourse {
  id: number;
  course_code?: string;
  course_name?: string;
  class_type?: string;
  question_paper_type?: string;
  qp_type?: string;
  category?: string;
  semester?: number;
  regulation?: string;
  l?: number;
  t?: number;
  p?: number;
  s?: number;
  c?: number;
  is_elective?: boolean;
  department?: { id: number; code: string; name: string };
  department_id?: number;
}

interface TeachingAssignment {
  id: number;
  staff?: number | string;
  staff_id?: number;
  curriculum_row?: { id: number; course_code?: string; course_name?: string } | number;
  curriculum_row_id?: number;
  curriculum_row_details?: { id: number; course_code?: string; course_name?: string; semester?: number };
  section?: number | string;
  section_id?: number;
  section_details?: { id: number; name?: string; batch?: string; semester?: number };
  academic_year?: string | number;
  is_active: boolean;
  staff_details?: {
    id: number;
    staff_id: string;
    user: StaffUser | null;
  };
  subject?: string;
  subject_code?: string;
  elective_subject?: any;
  elective_subject_details?: any;
}

const getStaffDisplayName = (staff: StaffMember | null | undefined): string => {
  if (!staff) return '—';
  if (typeof staff.user === 'string') return staff.user;
  if (staff.user && typeof staff.user === 'object') {
    const fn = (staff.user.first_name || '').trim();
    const ln = (staff.user.last_name || '').trim();
    const full = `${fn} ${ln}`.trim();
    return full || staff.user.username || staff.staff_id;
  }
  return staff.staff_id || '—';
};

const getStaffDeptCode = (staff: StaffMember | null | undefined, departments: Department[]): string => {
  if (!staff) return '';
  if (staff.current_department?.code) return staff.current_department.code;
  if (typeof staff.department === 'object' && staff.department?.code) return staff.department.code;
  if (typeof staff.department === 'number') {
    const d = departments.find(dep => dep.id === staff.department);
    return d?.short_name || d?.code || '';
  }
  return '';
};

// Normalize Section ID from TeachingAssignment
const getSectionIdFromTA = (ta: any): number => {
  return Number(
    ta.section_details?.id ||
    ta.section_id ||
    (typeof ta.section === 'object' ? ta.section?.id : ta.section) ||
    0
  );
};

// Normalize Curriculum Row ID from TeachingAssignment
const getCurriculumRowIdFromTA = (ta: any): number => {
  return Number(
    ta.curriculum_row_details?.id ||
    (typeof ta.curriculum_row === 'object' ? ta.curriculum_row?.id : ta.curriculum_row) ||
    ta.curriculum_row_id ||
    0
  );
};

// Helper to extract staff ID from TeachingAssignment
const getStaffIdFromTA = (ta: any): number | null => {
  if (ta.staff_details?.id) return Number(ta.staff_details.id);
  if (typeof ta.staff === 'object' && ta.staff?.id) return Number(ta.staff.id);
  if (ta.staff && !isNaN(Number(ta.staff))) return Number(ta.staff);
  if (ta.staff_id && !isNaN(Number(ta.staff_id))) return Number(ta.staff_id);
  return null;
};

// Find all matching assignments for a course in a section
const findExistingAssignmentsForCourse = (
  course: CurriculumCourse,
  taList: TeachingAssignment[],
  sectionId: number
): TeachingAssignment[] => {
  // Filter all assignments belonging to this section
  const sectionTAs = taList.filter(ta => {
    if (ta.is_active === false) return false;
    return getSectionIdFromTA(ta) === Number(sectionId);
  });

  // Priority 1: Direct match by curriculum_row ID (matches advisor view)
  const idMatches = sectionTAs.filter(ta => {
    const rowId = getCurriculumRowIdFromTA(ta);
    return rowId > 0 && rowId === Number(course.id);
  });
  if (idMatches.length > 0) return idMatches;

  // Priority 2: Match by course code
  const cCode = (course.course_code || '').trim().toUpperCase();
  if (cCode && cCode !== '—' && cCode !== '-') {
    const codeMatches = sectionTAs.filter(ta => {
      const taCodes = [
        ta.curriculum_row_details?.course_code,
        typeof ta.curriculum_row === 'object' ? (ta.curriculum_row as any)?.course_code : '',
        typeof ta.subject === 'string' ? ta.subject : '',
        ta.subject_code,
        (ta as any).elective_subject_details?.course_code,
        typeof (ta as any).elective_subject === 'object' ? (ta as any).elective_subject?.course_code : '',
      ]
        .filter(Boolean)
        .map(s => String(s).trim().toUpperCase());

      return taCodes.some(tc => tc === cCode || tc.startsWith(cCode) || cCode.startsWith(tc));
    });
    if (codeMatches.length > 0) return codeMatches;
  }

  // Priority 3: Match by course name / title
  const cName = (course.course_name || '').trim().toLowerCase();
  if (cName) {
    const nameMatches = sectionTAs.filter(ta => {
      const taNames = [
        ta.curriculum_row_details?.course_name,
        typeof ta.curriculum_row === 'object' ? (ta.curriculum_row as any)?.course_name : '',
        typeof ta.subject === 'string' ? ta.subject : '',
        (ta as any).elective_subject_details?.course_name,
        typeof (ta as any).elective_subject === 'object' ? (ta as any).elective_subject?.course_name : '',
      ]
        .filter(Boolean)
        .map(s => String(s).trim().toLowerCase());

      return taNames.some(tn => tn === cName || tn.includes(cName) || cName.includes(tn));
    });
    if (nameMatches.length > 0) return nameMatches;
  }

  return [];
};

// Check if two staff ID arrays contain identical IDs
const areStaffArraysEqual = (a?: number[], b?: number[]): boolean => {
  const arrA = (a || []).slice().sort((x, y) => x - y);
  const arrB = (b || []).slice().sort((x, y) => x - y);
  if (arrA.length !== arrB.length) return false;
  return arrA.every((val, idx) => val === arrB[idx]);
};

// Searchable Staff Dropdown Component with top search input & Multi-Select Support
function SearchableStaffDropdown({
  staffList,
  departments,
  isMulti = false,
  selectedStaffId,
  selectedStaffIds = [],
  onSelect,
  onSelectMulti,
  placeholder = 'Search & select faculty...',
  label = 'Faculty',
  disabled = false,
}: {
  staffList: StaffMember[];
  departments: Department[];
  isMulti?: boolean;
  selectedStaffId?: number | null;
  selectedStaffIds?: number[];
  onSelect?: (staff: StaffMember | null) => void;
  onSelectMulti?: (staffIds: number[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedStaffSingle = useMemo(() => {
    if (isMulti || !selectedStaffId) return null;
    return staffList.find(s => Number(s.id) === Number(selectedStaffId)) || null;
  }, [isMulti, selectedStaffId, staffList]);

  const filteredStaff = useMemo(() => {
    if (!searchQuery.trim()) return staffList;
    const q = searchQuery.toLowerCase().trim();
    return staffList.filter(s => {
      const name = getStaffDisplayName(s).toLowerCase();
      const sid = (s.staff_id || '').toLowerCase();
      const username = (typeof s.user === 'object' && s.user?.username ? s.user.username : '').toLowerCase();
      const dept = getStaffDeptCode(s, departments).toLowerCase();
      return name.includes(q) || sid.includes(q) || username.includes(q) || dept.includes(q);
    });
  }, [staffList, searchQuery, departments]);

  const handleToggleStaff = (staff: StaffMember) => {
    if (!isMulti) {
      onSelect?.(staff);
      setIsOpen(false);
      return;
    }

    const currentIds = selectedStaffIds || [];
    const isSelected = currentIds.some(id => Number(id) === Number(staff.id));
    if (isSelected) {
      onSelectMulti?.(currentIds.filter(id => Number(id) !== Number(staff.id)));
    } else {
      onSelectMulti?.([...currentIds, Number(staff.id)]);
    }
  };

  const handleRemoveStaffId = (idToRemove: number) => {
    if (isMulti) {
      onSelectMulti?.((selectedStaffIds || []).filter(id => Number(id) !== Number(idToRemove)));
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* For multi-select: Display assigned staff badges */}
      {isMulti && selectedStaffIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedStaffIds.map(id => {
            const st = staffList.find(s => Number(s.id) === Number(id));
            const displayName = st ? getStaffDisplayName(st) : `Staff #${id}`;
            const sid = st?.staff_id || '';
            const deptCode = st ? getStaffDeptCode(st, departments) : '';

            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200/90 shadow-2xs transition-all hover:bg-blue-100/70"
              >
                <div className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="font-bold text-slate-900">{sid}</span>
                <span className="text-slate-700">{displayName}</span>
                {deptCode && (
                  <span className="px-1 py-0.2 rounded text-[10px] bg-blue-100 text-blue-800 font-medium">
                    {deptCode}
                  </span>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveStaffId(id);
                    }}
                    className="text-slate-400 hover:text-red-600 rounded-full p-0.5 hover:bg-red-50 transition-colors ml-0.5"
                    title="Remove assignment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setSearchQuery('');
          }
        }}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border transition-all duration-200 text-left ${
          disabled
            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            : isMulti
            ? selectedStaffIds.length > 0
              ? 'bg-white border-blue-200 hover:border-blue-400 text-slate-700 shadow-xs'
              : 'bg-white border-gray-300 text-gray-400 hover:border-gray-400 shadow-xs'
            : selectedStaffSingle
            ? 'bg-blue-50/70 border-blue-200 text-blue-900 hover:border-blue-400 shadow-xs'
            : 'bg-white border-gray-300 text-gray-400 hover:border-gray-400 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {isMulti ? (
            selectedStaffIds.length > 0 ? (
              <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                Assign More Faculty ({selectedStaffIds.length} currently assigned)
              </span>
            ) : (
              <span className="text-gray-400 italic flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-gray-400" />
                {placeholder}
              </span>
            )
          ) : selectedStaffSingle ? (
            <>
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {getStaffDisplayName(selectedStaffSingle).charAt(0).toUpperCase()}
              </div>
              <div className="truncate">
                <span className="font-semibold text-gray-900 mr-1.5">{selectedStaffSingle.staff_id}</span>
                <span className="text-gray-700 font-medium">{getStaffDisplayName(selectedStaffSingle)}</span>
                {getStaffDeptCode(selectedStaffSingle, departments) && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[11px] bg-blue-100 text-blue-800 font-medium">
                    {getStaffDeptCode(selectedStaffSingle, departments)}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="text-gray-400 italic flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-gray-400" />
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {!isMulti && selectedStaffSingle && !disabled && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(null);
              }}
              className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors"
              title="Remove advisor"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </div>
      </button>

      {/* Popover Dropdown with Search at Top */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[320px] max-w-[440px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Top Search Input */}
          <div className="p-2.5 bg-gray-50 border-b border-gray-200">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()} by name, ID or dept...`}
                className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
            {filteredStaff.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No matching staff found for "{searchQuery}"
              </div>
            ) : (
              filteredStaff.map((staff) => {
                const isSelected = isMulti
                  ? selectedStaffIds.some(id => Number(id) === Number(staff.id))
                  : selectedStaffSingle && Number(selectedStaffSingle.id) === Number(staff.id);
                const deptCode = getStaffDeptCode(staff, departments);

                return (
                  <button
                    key={staff.id}
                    type="button"
                    onClick={() => handleToggleStaff(staff)}
                    className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 text-blue-900 font-semibold'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isMulti ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 pointer-events-none"
                        />
                      ) : (
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {getStaffDisplayName(staff).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="truncate">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold text-gray-900">{staff.staff_id}</span>
                          <span className="truncate text-gray-800">{getStaffDisplayName(staff)}</span>
                        </div>
                        {staff.designation && (
                          <p className="text-[11px] text-gray-500 truncate">{staff.designation}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {deptCode && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700 font-medium">
                          {deptCode}
                        </span>
                      )}
                      {!isMulti && isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer for multi-select */}
          {isMulti && (
            <div className="p-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium pl-1">
                {selectedStaffIds.length} selected
              </span>
              <div className="flex items-center gap-2">
                {selectedStaffIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectMulti?.([])}
                    className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                  >
                    Clear All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MasterTeachingAssignmentPage() {
  // Global reference data
  const [sections, setSections] = useState<Section[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [batchYears, setBatchYears] = useState<BatchYear[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [activeAcademicYear, setActiveAcademicYear] = useState<AcademicYear | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [advisors, setAdvisors] = useState<SectionAdvisor[]>([]);
  const [teachingAssignments, setTeachingAssignments] = useState<TeachingAssignment[]>([]);

  // Filtering & Selection state
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<number | 'all'>('all');
  const [selectedBatchId, setSelectedBatchId] = useState<number | 'all'>('all');
  const [selectedRegulation, setSelectedRegulation] = useState<string | 'all'>('all');
  const [selectedSemester, setSelectedSemester] = useState<number | 'all'>('all');
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  // Section curriculum & assignments
  const [courses, setCourses] = useState<CurriculumCourse[]>([]);
  const [selectedFacultyMap, setSelectedFacultyMap] = useState<Record<number, number[]>>({});
  const [savedFacultyMap, setSavedFacultyMap] = useState<Record<number, number[]>>({});

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingAdvisor, setSavingAdvisor] = useState(false);
  const [savingCourseId, setSavingCourseId] = useState<number | null>(null);
  const [savingOverall, setSavingOverall] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  // Fetch initial data
  const fetchAllInitialData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Fetch staff with robust fallback sequence
      let loadedStaff: StaffMember[] = [];
      try {
        const staffRes = await fetchWithAuth('/api/academics/all-staff/');
        if (staffRes.ok) {
          const d = await staffRes.json();
          loadedStaff = Array.isArray(d) ? d : d.results || [];
        }
      } catch (e) {
        console.warn('all-staff failed, falling back', e);
      }

      if (!loadedStaff || loadedStaff.length === 0) {
        try {
          const hodStaffRes = await fetchWithAuth('/api/academics/hod-staff/?page_size=0');
          if (hodStaffRes.ok) {
            const d = await hodStaffRes.json();
            loadedStaff = Array.isArray(d) ? d : d.results || [];
          }
        } catch (e) {}
      }

      if (!loadedStaff || loadedStaff.length === 0) {
        try {
          const advStaffRes = await fetchWithAuth('/api/academics/advisor-staff/?page_size=0');
          if (advStaffRes.ok) {
            const d = await advStaffRes.json();
            loadedStaff = Array.isArray(d) ? d : d.results || [];
          }
        } catch (e) {}
      }
      setStaffList(loadedStaff);

      // 2. Fetch other reference data
      const [secRes, deptRes, batchRes, ayRes, advRes, taRes] = await Promise.all([
        fetchWithAuth('/api/academics/sections/?page_size=0'),
        fetchWithAuth('/api/academics/departments/?page_size=0'),
        fetchWithAuth('/api/academics/batch-years/?page_size=0'),
        fetchWithAuth('/api/academics/academic-years/?page_size=0'),
        fetchWithAuth('/api/academics/section-advisors/?page_size=0'),
        fetchWithAuth('/api/academics/teaching-assignments/?page_size=0'),
      ]);

      if (secRes.ok) {
        const d = await secRes.json();
        setSections(Array.isArray(d) ? d : d.results || []);
      }
      if (deptRes.ok) {
        const d = await deptRes.json();
        setDepartments(Array.isArray(d) ? d : d.results || []);
      }
      if (batchRes.ok) {
        const d = await batchRes.json();
        setBatchYears(Array.isArray(d) ? d : d.results || []);
      }
      if (ayRes.ok) {
        const d = await ayRes.json();
        const ays = Array.isArray(d) ? d : d.results || [];
        setAcademicYears(ays);
        const active = ays.find((a: AcademicYear) => a.is_active) || ays[0] || null;
        setActiveAcademicYear(active);
      }
      if (advRes.ok) {
        const d = await advRes.json();
        setAdvisors(Array.isArray(d) ? d : d.results || []);
      }
      if (taRes.ok) {
        const d = await taRes.json();
        const loadedTAs: TeachingAssignment[] = Array.isArray(d) ? d : d.results || [];
        setTeachingAssignments(loadedTAs);

        // Merge any staff in ta.staff_details that might be missing in staffList
        setStaffList(prev => {
          const existingIds = new Set(prev.map(s => Number(s.id)));
          const toAdd: StaffMember[] = [];
          loadedTAs.forEach(ta => {
            if (ta.staff_details && ta.staff_details.id && !existingIds.has(Number(ta.staff_details.id))) {
              existingIds.add(Number(ta.staff_details.id));
              toAdd.push({
                id: Number(ta.staff_details.id),
                staff_id: ta.staff_details.staff_id || '',
                user: ta.staff_details.user || null,
              });
            }
          });
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
    } catch (err) {
      console.error('Error fetching master teaching assignment data:', err);
      showFeedback('Failed to load initial data. Please try again.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllInitialData();
  }, []);

  // Filter sections
  const filteredSections = useMemo(() => {
    return sections.filter((sec) => {
      // Search filter (name, batch, dept)
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const secName = (sec.name || '').toLowerCase();
        const batchName = typeof sec.batch === 'string' ? sec.batch.toLowerCase() : (sec.batch_name || '').toLowerCase();
        const deptCode = (sec.department_code || sec.department_short_name || sec.department?.code || '').toLowerCase();
        const matches = secName.includes(q) || batchName.includes(q) || deptCode.includes(q);
        if (!matches) return false;
      }

      // Department filter
      if (selectedDeptId !== 'all') {
        const secDeptId = sec.department_id || sec.department?.id || sec.managing_department_id;
        if (Number(secDeptId) !== Number(selectedDeptId)) return false;
      }

      // Batch filter
      if (selectedBatchId !== 'all') {
        const secBatchId = sec.batch_id || (typeof sec.batch === 'object' ? sec.batch?.id : null);
        if (secBatchId && Number(secBatchId) !== Number(selectedBatchId)) return false;
      }

      // Regulation filter
      if (selectedRegulation !== 'all') {
        const regCode = sec.batch_regulation?.code || '';
        if (regCode !== selectedRegulation) return false;
      }

      // Semester filter
      if (selectedSemester !== 'all') {
        if (Number(sec.semester) !== Number(selectedSemester)) return false;
      }

      return true;
    });
  }, [sections, searchFilter, selectedDeptId, selectedBatchId, selectedRegulation, selectedSemester]);

  // Derive unique regulations from sections for the filter
  const regulationsList = useMemo(() => {
    const regs = new Set<string>();
    sections.forEach(s => {
      if (s.batch_regulation?.code) regs.add(s.batch_regulation.code);
    });
    return Array.from(regs).sort();
  }, [sections]);

  // Selected Section Object
  const selectedSection = useMemo(() => {
    if (!selectedSectionId) return null;
    return sections.find(s => s.id === selectedSectionId) || null;
  }, [selectedSectionId, sections]);

  // Fetch Courses & initialize faculty map when a Section is selected
  useEffect(() => {
    if (!selectedSection) {
      setCourses([]);
      setSelectedFacultyMap({});
      setSavedFacultyMap({});
      return;
    }

    const loadSectionCurriculum = async () => {
      setCoursesLoading(true);
      try {
        const deptId = selectedSection.department_id || selectedSection.department?.id || selectedSection.managing_department_id;
        const sem = selectedSection.semester;
        const reg = selectedSection.batch_regulation?.code;
        const batchId = selectedSection.batch_id || (typeof selectedSection.batch === 'object' ? selectedSection.batch?.id : undefined);

        // 1. Fetch section-specific curriculum from timetable API (identical to advisor page)
        const curSecPromise = fetchWithAuth(`/api/timetable/curriculum-for-section/?section_id=${selectedSection.id}`)
          .then(async r => r.ok ? await r.json() : { results: [] })
          .then(d => Array.isArray(d) ? d : d.results || [])
          .catch(() => [] as CurriculumCourse[]);

        // 2. Fetch teaching assignments: global endpoint and section-filtered endpoint
        const [secCourses, allTAsRes, secTAsRes] = await Promise.all([
          curSecPromise,
          fetchWithAuth('/api/academics/teaching-assignments/?page_size=0')
            .then(r => r.ok ? r.json() : [])
            .catch(() => []),
          fetchWithAuth(`/api/academics/teaching-assignments/?section_id=${selectedSection.id}&academic_year=all&page_size=0`)
            .then(r => r.ok ? r.json() : [])
            .catch(() => [])
        ]);

        const allTAs: TeachingAssignment[] = Array.isArray(allTAsRes) ? allTAsRes : (allTAsRes.results || []);
        const secTAs: TeachingAssignment[] = Array.isArray(secTAsRes) ? secTAsRes : (secTAsRes.results || []);

        let loadedCourses: CurriculumCourse[] = secCourses;
        if (!loadedCourses || loadedCourses.length === 0) {
          // Fallback to department curriculum if section endpoint returns empty
          const qs = new URLSearchParams();
          if (deptId) qs.set('department_id', String(deptId));
          if (sem) qs.set('semester', String(sem));
          if (reg) qs.set('regulation', reg);
          if (batchId) qs.set('batch_id', String(batchId));
          qs.set('page_size', '0');

          const curDeptRes = await fetchWithAuth(`/api/curriculum/department/?${qs.toString()}`);
          if (curDeptRes.ok) {
            const d = await curDeptRes.json();
            loadedCourses = Array.isArray(d) ? d : d.results || [];
          }
        }
        setCourses(loadedCourses);

        // Combine all teaching assignments & deduplicate by ID
        const taMap = new Map<number, TeachingAssignment>();
        [...teachingAssignments, ...allTAs, ...secTAs].forEach(ta => {
          if (ta && ta.id) taMap.set(ta.id, ta);
        });
        const combinedTAs = Array.from(taMap.values());
        setTeachingAssignments(combinedTAs);

        // Ensure any staff in ta.staff_details are in staffList
        setStaffList(prev => {
          const existingIds = new Set(prev.map(s => Number(s.id)));
          const toAdd: StaffMember[] = [];
          combinedTAs.forEach(ta => {
            if (ta.staff_details && ta.staff_details.id && !existingIds.has(Number(ta.staff_details.id))) {
              existingIds.add(Number(ta.staff_details.id));
              toAdd.push({
                id: Number(ta.staff_details.id),
                staff_id: ta.staff_details.staff_id || '',
                user: ta.staff_details.user || null,
              });
            }
          });
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });

        // Initialize faculty map: for each course, extract array of assigned staff IDs
        const initialMap: Record<number, number[]> = {};
        loadedCourses.forEach(course => {
          const matchedTAs = findExistingAssignmentsForCourse(course, combinedTAs, selectedSection.id);
          const staffIds = matchedTAs
            .map(ta => getStaffIdFromTA(ta))
            .filter((id): id is number => id !== null && !isNaN(id));
          // Deduplicate IDs
          initialMap[course.id] = Array.from(new Set(staffIds));
        });

        setSelectedFacultyMap(initialMap);
        setSavedFacultyMap(initialMap);
      } catch (err) {
        console.error('Error fetching section courses:', err);
        showFeedback('Failed to load courses for selected section', 'error');
        setCourses([]);
        setSelectedFacultyMap({});
        setSavedFacultyMap({});
      } finally {
        setCoursesLoading(false);
      }
    };

    loadSectionCurriculum();
  }, [selectedSection]);

  // Find Advisor for selected section
  const currentAdvisorMapping = useMemo(() => {
    if (!selectedSection) return null;
    return advisors.find(a => a.section_id === selectedSection.id && a.is_active) || null;
  }, [selectedSection, advisors]);

  const currentAdvisorStaff = useMemo(() => {
    if (!currentAdvisorMapping) return null;
    return staffList.find(s => Number(s.id) === Number(currentAdvisorMapping.advisor_id)) || null;
  }, [currentAdvisorMapping, staffList]);

  // Handle Advisor Assign / Change
  const handleAssignAdvisor = async (staff: StaffMember | null) => {
    if (!selectedSection) return;
    setSavingAdvisor(true);

    try {
      if (!staff) {
        // Deactivate or remove existing advisor if any
        if (currentAdvisorMapping) {
          const delRes = await fetchWithAuth(`/api/academics/section-advisors/${currentAdvisorMapping.id}/`, {
            method: 'DELETE',
          });
          if (delRes.ok || delRes.status === 204) {
            setAdvisors(prev => prev.filter(a => a.id !== currentAdvisorMapping.id));
            showFeedback('Section advisor removed successfully');
          }
        }
        return;
      }

      // Check if advisor is already assigned to this exact staff
      if (currentAdvisorMapping && Number(currentAdvisorMapping.advisor_id) === Number(staff.id)) {
        return;
      }

      // Assign advisor via POST endpoint
      const payload = {
        section_id: selectedSection.id,
        advisor_id: staff.id,
        academic_year_id: activeAcademicYear?.id,
        is_active: true,
      };

      const res = await fetchWithAuth('/api/academics/section-advisors/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to assign section advisor');
      }

      const savedAdvisor = await res.json();
      setAdvisors(prev => {
        const withoutOld = prev.filter(a => a.section_id !== selectedSection.id);
        return [...withoutOld, savedAdvisor];
      });
      showFeedback(`Advisor ${getStaffDisplayName(staff)} assigned to Section ${selectedSection.name}!`);
    } catch (err: any) {
      console.error('Advisor assignment failed:', err);
      showFeedback(err.message || 'Failed to assign advisor', 'error');
    } finally {
      setSavingAdvisor(false);
    }
  };

  // Count unsaved course changes
  const unsavedCount = useMemo(() => {
    let count = 0;
    courses.forEach(course => {
      const current = selectedFacultyMap[course.id] || [];
      const saved = savedFacultyMap[course.id] || [];
      if (!areStaffArraysEqual(current, saved)) count++;
    });
    return count;
  }, [courses, selectedFacultyMap, savedFacultyMap]);

  // Handle Faculty change in local state for a course
  const handleSelectFacultyForCourse = (courseId: number, staffIds: number[]) => {
    setSelectedFacultyMap(prev => ({
      ...prev,
      [courseId]: staffIds,
    }));
  };

  // Save all faculty assignments for a single course (handles multiple faculty like labs)
  const saveCourseAssignments = async (course: CurriculumCourse, targetStaffIds: number[]): Promise<void> => {
    if (!selectedSection) return;

    const existingAssignments = findExistingAssignmentsForCourse(course, teachingAssignments, selectedSection.id);
    const existingStaffIds = existingAssignments
      .map(a => getStaffIdFromTA(a))
      .filter((id): id is number => id !== null);

    // 1. Delete removed staff assignments
    const toDelete = existingAssignments.filter(a => {
      const sid = getStaffIdFromTA(a);
      return sid !== null && !targetStaffIds.includes(sid);
    });

    for (const a of toDelete) {
      const res = await fetchWithAuth(`/api/academics/teaching-assignments/${a.id}/`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        const txt = await res.text().catch(() => null);
        throw new Error(`Failed to remove assignment: ${txt || res.status}`);
      }
    }

    // 2. Add new staff assignments
    const toAdd = targetStaffIds.filter(id => !existingStaffIds.includes(id));
    const newlyCreated: TeachingAssignment[] = [];
    for (const id of toAdd) {
      const res = await fetchWithAuth('/api/academics/teaching-assignments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_id: selectedSection.id,
          curriculum_row_id: course.id,
          staff_id: id,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => null);
        let errMsg = txt;
        try {
          const json = JSON.parse(txt || '{}');
          if (json.non_field_errors) errMsg = json.non_field_errors.join(', ');
          else if (json.detail) errMsg = json.detail;
        } catch {}
        throw new Error(`Failed to assign faculty: ${errMsg || res.status}`);
      }
      const created = await res.json();
      newlyCreated.push(created);
    }

    // Update teaching assignments in state
    setTeachingAssignments(prev => {
      const deletedIds = new Set(toDelete.map(d => d.id));
      const remaining = prev.filter(ta => !deletedIds.has(ta.id));
      return [...remaining, ...newlyCreated];
    });
  };

  // Single Course direct Save button
  const handleSaveSingleCourse = async (course: CurriculumCourse) => {
    const currentStaffIds = selectedFacultyMap[course.id] || [];
    setSavingCourseId(course.id);

    try {
      await saveCourseAssignments(course, currentStaffIds);
      setSavedFacultyMap(prev => ({
        ...prev,
        [course.id]: currentStaffIds,
      }));
      showFeedback(`Saved teaching faculty allocation for ${course.course_code || course.course_name}!`);
    } catch (err: any) {
      console.error('Course save error:', err);
      showFeedback(err.message || 'Failed to save faculty allocation', 'error');
    } finally {
      setSavingCourseId(null);
    }
  };

  // Overall Save: Commit all course assignments for this section in one action
  const handleOverallSave = async () => {
    if (!selectedSection) return;
    setSavingOverall(true);

    try {
      let savedCount = 0;
      let errorCount = 0;
      const updatedBaseline: Record<number, number[]> = { ...savedFacultyMap };

      for (const course of courses) {
        const desiredStaffIds = selectedFacultyMap[course.id] || [];
        const previousStaffIds = savedFacultyMap[course.id] || [];

        // Only commit courses where assignment changed
        if (!areStaffArraysEqual(desiredStaffIds, previousStaffIds)) {
          try {
            await saveCourseAssignments(course, desiredStaffIds);
            updatedBaseline[course.id] = desiredStaffIds;
            savedCount++;
          } catch (err) {
            console.error(`Error saving course ${course.id}:`, err);
            errorCount++;
          }
        }
      }

      setSavedFacultyMap(updatedBaseline);

      if (errorCount === 0) {
        showFeedback(`Successfully saved all teaching faculty allocations for Section ${selectedSection.name}!`);
      } else {
        showFeedback(`Saved ${savedCount} course allocation(s), but encountered ${errorCount} error(s).`, 'error');
      }
    } catch (err: any) {
      console.error('Overall save failed:', err);
      showFeedback(err.message || 'Failed to complete overall save', 'error');
    } finally {
      setSavingOverall(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Feedback Alert */}
        {feedback && (
          <div className={`p-4 rounded-xl shadow-lg border flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            <div className="flex items-center gap-3">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              )}
              <span className="text-sm font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-2xl shadow-md shadow-blue-500/20">
                <School className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">Master Teaching Assignment</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    IQAC Portal
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  Universal section selection, advisor management & course teaching faculty allocations (matches Advisor assignments)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {activeAcademicYear && (
                <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-100/80 rounded-xl text-xs font-semibold text-slate-700 border border-slate-200">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span>Academic Year: <strong className="text-blue-700">{activeAcademicYear.name}</strong></span>
                </div>
              )}
              <button
                type="button"
                onClick={() => fetchAllInitialData(true)}
                disabled={loading || refreshing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar & Filters Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
              <Filter className="w-4 h-4 text-indigo-600" />
              <span>Section Search & Filtering Controls</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              Found {filteredSections.length} section{filteredSections.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Search Input */}
            <div className="lg:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Quick Search</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Section / Dept / Batch..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department</label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.short_name || dept.code} - {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Batch / Year</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              >
                <option value="all">All Batches</option>
                {batchYears.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Regulation Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Regulation</label>
              <select
                value={selectedRegulation}
                onChange={(e) => setSelectedRegulation(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              >
                <option value="all">All Regulations</option>
                {regulationsList.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Semester</label>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              >
                <option value="all">All Semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={sem}>
                    Semester {sem}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section Picker Pills */}
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Select a Section to View & Assign ({filteredSections.length})
            </label>
            {filteredSections.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-xl text-center text-sm text-slate-500 border border-dashed border-slate-200">
                No sections match the current search filters. Try clearing or relaxing filters.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                {filteredSections.map((sec) => {
                  const isSelected = selectedSectionId === sec.id;
                  const deptCode = sec.department_code || sec.department_short_name || sec.department?.code || '';
                  const hasAdvisor = advisors.some(a => a.section_id === sec.id && a.is_active);

                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setSelectedSectionId(sec.id)}
                      className={`group px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all duration-150 ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25 scale-[1.02]'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${hasAdvisor ? 'bg-emerald-500' : 'bg-amber-400'}`} title={hasAdvisor ? 'Advisor Assigned' : 'No Advisor'} />
                        <span className="font-bold">{sec.name}</span>
                        {deptCode && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {deptCode}
                          </span>
                        )}
                        {sec.semester && (
                          <span className={`text-[10px] opacity-80`}>
                            Sem {sec.semester}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected Section Details & Advisor Card */}
        {selectedSection ? (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                        {selectedSection.department_code || selectedSection.department_short_name || selectedSection.department?.code || 'Department'}
                      </span>
                      <h2 className="text-2xl font-black tracking-tight text-white">
                        Section {selectedSection.name}
                      </h2>
                      {selectedSection.semester && (
                        <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-white/10 text-white">
                          Semester {selectedSection.semester}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-indigo-200 mt-2 font-medium">
                      <span>Batch: <strong className="text-white">{typeof selectedSection.batch === 'string' ? selectedSection.batch : selectedSection.batch_name || '—'}</strong></span>
                      <span>•</span>
                      <span>Regulation: <strong className="text-white">{selectedSection.batch_regulation?.code || '—'}</strong></span>
                      <span>•</span>
                      <span>Dept Name: <strong className="text-white">{selectedSection.department?.name || '—'}</strong></span>
                    </div>
                  </div>

                  {/* Advisor Status Pill */}
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/15">
                    <UserCheck className="w-5 h-5 text-indigo-300" />
                    <div>
                      <div className="text-[11px] text-indigo-200 font-medium uppercase tracking-wider">Section Advisor</div>
                      <div className="text-sm font-bold text-white">
                        {currentAdvisorStaff ? getStaffDisplayName(currentAdvisorStaff) : 'Not Assigned'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Advisor Quick Picker & Section Info Body */}
              <div className="p-6 bg-white grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      <span>Section Advisor Assignment</span>
                    </label>
                    {savingAdvisor && (
                      <span className="text-xs text-indigo-600 font-semibold flex items-center gap-1.5 animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Saving Advisor...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Search and pick a faculty member to assign as the Section Advisor for Section <strong>{selectedSection.name}</strong>.
                  </p>

                  <div className="max-w-xl">
                    <SearchableStaffDropdown
                      staffList={staffList}
                      departments={departments}
                      isMulti={false}
                      selectedStaffId={currentAdvisorStaff?.id}
                      onSelect={(staff) => handleAssignAdvisor(staff)}
                      placeholder="Search staff by Name or ID to assign as advisor..."
                      label="Advisor"
                      disabled={savingAdvisor}
                    />
                  </div>
                </div>

                {/* Quick Stats / Info Box */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 space-y-2.5">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quick Details</div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Managing Dept</span>
                      <span className="font-semibold text-slate-800">
                        {selectedSection.department?.name || selectedSection.department_short_name || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Semester Active</span>
                      <span className="font-semibold text-slate-800">Sem {selectedSection.semester || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Total Courses</span>
                      <span className="font-semibold text-indigo-600">{courses.length} courses</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Courses & Teaching Assignment Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Courses & Teaching Faculty Allocation
                    </h3>
                    <p className="text-xs text-slate-500">
                      Curriculum courses for Semester {selectedSection.semester || '—'} ({selectedSection.batch_regulation?.code || 'Regulation'})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    {courses.length} Course{courses.length === 1 ? '' : 's'}
                  </span>

                  {/* Overall Save Button */}
                  <button
                    type="button"
                    onClick={handleOverallSave}
                    disabled={savingOverall || coursesLoading || courses.length === 0}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl shadow-sm transition-all ${
                      unsavedCount > 0
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25 ring-2 ring-indigo-400 ring-offset-2 animate-pulse'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="Save all teaching faculty allocations for this section"
                  >
                    {savingOverall ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving All...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Overall Save</span>
                        {unsavedCount > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-400 text-slate-900 rounded-full font-black">
                            {unsavedCount}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {coursesLoading ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-indigo-600 border-t-transparent mb-3" />
                  <p className="text-sm font-medium text-slate-600">Loading curriculum courses...</p>
                </div>
              ) : courses.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No courses found for this section</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Ensure Department Curriculum rows are defined for Department #{selectedSection.department_id || selectedSection.department?.id} in Semester {selectedSection.semester}.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3.5 px-4">#</th>
                        <th className="py-3.5 px-4">Course Code</th>
                        <th className="py-3.5 px-4">Course Title</th>
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4">Class Type</th>
                        <th className="py-3.5 px-4">L-T-P-S-C</th>
                        <th className="py-3.5 px-4 min-w-[340px]">Assigned Faculty</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {courses.map((course, idx) => {
                        const assignedStaffIds = selectedFacultyMap[course.id] || [];
                        const savedStaffIds = savedFacultyMap[course.id] || [];
                        const isModified = !areStaffArraysEqual(assignedStaffIds, savedStaffIds);
                        const isSavingThis = savingCourseId === course.id;

                        const creditsFormatted = `${course.l ?? 0}-${course.t ?? 0}-${course.p ?? 0}-${course.s ?? 0} (${course.c ?? 0})`;

                        return (
                          <tr key={course.id} className={`transition-colors ${isModified ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50/70'}`}>
                            <td className="py-3.5 px-4 text-xs font-semibold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {course.course_code || '—'}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-800">
                              <div className="max-w-xs md:max-w-sm truncate" title={course.course_name}>
                                {course.course_name || '—'}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                                {course.category || (course.is_elective ? 'Elective' : 'Core')}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                {course.class_type || 'THEORY'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                              {creditsFormatted}
                            </td>
                            <td className="py-3.5 px-4 min-w-[340px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <SearchableStaffDropdown
                                    staffList={staffList}
                                    departments={departments}
                                    isMulti={true}
                                    selectedStaffIds={assignedStaffIds}
                                    onSelectMulti={(newStaffIds) => handleSelectFacultyForCourse(course.id, newStaffIds)}
                                    placeholder="Search & pick faculty..."
                                    label="Faculty"
                                    disabled={isSavingThis || savingOverall}
                                  />
                                </div>
                                {isModified && (
                                  <button
                                    type="button"
                                    onClick={() => handleSaveSingleCourse(course)}
                                    disabled={isSavingThis || savingOverall}
                                    className="p-2 text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors shadow-2xs flex-shrink-0"
                                    title="Save this course assignment"
                                  >
                                    {isSavingThis ? (
                                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {isModified ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm animate-pulse">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                  Unsaved
                                </span>
                              ) : assignedStaffIds.length > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Assigned {assignedStaffIds.length > 1 ? `(${assignedStaffIds.length})` : ''}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                  <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                                  Unassigned
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty state when no section is selected */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">No Section Selected</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Please choose a section from the list above or use the search filters to inspect section details, assign section advisors, and allocate course teaching faculty.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
