import { useEffect, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Link } from 'react-router-dom'
import { IDCSCanvas } from '@/components/canvas/IDCSCanvas'
import { useLenis }   from '@/hooks/useLenis'

// ─── Scene text configs ─────────────────────────────────────────────────────────
const SCENES = [
  {
    id: 'scene-1',
    tag: '01 — DATA AWAKENING',
    heading: ['Every Data\nPoint', 'Counts.'],
    body: 'IDCS brings institutional intelligence to life — transforming raw data into precision-driven academic systems.',
    align: 'left',
  },
  {
    id: 'scene-2',
    tag: '02 — RAW DATA SYSTEM',
    heading: ['Attendance.', 'Grades.', 'Systems.'],
    body: 'From ESSL biometric streams to OBE analytics — every signal flows into a living institutional data network.',
    align: 'right',
  },
  {
    id: 'scene-3',
    tag: '03 — GLASS INTERFACE',
    heading: ['Interfaces\nAssembled', 'in Real-Time.'],
    body: 'Transparent glass dashboards materialize from data — faculty workloads, timetables, and performance grids emerge from pure information.',
    align: 'left',
  },
  {
    id: 'scene-4',
    tag: '04 — INSTITUTION BRAIN',
    heading: ['All Systems\nConnected.'],
    body: 'Students. Faculty. HOD. IQAC. LMS. COE. Attendance. Feedback. Every module is a living neuron in the institutional intelligence network.',
    align: 'center',
  },
  {
    id: 'scene-5',
    tag: '05 — HUMAN + MACHINE SYNC',
    heading: ['Integrated\nIntelligence', 'for Institutions.'],
    body: 'IDCS — the complete paperless ERP for K.R. Group of Institutions. Human precision. Machine scale.',
    align: 'center',
  },
]

// ─── Module tags ────────────────────────────────────────────────────────────────
const MODULES = [
  { label: 'Academics',    icon: '📚', color: '#0090FF' },
  { label: 'Attendance',   icon: '🕐', color: '#00FFDD' },
  { label: 'LMS',          icon: '💡', color: '#8B5CF6' },
  { label: 'Feedback',     icon: '📊', color: '#F59E0B' },
  { label: 'Timetable',    icon: '🗓', color: '#0090FF' },
  { label: 'COE',          icon: '🏛', color: '#FF6600' },
  { label: 'OBE',          icon: '🎯', color: '#00FFDD' },
  { label: 'PBAS',         icon: '📈', color: '#8B5CF6' },
  { label: 'Leave Mgmt',   icon: '✋', color: '#F59E0B' },
  { label: 'KR Gate',      icon: '🔒', color: '#0090FF' },
  { label: 'WhatsApp',     icon: '💬', color: '#22C55E' },
  { label: 'PowerBI',      icon: '⚡', color: '#FF6600' },
]

// ─── Portal cards ───────────────────────────────────────────────────────────────
const PORTALS = [
  {
    href:       '/student',
    role:       'Student',
    tagline:    'Personal Academic Intelligence',
    desc:       'GPA tracking, attendance heatmaps, timetable, assignments, and academic progress — all in a cinematic personal dashboard.',
    accent:     '#0090FF',
    modules:    ['Academics', 'Attendance', 'LMS', 'Feedback', 'Timetable'],
    stats:      [{ label: 'Attendance', val: '92%' }, { label: 'CGPA', val: '8.7' }, { label: 'Pending', val: '3' }],
  },
  {
    href:       '/faculty',
    role:       'Faculty',
    tagline:    'Teaching Intelligence System',
    desc:       'Class analytics, OBE mark entry, CQI assessment, student performance, workload management — precision-engineered for educators.',
    accent:     '#00FFDD',
    modules:    ['Mark Entry', 'OBE', 'PBAS', 'Leave', 'Timetable'],
    stats:      [{ label: 'Classes', val: '24' }, { label: 'Students', val: '180' }, { label: 'CQI', val: '87%' }],
  },
  {
    href:       '/hod',
    role:       'HOD',
    tagline:    'Institution Command Layer',
    desc:       'Department-wide analytics, faculty performance grids, approval workflows, KPI dashboards — the executive intelligence center.',
    accent:     '#FF6600',
    modules:    ['Analytics', 'Approvals', 'Faculty Mgmt', 'Reports', 'OBE'],
    stats:      [{ label: 'Faculty', val: '32' }, { label: 'Depts', val: '6' }, { label: 'Pass %', val: '94%' }],
  },
]

