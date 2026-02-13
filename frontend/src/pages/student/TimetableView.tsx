import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Calendar, Clock, BookOpen, Users, AlertCircle, Loader2 } from 'lucide-react'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function shortLabel(item:any){
  if(!item) return ''
  if(typeof item === 'string'){
    const s = item.trim()
    // Extract first word only for better readability
    const firstWord = s.split(/[\s\-\_]+/)[0]
    return firstWord || s.slice(0, 15) + (s.length > 15 ? '…' : '')
  }
  if(item.course_code) return item.course_code
  // Prioritize course_name over course_code for better readability
  const txt = item.course_name || item.course || item.subject_text || ''
  const s = String(txt).trim()
  if(!s) return ''
  
  // Extract first word from course name
  const words = s.split(/[\s\-\_]+/).filter(w => w.length > 0)
  if(words.length > 0) {
    return words[0]
  }
  
  // Fallback: return first 15 characters if no word separation found
  return s.slice(0, 15) + (s.length > 15 ? '…' : '')
}

export default function StudentTimetable(){
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [timetable, setTimetable] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [studentId, setStudentId] = useState<number | null>(null)
  const [selectedDay, setSelectedDay] = useState(0) // For mobile view

  useEffect(()=>{ fetchProfile() }, [])

  async function fetchProfile(){
    try{
      const res = await fetchWithAuth('/api/accounts/me/')
      if(!res.ok) throw new Error(await res.text())
      const me = await res.json()
      const prof = me.profile || {}
      setStudentId(me.id)
      if(prof.section_id) setSectionId(prof.section_id)
    }catch(e){ console.error(e) }
  }

  useEffect(()=>{
    if(!sectionId) return
    setLoading(true)
    ;(async ()=>{
      try{
        const res = await fetchWithAuth(`/api/timetable/section/${sectionId}/timetable/`)
        if(!res.ok) throw new Error(await res.text())
        const data = await res.json()
        let tt = data.results || []
        // Backend should handle subject batch filtering and resolution for students

        setTimetable(tt)
        // derive periods from first day's assignments or ask templates endpoint
        const pset = [] as any[]
        for(const d of (tt||[])){
          for(const a of (d.assignments||[])){
            if(!pset.find(x=> x.id === a.period_id)) pset.push({ id: a.period_id, index: a.period_index, is_break: a.is_break, label: a.label })
          }
        }
        pset.sort((a,b)=> (a.index||0)-(b.index||0))
        setPeriods(pset)
      }catch(e){ console.error(e) }
      finally{ setLoading(false) }
    })()
  },[sectionId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Timetable</h1>
              <p className="text-gray-600">View your class schedule for the week</p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 text-gray-600">
                <Loader2 className="animate-spin h-5 w-5 text-indigo-600" />
                <span>Loading timetable...</span>
              </div>
            </div>
          </div>
        )}

        {!loading && !sectionId && (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Section Not Assigned</h3>
              <p className="text-gray-600">You are not assigned to a section or your profile is incomplete.</p>
            </div>
          </div>
        )}

        {!loading && sectionId && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-600" />
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
                        ? 'bg-indigo-600 text-white shadow-md' 
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
                    <tr className="bg-gradient-to-r from-slate-50 to-blue-50 border-b-2 border-gray-200">
                      <th className="w-24 px-3 py-3 text-left font-semibold text-gray-700">
                        Day
                      </th>
                      {periods.filter(p => !p.is_break && !p.is_lunch).map(p=> (
                        <th key={`period-${p.id}`} className="px-2 py-3 text-left">
                          <div className="text-xs font-bold text-indigo-700 truncate">
                            {p.is_break || p.is_lunch ? (p.label || (p.is_break ? 'Break' : 'Lunch')) : (p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {DAYS.map((d,di)=> (
                      <tr key={`day-${di}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 font-bold text-gray-900 bg-gray-50">{d}</td>
                        {periods.filter(p => !p.is_break && !p.is_lunch).map(p=> {
                          const dayObj = timetable.find(x=> x.day === di+1) || { assignments: [] }
                          const assignments = (dayObj.assignments||[]).filter((x:any)=> x.period_id === p.id)
                          const hasSpecial = assignments.some((x:any)=> x.is_special)
                          
                          return (
                            <td 
                              key={`cell-${di}-${p.id}`} 
                              className={`px-2 py-2 align-top ${hasSpecial && assignments.some(x=> !x.is_special) ? 'bg-red-50' : ''}`}
                            >
                              {p.is_break ? (
                                <div className="flex items-center justify-center py-2">
                                  <span className="text-xs text-gray-500 italic">{p.label||'Break'}</span>
                                </div>
                              ) : (
                                assignments && assignments.length ? (
                                  <div className="space-y-1">
                                    {assignments.map((a:any, i:number)=> {
                                      const overridden = hasSpecial && !a.is_special
                                      return (
                                        <div 
                                          key={`${a.id || a.curriculum_row?.id || i}`} 
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
                                              : shortLabel(a.curriculum_row || a.subject_text)
                                            }
                                          </div>
                                          <div className="text-xs text-gray-600 mt-0.5 truncate">
                                            {a.staff?.username || '—'}
                                          </div>
                                          {a.subject_batch && (
                                            <div className="text-xs text-blue-600 mt-0.5 font-medium">
                                              {a.subject_batch.name}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center py-2">
                                    <span className="text-gray-300 text-xs">—</span>
                                  </div>
                                )
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
                    const dayObj = timetable.find(x=> x.day === selectedDay+1) || { assignments: [] }
                    const assignments = (dayObj.assignments||[]).filter((x:any)=> x.period_id === p.id)
                    const hasSpecial = assignments.some((x:any)=> x.is_special)

                    return (
                      <div key={`mobile-period-${pidx}`} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100">
                          <div className="font-semibold text-sm text-indigo-900">
                            {p.is_break || p.is_lunch ? (p.label || (p.is_break ? 'Break' : 'Lunch')) : (p.label || `${p.start_time || ''}${p.start_time && p.end_time ? ' - ' : ''}${p.end_time || ''}`)}
                          </div>
                        </div>
                        <div className="px-4 py-3 bg-white">
                          {p.is_break ? (
                            <div className="text-center py-2">
                              <span className="text-sm text-gray-500 italic">{p.label || 'Break'}</span>
                            </div>
                          ) : assignments && assignments.length ? (
                            <div className="space-y-2">
                              {assignments.map((a:any, i:number) => {
                                const overridden = hasSpecial && !a.is_special
                                return (
                                  <div 
                                    key={`mobile-${a.id || a.curriculum_row?.id || i}`}
                                    className={`rounded-lg p-3 ${
                                      a.is_special 
                                        ? 'bg-amber-50 border border-amber-200' 
                                        : overridden 
                                          ? 'bg-red-50 border border-red-200' 
                                          : 'bg-blue-50 border border-blue-200'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2 mb-2">
                                      <BookOpen className="h-4 w-4 text-gray-600 mt-0.5" />
                                      <div className="flex-1">
                                        <div className="font-semibold text-gray-900 text-sm">
                                          {a.is_special 
                                            ? (a.timetable_name || 'Special')
                                            : shortLabel(a.curriculum_row || a.subject_text)
                                          }
                                        </div>
                                        {a.is_special && (
                                          <div className="text-sm text-amber-600 mt-1">
                                            {shortLabel(a.curriculum_row || a.subject_text)}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-700">
                                      <Users className="h-3 w-3" />
                                      <span>Staff: {a.staff?.username || '—'}</span>
                                    </div>
                                    {a.subject_batch && (
                                      <div className="text-xs text-blue-700 mt-1 font-medium">
                                        Batch: {a.subject_batch.name}
                                      </div>
                                    )}
                                    {overridden && (
                                      <div className="text-xs text-red-600 mt-1 font-medium">
                                        Overridden by special
                                      </div>
                                    )}
                                    {a.is_special && (
                                      <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
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
