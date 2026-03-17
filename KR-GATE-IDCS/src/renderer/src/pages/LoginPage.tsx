import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth'
import logo from '../assets/idcs-logo.png'

export default function LoginPage(): JSX.Element {
  const { login } = useAuth()
  const nav = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(identifier.trim(), password)
      nav('/welcome', { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-white text-slate-800 font-sans selection:bg-blue-100">
      {/* Left Pane: Logo */}
      <section className="relative hidden md:flex flex-1 items-center justify-center bg-slate-50">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent" />
        <img
          src={logo}
          alt="IDCS Gate Logo"
          className="w-48 h-48 sm:w-56 sm:h-56 object-contain drop-shadow-sm transition-transform duration-700 ease-out hover:scale-105"
        />
      </section>

      {/* Right Pane: Login Form */}
      <section className="relative flex flex-[1.2] flex-col justify-center bg-white px-8 sm:px-16 lg:px-24">
        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          IDCS GATE
        </h1>
        <p className="max-w-md text-xs font-semibold uppercase tracking-widest text-slate-500 sm:text-sm leading-relaxed mb-8">
          Integrated Data Capturing System<br />
          <span className="text-blue-600/80">— Gate Monitoring</span>
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <label className="block">
            <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">Username / ID</div>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="Enter username"
              autoFocus
            />
          </label>
          <label className="block">
            <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="Enter password"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !identifier.trim() || !password}
            className="mt-2 w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-4 py-3 text-sm font-bold tracking-wider uppercase transition-colors"
          >
            {busy ? 'Signing in…' : 'Secure Login'}
          </button>
        </form>
      </section>
    </main>
  )
}
