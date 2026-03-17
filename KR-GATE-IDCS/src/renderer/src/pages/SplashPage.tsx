import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth'
import logo from '../assets/idcs-logo.png'

export default function SplashPage(): JSX.Element {
  const navigate = useNavigate()
  const { me, bootstrapped } = useAuth()
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!bootstrapped) return
    const id = window.setTimeout(
      () => {
        if (me) navigate('/welcome', { replace: true })
        else navigate('/login', { replace: true })
      },
      reducedMotion ? 500 : 4000
    )
    return () => window.clearTimeout(id)
  }, [bootstrapped, me, navigate, reducedMotion])

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-white text-slate-800 font-sans selection:bg-blue-100">
      {/* Left Pane: Logo */}
      <section className="relative flex flex-1 items-center justify-center bg-slate-50">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent" />
        <img
          src={logo}
          alt="IDCS Gate Logo"
          className="w-48 h-48 sm:w-56 sm:h-56 object-contain drop-shadow-sm transition-transform duration-700 ease-out hover:scale-105"
        />
      </section>

      {/* Right Pane: Typography & Loader */}
      <section className="relative flex flex-[1.2] flex-col justify-center bg-white px-12 sm:px-16 lg:px-24">
        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          IDCS GATE
        </h1>
        <p className="max-w-md text-xs font-semibold uppercase tracking-widest text-slate-500 sm:text-sm leading-relaxed">
          Integrated Data Capturing System<br />
          <span className="text-blue-600/80">— Gate Monitoring</span>
        </p>

        <div className="mt-16 w-full max-w-[16rem]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase animate-pulse">
              System Loading
            </span>
            <span className="text-[10px] font-bold text-blue-600/80 tracking-widest">
              V 1.0
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 relative">
            <div className="absolute top-0 bottom-0 left-0 bg-blue-600 rounded-full loading-bar" />
          </div>
        </div>

        <style>{`
          .loading-bar {
            width: 50%;
            animation: indeterminate 1.8s cubic-bezier(0.65, 0.81, 0.73, 0.4) infinite;
          }
          @keyframes indeterminate {
            0% { transform: translateX(-150%) scaleX(0.2); }
            50% { transform: translateX(20%) scaleX(1); }
            100% { transform: translateX(150%) scaleX(0.2); }
          }
        `}</style>
      </section>
    </main>
  )
}
