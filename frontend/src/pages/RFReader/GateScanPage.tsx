import React, { useCallback, useEffect, useRef, useState } from 'react'
import { gatepassCheck, GatepassCheckResult } from '../../services/idscan'

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
  } catch {
    return 'USB Serial Device'
  }
}

async function enterFullscreen() {
  try {
    await document.documentElement.requestFullscreen()
  } catch {}
}

async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
  } catch {}
}

type Flash =
  | null
  | {
      kind: 'allowed' | 'denied'
      title: string
      subtitle?: string
      detail?: string
      studentLine?: string
    }

export default function RFReaderGateScanPage() {
  const [port, setPort] = useState<any | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const [error, setError] = useState<string>('')

  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null)
  const buffer = useRef('')
  const lastScan = useRef<{ uid: string; time: number }>({ uid: '', time: 0 })
  const flashTimer = useRef<number | null>(null)

  const serialSupported = typeof (navigator as any).serial !== 'undefined'

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      ;(async () => {
        try {
          await readerRef.current?.cancel()
        } catch {}
        try {
          await port?.close()
        } catch {}
        try {
          await exitFullscreen()
        } catch {}
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelectPort = async () => {
    setError('')
    try {
      let p: any
      try {
        p = await (navigator as any).serial.requestPort({ filters: SERIAL_FILTERS })
      } catch (err: any) {
        if (err?.name === 'NotAllowedError') return
        try {
          p = await (navigator as any).serial.requestPort()
        } catch (e2: any) {
          if (e2?.name === 'NotAllowedError') return
          throw e2
        }
      }
      setPort(p)
      setDeviceName(getDeviceName(p))
    } catch (e: any) {
      setError(e?.message || 'Could not select USB port')
    }
  }

  const stopScan = useCallback(async () => {
    try {
      await readerRef.current?.cancel()
    } catch {}
    try {
      await port?.close()
    } catch {}
    setScanning(false)
    setFlash(null)
    await exitFullscreen()
  }, [port])

  const showFlash = useCallback((next: Flash) => {
    setFlash(next)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800)
  }, [])

  const processUID = useCallback(
    async (uid: string) => {
      try {
        const result: GatepassCheckResult = await gatepassCheck(uid)
        const profile: any = (result.profile as any) || result.student || (result as any).staff
        const studentLine = profile
          ? `${profile.reg_no || profile.staff_id || ''}${profile.reg_no || profile.staff_id ? ' • ' : ''}${profile.name || ''}`.trim()
          : undefined

        const timeline = result.approval_timeline || []
        const rejectedStep = timeline.find((s) => s.status === 'REJECTED')
        const pendingStep = timeline.find((s) => s.status === 'PENDING')
        const flowDetail = rejectedStep?.step_role
          ? `Rejected at: ${rejectedStep.step_role}`
          : pendingStep?.step_role
          ? `Awaiting: ${pendingStep.step_role}`
          : undefined

        if (result.allowed) {
          const isLate = result.late_return === true
          showFlash({
            kind: 'allowed',
            title: isLate ? 'LATE' : 'ALLOWED',
            subtitle: isLate ? (result.message || 'Late return recorded.') : (result.message || 'You may leave the college.'),
            detail: flowDetail,
            studentLine,
          })
          return
        }

        const deniedTitle = (() => {
          switch (result.reason) {
            case 'no_gatepass':
              return 'NOT APPLIED'
            case 'outside_gate_window':
              // User request: if OUT time not started, show it clearly in red.
              if (result.window_status === 'before_start') return 'OUT TIME NOT STARTED'
              if (result.window_status === 'after_end') return 'TIME OVER'
              return 'OUTSIDE WINDOW'
            case 'not_approved':
              return 'REJECTED'
            case 'not_fully_approved':
              return 'PENDING'
            case 'unknown_uid':
              return 'UNKNOWN CARD'
            default:
              return 'DENIED'
          }
        })()

        const deniedSubtitle = (() => {
          if (result.reason === 'no_gatepass') {
            return result.message || 'Gatepass not applied.'
          }
          if (result.reason === 'outside_gate_window') {
            if (result.window_status === 'before_start') {
              return result.message || 'Out time is not started yet.'
            }
            if (result.window_status === 'after_end') {
              return result.message || 'Allowed time is over.'
            }
            return result.message || 'Outside allowed time window.'
          }
          return result.message || 'Not permitted.'
        })()

        showFlash({
          kind: 'denied',
          title: deniedTitle,
          subtitle: deniedSubtitle,
          detail: flowDetail,
          studentLine,
        })
      } catch (e: any) {
        showFlash({
          kind: 'denied',
          title: 'DENIED',
          subtitle: e?.message || 'Error',
        })
      }
    },
    [showFlash],
  )

  const handleStartScan = async () => {
    setError('')
    if (!port) return

    if (scanning) {
      await enterFullscreen()
      return
    }

    await enterFullscreen()
    setScanning(true)

    try {
      await port.open({ baudRate: 115200 })
    } catch {}

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

            await processUID(uid)
          }
        }
      } catch {}
      finally {
        setScanning(false)
      }
    })()
  }

  if (scanning) {
    const isAllowed = flash?.kind === 'allowed'
    const isDenied = flash?.kind === 'denied'

    return (
      <main
        className={`min-h-screen flex items-center justify-center px-6 ${
          isAllowed ? 'bg-green-600' : isDenied ? 'bg-red-600' : 'bg-black'
        }`}
      >
        <div className="w-full max-w-3xl text-center text-white space-y-4">
          {!flash ? (
            <>
              <div className="text-4xl sm:text-5xl font-extrabold tracking-tight">READY</div>
              <div className="text-xl sm:text-2xl font-semibold opacity-90">Place your card</div>
            </>
          ) : (
            <>
              <div className="text-5xl sm:text-6xl font-extrabold tracking-tight">{flash.title}</div>
              {flash.subtitle && <div className="text-xl sm:text-2xl font-semibold opacity-95">{flash.subtitle}</div>}
              {flash.detail && <div className="text-lg sm:text-xl font-semibold opacity-95">{flash.detail}</div>}
              {flash.studentLine && <div className="text-base sm:text-lg opacity-90">{flash.studentLine}</div>}
            </>
          )}

          <div className="pt-6">
            <button
              onClick={stopScan}
              className="inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-6 py-3 text-sm font-semibold"
            >
              Stop scan
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GateScan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select USB device, start scan, then scan cards in fullscreen</p>
        </div>

        {!serialSupported && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            Web Serial API requires Google Chrome or Microsoft Edge.
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-sm font-semibold text-gray-700">Select USB device</span>
          </div>
          <div className="p-5 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSelectPort}
              disabled={!serialSupported}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition"
            >
              Select USB device
            </button>
            {port && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-green-800">{deviceName || 'Device connected'}</div>
                  <div className="text-xs text-green-600">115200 baud · ready</div>
                </div>
                <button onClick={handleSelectPort} className="ml-2 text-xs text-green-700 hover:text-green-900 underline">
                  Change
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${port ? 'bg-indigo-600' : 'bg-gray-300'}`}>
              2
            </span>
            <span className="text-sm font-semibold text-gray-700">Start scan</span>
          </div>
          <div className="p-5">
            {!port ? (
              <p className="text-sm text-gray-400 italic">Select a USB device first.</p>
            ) : (
              <button
                onClick={handleStartScan}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-xl px-6 py-2.5 text-sm font-semibold shadow-sm transition"
              >
                Start scan
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
