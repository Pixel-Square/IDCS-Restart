import React, { useEffect, useState } from 'react'
import { User, BookOpen, Save, Edit, X } from 'lucide-react'
import fetchWithAuth from '../../services/fetchAuth'

type Section = { id: number; name: string; batch: string; batch_regulation?: { id: number; code: string; name?: string } | null; department_id?: number; semester?: number; department?: { id: number; code?: string } }
type Staff = { id: number; user: string | { username?: string; first_name?: string; last_name?: string }; staff_id: string; department?: { id?: number; code?: string; name?: string } }
type CurriculumRow = { id: number; course_code?: string; course_name?: string; department?: { id: number; code?: string }; semester?: number; regulation?: string }
type TeachingAssignment = { 
  id: number
  staff: string | number
  subject: string
  section: string | number
  academic_year: string
  curriculum_row?: { id: number; course_code?: string; course_name?: string }
  curriculum_row_details?: { id: number; course_code?: string; course_name?: string; semester?: number }
  section_details?: { id: number; name: string; batch: string; semester?: number }
  staff_details?: { id: number; user: string | { username?: string; first_name?: string; last_name?: string }; staff_id: string }
}

// Helper function to get display name from user
const getStaffDisplayName = (staff: Staff) => {
  if (typeof staff.user === 'string') {
    return staff.user
  }
  if (staff.user && typeof staff.user === 'object') {
    const firstName = staff.user.first_name || ''
    const lastName = staff.user.last_name || ''
    const fullName = `${firstName} ${lastName}`.trim()
    return fullName || staff.user.username || staff.staff_id
  }
  return staff.staff_id
}

const getAssignmentStaffName = (staffDetails: any) => {
  if (!staffDetails) return '—'
  if (typeof staffDetails.user === 'string') {
    return staffDetails.user
  }
  if (staffDetails.user && typeof staffDetails.user === 'object') {
    const firstName = staffDetails.user.first_name || ''
    const lastName = staffDetails.user.last_name || ''
    const fullName = `${firstName} ${lastName}`.trim()
    return fullName || staffDetails.user.username || staffDetails.staff_id
  }
  return staffDetails.staff_id || '—'
}

