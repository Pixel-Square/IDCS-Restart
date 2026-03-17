import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { useAuth } from '../state/auth'
import { useConnectivity } from '../state/connectivity'
import logo from '../assets/idcs-logo.png'

function pillClass(isOnline: boolean): string {
  return isOnline
    ? 'bg-green-100 text-green-800 border-green-200 shadow-sm'
    : 'bg-red-100 text-red-800 border-red-200 shadow-sm'
}

export default function AppHeader(): JSX.Element {
  const { me, logout } = useAuth()
  const { isOnline } = useConnectivity()
  const navigate = useNavigate()
  const location = useLocation()

  // Hide back button on welcome dashboard, we can keep it on other pages
  const showBack = location.pathname !== '/welcome'

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm h-16 md:h-20 flex-shrink-0">
      <div className="px-5 h-full flex items-center justify-between max-w-[1400px] mx-auto w-full">
        <div className="flex items-center gap-5">
          {showBack && (
            <button
              onClick={() => navigate('/welcome')}
              className="flex items-center justify-center p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-blue-600 transition-all shadow-sm group"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <img src={logo} alt="IDCS" className="w-8 h-8 md:w-10 md:h-10 object-contain drop-shadow-sm" />
            <div className="hidden sm:block text-lg md:text-xl font-extrabold text-slate-800 tracking-tight">
              IDCS GATE
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-4">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest border ${pillClass(isOnline)}`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className="hidden sm:inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold border border-slate-200 bg-slate-50 text-slate-700 uppercase tracking-widest shadow-sm">
            {me?.username || '—'}
          </span>
          <div className="h-6 w-px bg-gray-200 hidden sm:block mx-1"></div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 bg-white hover:text-red-700 hover:bg-red-50 rounded-xl transition-all shadow-sm border border-slate-200 hover:border-red-200"
            title="Secure Logout"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Logout</span>
          </button>
        </div>
      </div>
    </header>
  )
}
