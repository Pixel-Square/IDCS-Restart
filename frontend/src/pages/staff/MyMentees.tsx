import React, { useEffect, useState } from 'react'
import { fetchMyMentees } from '../../services/mentor'
import { Users, Loader2, UserCheck, GraduationCap } from 'lucide-react'

type Mentee = {
  id: number
  reg_no: string
  username: string
  section_id: number | null
  section_name: string | null
}

type SectionGroup = {
  section_name: string
  section_id: number | null
  students: Mentee[]
}

export default function MyMentees() {
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ load() }, [])

  async function load(){
    setLoading(true)
    try{
      const res = await fetchMyMentees()
      setMentees(res.results || [])
    }catch(e){
      console.error(e)
      alert('Failed to load mentees')
    }finally{ setLoading(false) }
  }

  // Group mentees by section
  const groupedBySection = mentees.reduce((acc, mentee) => {
    const sectionName = mentee.section_name || 'No Section'
    const sectionId = mentee.section_id || 0
    
    const existingGroup = acc.find(g => g.section_id === sectionId)
    if (existingGroup) {
      existingGroup.students.push(mentee)
    } else {
      acc.push({
        section_name: sectionName,
        section_id: sectionId,
        students: [mentee]
      })
    }
    return acc
  }, [] as SectionGroup[])

  // Sort sections alphabetically
  groupedBySection.sort((a, b) => a.section_name.localeCompare(b.section_name))

  // Sort students within each section by reg_no
  groupedBySection.forEach(group => {
    group.students.sort((a, b) => (a.reg_no || '').localeCompare(b.reg_no || ''))
  })

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-4 md:p-6 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
              <Users className="w-6 h-6 md:w-8 md:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 mb-1">My Mentees</h1>
              <p className="text-slate-600 text-xs md:text-sm">Students assigned to you as mentor</p>
            </div>
          </div>
          {!loading && mentees.length > 0 && (
            <div className="px-4 py-2 bg-gradient-to-r from-slate-100 to-indigo-100 rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 md:w-5 md:h-5 text-indigo-700" />
                <span className="text-xs md:text-sm font-semibold text-indigo-900">
                  Total: {mentees.length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <span className="ml-3 text-slate-600">Loading mentees...</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && mentees.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="bg-slate-100 p-4 rounded-full mb-4">
              <Users className="w-12 h-12 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">No Mentees Assigned</h3>
            <p className="text-slate-600 text-sm">You don't have any students assigned as mentees yet.</p>
          </div>
        </div>
      )}

      {/* Section-wise Display */}
      {!loading && mentees.length > 0 && (
        <div className="space-y-6">
          {groupedBySection.map((group) => (
            <div key={group.section_id || 'no-section'} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Section Header */}
              <div className="px-4 md:px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-white" />
                    <h2 className="text-base md:text-lg font-semibold text-white">
                      {group.section_name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-white/20 text-white text-xs md:text-sm font-medium rounded-full">
                    {group.students.length} {group.students.length === 1 ? 'Student' : 'Students'}
                  </span>
                </div>
              </div>

              {/* Students Table - Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left py-3 px-6 text-sm font-semibold text-slate-700">
                        S.No
                      </th>
                      <th className="text-left py-3 px-6 text-sm font-semibold text-slate-700">
                        Reg No
                      </th>
                      <th className="text-left py-3 px-6 text-sm font-semibold text-slate-700">
                        Name
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {group.students.map((mentee, index) => (
                      <tr key={mentee.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-6">
                          <span className="text-sm text-slate-600">{index + 1}</span>
                        </td>
                        <td className="py-3 px-6">
                          <span className="text-sm font-medium text-slate-900">{mentee.reg_no}</span>
                        </td>
                        <td className="py-3 px-6">
                          <span className="text-sm text-slate-700">{mentee.username}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Students Cards - Mobile */}
              <div className="md:hidden divide-y divide-slate-200">
                {group.students.map((mentee, index) => (
                  <div key={mentee.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 mb-1">
                          {mentee.username}
                        </div>
                        <div className="text-xs text-slate-600">
                          Reg No: <span className="font-medium text-slate-900">{mentee.reg_no}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
