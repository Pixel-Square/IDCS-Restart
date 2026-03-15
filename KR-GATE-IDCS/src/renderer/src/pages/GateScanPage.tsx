import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiBase } from '../services/apiBase'
import { gatepassCheck, GatepassCheckResult } from '../services/idscan'
import { useConnectivity } from '../state/connectivity'
import { useScanner } from '../state/scanner'
import { useAuth } from '../state/auth'
import { addOfflineRecord } from '../storage/offlineRecords'
import { appendScanLog } from '../storage/scanLogs'
import logo from '../assets/idcs-logo.png'
import AppHeader from '../components/AppHeader'

type Flash =
  | null
  | {
      kind: 'allowed' | 'denied'
      title: string
      subtitle?: string
      detail?: string
      studentLine?: string
      profile?: {
        name: string
        idString: string
        type: string
        imageUrl: string | null
        department: string
        subtitle: string
      }
    }

function isNetworkError(e: any): boolean {
  const msg = String(e?.message || '').toLowerCase()
  return e?.name === 'TypeError' || msg.includes('network') || msg.includes('failed to fetch')
}

const COOLDOWN_MS = 5 * 60 * 1000

function checkCooldown(uid: string): { allowed: true } | { allowed: false; remainingStr: string } {
  const lastStr = window.localStorage.getItem(`cooldown_${uid}`)
  if (!lastStr) return { allowed: true }
  const lastTime = parseInt(lastStr, 10)
  if (isNaN(lastTime)) return { allowed: true }

  const diff = Date.now() - lastTime
  if (diff >= COOLDOWN_MS) return { allowed: true }

  const remaining = COOLDOWN_MS - diff
  const mm = Math.floor(remaining / 60000)
  const ss = Math.floor((remaining % 60000) / 1000)
  return { allowed: false, remainingStr: `${mm}m ${ss}s` }
}

function setCooldown(uid: string) {
  window.localStorage.setItem(`cooldown_${uid}`, Date.now().toString())
}

