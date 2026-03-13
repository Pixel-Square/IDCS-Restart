import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  rfreaderFetchLastScan,
  type RFReaderLastScan,
} from '../../services/rfreader';
import {
  lookupAny,
  assignUID,
  assignStaffUID,
  searchStudents,
  searchStaff,
  type ScannedStudent,
  type ScannedStaff,
} from '../../services/idscan';

// ── USB serial device constants (same filters as IDCSScan/TestPage) ─────────

const SERIAL_FILTERS = [
  { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340  (NodeMCU clones)
  { usbVendorId: 0x1a86, usbProductId: 0x5523 }, // CH341
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 }, // CH9102
  { usbVendorId: 0x10c4, usbProductId: 0xea60 }, // CP2102 / CP2104
  { usbVendorId: 0x0403, usbProductId: 0x6001 }, // FT232RL
  { usbVendorId: 0x0403, usbProductId: 0x6015 }, // FT231XS
  { usbVendorId: 0x2341, usbProductId: 0x0043 }, // Arduino Uno (R3)
  { usbVendorId: 0x2341, usbProductId: 0x0001 }, // Arduino Uno (old)
];

const USB_NAMES: Record<string, string> = {
  '1a86:7523': 'CH340 (NodeMCU)',
  '1a86:5523': 'CH341 (NodeMCU)',
  '1a86:55d4': 'CH9102 (NodeMCU)',
  '10c4:ea60': 'CP210x USB to UART',
  '0403:6001': 'FT232RL USB-Serial',
  '0403:6015': 'FT231XS USB-Serial',
  '2341:0043': 'Arduino Uno',
  '2341:0001': 'Arduino Uno',
};

function getDeviceName(port: any): string {
  try {
    const info = port.getInfo?.();
    if (!info?.usbVendorId) return 'USB Serial Device';
    const vid = (info.usbVendorId as number).toString(16).padStart(4, '0');
    const pid = ((info.usbProductId ?? 0) as number).toString(16).padStart(4, '0');
    return USB_NAMES[`${vid}:${pid}`] ?? `USB Device (${vid.toUpperCase()}:${pid.toUpperCase()})`;
  } catch {
    return 'USB Serial Device';
  }
}

// ── Popup discriminated union ──────────────────────────────────────────────

type PopupState =
  | { kind: 'student'; profile: ScannedStudent; uid: string }
  | { kind: 'staff';   profile: ScannedStaff;   uid: string };

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'ACTIVE'
      ? 'bg-green-100 text-green-700'
      : status === 'INACTIVE'
        ? 'bg-gray-100 text-gray-500'
        : status === 'RESIGNED'
          ? 'bg-red-100 text-red-600'
          : 'bg-yellow-100 text-yellow-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-white/60">{label}</span>
      <span className={`text-sm font-semibold text-white ${mono ? 'font-mono tracking-wider' : ''}`}>{value}</span>
    </div>
  );
}

// ── Auto-dismiss progress bar ──────────────────────────────────────────────

