import React, { useEffect, useMemo, useState } from 'react'
import { Award, BookOpen, Download, Loader2, RefreshCw } from 'lucide-react'
import {
  AchievementRecord,
  fetchAllAchievements,
  fetchAdviseeAchievements,
  fetchDepartmentAchievements,
  fetchMentorAchievements,
  fetchMyCertificates,
} from '../../services/certificates'

type Props = { user?: any }

const roleLabel = (roles: string[]) => {
  const upper = roles.map((role) => String(role || '').toUpperCase())
  if (upper.includes('IQAC')) return 'IQAC: All Achievements'
  if (upper.includes('HOD')) return 'HOD: Department Achievements'
  if (upper.includes('ADVISOR')) return 'Advisor: Advisee Achievements'
  if (upper.includes('MENTOR')) return 'Mentor: Mentee Achievements'
  return 'Achievements'
}

export default function AchievementsPage({ user }: Props) {
  const roles = useMemo(() => (user?.roles || []).map((r: string) => String(r || '').toUpperCase()), [user])
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<AchievementRecord[]>([])

  const label = roleLabel(roles)

  async function loadData() {
    setLoading(true)
    try {
      let result: { results: AchievementRecord[] } = { results: [] }
      if (roles.includes('IQAC')) result = await fetchAllAchievements()
      else if (roles.includes('HOD')) result = await fetchDepartmentAchievements()
      else if (roles.includes('ADVISOR')) result = await fetchAdviseeAchievements()
      else if (roles.includes('MENTOR')) result = await fetchMentorAchievements()
      else result = await fetchMyCertificates().then((response) => ({ results: (response.results || []).filter((item) => item.status === 'APPROVED').map((item) => item.achievement).filter(Boolean) as AchievementRecord[] }))
      setRecords(result.results || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
              <Award className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{label}</h1>
              <p className="text-slate-600 text-sm">Approved certificates that have become achievements.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <a href="/api/certificates/reports/export/" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
              <Download className="w-4 h-4" /> Export CSV
            </a>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center text-slate-600 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading achievements...</div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center text-slate-500">No achievements available.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {records.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{item.achievement_type.replace(/_/g, ' ')}</div>
                    <h2 className="text-lg font-semibold text-slate-900 mt-1">{item.title}</h2>
                    <div className="text-sm text-slate-600 mt-1">{item.issuing_body}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                    <BookOpen className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div>Student: <span className="font-medium text-slate-900">{item.student_name || item.student_reg_no}</span></div>
                  <div>Date earned: <span className="font-medium text-slate-900">{item.date_earned}</span></div>
                  {item.verified_by_username ? <div>Verified by: <span className="font-medium text-slate-900">{item.verified_by_username}</span></div> : null}
                </div>
                {item.certificate_file ? (
                  <a href={item.certificate_file} target="_blank" rel="noreferrer" className="inline-flex mt-4 text-indigo-700 font-medium hover:underline">Open certificate file</a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
