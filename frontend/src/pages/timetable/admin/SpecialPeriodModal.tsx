import React, { useState, useEffect } from 'react';
import { X, Search, Plus, Trash2, CheckSquare, Square, Layers, Pencil, Sparkles } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

export interface ExceptionCourse {
  id: number | string;
  course_code: string;
  course_name: string;
}

export interface SpecialPeriodAllocation {
  id: string;
  title: string;
  color?: string; // Light pastel background color
  selectedSemesters: number[];
  selectedYears?: number[];
  selectedDepartments: string[];
  selectedSectionKeys: string[];
  selectedMixedSectionKeys: string[];
  exceptionCourses: ExceptionCourse[];
  individualPeriods: number; // No of Periods (Individual / Single)
  pairedPeriods: number; // Pair Periods (2-consecutive period block pairs)
  createdAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAllocationsUpdated?: (allocations: SpecialPeriodAllocation[]) => void;
}

// 15 curated light pastel shades (completely distinct from red/orange break & lunch, readable with dark text)
export const SPECIAL_PASTEL_COLOR_PALETTE = [
  { name: 'Sky Azure', bg: '#E0F2FE', border: '#7DD3FC', text: '#0369A1' },
  { name: 'Ocean Blue', bg: '#DBEAFE', border: '#93C5FD', text: '#1D4ED8' },
  { name: 'Soft Indigo', bg: '#EEF2FF', border: '#A5B4FC', text: '#4338CA' },
  { name: 'Lavender Purple', bg: '#F3E8FF', border: '#D8B4FE', text: '#6B21A8' },
  { name: 'Royal Violet', bg: '#EDE9FE', border: '#C4B5FD', text: '#5B21B6' },
  { name: 'Fresh Mint', bg: '#D1FAE5', border: '#6EE7B7', text: '#065F46' },
  { name: 'Aqua Teal', bg: '#CCFBF1', border: '#5EEAD4', text: '#0F766E' },
  { name: 'Cyan Breeze', bg: '#CFFAFE', border: '#67E8F9', text: '#0E7490' },
  { name: 'Soft Sage', bg: '#DCFCE7', border: '#86EFAC', text: '#15803D' },
  { name: 'Spring Lime', bg: '#ECFCCB', border: '#BEF264', text: '#3F6212' },
  { name: 'Soft Orchid', bg: '#FAE8FF', border: '#F0ABFC', text: '#86198F' },
  { name: 'Ice Periwinkle', bg: '#E0E7FF', border: '#C7D2FE', text: '#3730A3' },
  { name: 'Glacier Blue', bg: '#F0FDFE', border: '#A5F3FC', text: '#155E75' },
  { name: 'Steel Slate', bg: '#F1F5F9', border: '#94A3B8', text: '#334155' },
  { name: 'Zinc Mist', bg: '#F4F4F5', border: '#A1A1AA', text: '#27272A' },
];

const DEPARTMENTS = [
  { code: 'CIVIL', label: 'CIVIL Engineering' },
  { code: 'MECH', label: 'Mechanical Engineering' },
  { code: 'ECE', label: 'Electronics & Communication Engineering' },
  { code: 'EEE', label: 'Electrical & Electronics Engineering' },
  { code: 'CSE', label: 'Computer Science Engineering' },
  { code: 'IT', label: 'Information Technology' },
  { code: 'AI&DS', label: 'Artificial Intelligence & Data Science' },
  { code: 'AIML', label: 'Artificial Intelligence & Machine Learning' },
  { code: 'S&H', label: 'Science & Humanities' },
];

const SEMESTERS = [
  { value: 1, label: 'Sem 1', year: 1 },
  { value: 2, label: 'Sem 2', year: 1 },
  { value: 3, label: 'Sem 3', year: 2 },
  { value: 4, label: 'Sem 4', year: 2 },
  { value: 5, label: 'Sem 5', year: 3 },
  { value: 6, label: 'Sem 6', year: 3 },
  { value: 7, label: 'Sem 7', year: 4 },
  { value: 8, label: 'Sem 8', year: 4 },
];

