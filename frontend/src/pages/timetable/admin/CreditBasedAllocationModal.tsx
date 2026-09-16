import React, { useState, useEffect, useRef } from 'react';
import { X, Save, RefreshCw, Award, Info, Sliders, Plus, Trash2, Layers, BookOpen, Search, ArrowLeft, ArrowRight } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

export interface CreditAllocationMap {
  [creditValue: number]: number;
}

export interface ClassTypeExceptionRule {
  id: string | number; // String for new unsaved, number for saved from DB
  classType: string;
  individualPeriods: number; // Separate single periods (e.g. 3)
  pairedPeriods: number; // Paired 2-consecutive block periods (default 0)
}

export interface CourseExceptionRule {
  id: string | number;
  frontend_id?: string;
  course_id?: string | number;
  course_code: string;
  course_name: string;
  semester?: number | null;
  selected_departments?: string[];
  selected_section_keys?: string[];
  individualPeriods: number;
  pairedPeriods: number;
  individual_periods?: number;
  paired_periods?: number;
}

export interface CurriculumCourseItem {
  id: number | string;
  course_code: string;
  course_name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAllocationsUpdated?: (
    allocations: CreditAllocationMap,
    classTypeExceptions?: ClassTypeExceptionRule[],
    courseExceptions?: CourseExceptionRule[]
  ) => void;
}

const DEFAULT_CREDIT_LEVELS = [1, 2, 3, 4, 5];

const AVAILABLE_CLASS_TYPES = [
  'THEORY',
  'LAB',
  'PRACTICAL',
  'TCPL',
  'TCPR',
  'PURE_LAB',
  'TUTORIAL',
  'PROJECT',
  'SEMINAR',
  'SPECIAL',
];

