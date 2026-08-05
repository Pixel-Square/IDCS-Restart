import React, { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Award, FileText, UserCircle2, Building2, BookOpen, ExternalLink, CalendarDays } from 'lucide-react'
import { fetchAdviseeAchievements, fetchMenteeAchievements, type AchievementRecord } from '../../services/certificates'

export default function StudentCertificatesPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  
  const student = location.state?.student
  const viewMode = location.state?.viewMode

  const [achievements, setAchievements] = useState<AchievementRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!student || !viewMode || !studentId) {
      // If accessed directly without state, redirect back to students list
      navigate('/staff/students')
      return
    }

    const loadAchievements = async () => {
      setLoading(true)
      try {
        let res
        if (viewMode === 'my-mentees') {
          res = await fetchMenteeAchievements(Number(studentId))
        } else if (viewMode === 'my-students') {
          res = await fetchAdviseeAchievements(Number(studentId))
        } else {
          throw new Error('Invalid view mode for accessing certificates')
        }
        
        setAchievements(res.results || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load certificates')
      } finally {
        setLoading(false)
      }
    }

    loadAchievements()
  }, [studentId, student, viewMode, navigate])

  if (!student) return null

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <button 
        onClick={() => navigate('/staff/students')}
        className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Students
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 border-b border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-indigo-100">
              <UserCircle2 className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {student.first_name ? `${student.first_name} ${student.last_name || ''}` : student.username || student.name}
              </h1>
              <div className="text-indigo-700 font-medium tracking-wide mt-1">
                {student.reg_no}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span>{student.department_short_name || student.department_code || '-'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span>{student.batch || '-'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 col-span-2 md:col-span-1">
              <Award className="w-4 h-4 text-slate-400" />
              <span>{achievements.length} Certificates</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-600" />
            Achievements & Certificates
          </h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
              <p>Loading certificates...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
              {error}
            </div>
          ) : achievements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">No Certificates Found</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                This student has not uploaded any approved certificates or achievements yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {achievements.map((achievement) => (
                <div key={achievement.id} className="group relative bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 mb-3 border border-indigo-100">
                        {achievement.achievement_type.replace(/_/g, ' ')}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 leading-tight mb-2">
                        {achievement.title}
                      </h3>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {achievement.issuing_body}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                          {achievement.date_earned}
                        </div>
                      </div>
                    </div>
                    {achievement.certificate_file && (
                      <a
                        href={achievement.certificate_file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-sm font-medium rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors"
                        title="View Document"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>View</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
