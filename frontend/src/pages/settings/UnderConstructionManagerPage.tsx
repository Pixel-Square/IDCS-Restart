import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart2, Bell, BookMarked, BookOpen, CalendarCheck, CalendarDays,
  CheckSquare, ClipboardList, Clock, CreditCard, Database, DollarSign,
  FileText, HardHat, History, Inbox, Layers, MessageSquare, PenLine,
  Search, Settings, Shield, ScanLine, Star, UserCheck, UserPlus, Users,
  X, Loader2, AlertCircle,
  type LucideIcon,
} from 'lucide-react'
import DashboardLayout from '../../components/layout/DashboardLayout'
import BuildingInfo from '../../components/BuildingInfo'
import { PAGE_REGISTRY, type PageEntry } from '../../constants/pageRegistry'
import { fetchUCState, saveUCState, seedUCState, type UCState } from '../../utils/underConstruction'

// ── Icon map ──────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  BarChart2, Bell, BookMarked, BookOpen, CalendarCheck, CalendarDays,
  CheckSquare, ClipboardList, Clock, CreditCard, Database, DollarSign,
  FileText, History, Inbox, Layers, MessageSquare, PenLine,
  Settings, Shield, ScanLine, Star, UserCheck, UserPlus, Users,
}

function PageIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? FileText
  return <Icon className={className} />
}

// ── Colour helpers ────────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  Student:  'bg-blue-50   text-blue-700   border-blue-200',
  Staff:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Common:   'bg-gray-100  text-gray-600   border-gray-300',
  HOD:      'bg-purple-50 text-purple-700  border-purple-200',
  IQAC:     'bg-indigo-50 text-indigo-700  border-indigo-200',
  Advisor:  'bg-teal-50   text-teal-700   border-teal-200',
  RFID:     'bg-orange-50 text-orange-700  border-orange-200',
  HR:       'bg-rose-50   text-rose-700   border-rose-200',
}

const ROLE_COLORS: Record<string, string> = {
  STUDENT:  'bg-blue-100   text-blue-700   border-blue-200',
  STAFF:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  HOD:      'bg-purple-100 text-purple-700  border-purple-200',
  IQAC:     'bg-indigo-100 text-indigo-700  border-indigo-200',
  ADVISOR:  'bg-teal-100   text-teal-700   border-teal-200',
  SECURITY: 'bg-red-100    text-red-700    border-red-200',
  LIBRARY:  'bg-amber-100  text-amber-700  border-amber-200',
  HR:       'bg-rose-100   text-rose-700   border-rose-200',
  ADMIN:    'bg-gray-100   text-gray-700   border-gray-300',
}

// ── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({
  checked,
  partial = false,
  onChange,
  size = 'sm',
}: {
  checked: boolean
  partial?: boolean
  onChange: () => void
  size?: 'sm' | 'md'
}) {
  const w   = size === 'md' ? 'w-12 h-6' : 'w-9 h-5'
  const dot = size === 'md' ? 'w-5 h-5'  : 'w-4 h-4'
  const onX = size === 'md' ? 'translate-x-6' : 'translate-x-4'

  const bg = checked
    ? 'bg-amber-500'
    : partial
    ? 'bg-amber-300'
    : 'bg-gray-300'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked || partial}
      onClick={onChange}
      className={`relative inline-flex items-center rounded-full transition-colors focus:outline-none ${w} ${bg}`}
    >
      <span
        className={`inline-block rounded-full bg-white shadow transition-transform ${dot} ${
          checked ? onX : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ── Preview modal ─────────────────────────────────────────────────────────
function PreviewModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden" style={{ height: 480 }}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow"
        >
          <X className="w-4 h-4 text-gray-700" />
        </button>
        <BuildingInfo />
      </div>
    </div>
  )
}

// ── Page card ─────────────────────────────────────────────────────────────
function PageCard({
  entry,
  ucRoles,
  onToggleRole,
  onToggleAll,
}: {
  entry: PageEntry
  ucRoles: string[]
  onToggleRole: (role: string) => void
  onToggleAll: () => void
}) {
  const ucUpper   = ucRoles.map((r) => r.toUpperCase())
  const someUC    = ucUpper.length > 0
  const allUC     = entry.roles.every((r) => ucUpper.includes(r.toUpperCase()))
  const partialUC = someUC && !allUC

  const isRoleUC = (role: string) => ucUpper.includes(role.toUpperCase())

  return (
    <div
      className={`rounded-xl border-2 flex flex-col transition-all ${
        someUC ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Card header */}
      <div className="p-4 flex items-start gap-3 flex-1">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            someUC ? 'bg-amber-100' : 'bg-indigo-50'
          }`}
        >
          <PageIcon
            name={entry.icon}
            className={`w-5 h-5 ${someUC ? 'text-amber-600' : 'text-indigo-600'}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm leading-tight">{entry.label}</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                GROUP_COLORS[entry.group] ?? 'bg-gray-100 text-gray-600 border-gray-300'
              }`}
            >
              {entry.group}
            </span>
          </div>
          <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">{entry.path}</div>

          {/* Per-role switches – only show individual toggles when >1 role */}
          {entry.roles.length > 1 && (
            <div className="mt-3 space-y-2">
              {entry.roles.map((role) => (
                <div key={role} className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      ROLE_COLORS[role.toUpperCase()] ?? 'bg-gray-100 text-gray-600 border-gray-300'
                    }`}
                  >
                    {role}
                  </span>
                  <Toggle
                    checked={isRoleUC(role)}
                    onChange={() => onToggleRole(role)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Single-role badge (no toggle needed, master handles it) */}
          {entry.roles.length === 1 && (
            <div className="mt-2">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  ROLE_COLORS[entry.roles[0].toUpperCase()] ?? 'bg-gray-100 text-gray-600 border-gray-300'
                }`}
              >
                {entry.roles[0]}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Master toggle footer */}
      <div
        className={`px-4 py-3 border-t flex items-center justify-between rounded-b-[10px] ${
          someUC ? 'border-amber-200 bg-amber-100/50' : 'border-gray-100 bg-gray-50/50'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <HardHat
            className={`w-3.5 h-3.5 ${someUC ? 'text-amber-600' : 'text-gray-400'}`}
          />
          <span className={`text-xs font-semibold ${someUC ? 'text-amber-700' : 'text-gray-500'}`}>
            Under Construction
          </span>
          {partialUC && (
            <span className="text-[10px] text-amber-600 font-medium">(partial)</span>
          )}
        </div>
        <Toggle
          checked={allUC}
          partial={partialUC}
          onChange={onToggleAll}
          size="md"
        />
      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────
function SectionHeader({
  title,
  count,
  variant,
}: {
  title: string
  count: number
  variant: 'uc' | 'active'
}) {
  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 rounded-xl ${
        variant === 'uc'
          ? 'bg-amber-100 border border-amber-300'
          : 'bg-emerald-50 border border-emerald-200'
      }`}
    >
      {variant === 'uc' ? (
        <HardHat className="w-5 h-5 text-amber-600 flex-shrink-0" />
      ) : (
        <CheckSquare className="w-5 h-5 text-emerald-600 flex-shrink-0" />
      )}
      <span
        className={`font-bold text-sm ${
          variant === 'uc' ? 'text-amber-800' : 'text-emerald-800'
        }`}
      >
        {title}
      </span>
      <span
        className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${
          variant === 'uc'
            ? 'bg-amber-200 text-amber-800'
            : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {count}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function UnderConstructionManagerPage() {
  const navigate      = useNavigate()
  const [ucState, setUCState] = useState<UCState>({})
  const [search, setSearch]   = useState('')
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // ── Load from server on mount ─────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    fetchUCState()
      .then((state) => { setUCState(state); setError(null) })
      .catch(() => setError('Failed to load configuration from server.'))
      .finally(() => setLoading(false))
  }, [])

  // ── State helpers ────────────────────────────────────────────────────────
  const applyState = useCallback(async (next: UCState) => {
    setUCState(next)
    setSaving(true)
    setError(null)
    try {
      const saved = await saveUCState(next)
      setUCState(saved)
      seedUCState(saved)
    } catch {
      setError('Failed to save to server. Changes may not persist.')
    } finally {
      setSaving(false)
    }
  }, [])

  function toggleRole(path: string, role: string) {
    const current = (ucState[path] || []).map((r) => r.toUpperCase())
    const up      = role.toUpperCase()
    const next    = current.includes(up)
      ? current.filter((r) => r !== up)
      : [...current, up]
    applyState({ ...ucState, [path]: next })
  }

  function toggleAll(entry: PageEntry) {
    const ucUpper  = (ucState[entry.path] || []).map((r) => r.toUpperCase())
    const allUC    = entry.roles.every((r) => ucUpper.includes(r.toUpperCase()))
    // all on → turn all off; anything else → turn all on
    const next     = allUC ? [] : entry.roles.map((r) => r.toUpperCase())
    applyState({ ...ucState, [entry.path]: next })
  }

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return PAGE_REGISTRY
    return PAGE_REGISTRY.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q)  ||
        p.group.toLowerCase().includes(q) ||
        p.roles.some((r) => r.toLowerCase().includes(q)),
    )
  }, [search])

  const ucPages     = filtered.filter((p) => (ucState[p.path] || []).length > 0)
  const activePages = filtered.filter((p) => (ucState[p.path] || []).length === 0)

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading configuration…
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      {preview && <PreviewModal onClose={() => setPreview(false)} />}

      <div className="px-4 sm:px-6 lg:px-8 pb-8 space-y-6">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <HardHat className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">Under Construction Manager</h1>
                  {saving && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
                </div>
                <p className="text-gray-500 mt-0.5 text-sm">
                  Toggle pages under construction per role. Changes are saved to the server instantly.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setPreview(true)}
                className="inline-flex items-center gap-2 text-sm border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 px-4 py-2 rounded-lg font-medium transition"
              >
                <HardHat className="w-4 h-4" />
                Preview Screen
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="inline-flex items-center gap-2 text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium transition"
              >
                ← Back to Settings
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-4 flex items-center gap-6 text-sm text-gray-500 flex-wrap">
            <span>
              <strong className="text-amber-600">{ucPages.length}</strong> pages under construction
            </span>
            <span>
              <strong className="text-emerald-600">{activePages.length}</strong> active pages
            </span>
            <span className="text-gray-400">
              {PAGE_REGISTRY.length} total registered
            </span>
          </div>
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Search ──────────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pages by name, path, group or role…"
            className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Under Construction Section ───────────────────────────────────── */}
        {ucPages.length > 0 && (
          <section className="space-y-3">
            <SectionHeader title="Under Construction" count={ucPages.length} variant="uc" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {ucPages.map((entry) => (
                <PageCard
                  key={entry.path}
                  entry={entry}
                  ucRoles={ucState[entry.path] || []}
                  onToggleRole={(role) => toggleRole(entry.path, role)}
                  onToggleAll={() => toggleAll(entry)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Active Section ────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <SectionHeader title="Active" count={activePages.length} variant="active" />
          {activePages.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
              {search ? 'No active pages match your search.' : 'All pages are currently under construction.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {activePages.map((entry) => (
                <PageCard
                  key={entry.path}
                  entry={entry}
                  ucRoles={ucState[entry.path] || []}
                  onToggleRole={(role) => toggleRole(entry.path, role)}
                  onToggleAll={() => toggleAll(entry)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Empty search result */}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-sm text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
            No pages match "<span className="font-medium text-gray-600">{search}</span>".
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
