import React, { useEffect, useState } from 'react'
import { Calendar, Clock, User } from 'lucide-react'
import fetchWithAuth from '../../services/fetchAuth'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat']

function shortLabel(item: any) {
  if (!item) return ''
  if (typeof item === 'string') {
    const s = item.trim()
    // Extract first word only
    const firstWord = s.split(/[\s\-\_]+/)[0]
    return firstWord || s.slice(0, 15) + (s.length > 15 ? '…' : '')
  }
  
  // Prioritize course_name over course_code for better readability
  const txt = item.course_name || item.course || item.subject_text || item.course_code || ''
  const s = String(txt).trim()
  
  if (!s) return ''
  
  // Extract first word from course name
  const words = s.split(/[\s\-\_]+/).filter(w => w.length > 0)
  if (words.length > 0) {
    return words[0]
  }
  
  // Fallback: return first 15 characters if no word separation found
  return s.slice(0, 15) + (s.length > 15 ? '…' : '')
}

function formatSectionInfo(assignment: any) {
  const section = assignment.section
  const batch = assignment.subject_batch || section?.batch
  
  let info = ''
  
  // Prioritize batch name from section.batch over subject_batch
  if (batch?.name) {
    info += batch.name
  }
  
  if (section?.name) {
    info += (info ? ' / ' : '') + section.name
  }
  
  // Fallback if no batch or section name available
  if (!info) {
    if (section?.id) {
      info = 'Sec ' + section.id
    } else if (assignment.subject_batch?.name) {
      info = assignment.subject_batch.name
    }
  }
  
  return info || '—'
}

export default function StaffTimetable(){
  const [timetable, setTimetable] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState(0) // For mobile view

  useEffect(()=>{ load() }, [])

  async function load(){
    setLoading(true)
    try{
      // Fetch staff timetable, include today's date so date-specific special entries
      // can hide normal assignments for that day.
      const today = new Date().toISOString().slice(0,10)
      const res = await fetchWithAuth(`/api/timetable/staff/?date=${today}`)
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTimetable(data.results || [])
      
      // Fetch template to get all periods including breaks/lunch
      const templateRes = await fetchWithAuth('/api/timetable/templates/')
      if(templateRes.ok){
        const templateData = await templateRes.json()
        const activeTemplate = templateData.find((t:any)=> t.is_active) || templateData[0]
        if(activeTemplate && activeTemplate.periods){
          setPeriods(activeTemplate.periods)
        } else {
          // Fallback: extract from assignments
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
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
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Weekly Schedule</h3>
              </div>
            </div>

            {/* Mobile: Day Selector Buttons */}
            <div className="md:hidden p-4 border-b border-gray-100 bg-gray-50">
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(idx)}
                    className={`px-2 py-2 rounded-lg font-semibold text-xs transition-all ${
                      selectedDay === idx 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop: Full Weekly View */}
            <div className="hidden md:block">
              <div className="w-full">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-gray-200">
                      <th className="w-24 px-3 py-3 text-left text-sm font-semibold text-blue-700">Day</th>
                      {periods.filter(p => !p.is_break && !p.is_lunch).map(p => (
                        <th key={p.id} className="px-2 py-3 text-left text-xs font-semibold text-blue-700">
                          {p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {DAYS.map((d, di) => (
                      <tr key={d} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 font-semibold text-gray-900 bg-gray-50">{d}</td>
                        {periods.filter(p => !p.is_break && !p.is_lunch).map(p => {
                          const dayObj = timetable.find(x => x.day === di + 1) || { assignments: [] }
                          const assignments = (dayObj.assignments || []).filter((x: any) => x.period_id === p.id)
                          const hasSpecial = assignments.some((x: any) => x.is_special)
                          
                          return (
                            <td 
                              key={p.id} 
                              className={`px-2 py-2 align-top ${hasSpecial && assignments.some(x => !x.is_special) ? 'bg-red-50' : ''}`}
                            >
                              {p.is_break || p.is_lunch ? (
                                <div className="flex items-center justify-center">
                                  <span className="text-xs text-gray-500 italic">
                                    {p.label || (p.is_break ? 'Break' : 'Lunch')}
                                  </span>
                                </div>
                              ) : assignments && assignments.length ? (
                                <div className="space-y-1">
                                  {assignments.map((a: any, i: number) => {
                                    const overridden = hasSpecial && !a.is_special
                                    return (
                                      <div 
                                        key={i} 
                                        className={`rounded-md p-2 ${
                                          a.is_special 
                                            ? 'bg-amber-50 border border-amber-200' 
                                            : overridden 
                                              ? 'bg-red-50 border border-red-200' 
                                              : 'bg-blue-50 border border-blue-200'
                                        }`}
                                      >
                                        <div className="font-semibold text-gray-900 text-xs leading-tight">
                                          {a.is_special 
                                            ? (a.timetable_name || 'Special')
                                            : shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
                                          }
                                        </div>
                                        <div className="text-xs text-blue-700 font-medium mt-0.5">
                                          {formatSectionInfo(a)}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center py-2">
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

            {/* Mobile: Periods List for Selected Day */}
            <div className="md:hidden">
              <div className="p-4">
                <h4 className="text-sm font-bold text-gray-700 mb-3">{DAYS[selectedDay]}'s Schedule</h4>
                <div className="space-y-3">
                  {periods.filter(p => !p.is_break && !p.is_lunch).map((p, pidx) => {
                    const dayObj = timetable.find(x => x.day === selectedDay + 1) || { assignments: [] }
                    const assignments = (dayObj.assignments || []).filter((x: any) => x.period_id === p.id)
                    const hasSpecial = assignments.some((x: any) => x.is_special)

                    return (
                      <div key={`mobile-period-${pidx}`} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
                          <div className="font-semibold text-sm text-blue-900">
                            {p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`}
                          </div>
                        </div>
                        <div className="px-4 py-3 bg-white">
                          {p.is_break || p.is_lunch ? (
                            <div className="text-center py-2">
                              <span className="text-sm text-gray-500 italic">
                                {p.label || (p.is_break ? 'Break' : 'Lunch')}
                              </span>
                            </div>
                          ) : assignments && assignments.length ? (
                            <div className="space-y-2">
                              {assignments.map((a: any, i: number) => {
                                const overridden = hasSpecial && !a.is_special
                                return (
                                  <div 
                                    key={i}
                                    className={`rounded-lg p-3 ${
                                      a.is_special 
                                        ? 'bg-amber-50 border border-amber-200' 
                                        : overridden 
                                          ? 'bg-red-50 border border-red-200' 
                                          : 'bg-blue-50 border border-blue-200'
                                    }`}
                                  >
                                    <div className="font-semibold text-gray-900 text-sm mb-2">
                                      {a.is_special 
                                        ? (a.timetable_name || 'Special')
                                        : shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)
                                      }
                                      {a.is_special && (
                                        <span className="text-amber-600 ml-1">
                                          • {shortLabel(a.elective_subject || a.curriculum_row || a.subject_text)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <User className="h-3 w-3 text-gray-600" />
                                      <div className="text-xs text-blue-700 font-medium">
                                        {formatSectionInfo(a)}
                                      </div>
                                    </div>
                                    {overridden && (
                                      <div className="text-xs text-red-600 mt-1 font-medium">
                                        Overridden
                                      </div>
                                    )}
                                    {a.is_special && (
                                      <div className="text-xs text-amber-700 mt-1">
                                        {a.date || ''}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-3">
                              <span className="text-gray-400 text-sm">No class scheduled</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
