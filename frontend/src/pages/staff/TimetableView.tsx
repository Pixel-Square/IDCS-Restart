import React, { useEffect, useRef, useState } from 'react'
import { ArrowRightLeft, Calendar, Clock, X, ChevronRight, RefreshCw, Users } from 'lucide-react'
import fetchWithAuth from '../../services/fetchAuth'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function shortLabel(item: any) {
  if (!item) return ''
  if (typeof item === 'string') {
    const s = item.trim()
    const firstWord = s.split(/[\s\-\_]+/)[0]
    return firstWord || s.slice(0, 15) + (s.length > 15 ? '…' : '')
  }

  // Prefer a provided mnemonic, otherwise derive a short label
  if (item?.mnemonic) return item.mnemonic
  const txt = item?.course_name || item?.course || item?.subject_text || item?.course_code || ''
  const s = String(txt).trim()
  if (!s) return ''
  const words = s.split(/[\s\-\_]+/).filter((w: string) => w.length > 0)
  if (words.length > 0) return words[0]
  return s.slice(0, 15) + (s.length > 15 ? '…' : '')
}

function formatSectionInfo(assignment: any[]) {
  const parts: string[] = []
  const seen = new Set<string>()
  for (const a of assignment) {
    const section = a.section
    const batch = a.subject_batch || section?.batch
    let info = ''
    if (batch?.name) info += batch.name
    if (section?.name) info += (info ? ' / ' : '') + section.name
    if (!info) {
      if (section?.id) info = 'Sec ' + section.id
      else if (a.subject_batch?.name) info = a.subject_batch.name
    }
    if (info && !seen.has(info)) {
      parts.push(info)
      seen.add(info)
    }
  }
  return parts.length ? parts.join(' + ') : '—'
}

/** Return the ISO date string (YYYY-MM-DD) for a given day-index in the current week.
 *  dayIndex: 0=Mon, 1=Tue, ..., 6=Sun 
 *  Always returns dates within the CURRENT week (Mon-Sun of this week)
 *  Uses LOCAL timezone to avoid date shifting issues
 */
