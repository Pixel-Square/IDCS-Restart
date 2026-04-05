import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiBase } from '../services/apiBase'
import { gatepassCheck, GatepassCheckResult, lookupAny } from '../services/idscan'
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

function buildFlashProfile(profile: any, profile_type: string | null): NonNullable<Flash>['profile'] | undefined {
  if (!profile) return undefined
  const isStaff = 'staff_id' in profile
  const idStr = profile.reg_no || profile.staff_id || ''
  let imageUrl = profile.profile_image_url || null
  if (imageUrl && !imageUrl.startsWith('http')) {
    imageUrl = `${getApiBase()}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`
  }
  const type = profile_type === 'staff' || isStaff ? 'Staff' : 'Student'
  const department = profile.department || ''
  const subtitle = type === 'Student'
    ? `${profile.section || ''}${profile.batch ? ` • ${profile.batch}` : ''}`
    : profile.designation || ''

  return {
    name: profile.name || '',
    idString: idStr,
    type,
    imageUrl,
    department,
    subtitle
  }
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
   const lastFlashRef = useRef<Flash>(null)
  const profileCacheRef = useRef<Map<string, NonNullable<NonNullable<Flash>['profile']>>>(new Map())
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
     lastFlashRef.current = next
    setFlash(next)
    // Removed flash timer so the flash stays until next scan or manual stop
  }, [])

   const pulseLastFlash = useCallback(() => {
     const last = lastFlashRef.current
     if (!last) return
     if (flashTimer.current) window.clearTimeout(flashTimer.current)

     // Force a brief visual blink even if the scan is de-duplicated.
     setFlash(null)
     flashTimer.current = window.setTimeout(() => {
       setFlash(last)
     }, 90)
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
     lastFlashRef.current = null
     if (flashTimer.current) window.clearTimeout(flashTimer.current)
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

      const flashProfile = buildFlashProfile(profile, result.profile_type ?? null)

      if (flashProfile) {
        profileCacheRef.current.set(uid, flashProfile)
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
        let cachedProfile = profileCacheRef.current.get(uid)
        
        // If not in cache, and we're online, try a quick lookup so we can still show the card
        if (!cachedProfile && isOnline) {
          try {
            const lookupResult = await lookupAny(uid)
            if (lookupResult.found && lookupResult.profile) {
              const built = buildFlashProfile(lookupResult.profile, lookupResult.profile_type ?? null)
              if (built) {
                cachedProfile = built
                profileCacheRef.current.set(uid, built)
              }
            }
          } catch (_) {
            // ignore network errors on lookup fallback
          }
        }
        
        appendScanLog({ uid, mode: 'ONLINE', title: 'COOLDOWN', subtitle: `Try IN after ${cd.remainingStr}` })
        showFlash({
          kind: 'denied',
          title: 'PLEASE WAIT',
          subtitle: 'Cooldown active',
          detail: `Try again in ${cd.remainingStr}`,
          studentLine: cachedProfile ? undefined : `UID: ${uid}`,
          profile: cachedProfile
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
            if (uid === lastScan.current.uid && now - lastScan.current.time < 2000) {
              pulseLastFlash()
              continue
            }
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

        <div className="w-full text-white space-y-4 px-8 max-w-[1600px] mx-auto">
          {!flash ? (
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold tracking-tight">READY</div>
              <div className="text-xl sm:text-2xl font-semibold opacity-90">Place your card</div>
              <div className="text-sm opacity-80">Mode: {isOnline ? 'ONLINE' : 'OFFLINE'}</div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-center justify-center gap-12 sm:gap-16 w-full animate-in fade-in zoom-in duration-200">
              
              {flash.profile && (
                <div className="flex-shrink-0 relative">
                  <div className="w-[480px] h-[480px] rounded-[3rem] border-[16px] border-white/20 shadow-2xl flex items-center justify-center overflow-hidden bg-black/10 backdrop-blur-sm transform transition-all">
                    {flash.profile.imageUrl ? (
                      <img src={flash.profile.imageUrl} alt="Profile" className="w-full h-full object-cover relative z-10" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-48 h-48 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    )}
                  </div>
                </div>
              )}

              <div className={`flex flex-col flex-1 max-w-5xl text-left ${!flash.profile ? 'items-center text-center' : ''}`}>
                
                {flash.profile ? (
                  <>
                    <div className="w-full">
                      <div 
                        className="font-black tracking-tight drop-shadow-2xl mb-2 sm:mb-4 uppercase text-white break-words"
                        style={{
                          fontSize: flash.profile.name && flash.profile.name.length > 20 
                            ? 'clamp(60px, 6vw, 90px)' 
                            : 'clamp(80px, 8vw, 130px)',
                          lineHeight: '1.2'
                        }}
                      >
                         {flash.profile.name || 'Unknown User'}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 mb-6">
                       {flash.profile.type && (
                         <span className="px-4 py-2 bg-white/20 text-white border border-white/40 text-xl font-bold uppercase tracking-widest rounded-xl shadow-md backdrop-blur-md">
                           {flash.profile.type}
                         </span>
                       )}
                       <span className="text-3xl font-extrabold text-white/90 drop-shadow-sm truncate">
                         {flash.profile.idString}
                       </span>
                    </div>
                  </>
                ) : (
                   flash.studentLine && <div className="text-3xl font-bold opacity-90 mb-4 drop-shadow-md">{flash.studentLine}</div>
                )}
                
                <div className="mt-2 space-y-2">
                  <div className="text-6xl sm:text-7xl font-black tracking-tight drop-shadow-xl mb-3 sm:mb-4 uppercase text-white/95">
                    {flash.title}
                  </div>
                  {flash.subtitle && <div className="text-3xl font-bold opacity-95 text-white drop-shadow-md">{flash.subtitle}</div>}
                  {flash.detail && <div className="text-2xl font-black text-yellow-300 drop-shadow-lg mt-2">{flash.detail}</div>}
                </div>
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