// ─── Animated scene overlay ─────────────────────────────────────────────────────
function SceneBlock({ scene }: { scene: typeof SCENES[0] }) {
  const ref    = useRef<HTMLDivElement>(null!)
  const inView = useInView(ref, { once: false, margin: '-20% 0px -20% 0px' })

  return (
    <div
      ref={ref}
      className={`scene-overlay interactive flex items-center ${
        scene.align === 'right'  ? 'justify-end'   :
        scene.align === 'center' ? 'justify-center' : 'justify-start'
      }`}
    >
      <div className={`max-w-xl px-8 ${scene.align === 'center' ? 'text-center' : ''}`}>
        <motion.div
          className="data-counter mb-4 tracking-[0.25em]"
          initial={{ opacity: 0, x: scene.align === 'right' ? 20 : -20 }}
          animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: scene.align === 'right' ? 20 : -20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {scene.tag}
        </motion.div>

        <motion.h2
          className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight text-white mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {scene.heading.map((line, i) => (
            <span key={i} className="block">
              {i === 0
                ? <span className="text-glow-blue">{line}</span>
                : i === 2
                ? <span className="text-white/40">{line}</span>
                : line
              }
            </span>
          ))}
        </motion.h2>

        <motion.p
          className="text-white/55 text-base md:text-lg leading-relaxed font-light"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {scene.body}
        </motion.p>
      </div>
    </div>
  )
}

// ─── Stats ticker ───────────────────────────────────────────────────────────────
const STATS = [
  { label: 'Students',   value: '12,000+' },
  { label: 'Faculty',    value: '800+'    },
  { label: 'Modules',    value: '22'      },
  { label: 'Uptime',     value: '99.9%'   },
  { label: 'Biometrics', value: '5 Devices'},
  { label: 'Daily Logs', value: '50,000+' },
]

