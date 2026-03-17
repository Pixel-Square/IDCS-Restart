import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getCachedMe, getMe, isSecurity, login as apiLogin, logout as apiLogout, Me } from '../services/auth'

type AuthCtx = {
  me: Me | null
  bootstrapped: boolean
  login: (identifier: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [me, setMe] = useState<Me | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    const cached = getCachedMe()
    if (cached && isSecurity(cached)) setMe(cached)
    setBootstrapped(true)
  }, [])

  const login = async (identifier: string, password: string) => {
    await apiLogin(identifier, password)
    const profile = await getMe()
    if (!isSecurity(profile)) {
      apiLogout()
      setMe(null)
      throw new Error('Only SECURITY users can login to this app.')
    }
    setMe(profile)
  }

  const logout = () => {
    apiLogout()
    setMe(null)
  }

  const refreshMe = async () => {
    const profile = await getMe()
    if (!isSecurity(profile)) {
      apiLogout()
      setMe(null)
      throw new Error('Only SECURITY users can login to this app.')
    }
    setMe(profile)
  }

  const value = useMemo<AuthCtx>(() => ({ me, bootstrapped, login, logout, refreshMe }), [me, bootstrapped])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthProvider missing')
  return v
}