export default function GateScanPage(): JSX.Element {
  const nav = useNavigate()
  const { me } = useAuth()
  const { isOnline } = useConnectivity()
  const { serialSupported, port, deviceName, selectPort } = useScanner()

  const [scanning, setScanning] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const [error, setError] = useState<string>('')

  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null)
  const buffer = useRef('')
  const lastScan = useRef<{ uid: string; time: number }>({ uid: '', time: 0 })
  const flashTimer = useRef<number | null>(null)

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
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showFlash = useCallback((next: Flash) => {
    setFlash(next)
    // Removed flash timer so the flash stays until next scan or manual stop
  }, [])

  const stopScan = useCallback(async () => {
    try {
      await readerRef.current?.cancel()
    } catch {}
    try {
      await port?.close()
    } catch {}
    setScanning(false)
    setFlash(null)
  }, [port])

  const handleSelect = async () => {
    setError('')
    try {
      await selectPort()
    } catch (e: any) {
      setError(e?.message || 'Could not select USB port')
    }
  }

  const processOffline = useCallback(
    async (uid: string) => {
      const rec = addOfflineRecord(uid)
      // OFFLINE scans are always treated as green entries; show only IN/OUT.
      appendScanLog({ uid, mode: 'OFFLINE', direction: rec.direction, title: rec.direction })
      setCooldown(uid)
      showFlash({ kind: 'allowed', title: rec.direction })
    },
    [showFlash],
  )

  const processOnline = useCallback(
    async (uid: string) => {
      const result: GatepassCheckResult = await gatepassCheck(uid)
      const profile: any = (result.profile as any) || result.student || (result as any).staff
      const studentLine = profile
        ? `${profile.reg_no || profile.staff_id || ''}${profile.reg_no || profile.staff_id ? ' • ' : ''}${profile.name || ''}`.trim()
        : `UID: ${uid}`

      let flashProfile: NonNullable<Flash>['profile'] = undefined
      if (profile) {
        const isStaff = 'staff_id' in profile
        const idStr = profile.reg_no || profile.staff_id || ''
        let imageUrl = profile.profile_image_url || null
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `${getApiBase()}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`
        }
        const profileType = result.profile_type === 'staff' || isStaff ? 'Staff' : 'Student'
        const profileDept = profile.department || ''
        const profileSub = profileType === 'Student'
          ? `${profile.section || ''}${profile.batch ? ` • ${profile.batch}` : ''}`
          : profile.designation || ''

        flashProfile = {
          name: profile.name || '',
          idString: idStr,
          type: profileType,
          imageUrl,
          department: profileDept,
          subtitle: profileSub
        }
      }

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
        const title = isLate ? 'LATE' : 'ALLOWED'
        const subtitle = result.message || (isLate ? 'Late return recorded.' : 'Allowed.')
        appendScanLog({ uid, mode: 'ONLINE', title, subtitle })
        setCooldown(uid)
        showFlash({ kind: 'allowed', title, subtitle, detail: flowDetail, studentLine, profile: flashProfile })
        return
      }

      const deniedTitle = (() => {
        switch (result.reason) {
          case 'no_gatepass':
            return 'NOT APPLIED'
          case 'outside_gate_window':
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
        if (result.reason === 'no_gatepass') return result.message || 'Gatepass not applied.'
        if (result.reason === 'outside_gate_window') {
          if (result.window_status === 'before_start') return result.message || 'Out time is not started yet.'
          if (result.window_status === 'after_end') return result.message || 'Allowed time is over.'
          return result.message || 'Outside allowed time window.'
        }
        return result.message || 'Not permitted.'
      })()

      appendScanLog({ uid, mode: 'ONLINE', title: deniedTitle, subtitle: deniedSubtitle })
      showFlash({ kind: 'denied', title: deniedTitle, subtitle: deniedSubtitle, detail: flowDetail, studentLine, profile: flashProfile })
    },
    [showFlash],
  )

  const processUID = useCallback(
    async (uid: string) => {
      const cd = checkCooldown(uid)
      if (!cd.allowed) {
        appendScanLog({ uid, mode: 'ONLINE', title: 'COOLDOWN', subtitle: `Try IN after ${cd.remainingStr}` })
        setFlash({
          kind: 'denied',
          title: 'PLEASE WAIT',
          subtitle: `Try the IN after ${cd.remainingStr}`,
          studentLine: `UID: ${uid}`
        })
        return
      }

      if (!isOnline) {
        await processOffline(uid)
        return
      }
      try {
        await processOnline(uid)
      } catch (e: any) {
        if (isNetworkError(e)) {
          await processOffline(uid)
          return
        }
        appendScanLog({ uid, mode: 'ONLINE', title: 'DENIED', subtitle: e?.message || 'Error' })
        showFlash({ kind: 'denied', title: 'DENIED', subtitle: e?.message || 'Error' })
      }
    },
    [isOnline, processOffline, processOnline, showFlash],
  )

  const handleStartScan = async () => {
    setError('')
    if (!port) return

    setScanning(true)

    try {
      if (!port.readable) {
        await port.open({ baudRate: 115200 })
      }
    } catch (e: any) {
      setError(e?.message || 'Could not open USB serial port')
      setScanning(false)
      return
    }

    if (!port.readable) {
      setError('USB serial port is open but not readable')
      setScanning(false)
      return
    }

    const decoder = new TextDecoderStream()
    try {
      port.readable.pipeTo(decoder.writable)
    } catch (e: any) {
      setError(e?.message || 'Could not attach serial reader')
      setScanning(false)
      return
    }
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
      } catch (e: any) {
        setError(e?.message || 'Scanner read error')
      } finally {
        setScanning(false)
      }
    })()
  }

  if (scanning) {
    const isAllowed = flash?.kind === 'allowed'
    const isDenied = flash?.kind === 'denied'

    return (
      <main
        className={`relative min-h-screen flex items-center justify-center px-6 ${
          isAllowed ? 'bg-green-600' : isDenied ? 'bg-red-600' : 'bg-black'
        }`}
      >
        <div className="absolute top-6 right-8 flex items-center gap-4 z-50">
          <div className="bg-black/20 text-white px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 shadow-sm backdrop-blur-sm">
            {me?.username || 'Operator'}
          </div>
          <button
            onClick={stopScan}
            className="inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/25 border border-white/20 px-6 py-2.5 text-sm font-bold text-white transition-all shadow-sm backdrop-blur-sm"
          >
            Stop scan
          </button>
        </div>

        <div className="w-full max-w-4xl text-center text-white space-y-4">
          {!flash ? (
            <>
              <div className="text-4xl sm:text-5xl font-extrabold tracking-tight">READY</div>
              <div className="text-xl sm:text-2xl font-semibold opacity-90">Place your card</div>
              <div className="text-sm opacity-80">Mode: {isOnline ? 'ONLINE' : 'OFFLINE'}</div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <div className="text-7xl sm:text-8xl font-black tracking-tight drop-shadow-lg mb-2">
                {flash.title}
              </div>

              {flash.profile && (
                <div className="bg-white/95 backdrop-blur-md text-gray-900 rounded-[2rem] p-8 shadow-2xl flex items-stretch gap-8 min-w-[550px] max-w-4xl text-left transform scale-105 transition-transform duration-200 border-4 border-white/40 relative overflow-hidden">
                  <img src={logo} alt="IDCS" className="absolute top-4 right-6 w-20 h-20 object-contain opacity-80" />
                  
                  {flash.profile.imageUrl ? (
                    <img src={flash.profile.imageUrl} alt="Profile" className="w-40 h-40 rounded-2xl object-cover border-4 border-gray-100 shadow-md flex-shrink-0 bg-white relative z-10" />
                  ) : (
                    <div className="w-40 h-40 rounded-2xl bg-gray-50 border-4 border-gray-100 shadow-md flex items-center justify-center flex-shrink-0 relative z-10">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-20 h-20 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                  )}
                  <div className="flex flex-col justify-center py-1 flex-1 relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                       {flash.profile.type && (
                         <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-sm font-bold uppercase tracking-wider rounded-lg shrink-0">
                           {flash.profile.type}
                         </span>
                       )}
                       <span className="text-xl font-bold text-gray-500 truncate">{flash.profile.idString}</span>
                    </div>
                    <div className="text-4xl font-black tracking-tight text-gray-800 mb-3 line-clamp-2 pr-12">{flash.profile.name || 'Unknown User'}</div>
                    {(flash.profile.department || flash.profile.subtitle) && (
                      <div className="flex flex-col gap-1 text-lg font-semibold text-gray-600">
                        {flash.profile.department && <div className="truncate">{flash.profile.department}</div>}
                        {flash.profile.subtitle && <div className="text-gray-500 truncate">{flash.profile.subtitle}</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3 mt-8 flex flex-col items-center">
                {flash.subtitle && <div className="text-3xl sm:text-4xl font-bold opacity-95">{flash.subtitle}</div>}
                {flash.detail && <div className="text-2xl sm:text-3xl font-bold text-yellow-300 drop-shadow-md">{flash.detail}</div>}
                {!flash.profile && flash.studentLine && <div className="text-xl opacity-90">{flash.studentLine}</div>}
              </div>
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        <div className="text-center space-y-2 mb-4">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Gate Scanner</h1>
          <p className="text-lg text-gray-500">Connect a scanner and start reading ID cards.</p>
        </div>

        {!serialSupported && (
          <div className="w-full max-w-2xl bg-amber-50 border border-amber-200 px-6 py-4 rounded-2xl text-amber-800 text-center shadow-sm">
            <p className="font-semibold">Web Serial API is not supported here.</p>
            <p className="text-sm mt-1">Please use the Electron app to access USB devices.</p>
          </div>
        )}

        {!isOnline && (
          <div className="w-full max-w-2xl bg-red-50 border border-red-200 px-6 py-4 rounded-2xl text-red-700 text-center shadow-sm">
            <p className="font-bold uppercase tracking-wider text-sm mb-1">Network Offline</p>
            <p className="text-sm">Operating in OFFLINE mode. Scans will be stored locally.</p>
          </div>
        )}

        {error && (
          <div className="w-full max-w-2xl bg-red-50 border border-red-200 px-6 py-4 rounded-2xl text-red-700 text-center shadow-sm">
            <p className="font-semibold">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        <div className="w-full max-w-2xl bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden p-8 flex flex-col items-center gap-8">
          
          <div className="w-full flex flex-col items-center gap-4">
            <button
              onClick={handleSelect}
              disabled={!serialSupported}
              className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 px-6 py-4 rounded-2xl font-bold text-lg transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Select USB Scanner
            </button>
            
            {port && (
              <div className="w-full flex items-center justify-between bg-green-50 border border-green-200 rounded-2xl px-6 py-4">
                <div className="flex items-center gap-4">
                  <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  <div className="font-bold text-green-800 text-lg">{deviceName || 'Ready'}</div>
                </div>
                <div className="text-sm font-semibold text-green-600 bg-green-100 px-3 py-1 rounded-full text-center">
                  115200 baud
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleStartScan}
            disabled={!port}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-gray-200 disabled:text-gray-400 px-8 py-5 rounded-2xl text-xl font-extrabold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 active:translate-y-0"
          >
            START SCANNING
          </button>
        </div>
      </div>
    </main>
  )
}
