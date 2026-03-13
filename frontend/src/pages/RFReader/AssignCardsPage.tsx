import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  assignUID,
  assignStaffUID,
  lookupAny,
  searchStaff,
  searchStudents,
  type ScannedStaff,
  type ScannedStudent,
} from '../../services/idscan'

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

type PopupState =
  | { kind: 'student'; profile: ScannedStudent; uid: string }
  | { kind: 'staff'; profile: ScannedStaff; uid: string }

type AssignCandidate =
  | { kind: 'student'; id: number; title: string; subtitle?: string; profile: ScannedStudent }
  | { kind: 'staff'; id: number; title: string; subtitle?: string; profile: ScannedStaff }

function coerceArray<T>(v: any): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && Array.isArray(v.results)) return v.results as T[]
  return []
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-medium text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function StudentCard({ student, uid, onClose }: { student: ScannedStudent; uid: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative bg-white rounded-3xl shadow-2xl border-4 border-indigo-400 w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-widest text-indigo-100">Card Recognised</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-indigo-50 border-indigo-200 text-indigo-700">STUDENT</span>
              </div>
              <div className="text-xl font-bold truncate">{student.name}</div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 pt-4 pb-5 space-y-1.5">
          <Row label="Reg No" value={student.reg_no} />
          {student.department && <Row label="Department" value={student.department} />}
          {student.batch && <Row label="Batch" value={student.batch} />}
          {student.section && <Row label="Section" value={student.section} />}
          <Row label="Status" value={student.status} />
          <Row label="UID" value={uid} mono />
        </div>
      </div>
    </div>
  )
}

function StaffCard({ staff, uid, onClose }: { staff: ScannedStaff; uid: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative bg-white rounded-3xl shadow-2xl border-4 border-emerald-400 w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-widest text-emerald-100">Card Recognised</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-emerald-50 border-emerald-200 text-emerald-700">STAFF</span>
              </div>
              <div className="text-xl font-bold truncate">{staff.name}</div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 pt-4 pb-5 space-y-1.5">
          <Row label="Staff ID" value={staff.staff_id} />
          {staff.department && <Row label="Department" value={staff.department} />}
          {staff.designation && <Row label="Designation" value={staff.designation} />}
          <Row label="Status" value={staff.status} />
          <Row label="UID" value={uid} mono />
        </div>
      </div>
    </div>
  )
}