function AutoDismissBar({ progress, color }: { progress: number; color: string }) {
  return (
    <div className="h-1 w-full bg-white/20">
      <div
        className={`h-1 transition-all duration-100 ${color}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// ── Student Popup ──────────────────────────────────────────────────────────

function StudentPopup({
  profile,
  uid,
  progress,
  onClose,
}: {
  profile: ScannedStudent;
  uid: string;
  progress: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/85 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10">
        {/* auto-dismiss bar */}
        <AutoDismissBar progress={progress} color="bg-indigo-400" />

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 px-6 pt-5 pb-6">
          <div className="flex items-center gap-4 mb-4">
            {profile.profile_image_url ? (
              <img
                src={profile.profile_image_url}
                alt={profile.name}
                className="w-14 h-14 rounded-2xl object-cover border border-white/30 flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-3xl shadow">
                🎓
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-0.5">Student Card</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-indigo-50 border-indigo-200 text-indigo-700">
                  STUDENT
                </span>
              </div>
              <h2 className="text-xl font-bold text-white leading-tight">{profile.name}</h2>
            </div>
          </div>
          <div className="divide-y divide-white/10">
            <Row label="Reg No"     value={profile.reg_no} mono />
            <Row label="Section"    value={profile.section    || '—'} />
            <Row label="Batch"      value={profile.batch      || '—'} />
            <Row label="Department" value={profile.department || '—'} />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-white/60">Status</span>
              <StatusBadge status={profile.status} />
            </div>
            <Row label="Card UID"   value={uid} mono />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-indigo-900/80 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-white text-indigo-700 text-sm font-semibold hover:bg-indigo-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Staff Popup ────────────────────────────────────────────────────────────

function StaffPopup({
  profile,
  uid,
  progress,
  onClose,
}: {
  profile: ScannedStaff;
  uid: string;
  progress: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/85 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10">
        {/* auto-dismiss bar */}
        <AutoDismissBar progress={progress} color="bg-emerald-400" />

        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 px-6 pt-5 pb-6">
          <div className="flex items-center gap-4 mb-4">
            {profile.profile_image_url ? (
              <img
                src={profile.profile_image_url}
                alt={profile.name}
                className="w-14 h-14 rounded-2xl object-cover border border-white/30 flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-3xl shadow">
                👔
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-emerald-200 text-xs font-semibold uppercase tracking-widest mb-0.5">Staff Card</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-emerald-50 border-emerald-200 text-emerald-700">
                  STAFF
                </span>
              </div>
              <h2 className="text-xl font-bold text-white leading-tight">{profile.name}</h2>
            </div>
          </div>
          <div className="divide-y divide-white/10">
            <Row label="Staff ID"    value={profile.staff_id} mono />
            <Row label="Department"  value={profile.department  || '—'} />
            <Row label="Designation" value={profile.designation || '—'} />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-white/60">Status</span>
              <StatusBadge status={profile.status} />
            </div>
            <Row label="Card UID"    value={uid} mono />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-emerald-900/80 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-white text-emerald-700 text-sm font-semibold hover:bg-emerald-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Info grid cell ─────────────────────────────────────────────────────────

function InfoCell({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-gray-800 truncate ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

// ── Combined search (students + staff) with one box ──────────────────────

type AssignCandidate =
  | { kind: 'student'; id: number; title: string; subtitle?: string; profile: ScannedStudent }
  | { kind: 'staff'; id: number; title: string; subtitle?: string; profile: ScannedStaff };

function coerceArray<T>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && Array.isArray(v.results)) return v.results as T[];
  return [];
}

// ── Main Page ──────────────────────────────────────────────────────────────

const DISMISS_MS = 7000;

export default function RFReaderTestStudentsPage() {
  const [last, setLast] = useState<RFReaderLastScan | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [progress, setProgress] = useState(100);

  // Unknown/Unassigned UID (drives the Assign panel + badge)
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  // ── WebSerial state ────────────────────────────────────────────────────────
  const [port, setPort] = useState<any | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [serialError, setSerialError] = useState<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const bufferRef = useRef('');
  const lastScanRef = useRef<{ uid: string; time: number }>({ uid: '', time: 0 });
  const serialSupported = typeof (navigator as any).serial !== 'undefined';

  // ── Assign (single box for Student+Staff) ─────────────────────────────────
  const [assignQuery, setAssignQuery] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignResults, setAssignResults] = useState<AssignCandidate[]>([]);
  const [assignSelected, setAssignSelected] = useState<AssignCandidate | null>(null);
  const assignInputRef = useRef<HTMLInputElement | null>(null);

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auto-dismiss timer ───────────────────────────────────────────────────
  const startDismissTimer = useCallback(() => {
    setProgress(100);
    if (dismissTimerRef.current)    clearTimeout(dismissTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    const TICK = 80;
    let elapsed = 0;
    progressIntervalRef.current = setInterval(() => {
      elapsed += TICK;
      setProgress(Math.max(0, 100 - (elapsed / DISMISS_MS) * 100));
    }, TICK);
    dismissTimerRef.current = setTimeout(() => {
      clearInterval(progressIntervalRef.current!);
      setPopup(null);
    }, DISMISS_MS);
  }, []);

  const closePopup = useCallback(() => {
    if (dismissTimerRef.current)    clearTimeout(dismissTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setPopup(null);
  }, []);

  // ── Poll last scan — only updates the Live Scan Info panel ──────────────
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const data = await rfreaderFetchLastScan();
        if (!mounted) return;
        setPollError(null);
        setLast(data);
      } catch (e: any) {
        if (mounted) setPollError(String(e?.message ?? e));
      }
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => { mounted = false; window.clearInterval(id); };
  }, []);

  // ── WebSerial: select port ───────────────────────────────────────────────
  const handleSelectPort = async () => {
    try {
      let p: any;
      try {
        p = await (navigator as any).serial.requestPort({ filters: SERIAL_FILTERS });
      } catch (err: any) {
        if (err.name === 'NotAllowedError') return;
        try {
          p = await (navigator as any).serial.requestPort();
        } catch (e2: any) {
          if (e2.name !== 'NotAllowedError') setSerialError('Could not select port: ' + e2.message);
          return;
        }
      }
      setPort(p);
      setDeviceName(getDeviceName(p));
      setSerialError(null);
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') setSerialError('Could not select port: ' + e.message);
    }
  };

  // ── WebSerial: start scan loop ───────────────────────────────────────────
  const handleStartScan = async () => {
    if (!port) return;
    setScanning(true);
    setSerialError(null);

    try {
      try {
        await port.open({ baudRate });
      } catch (openErr: any) {
        // InvalidStateError = already open — that's fine, continue
        if (openErr?.name !== 'InvalidStateError' && !openErr?.message?.toLowerCase().includes('already open')) {
          throw openErr;
        }
      }

      if (!port.readable) {
        throw new Error('Port has no readable stream — try unplugging and re-selecting the device.');
      }

      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable).catch(() => { /* closed by stop */ });
      const reader = decoder.readable.getReader();
      readerRef.current = reader;

      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bufferRef.current += value;
            // Some devices use "\r" without "\n". Normalize to simplify splitting.
            const normalized = bufferRef.current.replace(/\r/g, '\n');
            const lines = normalized.split('\n');
            bufferRef.current = lines.pop() ?? '';
            for (const raw of lines) {
              const trimmed = raw.trim().toUpperCase();
              // ── UID extraction ──────────────────────────────────────────
              // Priority 1: spaced/colon byte pairs, e.g. "AF DF DE EC" or
              //   "Card UID: AF DF DE EC" — grab first group of 4+ byte pairs
              const spacedMatch = trimmed.match(/[0-9A-F]{2}(?:[: ][0-9A-F]{2}){3,}/);
              let uid: string;
              if (spacedMatch) {
                uid = spacedMatch[0].replace(/[^0-9A-F]/g, '');
              } else {
                // Priority 2: compact run of 8+ hex chars, e.g. "AFDFDEEC"
                const compactMatch = trimmed.match(/[0-9A-F]{8,}/);
                uid = compactMatch ? compactMatch[0] : '';
              }
              if (uid.length < 8) continue;
              // Debounce: ignore same card within 1.5 s
              const now = Date.now();
              if (uid === lastScanRef.current.uid && now - lastScanRef.current.time < 1500) continue;
              lastScanRef.current = { uid, time: now };
              processUID(uid);
            }
          }
        } catch {
          // reader cancelled / port closed — normal stop path
        } finally {
          setScanning(false);
        }
      })();
    } catch (e: any) {
      setScanning(false);
      setSerialError('Could not start scan: ' + (e?.message ?? String(e)));
    }
  };

  const handleStopScan = async () => {
    try { await readerRef.current?.cancel(); } catch {}
    try { readerRef.current?.releaseLock?.(); } catch {}
    try { await port?.close(); } catch {}
    readerRef.current = null;
    bufferRef.current = '';
    setScanning(false);
  };

  // Ensure port is closed if the user navigates away
  useEffect(() => {
    return () => {
      try { readerRef.current?.cancel(); } catch {}
      try { port?.close(); } catch {}
    };
  }, [port]);

  // ── Combined search effect (runs only when an unknown UID is present) ─────
  useEffect(() => {
    let cancelled = false;

    if (!pendingUid) {
      setAssignResults([]);        // should already exist in your file
      setAssignSelected(null);
      setAssignLoading(false);
      setAssignError(null);
      return;
    }

    const q = assignQuery.trim();
    if (q.length < 1) {
      setAssignResults([]);
      setAssignSelected(null);
      setAssignLoading(false);
      setAssignError(null);
      return;
    }

    setAssignLoading(true);
    setAssignError(null);

    const t = window.setTimeout(async () => {
      try {
        const [studentsRaw, staffRaw] = await Promise.all([searchStudents(q), searchStaff(q)]);
        if (cancelled) return;

        const students = coerceArray<ScannedStudent>(studentsRaw);
        const staff = coerceArray<ScannedStaff>(staffRaw);

        const merged: AssignCandidate[] = [
          ...students.map((s) => ({
            kind: 'student' as const,
            id: s.id,
            title: `${s.reg_no} — ${s.name}`,
            subtitle: [s.department, s.section].filter(Boolean).join(' · ') || undefined,
            profile: s,
          })),
          ...staff.map((s) => ({
            kind: 'staff' as const,
            id: s.id, // IMPORTANT: this is StaffProfile.pk (not staff_id string)
            title: `${s.staff_id} — ${s.name}`,
            subtitle: [s.department, s.designation].filter(Boolean).join(' · ') || undefined,
            profile: s,
          })),
        ];

        setAssignResults(merged);
        setAssignSelected((prev) => {
          if (!prev) return null;
          return merged.find((m) => m.kind === prev.kind && m.id === prev.id) ?? null;
        });
      } catch (e: any) {
        if (!cancelled) setAssignError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setAssignLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [assignQuery, pendingUid]);

  // ── processUID: known -> popup; unknown -> open assign panel ──────────────
  const processUID = useCallback(async (uid: string) => {
    closePopup();

    try {
      const result = await lookupAny(uid);

      if (result.found && result.profile_type === 'student') {
        setPendingUid(null);
        setPopup({ kind: 'student', profile: result.profile, uid });
        startDismissTimer();
        return;
      }

      if (result.found && result.profile_type === 'staff') {
        setPendingUid(null);
        setPopup({ kind: 'staff', profile: result.profile, uid });
        startDismissTimer();
        return;
      }

      // Unknown card: open assign panel
      setPendingUid(uid);
      setAssignQuery('');
      setAssignResults([]);
      setAssignSelected(null);
      setAssignError(null);
    } catch (e: any) {
      setSerialError(String(e?.message ?? e));
    }
  }, [closePopup, startDismissTimer]);

  // When an unknown card is scanned, put the cursor in the assign box.
  useEffect(() => {
    if (!pendingUid) return;
    const t = setTimeout(() => {
      assignInputRef.current?.focus();
      assignInputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [pendingUid]);

  // ── Assign selected profile to pendingUid ─────────────────────────────────
  const handleAssign = useCallback(async () => {
    if (!pendingUid || !assignSelected) return;

    const uid = pendingUid;
    setAssignError(null);

    try {
      if (assignSelected.kind === 'student') {
        await assignUID(assignSelected.id, uid);
      } else {
        await assignStaffUID(assignSelected.id, uid);
      }

      // clear assign UI
      setPendingUid(null);
      setAssignQuery('');
      setAssignResults([]);
      setAssignSelected(null);

      // allow immediate re-scan of same UID
      lastScanRef.current = { uid: '', time: 0 };

      // show popup immediately (student/staff) with role label
      await processUID(uid);
    } catch (e: any) {
      setAssignError(String(e?.message ?? e));
    }
  }, [pendingUid, assignSelected, processUID]);

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">RF Reader · Test Station</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect the USB scanner below, then scan a card. Student and staff cards each get their own pop-up.
          Unrecognised cards drop into the Assign panel.
        </p>
      </div>

      {/* ── USB Scanner ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 mb-5 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
          <span className="text-sm font-semibold text-gray-700">Connect USB Scanner</span>
          {scanning && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 border border-green-200 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
        </div>

        <div className="p-4 flex flex-wrap items-center gap-3">
          {!serialSupported && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-full">
              ⚠️ Web Serial is not supported. Use <strong>Chrome</strong> or <strong>Edge</strong>.
            </p>
          )}

          {/* Select port */}
          <button
            onClick={handleSelectPort}
            disabled={!serialSupported || scanning}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4v4m0 0l-2-2m2 2l2-2M8 8H5a1 1 0 00-1 1v6a1 1 0 001 1h3m8-8h3a1 1 0 011 1v6a1 1 0 01-1 1h-3m-8 0h8m-4 0v4" />
            </svg>
            {port ? 'Change Port' : 'Select USB Port'}
          </button>

          {/* Connected device */}
          {port && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span className="font-bold text-green-800">{deviceName || 'Device connected'}</span>
              <span className="text-green-600">· {baudRate} baud</span>
            </div>
          )}

          {/* Baud rate */}
          <label className="inline-flex items-center gap-2 text-xs text-gray-600">
            <span className="font-semibold">Baud</span>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              disabled={scanning}
              className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-white disabled:opacity-50"
            >
              <option value={115200}>115200</option>
              <option value={9600}>9600</option>
            </select>
          </label>

          {/* Start / Stop scan */}
          {port && !scanning && (
            <button
              onClick={handleStartScan}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M14.752 11.168l-5.197-3.027A1 1 0 008 9v6a1 1 0 001.555.832l5.197-3.027a1 1 0 000-1.664z" />
              </svg>
              Start Scan
            </button>
          )}
          {scanning && (
            <button
              onClick={handleStopScan}
              className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10h6v4H9z" />
              </svg>
              Stop Scan
            </button>
          )}

          {/* Pending UID badge */}
          {pendingUid && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Unknown card: <span className="font-mono">{pendingUid}</span>
            </span>
          )}
        </div>

        {serialError && (
          <div className="mx-4 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
            {serialError}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Assign panel (single combined search) ─────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Assign Card</h2>
            {pendingUid ? (
              <span className="font-mono text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-2 py-0.5">
                {pendingUid}
              </span>
            ) : (
              <span className="text-xs text-gray-400 italic">Scan an unrecognised card first</span>
            )}
          </div>

          <div className="p-4 flex-1 flex flex-col gap-3">
            <input
              type="text"
              value={assignQuery}
              onChange={(e) => setAssignQuery(e.target.value)}
              disabled={!pendingUid}
              placeholder="Type Reg No / Student Name / Staff ID / Staff Name"
              ref={assignInputRef}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none border-gray-200 disabled:bg-gray-50"
            />

            {assignError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {assignError}
              </p>
            )}

            <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              {assignLoading && <div className="p-3 text-xs text-gray-500">Searching…</div>}

              {!assignLoading && pendingUid && assignResults.length === 0 && assignQuery.trim().length > 0 && (
                <div className="p-3 text-xs text-gray-400">No results</div>
              )}

              {!assignLoading && assignResults.map((r) => {
                const active = assignSelected?.kind === r.kind && assignSelected?.id === r.id;
                return (
                  <button
                    key={`${r.kind}:${r.id}`}
                    onClick={() => setAssignSelected(r)}
                    className={[
                      'w-full text-left px-3 py-2 border-b last:border-b-0 flex items-center gap-2',
                      active ? 'bg-slate-100' : 'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {/* Profile photo thumbnail */}
                    {r.profile.profile_image_url ? (
                      <img
                        src={r.profile.profile_image_url}
                        alt={r.title}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs">
                        👤
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            'text-[10px] px-2 py-0.5 rounded-full border font-semibold',
                            r.kind === 'student'
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700',
                          ].join(' ')}
                        >
                          {r.kind === 'student' ? 'STUDENT' : 'STAFF'}
                        </span>
                        <div className="text-sm font-medium truncate">{r.title}</div>
                      </div>
                      {r.subtitle && <div className="text-xs opacity-70 mt-0.5">{r.subtitle}</div>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAssign}
                disabled={!pendingUid || !assignSelected}
                className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Assign Card
              </button>
              <button
                onClick={() => {
                  setPendingUid(null);
                  setAssignQuery('');
                  setAssignResults([]);
                  setAssignSelected(null);
                  setAssignError(null);
                }}
                disabled={!pendingUid}
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          </div>
        </div>

        {/* ── Live scan info ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Last DB Scan</h2>
            {pollError && (
              <span className="text-xs text-red-500">poll error</span>
            )}
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <InfoCell label="Gate"         value={last?.gate?.name} />
            <InfoCell label="Card UID"     value={last?.uid} mono />
            <InfoCell label="Scanned At"   value={last?.scanned_at ? new Date(last.scanned_at).toLocaleTimeString() : null} />
            <InfoCell label="Profile Type" value={last?.profile_type ?? null} />
            <InfoCell label="Roll No"      value={last?.roll_no} />
            <InfoCell label="Name"         value={last?.name} />
            <InfoCell label="IMPRES"       value={last?.impres_code} />
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        💡 Close Arduino Serial Monitor before starting a scan. Use Chrome or Edge for Web Serial support.
      </p>

      {/* ── Popups ──────────────────────────────────────────────────────── */}
      {popup?.kind === 'student' && (
        <StudentPopup
          profile={popup.profile}
          uid={popup.uid}
          progress={progress}
          onClose={closePopup}
        />
      )}
      {popup?.kind === 'staff' && (
        <StaffPopup
          profile={popup.profile}
          uid={popup.uid}
          progress={progress}
          onClose={closePopup}
        />
      )}
    </div>
  );
}