function getDateForDayIndex(dayIndex: number): string {
  const today = new Date()
  const dow = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  // Calculate days from Monday (Mon=0, Tue=1, ..., Sun=6)
  const daysFromMon = dow === 0 ? 6 : dow - 1
  // Get Monday of current week
  const mon = new Date(today)
  mon.setDate(today.getDate() - daysFromMon)
  // Get target day (dayIndex: 0=Mon, ..., 6=Sun)
  const target = new Date(mon)
  target.setDate(mon.getDate() + dayIndex)
  
  // Format in LOCAL timezone (not UTC) to prevent date shifts
  const year = target.getFullYear()
  const month = String(target.getMonth() + 1).padStart(2, '0')
  const day = String(target.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function StaffTimetable(){
  const [timetable, setTimetable] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Section timetable drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSection, setDrawerSection] = useState<{ id: number; name: string; batchName?: string; subjectLabel: string } | null>(null)
  const [secTimetable, setSecTimetable] = useState<any[]>([])
  const [secPeriods, setSecPeriods] = useState<any[]>([])
  const [secLoading, setSecLoading] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  // Period swap state
  const [swapFrom, setSwapFrom] = useState<{ day: number; periodId: number; date: string; subjLabel: string } | null>(null)
  const [swapConfirm, setSwapConfirm] = useState<{ fromPeriodId: number; toPeriodId: number; fromLabel: string; toLabel: string; date: string; fromPeriodNum?: number; toPeriodNum?: number } | null>(null)
  const [swapLoading, setSwapLoading] = useState(false)

  // Calculate actual period number (1-7) excluding breaks/lunch
  const getPeriodNumber = (periodId: number, periods: any[]): number => {
    let count = 0
    for (const p of periods) {
      if (!p.is_break && !p.is_lunch) count++
      if (p.id === periodId) return count
    }
    return count
  }

  useEffect(() => { load() }, [])

  async function load(){
    setLoading(true)
    try{
      const today = new Date().toISOString().slice(0,10)
      const res = await fetchWithAuth(`/api/timetable/staff/?week_date=${today}`)
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTimetable(data.results || [])

      const templateRes = await fetchWithAuth('/api/timetable/templates/')
      if(templateRes.ok){
        const templateData = await templateRes.json()
        const activeTemplate = templateData.find((t:any)=> t.is_active) || templateData[0]
        if(activeTemplate && activeTemplate.periods){
          setPeriods(activeTemplate.periods)
        } else {
          const pset: any[] = []
          for(const d of (data.results||[])){
            for(const a of (d.assignments||[])){
              if(!pset.find(x=> x.id === a.period_id)) pset.push({ id: a.period_id, index: a.period_index, is_break: a.is_break, is_lunch: a.is_lunch, label: a.label, start_time: a.start_time, end_time: a.end_time })
            }
          }
          pset.sort((a,b)=> (a.index||0)-(b.index||0))
          setPeriods(pset)
        }
      }
    }catch(e){ console.error(e) }
    finally{ setLoading(false) }
  }

  async function openSectionDrawer(sectionId: number, sectionName: string, batchName: string | undefined, subjectLabel: string, fromDay?: number, fromPeriodId?: number) {
    if (fromDay !== undefined && fromPeriodId !== undefined) {
      setSwapFrom({ day: fromDay, periodId: fromPeriodId, date: getDateForDayIndex(fromDay), subjLabel: subjectLabel })
    } else {
      setSwapFrom(null)
    }
    setSwapConfirm(null)
    setDrawerSection({ id: sectionId, name: sectionName, batchName, subjectLabel })
    setDrawerOpen(true)
    setSecTimetable([])
    setSecPeriods([])
    setSecLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetchWithAuth(`/api/timetable/section/${sectionId}/timetable/?week_date=${today}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setSecTimetable(data.results || [])
      // Build period list from assignments
      const pmap: Record<number, any> = {}
      for (const d of (data.results || [])) {
        for (const a of (d.assignments || [])) {
          if (a.period_id && !pmap[a.period_id]) {
            pmap[a.period_id] = { id: a.period_id, index: a.period_index ?? 0, label: a.label, start_time: a.start_time, end_time: a.end_time, is_break: a.is_break, is_lunch: a.is_lunch }
          }
        }
      }
      const plist = Object.values(pmap).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      setSecPeriods(plist)
    } catch(e) { console.error(e) }
    finally { setSecLoading(false) }
  }

  // Close drawer on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function reloadSecTimetable(sectionId: number) {
    setSecLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetchWithAuth(`/api/timetable/section/${sectionId}/timetable/?week_date=${today}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setSecTimetable(data.results || [])
      const pmap: Record<number, any> = {}
      for (const d of (data.results || []))
        for (const a of (d.assignments || []))
          if (a.period_id && !pmap[a.period_id])
            pmap[a.period_id] = { id: a.period_id, index: a.period_index ?? 0, label: a.label, start_time: a.start_time, end_time: a.end_time, is_break: a.is_break, is_lunch: a.is_lunch }
      setSecPeriods(Object.values(pmap).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)))
    } catch(e) { console.error(e) }
    finally { setSecLoading(false) }
  }

  async function confirmSwap() {
    if (!swapConfirm || !drawerSection) return
    setSwapLoading(true)
    try {
      const res = await fetchWithAuth(`/api/timetable/section/${drawerSection.id}/swap-periods/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: swapConfirm.date, from_period_id: swapConfirm.fromPeriodId, to_period_id: swapConfirm.toPeriodId }),
      })
      if (!res.ok) { const t = await res.text(); throw new Error(t) }
      setSwapConfirm(null)
      await reloadSecTimetable(drawerSection.id)
      load()
    } catch(e) { console.error(e); alert('Swap failed: ' + String(e)) }
    finally { setSwapLoading(false) }
  }

  async function undoSwap(date: string, sectionId?: number) {
    const sid = sectionId ?? drawerSection?.id
    if (!sid) return
    try {
      const res = await fetchWithAuth(`/api/timetable/section/${sid}/swap-periods/?date=${date}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      if (drawerSection?.id === sid) await reloadSecTimetable(sid)
      load()
    } catch(e) { console.error(e); alert('Undo swap failed') }
  }

  async function retainSwap(date: string, sectionId?: number) {
    const sid = sectionId ?? drawerSection?.id
    if (!sid) return
    try {
      const res = await fetchWithAuth(`/api/timetable/section/${sid}/swap-periods/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (drawerSection?.id === sid) await reloadSecTimetable(sid)
      load()
      alert(`Swap retained for next week: ${data.new_date}`)
    } catch(e) { console.error(e); alert('Retain swap failed: ' + String(e)) }
  }

  async function makeSwapPermanent(date: string, sectionId?: number) {
    const sid = sectionId ?? drawerSection?.id
    if (!sid) return
    if (!window.confirm('Make this swap permanent? The base timetable will be updated and the swap entry removed.')) return
    try {
      const res = await fetchWithAuth(`/api/timetable/section/${sid}/swap-periods/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (drawerSection?.id === sid) await reloadSecTimetable(sid)
      load()
    } catch(e) { console.error(e); alert('Failed to make swap permanent: ' + String(e)) }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Timetable</h1>
              <p className="text-gray-600">View your assigned teaching schedule</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 text-gray-600">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                <span>Loading timetable...</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Weekly Schedule</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">Click any period card to view that section’s full timetable — then click another period on the same day to swap</p>

            <div className="w-full">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-gray-200">
                    <th className="px-2 py-2 text-left text-xs font-semibold text-blue-700 w-[72px]">Day</th>
                    {periods.map((p:any) => (
                      <th key={p.id} className="px-1 py-2 text-center text-xs font-semibold text-blue-700">
                        {p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {DAYS.map((d, di) => (
                    <tr key={d} className="hover:bg-gray-50 transition-colors">
                      <td className="px-2 py-2 text-xs font-semibold text-gray-900 bg-gray-50">{d}</td>
                      {periods.map((p:any) => {
                        const dayObj = timetable.find(x => x.day === di + 1) || { assignments: [] }
                        const assignments = (dayObj.assignments || []).filter((x: any) => x.period_id === p.id)
                        const hasSpecial = assignments.some((x: any) => x.is_special)

                        return (
                          <td key={p.id} className={`px-1 py-1.5 ${hasSpecial && assignments.some(x => !x.is_special) ? 'bg-red-50' : ''}`}>
                            {p.is_break || p.is_lunch ? (
                              <div className="flex items-center justify-center">
                                <span className="text-xs text-gray-500 italic">{p.label || (p.is_break ? 'Break' : 'Lunch')}</span>
                              </div>
                            ) : assignments && assignments.length ? (
                              <div className="space-y-1">
                                {(() => {
                                  const groups: Record<string, any[]> = {}
                                  for (const a of assignments) {
                                    let key = ''
                                    if (a.is_special) key = `special_${a.timetable_name || a.id}`
                                    else if (a.curriculum_row && a.curriculum_row.id) key = `curr_${a.curriculum_row.id}`
                                    else if (a.subject_batch && a.subject_batch.id) key = `batch_${a.subject_batch.id}`
                                    else if (a.elective_subject && a.elective_subject.id) key = `elective_${a.elective_subject.id}`
                                    else if (a.subject_text) key = `subj_${(a.subject_text||'').replace(/[^A-Za-z0-9]/g,'').toLowerCase()}`
                                    else key = `section_${a.section?.id || Math.random()}`
                                    groups[key] = groups[key] || []
                                    groups[key].push(a)
                                  }

                                  return Object.keys(groups).map((k, idx) => {
                                    const g = groups[k]
                                    const a = g[0]
                                    const overridden = hasSpecial && !a.is_special
                                    const bgClass = a.is_swap
                                      ? 'bg-green-50 border border-green-200'
                                      : a.is_special
                                        ? 'bg-amber-50 border border-amber-200'
                                        : overridden
                                          ? 'bg-red-50 border border-red-200'
                                          : 'bg-blue-50 border border-blue-200'
                                    const sectionId: number | undefined = a.section?.id
                                    const sectionName: string = a.section?.name || formatSectionInfo(g)
                                    const batchName: string | undefined = a.section?.batch?.name || a.subject_batch?.name
                                    const subjLabel = a.is_swap
                                      ? shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
                                      : a.is_special
                                        ? (a.timetable_name || 'Special')
                                        : shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
                                    const isElective = !!(a.elective_subject || a.elective_subject_id)
                                    // swap periods are is_special but should still open the section drawer
                                    const clickable = (a.is_swap || !a.is_special) && !isElective && !!sectionId
                                    return (
                                      <div
                                        key={idx}
                                        onClick={() => clickable && openSectionDrawer(sectionId!, sectionName, batchName, subjLabel, a.is_swap ? undefined : di, a.is_swap ? undefined : a.period_id)}
                                        title={clickable ? `Click to view ${sectionName} full timetable` : undefined}
                                        className={`rounded p-1.5 ${bgClass} ${clickable ? 'cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all group' : ''}`}
                                      >
                                        <div className="font-semibold text-gray-900 text-xs leading-tight flex items-center justify-between gap-1">
                                          <span className={a.is_swap ? 'text-green-800' : ''}>
                                            {a.is_swap ? (
                                              <>
                                                <ArrowRightLeft className="w-3 h-3 inline mr-1 text-green-600" />
                                                {shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)}
                                                {a.subject_text && (
                                                  <span className="text-green-500 font-normal ml-1">⇄ {a.subject_text}</span>
                                                )}
                                              </>
                                            ) : a.is_special ? (
                                              <>{a.timetable_name || 'Special'}<span className="text-amber-600 ml-1">• {shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)}</span></>
                                            ) : shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)}
                                          </span>
                                          {clickable && <ChevronRight className={`w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity ${a.is_swap ? 'text-green-500' : 'text-blue-400'}`} />}
                                        </div>
                                        <div className={`text-xs font-medium mt-1 flex items-center gap-1 ${a.is_swap ? 'text-green-700' : 'text-blue-700'}`}>
                                          {clickable && <Users className="w-3 h-3 flex-shrink-0" />}
                                          {formatSectionInfo(g)}
                                        </div>
                                        {overridden && <div className="text-xs text-red-600 mt-1 font-medium">Overridden</div>}
                                        {a.is_swap && <div className="text-xs text-green-600 mt-0.5 font-medium">Swap • {a.date || ''}</div>}
                                        {a.is_swap && a.date && (
                                          <div className="mt-1.5" onClick={e => e.stopPropagation()}>
                                            <button
                                              onClick={e => { e.stopPropagation(); undoSwap(a.date, sectionId) }}
                                              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 bg-red-50 border border-red-200 rounded px-1.5 py-0.5"
                                            >
                                              <X className="w-3 h-3" /> Undo
                                            </button>
                                          </div>
                                        )}
                                        {a.is_special && !a.is_swap && <div className="text-xs text-amber-700 mt-1">{a.date || ''}</div>}
                                      </div>
                                    )
                                  })
                                })()}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center py-1">
                                <span className="text-gray-300 text-xs">—</span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Section Timetable Drawer ───────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />

          {/* Slide panel */}
          <div ref={drawerRef} className="relative bg-white w-full max-w-4xl h-full overflow-y-auto shadow-2xl flex flex-col">
            {/* Swap confirm modal overlay */}
            {swapConfirm && (
              <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-green-100 rounded-lg"><ArrowRightLeft className="w-5 h-5 text-green-700" /></div>
                    <h3 className="text-base font-bold text-gray-900">Confirm Period Swap</h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">Date: <span className="font-semibold text-gray-700">{swapConfirm.date}</span> — applies only for this day</p>
                  <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-4 mb-5">
                    <div className="flex-1 text-center">
                      <div className="text-xs text-gray-500 mb-1">Period {swapConfirm.fromPeriodNum ?? swapConfirm.fromPeriodId}</div>
                      <div className="font-semibold text-indigo-700 text-sm">{swapConfirm.fromLabel}</div>
                    </div>
                    <ArrowRightLeft className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1 text-center">
                      <div className="text-xs text-gray-500 mb-1">Period {swapConfirm.toPeriodNum ?? swapConfirm.toPeriodId}</div>
                      <div className="font-semibold text-green-700 text-sm">{swapConfirm.toLabel}</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">Both staff’s timetables and attendance will reflect this swap for {swapConfirm.date}.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setSwapConfirm(null)} disabled={swapLoading} className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={confirmSwap} disabled={swapLoading} className="flex-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center justify-center gap-1.5">
                      {swapLoading ? <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />Swapping…</> : <><ArrowRightLeft className="w-3.5 h-3.5" />Swap Periods</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Sticky header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    {drawerSection?.batchName ? `${drawerSection.batchName} – ` : ''}{drawerSection?.name ?? 'Section'} Timetable
                  </h2>
                  <p className="text-xs text-gray-500">Viewing from: <span className="font-medium text-indigo-700">{drawerSection?.subjectLabel}</span></p>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Swap-mode banner */}
              {swapFrom && (
                <div className="mx-6 mt-3 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-800">
                  <ArrowRightLeft className="w-4 h-4 flex-shrink-0" />
                  <span>Swap mode — click another period on <strong>{DAYS[swapFrom.day]}</strong> ({swapFrom.date}) to exchange with <strong>{swapFrom.subjLabel}</strong></span>
                  <button onClick={() => setSwapFrom(null)} className="ml-auto text-green-600 hover:text-green-800"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}

            {/* Body */}
            <div className="flex-1 p-6">
              {secLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-gray-500">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent" />
                  <span>Loading section timetable…</span>
                </div>
              ) : secPeriods.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">No timetable data found for this section.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-indigo-50 to-blue-50">
                        <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-indigo-700 sticky left-0 bg-indigo-50 z-10">Day</th>
                        {secPeriods.map((p: any) => (
                          <th key={p.id} className="border border-gray-200 px-3 py-2 text-center font-semibold text-indigo-700 min-w-[90px]">
                            <div>{p.label || `P${p.index}`}</div>
                            {p.start_time && <div className="text-gray-400 font-normal">{p.start_time}{p.end_time ? `–${p.end_time}` : ''}</div>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((d, di) => {
                        const dayData = secTimetable.find((x: any) => x.day === di + 1)
                        const dayAssignments: any[] = dayData?.assignments || []
                        const isSwapDay = !!swapFrom && di === swapFrom.day
                        return (
                          <tr key={d} className={`${isSwapDay ? 'bg-green-50/40' : 'hover:bg-gray-50'}`}>
                            <td className={`border border-gray-200 px-3 py-2 font-semibold sticky left-0 z-10 ${
                              isSwapDay ? 'bg-green-100 text-green-800' : 'bg-gray-50 text-gray-800'
                            }`}>{d}{isSwapDay && <span className="ml-1 text-xs">⇔</span>}</td>
                            {secPeriods.map((p: any) => {
                              const isBreak = p.is_break || p.is_lunch
                              if (isBreak) {
                                return (
                                  <td key={p.id} className="border border-gray-200 px-3 py-2 text-center text-gray-400 italic bg-gray-50">
                                    {p.label || (p.is_break ? 'Break' : 'Lunch')}
                                  </td>
                                )
                              }
                              const cell = dayAssignments.filter((a: any) => a.period_id === p.id)
                              const isSameSwapPeriod = isSwapDay && !!swapFrom && (
                                p.id === swapFrom.periodId ||
                                // fallback: this cell teaches the subject the staff selected
                                (cell.length > 0 && !cell.some((a: any) => a.is_special || a.is_swap) &&
                                  shortLabel(cell[0].elective_subject || cell[0].curriculum_row || cell[0].subject_text) === swapFrom.subjLabel)
                              )
                              const targetCellLabel = cell.length > 0 ? shortLabel(cell[0].elective_subject || cell[0].curriculum_row || cell[0].subject_text) : ''
                              const isSameSubjectAsSwap = !!swapFrom && targetCellLabel !== '' && targetCellLabel === swapFrom.subjLabel
                              const isSwapCandidate = isSwapDay && !isSameSwapPeriod && cell.length > 0 && !cell.some((a: any) => a.is_swap) && !isSameSubjectAsSwap
                              if (!cell.length) {
                                return <td key={p.id} className="border border-gray-200 px-3 py-2 text-center text-gray-200">—</td>
                              }
                              return (
                                <td
                                  key={p.id}
                                  onClick={isSwapCandidate ? () => {
                                    // Resolve the real "from" period_id from the section's own timetable
                                    // (swapFrom.periodId comes from the main grid column which may use a
                                    //  different template's slot IDs than the section's assignments do)
                                    const fromDayData = secTimetable.find((x: any) => x.day === swapFrom!.day + 1)
                                    const fromDayAssignments: any[] = fromDayData?.assignments || []
                                    // 1st: exact period_id match  2nd: match by subject label
                                    const fromA =
                                      fromDayAssignments.find((a: any) => !a.is_special && !a.is_swap && a.period_id === swapFrom!.periodId) ||
                                      fromDayAssignments.find((a: any) => !a.is_special && !a.is_swap && shortLabel(a.elective_subject || a.curriculum_row || a.subject_text) === swapFrom!.subjLabel)
                                    const resolvedFromPeriodId: number = fromA?.period_id ?? swapFrom!.periodId
                                    setSwapConfirm({
                                      fromPeriodId: resolvedFromPeriodId,
                                      toPeriodId: p.id,
                                      fromLabel: swapFrom!.subjLabel,
                                      toLabel: shortLabel(cell[0].elective_subject || cell[0].curriculum_row || cell[0].subject_text),
                                      date: swapFrom!.date,
                                      fromPeriodNum: getPeriodNumber(resolvedFromPeriodId, secPeriods),
                                      toPeriodNum: getPeriodNumber(p.id, secPeriods),
                                    })
                                  } : undefined}
                                  className={`border border-gray-200 px-2 py-1.5 align-top transition-colors ${
                                    isSameSwapPeriod ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' :
                                    isSwapCandidate ? 'cursor-pointer hover:bg-green-100 bg-green-50/60' : ''
                                  }`}
                                >
                                  {isSameSwapPeriod && (
                                    <div className="text-indigo-600 text-xs font-bold mb-1 flex items-center gap-1">
                                      <ArrowRightLeft className="w-3 h-3" /> Selected
                                    </div>
                                  )}
                                  {isSwapCandidate && (
                                    <div className="text-green-700 text-xs font-bold mb-1 flex items-center gap-1">
                                      <ArrowRightLeft className="w-3 h-3" /> Click to swap
                                    </div>
                                  )}
                                  {cell.map((a: any, ai: number) => {
                                    const isSpecial = a.is_special
                                    const isSwapEntry = a.is_swap
                                    const cellSubjLabel = shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
                                    const isMe = !isSpecial && drawerSection && cellSubjLabel === drawerSection.subjectLabel
                                    const bg = isSwapEntry ? 'bg-green-100 border-green-300' : isSpecial ? 'bg-amber-50 border-amber-200' : isMe ? 'bg-indigo-100 border-indigo-300' : 'bg-blue-50 border-blue-200'
                                    const staffName = a.staff ? `${a.staff.first_name || ''} ${a.staff.last_name || ''}`.trim() || a.staff.username || '' : ''
                                    return (
                                      <div key={ai} className={`rounded p-1.5 border mb-1 last:mb-0 ${bg}`}>
                                        <div className={`font-semibold leading-tight ${
                                          isSwapEntry ? 'text-green-800' : isMe ? 'text-indigo-800' : 'text-gray-800'
                                        }`}>
                                          {isSwapEntry && <span className="mr-1">&#x21C4;</span>}
                                          {isSwapEntry 
                                            ? shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
                                            : isSpecial 
                                              ? (a.timetable_name?.replace(/^\[SWAP\]\s*\S+\s*/, '') || 'Special') 
                                              : shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
                                          }
                                          {isMe && !isSwapEntry && <span className="ml-1 text-indigo-500">★</span>}
                                        </div>
                                        {isSwapEntry && a.subject_text && (
                                          <div className="text-green-600 text-xs mt-0.5 flex items-center gap-1">
                                            <ArrowRightLeft className="w-2.5 h-2.5" />
                                            <span className="line-through text-gray-400">{a.subject_text}</span>
                                          </div>
                                        )}
                                        {staffName && <div className="text-gray-500 mt-0.5">{staffName}</div>}
                                        {a.subject_batch?.name && <div className="text-blue-600 mt-0.5">{a.subject_batch.name}</div>}
                                        {isSwapEntry && (
                                          <div className="mt-1.5">
                                            <button
                                              onClick={e => { e.stopPropagation(); undoSwap(a.date) }}
                                              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 bg-red-50 border border-red-200 rounded px-1.5 py-0.5"
                                            >
                                              <X className="w-3 h-3" /> Undo
                                            </button>
                                          </div>
                                        )}
                                        {isSpecial && !isSwapEntry && a.date && <div className="text-amber-600 mt-0.5">{a.date}</div>}
                                      </div>
                                    )
                                  })}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
