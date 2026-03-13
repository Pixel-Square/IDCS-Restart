import React, { useCallback, useRef, useState } from 'react'
import {
  ScannedStudent, ScannedStaff,
  assignUID, assignStaffUID,
  lookupAny,
  searchStudents, searchStaff,
} from '../../services/idscan'

// ─── USB device filtering & name lookup ──────────────────────────────────────
// Filters shown to the browser's port-picker dialog — only USB-serial adapters
// commonly used with NodeMCU / Arduino boards are included, which excludes
// audio devices, HID devices, webcams, etc.
const SERIAL_FILTERS = [
  { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340  (most NodeMCU clones)
  { usbVendorId: 0x1a86, usbProductId: 0x5523 }, // CH341
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 }, // CH9102 (newer clones)
  { usbVendorId: 0x10c4, usbProductId: 0xea60 }, // CP2102 / CP2104
  { usbVendorId: 0x0403, usbProductId: 0x6001 }, // FT232RL
  { usbVendorId: 0x0403, usbProductId: 0x6015 }, // FT231XS
  { usbVendorId: 0x2341, usbProductId: 0x0043 }, // Arduino Uno (R3)
  { usbVendorId: 0x2341, usbProductId: 0x0001 }, // Arduino Uno (old)
]

const USB_NAMES: Record<string, string> = {
  '1a86:7523': 'CH340 USB-Serial (NodeMCU)',
  '1a86:5523': 'CH341 USB-Serial (NodeMCU)',
  '1a86:55d4': 'CH9102 USB-Serial (NodeMCU)',
  '10c4:ea60': 'CP210x USB to UART',
  '0403:6001': 'FT232RL USB-Serial',
  '0403:6015': 'FT231XS USB-Serial',
  '2341:0043': 'Arduino Uno',
  '2341:0001': 'Arduino Uno',
}