export default function RFReaderAssignCardsPage() {
  const [popup, setPopup] = useState<PopupState | null>(null)

  const [pendingUid, setPendingUid] = useState<string | null>(null)

  const [assignQuery, setAssignQuery] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignResults, setAssignResults] = useState<AssignCandidate[]>([])
  const [assignSelected, setAssignSelected] = useState<AssignCandidate | null>(null)

  const [port, setPort] = useState<any | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [serialError, setSerialError] = useState<string | null>(null)

  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null)
  const bufferRef = useRef('')
  const lastScanRef = useRef<{ uid: string; time: number }>({ uid: '', time: 0 })

  const serialSupported = typeof (navigator as any).serial !== 'undefined'

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
      if (e?.name !== 'NotAllowedError') setSerialError('Could not select port: ' + (e?.message ?? String(e)))
    }
  }

  const closePopup = () => setPopup(null)

  const processUID = useCallback(async (uid: string) => {
    setPopup(null)

    try {
      const result = await lookupAny(uid)
      if (result.found && result.profile_type === 'student') {
        setPendingUid(null)
        setPopup({ kind: 'student', profile: result.profile, uid })
        return
      }
      if (result.found && result.profile_type === 'staff') {
        setPendingUid(null)
        setPopup({ kind: 'staff', profile: result.profile, uid })
        return
      }

      setPendingUid(uid)
      setAssignQuery('')
      setAssignResults([])
      setAssignSelected(null)
      setAssignError(null)
    } catch (e: any) {
      setSerialError(String(e?.message ?? e))
    }
  }, [])

  const handleStartScan = async () => {
    if (!port) return
    setScanning(true)
    setSerialError(null)

    try {
      try {
        await port.open({ baudRate: 115200 })
      } catch {
        // already open
      }

      if (!port.readable) throw new Error('Port has no readable stream')

      const decoder = new TextDecoderStream()
      port.readable.pipeTo(decoder.writable).catch(() => {})
      const reader = decoder.readable.getReader()
      readerRef.current = reader

      ;(async () => {
        try {
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
              if (spacedMatch) uid = spacedMatch[0].replace(/[^0-9A-F]/g, '')
              else {
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
          // stop
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
    try {
      await readerRef.current?.cancel()
    } catch {}
    try {
      await port?.close()
    } catch {}
    readerRef.current = null
    bufferRef.current = ''
    setScanning(false)
  }

  useEffect(() => {
    return () => {
      try {
        readerRef.current?.cancel()
      } catch {}
      try {
        port?.close()
      } catch {}
    }
  }, [port])

  useEffect(() => {
    let cancelled = false

    if (!pendingUid) {
      setAssignResults([])
      setAssignSelected(null)
      setAssignLoading(false)
      setAssignError(null)
      return
    }

    const q = assignQuery.trim()
    if (q.length < 1) {
      setAssignResults([])
      setAssignSelected(null)
      setAssignLoading(false)
      setAssignError(null)
      return
    }

    setAssignLoading(true)
    setAssignError(null)

    const t = window.setTimeout(async () => {
      try {
        const [studentsRaw, staffRaw] = await Promise.all([searchStudents(q), searchStaff(q)])
        if (cancelled) return

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

        setAssignResults(merged)
        setAssignSelected((prev) => {
          if (!prev) return null
          return merged.find((m) => m.kind === prev.kind && m.id === prev.id) ?? null
        })
      } catch (e: any) {
        if (!cancelled) setAssignError(String(e?.message ?? e))
      } finally {
        if (!cancelled) setAssignLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [assignQuery, pendingUid])

  const handleAssign = useCallback(async () => {
    if (!pendingUid || !assignSelected) return

    const uid = pendingUid
    setAssignError(null)

    try {
      if (assignSelected.kind === 'student') await assignUID(assignSelected.id, uid)
      else await assignStaffUID(assignSelected.id, uid)

      setPendingUid(null)
      setAssignQuery('')
      setAssignResults([])
      setAssignSelected(null)

      lastScanRef.current = { uid: '', time: 0 }
      await processUID(uid)
    } catch (e: any) {
      setAssignError(String(e?.message ?? e))
    }
  }, [assignSelected, pendingUid, processUID])

  return (
    <main className="min-h-screen bg-gray-50">
      {popup?.kind === 'student' && (
        <StudentCard student={popup.profile} uid={popup.uid} onClose={closePopup} />
      )}
      {popup?.kind === 'staff' && (
        <StaffCard staff={popup.profile} uid={popup.uid} onClose={closePopup} />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">RFID Card Assignment</h1>
            <p className="text-sm text-gray-500 mt-0.5">Scan a card. If it’s new, assign it to Student/Staff using one search box.</p>
          </div>
          {scanning && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 border border-green-200 rounded-full px-3 py-1.5 flex-shrink-0 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
        </div>

        {!serialSupported && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            ⚠️ Web Serial API is not supported in this browser. Use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-sm font-semibold text-gray-700">Connect Scanner</span>
          </div>

          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSelectPort}
                disabled={!serialSupported || scanning}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition"
              >
                Select USB Port
              </button>

              {port && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-green-800 leading-tight">{deviceName || 'Device connected'}</div>
                    <div className="text-xs text-green-600">115200 baud · ready</div>
                  </div>
                </div>
              )}

              {port && !scanning && (
                <button
                  onClick={handleStartScan}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition"
                >
                  Start Scan
                </button>
              )}
              {scanning && (
                <button
                  onClick={handleStopScan}
                  className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition"
                >
                  Stop Scan
                </button>
              )}

              {pendingUid && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
                  Unknown card: <span className="font-mono">{pendingUid}</span>
                </span>
              )}
            </div>

            {serialError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                {serialError}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Assign Card</span>
            {pendingUid ? (
              <span className="font-mono text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-2 py-0.5">{pendingUid}</span>
            ) : (
              <span className="text-xs text-gray-400 italic">Scan an unrecognised card first</span>
            )}
          </div>

          <div className="p-5 space-y-3">
            <input
              type="text"
              value={assignQuery}
              onChange={(e) => setAssignQuery(e.target.value)}
              disabled={!pendingUid}
              placeholder="Type Reg No / Student Name / Staff ID / Staff Name"
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none border-gray-200 disabled:bg-gray-50"
            />

            {assignError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{assignError}</p>
            )}

            <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              {assignLoading && <div className="p-3 text-xs text-gray-500">Searching…</div>}
              {!assignLoading && pendingUid && assignResults.length === 0 && assignQuery.trim().length > 0 && (
                <div className="p-3 text-xs text-gray-400">No results</div>
              )}

              {!assignLoading && assignResults.map((r) => {
                const active = assignSelected?.kind === r.kind && assignSelected?.id === r.id
                return (
                  <button
                    key={`${r.kind}:${r.id}`}
                    onClick={() => setAssignSelected(r)}
                    className={
                      'w-full text-left px-3 py-2 border-b last:border-b-0 ' +
                      (active ? 'bg-slate-100' : 'hover:bg-slate-50')
                    }
                  >
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
                      <div className="text-sm font-medium truncate">{r.title}</div>
                    </div>
                    {r.subtitle && <div className="text-xs opacity-70 mt-0.5">{r.subtitle}</div>}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAssign}
                disabled={!pendingUid || !assignSelected}
                className="flex-1 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Assign Card
              </button>
              <button
                onClick={() => {
                  setPendingUid(null)
                  setAssignQuery('')
                  setAssignResults([])
                  setAssignSelected(null)
                  setAssignError(null)
                }}
                disabled={!pendingUid}
                className="flex-1 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
