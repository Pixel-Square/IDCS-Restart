import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import { Users, GraduationCap, Mail, Loader2, UserCircle2 } from 'lucide-react'

type Student = { 
  id: number; 
  reg_no: string; 
  username: string; 
  first_name?: string;
  last_name?: string;
  email?: string;
  section_id?: number; 
  section_name?: string;
  batch?: string;
  status?: string;
}

type SectionGroup = {
  section_id: number;
  section_name: string;
  students: Student[];
}

export default function MyStudentsPage() {
  const [data, setData] = useState<SectionGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSection, setSelectedSection] = useState<number | null>(null)

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (data.length > 0 && selectedSection === null) {
      setSelectedSection(data[0].section_id)
    }
  }, [data])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetchWithAuth('/api/academics/my-students/')
      if (!res.ok) throw new Error(await res.text())
      const d = await res.json()
      setData(d.results || [])
    } catch (e) {
      console.error(e)
      alert('Failed to load your students. See console for details.')
    } finally { setLoading(false) }
  }

  const currentSection = data.find(s => s.section_id === selectedSection)
  const students = [...(currentSection?.students || [])].sort((a, b) => a.reg_no.localeCompare(b.reg_no))

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <span className="text-slate-600 text-lg">Loading student information...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-6 border border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">My Students</h1>
              <p className="text-slate-600 text-sm">View and manage your assigned student profiles</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-gradient-to-r from-slate-100 to-indigo-100 rounded-lg">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-700" />
              <span className="text-sm font-semibold text-indigo-900">
                Total: {data.reduce((sum, s) => sum + s.students.length, 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {data.length === 0 && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="bg-slate-100 p-4 rounded-full mb-4">
              <Users className="w-16 h-16 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Students Assigned</h3>
            <p className="text-slate-600 text-sm">You don't have any students assigned to your sections yet.</p>
          </div>
        </div>
      )}

      {/* Section Pills */}
      {data.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          {data.map(section => {
            const isActive = selectedSection === section.section_id
            return (
              <button
                key={section.section_id}
                onClick={() => setSelectedSection(section.section_id)}
                className={`px-5 py-2 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-200'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                }`}
              >
                {section.section_name}
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  {section.students.length}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Students Table */}
      {students.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-indigo-50 border-b-2 border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">S.No</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Registration No</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Student Name</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-indigo-900">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.map((student, index) => (
                  <tr 
                    key={student.id} 
                    className="hover:bg-blue-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-slate-600">{index + 1}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-semibold text-slate-900">{student.reg_no}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <UserCircle2 className="w-5 h-5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-900">
                          {student.first_name && student.last_name 
                            ? `${student.first_name} ${student.last_name}`.trim() 
                            : student.username}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        {student.email ? (
                          <>
                            <Mail className="w-4 h-4 text-slate-400" />
                            <span className="text-sm">{student.email}</span>
                          </>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}