import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, History, Database } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import logo from '../assets/idcs-logo.png'

export default function WelcomePage(): JSX.Element {
  const nav = useNavigate()

  return (
    <main className="h-screen w-screen flex flex-col bg-white text-slate-800 font-sans selection:bg-blue-100 overflow-hidden">
      <AppHeader />
      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-12 flex flex-col justify-center">
        <div className="mb-12 flex flex-col items-center text-center">
          <img
            src={logo}
            alt="IDCS Gate Logo"
            className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-sm mb-6"
          />
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            IDCS GATE DASHBOARD
          </h1>
          <p className="max-w-md text-xs font-semibold uppercase tracking-widest text-slate-500 sm:text-sm leading-relaxed">
            Integrated Data Capturing System<br />
            <span className="text-blue-600/80">— Gate Monitoring</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10">
          <button
            type="button"
            onClick={() => nav('/gatescan')}
            className="group flex flex-col items-center justify-center p-10 bg-slate-50 rounded-3xl shadow-sm hover:shadow-lg border border-slate-100 hover:border-blue-200 transition-all duration-300 ease-out hover:-translate-y-1"
          >
            <div className="w-24 h-24 mb-6 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ease-out">
              <ScanLine className="w-12 h-12 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Gate Scan</h2>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-3 text-center">Full-screen scanner</p>
          </button>

          <button
            type="button"
            onClick={() => nav('/gatelogs')}
            className="group flex flex-col items-center justify-center p-10 bg-slate-50 rounded-3xl shadow-sm hover:shadow-lg border border-slate-100 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1"
          >
            <div className="w-24 h-24 mb-6 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ease-out">
              <History className="w-12 h-12 text-slate-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Gate Logs</h2>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-3 text-center">Local scan history</p>
          </button>

          <button
            type="button"
            onClick={() => nav('/offline-records')}
            className="group flex flex-col items-center justify-center p-10 bg-slate-50 rounded-3xl shadow-sm hover:shadow-lg border border-slate-100 hover:border-blue-200 transition-all duration-300 ease-out hover:-translate-y-1"
          >
            <div className="w-24 h-24 mb-6 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ease-out">
              <Database className="w-12 h-12 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Offline Records</h2>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-3 text-center">Manage offline data</p>
          </button>
        </div>
      </div>
    </main>
  )
}
