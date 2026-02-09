import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Trash2, Calendar, Clock, Plus, Edit, Save, X } from 'lucide-react'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function TimetableEditor(){
  const [templates, setTemplates] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '', parity: 'BOTH', is_public: false, is_active: false })
  const [academicYears, setAcademicYears] = useState<any[]>([])
  const [newAcademicYear, setNewAcademicYear] = useState({ name: '', parity: 'ODD', is_active: false })
  const [newSlot, setNewSlot] = useState({ index: 1, start_time: '', end_time: '', is_break: false, is_lunch: false, label: '' })
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const [editSlotData, setEditSlotData] = useState<any>({})

  useEffect(()=>{ fetchTemplates() }, [])

  useEffect(()=>{ fetchAcademicYears() }, [])

  async function fetchTemplates(){
    setLoading(true)
    try{
      const res = await fetchWithAuth('/api/timetable/templates/')
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      // data may be list or paginated; ensure array
      const list = Array.isArray(data) ? data : (data.results || data)
      setTemplates(list || [])
      if(list && list.length){
        const active = (list as any[]).find(t=> t.is_active) || list[0]
        setSelected(active)
      }
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

  async function fetchAcademicYears(){
    try{
      const res = await fetchWithAuth('/api/academics/academic-years/')
      if(!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data.results || data)
      setAcademicYears(list || [])
    }catch(e){ console.error(e); }
  }

  async function createAcademicYear(){
    try{
      const res = await fetchWithAuth('/api/academics/academic-years/', { method: 'POST', body: JSON.stringify(newAcademicYear) })
      if(!res.ok) throw new Error(await res.text())
      await fetchAcademicYears()
      setNewAcademicYear({ name: '', parity: 'ODD', is_active: false })
    }catch(e){ console.error(e); alert('Failed to create academic year: '+String(e)) }
  }

  async function toggleAcademicYear(id:number, active:boolean){
    try{
      const res = await fetchWithAuth(`/api/academics/academic-years/${id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) })
      if(!res.ok) throw new Error(await res.text())
      await fetchAcademicYears()
      // also refresh templates since activating an academic year may flip active template
      await fetchTemplates()
    }catch(e){ console.error(e); alert('Failed to update academic year: '+String(e)) }
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

  function startEditSlot(slot: any) {
    setEditingSlot(slot.id)
    setEditSlotData({ ...slot })
  }

  function cancelEditSlot() {
    setEditingSlot(null)
    setEditSlotData({})
  }

  async function updateSlot() {
    if (!editingSlot || !editSlotData) return
    try {
      const res = await fetchWithAuth(`/api/timetable/slots/${editingSlot}/`, {
        method: 'PATCH',
        body: JSON.stringify(editSlotData)
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchTemplates()
      setEditingSlot(null)
      setEditSlotData({})
    } catch (e) {
      console.error(e)
      alert('Failed to update slot: ' + String(e))
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <span className="p-3 bg-indigo-100 rounded-xl">
          <svg width="28" height="28" fill="none" viewBox="0 0 48 48">
            <rect width="48" height="48" rx="12" fill="#e0e7ff"/>
            <path d="M16 24h16M16 32h16M16 16h16" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </span>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">IQAC — Timetable Templates</h2>
          <p className="text-sm text-gray-600 mt-1">Create and manage timetable templates and periods.</p>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          Loading templates...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Academic Years Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Academic Years</h3>
            </div>
            
            {/* Create Academic Year Form */}
            <div className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input 
                  type="text"
                  placeholder="e.g. 2025-26" 
                  value={newAcademicYear.name} 
                  onChange={e=>setNewAcademicYear({...newAcademicYear, name: e.target.value})} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parity</label>
                <select 
                  value={newAcademicYear.parity} 
                  onChange={e=>setNewAcademicYear({...newAcademicYear, parity: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="ODD">Odd</option>
                  <option value="EVEN">Even</option>
                </select>
              </div>
              
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id="activate" 
                  checked={newAcademicYear.is_active} 
                  onChange={e=>setNewAcademicYear({...newAcademicYear, is_active: e.target.checked})}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="activate" className="ml-2 text-sm text-gray-700">Activate on create</label>
              </div>
              
              <button 
                onClick={createAcademicYear}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Create Academic Year
              </button>
            </div>

            {/* Existing Academic Years */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Existing Years</h4>
              <div className="space-y-2">
                {academicYears.map((ay:any)=> (
                  <div key={ay.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">
                        {ay.name} {ay.parity && `(${ay.parity})`}
                        {ay.is_active && <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Active</span>}
                      </div>
                    </div>
                    <button 
                      onClick={()=>toggleAcademicYear(ay.id, !ay.is_active)}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                        ay.is_active 
                          ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {ay.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Template Management */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Template Management</h3>
            </div>
            
            {!selected && (
              <div className="text-center py-12 text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Select a template to manage its periods.</p>
              </div>
            )}
            
            {selected && (
              <div>
                {/* Template Header */}
                <div className="border-b border-gray-200 pb-4 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-xl font-semibold text-gray-900">{selected.name}</h4>
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">{selected.parity}</span>
                    {selected.is_active && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
                    )}
                  </div>
                  {selected.description && (
                    <p className="text-gray-600">{selected.description}</p>
                  )}
                </div>

                {/* Periods Table */}
                <div className="mb-6">
                  <h5 className="text-lg font-medium text-gray-900 mb-3">Periods</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-200 rounded-lg">
                      <thead>
                        <tr className="bg-gradient-to-r from-gray-50 to-indigo-50">
                          <th className="border border-gray-200 px-4 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider">Label</th>
                          <th className="border border-gray-200 px-4 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider">Start Time</th>
                          <th className="border border-gray-200 px-4 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider">End Time</th>
                          <th className="border border-gray-200 px-4 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider">Type</th>
                          <th className="border border-gray-200 px-4 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {(selected.periods||[]).map((p:any)=> (
                          <tr key={p.id} className="hover:bg-gray-50">
                            {editingSlot === p.id ? (
                              // Editing mode
                              <>
                                <td className="border border-gray-200 px-4 py-3">
                                  <input
                                    type="text"
                                    value={editSlotData.label || ''}
                                    onChange={e => setEditSlotData({...editSlotData, label: e.target.value})}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Label"
                                  />
                                </td>
                                <td className="border border-gray-200 px-4 py-3">
                                  <input
                                    type="time"
                                    value={editSlotData.start_time || ''}
                                    onChange={e => setEditSlotData({...editSlotData, start_time: e.target.value})}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                </td>
                                <td className="border border-gray-200 px-4 py-3">
                                  <input
                                    type="time"
                                    value={editSlotData.end_time || ''}
                                    onChange={e => setEditSlotData({...editSlotData, end_time: e.target.value})}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                </td>
                                <td className="border border-gray-200 px-4 py-3">
                                  <div className="flex flex-col gap-1">
                                    <label className="flex items-center text-xs">
                                      <input
                                        type="checkbox"
                                        checked={editSlotData.is_break || false}
                                        onChange={e => setEditSlotData({...editSlotData, is_break: e.target.checked, is_lunch: false})}
                                        className="mr-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      Break
                                    </label>
                                    <label className="flex items-center text-xs">
                                      <input
                                        type="checkbox"
                                        checked={editSlotData.is_lunch || false}
                                        onChange={e => setEditSlotData({...editSlotData, is_lunch: e.target.checked, is_break: false})}
                                        className="mr-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      Lunch
                                    </label>
                                  </div>
                                </td>
                                <td className="border border-gray-200 px-4 py-3">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={updateSlot}
                                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                      title="Save Changes"
                                    >
                                      <Save className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={cancelEditSlot}
                                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                                      title="Cancel Edit"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              // Display mode
                              <>
                                <td className="border border-gray-200 px-4 py-3 text-sm text-gray-900">{p.label || '—'}</td>
                                <td className="border border-gray-200 px-4 py-3 text-sm text-gray-900">{p.start_time || '—'}</td>
                                <td className="border border-gray-200 px-4 py-3 text-sm text-gray-900">{p.end_time || '—'}</td>
                                <td className="border border-gray-200 px-4 py-3 text-sm">
                                  {p.is_break ? (
                                    <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Break</span>
                                  ) : p.is_lunch ? (
                                    <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">Lunch</span>
                                  ) : (
                                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Period</span>
                                  )}
                                </td>
                                <td className="border border-gray-200 px-4 py-3">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => startEditSlot(p)}
                                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Edit Period"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => deleteSlot(p.id)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Delete Period"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Add Period Form */}
                <div className="border-t border-gray-200 pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Plus className="w-5 h-5 text-green-600" />
                    <h5 className="text-lg font-medium text-gray-900">Add New Period</h5>
                  </div>
                  
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Index</label>
                      <input 
                        type="number" 
                        value={newSlot.index} 
                        onChange={e=>setNewSlot({...newSlot, index: Number(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <input 
                        type="time" 
                        value={newSlot.start_time} 
                        onChange={e=>setNewSlot({...newSlot, start_time: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <input 
                        type="time" 
                        value={newSlot.end_time} 
                        onChange={e=>setNewSlot({...newSlot, end_time: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                      <input 
                        type="text"
                        placeholder="Period 1, Break, etc." 
                        value={newSlot.label} 
                        onChange={e=>setNewSlot({...newSlot, label: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 mb-4">
                    <label className="flex items-center">
                      <input 
                        type="checkbox" 
                        checked={newSlot.is_break} 
                        onChange={e=>setNewSlot({...newSlot, is_break: e.target.checked, is_lunch: false})}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Break Period</span>
                    </label>
                    
                    <label className="flex items-center">
                      <input 
                        type="checkbox" 
                        checked={newSlot.is_lunch} 
                        onChange={e=>setNewSlot({...newSlot, is_lunch: e.target.checked, is_break: false})}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Lunch Period</span>
                    </label>
                  </div>
                  
                  <button 
                    onClick={addSlot}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Period
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
