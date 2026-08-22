import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Building2, Search, CheckSquare, Square, Info } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

export interface VenueExceptionCourse {
  id: number | string;
  course_code: string;
  course_name: string;
}

export interface VenueExceptionRule {
  id: string;
  venueName: string;
  courses: VenueExceptionCourse[];
  capacity: number; // Integer: max simultaneous classes/sections that can use this lab venue in the same period
  createdAt?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRulesUpdated?: (rules: VenueExceptionRule[]) => void;
}

export const VENUE_EXCEPTIONS_STORAGE_KEY = 'iqac_timetable_venue_exceptions';

export default function VenueAllocationModal({ isOpen, onClose, onRulesUpdated }: Props) {
  const [rules, setRules] = useState<VenueExceptionRule[]>([]);
  
  // Form states for creating / editing a venue rule
  const [venueName, setVenueName] = useState('');
  const [capacity, setCapacity] = useState<number>(1);
  const [selectedCourses, setSelectedCourses] = useState<VenueExceptionCourse[]>([]);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  
  // Available curriculum courses
  const [availableCourses, setAvailableCourses] = useState<VenueExceptionCourse[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);

  // Load existing rules from localStorage
  useEffect(() => {
    if (!isOpen) return;

    try {
      const stored = localStorage.getItem(VENUE_EXCEPTIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRules(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load venue exceptions:', e);
    }

    // Fetch curriculum courses
    const fetchCourses = async () => {
      setIsLoadingCourses(true);
      try {
        const [deptRes, masterRes] = await Promise.all([
          fetchWithAuth('/api/curriculum/department/?page_size=0'),
          fetchWithAuth('/api/curriculum/master/?page_size=0'),
        ]);

        const rawList: VenueExceptionCourse[] = [];
        const seenKeys = new Set<string>();

        const processList = (items: any[]) => {
          items.forEach((item: any) => {
            const code = (item.course_code || item.code || '').trim().toUpperCase();
            const name = (item.course_name || item.name || '').trim();
            const key = `${code}-${name.toLowerCase()}`;
            if (code && name && !seenKeys.has(key)) {
              seenKeys.add(key);
              rawList.push({
                id: item.id || key,
                course_code: code,
                course_name: name,
              });
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

        rawList.sort((a, b) => a.course_name.localeCompare(b.course_name));
        setAvailableCourses(rawList);
      } catch (err) {
        console.error('Failed to load curriculum courses for venue exceptions:', err);
      } finally {
        setIsLoadingCourses(false);
      }
    };

    fetchCourses();
  }, [isOpen]);

  const handleToggleCourse = (course: VenueExceptionCourse) => {
    setSelectedCourses((prev) => {
      const exists = prev.some(
        (c) => c.course_code.toUpperCase() === course.course_code.toUpperCase()
      );
      if (exists) {
        return prev.filter(
          (c) => c.course_code.toUpperCase() !== course.course_code.toUpperCase()
        );
      } else {
        return [...prev, course];
      }
    });
  };

  const handleAddRule = () => {
    if (selectedCourses.length === 0) {
      alert('Please select at least one course for this venue exception.');
      return;
    }
    const cleanVenueName = venueName.trim() || `${selectedCourses[0].course_name} Venue`;
    const cleanCap = Math.max(1, parseInt(String(capacity), 10) || 1);

    const newRule: VenueExceptionRule = {
      id: `venue-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      venueName: cleanVenueName,
      courses: [...selectedCourses],
      capacity: cleanCap,
      createdAt: new Date().toISOString(),
    };

    const updated = [newRule, ...rules];
    setRules(updated);
    saveRules(updated);

    // Reset inputs
    setVenueName('');
    setCapacity(1);
    setSelectedCourses([]);
    setCourseSearchQuery('');
  };

  const handleDeleteRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    saveRules(updated);
  };

  const handleCapacityChange = (id: string, newCap: number) => {
    const val = Math.max(1, newCap || 1);
    const updated = rules.map((r) => (r.id === id ? { ...r, capacity: val } : r));
    setRules(updated);
    saveRules(updated);
  };

  const saveRules = (newRules: VenueExceptionRule[]) => {
    try {
      localStorage.setItem(VENUE_EXCEPTIONS_STORAGE_KEY, JSON.stringify(newRules));
      if (onRulesUpdated) {
        onRulesUpdated(newRules);
      }
    } catch (e) {
      console.error('Failed to save venue exceptions to localStorage:', e);
    }
  };

  const filteredAvailableCourses = availableCourses.filter((c) => {
    if (!courseSearchQuery.trim()) return true;
    const q = courseSearchQuery.toLowerCase();
    return c.course_code.toLowerCase().includes(q) || c.course_name.toLowerCase().includes(q);
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-sky-800 via-blue-800 to-indigo-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Building2 size={22} className="text-sky-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Venue Exceptions & Laboratory Capacity</h2>
              <p className="text-xs text-sky-100/90">
                Configure simultaneous lab venue availability per course (e.g. 1 Physics Lab, 2 Chemistry Labs)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white/80 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Info Banner */}
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-start gap-3">
            <Info size={20} className="text-sky-600 shrink-0 mt-0.5" />
            <div className="text-xs text-sky-900 leading-relaxed">
              <p className="font-bold text-sm mb-1 text-sky-950">How Venue Exceptions Work:</p>
              <p>
                When generating timetables for multiple sections (e.g., 12 sections having Physics Lab):
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li>
                  If <strong>Availability / Capacity = 1</strong>: Only <strong>1 class</strong> across the entire institute/year can be scheduled for that lab in any single period.
                </li>
                <li>
                  If <strong>Availability / Capacity = 2</strong>: At most <strong>2 classes</strong> can use that lab venue simultaneously in the same period.
                </li>
              </ul>
            </div>
          </div>

          {/* Add New Venue Rule Form */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Plus size={16} className="text-blue-600" />
              Add New Venue Exception Rule
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Venue / Lab Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Physics Laboratory / Computer Lab 1"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Venue Availability / Capacity (Integer) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white font-bold text-blue-900"
                />
                <span className="text-[10px] text-gray-500">Number of simultaneous classes allowed</span>
              </div>
            </div>

            {/* Select Courses */}
            <div className="mt-4">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Select Course(s) using this Venue <span className="text-red-500">*</span>
              </label>

              {/* Selected Chips */}
              {selectedCourses.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5 p-2 bg-white rounded-lg border border-gray-200">
                  {selectedCourses.map((c) => (
                    <span
                      key={c.course_code}
                      className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 text-[11px] font-semibold px-2.5 py-1 rounded-md border border-blue-200"
                    >
                      <span className="font-bold">{c.course_code}:</span> {c.course_name}
                      <button
                        type="button"
                        onClick={() => handleToggleCourse(c)}
                        className="hover:text-red-600 ml-1"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search course code or name (e.g. Physics, PH3151, Chemistry, Workshop)..."
                  value={courseSearchQuery}
                  onChange={(e) => setCourseSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                />
              </div>

              {/* Course Selection List Box */}
              <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto bg-white divide-y divide-gray-100">
                {isLoadingCourses ? (
                  <p className="text-xs text-gray-500 p-4 text-center">Loading courses...</p>
                ) : filteredAvailableCourses.length === 0 ? (
                  <p className="text-xs text-gray-400 p-4 text-center">No courses found matching search.</p>
                ) : (
                  filteredAvailableCourses.slice(0, 100).map((course) => {
                    const isSelected = selectedCourses.some(
                      (c) => c.course_code.toUpperCase() === course.course_code.toUpperCase()
                    );
                    return (
                      <div
                        key={course.course_code + course.course_name}
                        onClick={() => handleToggleCourse(course)}
                        className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/80 font-semibold text-blue-900' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected ? (
                            <CheckSquare size={14} className="text-blue-600 shrink-0" />
                          ) : (
                            <Square size={14} className="text-gray-400 shrink-0" />
                          )}
                          <span className="font-mono font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">
                            {course.course_code}
                          </span>
                          <span>{course.course_name}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Add Button */}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleAddRule}
                disabled={selectedCourses.length === 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs px-4 py-2 rounded-lg font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                Add Venue Exception Rule
              </button>
            </div>
          </div>

          {/* Configured Rules List */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center justify-between">
              <span>Configured Venue Exceptions ({rules.length})</span>
            </h3>

            {rules.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <p className="text-xs text-gray-500 font-medium">
                  No venue exceptions configured yet.
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Add rules above to restrict the maximum number of simultaneous sections in lab venues.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-4 bg-white border border-sky-200 rounded-xl shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-gray-900 bg-sky-50 text-sky-800 px-2.5 py-1 rounded-md border border-sky-200">
                          🏛️ {rule.venueName || 'Laboratory Venue'}
                        </span>
                        <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                          Capacity: {rule.capacity} class{rule.capacity > 1 ? 'es' : ''} at a time
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rule.courses.map((c) => (
                          <span
                            key={c.course_code}
                            className="bg-gray-100 text-gray-700 text-[10px] px-2 py-0.5 rounded font-medium border border-gray-200"
                          >
                            <strong>{c.course_code}:</strong> {c.course_name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-gray-600 font-semibold">Capacity:</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={rule.capacity}
                          onChange={(e) => handleCapacityChange(rule.id, parseInt(e.target.value, 10))}
                          className="w-16 text-xs px-2 py-1 border border-gray-300 rounded font-bold text-center bg-gray-50 focus:bg-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Rule"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-5 py-2.5 rounded-lg font-bold shadow-xs transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
