import React, { useState, useEffect } from 'react';
import { X, Search, Plus, Trash2, CheckSquare, Square, Layers, BookOpen, Clock, Copy, Clipboard, Pencil } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

export interface ExceptionCourse {
  id: number | string;
  course_code: string;
  course_name: string;
}

export interface GroupAllocation {
  id: string;
  groupName: string;
  selectedYears: number[];
  selectedDepartments: string[];
  selectedSectionKeys: string[];
  selectedMixedSectionKeys: string[];
  exceptionCourses: ExceptionCourse[];
  blockPeriodEnabled: boolean;
  blockPeriodCount: number;
  createdAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAllocationsUpdated?: (allocations: GroupAllocation[]) => void;
}

const STORAGE_KEY = 'iqac_timetable_group_allocations';
const EXCEPTION_COURSES_CLIPBOARD_KEY = 'iqac_timetable_copied_exception_courses';

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

const YEARS = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: '4th Year' },
];

export default function GroupAllocationModal({ isOpen, onClose, onAllocationsUpdated }: Props) {
  // Form States
  const [editingAllocationId, setEditingAllocationId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedYears, setSelectedYears] = useState<number[]>([2]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedSectionKeys, setSelectedSectionKeys] = useState<string[]>([]);
  const [selectedMixedSectionKeys, setSelectedMixedSectionKeys] = useState<string[]>([]);
  
  // Exception Courses
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [availableCourses, setAvailableCourses] = useState<ExceptionCourse[]>([]);
  const [selectedExceptionCourses, setSelectedExceptionCourses] = useState<ExceptionCourse[]>([]);
  const [isSearchingCourses, setIsSearchingCourses] = useState(false);

  // Block Period
  const [blockPeriodEnabled, setBlockPeriodEnabled] = useState(false);
  const [blockPeriodCount, setBlockPeriodCount] = useState(2);

  // Loaded DB data
  const [rawSections, setRawSections] = useState<any[]>([]);
  const [rawMixedSections, setRawMixedSections] = useState<any[]>([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  // Saved Allocations
  const [savedAllocations, setSavedAllocations] = useState<GroupAllocation[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');

  // Reset Form
  const resetForm = () => {
    setEditingAllocationId(null);
    setGroupName('');
    setSelectedYears([2]);
    setSelectedDepartments([]);
    setSelectedSectionKeys([]);
    setSelectedMixedSectionKeys([]);
    setSelectedExceptionCourses([]);
    setBlockPeriodEnabled(false);
    setBlockPeriodCount(2);
  };

  // Fetch sections and mixed sections on mount/open
  useEffect(() => {
    if (!isOpen) return;

    // Load saved allocations from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSavedAllocations(Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {
      console.error('Failed to load saved group allocations:', e);
    }

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
        console.error('Error loading sections for group allocation:', err);
      } finally {
        setIsLoadingSections(false);
      }
    };

    fetchData();
  }, [isOpen]);

  // Load all curriculum courses for exception course search
  useEffect(() => {
    if (!isOpen) return;

    const fetchCourses = async () => {
      setIsSearchingCourses(true);
      try {
        const [deptRes, masterRes] = await Promise.all([
          fetchWithAuth('/api/curriculum/department/?page_size=0'),
          fetchWithAuth('/api/curriculum/master/?page_size=0'),
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

        setAvailableCourses(Array.from(courseMap.values()));
      } catch (err) {
        console.error('Failed to load courses for exception search:', err);
      } finally {
        setIsSearchingCourses(false);
      }
    };

    fetchCourses();
  }, [isOpen]);

  if (!isOpen) return null;

  // Process sections and mixed sections grouped by department & year
  const getProcessedSections = (deptCode: string) => {
    const regular: Array<{ key: string; id: number; name: string; year: number }> = [];
    const mixed: Array<{ key: string; id: number; name: string; year: number }> = [];

    // Helper to map department
    const matchesDept = (deptStr: any) => {
      const norm = String(deptStr || '').toUpperCase().trim();
      if (!norm) return false;
      if (deptCode === 'S&H') return norm.includes('SCIENCE') || norm.includes('S&H') || norm.includes('SH');
      if (deptCode === 'AI&DS') return norm.includes('AI') && (norm.includes('DS') || norm.includes('DATA'));
      if (deptCode === 'AIML') return norm.includes('AI') && (norm.includes('ML') || norm.includes('MACHINE'));
      return norm.includes(deptCode);
    };

    rawSections.forEach((s: any) => {
      let yearNum = s.year ?? null;
      if (yearNum === null && s.semester) {
        const sem = Number(s.semester);
        if (sem <= 2) yearNum = 1;
        else if (sem <= 4) yearNum = 2;
        else if (sem <= 6) yearNum = 3;
        else yearNum = 4;
      }
      if (yearNum === null) yearNum = 2;

      const secDept = s.department_short_name || s.department_code || s.department?.short_name || s.department?.code || s.batch?.department?.code || '';
      
      if (selectedYears.includes(yearNum) && (matchesDept(secDept) || matchesDept(s.department?.name))) {
        const sName = String(s.section_name || s.name || s.label || `Section ${s.id}`);
        const sKey = `sec-${s.id}-${deptCode}-${sName}`;
        regular.push({ key: sKey, id: s.id, name: sName, year: yearNum });
      }
    });

    rawMixedSections.forEach((m: any) => {
      let yearNum = m.year ?? null;
      if (yearNum === null && m.semester_number) {
        const sem = Number(m.semester_number);
        if (sem <= 2) yearNum = 1;
        else if (sem <= 4) yearNum = 2;
        else if (sem <= 6) yearNum = 3;
        else yearNum = 4;
      }
      if (yearNum === null) yearNum = 2;

      const mDept = m.batch_department_name || m.batch_department_id || '';
      if (selectedYears.includes(yearNum) && (matchesDept(mDept) || matchesDept(m.name))) {
        const mName = String(m.name || `Mixed Section ${m.id}`);
        const mKey = `mixed-${m.id}-${deptCode}-${mName}`;
        mixed.push({ key: mKey, id: m.id, name: mName, year: yearNum });
      }
    });

    return { regular, mixed };
  };

  const toggleYear = (yr: number) => {
    setSelectedYears((prev) =>
      prev.includes(yr) ? prev.filter((y) => y !== yr) : [...prev, yr]
    );
  };

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  const toggleSection = (key: string) => {
    setSelectedSectionKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleMixedSection = (key: string) => {
    setSelectedMixedSectionKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleAddExceptionCourse = (course: ExceptionCourse) => {
    if (!selectedExceptionCourses.some((c) => c.id === course.id)) {
      setSelectedExceptionCourses((prev) => [...prev, course]);
    }
    setCourseSearchQuery('');
  };

  const handleRemoveExceptionCourse = (courseId: number | string) => {
    setSelectedExceptionCourses((prev) => prev.filter((c) => c.id !== courseId));
  };

  const handleCopyExceptionCourses = (coursesToCopy?: ExceptionCourse[]) => {
    const targetList = coursesToCopy || selectedExceptionCourses;
    if (!targetList || targetList.length === 0) {
      alert('No exception courses selected to copy.');
      return;
    }
    try {
      localStorage.setItem(EXCEPTION_COURSES_CLIPBOARD_KEY, JSON.stringify(targetList));
      alert(`Copied ${targetList.length} exception course(s) to clipboard! You can paste them into another group.`);
    } catch (e) {
      console.error('Failed to copy exception courses:', e);
    }
  };

  const handlePasteExceptionCourses = () => {
    try {
      const raw = localStorage.getItem(EXCEPTION_COURSES_CLIPBOARD_KEY);
      if (!raw) {
        alert('No exception courses found in clipboard. Please copy courses first.');
        return;
      }
      const pasted: ExceptionCourse[] = JSON.parse(raw);
      if (!Array.isArray(pasted) || pasted.length === 0) {
        alert('Clipboard is empty.');
        return;
      }

      let addedCount = 0;
      setSelectedExceptionCourses((prev) => {
        const existingIds = new Set(prev.map((c) => String(c.id)));
        const newItems = [...prev];
        pasted.forEach((item) => {
          if (!existingIds.has(String(item.id))) {
            newItems.push(item);
            existingIds.add(String(item.id));
            addedCount++;
          }
        });
        return newItems;
      });

      alert(`Pasted exception courses into group!`);
    } catch (e) {
      console.error('Failed to paste exception courses:', e);
    }
  };

  const handleEditAllocation = (alloc: GroupAllocation) => {
    setEditingAllocationId(alloc.id);
    setGroupName(alloc.groupName);
    setSelectedYears(alloc.selectedYears || [2]);
    setSelectedDepartments(alloc.selectedDepartments || []);
    setSelectedSectionKeys(alloc.selectedSectionKeys || []);
    setSelectedMixedSectionKeys(alloc.selectedMixedSectionKeys || []);
    setSelectedExceptionCourses(alloc.exceptionCourses || []);
    setBlockPeriodEnabled(Boolean(alloc.blockPeriodEnabled));
    setBlockPeriodCount(alloc.blockPeriodCount || 2);
    setActiveTab('create');
  };

  const handleSaveAllocation = () => {
    if (!groupName.trim()) {
      alert('Please enter a valid Group Name.');
      return;
    }

    if (selectedDepartments.length === 0) {
      alert('Please select at least one Department.');
      return;
    }

    let updated: GroupAllocation[] = [];

    if (editingAllocationId) {
      updated = savedAllocations.map((a) =>
        a.id === editingAllocationId
          ? {
              ...a,
              groupName: groupName.trim(),
              selectedYears,
              selectedDepartments,
              selectedSectionKeys,
              selectedMixedSectionKeys,
              exceptionCourses: selectedExceptionCourses,
              blockPeriodEnabled,
              blockPeriodCount: Math.max(1, blockPeriodCount || 2),
            }
          : a
      );
    } else {
      const newAllocation: GroupAllocation = {
        id: `group-alloc-${Date.now()}`,
        groupName: groupName.trim(),
        selectedYears,
        selectedDepartments,
        selectedSectionKeys,
        selectedMixedSectionKeys,
        exceptionCourses: selectedExceptionCourses,
        blockPeriodEnabled,
        blockPeriodCount: Math.max(1, blockPeriodCount || 2),
        createdAt: new Date().toISOString(),
      };
      updated = [newAllocation, ...savedAllocations];
    }

    setSavedAllocations(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save group allocations:', e);
    }

    if (onAllocationsUpdated) {
      onAllocationsUpdated(updated);
    }

    alert(editingAllocationId ? `Group Allocation "${groupName.trim()}" updated!` : `Group Allocation "${groupName.trim()}" saved!`);
    resetForm();
    setActiveTab('list');
  };

  const handleDeleteAllocation = (id: string) => {
    const updated = savedAllocations.filter((a) => a.id !== id);
    setSavedAllocations(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to delete group allocation:', e);
    }
    if (onAllocationsUpdated) {
      onAllocationsUpdated(updated);
    }
  };

  const filteredSearchCourses = courseSearchQuery.trim() === ''
    ? []
    : availableCourses.filter(
        (c) =>
          c.course_code.toLowerCase().includes(courseSearchQuery.toLowerCase()) ||
          c.course_name.toLowerCase().includes(courseSearchQuery.toLowerCase())
      ).slice(0, 10);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Layers size={22} />
              Group Allocation Configuration
            </h2>
            <p className="text-xs text-blue-100 mt-0.5">
              Assign common group names, sections, exception courses, and block periods across timetables
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 gap-4 pt-2">
          <button
            onClick={() => setActiveTab('create')}
            className={`pb-2.5 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'create'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {editingAllocationId ? <Pencil size={14} /> : null}
            {editingAllocationId ? 'Edit Group' : 'Create New Group'}
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'list'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Saved Groups ({savedAllocations.length})
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'create' && (
            <>
              {/* Group Name Field */}
              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-bold text-gray-800">
                    Group Name <span className="text-red-500">*</span>
                  </label>
                  {editingAllocationId && (
                    <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                      Editing Mode
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter Group Name (e.g., German Language / Elective Group A)"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-900 text-sm shadow-sm"
                />
              </div>

              {/* Year Checkboxes */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Select Year(s)
                </label>
                <div className="flex flex-wrap gap-3">
                  {YEARS.map((y) => {
                    const isChecked = selectedYears.includes(y.value);
                    return (
                      <button
                        key={y.value}
                        type="button"
                        onClick={() => toggleYear(y.value)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                          isChecked
                            ? 'bg-blue-600 text-white border-blue-600 shadow'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                        {y.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Department Checkboxes & Inside Sections */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Select Department(s) & Sections / Mixed Sections
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {DEPARTMENTS.map((dept) => {
                    const isDeptChecked = selectedDepartments.includes(dept.code);
                    const { regular, mixed } = getProcessedSections(dept.code);
                    const totalCount = regular.length + mixed.length;

                    return (
                      <div
                        key={dept.code}
                        className={`border rounded-xl p-4 transition-all ${
                          isDeptChecked
                            ? 'border-blue-500 bg-blue-50/20 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <button
                            type="button"
                            onClick={() => toggleDepartment(dept.code)}
                            className="flex items-center gap-2.5 font-bold text-gray-900 text-sm text-left"
                          >
                            <span className={isDeptChecked ? 'text-blue-600' : 'text-gray-400'}>
                              {isDeptChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                            </span>
                            {dept.label} ({dept.code})
                          </button>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                            {totalCount} total
                          </span>
                        </div>

                        {/* Expand Sections if Department Checked */}
                        {isDeptChecked && (
                          <div className="mt-3 pl-6 border-l-2 border-blue-200 space-y-3 pt-1">
                            {/* Regular Sections */}
                            <div>
                              <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                                Regular Sections ({regular.length})
                              </div>
                              {regular.length === 0 ? (
                                <div className="text-xs text-gray-400 italic">No regular sections found for selected year(s)</div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {regular.map((s) => {
                                    const isSecChecked = selectedSectionKeys.includes(s.key);
                                    return (
                                      <button
                                        key={s.key}
                                        type="button"
                                        onClick={() => toggleSection(s.key)}
                                        className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                                          isSecChecked
                                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                        }`}
                                      >
                                        {isSecChecked ? <CheckSquare size={12} /> : <Square size={12} />}
                                        Sec {s.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Mixed Sections */}
                            <div>
                              <div className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-1.5">
                                Mixed Sections ({mixed.length})
                              </div>
                              {mixed.length === 0 ? (
                                <div className="text-xs text-gray-400 italic">No mixed sections found for selected year(s)</div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {mixed.map((m) => {
                                    const isMixedChecked = selectedMixedSectionKeys.includes(m.key);
                                    return (
                                      <button
                                        key={m.key}
                                        type="button"
                                        onClick={() => toggleMixedSection(m.key)}
                                        className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                                          isMixedChecked
                                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                                            : 'bg-purple-50/50 text-purple-900 border-purple-100 hover:bg-purple-100/50'
                                        }`}
                                      >
                                        {isMixedChecked ? <CheckSquare size={12} /> : <Square size={12} />}
                                        {m.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Exception Courses Section */}
              <div className="border border-amber-200 bg-amber-50/30 p-4 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 flex items-center gap-2">
                      <BookOpen size={18} className="text-amber-600" />
                      Exception Courses
                    </label>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Search and add courses that should NOT be scheduled or displayed in member sections' timetables during group periods.
                    </p>
                  </div>

                  {/* Copy Courses & Paste Courses Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyExceptionCourses()}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                      title="Copy current exception courses to clipboard"
                    >
                      <Copy size={14} />
                      Copy Courses
                    </button>
                    <button
                      type="button"
                      onClick={handlePasteExceptionCourses}
                      className="px-3 py-1.5 rounded-lg bg-white text-amber-800 border border-amber-300 hover:bg-amber-100 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                      title="Paste copied exception courses into this group"
                    >
                      <Clipboard size={14} />
                      Paste Courses
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      type="text"
                      value={courseSearchQuery}
                      onChange={(e) => setCourseSearchQuery(e.target.value)}
                      placeholder="Search course by code or course name..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                    />
                  </div>

                  {/* Dropdown Results */}
                  {courseSearchQuery.trim() !== '' && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                      {isSearchingCourses ? (
                        <div className="p-3 text-xs text-gray-500">Searching courses...</div>
                      ) : filteredSearchCourses.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500">No courses matching "{courseSearchQuery}"</div>
                      ) : (
                        filteredSearchCourses.map((course) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => handleAddExceptionCourse(course)}
                            className="w-full text-left px-4 py-2 text-xs hover:bg-amber-50 flex items-center justify-between border-b last:border-b-0 border-gray-100"
                          >
                            <span className="font-bold text-gray-800">{course.course_code}</span>
                            <span className="text-gray-600 truncate max-w-xs">{course.course_name}</span>
                            <Plus size={14} className="text-amber-600 ml-2 flex-shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Exception Courses Container Box */}
                <div className="border border-amber-200/80 bg-white p-4 rounded-xl shadow-xs min-h-[80px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                      Selected Exception Courses ({selectedExceptionCourses.length})
                    </span>
                    {selectedExceptionCourses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedExceptionCourses([])}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {selectedExceptionCourses.length === 0 ? (
                    <div className="text-xs text-gray-400 italic py-3 text-center">
                      No exception courses added yet. Search above or click "Paste Courses".
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedExceptionCourses.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 rounded-full text-xs font-semibold shadow-xs"
                        >
                          {c.course_code} - {c.course_name}
                          <button
                            type="button"
                            onClick={() => handleRemoveExceptionCourse(c.id)}
                            className="hover:bg-amber-200 rounded-full p-0.5 text-amber-800"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Block Period Section */}
              <div className="border border-indigo-200 bg-indigo-50/30 p-4 rounded-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="blockPeriodToggle"
                    checked={blockPeriodEnabled}
                    onChange={(e) => setBlockPeriodEnabled(e.target.checked)}
                    className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                  />
                  <label htmlFor="blockPeriodToggle" className="cursor-pointer">
                    <span className="block text-sm font-bold text-gray-800 flex items-center gap-1.5">
                      <Clock size={16} className="text-indigo-600" />
                      Block Period
                    </span>
                    <span className="block text-xs text-gray-600">
                      Combine consecutive periods (e.g. periods 2,3 & 6,7) into block periods for this group
                    </span>
                  </label>
                </div>

                {blockPeriodEnabled && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-700 whitespace-nowrap">
                      Block Size:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={blockPeriodCount}
                      onChange={(e) => setBlockPeriodCount(parseInt(e.target.value, 10) || 2)}
                      className="w-20 px-3 py-1.5 border border-indigo-300 rounded-lg text-sm font-bold text-center bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'list' && (
            <div className="space-y-4">
              {savedAllocations.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <Layers size={36} className="mx-auto text-gray-400 mb-2" />
                  <p className="font-semibold text-gray-700">No Group Allocations saved yet.</p>
                  <p className="text-xs text-gray-500">Switch to "Create New Group" tab to add one.</p>
                </div>
              ) : (
                savedAllocations.map((alloc) => (
                  <div
                    key={alloc.id}
                    className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900">{alloc.groupName}</h3>
                        {alloc.blockPeriodEnabled && (
                          <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                            Block Period ({alloc.blockPeriodCount})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Years: <strong>{alloc.selectedYears.join(', ')}</strong></span>
                        <span>Depts: <strong>{alloc.selectedDepartments.join(', ') || 'None'}</strong></span>
                        <span>Sections: <strong>{alloc.selectedSectionKeys.length + alloc.selectedMixedSectionKeys.length}</strong></span>
                      </div>
                      {alloc.exceptionCourses.length > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-amber-700">
                            Exception Courses: {alloc.exceptionCourses.map((c) => c.course_code).join(', ')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyExceptionCourses(alloc.exceptionCourses)}
                            className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-semibold flex items-center gap-1 transition-colors"
                            title="Copy exception courses from this group"
                          >
                            <Copy size={11} />
                            Copy
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditAllocation(alloc)}
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-blue-200"
                        title="Edit group allocation"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAllocation(alloc.id)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-red-200"
                        title="Delete group allocation"
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
                className="px-6 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold text-sm shadow-md transition-colors flex items-center gap-2"
              >
                {editingAllocationId ? 'Update Group Allocation' : 'Save Group Allocation'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

