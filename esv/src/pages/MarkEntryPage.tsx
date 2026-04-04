import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BarScanMarkEntry from '../components/BarScanMarkEntry';
import { getQuestions, type QpType } from '../stores/qpStore';
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

// Interconnected with COE: Dummy lookup and Questions format
function getQpTypeForCourse(courseKey: string): QpType {
  // Common pattern in this project: TCPL/TCPR for Lab courses, OE for Electives, others QP1/QP2
  const key = courseKey.toUpperCase();
  if (key.includes('LAB') || key.includes('PRACTICAL')) return 'TCPR';
  if (key.includes('ELECTIVE')) return 'OE';
  return 'QP1';
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

  // Barcode Scan Overlay State
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scanBuffer, setScanBuffer] = useState('');
  const lastKeyTimeRef = useRef<number>(0);

  // Active student for overlay when clicking hyperlink
  const [activeEntryParams, setActiveEntryParams] = useState<{
    code: string;
    qpType: QpType;
    dept: string;
    sem: string;
  } | null>(null);

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

    // IDCS-SYNC BUS (for cross-portal updates)
    const syncChannel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('idcs-marks-sync')
      : null;

    const handleSyncMessage = (event: MessageEvent) => {
      const { type, facultyCode: receivedFacultyCode } = event.data;
      if (type === 'RESET_FACULTY_DATA' && receivedFacultyCode === facultyCode) {
        console.warn('RELOAD_REQUIRED: ESV Reset approved by COE. Clearing local data and refreshing UI.');
        
        // 1. Clear marks from local storage that match the facultyCode
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(`idcs-marks-v1-${facultyCode}-`)) {
            localStorage.removeItem(key);
            console.log(`Cleared local key: ${key}`);
          }
        });

        // 2. Clear marks from memory
        setMarksMap({});
        
        // 3. Trigger UI Refresh
        setRefreshTrigger(prev => prev + 1);
        setMarksRefreshTrigger(prev => prev + 1);

        window.alert('SYSTEM: COE has approved your reset request. All your local valuation data has been cleared. You may now start fresh.');
      }
    };

    syncChannel?.addEventListener('message', handleSyncMessage);

    return () => {
      window.removeEventListener(assigningUpdateEventName, handleRefresh);
      window.removeEventListener('storage', handleStorageChange);
      channel?.removeEventListener('message', handleBroadcastMessage);
      channel?.close();
      syncChannel?.removeEventListener('message', handleSyncMessage);
      syncChannel?.close();
    };
  }, [facultyCode]);

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
            : []; // No fallback dummies needed if we're not manually typing

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
          : [];

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
      const qpType = getQpTypeForCourse(block.allocation.courseKey);
      const questions = getQuestions(qpType);
      const maxCols = questions.length;

      const saved = store[block.marksKey];
      if (saved && saved.length > 0) {
        // Ensure we have entries for all dummies
        const byDummy = new Map(saved.map((e) => [e.dummy, e]));
        initial[block.marksKey] = block.dummies.map((d) => {
          const entry = byDummy.get(d) || { dummy: d, marks: Array(maxCols).fill(null) };
          // If the question format changed (interconnected with COE), normalize the marks array
          if (entry.marks.length !== maxCols) {
            const newMarks = Array(maxCols).fill(null);
            entry.marks.slice(0, maxCols).forEach((m, i) => { newMarks[i] = m; });
            entry.marks = newMarks;
          }
          return entry;
        });
      } else {
        initial[block.marksKey] = block.dummies.map((d) => ({ dummy: d, marks: Array(maxCols).fill(null) }));
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
      if (e.key === 'esv-marks-v1' || e.key === null || e.key.startsWith('marks_')) {
        handleMarksChange();
      }
    };

    window.addEventListener(marksUpdateEventName, handleMarksChange);
    window.addEventListener('esv-marks-updated', handleMarksChange);
    window.addEventListener('storage', handleStorageChange);

    // Sync with other open tabs/windows (COE/ESV)
    const bc = new BroadcastChannel('idcs-marks-sync');
    bc.onmessage = (ev) => {
       if (ev.data?.type === 'UPDATE') {
          handleMarksChange();
       }
    };

    return () => {
      window.removeEventListener(marksUpdateEventName, handleMarksChange);
      window.removeEventListener('esv-marks-updated', handleMarksChange);
      window.removeEventListener('storage', handleStorageChange);
      bc.close();
    };
  }, []);

  // Global Keydown Listener for Barcode Scanning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTimeRef.current > 50) {
        setScanBuffer('');
      }
      lastKeyTimeRef.current = currentTime;

      if (e.key === 'Enter') {
        if (scanBuffer.length > 5) {
          e.preventDefault();
          setScannedCode(scanBuffer);
          setScanBuffer('');
        }
      } else if (e.key.length === 1) {
        setScanBuffer(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scanBuffer]);

  const handleMarkChange = (marksKey: string, dummyIdx: number, colIdx: number, value: string, max: number) => {
    const num = value === '' ? null : parseInt(value, 10);
    if (num !== null && (isNaN(num) || num < 0 || num > max)) return;

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
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : 0;
  };

  const handleSave = () => {
    const store = readMarksStore();
    Object.entries(marksMap).forEach(([key, entries]) => {
      store[key] = entries;
    });
    writeMarksStore(store);
    setSaving(true);
    setTimeout(() => setSaving(false), 1200);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('esv-faculty-code');
    navigate('/', { replace: true });
  };

  if (!facultyCode) return null;

  if (scannedCode || activeEntryParams) {
    const codeToUse = scannedCode || activeEntryParams?.code || '';
    const qpTypeToUse = activeEntryParams?.qpType;
    const deptToUse = activeEntryParams?.dept;
    const semToUse = activeEntryParams?.sem;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-50 flex flex-col items-center justify-start p-4 sm:p-8">
        <BarScanMarkEntry 
          embeddedCode={codeToUse}
          embeddedQpType={qpTypeToUse}
          embeddedDept={deptToUse}
          embeddedSem={semToUse}
          onClose={() => { 
            setScannedCode(null); 
            setActiveEntryParams(null);
            setMarksRefreshTrigger(p=>p+1); 
          }}
          onNextScan={(code) => { 
            setScannedCode(code); 
            setActiveEntryParams(null);
          }}
        />
      </div>
    );
  }

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

      <div className="bg-white/80 backdrop-blur-sm border border-[#ead7d0] rounded-xl p-4 flex items-center gap-3 shadow-inner">
        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
        <p className="text-xs font-bold tracking-tight text-[#5a192f] uppercase italic">Scanner Active: Ready for barcode input</p>
      </div>

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
          const qpType = getQpTypeForCourse(block.allocation.courseKey);
          const questions = getQuestions(qpType);

          return (
            <div key={block.marksKey} className="rounded-xl bg-white/95 border border-[#d9b7ac] shadow-[0_8px_30px_-12px_rgba(111,29,52,0.25)] p-6 space-y-4">
              {/* Course header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[#5a192f]">{block.courseName || 'Unnamed Course'}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-[#6f1d34] text-white text-[10px] uppercase tracking-wider font-bold">
                        Type: {qpType}
                    </span>
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
                    Progress: {entries.filter(e => getTotal(e.marks) > 0).length} / {block.dummies.length}
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
                        {questions.map((q) => (
                          <th key={q.key} className="px-3 py-2.5 text-center w-20">
                            {q.label}
                            <span className="block text-[10px] opacity-60 normal-case">(Max {q.max})</span>
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-center w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => {
                        const total = getTotal(entry.marks);
                        return (
                          <tr key={entry.dummy} className="border-b border-[#ead7d0] align-middle hover:bg-[#faf4f0]/60">
                            <td className="px-3 py-2 text-[#a08070] font-medium">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  setActiveEntryParams({
                                    code: entry.dummy,
                                    qpType: qpType,
                                    dept: block.allocation.department,
                                    sem: block.allocation.semester,
                                  });
                                }}
                                className="font-semibold text-[#6f1d34] font-mono tracking-wider hover:underline text-left"
                                title="Click to open Barcode Mark Entry"
                              >
                                {entry.dummy}
                              </button>
                            </td>
                            {questions.map((q, qIdx) => (
                              <td key={q.key} className="px-2 py-1.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={q.max}
                                  value={entry.marks[qIdx] === null ? '' : entry.marks[qIdx]}
                                  onChange={(e) => handleMarkChange(block.marksKey, idx, qIdx, e.target.value, q.max)}
                                  className="w-14 rounded-md border border-[#d9b7ac] px-1 py-1 text-sm text-center focus:border-[#b2472e] focus:outline-none focus:ring-1 focus:ring-[#d67d55]/30"
                                  placeholder="—"
                                />
                              </td>
                            ))}
                            {/* Total column */}
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-block w-16 rounded-md px-2 py-1 text-sm font-semibold text-center ${total !== null && total > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-[#faf4f0] text-[#a08070] border border-[#d9b7ac]'}`}>
                                {total !== null ? total : '0'}
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