export default function TeachingAssignmentsPage(){
  const [sections, setSections] = useState<Section[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [departments, setDepartments] = useState<{ id: number; name?: string; code?: string; short_name?: string }[]>([])
  const [selectedDept, setSelectedDept] = useState<number | null>(null)
  const [selectedElectiveDept, setSelectedElectiveDept] = useState<number | null>(null)
  const [curriculum, setCurriculum] = useState<CurriculumRow[]>([])
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([])
  const [electiveOptions, setElectiveOptions] = useState<any[]>([])
  const [electiveParents, setElectiveParents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAssignments, setEditingAssignments] = useState<Set<string>>(new Set())
  const [editingElectives, setEditingElectives] = useState<Set<string>>(new Set())

  // permissions (used to decide which staff endpoint to call)
  const perms = (() => { try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[] } catch { return [] } })()
  const canViewElectives = perms.includes('academics.view_elective_teaching')
  const canAssignElectives = perms.includes('academics.assign_elective_teaching')

  useEffect(() => { fetchData() }, [])

  async function fetchData(){
    try{
      setLoading(true)
      const sres = await fetchWithAuth('/api/academics/my-students/?page_size=0')
      const staffEndpoint = (canViewElectives || canAssignElectives) ? '/api/academics/hod-staff/?page_size=0' : '/api/academics/advisor-staff/?page_size=0'
      // fetch staff list optionally filtered by selected department
      const staffRes = await fetchWithAuth(selectedDept && staffEndpoint.includes('hod-staff') ? `${staffEndpoint}&department=${selectedDept}` : staffEndpoint)
      const curRes = await fetchWithAuth('/api/curriculum/department/?page_size=0')
      const electRes = await fetchWithAuth('/api/curriculum/elective/?page_size=0')
      const taRes = await fetchWithAuth('/api/academics/teaching-assignments/?page_size=0')

      const safeJson = async (r: Response) => {
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) throw new Error('non-json')
        return r.json()
      }

      if (sres.ok){ const d = await safeJson(sres); const secs = (d.results || d).map((r:any) => ({ id: r.section_id, name: r.section_name, batch: r.batch, batch_regulation: r.batch_regulation, department_id: r.department_id, semester: r.semester, department: r.department })); setSections(secs); }
      if (staffRes.ok){ const d = await safeJson(staffRes); let staffList = (d.results || d) as Staff[]; // if backend didn't filter, apply client-side filter
        if (selectedDept){ staffList = staffList.filter(s => (s.department && s.department.id === selectedDept) || (s as any).department === selectedDept) }
        setStaff(staffList)
      }
      if (curRes.ok){ 
        const d = await safeJson(curRes); 
        const rows = (d.results || d); 
        setCurriculum(rows); 
        setElectiveParents(rows.filter((r:any)=> r.is_elective));
        
        // Extract unique departments from curriculum data (already filtered by backend based on user's department roles)
        const deptMap = new Map();
        rows.forEach((r: any) => {
          if (r.department && r.department.id) {
            deptMap.set(r.department.id, r.department);
          }
        });
        if (deptMap.size > 0) {
          setDepartments(Array.from(deptMap.values()));
        }
      }
      if (electRes.ok){ const d = await safeJson(electRes); setElectiveOptions(d.results || d) }
      if (taRes.ok){ const d = await safeJson(taRes); setAssignments(d.results || d) }
    }catch(e){ console.error(e); alert('Failed to load teaching assignment data') }
    finally{ setLoading(false) }
  }

  // reload staff list when selected department changes
  useEffect(()=>{
    async function loadStaff(){
      try{
        const staffEndpoint = (canViewElectives || canAssignElectives) ? '/api/academics/hod-staff/?page_size=0' : '/api/academics/advisor-staff/?page_size=0'
        const url = selectedDept && staffEndpoint.includes('hod-staff') ? `${staffEndpoint}&department=${selectedDept}` : staffEndpoint
        const res = await fetchWithAuth(url)
        if(!res.ok) return
        const data = await res.json()
        let staffList = data.results || data
        // if backend didn't filter and we're on advisor endpoint, filter client-side
        if(!staffEndpoint.includes('hod-staff') && selectedDept){
          staffList = staffList.filter((s:any) => (s.department && s.department.id === selectedDept) || (s.department === selectedDept) )
        }
        setStaff(staffList)
      }catch(e){ console.error('loadStaff failed', e) }
    }
    loadStaff()
  }, [selectedDept])

  // Helper functions for assignment management
  const findExistingAssignment = (sectionId: number, curricularRowId: number) => {
    return assignments.find(a => {
      // Check section match using section_details
      const sectionMatches = 
        (a.section_details && a.section_details.id === sectionId) ||
        ((a as any).section_details && (a as any).section_details.id === sectionId) ||
        a.section === sectionId || 
        (a as any).section_id === sectionId;
      
      // Check curriculum match using curriculum_row_details
      const curriculumMatches = 
        (a.curriculum_row_details && a.curriculum_row_details.id === curricularRowId) ||
        ((a as any).curriculum_row_details && (a as any).curriculum_row_details.id === curricularRowId) ||
        (a.curriculum_row && a.curriculum_row.id === curricularRowId) ||
        ((a as any).curriculum_row_id === curricularRowId);
      
      return sectionMatches && curriculumMatches;
    });
  }

  const getAssignmentKey = (sectionId: number, subjectId: number) => `${sectionId}-${subjectId}`

  const startEditing = (sectionId: number, subjectId: number) => {
    const key = getAssignmentKey(sectionId, subjectId)
    setEditingAssignments(prev => new Set(prev).add(key))
  }

  const cancelEditing = (sectionId: number, subjectId: number) => {
    const key = getAssignmentKey(sectionId, subjectId)
    setEditingAssignments(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      return newSet
    })
  }

  const isEditing = (sectionId: number, subjectId: number) => {
    const key = getAssignmentKey(sectionId, subjectId)
    return editingAssignments.has(key)
  }

  // Helper functions for elective assignment management
  const findExistingElectiveAssignment = (electiveId: number) => {
    // First find the elective option to get its details
    const electiveOption = electiveOptions.find((opt: any) => opt.id === electiveId);
    if (!electiveOption) return null;
    
    return assignments.find(a => {
      // Check various elective assignment structures
      const electiveMatches = 
        (a as any).elective_subject === electiveId || 
        (a as any).elective_subject_id === electiveId ||
        ((a as any).elective_subject && (a as any).elective_subject.id === electiveId) ||
        // Check if the subject field contains the elective course code or name
        (a.subject && (
          a.subject.includes(electiveOption.course_code) ||
          a.subject.includes(electiveOption.course_name)
        )) ||
        // Also check curriculum row assignments that match elective
        (a.curriculum_row_details && (
          a.curriculum_row_details.course_code === electiveOption.course_code ||
          a.curriculum_row_details.course_name === electiveOption.course_name
        )) ||
        (a.curriculum_row && (
          a.curriculum_row.course_code === electiveOption.course_code ||
          a.curriculum_row.course_name === electiveOption.course_name
        ));
      
      return electiveMatches;
    });
  }

  const getElectiveAssignmentKey = (electiveId: number) => `elective-${electiveId}`

  const startEditingElective = (electiveId: number) => {
    const key = getElectiveAssignmentKey(electiveId)
    setEditingElectives(prev => new Set(prev).add(key))
  }

  const cancelEditingElective = (electiveId: number) => {
    const key = getElectiveAssignmentKey(electiveId)
    setEditingElectives(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      return newSet
    })
  }

  const isEditingElective = (electiveId: number) => {
    const key = getElectiveAssignmentKey(electiveId)
    return editingElectives.has(key)
  }

  async function assignElective(electiveId:number, staffId:number, existingAssignmentId?: number){
    if (!staffId) {
      alert('Select staff')
      return Promise.reject('No staff selected')
    }
    
    try {
      if (existingAssignmentId) {
        // Update existing assignment
        const payload = { staff_id: Number(staffId), is_active: true }
        const res = await fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignmentId}/`, { 
          method: 'PATCH', 
          body: JSON.stringify(payload) 
        })
        if (res.ok) { 
          alert('Updated successfully'); 
          fetchData();
          return Promise.resolve()
        } else { 
          const txt = await res.text(); 
          alert('Error: ' + txt);
          return Promise.reject(txt)
        }
      } else {
        // Create new assignment
        const payload = { elective_subject_id: electiveId, staff_id: Number(staffId), is_active: true }
        const res = await fetchWithAuth('/api/academics/teaching-assignments/', { 
          method: 'POST', 
          body: JSON.stringify(payload) 
        })
        if (res.ok) { 
          alert('Assigned successfully'); 
          fetchData();
          return Promise.resolve()
        } else { 
          const txt = await res.text(); 
          alert('Error: ' + txt);
          return Promise.reject(txt)
        }
      }
    } catch (error) {
      alert('Error: ' + error);
      return Promise.reject(error)
    }
  }

  if (loading) return (
    <div style={{ padding: '28px', minHeight: '100vh', background: 'linear-gradient(180deg, #f7fbff 0%, #ffffff 60%)' }}>
      <div style={{ padding: '16px', borderRadius: '8px', background: '#fff', border: '1px solid rgba(15,23,42,0.04)', color: '#6b7280' }}>
        Loading teaching assignments…
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Teaching Assign</h1>
              <p className="text-gray-600">Assign faculty to courses and sections</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        {departments.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Filters</h3>
            <div className="flex flex-wrap gap-4">
              {departments.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Department:</span>
                  <select
                    value={selectedDept ?? ''}
                    onChange={e => setSelectedDept(e.target.value ? Number(e.target.value) : null)}
                    className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.short_name || d.code || d.name || `Dept ${d.id}`}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assignment Table */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Course Assignments</h3>
          </div>
          
          {sections.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 text-sm">
                No sections available for the selected filters.
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {sections.map(section => {
                const sectionSubjects = curriculum.filter(c => 
                  (section.semester ? (c.semester === section.semester) : true) &&
                  (section.batch_regulation ? (c.regulation === section.batch_regulation.code) : true) &&
                  !((c as any).is_elective)
                );
                
                return (
                  <div key={section.id} className="border border-gray-200 rounded-lg p-4">
                    {/* Section Header */}
                    <div className="bg-blue-50 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-lg font-semibold text-blue-900">
                            {section.batch} / {section.name}
                          </h4>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-blue-700 text-sm">
                              Semester: {section.semester || 'Not specified'}
                            </p>
                            {section.batch_regulation && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                                Regulation: {section.batch_regulation.code}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-blue-600 text-sm font-medium">
                          Section ID: {section.id}
                        </div>
                      </div>
                    </div>

                    {/* Subjects Table */}
                    {sectionSubjects.length === 0 ? (
                      <div className="text-gray-500 text-sm py-4">
                        No subjects available for this section.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Subject Code</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Subject Name</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Assigned Staff</th>
                              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {sectionSubjects.map(subject => {
                              const existingAssignment = findExistingAssignment(section.id, subject.id);
                              const editing = isEditing(section.id, subject.id);
                              
                              return (
                                <tr key={`${section.id}-${subject.id}`} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3 font-medium text-gray-900">
                                    {subject.course_code || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">
                                    {subject.course_name || 'Unnamed'}
                                  </td>
                                  <td className="px-4 py-3">
                                    {editing ? (
                                      <select 
                                        id={`staff-${section.id}-${subject.id}`}
                                        defaultValue={existingAssignment?.staff_details?.id || existingAssignment?.staff || ''}
                                        className="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="">-- select staff --</option>
                                        {staff.map(st => (
                                          <option key={st.id} value={st.id}>
                                            {st.staff_id} - {getStaffDisplayName(st)}
                                          </option>
                                        ))}
                                      </select>
                                    ) : existingAssignment ? (
                                      <div className="text-sm text-gray-900 font-medium">
                                        {existingAssignment.staff_details?.staff_id} - {getAssignmentStaffName(existingAssignment.staff_details)}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500 italic">
                                        Not assigned
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {!editing ? (
                                        <button 
                                          onClick={() => startEditing(section.id, subject.id)}
                                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-300"
                                          title="Edit Assignment"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </button>
                                      ) : (
                                        <>
                                          <button 
                                            onClick={() => {
                                              const staffSel = document.getElementById(`staff-${section.id}-${subject.id}`) as HTMLSelectElement;
                                              if (!staffSel?.value) return alert('Select staff member');
                                              
                                              if (existingAssignment) {
                                                // Update existing assignment
                                                const payload = { 
                                                  staff_id: Number(staffSel.value), 
                                                  is_active: true 
                                                };
                                                
                                                fetchWithAuth(`/api/academics/teaching-assignments/${existingAssignment.id}/`, { 
                                                  method: 'PATCH', 
                                                  body: JSON.stringify(payload) 
                                                })
                                                .then(res => {
                                                  if (res.ok) {
                                                    alert('Updated successfully');
                                                    cancelEditing(section.id, subject.id);
                                                    fetchData();
                                                  } else {
                                                    res.text().then(txt => alert('Error: ' + txt));
                                                  }
                                                });
                                              } else {
                                                // Create new assignment
                                                const payload = { 
                                                  section_id: section.id, 
                                                  staff_id: Number(staffSel.value), 
                                                  curriculum_row_id: subject.id, 
                                                  is_active: true 
                                                };
                                                
                                                fetchWithAuth('/api/academics/teaching-assignments/', { 
                                                  method: 'POST', 
                                                  body: JSON.stringify(payload) 
                                                })
                                                .then(res => {
                                                  if (res.ok) {
                                                    alert('Assigned successfully');
                                                    cancelEditing(section.id, subject.id);
                                                    fetchData();
                                                  } else {
                                                    res.text().then(txt => alert('Error: ' + txt));
                                                  }
                                                });
                                              }
                                            }}
                                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-green-300"
                                            title="Save Assignment"
                                          >
                                            <Save className="h-4 w-4" />
                                          </button>
                                          <button 
                                            onClick={() => cancelEditing(section.id, subject.id)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-300"
                                            title="Cancel"
                                          >
                                            <X className="h-4 w-4" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Elective Subject Assignments */}
        {canViewElectives && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Elective Subject Assignments</h3>
          
          {/* Department Filter Buttons */}
          {departments.length > 1 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Filter by Department</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedElectiveDept(null)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedElectiveDept === null
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Departments
                </button>
                {departments.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedElectiveDept(d.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedElectiveDept === d.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {d.short_name || d.code || d.name || `Dept ${d.id}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {electiveParents.filter(p => !selectedElectiveDept || (p.department && p.department.id === selectedElectiveDept)).length === 0 ? (
              <div className="text-gray-500 text-sm">No elective parents found for the selected department.</div>
            ) : (
              electiveParents.filter(p => !selectedElectiveDept || (p.department && p.department.id === selectedElectiveDept)).map(parent => (
                <div key={parent.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <div className="font-semibold text-gray-900">{parent.course_name || parent.course_code || 'Elective'}</div>
                  </div>
                  <div className="space-y-3">
                    {(electiveOptions && electiveOptions.filter((e: any) => e.parent === parent.id)).map((opt: any) => {
                      const existingElectiveAssignment = findExistingElectiveAssignment(opt.id);
                      const editingElective = isEditingElective(opt.id);
                      
                      // Debug logging
                      console.log(`Elective ${opt.course_code} (ID: ${opt.id}):`, {
                        opt,
                        existingElectiveAssignment,
                        allAssignments: assignments.filter(a => 
                          a.subject && (a.subject.includes(opt.course_code) || a.subject.includes(opt.course_name))
                        )
                      });
                      
                      return (
                        <div key={opt.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                          <div className="flex-1 text-sm font-medium text-gray-900">
                            {opt.course_code || '-'} — {opt.course_name || '-'}
                          </div>
                          <div className="min-w-[200px]">
                            {editingElective ? (
                              <select 
                                id={`elective-staff-${opt.id}`}
                                defaultValue={existingElectiveAssignment?.staff_details?.id || existingElectiveAssignment?.staff || ''}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">-- select staff --</option>
                                {staff.map(st => (<option key={st.id} value={st.id}>{st.staff_id} - {getStaffDisplayName(st)}</option>))}
                              </select>
                            ) : existingElectiveAssignment ? (
                              <div className="text-sm text-gray-900 font-medium">
                                {existingElectiveAssignment.staff_details?.staff_id} - {getAssignmentStaffName(existingElectiveAssignment.staff_details)}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 italic">
                                Not assigned
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!editingElective ? (
                              <button 
                                onClick={() => startEditingElective(opt.id)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-300"
                                title="Edit Assignment"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            ) : (
                              <>
                                <button 
                                  disabled={!canAssignElectives}
                                  onClick={() => {
                                    if (!canAssignElectives) return alert('No permission to assign electives');
                                    const staffSel = document.getElementById(`elective-staff-${opt.id}`) as HTMLSelectElement;
                                    if (!staffSel?.value) return alert('Select staff member');
                                    
                                    assignElective(opt.id, Number(staffSel.value), existingElectiveAssignment?.id)
                                      .then(() => {
                                        cancelEditingElective(opt.id);
                                      })
                                      .catch(() => {
                                        // Error handling is already in assignElective function
                                      });
                                  }}
                                  className={`p-2 rounded-lg transition-colors ${
                                    canAssignElectives 
                                      ? 'text-green-600 hover:bg-green-50 border border-green-300' 
                                      : 'text-gray-400 bg-gray-100 cursor-not-allowed border border-gray-300'
                                  }`}
                                  title={canAssignElectives ? 'Save Assignment' : 'No permission'}
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                                <button 
                                  onClick={() => cancelEditingElective(opt.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-300"
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
