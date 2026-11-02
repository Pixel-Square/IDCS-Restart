import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  ShieldCheck,
  Award,
  ArrowRight,
  CheckCircle2,
  Users,
  Building,
  GraduationCap,
  Layers,
  FileCheck,
  TrendingUp,
  LogIn,
  ChevronRight,
} from 'lucide-react'
import { DemoAccount } from '../types/pbas'
import { fetchDemoAccounts, getStoredToken, loginUser } from '../services/auth'

export default function WelcomePage() {
  const navigate = useNavigate()
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [activeLoginEmail, setActiveLoginEmail] = useState<string | null>(null)

  useEffect(() => {
    fetchDemoAccounts()
      .then(setDemoAccounts)
      .catch((err) => console.error(err))
  }, [])

  const handle1ClickLogin = async (acc: DemoAccount) => {
    setActiveLoginEmail(acc.email)
    setLoading(true)
    try {
      await loginUser(acc.email, acc.password)
      navigate('/dashboard')
    } catch (err) {
      alert('Login failed: ' + err)
    } finally {
      setLoading(false)
      setActiveLoginEmail(null)
    }
  }

  const roleEmojiMap: Record<string, string> = {
    FACULTY: '👨‍🏫',
    HOD: '👔',
    PRINCIPAL: '🏛️',
    IQAC: '⚙️',
    STUDENT: '🎓',
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Navigation */}
      <nav className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 p-0.5 shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <div>
              <span className="font-bold text-lg text-white tracking-tight">PBAS</span>
              <span className="text-blue-400 font-semibold text-lg ml-1">Portal</span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                v2.0 Standalone
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <LogIn className="w-4 h-4" />
              <span>Login Portal</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-6 overflow-hidden">
        {/* Glow backdrop lights */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-blue-600/20 via-indigo-600/20 to-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-950/80 border border-blue-800/60 text-blue-300 text-xs font-semibold mb-6 shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Official Academic Career Advancement Scheme (CAS) Engine</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight sm:leading-none">
            Performance Based <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
              Appraisal System (PBAS)
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            A comprehensive, role-governed appraisal suite for faculty and students. Manage criterion submissions, multi-tier sequential approvals (HOD & Principal), evidence validation, and UGC/NAAC score compliance.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/login"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-blue-600/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            >
              <span>Access Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#demo-roles"
              className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold text-sm transition-all"
            >
              1-Click Role Logins
            </a>
          </div>
        </div>
      </section>

      {/* 1-Click Role Demonstration Cards */}
      <section id="demo-roles" className="py-14 px-6 bg-slate-900/50 border-t border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Test Every Role with 1-Click Login
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Select any role below to automatically authenticate and experience their dedicated dashboard view.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {demoAccounts.map((acc) => {
              const isLoggingIn = activeLoginEmail === acc.email
              const emoji = roleEmojiMap[acc.badge] || '👤'

              return (
                <div
                  key={acc.email}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500/80 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-xl hover:shadow-blue-500/10 group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-2xl">{emoji}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                        {acc.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                      {acc.name}
                    </h3>
                    <div className="text-xs text-slate-400 font-medium mt-0.5">{acc.role}</div>
                    <div className="text-[11px] text-slate-500 mt-2 line-clamp-3 leading-relaxed">
                      {acc.description}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => handle1ClickLogin(acc)}
                      disabled={loading}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm group-hover:bg-blue-600"
                    >
                      {isLoggingIn ? (
                        <span>Logging in...</span>
                      ) : (
                        <>
                          <span>Login as {acc.badge}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Dynamic Criteria Tree</h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Fully configurable criteria hierarchy spanning Parts A (Teaching), B (Student Mentoring), C (Research & Publications), and D (Institutional Governance).
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Multi-Tier Approvals</h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Submissions dynamically route through departmental HOD verification, designated committee reviewers, and final executive Principal clearance with audit trail logs.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Automated Credit Scoring</h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Upon final approval, verified credits are automatically calculated and recorded onto staff and student profiles, ready for annual review and NAAC reporting.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 py-8 px-6 text-center text-xs text-slate-500">
        PBAS Portal • Performance Based Appraisal System • Standalone Academic Edition
      </footer>
    </div>
  )
}
