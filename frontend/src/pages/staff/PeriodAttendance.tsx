import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import './PeriodAttendance.css'

type PeriodItem = {
  id: number
  section_id: number
  section_name: string
  period: { id: number; index: number; label?: string; start_time?: string; end_time?: string }
  subject?: string | null
  subject_batch_id?: number | null
  attendance_session_id?: number | null
  attendance_session_locked?: boolean
  elective_subject_id?: number | null
  elective_subject_name?: string | null
}

type Student = { id: number; reg_no: string; username: string }

export default function PeriodAttendance(){
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10))
  const [periods, setPeriods] = useState<PeriodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<PeriodItem | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [marks, setMarks] = useState<Record<number,string>>({})
  const [saving, setSaving] = useState(false)

  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkMonth, setBulkMonth] = useState<string>(new Date().toISOString().slice(0,7))
  const [bulkAssignments, setBulkAssignments] = useState<any[]>([])
  const [selectedAssignments, setSelectedAssignments] = useState<Record<string,boolean>>({})
  const [aggStudents, setAggStudents] = useState<Student[]>([])
  const [aggLoading, setAggLoading] = useState(false)
  const [bulkDateSelected, setBulkDateSelected] = useState<Record<string,boolean>>({})
  const [bulkSelected, setBulkSelected] = useState<Record<number,boolean>>({})

  useEffect(()=>{ fetchPeriods() }, [date])

  async function fetchPeriods(){
    setLoading(true)
    try{
      const res = await fetchWithAuth(`/api/academics/staff/periods/?date=${date}`)
      if(!res.ok) throw new Error('Failed to load periods')
      const j = await res.json()
      setPeriods(j.results || [])
    }catch(e){ console.error('fetchPeriods', e); setPeriods([]) }
    finally{ setLoading(false) }
  }

  async function openPeriod(p: PeriodItem){
    setSelected(p)
    setStudents([])
    setMarks({})
    setLoading(true)
    try{
      let studs: any[] = []
      if (p.elective_subject_id) {
        const esres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${p.elective_subject_id}`)
        if (esres.ok){ const esj = await esres.json(); studs = esj.results || [] }
      } else if (p.subject_batch_id){
        const bres = await fetchWithAuth(`/api/academics/subject-batches/${p.subject_batch_id}/`)
        if (bres.ok){ const bj = await bres.json(); studs = bj.students || bj.results || [] }
      } else {
        const sres = await fetchWithAuth(`/api/academics/sections/${p.section_id}/students/`)
        if (sres.ok){ const sj = await sres.json(); studs = sj.results || [] }
      }

      setStudents(studs.map(s=> ({ id: s.id, reg_no: s.reg_no || s.regno || String(s.id), username: s.username || s.name || '' })))
      const initial: Record<number,string> = {}
      (studs||[]).forEach((s:any)=> initial[s.id] = 'P')
      setMarks(initial)

      if (p.attendance_session_id){
        try{
          const pres = await fetchWithAuth(`/api/academics/period-attendance/${p.attendance_session_id}/`)
          if (pres.ok){ const pj = await pres.json(); const recs = pj.records || []; const updated = { ...initial }
            recs.forEach((r:any)=>{ const sid = r.student_pk || (r.student && r.student.id) || null; if (sid) updated[sid] = r.status || updated[sid] || 'A' })
            setMarks(updated)
          }
        }catch(e){ console.error('load session records', e) }
      }
    }catch(e){ console.error('openPeriod', e) }
    finally{ setLoading(false) }
  }

  function setMark(studentId:number, status:string){ setMarks(m=> ({ ...m, [studentId]: status })) }

  async function saveMarks(){
    if (!selected) return
    setSaving(true)
    try{
      const payload = { section_id: selected.section_id, period_id: selected.period.id, date, records: students.map(s=> ({ student_id: s.id, status: marks[s.id] || 'A' })) }
      const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark/', { method: 'POST', body: JSON.stringify(payload) })
      if(!res.ok){ let txt = 'Save failed'; try{ const j = await res.json(); txt = JSON.stringify(j) }catch(_){ try{ txt = await res.text() }catch(_){}}; alert('Failed to save: '+txt); return }
      await fetchPeriods()
      alert('Attendance saved')
    }catch(e){ console.error('saveMarks', e); alert('Failed to save attendance') }
    finally{ setSaving(false) }
  }

  // Bulk helpers (simplified): load assignments and aggregate student lists for selected assignments
  async function openBulkModal(){
    try{
      const res = await fetchWithAuth('/api/timetable/staff/')
      if(!res.ok) throw new Error('Failed to load assignments')
      const j = await res.json()
      const flat: any[] = []
      for (const d of (j.results||[])){
        const dayNum = d.day
        for (const a of (d.assignments||[])) flat.push({ ...a, _day: dayNum })
      }
      setBulkAssignments(flat)
      setBulkModalOpen(true)
      setSelectedAssignments({}); setBulkDateSelected({}); setBulkSelected({})
    }catch(e){ console.error('openBulkModal', e); alert('Failed to open bulk modal') }
  }

  useEffect(()=>{
    // when selectedAssignments or bulkAssignments change, aggregate students
    async function loadAgg(){
      const keys = Object.keys(selectedAssignments).filter(k=> selectedAssignments[k])
      if (!keys.length){ setAggStudents([]); return }
      setAggLoading(true)
      try{
        const tasks: Promise<any>[] = []
        for (const a of bulkAssignments){
          const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
          if (!selectedAssignments[key]) continue
          if (a.elective_subject_id) tasks.push(fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${a.elective_subject_id}`).then(r=> r.ok? r.json(): { results: [] }))
          else if (a.subject_batch_id || a.subject_batch?.id) { const sb = a.subject_batch_id || a.subject_batch?.id; tasks.push(fetchWithAuth(`/api/academics/subject-batches/${sb}/`).then(r=> r.ok? r.json(): { students: [] })) }
          else if (a.section_id || a.section?.id) { const sid = a.section_id || a.section?.id; tasks.push(fetchWithAuth(`/api/academics/sections/${sid}/students/`).then(r=> r.ok? r.json(): { results: [] })) }
        }
        const settled = await Promise.allSettled(tasks)
        const all: Student[] = []
        for (const sres of settled){ if (sres.status !== 'fulfilled') continue; const data = sres.value || {}; const list = data.results || data.students || []; for (const st of list){ if (!st || !st.id) continue; if (!all.find(x=> x.id === st.id)) all.push({ id: st.id, reg_no: st.reg_no || st.regno || String(st.id), username: st.username || st.name || '' }) } }
        setAggStudents(all)
        setBulkSelected(prev=> { const copy = { ...prev }; for (const s of all) if (copy[s.id] === undefined) copy[s.id] = false; return copy })
      }catch(e){ console.error('loadAgg', e); setAggStudents([]) }
      finally{ setAggLoading(false) }
    }
    loadAgg()
  }, [selectedAssignments, bulkAssignments])

  return (
    <div className="period-attendance">
      <h2>Period Attendance</h2>
      <div className="controls">
        <label>Date: </label>
        <input type="date" value={date} onChange={e=> setDate(e.target.value)} />
      </div>

      <div>
        <h3>Assigned Periods</h3>
        {loading ? <p>Loading…</p> : (
          <div className="periods-grid">
            {periods.map(p=> (
              <div key={p.id} className="period-card">
                <div className="period-title">{p.period.label || `Period ${p.period.index}`}</div>
                <div className="period-time">{p.period.start_time || ''}{p.period.start_time && p.period.end_time ? ` — ${p.period.end_time}` : ''}</div>
                <div className="period-meta">{p.section_name}</div>
                <div className="period-meta" style={{ fontStyle: 'italic' }}>{p.subject || p.subject || 'No subject'}</div>
                <div style={{ marginTop: 8 }}>
                  {p.attendance_session_locked ? <button className="btn secondary" disabled>Attendance Locked</button> : <button className="btn" onClick={()=> openPeriod(p)}>{p.attendance_session_id ? 'Open Session' : 'Take Attendance'}</button>}
                </div>
              </div>
            ))}
            <div style={{ width: '100%' }}>
              <button className="btn ghost" onClick={openBulkModal}>Bulk Mark (All Assignments)</button>
            </div>
            {!periods.length && <div>No periods assigned for this date</div>}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 18 }} className="session-panel">
          <h3>{selected.period.label || `Period ${selected.period.index}`} — {selected.section_name}</h3>
          <div><button className="btn secondary" onClick={()=> setSelected(null)}>Close</button></div>
          <div style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Reg No</th>
                  <th>Student</th>
                  <th>Present</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s=> (
                  <tr key={s.id}>
                    <td>{s.reg_no}</td>
                    <td>{s.username}</td>
                    <td>
                      <select value={marks[s.id] || 'P'} onChange={e=> setMark(s.id, e.target.value)}>
                        <option value="P">Present</option>
                        <option value="A">Absent</option>
                        <option value="LEAVE">Leave</option>
                        <option value="OD">On Duty</option>
                        <option value="LATE">Late</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={saveMarks} disabled={saving}>{saving ? 'Saving…' : 'Save Attendance'}</button>
            </div>
          </div>
        </div>
      )}

      {bulkModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Bulk Mark Attendance</h3>
            <div style={{ marginBottom: 8 }}>
              <label>Month: </label>
              <input type="month" value={bulkMonth} onChange={e=> setBulkMonth(e.target.value)} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Assignments</strong>
              <div className="assignments-list">
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={Object.keys(selectedAssignments).length>0 && Object.values(selectedAssignments).every(Boolean)} onChange={(e)=>{ const checked = e.target.checked; const next: Record<string,boolean> = {}; for(const a of bulkAssignments){ const key = a.id? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`; next[key] = checked } setSelectedAssignments(next) }} /> Select / Deselect all</label>
                {bulkAssignments.map(a=>{
                  const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`
                  return (
                    <label key={key} className="assignment-item">
                      <input type="checkbox" checked={!!selectedAssignments[key]} onChange={()=> setSelectedAssignments(prev=> ({ ...prev, [key]: !prev[key] }))} />
                      <div style={{ fontSize: 13 }}>
                        <strong>{a.label || `Period ${a.period_index}`}</strong> — {['Mon','Tue','Wed','Thu','Fri','Sat'][a._day-1] || `Day ${a._day}`} {a.start_time ? ` ${a.start_time}${a.end_time? ' - '+a.end_time : ''}` : ''}
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{a.section_name || a.section?.name || (a.section_id ? `Section ${a.section_id}` : '')} — {a.subject_display || a.subject_text || ''}</div>
                      </div>
                    </label>
                  )
                })}
              </div>

              <div style={{ marginTop: 12 }}>
                <strong>Dates (month view for selected assignments)</strong>
                <div className="dates-grid" style={{ marginTop: 8 }}>
                  {(() => {
                    try{
                      const [y,m] = bulkMonth.split('-').map(x=> parseInt(x))
                      const last = new Date(y,m,0)
                      const weekdays = new Set<number>()
                      for(const a of bulkAssignments){ const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`; if (selectedAssignments[key]) weekdays.add(a._day) }
                      const dates: string[] = []
                      for(let d=1; d<= last.getDate(); d++){ const dt = new Date(y,m-1,d); const isow = dt.getDay() === 0 ? 7 : dt.getDay(); if (weekdays.size>0 && weekdays.has(isow)) dates.push(dt.toISOString().slice(0,10)) }
                      return dates.map(dd=> (<label key={dd} className="date-chip"><input type="checkbox" checked={!!bulkDateSelected[dd]} onChange={()=> setBulkDateSelected(prev=> ({ ...prev, [dd]: !prev[dd] }))} /> {dd}</label>))
                    }catch(e){ return <div /> }
                  })()}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <strong>Students (derived from selected assignments)</strong>
              <div className="students-box">
                {aggLoading && <div style={{ color:'#6b7280' }}>Loading students…</div>}
                {!aggLoading && aggStudents.length === 0 && <div style={{ color:'#6b7280' }}>No students for selected assignments</div>}
                {!aggLoading && aggStudents.map(s=> (
                  <div key={s.id} className="student-row"><label><input type="checkbox" checked={!!bulkSelected[s.id]} onChange={_=> setBulkSelected(prev=> ({ ...prev, [s.id]: !prev[s.id] }))} /> {s.reg_no} — {s.username}</label></div>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop: 12 }}>
              <button className="btn" onClick={async ()=>{
                const selectedDates = Object.keys(bulkDateSelected).filter(d=> bulkDateSelected[d])
                if (!selectedDates.length){ alert('Select at least one date'); return }
                // Prepare payload: assignments and students
                const assignments_payload: any[] = []
                for(const a of bulkAssignments){ const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section?.id || a.section_id}`; if (!selectedAssignments[key]) continue; const raw_section = a.section_id || (a.section && (a.section.id || a.section.pk)) || a.section?.pk || a.section?.id; const raw_period = a.period_id || (a.period && (a.period.id || a.period_id)) || a.period?.id || a.period_id; const section_id = Number(raw_section); const period_id = Number(raw_period); if (!Number.isFinite(section_id) || !Number.isFinite(period_id)) continue; assignments_payload.push({ section_id, period_id }) }
                const student_ids = Object.keys(bulkSelected).filter(k=> bulkSelected[Number(k)]).map(k=> Number(k))
                if (!assignments_payload.length){ alert('No assignments selected'); return }
                if (!student_ids.length){ alert('No students selected'); return }
                try{
                  const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark/', { method: 'POST', body: JSON.stringify({ assignments: assignments_payload, dates: selectedDates, student_ids }) })
                  if (!res.ok) { let txt = 'Failed'; try{ const j = await res.json(); txt = JSON.stringify(j) }catch(_){ try{ txt = await res.text() }catch(_){}} alert('Failed: '+txt); return }
                  alert('Bulk attendance saved')
                  setBulkModalOpen(false)
                }catch(e){ console.error('bulk save', e); alert('Failed to save bulk attendance') }
              }}>Save Bulk</button>
              <button className="btn secondary" onClick={()=> setBulkModalOpen(false)}>Close</button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