export default function CreditBasedAllocationModal({ isOpen, onClose, onAllocationsUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<'credit_and_classtype' | 'course_exceptions'>('credit_and_classtype');

  const [creditAllocations, setCreditAllocations] = useState<CreditAllocationMap>({
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
  });

  const [classTypeExceptions, setClassTypeExceptions] = useState<ClassTypeExceptionRule[]>([]);
  const [courseExceptions, setCourseExceptions] = useState<CourseExceptionRule[]>([]);
  const [courseCreditCounts, setCourseCreditCounts] = useState<Record<number, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Course search state for course exception page
  const [availableCourses, setAvailableCourses] = useState<CurriculumCourseItem[]>([]);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [isSearchingCourses, setIsSearchingCourses] = useState(false);

  // Sections & Academics data for section mapping
  const [rawSections, setRawSections] = useState<any[]>([]);
  const [rawMixedSections, setRawMixedSections] = useState<any[]>([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  // Active expanded course exception ID for configuring section mappings
  const [expandedCourseRuleId, setExpandedCourseRuleId] = useState<string | number | null>(null);

  // Debounce ref to prevent multiple rapid saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load sections and mixed sections on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchSections = async () => {
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
        console.error('Error loading sections for exception courses:', err);
      } finally {
        setIsLoadingSections(false);
      }
    };

    fetchSections();
  }, [isOpen]);

  // Load from DB on mount
  useEffect(() => {
    if (!isOpen) return;

    const fetchConfigs = async () => {
      try {
        const [creditRes, classTypeRes, courseExRes] = await Promise.all([
          fetchWithAuth('/api/timetable/credit-allocations/?page_size=0'),
          fetchWithAuth('/api/timetable/class-type-exceptions/?page_size=0'),
          fetchWithAuth('/api/timetable/course-exceptions/?page_size=0'),
        ]);

        if (creditRes.ok) {
          const cData = await creditRes.json();
          const allocationsMap: CreditAllocationMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }; // Defaults
          (cData.results || cData).forEach((item: any) => {
            allocationsMap[item.credit_value] = item.periods;
          });
          setCreditAllocations(allocationsMap);
        }

        if (classTypeRes.ok) {
          const ctData = await classTypeRes.json();
          const rules = (ctData.results || ctData).map((item: any) => ({
            id: item.id,
            classType: item.class_type,
            individualPeriods: item.individual_periods,
            pairedPeriods: item.paired_periods,
          }));
          setClassTypeExceptions(rules);
        }

        if (courseExRes.ok) {
          const ceData = await courseExRes.json();
          const rules = (ceData.results || ceData).map((item: any) => ({
            id: item.frontend_id || item.id,
            frontend_id: item.frontend_id || `course-ex-${item.id}`,
            course_code: item.course_code,
            course_name: item.course_name || '',
            semester: item.semester ?? null,
            selected_departments: item.selected_departments || [],
            selected_section_keys: item.selected_section_keys || [],
            individualPeriods: item.individual_periods ?? 1,
            pairedPeriods: item.paired_periods ?? 0,
          }));
          setCourseExceptions(rules);
        }
      } catch (e) {
        console.error('Failed to load configs from DB:', e);
      } finally {
        setIsDataLoaded(true);
      }
    };

    fetchConfigs();

    // Fetch curriculum courses to calculate course count per credit rating and populate search
    const fetchCurriculumCourses = async () => {
      setIsLoadingCounts(true);
      setIsSearchingCourses(true);
      try {
        const [deptRes, masterRes, electiveRes] = await Promise.all([
          fetchWithAuth('/api/curriculum/department/?page_size=0'),
          fetchWithAuth('/api/curriculum/master/?page_size=0'),
          fetchWithAuth('/api/curriculum/elective/?page_size=0'),
        ]);

        const counts: Record<number, number> = {};
        const courseMap = new Map<string, CurriculumCourseItem>();

        const processList = (list: any[], isElective = false) => {
          list.forEach((item: any) => {
            const cVal = Number(item.c ?? item.credits ?? 0);
            if (cVal > 0) {
              counts[cVal] = (counts[cVal] || 0) + 1;
            }

            const code = String(item.course_code || item.code || item.mnemonic || '').trim();
            const name = String(item.course_name || item.name || '').trim();
            if (code || name) {
              const key = `${code}-${name}`.toUpperCase();
              if (!courseMap.has(key)) {
                courseMap.set(key, {
                  id: item.id || key,
                  course_code: code || 'N/A',
                  course_name: name || (isElective ? 'Unnamed Elective' : 'Unnamed Course'),
                });
              }
            }
          });
        };

        if (deptRes.ok) {
          const dData = await deptRes.json();
          processList(dData.results || dData || []);
        }

        if (masterRes.ok) {
          const mData = await masterRes.json();
          processList(mData.results || mData || []);
        }

        if (electiveRes.ok) {
          const eData = await electiveRes.json();
          processList(eData.results || eData || [], true);
        }

        setCourseCreditCounts(counts);
        setAvailableCourses(Array.from(courseMap.values()));
      } catch (err) {
        console.error('Failed to load curriculum course credit statistics:', err);
      } finally {
        setIsLoadingCounts(false);
        setIsSearchingCourses(false);
      }
    };

    fetchCurriculumCourses();
  }, [isOpen]);

  // Save all configurations directly to DB
  const performSave = async () => {
    setSaveStatus('saving');
    try {
      // 1. Save Credit Allocations
      for (const [creditVal, periods] of Object.entries(creditAllocations)) {
        const res = await fetchWithAuth(`/api/timetable/credit-allocations/?credit_value=${creditVal}`);
        const data = await res.json();
        const existing = (data.results || data).find((item: any) => String(item.credit_value) === String(creditVal));

        if (existing) {
           await fetchWithAuth(`/api/timetable/credit-allocations/${existing.id}/`, {
             method: 'PATCH',
             body: JSON.stringify({ periods }),
           });
        } else {
           await fetchWithAuth(`/api/timetable/credit-allocations/`, {
             method: 'POST',
             body: JSON.stringify({ credit_value: parseInt(creditVal), periods }),
           });
        }
      }

      // 2. Save Class Type Exceptions
      for (const rule of classTypeExceptions) {
        const payload = {
          class_type: rule.classType,
          individual_periods: rule.individualPeriods,
          paired_periods: rule.pairedPeriods
        };

        if (typeof rule.id === 'number') {
          await fetchWithAuth(`/api/timetable/class-type-exceptions/${rule.id}/`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        } else {
          const res = await fetchWithAuth(`/api/timetable/class-type-exceptions/`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const savedRule = await res.json();
            rule.id = savedRule.id;
          }
        }
      }

      // 3. Save Course Exceptions
      for (const cRule of courseExceptions) {
        const fId = String(cRule.frontend_id || cRule.id);
        const payload = {
          frontend_id: fId,
          course_code: cRule.course_code,
          course_name: cRule.course_name,
          semester: cRule.semester ?? null,
          selected_departments: cRule.selected_departments || [],
          selected_section_keys: cRule.selected_section_keys || [],
          individual_periods: cRule.individualPeriods,
          paired_periods: cRule.pairedPeriods,
        };

        // Check if exists
        const res = await fetchWithAuth(`/api/timetable/course-exceptions/${fId}/`);
        if (res.ok) {
          await fetchWithAuth(`/api/timetable/course-exceptions/${fId}/`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        } else {
          await fetchWithAuth(`/api/timetable/course-exceptions/`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return true;
    } catch (e) {
      console.error('Autosave failed', e);
      setSaveStatus('error');
      return false;
    }
  };

  // Auto-save debounced trigger
  useEffect(() => {
    if (!isDataLoaded || !isOpen) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      performSave();
    }, 600);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [creditAllocations, classTypeExceptions, courseExceptions, isDataLoaded, isOpen]);

  if (!isOpen) return null;

  const handlePeriodChange = (creditVal: number, periodVal: number) => {
    setCreditAllocations((prev) => ({
      ...prev,
      [creditVal]: Math.max(1, Math.min(10, periodVal || 1)),
    }));
  };

  const handleResetDefaults = () => {
    const defaults: CreditAllocationMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
    setCreditAllocations(defaults);
  };

  const handleAddExceptionRule = () => {
    const usedTypes = new Set(classTypeExceptions.map((r) => r.classType.toUpperCase()));
    const available = AVAILABLE_CLASS_TYPES.find((t) => !usedTypes.has(t)) || 'THEORY';

    const newRule: ClassTypeExceptionRule = {
      id: `new-${Date.now()}`,
      classType: available,
      individualPeriods: 1,
      pairedPeriods: 0,
    };
    setClassTypeExceptions((prev) => [...prev, newRule]);
  };

  const handleRuleChange = (id: string | number, field: keyof ClassTypeExceptionRule, value: any) => {
    setClassTypeExceptions((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule))
    );
  };

  const handleDeleteRule = async (id: string | number) => {
    if (typeof id === 'number') {
      try {
        await fetchWithAuth(`/api/timetable/class-type-exceptions/${id}/`, {
          method: 'DELETE'
        });
      } catch(e) {
        console.error("Failed to delete rule", e);
      }
    }
    setClassTypeExceptions((prev) => prev.filter((rule) => rule.id !== id));
  };

  // Course Exception Handlers
  const handleAddCourseException = async (course: CurriculumCourseItem) => {
    if (courseExceptions.some((c) => c.course_code.toUpperCase() === course.course_code.toUpperCase())) {
      setCourseSearchQuery('');
      return;
    }

    const frontendId = `course-ex-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const newRule: CourseExceptionRule = {
      id: frontendId,
      frontend_id: frontendId,
      course_code: course.course_code,
      course_name: course.course_name,
      semester: null,
      selected_departments: [],
      selected_section_keys: [],
      individualPeriods: 1,
      pairedPeriods: 0,
    };

    // Direct save to DB
    try {
      await fetchWithAuth(`/api/timetable/course-exceptions/`, {
        method: 'POST',
        body: JSON.stringify({
          frontend_id: frontendId,
          course_code: course.course_code,
          course_name: course.course_name,
          semester: null,
          selected_departments: [],
          selected_section_keys: [],
          individual_periods: 1,
          paired_periods: 0,
        }),
      });
    } catch (err) {
      console.error('Failed to immediately save new course exception:', err);
    }

    setCourseExceptions((prev) => [...prev, newRule]);
    setExpandedCourseRuleId(frontendId);
    setCourseSearchQuery('');
  };

  const handleCourseRuleChange = (id: string | number, field: keyof CourseExceptionRule, value: any) => {
    setCourseExceptions((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule))
    );
  };

  const handleDeleteCourseRule = async (rule: CourseExceptionRule) => {
    const fId = String(rule.frontend_id || rule.id);
    try {
      await fetchWithAuth(`/api/timetable/course-exceptions/${fId}/`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error('Failed to delete course exception', e);
    }
    setCourseExceptions((prev) => prev.filter((r) => r.id !== rule.id));
    if (expandedCourseRuleId === rule.id) {
      setExpandedCourseRuleId(null);
    }
  };

  // Sections processing for Exception Course Section Mapping
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

  const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

  const getAvailableSectionsForRule = (rule: CourseExceptionRule, deptCode: string) => {
    const regular: Array<{ key: string; id: number; name: string; semester: number | null }> = [];
    const mixed: Array<{ key: string; id: number; name: string; semester: number | null }> = [];

    const matchesDept = (deptStr: any) => {
      const norm = String(deptStr || '').toUpperCase().trim();
      if (!norm) return false;
      if (deptCode === 'S&H') return norm.includes('SCIENCE') || norm.includes('S&H') || norm.includes('SH') || norm.includes('HUMANITY') || norm.includes('HUMANITIES');
      if (deptCode === 'AI&DS') return norm.includes('AI') && (norm.includes('DS') || norm.includes('DATA'));
      if (deptCode === 'AIML') return norm.includes('AI') && (norm.includes('ML') || norm.includes('MACHINE'));
      if (deptCode === 'CIVIL') return norm === 'CIVIL' || norm === 'CE' || norm === 'CIV' || norm.includes('CIVIL');
      if (deptCode === 'MECH') return norm === 'MECH' || norm === 'ME' || norm === 'MEC' || norm.includes('MECH') || norm.includes('MECHANICAL');
      return norm.includes(deptCode);
    };

    rawSections.forEach((s: any) => {
      let semNum: number | null = s.semester ? Number(s.semester) : null;
      if (semNum === null && s.year) {
        semNum = Number(s.year) * 2; // Approximate if only year is available
      }

      const secDept = s.department_short_name || s.department_code || s.department?.short_name || s.department?.code || s.batch?.department?.code || s.batch?.department?.short_name || '';
      const secDeptName = s.department?.name || s.batch?.department?.name || '';

      const semMatches = !rule.semester || (semNum !== null && semNum === rule.semester);
      if (semMatches && (matchesDept(secDept) || matchesDept(secDeptName))) {
        const sName = String(s.section_name || s.name || s.label || `Section ${s.id}`);
        const sKey = `sec-${s.id}-${deptCode}-${sName}`;
        regular.push({ key: sKey, id: s.id, name: sName, semester: semNum });
      }
    });

    rawMixedSections.forEach((m: any) => {
      let semNum: number | null = m.semester_number ? Number(m.semester_number) : null;
      if (semNum === null && m.year) {
        semNum = Number(m.year) * 2;
      }

      const mDept = m.batch_department_name || m.batch_department_id || '';
      const semMatches = !rule.semester || (semNum !== null && semNum === rule.semester);
      if (semMatches && (matchesDept(mDept) || matchesDept(m.name))) {
        const mName = String(m.name || `Mixed Section ${m.id}`);
        const mKey = `mixed-${m.id}-${deptCode}-${mName}`;
        mixed.push({ key: mKey, id: m.id, name: mName, semester: semNum });
      }
    });

    return { regular, mixed };
  };

  const handleSave = async () => {
    await performSave();
    if (onAllocationsUpdated) {
      onAllocationsUpdated(creditAllocations, classTypeExceptions, courseExceptions);
    }
    onClose();
  };

  const allCreditLevels = Array.from(
    new Set([...DEFAULT_CREDIT_LEVELS, ...Object.keys(courseCreditCounts).map(Number)])
  ).sort((a, b) => a - b);

  const filteredSearchCourses = availableCourses.filter((course) => {
    if (!courseSearchQuery.trim()) return false;
    const query = courseSearchQuery.toLowerCase();
    const alreadySelected = courseExceptions.some((c) => c.course_code.toUpperCase() === course.course_code.toUpperCase());
    if (alreadySelected) return false;
    return (
      course.course_code.toLowerCase().includes(query) ||
      course.course_name.toLowerCase().includes(query)
    );
  }).slice(0, 10);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100 transition-all">

        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-800 via-indigo-800 to-teal-800 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Award size={22} className="text-purple-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                Credit-Based Period Allocations & Exception Rules
                {saveStatus === 'saving' && <span className="text-[10px] bg-yellow-500/20 text-yellow-200 px-2 py-0.5 rounded-full border border-yellow-500/50">Saving...</span>}
                {saveStatus === 'saved' && <span className="text-[10px] bg-green-500/20 text-green-200 px-2 py-0.5 rounded-full border border-green-500/50">Saved</span>}
              </h2>
              <p className="text-xs text-purple-100/90">
                {activeTab === 'credit_and_classtype'
                  ? 'Configure timetable period generation per Credit rating (C) and Class Type Exception Rules'
                  : 'Configure custom period and block rules for specific Exception Courses (1st Priority)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Top Slider Navigation Button */}
            {activeTab === 'credit_and_classtype' ? (
              <button
                type="button"
                onClick={() => setActiveTab('course_exceptions')}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md hover:shadow-lg border border-amber-400"
                title="Go to Exception Courses page"
              >
                <BookOpen size={14} />
                Exception Courses ({courseExceptions.length})
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('credit_and_classtype')}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all flex items-center gap-1.5 border border-white/30"
                title="Back to Credit & Class Type Allocations"
              >
                <ArrowLeft size={14} />
                Back to Allocations
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white/80 hover:text-white ml-2"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* PAGE 1: Credit & Class Type Exceptions */}
        {activeTab === 'credit_and_classtype' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-6">

            {/* Info Banner */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
              <Info size={20} className="text-purple-600 shrink-0 mt-0.5" />
              <div className="text-xs text-purple-900 leading-relaxed">
                <p className="font-bold text-sm mb-1 text-purple-950">How Period Allocation Priorities Work:</p>
                <p>
                  1. <strong>Exception Courses (Top Priority)</strong>: Specific individual courses set with custom single/paired periods.
                  {courseExceptions.length > 0 && <span className="ml-1 text-amber-700 font-bold">({courseExceptions.length} active rule(s))</span>}
                </p>
                <p className="mt-1">
                  2. <strong>Class Type Exception Module (2nd Priority)</strong>: Custom period rules per Class Type (e.g. TCPL, TCPR, LAB). Specify <strong>Individual Periods</strong> and <strong>Paired Periods (Block)</strong>.
                </p>
                <p className="mt-1">
                  3. <strong>Credit to Period Mapping (3rd Priority)</strong>: Generates default periods based on Credit rating (C).
                </p>
              </div>
            </div>

            {/* TOP SECTION: Class Type Exception Module */}
            <div className="border border-purple-200 rounded-xl overflow-hidden shadow-sm bg-white">
              <div className="bg-gradient-to-r from-purple-100 to-indigo-50 px-4 py-3 border-b border-purple-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-purple-700" />
                  <span className="text-xs font-extrabold text-purple-900 uppercase tracking-wider">
                    Class Type Exception Module
                  </span>
                  <span className="text-[11px] bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                    {classTypeExceptions.length} Rule(s)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddExceptionRule}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3.5 py-1.5 rounded-lg font-bold shadow transition-colors flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  Add Class Type Exception
                </button>
              </div>

              {classTypeExceptions.length === 0 ? (
                <div className="p-8 text-center bg-gray-50/50">
                  <p className="text-xs text-gray-500 font-medium">
                    No class type exceptions added yet.
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Click <strong>"+ Add Class Type Exception"</strong> above to configure specific period & block period rules for class types (e.g., THEORY, LAB, PRACTICAL).
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-purple-900 uppercase bg-purple-50/80 border-b border-purple-100">
                      <tr>
                        <th className="px-4 py-3">Class Type</th>
                        <th className="px-4 py-3">No of Periods (Individual)</th>
                        <th className="px-4 py-3">Paired Periods (Block)</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-100">
                      {classTypeExceptions.map((rule) => (
                        <tr key={rule.id} className="hover:bg-purple-50/40 transition-colors">
                          <td className="px-4 py-3">
                            <select
                              value={rule.classType}
                              onChange={(e) => handleRuleChange(rule.id, 'classType', e.target.value)}
                              className="w-full max-w-[160px] px-3 py-1.5 border border-purple-300 rounded-lg text-xs font-bold text-purple-900 bg-white focus:ring-2 focus:ring-purple-500 shadow-sm"
                            >
                              {AVAILABLE_CLASS_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={10}
                                value={rule.individualPeriods}
                                onChange={(e) =>
                                  handleRuleChange(rule.id, 'individualPeriods', Math.max(0, parseInt(e.target.value, 10) || 0))
                                }
                                className="w-20 px-2.5 py-1.5 border border-purple-300 rounded-lg text-sm font-bold text-center bg-white focus:ring-2 focus:ring-purple-500 shadow-sm"
                              />
                              <span className="text-xs text-gray-600 font-medium">single slot(s)</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={5}
                                value={rule.pairedPeriods}
                                onChange={(e) =>
                                  handleRuleChange(rule.id, 'pairedPeriods', Math.max(0, parseInt(e.target.value, 10) || 0))
                                }
                                className="w-20 px-2.5 py-1.5 border border-purple-300 rounded-lg text-sm font-bold text-center bg-white focus:ring-2 focus:ring-purple-500 shadow-sm"
                              />
                              <span className="text-xs text-gray-600 font-medium">
                                paired block(s) <span className="text-[10px] text-gray-400">(2 consecutive periods e.g. 2&3)</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.id)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Rule"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* BOTTOM SECTION: Credit to Period Mapping Table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={14} className="text-emerald-600" />
                  Credit to Period Mapping
                </span>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="text-xs text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1"
                >
                  <RefreshCw size={12} />
                  Reset Defaults
                </button>
              </div>

              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100/70 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Course Credit (C)</th>
                    <th className="px-4 py-3">Courses Found</th>
                    <th className="px-4 py-3">Default Periods</th>
                    <th className="px-4 py-3">Timetable Periods to Generate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allCreditLevels.map((creditVal) => {
                    const currentPeriods = creditAllocations[creditVal] ?? creditVal;
                    const courseCount = courseCreditCounts[creditVal] || 0;

                    return (
                      <tr key={creditVal} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-900">
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-extrabold border border-emerald-200">
                            {creditVal} {creditVal === 1 ? 'Credit' : 'Credits'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                          {isLoadingCounts ? (
                            <span className="text-gray-400">Counting...</span>
                          ) : (
                            <span>{courseCount} course(s)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-semibold">
                          {creditVal} Period(s)
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={currentPeriods}
                              onChange={(e) => handlePeriodChange(creditVal, parseInt(e.target.value, 10))}
                              className="w-24 px-3 py-1.5 border border-emerald-300 rounded-lg text-sm font-bold text-center bg-white focus:ring-2 focus:ring-emerald-500 shadow-sm"
                            />
                            <span className="text-xs text-gray-600 font-medium">
                              {currentPeriods === 1 ? 'period' : 'periods'} randomly placed
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAGE 2: Exception Courses (1st Priority Page) */}
        {activeTab === 'course_exceptions' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-6">

            {/* Info Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <BookOpen size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <p className="font-bold text-sm mb-1 text-amber-950">Exception Courses Configuration (Priority 1):</p>
                <p>
                  Courses added here take the <strong>highest priority</strong> during timetable generation.
                  If a subject matches an Exception Course, its periods and paired blocks will be generated based on the rule specified below, bypassing Class Type and Credit-based mappings.
                </p>
              </div>
            </div>

            {/* Course Search & Add Box */}
            <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
              <label className="block text-xs font-extrabold text-amber-900 uppercase tracking-wider">
                Search and Add Exception Course
              </label>

              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={courseSearchQuery}
                    onChange={(e) => setCourseSearchQuery(e.target.value)}
                    placeholder="Type course code or name to search curriculum courses..."
                    className="w-full pl-10 pr-4 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white shadow-xs"
                  />
                </div>

                {/* Dropdown Results */}
                {courseSearchQuery.trim() !== '' && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                    {isSearchingCourses ? (
                      <div className="p-3 text-xs text-gray-500">Searching courses...</div>
                    ) : filteredSearchCourses.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500">No courses matching "{courseSearchQuery}"</div>
                    ) : (
                      filteredSearchCourses.map((course) => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => handleAddCourseException(course)}
                          className="w-full text-left px-4 py-2.5 text-xs hover:bg-amber-50 flex items-center justify-between border-b last:border-b-0 border-gray-100 transition-colors"
                        >
                          <div>
                            <span className="font-bold text-gray-900 mr-2">{course.course_code}</span>
                            <span className="text-gray-600 truncate max-w-sm">{course.course_name}</span>
                          </div>
                          <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded font-semibold flex items-center gap-1 shadow-xs">
                            <Plus size={12} /> Add
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Exception Courses Table */}
            <div className="border border-amber-200 rounded-xl overflow-hidden shadow-sm bg-white">
              <div className="bg-gradient-to-r from-amber-100 to-orange-50 px-4 py-3 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-amber-700" />
                  <span className="text-xs font-extrabold text-amber-900 uppercase tracking-wider">
                    Exception Courses List
                  </span>
                  <span className="text-[11px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                    {courseExceptions.length} Course(s)
                  </span>
                </div>
              </div>

              {courseExceptions.length === 0 ? (
                <div className="p-10 text-center bg-gray-50/50">
                  <BookOpen size={28} className="mx-auto text-gray-400 mb-2 opacity-60" />
                  <p className="text-xs text-gray-600 font-semibold">
                    No exception courses configured.
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-md mx-auto">
                    Use the search bar above to select specific courses that require dedicated period and block slot allocations with section mappings.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-amber-100">
                  {courseExceptions.map((cRule) => {
                    const isExpanded = expandedCourseRuleId === cRule.id;
                    const selectedDepts = cRule.selected_departments || [];
                    const selectedSecKeys = cRule.selected_section_keys || [];
                    const hasSectionFilter = (cRule.semester !== null && cRule.semester !== undefined) || selectedDepts.length > 0 || selectedSecKeys.length > 0;

                    return (
                      <div key={cRule.id} className="bg-white">
                        {/* Main Course Row */}
                        <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-amber-50/30 transition-colors">
                          <div className="min-w-[220px]">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-amber-950 text-sm">{cRule.course_code}</span>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                {cRule.semester ? `Semester ${cRule.semester}` : 'All Semesters'}
                              </span>
                            </div>
                            <span className="text-xs text-gray-600 block mt-0.5">{cRule.course_name}</span>

                            {/* Section mapping summary badge */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {selectedDepts.length > 0 ? (
                                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-medium">
                                  Dept: {selectedDepts.join(', ')}
                                </span>
                              ) : (
                                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                                  All Depts
                                </span>
                              )}
                              {selectedSecKeys.length > 0 ? (
                                <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded font-bold">
                                  {selectedSecKeys.length} Section(s) Selected
                                </span>
                              ) : (
                                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                                  All Sections in Dept
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Periods & Paired Controls */}
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] font-bold text-gray-600 uppercase">Individual:</label>
                              <input
                                type="number"
                                min={0}
                                max={10}
                                value={cRule.individualPeriods}
                                onChange={(e) =>
                                  handleCourseRuleChange(cRule.id, 'individualPeriods', Math.max(0, parseInt(e.target.value, 10) || 0))
                                }
                                className="w-16 px-2 py-1 border border-amber-300 rounded text-xs font-bold text-center bg-white focus:ring-2 focus:ring-amber-500 shadow-xs"
                              />
                              <span className="text-xs text-gray-500">slot(s)</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="text-[11px] font-bold text-gray-600 uppercase">Paired Block:</label>
                              <input
                                type="number"
                                min={0}
                                max={5}
                                value={cRule.pairedPeriods}
                                onChange={(e) =>
                                  handleCourseRuleChange(cRule.id, 'pairedPeriods', Math.max(0, parseInt(e.target.value, 10) || 0))
                                }
                                className="w-16 px-2 py-1 border border-amber-300 rounded text-xs font-bold text-center bg-white focus:ring-2 focus:ring-amber-500 shadow-xs"
                              />
                              <span className="text-xs text-gray-500">block(s)</span>
                            </div>

                            {/* Expand Section Mapping Button */}
                            <button
                              type="button"
                              onClick={() => setExpandedCourseRuleId(isExpanded ? null : cRule.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                                isExpanded
                                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                  : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-50'
                              }`}
                            >
                              <Layers size={13} />
                              {isExpanded ? 'Hide Mapping' : 'Map Sections'}
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteCourseRule(cRule)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Course Rule"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Section Mapping Drawer */}
                        {isExpanded && (
                          <div className="bg-amber-50/40 p-4 border-t border-amber-100 space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                                <Layers size={14} className="text-amber-700" />
                                Target Scope Mapping (Semester → Department → Section)
                              </span>
                              <span className="text-[11px] text-gray-500 italic">
                                Timetable generator applies this exception ONLY to matching mapped sections!
                              </span>
                            </div>

                            {/* 1. Semester Selector */}
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1.5">
                                1. Select Semester:
                              </label>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCourseRuleChange(cRule.id, 'semester', null)}
                                  className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                                    cRule.semester === null || cRule.semester === undefined
                                      ? 'bg-amber-600 text-white shadow-xs'
                                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-amber-50'
                                  }`}
                                >
                                  Any Semester
                                </button>
                                {SEMESTERS.map((sem) => (
                                  <button
                                    key={sem}
                                    type="button"
                                    onClick={() => handleCourseRuleChange(cRule.id, 'semester', sem)}
                                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                                      cRule.semester === sem
                                        ? 'bg-amber-600 text-white shadow-xs'
                                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-amber-50'
                                    }`}
                                  >
                                    Semester {sem}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 2. Department Selector */}
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1.5">
                                2. Select Department(s):
                              </label>
                              <div className="flex flex-wrap gap-1.5">
                                {DEPARTMENTS.map((dept) => {
                                  const isSelected = selectedDepts.includes(dept.code);
                                  return (
                                    <button
                                      key={dept.code}
                                      type="button"
                                      onClick={() => {
                                        const newDepts = isSelected
                                          ? selectedDepts.filter((d) => d !== dept.code)
                                          : [...selectedDepts, dept.code];
                                        handleCourseRuleChange(cRule.id, 'selected_departments', newDepts);
                                      }}
                                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                                        isSelected
                                          ? 'bg-blue-600 text-white shadow-xs'
                                          : 'bg-white text-gray-700 border border-gray-200 hover:bg-blue-50'
                                      }`}
                                    >
                                      {dept.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 3. Section Selector (filtered by chosen Depts & Semester) */}
                            {selectedDepts.length > 0 && (
                              <div className="space-y-3 bg-white p-3.5 rounded-xl border border-amber-200 shadow-xs">
                                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                  <label className="block text-[11px] font-bold text-gray-700 uppercase">
                                    3. Select Specific Section(s) (Optional - defaults to all in selected depts):
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const allSecKeys: string[] = [];
                                        selectedDepts.forEach((deptCode) => {
                                          const { regular, mixed } = getAvailableSectionsForRule(cRule, deptCode);
                                          regular.forEach((s) => allSecKeys.push(s.key));
                                          mixed.forEach((m) => allSecKeys.push(m.key));
                                        });
                                        handleCourseRuleChange(cRule.id, 'selected_section_keys', Array.from(new Set([...selectedSecKeys, ...allSecKeys])));
                                      }}
                                      className="text-[11px] font-bold text-blue-600 hover:underline"
                                    >
                                      Select All Sections
                                    </button>
                                    <span className="text-gray-300">|</span>
                                    <button
                                      type="button"
                                      onClick={() => handleCourseRuleChange(cRule.id, 'selected_section_keys', [])}
                                      className="text-[11px] font-bold text-gray-500 hover:underline"
                                    >
                                      Clear All
                                    </button>
                                  </div>
                                </div>

                                {isLoadingSections ? (
                                  <div className="p-3 text-xs text-gray-500">Loading department sections...</div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {selectedDepts.map((deptCode) => {
                                      const { regular, mixed } = getAvailableSectionsForRule(cRule, deptCode);
                                      const deptInfo = DEPARTMENTS.find((d) => d.code === deptCode);

                                      return (
                                        <div key={deptCode} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50/50">
                                          <span className="font-extrabold text-[11px] text-gray-800 uppercase block mb-1.5 border-b border-gray-200 pb-1">
                                            {deptInfo?.label || deptCode}
                                          </span>

                                          {regular.length === 0 && mixed.length === 0 ? (
                                            <span className="text-[11px] text-gray-400 italic">No sections found</span>
                                          ) : (
                                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                              {regular.map((sec) => {
                                                const isChecked = selectedSecKeys.includes(sec.key);
                                                return (
                                                  <label
                                                    key={sec.key}
                                                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                                                      isChecked ? 'bg-amber-100/70 text-amber-950 font-bold' : 'hover:bg-gray-100 text-gray-700'
                                                    }`}
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      onChange={() => {
                                                        const updated = isChecked
                                                          ? selectedSecKeys.filter((k) => k !== sec.key)
                                                          : [...selectedSecKeys, sec.key];
                                                        handleCourseRuleChange(cRule.id, 'selected_section_keys', updated);
                                                      }}
                                                      className="rounded text-amber-600 focus:ring-amber-500"
                                                    />
                                                    <span className="truncate">{sec.name}</span>
                                                    {sec.semester && (
                                                      <span className="text-[10px] text-gray-400 ml-auto font-normal">
                                                        Sem {sec.semester}
                                                      </span>
                                                    )}
                                                  </label>
                                                );
                                              })}

                                              {mixed.map((m) => {
                                                const isChecked = selectedSecKeys.includes(m.key);
                                                return (
                                                  <label
                                                    key={m.key}
                                                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                                                      isChecked ? 'bg-purple-100/70 text-purple-950 font-bold' : 'hover:bg-gray-100 text-gray-700'
                                                    }`}
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      onChange={() => {
                                                        const updated = isChecked
                                                          ? selectedSecKeys.filter((k) => k !== m.key)
                                                          : [...selectedSecKeys, m.key];
                                                        handleCourseRuleChange(cRule.id, 'selected_section_keys', updated);
                                                      }}
                                                      className="rounded text-purple-600 focus:ring-purple-500"
                                                    />
                                                    <span className="truncate">{m.name} (Mixed)</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeTab === 'course_exceptions' && (
              <button
                type="button"
                onClick={() => setActiveTab('credit_and_classtype')}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold text-xs flex items-center gap-1.5"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold text-sm transition-colors"
            >
              Close
            </button>
          </div>

          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors flex items-center gap-2"
          >
            <Save size={16} />
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