// Helper to normalize and infer section department
const getSectionDeptCode = (sec: any): string => {
  const raw = String(
    sec?.department_short_name ||
    sec?.department_code ||
    sec?.department?.short_name ||
    sec?.department?.code ||
    sec?.department?.name ||
    sec?.department ||
    sec?.batch_name ||
    sec?.batch?.name ||
    ''
  ).trim().toUpperCase();

  if (raw.includes('AI') && raw.includes('DS')) return 'AI&DS';
  if (raw.includes('AI') && raw.includes('ML')) return 'AIML';
  if (raw.includes('CSE') || raw.includes('COMPUTER')) return 'CSE';
  if (raw.includes('IT') || raw.includes('INFORMATION')) return 'IT';
  if (raw.includes('ECE') || raw.includes('ELECTRONICS')) return 'ECE';
  if (raw.includes('EEE') || raw.includes('ELECTRICAL')) return 'EEE';
  if (raw.includes('MECH') || raw === 'ME' || raw.includes('MECHANICAL')) return 'MECH';
  if (raw.includes('CIVIL') || raw === 'CE') return 'CIVIL';
  if (raw.includes('S&H') || raw.includes('HUMANITIES')) return 'S&H';
  return raw || 'OTHER';
};

const getSectionSemester = (sec: any): number => {
  if (sec.semester !== undefined && sec.semester !== null && !isNaN(Number(sec.semester))) {
    return Number(sec.semester);
  }
  if (sec.year || sec.academic_year) {
    const y = Number(sec.year || sec.academic_year);
    return y * 2; // Default to even sem of that year
  }
  return 0;
};

