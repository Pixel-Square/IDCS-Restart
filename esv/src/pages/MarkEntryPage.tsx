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

  // Filter state for search/summary
  const [searchTerm, setSearchTerm] = useState('');

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
          {/* Quick Stats */}
          <div className="hidden md:flex flex-col items-end mr-4 text-white/90">
             <span className="text-xs font-medium uppercase tracking-wider opacity-60">Session Valuation</span>
             <span className="text-lg font-bold leading-none">
                {Object.values(marksMap).flat().filter(e => getTotal(e.marks) > 0).length} 
                <span className="text-sm font-normal opacity-70 ml-1">Papers Done</span>
             </span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-white text-[#6f1d34] rounded-lg hover:bg-white/90 disabled:opacity-50 font-semibold text-sm shadow-sm transition-all active:scale-95"
          >
            {saving ? 'Saved successfully' : 'Save Progress'}
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2.5 border border-white/40 bg-white/10 text-white rounded-lg hover:bg-white/20 font-medium text-sm transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Global Search & Scanner Status */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative group">
          <input 
            type="text"
            placeholder="Search by dummy number or course..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/80 backdrop-blur-sm border border-[#ead7d0] rounded-xl px-4 py-3 pl-10 text-[#5a192f] placeholder-[#a08070] focus:ring-2 focus:ring-[#6f1d34]/20 focus:border-[#6f1d34] outline-none transition-all shadow-sm"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a08070] group-focus-within:text-[#6f1d34]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-[#ead7d0] rounded-xl px-4 py-3 flex items-center gap-3 shadow-inner">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
          <p className="text-xs font-bold tracking-tight text-[#5a192f] uppercase italic">Scanner Ready</p>
        </div>
      </div>

      {loadingAllocations ? (
        <div className="rounded-xl bg-white/95 border border-[#d9b7ac] p-6">
          <p className="text-sm text-[#6f4a3f]">Loading assignments from COE…</p>
        </div>
      ) : allocations.length === 0 ? (
        <div className="rounded-2xl bg-white/60 border-2 border-dashed border-[#d9b7ac] p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-[#faf4f0] rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-[#6f1d34]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-[#5a192f] mb-2">No Assignments Found</h3>
          <p className="text-[#6f4a3f] max-w-sm mx-auto">
            Your faculty code <strong>{facultyCode}</strong> is not yet linked to any courses in the COE system. Please contact the Controller of Examinations for allocation.
          </p>
        </div>
      ) : (
        courseBlocks
          .filter(block => 
            !searchTerm || 
            block.courseName.toLowerCase().includes(searchTerm.toLowerCase()) || 
            block.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            block.dummies.some(d => d.toLowerCase().includes(searchTerm.toLowerCase()))
          )
          .map((block) => {
          const entries = marksMap[block.marksKey] || [];
          const qpType = getQpTypeForCourse(block.allocation.courseKey);
          const questions = getQuestions(qpType);

          return (
            <div key={block.marksKey} className="rounded-xl bg-white/95 border border-[#d9b7ac] shadow-[0_8px_30px_-12px_rgba(111,29,52,0.15)] overflow-hidden transition-all hover:shadow-[0_8px_30px_-12px_rgba(111,29,52,0.25)]">
              {/* Course header */}
              <div className="px-6 py-5 bg-[#faf4f0]/50 border-b border-[#ead7d0]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                       <h3 className="text-lg font-extrabold text-[#5a192f]">{block.courseName || 'Unnamed Course'}</h3>
                       <span className="px-2.5 py-1 rounded bg-[#6f1d34] text-white text-[10px] uppercase font-black tracking-widest shadow-sm">
                          {qpType}
                       </span>
                       {block.bundleName && (
                          <span className="px-2.5 py-1 rounded bg-[#b2472e] text-white text-[10px] uppercase font-black tracking-widest shadow-sm">
                             Bundle: {block.bundleName}
                          </span>
                       )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-[#6f4a3f]/70">
                       <span className="flex items-center gap-1.5 bg-[#f3e5e0] px-2 py-0.5 rounded-full">{block.courseCode}</span>
                       <span className="opacity-40">|</span>
                       <span>{block.allocation.department}</span>
                       <span className="opacity-40">|</span>
                       <span>{block.allocation.semester}</span>
                       <span className="hidden lg:inline opacity-40">|</span>
                       <span className="hidden lg:inline">{block.allocation.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-end">
                       <span className="text-[10px] uppercase font-bold text-[#6f4a3f]/60 leading-none mb-1">Valuation Progress</span>
                       <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#b2472e]">
                             {entries.filter(e => getTotal(e.marks) > 0).length} / {block.dummies.length}
                          </span>
                          <div className="w-24 h-2 bg-[#ead7d0] rounded-full overflow-hidden shrink-0">
                             <div 
                               className="h-full bg-gradient-to-r from-[#6f1d34] to-[#b2472e] transition-all duration-700"
                               style={{ width: `${(entries.filter(e => getTotal(e.marks) > 0).length / Math.max(1, block.dummies.length)) * 100}%` }}
                             />
                          </div>
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mark entry table */}
              <div className="p-6">
                {block.dummies.length === 0 ? (
                  <div className="bg-[#fff9f8] border border-[#f5e1da] rounded-lg p-5 flex items-start gap-4">
                    <div className="p-2 bg-[#fbe7e0] rounded-lg text-[#b2472e]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#5a192f]">Dummy list generated yet</p>
                      <p className="text-xs text-[#6f4a3f] mt-1">Wait for the COE portal to perform "Shuffle & Save to DB" for this course. Once done, the dummy numbers will appear here automatically.</p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-6 px-6">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left">
                          <th className="sticky left-0 bg-white z-10 px-4 py-3 text-[11px] font-black uppercase text-[#6f4a3f]/60 tracking-wider w-12 border-b border-[#ead7d0]">#</th>
                          <th className="sticky left-12 bg-white z-10 px-4 py-3 text-[11px] font-black uppercase text-[#6f4a3f]/60 tracking-wider border-b border-[#ead7d0]">Dummy ID</th>
                          {questions.map((q) => (
                            <th key={q.key} className="px-3 py-3 text-center text-[11px] font-black uppercase text-[#6f4a3f]/60 tracking-wider border-b border-[#ead7d0]">
                              {q.label}
                              <span className="block text-[9px] font-semibold text-[#b2472e]/60 normal-case mt-0.5">(Max {q.max})</span>
                            </th>
                          ))}
                          <th className="px-4 py-3 text-center text-[11px] font-black uppercase text-[#6f4a3f]/60 tracking-wider border-b border-[#ead7d0]">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry, idx) => {
                          const total = getTotal(entry.marks);
                          const isHilighted = searchTerm && entry.dummy.toLowerCase().includes(searchTerm.toLowerCase());
                          return (
                            <tr key={entry.dummy} className={`group hover:bg-[#faf4f0]/40 transition-colors ${isHilighted ? 'bg-[#fff5f2]' : ''}`}>
                              <td className="sticky left-0 bg-inherit text-xs font-bold text-[#a08070] px-4 py-3 border-b border-[#ead7d0]/40">{idx + 1}</td>
                              <td className="sticky left-12 bg-inherit px-4 py-3 border-b border-[#ead7d0]/40">
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
                                  className="font-black text-[#6f1d34] font-mono tracking-tighter hover:text-[#b2472e] transition-colors focus:ring-2 focus:ring-[#6f1d34]/10 rounded px-1 -ml-1 text-sm md:text-base border-b-2 border-[#6f1d34]/20 hover:border-[#b2472e]/40"
                                >
                                  {entry.dummy}
                                </button>
                              </td>
                              {questions.map((q, qIdx) => (
                                <td key={q.key} className="px-2 py-3 border-b border-[#ead7d0]/40 text-center">
                                  {/* Normalize null/undefined marks to empty string for controlled input compatibility. */}
                                  <input
                                    type="number"
                                    min={0}
                                    max={q.max}
                                    value={entry.marks[qIdx] ?? ''}
                                    onChange={(e) => handleMarkChange(block.marksKey, idx, qIdx, e.target.value, q.max)}
                                    className="w-12 h-9 rounded-lg border border-[#d9b7ac] bg-white text-sm font-bold text-[#5a192f] text-center focus:border-[#b2472e] focus:ring-4 focus:ring-[#b2472e]/5 outline-none transition-all placeholder-[#a08070]/30 shadow-sm"
                                    placeholder="−"
                                  />
                                </td>
                              ))}
                              <td className="px-4 py-3 border-b border-[#ead7d0]/40 text-center">
                                <span className={`inline-flex min-w-[3rem] h-9 items-center justify-center rounded-lg px-3 py-1 text-sm font-black shadow-sm border transition-all ${total > 0 ? 'bg-green-500 text-white border-green-600' : 'bg-[#faf4f0] text-[#a08070] border-[#d9b7ac]'}`}>
                                  {total || '0'}
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
            </div>
          );
        })
      )}
    </div>
  );
}