function getDeviceName(port: any): string {
  try {
    const info = port.getInfo?.()
    if (!info?.usbVendorId) return 'USB Serial Device'
    const vid = (info.usbVendorId as number).toString(16).padStart(4, '0')
    const pid = ((info.usbProductId ?? 0) as number).toString(16).padStart(4, '0')
    return USB_NAMES[`${vid}:${pid}`] ?? `USB Device (${vid.toUpperCase()}:${pid.toUpperCase()})`
  } catch {
    return 'USB Serial Device'
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ScanLog = { uid: string; timestamp: Date; found: boolean }

// ─── Student Card Popup ───────────────────────────────────────────────────────
// No auto-close timer — stays until the next card is scanned or the user
// presses ✕. The parent (processUID) clears this before showing a new result.
function StudentCard({ student, onClose }: { student: ScannedStudent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative animate-bounce-in bg-white rounded-3xl shadow-2xl border-4 border-green-400 w-full max-w-md mx-4 overflow-hidden">
        {/* Green header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-400 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-widest text-green-100">Card Recognised</div>
              <div className="text-xl font-bold truncate">{student.name}</div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-6 pt-4 pb-3 space-y-1.5">
          <Row label="Reg No"     value={student.reg_no} />
          {student.department && <Row label="Department" value={student.department} />}
          {student.batch        && <Row label="Batch"      value={student.batch} />}
          {student.section      && <Row label="Section"    value={student.section} />}
          <Row label="Status"    value={student.status} />
          <Row label="UID"       value={student.rfid_uid ?? '—'} mono />
        </div>

        {/* Hint */}
        <div className="px-6 pb-4 pt-1">
          <p className="text-xs text-center text-gray-400">Scan another card or press ✕ to close</p>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 text-gray-600 flex items-center justify-center transition text-sm font-bold"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Staff Card Popup ───────────────────────────────────────────────────────
function StaffCard({ staff, onClose }: { staff: ScannedStaff; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative animate-bounce-in bg-white rounded-3xl shadow-2xl border-4 border-emerald-400 w-full max-w-md mx-4 overflow-hidden">
        {/* Emerald header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-widest text-emerald-100">Card Recognised</div>
              <div className="text-xl font-bold truncate">{staff.name}</div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-6 pt-4 pb-3 space-y-1.5">
          <Row label="Staff ID" value={staff.staff_id} />
          {staff.department && <Row label="Department" value={staff.department} />}
          {staff.designation && <Row label="Designation" value={staff.designation} />}
          <Row label="Status" value={staff.status} />
          <Row label="UID" value={staff.rfid_uid ?? '—'} mono />
        </div>

        {/* Hint */}
        <div className="px-6 pb-4 pt-1">
          <p className="text-xs text-center text-gray-400">Scan another card or press ✕ to close</p>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 text-gray-600 flex items-center justify-center transition text-sm font-bold"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-medium text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

// ─── Assign UID Popup (single combined search) ───────────────────────────────

type AssignCandidate =
  | { kind: 'student'; id: number; title: string; subtitle?: string; profile: ScannedStudent }
  | { kind: 'staff'; id: number; title: string; subtitle?: string; profile: ScannedStaff }

function coerceArray<T>(v: any): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && Array.isArray(v.results)) return v.results as T[]
  return []
}

function AssignPopup({
  uid,
  onAssigned,
  onClose,
}: {
  uid: string
  onAssigned: (kind: 'student' | 'staff', profile: ScannedStudent | ScannedStaff) => void
  onClose: () => void
}) {
  const [query, setQuery]                       = useState('')
  const [results, setResults]                   = useState<AssignCandidate[]>([])
  const [searching, setSearching]               = useState(false)
  const [selected, setSelected]                 = useState<AssignCandidate | null>(null)
  const [assigning, setAssigning]               = useState(false)
  const [error, setError]                       = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current)
    if (q.length < 1) {
      setResults([])
      setSelected(null)
      setSearching(false)
      return
    }
    setSearching(true)
    debounce.current = setTimeout(async () => {
      try {
        const [studentsRaw, staffRaw] = await Promise.all([searchStudents(q), searchStaff(q)])
        const students = coerceArray<ScannedStudent>(studentsRaw)
        const staff = coerceArray<ScannedStaff>(staffRaw)

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
            id: s.id,
            title: `${s.staff_id} — ${s.name}`,
            subtitle: [s.department, s.designation].filter(Boolean).join(' · ') || undefined,
            profile: s,
          })),
        ]

        setResults(merged)
        setSelected((prev) => {
          if (!prev) return null
          return merged.find((m) => m.kind === prev.kind && m.id === prev.id) ?? null
        })
      } catch (e: any) {
        setError(e?.message || 'Search failed')
      } finally {
        setSearching(false)
      }
    }, 280)
  }, [])

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setError(null)
    setSelected(null)
    doSearch(q)
  }

  const hasSelection = !!selected

  const handleAssign = async () => {
    setAssigning(true)
    setError(null)
    try {
      if (!selected) return

      if (selected.kind === 'student') {
        const res = await assignUID(selected.id, uid)
        onAssigned('student', res.student)
        return
      }

      const res = await assignStaffUID(selected.id, uid)
      onAssigned('staff', res.staff)
    } catch (e: any) {
      setError(e.message || 'Failed to assign UID')
    } finally {
      setAssigning(false)
    }
  }

  const accentRing = 'focus:ring-indigo-400'
  const accentBg = 'bg-indigo-600 hover:bg-indigo-700'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="bg-indigo-600 rounded-t-2xl px-5 py-4 text-white flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-indigo-200 uppercase tracking-widest">New Card Detected</div>
            <div className="text-lg font-bold font-mono">{uid}</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            This UID is not yet assigned. Search a student or staff below and assign the card.
          </p>

          {/* Search */}
          <div className="relative">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search by Reg No / Student Name / Staff ID / Staff Name…"
              className={`w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 ${accentRing}`}
            />
            {searching && (
              <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 border rounded-lg text-sm">
              {results.map((r) => {
                const active = selected?.kind === r.kind && selected?.id === r.id
                return (
                  <li
                    key={`${r.kind}:${r.id}`}
                    onClick={() => setSelected(r)}
                    className={`px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition flex items-center justify-between ${
                      active ? 'bg-gray-100' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            r.kind === 'student'
                              ? 'text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-indigo-50 border-indigo-200 text-indigo-700'
                              : 'text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-emerald-50 border-emerald-200 text-emerald-700'
                          }
                        >
                          {r.kind === 'student' ? 'STUDENT' : 'STAFF'}
                        </span>
                        <div className="font-semibold text-gray-800 truncate">{r.title}</div>
                      </div>
                      {r.subtitle && <div className="text-xs text-gray-500 truncate mt-0.5">{r.subtitle}</div>}
                    </div>
                    {active && (
                      <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleAssign}
              disabled={!hasSelection || assigning}
              className={`flex-1 ${accentBg} disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition`}
            >
              {assigning ? 'Assigning…' : 'Assign Card'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 border border-gray-300 hover:bg-gray-50 rounded-lg px-4 py-2.5 text-sm font-medium transition"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IDCSScanTestPage() {
  const [port, setPort]                         = useState<any | null>(null)
  const [deviceName, setDeviceName]             = useState('')
  const [scanning, setScanning]                 = useState(false)
  const [log, setLog]                           = useState<ScanLog[]>([])
  const [successStudent, setSuccessStudent]     = useState<ScannedStudent | null>(null)
  const [successStaff, setSuccessStaff]         = useState<ScannedStaff | null>(null)
  const [assignUID_val, setAssignUID]           = useState<string | null>(null)
  const readerRef                               = useRef<ReadableStreamDefaultReader<string> | null>(null)
  const buffer                                  = useRef('')
  const lastScan                                = useRef<{ uid: string; time: number }>({ uid: '', time: 0 })

  const serialSupported = typeof (navigator as any).serial !== 'undefined'

  // ── Port selection ──────────────────────────────────────────────────────────
  const handleSelectPort = async () => {
    try {
      let p: any
      try {
        // Filtered: shows only known USB-serial adapters (excludes audio, HID, etc.)
        p = await (navigator as any).serial.requestPort({ filters: SERIAL_FILTERS })
      } catch (err: any) {
        if (err.name === 'NotAllowedError') return
        // Device chip not in filter list — fall back to unfiltered picker
        try {
          p = await (navigator as any).serial.requestPort()
        } catch (e2: any) {
          if (e2.name !== 'NotAllowedError') alert('Could not select serial port: ' + e2.message)
          return
        }
      }
      setPort(p)
      setDeviceName(getDeviceName(p))
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') alert('Could not select serial port: ' + e.message)
    }
  }

  // ── Scan loop ───────────────────────────────────────────────────────────────
  const handleStartScan = async () => {
    if (!port) return
    setScanning(true)
    try {
      await port.open({ baudRate: 115200 })
    } catch {
      // Port already open from previous session — that's fine
    }

    const decoder = new TextDecoderStream()
    port.readable.pipeTo(decoder.writable)
    const reader = decoder.readable.getReader()
    readerRef.current = reader

    ;(async () => {
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer.current += value
          const lines = buffer.current.split('\n')
          buffer.current = lines.pop() ?? ''
          for (const raw of lines) {
            const trimmed = raw.trim().toUpperCase()
            // ── UID extraction ──
            // Accept both:
            //   - pure UID lines:      "DA 67 F9 60"
            //   - prefixed UID lines:  "UID:DA67F960"
            // Extract *hex only* from the line; require >= 8 hex chars to avoid
            // false reads like the baud rate "115200" (6 chars).
            const candidate = trimmed.replace(/^UID\s*[:=\-]?\s*/i, '')
            const uid = candidate.replace(/[^0-9A-F]/g, '')
            if (uid.length < 8) continue
            // Debounce: ignore repeated reads of the same card within 1.5 s
            const now = Date.now()
            if (uid === lastScan.current.uid && now - lastScan.current.time < 1500) continue
            lastScan.current = { uid, time: now }
            processUID(uid)
          }
        }
      } catch {
        // reader cancelled / port closed
      } finally {
        setScanning(false)
      }
    })()
  }

  const handleStopScan = async () => {
    try { await readerRef.current?.cancel() } catch {}
    try { await port?.close() } catch {}
    setScanning(false)
  }

  const processUID = useCallback(async (uid: string) => {
    // Dismiss any currently open popup the moment a new card is detected
    setSuccessStudent(null)
    setSuccessStaff(null)
    setAssignUID(null)

    const ts = new Date()
    try {
      const result = await lookupAny(uid)
      setLog((prev) => [{ uid, timestamp: ts, found: !!result.found }, ...prev.slice(0, 49)])

      if (result.found && result.profile_type === 'student') {
        setSuccessStudent(result.profile)
        return
      }
      if (result.found && result.profile_type === 'staff') {
        setSuccessStaff(result.profile)
        return
      }

      setAssignUID(uid)
    } catch {
      setLog((prev) => [{ uid, timestamp: ts, found: false }, ...prev.slice(0, 49)])
    }
  }, [])

  return (
    <main className="min-h-screen bg-gray-50">
      {/* ── Popups ── */}
      {successStudent && (
        <StudentCard student={successStudent} onClose={() => setSuccessStudent(null)} />
      )}
      {successStaff && (
        <StaffCard staff={successStaff} onClose={() => setSuccessStaff(null)} />
      )}
      {assignUID_val && (
        <AssignPopup
          uid={assignUID_val}
          onAssigned={(kind, profile) => {
            setAssignUID(null)
            if (kind === 'student') setSuccessStudent(profile as ScannedStudent)
            else setSuccessStaff(profile as ScannedStaff)
          }}
          onClose={() => setAssignUID(null)}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">RFID Scanner
              <span className="ml-2 text-base font-normal text-gray-400">— Test</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">NodeMCU ESP8266 + MFRC522 · USB Serial · 115200 baud</p>
          </div>
          {scanning && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 border border-green-200 rounded-full px-3 py-1.5 flex-shrink-0 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* ── Browser warning ── */}
        {!serialSupported && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            ⚠️ Web Serial API is not supported in this browser. Use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
          </div>
        )}

        {/* ── Step 1: USB Device ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-sm font-semibold text-gray-700">Select USB Device</span>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSelectPort}
                disabled={!serialSupported || scanning}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition"
              >
                {/* USB plug icon */}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 4v4m0 0l-2-2m2 2l2-2M8 8H5a1 1 0 00-1 1v6a1 1 0 001 1h3m8-8h3a1 1 0 011 1v6a1 1 0 01-1 1h-3m-8 0h8m-4 0v4" />
                </svg>
                Select USB Port
              </button>

              {port && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-green-800 leading-tight">{deviceName || 'Device connected'}</div>
                    <div className="text-xs text-green-600">115200 baud · ready</div>
                  </div>
                  <button
                    onClick={handleSelectPort}
                    disabled={scanning}
                    className="ml-2 text-xs text-green-700 hover:text-green-900 underline disabled:opacity-40"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Collapsible pin wiring reference */}
            <details className="group">
              <summary className="cursor-pointer select-none text-xs font-semibold text-indigo-600 hover:text-indigo-800 list-none flex items-center gap-1">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                MFRC522 Pin Wiring (NodeMCU ESP8266)
              </summary>
              <div className="mt-2 rounded-xl bg-gray-50 border border-gray-200 p-4 text-xs text-gray-600 space-y-1">
                {[['RST','D3 (GPIO 0)'],['SDA/SS','D4 (GPIO 2)'],['MOSI','D7 (GPIO 13)'],['MISO','D6 (GPIO 12)'],['SCK','D5 (GPIO 14)'],['VCC','3.3 V only'],['GND','GND']].map(([pin, wire]) => (
                  <div key={pin} className="flex gap-2">
                    <span className="w-16 font-mono font-bold text-indigo-700">{pin}</span>
                    <span>{wire}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>

        {/* ── Step 2: Scan ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${port ? 'bg-indigo-600' : 'bg-gray-300'}`}>2</span>
            <span className="text-sm font-semibold text-gray-700">Scan Cards</span>
          </div>

          <div className="p-5">
            {!port ? (
              <p className="text-sm text-gray-400 italic">Select a USB device above first.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-3 flex-wrap">
                  {!scanning ? (
                    <button
                      onClick={handleStartScan}
                      className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-xl px-6 py-2.5 text-sm font-semibold shadow-sm transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-5.197-3.027A1 1 0 008 9v6a1 1 0 001.555.832l5.197-3.027a1 1 0 000-1.664z" />
                      </svg>
                      Start Scan
                    </button>
                  ) : (
                    <button
                      onClick={handleStopScan}
                      className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-xl px-6 py-2.5 text-sm font-semibold shadow-sm transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3v6m-3-3h6" />
                      </svg>
                      Stop Scan
                    </button>
                  )}
                </div>

                {scanning && (
                  <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                    </span>
                    Listening on {deviceName || 'serial port'} — place a card near the reader…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Scan Log ── */}
        {log.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-gray-500 text-white text-xs font-bold flex items-center justify-center">↓</span>
                <span className="text-sm font-semibold text-gray-700">Scan Log</span>
                <span className="text-xs text-gray-400 tabular-nums">({log.length})</span>
              </div>
              <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-red-500 transition">
                Clear
              </button>
            </div>
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto text-sm">
              {log.map((entry, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.found ? 'bg-green-500' : 'bg-amber-400'}`} />
                  <span className="font-mono font-semibold text-gray-800 text-xs w-28 flex-shrink-0">{entry.uid}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry.found ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    {entry.found ? 'Recognised' : 'Unknown'}
                  </span>
                  <span className="ml-auto text-xs text-gray-400 tabular-nums flex-shrink-0">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </main>
  )
}
