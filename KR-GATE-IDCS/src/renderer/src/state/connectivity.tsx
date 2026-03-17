import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ping } from '../services/idscan'

type ConnectivityCtx = {
  isOnline: boolean
}

const Ctx = createContext<ConnectivityCtx | null>(null)

export function ConnectivityProvider({ children }: { children: React.ReactNode }): JSX.Element {
  // Note: navigator.onLine only reflects network connectivity, not backend reachability.
  // We keep a separate isOnline that becomes true only after stable backend pings.
  const [isOnline, setIsOnline] = useState<boolean>(false)
  const isOnlineRef = useRef<boolean>(false)
  const timerRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)
  const successStreakRef = useRef(0)
  const failureStreakRef = useRef(0)
  const lastFlipAtRef = useRef<number>(0)

  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])

  useEffect(() => {
    const flip = (next: boolean) => {
      setIsOnline((prev) => {
        if (prev === next) return prev
        lastFlipAtRef.current = Date.now()
        isOnlineRef.current = next
        return next
      })
    }

    const resetStreaks = () => {
      successStreakRef.current = 0
      failureStreakRef.current = 0
    }

    // Browser events can be noisy; do not immediately mark ONLINE from them.
    // OFFLINE is safe to apply immediately.
    const onUp = () => {
      resetStreaks()
      // keep current mode until backend pings succeed
    }
    const onDown = () => {
      resetStreaks()
      flip(false)
    }
    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)

    async function tick() {
      if (inFlightRef.current) return
      if (!navigator.onLine) {
        resetStreaks()
        flip(false)
        return
      }

      inFlightRef.current = true
      try {
        const ok = await ping()
        const reachable = Boolean(ok)

        if (reachable) {
          successStreakRef.current += 1
          failureStreakRef.current = 0
        } else {
          failureStreakRef.current += 1
          successStreakRef.current = 0
        }

        // Hysteresis to prevent rapid ONLINE/OFFLINE flipping.
        // - Go ONLINE only after 2 consecutive successful pings.
        // - Go OFFLINE only after 3 consecutive failed pings.
        // - Also enforce a minimum time between flips.
        const now = Date.now()
        const sinceFlip = now - (lastFlipAtRef.current || 0)
        const minFlipMs = 8_000

        if (!isOnlineRef.current && reachable && successStreakRef.current >= 2) {
          flip(true)
        }
        if (isOnlineRef.current && !reachable && failureStreakRef.current >= 3 && sinceFlip >= minFlipMs) {
          flip(false)
        }
      } catch {
        failureStreakRef.current += 1
        successStreakRef.current = 0
        const now = Date.now()
        const sinceFlip = now - (lastFlipAtRef.current || 0)
        const minFlipMs = 8_000
        if (isOnlineRef.current && failureStreakRef.current >= 3 && sinceFlip >= minFlipMs) {
          flip(false)
        }
      } finally {
        inFlightRef.current = false
      }
    }

    tick().catch(() => {})
    timerRef.current = window.setInterval(() => {
      tick().catch(() => {
        failureStreakRef.current += 1
        successStreakRef.current = 0
        const now = Date.now()
        const sinceFlip = now - (lastFlipAtRef.current || 0)
        const minFlipMs = 8_000
        if (isOnlineRef.current && failureStreakRef.current >= 3 && sinceFlip >= minFlipMs) {
          flip(false)
        }
      })
    }, 2500)

    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [])

  const value = useMemo(() => ({ isOnline }), [isOnline])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConnectivity(): ConnectivityCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('ConnectivityProvider missing')
  return v
}
