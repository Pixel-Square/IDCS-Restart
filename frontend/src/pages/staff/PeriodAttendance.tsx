import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';

type PeriodItem = {
  id: number;
  section_id: number;
  section_name: string;
  period: { id: number; index: number; label?: string; start_time?: string; end_time?: string };
  subject?: string | null;
  subject_batch_id?: number | null;
  attendance_session_id?: number | null;
  attendance_session_locked?: boolean;
  elective_subject_id?: number | null;
  elective_subject_name?: string | null;
};

type Student = { id: number; reg_no: string; username: string };

export default function PeriodAttendance() {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PeriodItem | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkMonth, setBulkMonth] = useState<string>(new Date().toISOString().slice(0,7)); // YYYY-MM
  const [bulkSelected, setBulkSelected] = useState<Record<number, boolean>>({});
  const [bulkDateSelected, setBulkDateSelected] = useState<Record<string, boolean>>({});
  const [bulkAssignments, setBulkAssignments] = useState<any[]>([]);
  const [selectedAssignments, setSelectedAssignments] = useState<Record<string, boolean>>({});
  const [aggStudents, setAggStudents] = useState<Student[]>([]);
  const [aggLoading, setAggLoading] = useState<boolean>(false);

  // When selected assignments change, fetch and aggregate student lists
  useEffect(() => {
    async function loadAgg() {
      const selectedKeys = Object.keys(selectedAssignments).filter(k => selectedAssignments[k]);
      if (!selectedKeys.length) {
        setAggStudents([]);
        return;
      }
      setAggLoading(true);
      try {
        const tasks: Promise<any>[] = [];
        for (const a of bulkAssignments) {
          const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`;
          if (!selectedAssignments[key]) continue;
          // decide endpoint: elective -> elective-choices, subject_batch -> subject-batches, else section students
          if ((a as any).elective_subject_id) {
            tasks.push(fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${(a as any).elective_subject_id}`).then(r => r.ok ? r.json() : { results: [] }));
          } else if ((a as any).subject_batch_id || (a as any).subject_batch?.id) {
            const sb = (a as any).subject_batch_id || (a as any).subject_batch?.id;
            tasks.push(fetchWithAuth(`/api/academics/subject-batches/${sb}/`).then(r => r.ok ? r.json() : { students: [] }));
          } else if ((a as any).section_id || (a as any).section?.id) {
            const sid = (a as any).section_id || (a as any).section?.id;
            tasks.push(fetchWithAuth(`/api/academics/sections/${sid}/students/`).then(r => r.ok ? r.json() : { results: [] }));
          }
        }
        const settled = await Promise.allSettled(tasks);
        const all: Student[] = [];
        for (const sres of settled) {
          if (sres.status !== 'fulfilled') continue;
          const data = sres.value || {};
          const list = data.results || data.students || [];
          for (const st of list) {
            if (!st || !st.id) continue;
            if (!all.find(x => x.id === st.id)) {
              all.push({ id: st.id, reg_no: st.reg_no || st.regno || st.reg_no || String(st.id), username: st.username || (st.user && st.user.username) || st.name || '' });
            }
          }
        }
        setAggStudents(all);
        // ensure bulkSelected initialized for these students
        setBulkSelected(prev => {
          const copy = { ...prev };
          for (const s of all) if (copy[s.id] === undefined) copy[s.id] = false;
          return copy;
        });
      } catch (e) {
        console.error('Failed to load aggregated students', e);
        setAggStudents([]);
      } finally {
        setAggLoading(false);
      }
    }
    loadAgg();
  }, [selectedAssignments, bulkAssignments]);

  useEffect(() => {
    fetchPeriods();
  }, [date]);

  async function fetchPeriods() {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/academics/staff/periods/?date=${date}`);
      const j = await res.json();
      setPeriods(j.results || []);
    } catch (e) {
      console.error(e);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }

  async function openPeriod(p: PeriodItem) {
    setSelected(p);
    setStudents([]);
    setMarks({});
    setLoading(true);
    try {
      let studs: any[] = [];
      // If this period corresponds to an elective sub-option, fetch elective-choices
      if ((p as any).elective_subject_id) {
        try {
          const esres = await fetchWithAuth(`/api/curriculum/elective-choices/?elective_subject_id=${(p as any).elective_subject_id}`);
          if (esres.ok) {
            const esj = await esres.json();
            studs = esj.results || [];
          }
        } catch (e) {
          console.error('Failed to load elective choosers', e);
        }
      } else if (p.subject_batch_id) {
        // fetch students from the subject batch when period is batch-wise
        const bres = await fetchWithAuth(`/api/academics/subject-batches/${p.subject_batch_id}/`);
        if (bres.ok) {
          const bj = await bres.json();
          // subject-batch serializer returns students in `.students` or `.results` depending on view
          studs = bj.students || bj.results || [];
        }
      } else {
        const sres = await fetchWithAuth(`/api/academics/sections/${p.section_id}/students/`);
        const sj = await sres.json();
        studs = sj.results || [];
      }
      setStudents(studs);
      const initial: Record<number, string> = {};
      studs.forEach((s: any) => (initial[s.id] = 'P'));
      setMarks(initial);

      // If there's an existing attendance session, fetch records and populate marks
      if (p.attendance_session_id) {
        try {
          const pres = await fetchWithAuth(`/api/academics/period-attendance/${p.attendance_session_id}/`);
          if (pres.ok) {
            const pj = await pres.json();
            const recs = pj.records || [];
            const updated = { ...initial };
            recs.forEach((r: any) => {
              const sid = r.student_pk || (r.student && r.student.id) || null;
              if (sid) updated[sid] = r.status || updated[sid] || 'A';
            });
            setMarks(updated);
          }
        } catch (e) {
          console.error('Failed to load existing session records', e);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function setMark(studentId: number, status: string) {
    setMarks((m) => ({ ...m, [studentId]: status }));
  }

  async function saveMarks() {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = {
        section_id: selected.section_id,
        period_id: selected.period.id,
        date: date,
        records: students.map((s) => ({ student_id: s.id, status: marks[s.id] || 'A' })),
      };
      const res = await fetchWithAuth('/api/academics/period-attendance/bulk-mark/', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) {
        let errText = 'Save failed';
        try {
          const errJson = await res.json();
          errText = JSON.stringify(errJson);
        } catch (e) {
          try { errText = await res.text(); } catch (_){ }
        }
        console.error('Save failed response', res.status, errText);
        alert('Failed to save attendance: ' + errText);
        return;
      }
      const j = await res.json();
      alert('Attendance saved');
      // optionally refresh
      fetchPeriods();
    } catch (e) {
      console.error(e);
      alert('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>Period Attendance</h2>
      <div style={{ marginBottom: 12 }}>
        <label>Date: </label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div>
        <h3>Assigned Periods</h3>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {periods.map((p) => (
              <div key={p.id} style={{ border: '1px solid #ddd', padding: 12, borderRadius: 6, minWidth: 220 }}>
                <div style={{ fontWeight: 600 }}>{p.period.label || `Period ${p.period.index}`}</div>
                <div style={{ fontSize: 13, color: '#555' }}>{p.period.start_time || ''}{p.period.start_time && p.period.end_time ? ` — ${p.period.end_time}` : ''}</div>
                <div style={{ marginTop: 6 }}>{p.section_name}</div>
                <div style={{ marginTop: 6, fontStyle: 'italic' }}>{p.subject_display || p.subject || 'No subject'}</div>
                <div style={{ marginTop: 8 }}>
                  {p.attendance_session_locked ? (
                    <button disabled>Attendance Locked</button>
                  ) : (
                    <>
                      <button onClick={() => openPeriod(p)}>{p.attendance_session_id ? 'Open Session' : 'Take Attendance'}</button>
                    </>
                  )}
                </div>
              </div>
            ))}
            <div style={{width:'100%'}}>
              <button onClick={async ()=>{
                // open page-level bulk modal: fetch staff assignments
                try{
                  const res = await fetchWithAuth('/api/timetable/staff/');
                  if(!res.ok) throw new Error('Failed to load staff timetable');
                  const data = await res.json();
                  // flatten day-grouped results into assignments with day info
                  const flat: any[] = [];
                  for(const d of (data.results||[])){
                    const dayNum = d.day;
                    for(const a of (d.assignments||[])){
                      flat.push({ ...a, _day: dayNum });
                    }
                  }
                  setBulkAssignments(flat);
                  setBulkModalOpen(true);
                  // reset bulk selections
                  setBulkDateSelected({}); setBulkSelected({}); setSelectedAssignments({});
                }catch(e){ console.error(e); alert('Failed to load assignments'); }
              }}>Bulk Mark (All Assignments)</button>
            </div>
            {!periods.length && <div>No periods assigned for this date</div>}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 18 }}>
          <h3>
            {selected.period.label || `Period ${selected.period.index}`} — {selected.section_name}
          </h3>
          <div>
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
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
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.reg_no}</td>
                    <td>{s.username}</td>
                    <td>
                      <select value={marks[s.id] || 'P'} onChange={(e) => setMark(s.id, e.target.value)}>
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
              <button onClick={saveMarks} disabled={saving}>{saving ? 'Saving…' : 'Save Attendance'}</button>
            </div>
          </div>
        </div>
      )}

        {bulkModalOpen && (
          <div style={{ position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background:'#fff', padding:20, borderRadius:8, width:720, maxHeight:'80%', overflow:'auto' }}>
              <h3>Bulk Mark Attendance</h3>
              <div style={{marginBottom:8}}>
                <label>Month: </label>
                <input type="month" value={bulkMonth} onChange={e=> setBulkMonth(e.target.value)} />
              </div>
              <div style={{marginBottom:8}}>
                <strong>Assignments</strong>
                <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:8, border:'1px solid #eee', padding:8}}>
                  <label style={{fontSize:13}}><input type="checkbox" checked={Object.keys(selectedAssignments).length > 0 && Object.values(selectedAssignments).every(Boolean)} onChange={(e)=>{
                    const checked = e.target.checked;
                    const next: Record<string, boolean> = {};
                    for(const a of bulkAssignments){ const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`; next[key] = checked }
                    setSelectedAssignments(next);
                  }} /> Select / Deselect all</label>
                  {bulkAssignments.map(a=>{
                    const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`;
                    return (
                      <label key={key} style={{display:'flex', gap:8, alignItems:'center'}}>
                        <input type="checkbox" checked={!!selectedAssignments[key]} onChange={()=> setSelectedAssignments(prev=> ({...prev, [key]: !prev[key]}))} />
                        <div style={{fontSize:13}}>
                          <strong>{a.label || `Period ${a.period_index}`}</strong> — {['Mon','Tue','Wed','Thu','Fri','Sat'][a._day-1] || `Day ${a._day}`} {a.start_time ? ` ${a.start_time}${a.end_time? ' - '+a.end_time : ''}` : ''}
                          <div style={{fontSize:12, color:'#6b7280'}}>{a.section_name || a.section?.name || (a.section_id ? `Section ${a.section_id}` : '')} — {a.subject_display || a.subject_text || ''}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div style={{marginTop:12}}>
                  <strong>Dates (month view for selected assignments)</strong>
                  <div style={{display:'flex', flexWrap:'wrap', gap:8, marginTop:8}}>
                    {(() => {
                      try{
                        const [y, m] = bulkMonth.split('-').map(x=> parseInt(x));
                        const first = new Date(y, m-1, 1);
                        const last = new Date(y, m, 0);
                        // collect selected weekdays (isoweekday 1..7)
                        const weekdays = new Set<number>();
                        for(const a of bulkAssignments){
                          const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section_id}`;
                          if(selectedAssignments[key]) weekdays.add(a._day);
                        }
                        const dates = [] as string[];
                        for(let d=1; d<= last.getDate(); d++){
                          const dt = new Date(y, m-1, d);
                          const isow = dt.getDay() === 0 ? 7 : dt.getDay();
                          // Only include dates matching selected weekdays; if no assignments selected, show none
                          if(weekdays.size > 0 && weekdays.has(isow)){
                            dates.push(dt.toISOString().slice(0,10));
                          }
                        }
                        return dates.map(dd=> (
                          <label key={dd} style={{width:120}}>
                            <input type="checkbox" checked={!!bulkDateSelected[dd]} onChange={()=> setBulkDateSelected(prev=> ({...prev, [dd]: !prev[dd]}))} /> {dd}
                          </label>
                        ))
                      }catch(e){ return <div /> }
                    })()}
                  </div>
                </div>
              </div>
              <div style={{marginTop:8}}>
                <strong>Students (derived from selected assignments)</strong>
                <div style={{maxHeight:260, overflow:'auto', border:'1px solid #eee', padding:8}}>
                  {aggLoading && <div style={{color:'#6b7280'}}>Loading students…</div>}
                  {!aggLoading && aggStudents.length === 0 && <div style={{color:'#6b7280'}}>No students for selected assignments</div>}
                  {!aggLoading && aggStudents.map(s=> (
                    <div key={s.id}>
                      <label><input type="checkbox" checked={!!bulkSelected[s.id]} onChange={_=> setBulkSelected(prev=> ({...prev, [s.id]: !prev[s.id]}))} /> {s.reg_no} — {s.username}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:'flex', gap:8}}>
                <button onClick={async ()=>{
                  // Save Attendance: checked => Present, unchecked => Absent
                  const selectedDates = Object.keys(bulkDateSelected).filter(d=> bulkDateSelected[d]);
                  if(!selectedDates.length){ alert('Select at least one date'); return }
                  // prepare assignments array from selectedAssignments (use fallbacks for ids)
                  const assignments_payload: any[] = [];
                  for(const a of bulkAssignments){
                    const key = a.id ? String(a.id) : `${a._day}_${a.period_id}_${a.section?.id || a.section_id}`;
                    if(!selectedAssignments[key]) continue;
                    const raw_section = a.section_id || (a.section && (a.section.id || a.section.pk)) || a.section?.pk || a.section?.id;
                    const raw_period = a.period_id || (a.period && (a.period.id || a.period_id)) || a.period?.id || a.period_id;
                    const section_id = Number(raw_section);
                    const period_id = Number(raw_period);
                    if (!Number.isFinite(section_id) || !Number.isFinite(period_id)) {
                      console.warn('Skipping assignment with missing ids', { raw_section, raw_period, a });
                      continue;
                    }
                    assignments_payload.push({ section_id, period_id });
                  }
                  console.log('Assignments payload prepared:', assignments_payload);
                  if(assignments_payload.length === 0){ alert('Select at least one assignment'); return }

                  // ensure we have aggregated students loaded
                  if(aggStudents.length === 0){ alert('No students available for the selected assignments. Please select assignments to load students.'); return }

                  const presentIds = aggStudents.filter(s => !!bulkSelected[s.id]).map(s => s.id);
                  const allIds = aggStudents.map(s => s.id);
                  const absentIds = allIds.filter(id => !presentIds.includes(id));

                  if(presentIds.length === 0 && absentIds.length === 0){ alert('No students selected'); return }

                  try{
                    // send present marks
                    if(presentIds.length){
                      const payloadP: any = { assignments: assignments_payload, dates: selectedDates, status: 'P', student_ids: presentIds };
                      console.log('Bulk mark payload (present):', payloadP);
                      const resP = await fetchWithAuth('/api/academics/period-attendance/bulk-mark-range/', { method: 'POST', body: JSON.stringify(payloadP) });
                      if(!resP.ok){ const txt = await resP.text(); alert('Saving presents failed: '+txt); return }
                      try{ const jp = await resP.json(); console.log('Bulk present response:', jp); } catch(e){ console.warn('Present response not JSON', e); }
                    }
                    // send absent marks
                    if(absentIds.length){
                      const payloadA: any = { assignments: assignments_payload, dates: selectedDates, status: 'A', student_ids: absentIds };
                      console.log('Bulk mark payload (absent):', payloadA);
                      const resA = await fetchWithAuth('/api/academics/period-attendance/bulk-mark-range/', { method: 'POST', body: JSON.stringify(payloadA) });
                      if(!resA.ok){ const txt = await resA.text(); alert('Saving absents failed: '+txt); return }
                      try{ const ja = await resA.json(); console.log('Bulk absent response:', ja); } catch(e){ console.warn('Absent response not JSON', e); }
                    }

                    alert('Attendance saved for selected dates');
                    setBulkModalOpen(false);
                    fetchPeriods();
                  }catch(e){ console.error(e); alert('Bulk save failed'); }
                }}>Save Attendance</button>
                <button onClick={()=> setBulkModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
