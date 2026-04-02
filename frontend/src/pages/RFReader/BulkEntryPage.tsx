import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { Check, Cpu, ScanLine, Square, AlertCircle, Loader2 } from 'lucide-react'
import {
  assignUID,
  assignStaffUID,
  fetchCardsData,
  type CardDataRow,
} from '../../services/idscan'
import { getApiBase } from '../../services/apiBase'

const SERIAL_FILTERS = [
  { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340
  { usbVendorId: 0x1a86, usbProductId: 0x5523 }, // CH341
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 }, // CH9102
  { usbVendorId: 0x10c4, usbProductId: 0xea60 }, // CP210x
  { usbVendorId: 0x0403, usbProductId: 0x6001 }, // FT232RL
  { usbVendorId: 0x0403, usbProductId: 0x6015 }, // FT231XS
  { usbVendorId: 0x2341, usbProductId: 0x0043 }, // Arduino Uno
  { usbVendorId: 0x2341, usbProductId: 0x0001 }, // Arduino Uno (old)
]

type RowPhase = 'idle' | 'assigning' | 'success' | 'error'

type RowState = {
  uid: string
  phase: RowPhase
  error: string | null
}

function rowKey(row: CardDataRow): string {
  return `${row.role}_${row.id}`
}

function Avatar({ url, name }: { url?: string | null; name?: string }) {
  const base = getApiBase()
  const src = url ? (url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`) : null
  const initials = (name ?? '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="w-8 h-8 rounded-full object-cover border border-gray-200 flex-shrink-0"
        onError={(e) => {
          const img = e.target as HTMLImageElement
          img.style.display = 'none'
          const next = img.nextElementSibling as HTMLElement | null
          if (next) next.style.display = 'flex'
        }}
      />
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center flex-shrink-0">
      <span className="text-[10px] font-bold text-white">{initials}</span>
    </div>
  )
}

export default function BulkEntryPage() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [allRows, setAllRows] = useState<CardDataRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Filters ───────────────────────────────────────────────────────────────
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'STUDENT' | 'STAFF'>('ALL')
  const [deptFilter, setDeptFilter] = useState('ALL')
  const [sectionFilter, setSectionFilter] = useState('ALL')
  const [semesterFilter, setSemesterFilter] = useState('ALL')

  // ── Device / scan ─────────────────────────────────────────────────────────
  const [port, setPort] = useState<any>(null)
  const [deviceName, setDeviceName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [serialError, setSerialError] = useState<string | null>(null)

  // ── Table state ───────────────────────────────────────────────────────────
  const [activeRowIdx, setActiveRowIdx] = useState(0)
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})

  // ── Refs to avoid stale closures in serial loop ───────────────────────────
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null)
  const bufferRef = useRef('')
  const lastScanRef = useRef<{ uid: string; time: number }>({ uid: '', time: 0 })
  const activeRowIdxRef = useRef(0)
  const filteredRowsRef = useRef<CardDataRow[]>([])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const serialSupported = typeof (navigator as any).serial !== 'undefined'

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchCardsData()
      .then((data) => {
        setAllRows(data)
        const states: Record<string, RowState> = {}
        data.forEach((row) => {
          states[rowKey(row)] = { uid: row.rfid_uid ?? '', phase: 'idle', error: null }
        })
        setRowStates(states)
        setLoading(false)
      })
      .catch((e: any) => {
        setLoadError(e?.message || 'Failed to load data')
        setLoading(false)
      })
  }, [])

  // ── Filter options ────────────────────────────────────────────────────────
  const availableDepts = useMemo(() => {
    const depts = new Set<string>()
    allRows.forEach((r) => { if (r.department) depts.add(r.department) })
    return Array.from(depts).sort()
  }, [allRows])

  const availableSections = useMemo(() => {
    let rows = allRows.filter((r) => r.role === 'STUDENT')
    if (deptFilter !== 'ALL') rows = rows.filter((r) => r.department === deptFilter)
    const sections = new Set<string>()
    rows.forEach((r) => { if (r.section) sections.add(r.section) })
    return Array.from(sections).sort()
  }, [allRows, deptFilter])

  const availableSemesters = useMemo(() => {
    let rows = allRows.filter((r) => r.role === 'STUDENT')
    if (deptFilter !== 'ALL') rows = rows.filter((r) => r.department === deptFilter)
    if (sectionFilter !== 'ALL') rows = rows.filter((r) => r.section === sectionFilter)
    const sems = new Set<number>()
    rows.forEach((r) => { if (r.semester != null) sems.add(r.semester) })
    return Array.from(sems).sort((a, b) => a - b)
  }, [allRows, deptFilter, sectionFilter])

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let rows = allRows
    if (roleFilter !== 'ALL') rows = rows.filter((r) => r.role === roleFilter)
    if (deptFilter !== 'ALL') rows = rows.filter((r) => r.department === deptFilter)
    if (sectionFilter !== 'ALL') rows = rows.filter((r) => r.section === sectionFilter)
    if (semesterFilter !== 'ALL') rows = rows.filter((r) => r.semester === Number(semesterFilter))
    return [...rows].sort((a, b) =>
      (a.username ?? '').localeCompare(b.username ?? '', undefined, { numeric: true, sensitivity: 'base' })
    )
  }, [allRows, roleFilter, deptFilter, sectionFilter, semesterFilter])

  // Keep scroll-refs up to date
  useEffect(() => {
    filteredRowsRef.current = filteredRows
    inputRefs.current = inputRefs.current.slice(0, filteredRows.length)
  }, [filteredRows])

  // Reset active row when filters change
  useEffect(() => {
    activeRowIdxRef.current = 0
    setActiveRowIdx(0)
  }, [roleFilter, deptFilter, sectionFilter, semesterFilter])

  // Focus active input whenever activeRowIdx changes
  useEffect(() => {
    activeRowIdxRef.current = activeRowIdx
    const inp = inputRefs.current[activeRowIdx]
    if (inp && document.activeElement !== inp) {
      inp.focus()
      inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeRowIdx])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function advanceRow(fromIdx: number) {
    const rows = filteredRowsRef.current
    const next = fromIdx + 1 < rows.length ? fromIdx + 1 : fromIdx
    activeRowIdxRef.current = next
    setActiveRowIdx(next)
  }

  async function assignRow(row: CardDataRow, uid: string) {
    const key = rowKey(row)

    setRowStates((prev) => ({ ...prev, [key]: { uid, phase: 'assigning', error: null } }))

    try {
      if (row.role === 'STUDENT') {
        await assignUID(row.id, uid)
      } else {
        await assignStaffUID(row.id, uid)
      }

      // Update cached allRows so current RFID column reflects the new value
      setAllRows((prev) =>
        prev.map((r) =>
          r.role === row.role && r.id === row.id
            ? { ...r, rfid_uid: uid, status: 'Connected' as const }
            : r,
        ),
      )

      setRowStates((prev) => ({ ...prev, [key]: { uid, phase: 'success', error: null } }))

      // Auto-advance after a brief flash of the checkmark
      setTimeout(() => {
        setRowStates((prev) => {
          // Only reset if still showing success (not already overwritten)
          if (prev[key]?.phase === 'success') {
            return { ...prev, [key]: { uid, phase: 'idle', error: null } }
          }
          return prev
        })
        advanceRow(activeRowIdxRef.current)
      }, 700)
    } catch (e: any) {
      setRowStates((prev) => ({
        ...prev,
        [key]: { uid, phase: 'error', error: e?.message || 'Failed to assign' },
      }))
    }
  }

  // ── Serial scan ───────────────────────────────────────────────────────────
  // processUID is called inside the serial loop — must use refs to avoid stale closure
  const processUID = useCallback((uid: string) => {
    const rows = filteredRowsRef.current
    const idx = activeRowIdxRef.current
    if (idx < 0 || idx >= rows.length) return
    void assignRow(rows[idx], uid)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // stable — uses refs only

  const handleSelectPort = async () => {
    try {
      let p: any
      try {
        p = await (navigator as any).serial.requestPort({ filters: SERIAL_FILTERS })
      } catch (err: any) {
        if (err?.name === 'NotAllowedError') return
        p = await (navigator as any).serial.requestPort()
      }
      setPort(p)
      try {
        const info = p.getInfo?.()
        if (info?.usbVendorId) {
          const vid = (info.usbVendorId as number).toString(16).padStart(4, '0')
          const pid = ((info.usbProductId ?? 0) as number).toString(16).padStart(4, '0')
          setDeviceName(`USB Device (${vid.toUpperCase()}:${pid.toUpperCase()})`)
        } else {
          setDeviceName('USB Serial Device')
        }
      } catch {
        setDeviceName('USB Serial Device')
      }
      setSerialError(null)
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError')
        setSerialError('Could not select port: ' + (e?.message ?? String(e)))
    }
  }

  const handleStartScan = async () => {
    if (!port) return
    setScanning(true)
    setSerialError(null)
    try {
      try {
        await port.open({ baudRate: 115200 })
      } catch {
        // port may already be open
      }
      if (!port.readable) throw new Error('Port has no readable stream')

      const decoder = new TextDecoderStream()
      port.readable.pipeTo(decoder.writable).catch(() => {})
      const reader = decoder.readable.getReader()
      readerRef.current = reader

      ;(async () => {
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            bufferRef.current += value
            const normalized = bufferRef.current.replace(/\r/g, '\n')
            const lines = normalized.split('\n')
            bufferRef.current = lines.pop() ?? ''

            for (const raw of lines) {
              const trimmed = raw.trim().toUpperCase()
              const spacedMatch = trimmed.match(/[0-9A-F]{2}(?:[: ][0-9A-F]{2}){3,}/)
              let uid = ''
              if (spacedMatch) {
                uid = spacedMatch[0].replace(/[^0-9A-F]/g, '')
              } else {
                const compactMatch = trimmed.match(/[0-9A-F]{8,}/)
                uid = compactMatch ? compactMatch[0] : ''
              }
              if (uid.length < 8) continue

              const now = Date.now()
              if (uid === lastScanRef.current.uid && now - lastScanRef.current.time < 1500) continue
              lastScanRef.current = { uid, time: now }
              processUID(uid)
            }
          }
        } catch {
          // reader stopped
        } finally {
          setScanning(false)
        }
      })()
    } catch (e: any) {
      setScanning(false)
      setSerialError('Could not start scan: ' + (e?.message ?? String(e)))
    }
  }

  const handleStopScan = async () => {
    try { await readerRef.current?.cancel() } catch {}
    try { await port?.close() } catch {}
    readerRef.current = null
    bufferRef.current = ''
    setScanning(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { readerRef.current?.cancel() } catch {}
      try { port?.close() } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port])

  // ── Manual input handlers ─────────────────────────────────────────────────
  function handleInputChange(key: string, value: string, idx: number) {
    activeRowIdxRef.current = idx
    setActiveRowIdx(idx)
    setRowStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], uid: value, phase: 'idle', error: null },
    }))
  }

  function handleInputKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    row: CardDataRow,
    idx: number,
  ) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const uid = (e.currentTarget.value ?? '').trim()
      if (uid.length >= 4) {
        void assignRow(row, uid)
      } else {
        advanceRow(idx)
      }
    }
  }

  // ── Row styling ───────────────────────────────────────────────────────────
  function rowBg(idx: number, row: CardDataRow): string {
    const phase = rowStates[rowKey(row)]?.phase ?? 'idle'
    if (idx === activeRowIdx) return 'bg-blue-50 ring-1 ring-inset ring-blue-300'
    if (phase === 'success') return 'bg-green-50'
    if (phase === 'error') return 'bg-red-50'
    return idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
  }

  const showSectionFilter = roleFilter !== 'STAFF'

  const assignedCount = filteredRows.filter((r) => {
    const rs = rowStates[rowKey(r)]
    return (rs?.uid || r.rfid_uid)
  }).length

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="px-4 py-6 space-y-4 max-w-[1600px] mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bulk RFID Entry</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Filter the list, connect your scanner, then scan cards row-by-row.
            </p>
          </div>
          {scanning && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 border border-green-200 rounded-full px-3 py-1.5 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Scanning Live
            </span>
          )}
        </div>

        {/* ── Step cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Step 1 — Filters */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <span className="text-sm font-semibold text-gray-700">Filter List</span>
              <span className="ml-auto text-xs text-gray-400">
                {filteredRows.length} of {allRows.length} shown
                {filteredRows.length > 0 && (
                  <span className="ml-2 text-green-600">{assignedCount} assigned</span>
                )}
              </span>
            </div>
            <div className="p-4 flex flex-wrap gap-3">
              {/* Role */}
              <div className="flex-1 min-w-[110px]">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Role
                </label>
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value as 'ALL' | 'STUDENT' | 'STAFF')
                    setSectionFilter('ALL')
                    setSemesterFilter('ALL')
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="ALL">All</option>
                  <option value="STUDENT">Student</option>
                  <option value="STAFF">Staff</option>
                </select>
              </div>

              {/* Department */}
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Department
                </label>
                <select
                  value={deptFilter}
                  onChange={(e) => {
                    setDeptFilter(e.target.value)
                    setSectionFilter('ALL')
                    setSemesterFilter('ALL')
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="ALL">All Departments</option>
                  {availableDepts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Section (students only) */}
              {showSectionFilter && (
                <div className="flex-1 min-w-[110px]">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Section
                  </label>
                  <select
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="ALL">All Sections</option>
                    {availableSections.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Semester (students only) */}
              {showSectionFilter && (
                <div className="flex-1 min-w-[110px]">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Semester
                  </label>
                  <select
                    value={semesterFilter}
                    onChange={(e) => setSemesterFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="ALL">All Semesters</option>
                    {availableSemesters.map((n) => (
                      <option key={n} value={n}>Sem {n}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Step 2 — Device */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                2
              </span>
              <span className="text-sm font-semibold text-gray-700">Select Device & Scan</span>
            </div>
            <div className="p-4 space-y-3">
              {!serialSupported && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  ⚠️ Web Serial API not supported. Use{' '}
                  <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSelectPort}
                  disabled={!serialSupported || scanning}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition"
                >
                  <Cpu className="w-4 h-4" />
                  Select USB Port
                </button>

                {port && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-green-800 leading-tight">
                        {deviceName || 'Device connected'}
                      </div>
                      <div className="text-xs text-green-600">115200 baud · ready</div>
                    </div>
                  </div>
                )}

                {port && !scanning && (
                  <button
                    onClick={handleStartScan}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition"
                  >
                    <ScanLine className="w-4 h-4" />
                    Start Scan
                  </button>
                )}

                {scanning && (
                  <button
                    onClick={handleStopScan}
                    className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    Stop Scan
                  </button>
                )}
              </div>

              {serialError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                  {serialError}
                </div>
              )}

              {scanning && filteredRows.length > 0 && (
                <div className="text-xs text-gray-500">
                  Active row:{' '}
                  <strong className="text-gray-800">{activeRowIdx + 1}</strong>{' '}
                  of {filteredRows.length} —{' '}
                  <span className="font-medium text-indigo-700">
                    {filteredRows[activeRowIdx]?.name || filteredRows[activeRowIdx]?.identifier}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              3
            </span>
            <span className="text-sm font-semibold text-gray-700">RFID Assignment Table</span>
            <span className="text-xs text-gray-400 ml-1">
              — Click any row to move the scanner to that position
            </span>
            {filteredRows.length > 0 && (
              <span className="ml-auto text-xs text-gray-500">
                <span className="text-green-600 font-semibold">{assignedCount}</span>
                {' / '}
                {filteredRows.length} assigned
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-400" />
              <div className="text-sm text-gray-500">Loading data…</div>
            </div>
          ) : loadError ? (
            <div className="p-10 text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
              <div className="text-sm text-red-600">{loadError}</div>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              No records match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[180px]">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">ID / Reg No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Dept</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Section</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Current RFID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[220px]">
                      Scan / Enter RFUID
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const key = rowKey(row)
                    const rs: RowState = rowStates[key] ?? { uid: row.rfid_uid ?? '', phase: 'idle', error: null }
                    const isActive = idx === activeRowIdx

                    return (
                      <tr
                        key={key}
                        className={`border-b border-gray-100 cursor-pointer transition-colors ${rowBg(idx, row)}`}
                        onClick={() => {
                          activeRowIdxRef.current = idx
                          setActiveRowIdx(idx)
                          inputRefs.current[idx]?.focus()
                        }}
                      >
                        {/* # with active indicator */}
                        <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              {idx + 1}
                            </span>
                          ) : (
                            idx + 1
                          )}
                        </td>

                        {/* Name + avatar */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar url={row.profile_image_url} name={row.name} />
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 leading-tight truncate">
                                {row.username || row.identifier}
                              </div>
                              <div className="text-xs text-gray-400 font-mono truncate">{row.identifier}</div>
                            </div>
                          </div>
                        </td>

                        {/* Identifier — kept for reference, now hidden via column removal */}
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{row.identifier}</td>

                        {/* Role badge */}
                        <td className="px-4 py-2.5">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                              row.role === 'STUDENT'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}
                          >
                            {row.role}
                          </span>
                        </td>

                        {/* Dept */}
                        <td className="px-4 py-2.5 text-xs text-gray-600">{row.department || '—'}</td>

                        {/* Section */}
                        <td className="px-4 py-2.5 text-xs text-gray-600">{row.section || '—'}</td>

                        {/* Current RFID */}
                        <td className="px-4 py-2.5">
                          {row.rfid_uid ? (
                            <span className="font-mono text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                              {row.rfid_uid}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">None</span>
                          )}
                        </td>

                        {/* RFUID input — stops row click from propagating */}
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            ref={(el) => { inputRefs.current[idx] = el }}
                            type="text"
                            value={rs.uid}
                            onChange={(e) => handleInputChange(key, e.target.value, idx)}
                            onFocus={() => {
                              activeRowIdxRef.current = idx
                              setActiveRowIdx(idx)
                            }}
                            onKeyDown={(e) => handleInputKeyDown(e, row, idx)}
                            placeholder="Scan card or type UID…"
                            disabled={rs.phase === 'assigning'}
                            className={`w-full border rounded-lg px-3 py-1.5 text-xs font-mono outline-none transition-all ${
                              isActive
                                ? 'border-blue-400 ring-2 ring-blue-100 bg-white'
                                : rs.phase === 'success'
                                ? 'border-green-300 bg-green-50 text-green-700'
                                : rs.phase === 'error'
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-gray-200 bg-white hover:border-gray-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                            }`}
                          />
                          {rs.phase === 'error' && rs.error && (
                            <div className="text-[10px] text-red-500 mt-0.5 leading-tight">{rs.error}</div>
                          )}
                        </td>

                        {/* Status icon */}
                        <td className="px-4 py-2.5 text-center">
                          {rs.phase === 'assigning' && (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mx-auto" />
                          )}
                          {rs.phase === 'success' && (
                            <Check
                              className="w-4 h-4 text-green-600 mx-auto"
                              strokeWidth={3}
                              aria-label="Assigned successfully"
                            />
                          )}
                          {rs.phase === 'error' && (
                            <AlertCircle
                              className="w-4 h-4 text-red-500 mx-auto"
                              aria-label={rs.error ?? 'Error'}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
