import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  parseCourseKey,
  getDummiesForFilter,
  getCourseDummiesForAllocation,
  getBundleDummiesForAllocation,
  readMarksStore,
  writeMarksStore,
  getMarksKey,
  assigningUpdateEventName,
  marksUpdateEventName,
  type FacultyAllocation,
  type MarkEntry,
  type PersistedShuffledStudent,
} from '../stores/coeStore';
import { fetchFacultyAllocations } from '../services/assignments';

type CourseBlock = {
  allocation: FacultyAllocation;
  courseCode: string;
  courseName: string;
  bundleName?: string;
  dummies: string[];
  marksKey: string;
};

const MARK_COLUMNS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Total'];

const DEPARTMENT_DUMMY_DIGITS: Record<string, string> = {
  AIDS: '01',
  AIML: '02',
  CE: '03',
  CIVIL: '03',
  CSE: '04',
  ECE: '05',
  EEE: '06',
  IT: '07',
  ME: '08',
  MECH: '08',
};

function createFallbackDummies(department: string, startIndex: number, count: number): string[] {
  const normalizedDepartment = String(department || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const deptDigit = DEPARTMENT_DUMMY_DIGITS[normalizedDepartment] || '00';
  return Array.from({ length: count }, (_, index) => `E256${deptDigit}${String(startIndex + index + 1).padStart(5, '0')}`);
}

export default function MarkEntryPage() {
  const navigate = useNavigate();
  const facultyCode = sessionStorage.getItem('esv-faculty-code') || '';
  const [saving, setSaving] = useState(false);
  const [allocations, setAllocations] = useState<FacultyAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [marksMap, setMarksMap] = useState<Record<string, MarkEntry[]>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [marksRefreshTrigger, setMarksRefreshTrigger] = useState(0);

  // Redirect if no faculty code
  useEffect(() => {
    if (!facultyCode) {
      navigate('/', { replace: true });
    }
  }, [facultyCode, navigate]);

  useEffect(() => {
    if (!facultyCode) {
      navigate('/', { replace: true });
      return;
    }

    let active = true;

    const loadAllocations = async () => {
      setLoadingAllocations(true);
      try {
        const results = await fetchFacultyAllocations(facultyCode);
        if (!active) return;
        setAllocations(results);
      } finally {
        if (active) {
          setLoadingAllocations(false);
        }
      }
    };

    void loadAllocations();

    return () => {
      active = false;
    };
  }, [facultyCode, navigate, refreshTrigger]);

  useEffect(() => {
    const handleRefresh = () => {
      setRefreshTrigger((prev) => prev + 1);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'coe-assigning-v1' || e.key === 'coe-course-bundle-dummies-v1' || e.key === null) {
        handleRefresh();
      }
    };

    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('coe-assigning-updates-v1')
      : null;

    const handleBroadcastMessage = (event: MessageEvent) => {
      if (event.data === 'updated') {
        handleRefresh();
      }
    };

    window.addEventListener(assigningUpdateEventName, handleRefresh);
    window.addEventListener('storage', handleStorageChange);
    channel?.addEventListener('message', handleBroadcastMessage);

    return () => {
      window.removeEventListener(assigningUpdateEventName, handleRefresh);
      window.removeEventListener('storage', handleStorageChange);
      channel?.removeEventListener('message', handleBroadcastMessage);
      channel?.close();
    };
  }, []);

  // Build course blocks with dummy numbers, handling bundles
  const courseBlocks = useMemo<CourseBlock[]>(() => {
    const blocks: CourseBlock[] = [];

    allocations.forEach((alloc) => {
      const parsed = parseCourseKey(alloc.courseKey);
      const courseDummies = getCourseDummiesForAllocation(alloc.department, alloc.semester, alloc.courseKey);

      if (alloc.bundles && alloc.bundles.length > 0) {
        let dummyPointer = 0;
        alloc.bundles.forEach((bundle) => {
          const exactBundleDummies = getBundleDummiesForAllocation(
            alloc.department,
            alloc.semester,
            alloc.courseKey,
            bundle.name
          );
          const courseSlice = courseDummies.slice(dummyPointer, dummyPointer + bundle.scripts);
          const resolved = exactBundleDummies.length > 0
            ? exactBundleDummies
            : courseSlice;
          const bundleDummies = resolved.length > 0
            ? resolved.slice(0, bundle.scripts)
            : createFallbackDummies(parsed.department || alloc.department, dummyPointer, bundle.scripts);

          blocks.push({
            allocation: alloc,
            courseCode: parsed.courseCode,
            courseName: parsed.courseName,
            bundleName: bundle.name,
            dummies: bundleDummies,
            marksKey: getMarksKey(facultyCode, `${alloc.courseKey}::${bundle.name}`),
          });

          dummyPointer += bundle.scripts;
        });
      } else {
        const dummies = courseDummies.length > 0
          ? courseDummies.slice(0, alloc.scripts)
          : createFallbackDummies(parsed.department || alloc.department, 0, alloc.scripts);

        blocks.push({
          allocation: alloc,
          courseCode: parsed.courseCode,
          courseName: parsed.courseName,
          dummies,
          marksKey: getMarksKey(facultyCode, alloc.courseKey),
        });
      }
    });

    return blocks;
  }, [allocations, facultyCode]);

  const loadMarksFromStore = () => {
    const store = readMarksStore();
    const initial: Record<string, MarkEntry[]> = {};
    courseBlocks.forEach((block) => {
      const saved = store[block.marksKey];
      if (saved && saved.length > 0) {
        // Ensure we have entries for all dummies
        const byDummy = new Map(saved.map((e) => [e.dummy, e]));
        initial[block.marksKey] = block.dummies.map((d) => byDummy.get(d) || { dummy: d, marks: Array(5).fill(null) });
      } else {
        initial[block.marksKey] = block.dummies.map((d) => ({ dummy: d, marks: Array(5).fill(null) }));
      }
    });
    setMarksMap(initial);
  };

  // Load marks from store
  useEffect(() => {
    loadMarksFromStore();
  }, [courseBlocks, marksRefreshTrigger]);

  useEffect(() => {
    const handleMarksChange = () => {
      setMarksRefreshTrigger((prev) => prev + 1);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'esv-marks-v1' || e.key === null) {
        handleMarksChange();
      }
    };

    window.addEventListener(marksUpdateEventName, handleMarksChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(marksUpdateEventName, handleMarksChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleMarkChange = (marksKey: string, dummyIdx: number, colIdx: number, value: string) => {
    const num = value === '' ? null : parseInt(value, 10);
    if (num !== null && (isNaN(num) || num < 0 || num > 100)) return;

    setMarksMap((prev) => {
      const entries = [...(prev[marksKey] || [])];
      if (!entries[dummyIdx]) return prev;
      const newMarks = [...entries[dummyIdx].marks];
      newMarks[colIdx] = num;
      entries[dummyIdx] = { ...entries[dummyIdx], marks: newMarks };
      return { ...prev, [marksKey]: entries };
    });
  };

  const getTotal = (marks: (number | null)[]) => {
    const vals = marks.filter((m): m is number => m !== null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
  };

  const handleSave = () => {
    const store = readMarksStore();
    Object.entries(marksMap).forEach(([key, entries]) => {
      store[key] = entries;
    });
    writeMarksStore(store);
    loadMarksFromStore();
    setSaving(true);
    setTimeout(() => setSaving(false), 1200);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('esv-faculty-code');
    navigate('/', { replace: true });
  };

  if (!facultyCode) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-[#6f1d34] via-[#7a2038] to-[#a3462d] border border-[#c8917f]/40 shadow-sm p-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">End Semester Mark Entry</h1>
          <p className="mt-1 text-sm text-white/80">
            Faculty Code: <span className="font-semibold text-white">{facultyCode}</span>
            {' '} &middot; {' '}
            <span className="text-white/70">{loadingAllocations ? 'Loading…' : `${allocations.length} course(s) allocated`}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-white text-[#6f1d34] rounded-lg hover:bg-white/90 disabled:opacity-50 font-semibold text-sm shadow-sm"
          >
            {saving ? 'Saved!' : 'Save'}
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2.5 border border-white/40 bg-white/10 text-white rounded-lg hover:bg-white/20 font-medium text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Allocation summary */}
      {loadingAllocations ? (
        <div className="rounded-xl bg-white/95 border border-[#d9b7ac] p-6">
          <p className="text-sm text-[#6f4a3f]">Loading assignments from COE…</p>
        </div>
      ) : allocations.length === 0 ? (
        <div className="rounded-xl bg-white/95 border border-[#d9b7ac] p-6">
          <p className="text-sm text-[#6f4a3f]">No allocations found. Please contact the COE.</p>
        </div>
      ) : (
        courseBlocks.map((block) => {
          const entries = marksMap[block.marksKey] || [];
          return (
            <div key={block.marksKey} className="rounded-xl bg-white/95 border border-[#d9b7ac] shadow-[0_8px_30px_-12px_rgba(111,29,52,0.25)] p-6 space-y-4">
              {/* Course header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[#5a192f]">{block.courseName || 'Unnamed Course'}</h3>
                    {block.bundleName && (
                      <span className="px-2 py-0.5 rounded-full bg-[#6f1d34] text-white text-[10px] uppercase tracking-wider font-bold">
                        Bundle: {block.bundleName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-[#6f4a3f]">
                    {block.courseCode} | {block.allocation.department} | {block.allocation.semester} | {block.allocation.date}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="rounded-md bg-[#faf4f0] border border-[#d9b7ac] px-3 py-1 text-[#b2472e] font-medium">
                    {block.bundleName ? `Bundle Scripts: ${block.dummies.length}` : `Scripts: ${block.allocation.scripts}`}
                  </span>
                  <span className="rounded-md bg-[#faf4f0] border border-[#d9b7ac] px-3 py-1 text-[#6f4a3f]">
                    Dummies: {block.dummies.length}
                  </span>
                </div>
              </div>

              {/* Mark entry table */}
              {block.dummies.length === 0 ? (
                <p className="text-sm text-[#6f4a3f]">No dummy numbers available. Ensure scripts have been shuffled and saved in COE.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 text-sm">
                    <thead>
                      <tr className="bg-[#faf4f0] border-b border-[#d9b7ac] text-left text-xs font-semibold uppercase tracking-wide text-[#6f4a3f]">
                        <th className="px-3 py-2.5 w-10">#</th>
                        <th className="px-3 py-2.5">Dummy Number</th>
                        {MARK_COLUMNS.map((col) => (
                          <th key={col} className="px-3 py-2.5 text-center w-24">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => {
                        const total = getTotal(entry.marks);
                        return (
                          <tr key={entry.dummy} className="border-b border-[#ead7d0] align-middle hover:bg-[#faf4f0]/60">
                            <td className="px-3 py-2 text-[#a08070] font-medium">{idx + 1}</td>
                            <td className="px-3 py-2 font-semibold text-[#5a192f] font-mono tracking-wider">
                              {entry.dummy}
                            </td>
                            {entry.marks.map((mark, colIdx) => (
                              <td key={colIdx} className="px-2 py-1.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={mark === null ? '' : mark}
                                  onChange={(e) => handleMarkChange(block.marksKey, idx, colIdx, e.target.value)}
                                  className="w-16 rounded-md border border-[#d9b7ac] px-2 py-1.5 text-sm text-center focus:border-[#b2472e] focus:outline-none focus:ring-1 focus:ring-[#d67d55]/30"
                                  placeholder="—"
                                />
                              </td>
                            ))}
                            {/* Total column */}
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-block w-16 rounded-md px-2 py-1.5 text-sm font-semibold text-center ${total !== null ? 'bg-[#faf4f0] text-[#b2472e] border border-[#d9b7ac]' : 'text-[#a08070]'}`}>
                                {total !== null ? total : '—'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
