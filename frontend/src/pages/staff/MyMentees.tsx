import React, { useEffect, useState } from 'react'
import { fetchMyMentees } from '../../services/mentor'
import { Users, Loader2, UserCheck } from 'lucide-react'

export default function MyMentees() {
  const [mentees, setMentees] = useState<any[]>([])
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

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-6 border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
            <Users className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">My Mentees</h1>
            <p className="text-slate-600 text-sm">Students assigned to you as mentor</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-600" />
              Mentees List
              {!loading && mentees.length > 0 && (
                <span className="ml-2 px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                  {mentees.length}
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <span className="ml-3 text-slate-600">Loading mentees...</span>
            </div>
          )}

          {!loading && mentees.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-slate-100 p-4 rounded-full mb-4">
                <Users className="w-12 h-12 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No Mentees Assigned</h3>
              <p className="text-slate-600 text-sm">You don't have any students assigned as mentees yet.</p>
            </div>
          )}

          {!loading && mentees.length > 0 && (
            <div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-slate-50">
                      Reg No
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-slate-50">
                      Name
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 bg-slate-50">
                      Section
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {mentees.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-slate-900">{m.reg_no}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-700">{m.username}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                          {m.section_name || 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
