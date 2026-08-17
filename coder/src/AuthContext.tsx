import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { login as apiLogin, saveTokens, clearTokens, fetchCoderMe, type CoderUser, type LoginResponse } from './api'

interface AuthContextType {
  user: CoderUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (identifier: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CoderUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('coder_access') || localStorage.getItem('access')
    if (!token) {
      setIsLoading(false)
      return
    }
    try {
      const me = await fetchCoderMe()
      setUser(me)
    } catch {
      clearTokens()
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  const login = async (identifier: string, password: string) => {
    const data: LoginResponse = await apiLogin(identifier, password)
    saveTokens(data)
    try {
      const me = await fetchCoderMe()
      setUser(me)
    } catch {
      // If /api/coder/me/ fails, clear tokens and rethrow so the login page shows the error
      clearTokens()
      throw new Error('Login succeeded but coder profile could not be loaded. Ensure the coder app is installed.')
    }
  }

  const logout = () => {
    clearTokens()
    setUser(null)
  }

  const refreshUser = async () => {
    await loadUser()
  }

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function useRole() {
  const { user } = useAuth()
  return {
    isAdmin: user?.coder_role === 'CODE_ADMIN',
    isIncharge: user?.coder_role === 'CODE_COURSE_INCHARGE',
    isSectionIncharge: user?.coder_role === 'CODE_SECTION_INCHARGE',
    isStudent: user?.coder_role === 'STUDENT',
    role: user?.coder_role ?? null,
  }
}
