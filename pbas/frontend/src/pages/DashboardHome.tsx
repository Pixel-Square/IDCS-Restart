import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  FilePlus2,
  FileCheck2,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  FolderOpen,
  ArrowRight,
  Shield,
  Layers,
  BookOpen,
} from 'lucide-react'
import { AuthUser, PBASSubmission } from '../types/pbas'
import { fetchMySubmissions } from '../services/pbas'

interface Props {
  user: AuthUser | null
}

export default function DashboardHome({ user }: Props) {
  const [submissions, setSubmissions] = useState<PBASSubmission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMySubmissions()
      .then(setSubmissions)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  const staff = user?.staff_profile
  const credits = staff?.pbas_credit ?? user?.student_profile?.pbas_credit ?? 0
  const isApprover = user?.role_names?.some(r =>
    ['HOD', 'PRINCIPAL', 'PBAS_APPROVER', 'IQAC', 'ADMIN'].includes(r.toUpperCase())
  ) || user?.is_superuser
  const isAdmin = user?.role_names?.some(r =>
    ['IQAC', 'ADMIN', 'PBAS_ADMIN', 'PBAS_MANAGER'].includes(r.toUpperCase())
  ) || user?.is_superuser

  const approvedSubs = submissions.filter(s => s.status === 'approved')
  const pendingSubs = submissions.filter(s => s.status === 'pending')

  const categories = [
    {
      title: 'Teaching & Academics',
      part: 'Part A',
      score: staff?.pbas_academics_credit ?? 25,
      max: 40,
      color: 'from-blue-600 to-indigo-600',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Student Development',
      part: 'Part B',
      score: staff?.pbas_student_development_credit ?? 8,
      max: 20,
      color: 'from-amber-500 to-orange-500',
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      title: 'Research & Publications',
      part: 'Part C',
      score: staff?.pbas_research_development_credit ?? 10,
      max: 30,
      color: 'from-emerald-600 to-teal-600',
      textColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Institutional Governance',
      part: 'Part D',
      score: staff?.pbas_institutional_contribution_credit ?? 5,
      max: 10,
      color: 'from-purple-600 to-pink-600',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold mb-3">
            <span>Annual Appraisal Assessment Cycle</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome back, {user?.full_name || user?.username}!
          </h1>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            Track your criterion progress, submit verified research & teaching evidence, and monitor multi-tier appraisal approvals across your department.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/dashboard/submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Submit New PBAS Evidence</span>
            </Link>

            {isApprover && (
              <Link
                to="/dashboard/approvals"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all"
              >
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <span>Approvals Review Hub</span>
              </Link>
            )}

            {isAdmin && (
              <Link
                to="/dashboard/admin"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all"
              >
                <Shield className="w-4 h-4 text-blue-400" />
                <span>PBAS Admin Config</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Score */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Credits</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{credits} <span className="text-sm font-semibold text-slate-400">/ 100 max</span></div>
            <div className="text-[11px] font-medium text-emerald-600 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Active in 2025-2026</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Total Submissions */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Submissions</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{submissions.length}</div>
            <div className="text-[11px] font-medium text-slate-500 mt-1">Submitted in total</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <FolderOpen className="w-6 h-6" />
          </div>
        </div>

        {/* Approved Submissions */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Approved</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{approvedSubs.length}</div>
            <div className="text-[11px] font-medium text-emerald-600 mt-1">Fully ratified</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Pending In Review */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">In Review</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{pendingSubs.length}</div>
            <div className="text-[11px] font-medium text-amber-600 mt-1">Awaiting approvals</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Category Progress Meters */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">UGC / NAAC Category Breakdown</h2>
            <p className="text-xs text-slate-500 mt-0.5">Verified score distribution across appraisal categories</p>
          </div>
          <Link to="/dashboard/submit" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
            <span>Add Evidence</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const pct = Math.min(100, Math.round((cat.score / cat.max) * 100))
            return (
              <div key={cat.part} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-slate-500">{cat.part}</span>
                  <span className={cat.textColor}>{cat.score} / {cat.max} pts</span>
                </div>
                <div className="font-semibold text-sm text-slate-900 truncate mb-3">{cat.title}</div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${cat.color} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
                <div className="text-[11px] text-slate-400 mt-2 text-right">{pct}% of category target</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Submissions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Recent PBAS Submissions</h3>
            <p className="text-xs text-slate-500">Your latest uploaded activities and review stages</p>
          </div>
          <Link
            to="/dashboard/my-submissions"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            View All ({submissions.length})
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No submissions yet. Click "Submit New PBAS Evidence" to get started!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Criterion / Activity</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Points</th>
                  <th className="px-5 py-3">Current Stage</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.slice(0, 5).map((sub) => {
                  const isApproved = sub.status === 'approved'
                  const isPending = sub.status === 'pending'
                  const isRejected = sub.status === 'rejected'

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900 max-w-xs truncate">
                        {sub.leaf_title}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 max-w-[200px] truncate">
                        {sub.parent_path}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {sub.pbas_credit} pts
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                          {sub.current_step || 'Completed'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full font-bold">
                            Approved
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full font-bold">
                            In Review
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-200/60 px-2 py-0.5 rounded-full font-bold">
                            Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">
                        {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
