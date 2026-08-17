import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { label: 'Platform',  href: '#platform' },
  { label: 'Modules',   href: '#modules'  },
  { label: 'Analytics', href: '#analytics'},
  { label: 'Contact',   href: '#contact'  },
]

const PORTALS = [
  { label: 'Student',  href: '/student', color: '#0090FF' },
  { label: 'Faculty',  href: '/faculty', color: '#00FFDD' },
  { label: 'HOD',      href: '/hod',     color: '#FF6600' },
]

export function Navigation() {
  const [scrolled,  setScrolled]  = useState(false)
  const [menuOpen,  setMenuOpen]  = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <motion.nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? 'glass border-b border-white/5' : ''
        }`}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          {/* Left — College branding */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              {/* KR Logo placeholder — replace src with /krlogo.png after copying asset */}
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-blue-900/40 border border-blue-500/20 flex items-center justify-center">
                <span className="text-xs font-black text-blue-300 tracking-tighter">KR</span>
              </div>
              <div className="hidden sm:block">
                <div className="text-white/90 font-semibold text-sm leading-none">K.R. Group of Institutions</div>
                <div className="text-white/40 text-xs font-mono mt-0.5 tracking-wider">KRGI · KRCT · KRCAS</div>
              </div>
            </div>

            <div className="w-px h-6 bg-white/10 mx-1" />

            {/* IDCS Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-shadow">
                <span className="text-white font-black text-xs tracking-tight">ID</span>
              </div>
              <span className="text-white font-bold text-sm tracking-wide group-hover:text-idcs-cyan transition-colors">
                IDCS
              </span>
            </Link>
          </div>

          {/* Center — Nav links (hidden on mobile) */}
          {location.pathname === '/' && (
            <div className="hidden lg:flex items-center gap-8">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-white/50 hover:text-white text-sm font-medium transition-colors tracking-wide"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {/* Right — Portal links */}
          <div className="hidden md:flex items-center gap-2">
            {PORTALS.map((p) => (
              <Link
                key={p.label}
                to={p.href}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold tracking-widest uppercase transition-all duration-300 border"
                style={{
                  color:            p.color,
                  borderColor:      p.color + '33',
                  background:       p.color + '0D',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background     = p.color + '22'
                  ;(e.currentTarget as HTMLElement).style.boxShadow      = `0 0 16px ${p.color}44`
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background     = p.color + '0D'
                  ;(e.currentTarget as HTMLElement).style.boxShadow      = 'none'
                }}
              >
                {p.label}
              </Link>
            ))}

            <a
              href="https://idcs.krgi.co.in"
              target="_blank"
              rel="noreferrer"
              className="ml-2 px-4 py-1.5 rounded-md bg-idcs-blue text-white text-xs font-bold tracking-widest uppercase hover:bg-blue-400 transition-colors shadow-lg shadow-blue-500/20"
            >
              Launch IDCS →
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <span className={`w-5 h-px bg-white/70 transition-transform duration-300 ${menuOpen ? 'translate-y-2 rotate-45 origin-center' : ''}`} />
            <span className={`w-5 h-px bg-white/70 transition-opacity duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`w-5 h-px bg-white/70 transition-transform duration-300 ${menuOpen ? '-translate-y-2 -rotate-45 origin-center' : ''}`} />
          </button>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-40 glass-strong flex flex-col items-center justify-center gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link.label}
                href={link.href}
                className="text-white text-2xl font-light tracking-widest"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.07 }}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </motion.a>
            ))}
            <div className="flex gap-4 mt-4">
              {PORTALS.map((p) => (
                <Link
                  key={p.label}
                  to={p.href}
                  className="px-5 py-2 rounded-md text-sm font-bold tracking-widest uppercase border"
                  style={{ color: p.color, borderColor: p.color + '55' }}
                  onClick={() => setMenuOpen(false)}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