// ─── Main experience ─────────────────────────────────────────────────────────────
export default function MainExperience() {
  useLenis()

  const cursorDot  = useRef<HTMLDivElement>(null!)
  const cursorRing = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (cursorDot.current) {
        cursorDot.current.style.left = `${e.clientX}px`
        cursorDot.current.style.top  = `${e.clientY}px`
      }
      if (cursorRing.current) {
        cursorRing.current.style.left = `${e.clientX}px`
        cursorRing.current.style.top  = `${e.clientY}px`
      }
    }
    const hover = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const isLink = t.closest('a, button')
      cursorRing.current?.classList.toggle('hover', !!isLink)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseover', hover)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseover', hover)
    }
  }, [])

  return (
    <div className="relative">
      {/* Custom cursor */}
      <div ref={cursorDot}  className="cursor-dot"  />
      <div ref={cursorRing} className="cursor-ring" />

      {/* Atmospheric scan line */}
      <div className="scan-line" />
      <div className="noise-overlay" />

      {/* ── Fixed Canvas ────────────────────────────────────── */}
      <div className="canvas-container interactive">
        <IDCSCanvas className="w-full h-full" />
      </div>

      {/* ── Scroll container ─────────────────────────────────── */}
      <div className="scroll-container">

        {/* HERO — Scene 1 */}
        <section className="relative min-h-screen flex flex-col items-start justify-center px-8 lg:px-16">
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent pointer-events-none" />
          <div className="relative z-10 max-w-3xl">
            <motion.div
              className="data-counter mb-6 tracking-[0.3em]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 1 }}
            >
              INTEGRATED DATA CAPTURING SYSTEM
            </motion.div>
            <motion.h1
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-none mb-8"
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="block text-white">The Data</span>
              <span className="block text-glow-blue text-idcs-blue">Forge</span>
              <span className="block text-white/25 text-4xl md:text-5xl font-light mt-2">
                Human · Machine · Intelligence
              </span>
            </motion.h1>
            <motion.p
              className="text-white/50 text-lg md:text-xl font-light max-w-xl leading-relaxed mb-10"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              A complete paperless ERP for K.R. Group of Institutions.
              22 integrated modules. Biometric precision. Real-time intelligence.
            </motion.p>
            <motion.div
              className="flex flex-wrap gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <a
                href="https://idcs.krgi.co.in"
                target="_blank"
                rel="noreferrer"
                className="px-7 py-3.5 bg-idcs-blue text-white font-bold rounded-lg hover:bg-blue-400 transition-all shadow-xl shadow-blue-500/25 tracking-wide"
              >
                Launch Platform
              </a>
              <a
                href="#modules"
                className="px-7 py-3.5 glass border border-white/10 text-white/70 font-medium rounded-lg hover:text-white hover:border-white/20 transition-all"
              >
                Explore Modules ↓
              </a>
            </motion.div>
          </div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 1 }}
          >
            <span className="data-counter text-[10px] tracking-[0.3em]">SCROLL TO EXPERIENCE</span>
            <div className="w-px h-12 bg-gradient-to-b from-transparent via-blue-400/60 to-transparent animate-pulse" />
          </motion.div>
        </section>

        {/* CINEMATIC SCENES 1–5 */}
        {SCENES.map((scene) => (
          <SceneBlock key={scene.id} scene={scene} />
        ))}

        {/* MODULES grid */}
        <section id="modules" className="relative py-32 px-8 lg:px-16">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/80 to-black/90 pointer-events-none" />
          <div className="relative z-10 max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="data-counter mb-4 tracking-[0.25em]">SYSTEM MODULES</div>
              <h2 className="text-4xl md:text-5xl font-black text-white">
                22 Integrated <span className="text-glow-blue text-idcs-blue">Intelligence Layers</span>
              </h2>
              <p className="text-white/40 mt-4 text-lg font-light max-w-2xl mx-auto">
                Every academic and administrative function — unified, real-time, and data-driven.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {MODULES.map((mod, i) => (
                <motion.div
                  key={mod.label}
                  className="glass rounded-xl p-4 border-glow-blue portal-card cursor-default"
                  style={{ borderColor: mod.color + '22' }}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-5%' }}
                  transition={{ delay: i * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="text-2xl mb-2">{mod.icon}</div>
                  <div className="text-white/80 font-semibold text-sm">{mod.label}</div>
                  <div
                    className="mt-2 w-8 h-0.5 rounded"
                    style={{ background: mod.color }}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* STATS strip */}
        <section id="platform" className="relative py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-950/30 via-transparent to-blue-950/30 pointer-events-none" />
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black/80 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-black/80 to-transparent pointer-events-none z-10" />
          <div className="flex gap-12 px-8 flex-wrap justify-center">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                className="text-center"
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.6 }}
              >
                <div className="text-3xl md:text-4xl font-black text-glow-blue text-idcs-blue">{s.value}</div>
                <div className="text-white/40 text-xs tracking-[0.2em] uppercase mt-1 font-mono">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ANALYTICS section */}
        <section id="analytics" className="relative py-32 px-8 lg:px-16">
          <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-transparent to-black/90 pointer-events-none" />
          <div className="relative z-10 max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="data-counter mb-4 tracking-[0.25em]">PORTAL EXPERIENCES</div>
              <h2 className="text-4xl md:text-5xl font-black text-white">
                Individual <span className="text-glow-cyan text-idcs-cyan">Intelligence</span> Portals
              </h2>
              <p className="text-white/40 mt-4 text-lg font-light max-w-2xl mx-auto">
                Three distinct cinematic experiences — each role has its own world of data.
              </p>
            </div>

            {/* Portal cards */}
            <div className="grid md:grid-cols-3 gap-6">
              {PORTALS.map((portal, i) => (
                <motion.div
                  key={portal.role}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-5%' }}
                  transition={{ delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link to={portal.href} className="block group">
                    <div
                      className="portal-card glass rounded-2xl p-6 border h-full"
                      style={{ borderColor: portal.accent + '33' }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="data-counter text-[10px] tracking-[0.2em] mb-1" style={{ color: portal.accent + 'CC' }}>
                            PORTAL
                          </div>
                          <div className="text-white font-black text-2xl">{portal.role}</div>
                        </div>
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black border transition-transform duration-300 group-hover:scale-110"
                          style={{ borderColor: portal.accent + '55', color: portal.accent, background: portal.accent + '15' }}
                        >
                          →
                        </div>
                      </div>

                      {/* Stats mini-row */}
                      <div className="flex gap-3 mb-4">
                        {portal.stats.map((stat) => (
                          <div key={stat.label} className="flex-1 glass rounded-lg p-2.5 text-center">
                            <div className="font-black text-sm" style={{ color: portal.accent }}>{stat.val}</div>
                            <div className="text-white/35 text-[10px] font-mono mt-0.5">{stat.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tagline */}
                      <div className="text-white/50 text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: portal.accent + 'AA' }}>
                        {portal.tagline}
                      </div>

                      <p className="text-white/45 text-sm leading-relaxed mb-5">{portal.desc}</p>

                      {/* Module pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {portal.modules.map((m) => (
                          <span
                            key={m}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide"
                            style={{ background: portal.accent + '18', color: portal.accent + 'CC' }}
                          >
                            {m}
                          </span>
                        ))}
                      </div>

                      {/* Enter CTA */}
                      <div
                        className="mt-5 w-full py-2.5 rounded-lg text-center text-xs font-bold tracking-widest uppercase transition-all duration-300 border"
                        style={{
                          borderColor: portal.accent + '44',
                          color: portal.accent,
                        }}
                      >
                        Enter Portal →
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CONTACT / FOOTER */}
        <footer id="contact" className="relative py-24 px-8 lg:px-16 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12 mb-16">
              {/* Brand */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                    <span className="text-white font-black text-xs">ID</span>
                  </div>
                  <span className="text-white font-bold tracking-wide">IDCS</span>
                </div>
                <p className="text-white/35 text-sm leading-relaxed">
                  Integrated Data Capturing System.<br />
                  An Paperless Innovation for K.R. Group of Institutions.
                </p>
                <div className="mt-4 data-counter text-[10px] tracking-[0.2em]">
                  idcs.krgi.co.in
                </div>
              </div>

              {/* Quick links */}
              <div>
                <div className="data-counter text-[10px] tracking-[0.25em] mb-4">PORTALS</div>
                <div className="flex flex-col gap-2">
                  {[
                    { label: 'Student Portal',  href: '/student' },
                    { label: 'Faculty Portal',  href: '/faculty' },
                    { label: 'HOD Portal',      href: '/hod'     },
                    { label: 'Launch IDCS',     href: 'https://idcs.krgi.co.in', external: true },
                  ].map((l) => (
                    l.external
                      ? <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white text-sm transition-colors">{l.label} ↗</a>
                      : <Link key={l.label} to={l.href} className="text-white/40 hover:text-white text-sm transition-colors">{l.label}</Link>
                  ))}
                </div>
              </div>

              {/* Institution */}
              <div>
                <div className="data-counter text-[10px] tracking-[0.25em] mb-4">INSTITUTION</div>
                <div className="text-white/50 text-sm leading-relaxed">
                  K.R. Group of Institutions<br />
                  KRGI · KRCT · KRCAS<br />
                  <span className="text-white/30 text-xs">krgi.co.in</span>
                </div>
                <div className="mt-4 flex gap-3">
                  {['Student', 'Faculty', 'HOD'].map((r) => (
                    <div key={r} className="px-2 py-1 glass rounded text-[10px] text-white/40 font-mono">
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="data-counter text-[10px] text-white/25 tracking-[0.2em]">
                © 2026 IDCS · K.R. GROUP OF INSTITUTIONS · ALL RIGHTS RESERVED
              </div>
              <div className="data-counter text-[10px] text-white/20 tracking-[0.15em]">
                INTEGRATED DATA CAPTURING SYSTEM v2.1
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
