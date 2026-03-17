import React, { useCallback, useRef, useState } from 'react'
import { gatepassCheck, GatepassCheckResult, GatepassTimelineStep } from '../../services/idscan'

// â”€â”€â”€ USB filtering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SERIAL_FILTERS = [
  { usbVendorId: 0x1a86, usbProductId: 0x7523 },
  { usbVendorId: 0x1a86, usbProductId: 0x5523 },
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 },
  { usbVendorId: 0x10c4, usbProductId: 0xea60 },
  { usbVendorId: 0x0403, usbProductId: 0x6001 },
  { usbVendorId: 0x0403, usbProductId: 0x6015 },
  { usbVendorId: 0x2341, usbProductId: 0x0043 },
  { usbVendorId: 0x2341, usbProductId: 0x0001 },
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
  } catch { return 'USB Serial Device' }
}

// â”€â”€â”€ Compact horizontal approval timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STEP_COLORS: Record<string, { dot: string; text: string; label: string }> = {
  APPROVED:  { dot: 'bg-green-500',  text: 'text-green-700',  label: 'Approved' },
  SUBMITTED: { dot: 'bg-blue-500',   text: 'text-blue-700',   label: 'Submitted' },
  REJECTED:  { dot: 'bg-red-500',    text: 'text-red-700',    label: 'Rejected' },
  SKIPPED:   { dot: 'bg-gray-300',   text: 'text-gray-500',   label: 'Skipped' },
  PENDING:   { dot: 'bg-white border-2 border-amber-400', text: 'text-amber-600', label: 'Pending' },
}

