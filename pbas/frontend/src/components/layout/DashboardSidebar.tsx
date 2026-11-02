import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FilePlus2,
  FileCheck2,
  FolderKanban,
  Settings2,
  User,
  LogOut,
  ChevronRight,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  ArrowRightLeft,
} from 'lucide-react'
import { AuthUser, DemoAccount } from '../../types/pbas'
import { clearAuthSession, fetchDemoAccounts, loginUser } from '../../services/auth'

interface Props {
  user: AuthUser | null
  onUserSwitch?: (user: AuthUser) => void
}

export default function DashboardSidebar({ user, onUserSwitch }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false)
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([])
  const [switching, setSwitching] = useState(false)

  const isApprover = user?.role_names?.some(r =>
    ['HOD', 'PRINCIPAL', 'PBAS_APPROVER', 'IQAC', 'ADMIN', 'PBAS_ADMIN'].includes(r.toUpperCase())
  ) || user?.is_superuser

  const isAdmin = user?.role_names?.some(r =>
    ['IQAC', 'ADMIN', 'PBAS_ADMIN', 'PBAS_MANAGER'].includes(r.toUpperCase())
  ) || user?.is_superuser

  const handleLogout = () => {
    clearAuthSession()
    navigate('/login')
  }

  const openSwitcher = async () => {
    setShowRoleSwitcher(true)
    if (!demoAccounts.length) {
      try {
        const list = await fetchDemoAccounts()
        setDemoAccounts(list)
      } catch (err) {
        console.error(err)
      }
    }
  }

  const handleQuickSwitch = async (acc: DemoAccount) => {
    setSwitching(true)
    try {
      const data = await loginUser(acc.email, acc.password)
      if (onUserSwitch) onUserSwitch(data.user)
      setShowRoleSwitcher(false)
      navigate('/dashboard')
    } catch (err) {
      alert('Could not switch account: ' + err)
    } finally {
      setSwitching(false)
    }
  }

  const navItems = [
    {
      label: 'Overview',
      path: '/dashboard',
      icon: LayoutDashboard,
      show: true,
    },
    {
      label: 'Submit PBAS',
      path: '/dashboard/submit',
      icon: FilePlus2,
      show: true,
    },
    {
      label: 'My Submissions',
      path: '/dashboard/my-submissions',
      icon: FolderKanban,
      show: true,
    },
    {
      label: 'Approvals Hub',
      path: '/dashboard/approvals',
      icon: FileCheck2,
      show: isApprover,
      badge: 'Reviewer',
    },
    {
      label: 'PBAS Manager & Config',
      path: '/dashboard/admin',
      icon: Settings2,
      show: isAdmin,
      badge: 'Admin',
    },
    {
      label: 'My Profile',
      path: '/dashboard/profile',
      icon: User,
      show: true,
    },
  ]

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col h-screen sticky top-0 border-r border-slate-800 shadow-xl z-20 flex-shrink-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 p-0.5 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
              PBAS Portal
            </div>
            <div className="text-[11px] font-medium text-slate-400 tracking-wider uppercase">
              Appraisal System
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Main Menu
        </div>
        {navItems.filter(item => item.show).map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                  isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-800 text-blue-400 border border-blue-900/40'
                }`}>
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Role Switcher Drawer Button */}
      <div className="px-3 py-2 border-t border-slate-800/80 bg-slate-950/40">
        <button
          onClick={openSwitcher}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/60 hover:bg-slate-800 hover:text-white border border-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
            <span>Switch Role Account</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      {/* User profile footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
              {user?.first_name?.[0] || user?.username?.[0] || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {user?.full_name || user?.username || 'User'}
              </div>
              <div className="text-[10px] text-blue-400 truncate flex items-center gap-1">
                {user?.role_names?.[0] || 'Member'}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Role Switcher Modal */}
      {showRoleSwitcher && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Switch Test Persona</h3>
                <p className="text-xs text-slate-500">Instantly switch between roles to test workflows</p>
              </div>
              <button
                onClick={() => setShowRoleSwitcher(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => handleQuickSwitch(acc)}
                  disabled={switching}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                      {acc.badge === 'HOD' ? '👔' : acc.badge === 'PRINCIPAL' ? '🏛️' : acc.badge === 'IQAC' ? '⚙️' : acc.badge === 'STUDENT' ? '🎓' : '👨‍🏫'}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        {acc.name}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">
                          {acc.badge}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">{acc.role} • {acc.department}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
