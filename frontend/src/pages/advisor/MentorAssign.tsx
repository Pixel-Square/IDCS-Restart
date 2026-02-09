import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { fetchMentorStaff, fetchStudentsForStaff, fetchMyStudents, mapMentor, unmapStudent } from '../../services/mentor'
import { Users, UserCheck, UserPlus, UserX, Eye, Loader2, GraduationCap } from 'lucide-react'

export default function MentorAssign() {
  const [staff, setStaff] = useState<any[]>([])
  const [selectedStaff, setSelectedStaff] = useState<number | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [assignedStudents, setAssignedStudents] = useState<any[]>([])
  
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ loadStaff() }, [])

  async function loadStaff(){
    const res = await fetchMentorStaff()
    setStaff(res.results || [])
  }

  async function loadMyStudents(){
    const res = await fetchMyStudents()
    const sections = res.results || []
    // flatten students across sections
    const flat: any[] = []
    sections.forEach((sec: any) => {
      const studs = sec.students || []
      studs.forEach((s: any) => flat.push(s))
    })
    setStudents(flat)
  }

  async function onSelectStaff(id:number){
    // When the user clicks View for a staff, load both the mentor's current
    // assigned students and the advisor's available students, then compute
    // the unassigned list.
    setSelectedStaff(id)
    
    setAssignedStudents([])
    setStudents([])

    // fetch mentor's currently assigned students
    const ares = await fetchStudentsForStaff(id)
    const assigned = ares.results || []

    // fetch advisor's students (sections the logged-in user advises)
    const mres = await fetchMyStudents()
    const sections = mres.results || []
    const myFlat: any[] = []
    sections.forEach((sec: any) => {
      const studs = sec.students || []
      studs.forEach((s: any) => myFlat.push(s))
    })

    const assignedIds = new Set(assigned.map((s:any)=>s.id))
    const available = myFlat.filter(s => !assignedIds.has(s.id) && !s.has_mentor)

    setAssignedStudents(assigned)
    setStudents(available)
  }

  

  async function assignSingle(studentId:number){
    if (!selectedStaff) return alert('Select a mentor first')
    setLoading(true)
    const res = await mapMentor(selectedStaff, [studentId])
    if (res.ok) {
      await loadMyStudents()
      if (selectedStaff) await onSelectStaff(selectedStaff)
    } else {
      const j = await res.json().catch(()=>null)
      alert('Failed: '+ (j && j.detail ? j.detail : res.statusText))
    }
    setLoading(false)
  }

  async function removeAssigned(studentId:number){
    if (!selectedStaff) return
    setLoading(true)
    const res = await unmapStudent(studentId, selectedStaff)
    if (res.ok) {
      await loadMyStudents()
      if (selectedStaff) await onSelectStaff(selectedStaff)
    } else {
      const j = await res.json().catch(()=>null)
      alert('Failed to remove: '+ (j && j.detail ? j.detail : res.statusText))
    }
    setLoading(false)
  }

  const selectedStaffDetails = staff.find(s => s.id === selectedStaff)

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-6 border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
            <UserCheck className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Mentor Assignment</h1>
            <p className="text-slate-600 text-sm">Assign and manage mentor mappings for your students</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Staff List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Staff Members
                <span className="ml-auto px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                  {staff.length}
                </span>
              </h3>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
              {staff.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No staff members available</div>
              ) : (
                <div className="space-y-2">
                  {staff.map(s => (
                    <div 
                      key={s.id} 
                      className={`p-4 rounded-lg border transition-all cursor-pointer ${
                        selectedStaff === s.id 
                          ? 'bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-300 shadow-md' 
                          : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'
                      }`}
                      onClick={() => onSelectStaff(s.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`font-medium ${selectedStaff === s.id ? 'text-indigo-900' : 'text-slate-900'}`}>
                            {s.username}
                          </div>
                          <div className="text-sm text-slate-600 mt-1">
                            <span className="font-mono">{s.staff_id || 'N/A'}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectStaff(s.id)
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                            selectedStaff === s.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                          }`}
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Students Section */}
        <div className="lg:col-span-3">
          {!selectedStaff ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="bg-slate-100 p-4 rounded-full mb-4">
                  <UserCheck className="w-16 h-16 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-1">Select a Staff Member</h3>
                <p className="text-slate-600 text-sm">Click on a staff member to view and manage their mentee assignments</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected Staff Info */}
              {selectedStaffDetails && (
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl p-4 shadow-lg">
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-6 h-6" />
                    <div>
                      <div className="font-semibold">Selected Mentor: {selectedStaffDetails.username}</div>
                      <div className="text-sm opacity-90">Staff ID: {selectedStaffDetails.staff_id || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Assigned Students */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-200 bg-green-50">
                  <h4 className="text-base font-semibold text-green-900 flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-green-700" />
                    Assigned Students
                    <span className="ml-auto px-2.5 py-0.5 bg-green-200 text-green-800 text-xs font-medium rounded-full">
                      {assignedStudents.length}
                    </span>
                  </h4>
                </div>
                <div className="p-4 max-h-[300px] overflow-y-auto">
                  {assignedStudents.length > 0 ? (
                    <div className="space-y-2">
                      {assignedStudents.map(st => (
                        <div key={st.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-900">{st.reg_no} — {st.username}</div>
                            <div className="text-xs text-slate-600 mt-0.5">{st.section_name}</div>
                          </div>
                          <button 
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                            onClick={()=>removeAssigned(st.id)} 
                            disabled={loading}
                          >
                            <UserX className="w-4 h-4" />
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">No students currently assigned to this mentor</div>
                  )}
                </div>
              </div>

              {/* Available Students */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-200 bg-blue-50">
                  <h4 className="text-base font-semibold text-blue-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-700" />
                    Available to Assign
                    <span className="ml-auto px-2.5 py-0.5 bg-blue-200 text-blue-800 text-xs font-medium rounded-full">
                      {students.length}
                    </span>
                  </h4>
                </div>
                <div className="p-4 max-h-[300px] overflow-y-auto">
                  {students.length > 0 ? (
                    <div className="space-y-2">
                      {students.map(st => (
                        <div key={st.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-900">{st.reg_no} — {st.username}</div>
                            <div className="text-xs text-slate-600 mt-0.5">{st.section_name}</div>
                          </div>
                          <button 
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                            onClick={()=>assignSingle(st.id)} 
                            disabled={loading || !selectedStaff}
                          >
                            {loading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <UserPlus className="w-4 h-4" />
                            )}
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">No available students to assign</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