function MiniTimeline({ steps }: { steps: GatepassTimelineStep[] }) {
  if (!steps.length) return null
  return (
    <div className="relative flex items-start justify-between pt-1">
      {/* single connector line spanning dot centres */}
      <div className="absolute top-[17px] left-[14px] right-[14px] h-0.5 bg-gray-200 z-0" />
      {steps.map((step, i) => {
        const c = STEP_COLORS[step.status] ?? STEP_COLORS.PENDING
        return (
          <div key={i} className="relative z-10 flex flex-col items-center flex-1 gap-1 min-w-[72px]">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${c.dot} ${step.status === 'PENDING' ? '' : 'text-white'}`}>
              {step.status === 'APPROVED'
                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                : step.status === 'REJECTED'
                  ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  : step.step_order}
            </div>
            <div className="text-[10px] font-semibold text-gray-600 text-center leading-tight max-w-[72px] truncate">
              {step.step_role || '?'}
            </div>
            <div className={`text-[9px] font-bold ${c.text} text-center`}>
              {c.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// â”€â”€â”€ Scan log row type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type LogEntry = { uid: string; timestamp: Date; allowed: boolean; name?: string; message: string }

// â”€â”€â”€ Result popup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ResultPopup({ result, onClose }: { result: GatepassCheckResult; onClose: () => void }) {
  const allowed = result.allowed
  const alreadyExited = result.reason === 'already_scanned'
  // already_exited shows as green info, not red denied
  const isGreen = allowed || alreadyExited
  const student = result.student
  const timeline = result.approval_timeline ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`relative w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border-4 ${isGreen ? 'border-green-400' : 'border-red-400'}`}>

        {/* Header */}
        <div className={`px-6 py-5 text-white ${isGreen ? 'bg-gradient-to-r from-green-600 to-emerald-500' : 'bg-gradient-to-r from-red-600 to-rose-500'}`}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 text-white">
              {isGreen ? (
                <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-widest opacity-80">
                {allowed ? 'Gatepass Approved' : alreadyExited ? 'Already Exited' : 'Access Denied'}
              </div>
              <div className="text-2xl font-extrabold leading-tight">
                {allowed
                  ? 'You may leave the college'
                  : result.message || 'Not permitted'}
              </div>
            </div>
          </div>
        </div>

        {/* Student details */}
        <div className="bg-white px-6 pt-4 pb-2 space-y-1.5">
          {student && (
            <>
              <Row label="Name"        value={student.name} />
              <Row label="Reg No"      value={student.reg_no} />
              {student.department && <Row label="Department" value={student.department} />}
              {student.section       && <Row label="Section"    value={student.section} />}
              <Row label="Status"     value={student.status} />
              {allowed && result.application_type && (
                <Row label="Application" value={result.application_type} />
              )}
              {allowed && result.scanned_at && (
                <Row label="Exited at" value={new Date(result.scanned_at).toLocaleTimeString()} />
              )}
            </>
          )}
        </div>

        {/* Approval timeline */}
        {timeline.length > 0 && (
          <div className="bg-white px-6 pb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-1">
              Approval Timeline
            </div>
            <MiniTimeline steps={timeline} />
          </div>
        )}

        {/* Footer hint */}
        <div className="bg-gray-50 border-t border-gray-100 px-6 py-2.5">
          <p className="text-xs text-center text-gray-400">Scan another card or press &times; to close</p>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/15 hover:bg-black/25 flex items-center justify-center text-white font-bold text-base transition"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  )
}

// â”€â”€â”€ Fullscreen helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function enterFullscreen() {
  try { await document.documentElement.requestFullscreen() } catch {}
}
async function exitFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen() } catch {}
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function IDCSScanGatepassPage() {
  const [port, setPort]             = useState<any | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [scanning, setScanning]     = useState(false)
  const [log, setLog]               = useState<LogEntry[]>([])
  const [popup, setPopup]           = useState<GatepassCheckResult | null>(null)
  const readerRef                   = useRef<ReadableStreamDefaultReader<string> | null>(null)
  const buffer                      = useRef('')
  const lastScan                    = useRef<{ uid: string; time: number }>({ uid: '', time: 0 })

  const serialSupported = typeof (navigator as any).serial !== 'undefined'

  const handleSelectPort = async () => {
    try {
      let p: any
      try {
        p = await (navigator as any).serial.requestPort({ filters: SERIAL_FILTERS })
      } catch (err: any) {
        if (err.name === 'NotAllowedError') return
        try { p = await (navigator as any).serial.requestPort() }
        catch (e2: any) { if (e2.name !== 'NotAllowedError') alert('Could not select port: ' + e2.message); return }
      }
      setPort(p)
      setDeviceName(getDeviceName(p))
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') alert('Could not select port: ' + e.message)
    }
  }

  const handleStartScan = async () => {
    if (!port) return
    // If already scanning just re-enter fullscreen
    if (scanning) { await enterFullscreen(); return }

    await enterFullscreen()
    setScanning(true)
    try { await port.open({ baudRate: 115200 }) } catch {}

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
            const candidate = trimmed.replace(/^UID\s*[:=\-]?\s*/i, '')
            const uid = candidate.replace(/[^0-9A-F]/g, '')
            if (uid.length < 8) continue
            const now = Date.now()
            if (uid === lastScan.current.uid && now - lastScan.current.time < 2000) continue
            lastScan.current = { uid, time: now }
            processUID(uid)
          }
        }
      } catch {}
      finally { setScanning(false) }
    })()
  }

  const handleStopScan = async () => {
    try { await readerRef.current?.cancel() } catch {}
    try { await port?.close() } catch {}
    setScanning(false)
    await exitFullscreen()
  }

  // Closing the popup exits fullscreen (back to normal browser view)
  const handleClosePopup = async () => {
    setPopup(null)
    await exitFullscreen()
  }

  const processUID = useCallback(async (uid: string) => {
    setPopup(null)
    const ts = new Date()
    try {
      const result = await gatepassCheck(uid)
      setPopup(result)
      setLog(prev => [{
        uid, timestamp: ts, allowed: result.allowed,
        name: result.student?.name, message: result.message,
      }, ...prev.slice(0, 49)])
    } catch (e: any) {
      const errResult: GatepassCheckResult = { allowed: false, message: e.message || 'Error', reason: 'no_gatepass' }
      setPopup(errResult)
      setLog(prev => [{ uid, timestamp: ts, allowed: false, message: e.message || 'Error' }, ...prev.slice(0, 49)])
    }
  }, [])

  return (
    <main className="min-h-screen bg-gray-50">
      {popup && <ResultPopup result={popup} onClose={handleClosePopup} />}

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gatepass Scanner OLD</h1>
            <p className="text-sm text-gray-500 mt-0.5">Scan RFID card to verify exit permission</p>
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
            âš ï¸ Web Serial API requires <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
          </div>
        )}

        {/* Step 1 â€” USB */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-sm font-semibold text-gray-700">Select USB Device</span>
          </div>
          <div className="p-5 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSelectPort}
              disabled={!serialSupported || scanning}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition"
            >
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
                  <div className="text-xs font-bold text-green-800">{deviceName || 'Device connected'}</div>
                  <div className="text-xs text-green-600">115200 baud Â· ready</div>
                </div>
                <button onClick={handleSelectPort} disabled={scanning} className="ml-2 text-xs text-green-700 hover:text-green-900 underline disabled:opacity-40">Change</button>
              </div>
            )}
          </div>
        </div>

        {/* Step 2 â€” Scan */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${port ? 'bg-indigo-600' : 'bg-gray-300'}`}>2</span>
            <span className="text-sm font-semibold text-gray-700">Scan Student Card</span>
          </div>
          <div className="p-5">
            {!port ? (
              <p className="text-sm text-gray-400 italic">Select a USB device above first.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-3">
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
                    Listening on {deviceName || 'serial port'} â€” place card near the readerâ€¦
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scan Log */}
        {log.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Scan Log</span>
                <span className="text-xs text-gray-400 tabular-nums">({log.length})</span>
              </div>
              <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-red-500 transition">Clear</button>
            </div>
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto text-sm">
              {log.map((entry, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.allowed ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span className="font-mono text-xs font-semibold text-gray-700 w-24 flex-shrink-0">{entry.uid}</span>
                  {entry.name && <span className="text-xs font-medium text-gray-800 truncate max-w-[130px]">{entry.name}</span>}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${entry.allowed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {entry.allowed ? 'Allowed' : 'Denied'}
                  </span>
                  <span className="ml-auto text-xs text-gray-400 tabular-nums flex-shrink-0">{entry.timestamp.toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </main>
  )
}