export default function SpecialPeriodModal({ isOpen, onClose, onAllocationsUpdated }: Props) {
  // Form States
  const [editingAllocationId, setEditingAllocationId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string>('#EFF6FF');
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [selectedSemesters, setSelectedSemesters] = useState<number[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedSectionKeys, setSelectedSectionKeys] = useState<string[]>([]);
  const [selectedMixedSectionKeys, setSelectedMixedSectionKeys] = useState<string[]>([]);

  // Exception Courses
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [availableCourses, setAvailableCourses] = useState<ExceptionCourse[]>([]);
  const [selectedExceptionCourses, setSelectedExceptionCourses] = useState<ExceptionCourse[]>([]);
  const [isSearchingCourses, setIsSearchingCourses] = useState(false);

  // Period Settings
  const [individualPeriods, setIndividualPeriods] = useState(1);
  const [pairedPeriods, setPairedPeriods] = useState(0);

  // Loaded DB data
  const [rawSections, setRawSections] = useState<any[]>([]);
  const [rawMixedSections, setRawMixedSections] = useState<any[]>([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  // Saved Allocations
  const [savedAllocations, setSavedAllocations] = useState<SpecialPeriodAllocation[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');

  // Reset Form
  const resetForm = () => {
    setEditingAllocationId(null);
    setTitle('');
    setColor('#EFF6FF');
    setShowColorPicker(false);
    setSelectedSemesters([]);
    setSelectedDepartments([]);
    setSelectedSectionKeys([]);
    setSelectedMixedSectionKeys([]);
    setSelectedExceptionCourses([]);
    setIndividualPeriods(1);
    setPairedPeriods(0);
  };

  // Fetch sections and mixed sections on mount/open
  useEffect(() => {
    if (!isOpen) {
      resetForm();
      setActiveTab('create');
      return;
    }

    resetForm();
    setActiveTab('create');

    // Load saved allocations from DB
    const loadSpecialPeriods = async () => {
      try {
        const res = await fetchWithAuth('/api/timetable/special-periods/');
        if (res.ok) {
          const data = await res.json();
          const parsed = (data.results || data).map((item: any) => ({
            id: item.frontend_id,
            title: item.title,
            color: item.color || '#EFF6FF',
            selectedSemesters: item.selected_years || [], // mapped to selected_years in DB
            selectedYears: item.selected_years || [],
            selectedDepartments: item.selected_departments || [],
            selectedSectionKeys: item.selected_section_keys || [],
            selectedMixedSectionKeys: item.selected_mixed_section_keys || [],
            exceptionCourses: item.exception_courses || [],
            individualPeriods: item.individual_periods,
            pairedPeriods: item.paired_periods,
            createdAt: item.created_at,
          }));
          setSavedAllocations(parsed);
        }
      } catch (e) {
        console.error('Failed to load saved special periods:', e);
      }
    };
    loadSpecialPeriods();

    const fetchData = async () => {
      setIsLoadingSections(true);
      try {
        const [secRes, mixedRes] = await Promise.all([
          fetchWithAuth('/api/academics/sections/?page_size=0'),
          fetchWithAuth('/api/academics/mixed-sections/?page_size=0'),
        ]);

        if (secRes.ok) {
          const sData = await secRes.json();
          setRawSections(sData.results || sData || []);
        }

        if (mixedRes.ok) {
          const mData = await mixedRes.json();
          setRawMixedSections(mData.results || mData || []);
        }
      } catch (err) {
        console.error('Error loading sections for special period:', err);
      } finally {
        setIsLoadingSections(false);
      }
    };

    fetchData();
  }, [isOpen]);

  // Load all curriculum courses (including electives) for exception course search
  useEffect(() => {
    if (!isOpen) return;

    const fetchCourses = async () => {
      setIsSearchingCourses(true);
      try {
        const [deptRes, masterRes, electiveRes] = await Promise.all([
          fetchWithAuth('/api/curriculum/department/?page_size=0'),
          fetchWithAuth('/api/curriculum/master/?page_size=0'),
          fetchWithAuth('/api/curriculum/elective/?page_size=0'),
        ]);

        const courseMap = new Map<string, ExceptionCourse>();

        if (deptRes.ok) {
          const dData = await deptRes.json();
          const list = dData.results || dData || [];
          list.forEach((item: any) => {
            const code = String(item.course_code || item.code || '').trim();
            const name = String(item.course_name || item.name || '').trim();
            if (code || name) {
              const key = `${code}-${name}`.toUpperCase();
              if (!courseMap.has(key)) {
                courseMap.set(key, { id: item.id || key, course_code: code || 'N/A', course_name: name || 'Unnamed Course' });
              }
            }
          });
        }

        if (masterRes.ok) {
          const mData = await masterRes.json();
          const list = mData.results || mData || [];
          list.forEach((item: any) => {
            const code = String(item.course_code || item.mnemonic || item.code || '').trim();
            const name = String(item.course_name || item.name || '').trim();
            if (code || name) {
              const key = `${code}-${name}`.toUpperCase();
              if (!courseMap.has(key)) {
                courseMap.set(key, { id: item.id || key, course_code: code || 'N/A', course_name: name || 'Unnamed Course' });
              }
            }
          });
        }

        if (electiveRes.ok) {
          const eData = await electiveRes.json();
          const list = eData.results || eData || [];
          list.forEach((item: any) => {
            const code = String(item.course_code || item.elective_code || item.code || '').trim();
            const name = String(item.course_name || item.elective_name || item.name || '').trim();
            if (code || name) {
              const key = `${code}-${name}`.toUpperCase();
              if (!courseMap.has(key)) {
                courseMap.set(key, { id: item.id || key, course_code: code || 'N/A', course_name: name || 'Unnamed Elective' });
              }
            }
          });
        }

        setAvailableCourses(Array.from(courseMap.values()));
      } catch (err) {
        console.error('Error loading curriculum courses:', err);
      } finally {
        setIsSearchingCourses(false);
      }
    };

    fetchCourses();
  }, [isOpen]);

  // Section Key Helpers
  const formatSectionKey = (sec: any) => {
    return `${sec.year || sec.academic_year || ''}-${sec.department_short_name || sec.department || ''}-${sec.name || sec.section_name || ''}-${sec.id}`;
  };

  const formatMixedSectionKey = (m: any) => {
    return `mixed-${m.id}-${m.name}`;
  };

  // Filtered available sections based on selected semesters and departments
  const availableRegularSections = rawSections.filter((sec) => {
    const sem = getSectionSemester(sec);
    const d = getSectionDeptCode(sec);

    const semMatch = selectedSemesters.length === 0 || selectedSemesters.includes(sem);
    const deptMatch = selectedDepartments.length === 0 || selectedDepartments.some((selD) => d.includes(selD.toUpperCase()) || selD.toUpperCase().includes(d));
    return semMatch && deptMatch;
  });

  const availableMixedSectionsList = rawMixedSections.filter((m) => {
    const sem = getSectionSemester(m);
    const semMatch = selectedSemesters.length === 0 || selectedSemesters.includes(sem);
    return semMatch;
  });

  // Group sections by Semester -> Department
  const segregatedSectionsBySemAndDept = (() => {
    const semMap = new Map<number, Map<string, any[]>>();

    availableRegularSections.forEach((sec) => {
      const sem = getSectionSemester(sec);
      const dept = getSectionDeptCode(sec);

      if (!semMap.has(sem)) {
        semMap.set(sem, new Map<string, any[]>());
      }
      const deptMap = semMap.get(sem)!;
      if (!deptMap.has(dept)) {
        deptMap.set(dept, []);
      }
      deptMap.get(dept)!.push(sec);
    });

    return semMap;
  })();

  // Semester Toggles
  const toggleSemester = (sem: number) => {
    setSelectedSemesters((prev) =>
      prev.includes(sem) ? prev.filter((s) => s !== sem) : [...prev, sem]
    );
  };

  const selectAllSemesters = () => setSelectedSemesters(SEMESTERS.map((s) => s.value));
  const deselectAllSemesters = () => setSelectedSemesters([]);

  // Dept Toggles
  const toggleDepartment = (code: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const selectAllDepartments = () => setSelectedDepartments(DEPARTMENTS.map((d) => d.code));
  const deselectAllDepartments = () => setSelectedDepartments([]);

  // Section Toggles
  const toggleSection = (key: string) => {
    setSelectedSectionKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllSections = () => {
    const keys = availableRegularSections.map(formatSectionKey);
    setSelectedSectionKeys(keys);
  };

  const deselectAllSections = () => setSelectedSectionKeys([]);

  // Toggle all sections in a specific Semester + Dept group
  const toggleGroupSections = (sectionsInGroup: any[]) => {
    const groupKeys = sectionsInGroup.map(formatSectionKey);
    const allSelected = groupKeys.every((k) => selectedSectionKeys.includes(k));
    if (allSelected) {
      setSelectedSectionKeys((prev) => prev.filter((k) => !groupKeys.includes(k)));
    } else {
      setSelectedSectionKeys((prev) => Array.from(new Set([...prev, ...groupKeys])));
    }
  };

  // Mixed Section Toggles
  const toggleMixedSection = (key: string) => {
    setSelectedMixedSectionKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Exception Course Actions
  const filteredSearchCourses = availableCourses.filter((c) => {
    if (!courseSearchQuery.trim()) return false;
    const q = courseSearchQuery.toLowerCase();
    return (
      (c.course_code && c.course_code.toLowerCase().includes(q)) ||
      (c.course_name && c.course_name.toLowerCase().includes(q))
    );
  });

  const addExceptionCourse = (course: ExceptionCourse) => {
    if (!selectedExceptionCourses.some((c) => c.id === course.id || (c.course_code === course.course_code && c.course_name === course.course_name))) {
      setSelectedExceptionCourses((prev) => [...prev, course]);
    }
    setCourseSearchQuery('');
  };

  const removeExceptionCourse = (id: number | string) => {
    setSelectedExceptionCourses((prev) => prev.filter((c) => c.id !== id));
  };

  // Edit Existing Allocation
  const handleEditAllocation = (alloc: SpecialPeriodAllocation) => {
    setEditingAllocationId(alloc.id);
    setTitle(alloc.title);
    setColor(alloc.color || '#EFF6FF');
    setShowColorPicker(false);
    setSelectedSemesters(alloc.selectedSemesters || alloc.selectedYears || []);
    setSelectedDepartments(alloc.selectedDepartments || []);
    setSelectedSectionKeys(alloc.selectedSectionKeys || []);
    setSelectedMixedSectionKeys(alloc.selectedMixedSectionKeys || []);
    setSelectedExceptionCourses(alloc.exceptionCourses || []);
    setIndividualPeriods(alloc.individualPeriods !== undefined ? alloc.individualPeriods : 1);
    setPairedPeriods(alloc.pairedPeriods !== undefined ? alloc.pairedPeriods : 0);
    setActiveTab('create');
  };

  // Save Allocation Handler
  const handleSaveAllocation = async () => {
    if (!title.trim()) {
      alert('Please provide a title for the Special Period.');
      return;
    }

    const payload = {
      title: title.trim(),
      color: color || '#EFF6FF',
      selected_years: selectedSemesters, // Save selected semesters into selected_years JSONField
      selected_departments: selectedDepartments,
      selected_section_keys: selectedSectionKeys,
      selected_mixed_section_keys: selectedMixedSectionKeys,
      exception_courses: selectedExceptionCourses,
      individual_periods: Math.max(0, individualPeriods || 0),
      paired_periods: Math.max(0, pairedPeriods || 0),
    };

    let updated: SpecialPeriodAllocation[];
    if (editingAllocationId) {
      try {
        const res = await fetchWithAuth(`/api/timetable/special-periods/${editingAllocationId}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("Failed to update special period", err);
          alert("Failed to update special period: " + err);
          return;
        }
        updated = savedAllocations.map((a) =>
          a.id === editingAllocationId
            ? {
                ...a,
                title: title.trim(),
                color: color || '#EFF6FF',
                selectedSemesters,
                selectedYears: selectedSemesters,
                selectedDepartments,
                selectedSectionKeys,
                selectedMixedSectionKeys,
                exceptionCourses: selectedExceptionCourses,
                individualPeriods: Math.max(0, individualPeriods || 0),
                pairedPeriods: Math.max(0, pairedPeriods || 0),
              }
            : a
        );
      } catch (e) {
        console.error("Failed to update special period", e);
        return;
      }
    } else {
      const frontendId = `special-period-${Date.now()}`;
      try {
        const res = await fetchWithAuth(`/api/timetable/special-periods/`, {
          method: 'POST',
          body: JSON.stringify({
            frontend_id: frontendId,
            ...payload
          })
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("Failed to create special period", err);
          alert("Failed to create special period: " + err);
          return;
        }
        const newAllocation: SpecialPeriodAllocation = {
          id: frontendId,
          title: title.trim(),
          color: color || '#EFF6FF',
          selectedSemesters,
          selectedYears: selectedSemesters,
          selectedDepartments,
          selectedSectionKeys,
          selectedMixedSectionKeys,
          exceptionCourses: selectedExceptionCourses,
          individualPeriods: Math.max(0, individualPeriods || 0),
          pairedPeriods: Math.max(0, pairedPeriods || 0),
          createdAt: new Date().toISOString(),
        };
        updated = [newAllocation, ...savedAllocations];
      } catch (e) {
         console.error("Failed to create special period", e);
         return;
      }
    }

    setSavedAllocations(updated);
    if (onAllocationsUpdated) {
      onAllocationsUpdated(updated);
    }
    resetForm();
    setActiveTab('list');
  };

  // Delete Allocation
  const handleDeleteAllocation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Special Period?')) return;
    try {
      const res = await fetchWithAuth(`/api/timetable/special-periods/${id}/`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        console.error("Failed to delete special period");
      }
    } catch (e) {
      console.error("Failed to delete special period", e);
    }
    const updated = savedAllocations.filter((a) => a.id !== id);
    setSavedAllocations(updated);
    if (onAllocationsUpdated) {
      onAllocationsUpdated(updated);
    }
  };

  if (!isOpen) return null;

  const totalSelectedSections = selectedSectionKeys.length + selectedMixedSectionKeys.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden border border-gray-200 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-700 via-emerald-700 to-cyan-800 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-xs">
              <Sparkles size={22} className="text-teal-200" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Special Period Allocation</h2>
              <p className="text-xs text-teal-100 mt-0.5">
                Configure special periods with custom period counts & exceptions (allocated randomly per section without cross-section locking)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 pt-3">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-6 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'create'
                ? 'border-teal-600 text-teal-700 bg-white rounded-t-lg shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Plus size={16} />
            {editingAllocationId ? 'Edit Special Period' : 'Create Special Period'}
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`px-6 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'list'
                ? 'border-teal-600 text-teal-700 bg-white rounded-t-lg shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Layers size={16} />
            Saved Special Periods ({savedAllocations.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'create' ? (
            <div className="space-y-6">

              {/* Special Period Title & Color Palette */}
              <div className="bg-teal-50/50 p-4 rounded-xl border border-teal-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-teal-900 uppercase tracking-wider mb-1.5">
                      Special Period Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Placement Training, Seminar, Value Added Course, Library..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg border border-teal-200 focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-white text-sm font-semibold"
                    />
                  </div>

                  {/* Color Selector */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-teal-900 uppercase tracking-wider mb-1.5">
                      Chart Highlight Color
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-teal-200 bg-white hover:bg-teal-50 text-xs font-bold text-gray-700 shadow-2xs transition-all"
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-gray-400/40 shadow-xs inline-block"
                          style={{ backgroundColor: color }}
                        />
                        <span>{SPECIAL_PASTEL_COLOR_PALETTE.find((c) => c.bg === color)?.name || 'Custom Color'}</span>
                      </button>
                    </div>

                    {showColorPicker && (
                      <div className="absolute right-0 mt-2 z-30 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 space-y-2 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between border-b pb-1.5">
                          <span className="text-xs font-bold text-gray-700">Pick Chart Highlight Color</span>
                          <button
                            type="button"
                            onClick={() => setShowColorPicker(false)}
                            className="text-gray-400 hover:text-gray-600 p-0.5 rounded-sm"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto p-1">
                          {SPECIAL_PASTEL_COLOR_PALETTE.map((pal) => {
                            const isSelected = color === pal.bg;
                            return (
                              <button
                                key={pal.name}
                                type="button"
                                onClick={() => {
                                  setColor(pal.bg);
                                  setShowColorPicker(false);
                                }}
                                style={{ backgroundColor: pal.bg, borderColor: isSelected ? pal.text : pal.border }}
                                className={`p-2 rounded-lg border text-left flex flex-col justify-between h-14 transition-all hover:scale-105 ${
                                  isSelected ? 'ring-2 ring-teal-600 shadow-md font-bold' : 'shadow-2xs'
                                }`}
                              >
                                <span className="text-[10px] leading-tight font-bold" style={{ color: pal.text }}>
                                  {pal.name}
                                </span>
                                <span className="w-3 h-3 rounded-full border border-black/10 self-end" style={{ backgroundColor: pal.border }} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 1: Target Semesters */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">1</span>
                    Target Semesters
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button onClick={selectAllSemesters} className="text-teal-600 hover:underline font-semibold">Select All</button>
                    <span>•</span>
                    <button onClick={deselectAllSemesters} className="text-gray-500 hover:underline font-semibold">Clear</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                  {SEMESTERS.map((sem) => {
                    const isSelected = selectedSemesters.includes(sem.value);
                    return (
                      <button
                        key={sem.value}
                        type="button"
                        onClick={() => toggleSemester(sem.value)}
                        className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-left">
                          <span className="block">{sem.label}</span>
                          <span className="text-[9px] text-gray-400 font-normal">Yr {sem.year}</span>
                        </div>
                        {isSelected ? <CheckSquare size={15} className="text-teal-600 flex-shrink-0" /> : <Square size={15} className="text-gray-300 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Target Departments */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">2</span>
                    Target Departments
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button onClick={selectAllDepartments} className="text-teal-600 hover:underline font-semibold">Select All</button>
                    <span>•</span>
                    <button onClick={deselectAllDepartments} className="text-gray-500 hover:underline font-semibold">Clear</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DEPARTMENTS.map((dept) => {
                    const isSelected = selectedDepartments.includes(dept.code);
                    return (
                      <button
                        key={dept.code}
                        type="button"
                        onClick={() => toggleDepartment(dept.code)}
                        className={`p-2.5 rounded-lg border text-left text-xs font-semibold flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-teal-50 border-teal-500 text-teal-900 shadow-xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <div className="truncate mr-2">
                          <span className="font-bold">{dept.code}</span>
                          <span className="text-[10px] text-gray-500 block truncate">{dept.label}</span>
                        </div>
                        {isSelected ? <CheckSquare size={16} className="text-teal-600 flex-shrink-0" /> : <Square size={16} className="text-gray-300 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Target Sections Segregated by Semester & Department */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">3</span>
                    Target Sections ({totalSelectedSections} Selected)
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button onClick={selectAllSections} className="text-teal-600 hover:underline font-semibold">Select All Regular</button>
                    <span>•</span>
                    <button onClick={deselectAllSections} className="text-gray-500 hover:underline font-semibold">Clear</button>
                  </div>
                </div>

                {isLoadingSections ? (
                  <p className="text-xs text-gray-400 italic">Loading sections...</p>
                ) : availableRegularSections.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    No sections found for the selected Semesters and Departments.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto p-1 border border-gray-100 rounded-lg">
                    {Array.from(segregatedSectionsBySemAndDept.entries())
                      .sort(([semA], [semB]) => semA - semB)
                      .map(([sem, deptMap]) => (
                        <div key={sem} className="bg-gray-50/70 p-3 rounded-lg border border-gray-200 space-y-2.5">
                          <div className="flex items-center justify-between border-b border-gray-200/80 pb-1.5">
                            <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                              <span className="px-2 py-0.5 bg-teal-100 text-teal-800 rounded font-black text-[11px]">
                                {sem > 0 ? `Semester ${sem}` : 'Other Semester'}
                              </span>
                              <span className="text-gray-500 text-[11px] font-normal">
                                ({Array.from(deptMap.values()).reduce((sum, list) => sum + list.length, 0)} sections)
                              </span>
                            </span>
                          </div>

                          <div className="space-y-2">
                            {Array.from(deptMap.entries())
                              .sort(([deptA], [deptB]) => deptA.localeCompare(deptB))
                              .map(([deptName, sectionsInDept]) => {
                                const groupKeys = sectionsInDept.map(formatSectionKey);
                                const isAllDeptSelected = groupKeys.length > 0 && groupKeys.every((k) => selectedSectionKeys.includes(k));
                                const hasSomeDeptSelected = groupKeys.some((k) => selectedSectionKeys.includes(k));

                                return (
                                  <div key={deptName} className="bg-white p-2.5 rounded-md border border-gray-200 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                                        <span className="text-teal-700">●</span> {deptName}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => toggleGroupSections(sectionsInDept)}
                                        className="text-[10px] text-teal-600 hover:text-teal-800 hover:underline font-semibold"
                                      >
                                        {isAllDeptSelected ? 'Deselect All' : 'Select Dept'}
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                                      {sectionsInDept.map((sec) => {
                                        const key = formatSectionKey(sec);
                                        const isSelected = selectedSectionKeys.includes(key);
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            onClick={() => toggleSection(key)}
                                            className={`p-1.5 rounded border text-left text-xs font-semibold flex items-center justify-between transition-all ${
                                              isSelected
                                                ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold shadow-2xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                          >
                                            <span className="truncate">Section {sec.name || sec.section_name}</span>
                                            {isSelected ? <CheckSquare size={13} className="text-teal-600 flex-shrink-0 ml-1" /> : <Square size={13} className="text-gray-300 flex-shrink-0 ml-1" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Mixed Sections (if available) */}
                {availableMixedSectionsList.length > 0 && (
                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                      Mixed Sections
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {availableMixedSectionsList.map((m) => {
                        const key = formatMixedSectionKey(m);
                        const isSelected = selectedMixedSectionKeys.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleMixedSection(key)}
                            className={`p-2 rounded-lg border text-left text-xs font-semibold flex items-center justify-between transition-all ${
                              isSelected
                                ? 'bg-purple-50 border-purple-500 text-purple-900 font-bold shadow-xs'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <span className="truncate">{m.name} (Mixed)</span>
                            {isSelected ? <CheckSquare size={14} className="text-purple-600 flex-shrink-0" /> : <Square size={14} className="text-gray-300 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 4: Exception Courses */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">4</span>
                    Exception Courses (Exclude from regular timetable)
                  </span>
                  <span className="text-[11px] text-gray-400 font-medium">
                    {selectedExceptionCourses.length} excluded
                  </span>
                </div>

                <div className="relative">
                  <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search courses by code or title to exclude..."
                    value={courseSearchQuery}
                    onChange={(e) => setCourseSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-gray-300 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                  {isSearchingCourses && (
                    <span className="absolute right-3 top-2.5 text-[10px] text-gray-400 italic">Searching...</span>
                  )}
                </div>

                {courseSearchQuery.trim() && (
                  <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto p-1 bg-gray-50 space-y-1">
                    {filteredSearchCourses.length === 0 ? (
                      <p className="text-xs text-gray-400 italic p-2 text-center">No matching courses found</p>
                    ) : (
                      filteredSearchCourses.map((course) => (
                        <div
                          key={course.id}
                          onClick={() => addExceptionCourse(course)}
                          className="p-2 bg-white rounded-md border border-gray-200 hover:bg-teal-50 hover:border-teal-300 cursor-pointer flex items-center justify-between text-xs transition-colors"
                        >
                          <div>
                            <span className="font-bold text-gray-800 mr-2">{course.course_code}</span>
                            <span className="text-gray-600">{course.course_name}</span>
                          </div>
                          <Plus size={14} className="text-teal-600" />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {selectedExceptionCourses.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Selected Exception Courses:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedExceptionCourses.map((c) => (
                        <div
                          key={c.id}
                          className="bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-2 shadow-2xs"
                        >
                          <span>{c.course_code} - {c.course_name}</span>
                          <button
                            type="button"
                            onClick={() => removeExceptionCourse(c.id)}
                            className="text-amber-600 hover:text-amber-800"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 5: Special Period Settings (Individual Single + Paired Block Periods) */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">5</span>
                    Special Period Settings
                  </span>
                  <span className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full font-semibold">
                    Random per section (No cross-section slot locking)
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Specify individual single periods and 2-consecutive period pairs for this special period:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                    <label className="block text-xs font-bold text-gray-700">
                      No of Periods (Individual)
                    </label>
                    <p className="text-[10px] text-gray-500">Single 1-period slots</p>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={individualPeriods}
                      onChange={(e) => setIndividualPeriods(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full px-3 py-1.5 rounded-md border border-gray-300 text-sm font-bold bg-white focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                    <label className="block text-xs font-bold text-gray-700">
                      Pair Periods (Block)
                    </label>
                    <p className="text-[10px] text-gray-500">2-consecutive period pairs (e.g. 2&3)</p>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={pairedPeriods}
                      onChange={(e) => setPairedPeriods(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full px-3 py-1.5 rounded-md border border-gray-300 text-sm font-bold bg-white focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

            </div>
          ) : (
            /* Saved Special Periods Tab */
            <div className="space-y-3">
              {savedAllocations.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300 space-y-3">
                  <Sparkles size={36} className="mx-auto text-gray-400" />
                  <p className="text-sm font-bold text-gray-600">No Special Periods created yet.</p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-bold hover:bg-teal-700 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus size={14} />
                    Create First Special Period
                  </button>
                </div>
              ) : (
                savedAllocations.map((alloc) => (
                  <div
                    key={alloc.id}
                    className="p-4 rounded-xl border border-gray-200 bg-white hover:border-teal-300 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs inline-block"
                          style={{ backgroundColor: alloc.color || '#EFF6FF' }}
                        />
                        <h3 className="font-bold text-base text-gray-900">{alloc.title}</h3>
                        <span className="text-[10px] bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full font-bold">
                          {alloc.individualPeriods} Single + {alloc.pairedPeriods} Pair Block{alloc.pairedPeriods > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          <strong>Semesters:</strong> {alloc.selectedSemesters && alloc.selectedSemesters.length > 0 ? alloc.selectedSemesters.map(s => `Sem ${s}`).join(', ') : (alloc.selectedYears && alloc.selectedYears.length > 0 ? alloc.selectedYears.map(s => `Sem ${s}`).join(', ') : 'All')}
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Depts:</strong> {alloc.selectedDepartments?.join(', ') || 'All'}
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Sections:</strong> {alloc.selectedSectionKeys?.length || 0} mapped
                        </span>
                        {alloc.exceptionCourses?.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-800 font-semibold">
                              <strong>Exceptions:</strong> {alloc.exceptionCourses.length} courses excluded
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditAllocation(alloc)}
                        className="text-teal-700 hover:text-teal-900 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-teal-200"
                        title="Edit special period"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAllocation(alloc.id)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-red-200"
                        title="Delete special period"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold text-sm transition-colors"
          >
            Close
          </button>
          {activeTab === 'create' && (
            <div className="flex items-center gap-2">
              {editingAllocationId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold text-sm transition-colors"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveAllocation}
                className="px-6 py-2.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-bold text-sm shadow-md transition-colors flex items-center gap-2"
              >
                {editingAllocationId ? 'Update Special Period' : 'Save Special Period'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
