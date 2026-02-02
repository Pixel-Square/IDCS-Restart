import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function TimetableEditor(){
  const [templates, setTemplates] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)

  const [newTemplate, setNewTemplate] = useState({ name: '', description: '', parity: 'BOTH', is_public: false, is_active: false })
  const [newSlot, setNewSlot] = useState({ index: 1, start_time: '', end_time: '', is_break: false, is_lunch: false, label: '' })

  useEffect(()=>{ fetchTemplates() }, [])

  async function fetchTemplates(){
    setLoading(true)
    try{
      const res = await fetchWithAuth('/api/timetable/templates/')
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      // data may be list or paginated; ensure array
      const list = Array.isArray(data) ? data : (data.results || data)
      setTemplates(list || [])
      if(list && list.length && !selected) setSelected(list[0])
    }catch(e){ console.error(e); alert('Failed to load templates') }
    finally{ setLoading(false) }
  }

  async function createTemplate(){
    try{
      const res = await fetchWithAuth('/api/timetable/templates/', { method: 'POST', body: JSON.stringify(newTemplate) })
      if(!res.ok) throw new Error(await res.text())
      await fetchTemplates()
      setNewTemplate({ name:'', description:'', parity:'BOTH', is_public:false, is_active:false })
    }catch(e){ console.error(e); alert('Failed to create template: '+String(e)) }
  }

  async function addSlot(){
    if(!selected) return alert('Select a template first')
    try{
      const payload = { ...newSlot, template: selected.id }
      const res = await fetchWithAuth('/api/timetable/slots/', { method: 'POST', body: JSON.stringify(payload) })
      if(!res.ok) throw new Error(await res.text())
      // append locally by refetching the templates
      await fetchTemplates()
      setNewSlot({ index: newSlot.index + 1, start_time:'', end_time:'', is_break:false, is_lunch:false, label:'' })
    }catch(e){ console.error(e); alert('Failed to add slot: '+String(e)) }
  }

  async function deleteSlot(slotId:number){
    if(!confirm('Delete this period?')) return
    try{
      const res = await fetchWithAuth(`/api/timetable/slots/${slotId}/`, { method: 'DELETE' })
      if(!res.ok) throw new Error(await res.text())
      await fetchTemplates()
    }catch(e){ console.error(e); alert('Failed to delete slot: '+String(e)) }
  }

  return (
    <div style={{padding:20}}>
      <h2>IQAC: Timetable Templates</h2>
      {loading && <div>Loading…</div>}
      <div style={{display:'flex',gap:20}}>
        <div style={{width:320}}>
          <h4>Create Template</h4>
          <input placeholder="Name" value={newTemplate.name} onChange={e=>setNewTemplate({...newTemplate, name:e.target.value})} style={{width:'100%',marginBottom:8}} />
          <select value={newTemplate.parity} onChange={e=>setNewTemplate({...newTemplate, parity:e.target.value})} style={{width:'100%',marginBottom:8}}>
            <option value="BOTH">Both</option>
            <option value="ODD">Odd</option>
            <option value="EVEN">Even</option>
          </select>
          <label style={{display:'block',marginBottom:8}}><input type="checkbox" checked={newTemplate.is_public} onChange={e=>setNewTemplate({...newTemplate, is_public: e.target.checked})} /> Public</label>
          <label style={{display:'block',marginBottom:8}}><input type="checkbox" checked={newTemplate.is_active} onChange={e=>setNewTemplate({...newTemplate, is_active: e.target.checked})} /> Active</label>
          <textarea placeholder="Description" value={newTemplate.description} onChange={e=>setNewTemplate({...newTemplate, description:e.target.value})} style={{width:'100%',height:80}} />
          <div style={{marginTop:8}}>
            <button onClick={createTemplate}>Create Template</button>
          </div>

          <h4 style={{marginTop:20}}>Templates</h4>
          <ul style={{paddingLeft:16}}>
            {templates.map(t=> (
              <li key={t.id} style={{marginBottom:8}}>
                <a href="#" onClick={e=>{ e.preventDefault(); setSelected(t) }}>{t.name} {t.is_active? '(active)':''}</a>
              </li>
            ))}
          </ul>
        </div>

        <div style={{flex:1}}>
          <h4>Selected Template</h4>
          {!selected && <div>Select a template to manage its periods.</div>}
          {selected && (
            <div>
              <div style={{marginBottom:8}}><strong>{selected.name}</strong> — {selected.parity} {selected.is_active? '(active)':''}</div>
              <div style={{marginBottom:12}}>{selected.description}</div>

              <h5>Periods</h5>
              <table style={{borderCollapse:'collapse', width:'100%'}}>
                <thead>
                  <tr><th style={{border:'1px solid #ddd',padding:6}}>#</th><th style={{border:'1px solid #ddd',padding:6}}>Label</th><th style={{border:'1px solid #ddd',padding:6}}>Start</th><th style={{border:'1px solid #ddd',padding:6}}>End</th><th style={{border:'1px solid #ddd',padding:6}}>Flags</th><th style={{border:'1px solid #ddd',padding:6}}>Actions</th></tr>
                </thead>
                <tbody>
                  {(selected.periods||[]).map((p:any)=> (
                    <tr key={p.id}>
                      <td style={{border:'1px solid #eee',padding:6}}>{p.index}</td>
                      <td style={{border:'1px solid #eee',padding:6}}>{p.label}</td>
                      <td style={{border:'1px solid #eee',padding:6}}>{p.start_time||'–'}</td>
                      <td style={{border:'1px solid #eee',padding:6}}>{p.end_time||'–'}</td>
                      <td style={{border:'1px solid #eee',padding:6}}>{p.is_break? 'Break': p.is_lunch? 'Lunch': ''}</td>
                      <td style={{border:'1px solid #eee',padding:6}}><button onClick={()=>deleteSlot(p.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h5 style={{marginTop:12}}>Add Period</h5>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                <input type="number" value={newSlot.index} onChange={e=>setNewSlot({...newSlot, index: Number(e.target.value)})} style={{width:80}} />
                <input type="time" value={newSlot.start_time} onChange={e=>setNewSlot({...newSlot, start_time: e.target.value})} />
                <input type="time" value={newSlot.end_time} onChange={e=>setNewSlot({...newSlot, end_time: e.target.value})} />
                <input placeholder="Label" value={newSlot.label} onChange={e=>setNewSlot({...newSlot, label: e.target.value})} />
              </div>
              <div style={{marginBottom:8}}>
                <label style={{marginRight:12}}><input type="checkbox" checked={newSlot.is_break} onChange={e=>setNewSlot({...newSlot, is_break: e.target.checked, is_lunch: false})} /> Break</label>
                <label><input type="checkbox" checked={newSlot.is_lunch} onChange={e=>setNewSlot({...newSlot, is_lunch: e.target.checked, is_break: false})} /> Lunch</label>
              </div>
              <div>
                <button onClick={addSlot}>Add Period</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
