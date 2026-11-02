import React from 'react'
import { User, Award, Building, Mail, Shield, CheckCircle2, LogOut } from 'lucide-react'
import { AuthUser } from '../types/pbas'
import { clearAuthSession } from '../services/auth'
import { useNavigate } from 'react-router-dom'

interface Props {
  user: AuthUser | null
}

export default function ProfilePage({ user }: Props) {
  const navigate = useNavigate()
  const staff = user?.staff_profile
  const stu = user?.student_profile
  const credits = staff?.pbas_credit ?? stu?.pbas_credit ?? 0

  const handleLogout = () => {
    clearAuthSession()
    navigate('/login')
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Profile Header Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-lg shadow-blue-500/20">
            {user?.first_name?.[0] || 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {user?.full_name || user?.username}
              </h1>
              {user?.role_names?.map((role) => (
                <span
                  key={role}
                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                >
                  {role}
                </span>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">
              {staff?.designation || (stu ? 'Student' : 'Academic Member')} • {staff?.department?.name || stu?.home_department?.name || 'Department of Computer Science'}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span>Staff ID / Reg No: <strong className="text-slate-700">{staff?.staff_id || stu?.reg_no || 'N/A'}</strong></span>
              <span>•</span>
              <span>Email: <strong className="text-slate-700">{user?.email}</strong></span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>

      {/* Credits Breakdown Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Appraisal Credit Score Summary</h2>
            <p className="text-xs text-slate-500 mt-0.5">Live verified scores for the current annual academic cycle</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-blue-700">{credits} pts</span>
            <div className="text-[10px] text-slate-400 font-bold uppercase">Total Verified</div>
          </div>
        </div>

        {staff && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100">
              <div className="text-xs font-bold text-blue-800 uppercase tracking-wider">Part A</div>
              <div className="text-xl font-black text-blue-900 mt-1">{staff.pbas_academics_credit} pts</div>
              <div className="text-xs text-blue-700 mt-0.5 font-medium">Teaching & Academics</div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-100">
              <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Part B</div>
              <div className="text-xl font-black text-amber-900 mt-1">{staff.pbas_student_development_credit} pts</div>
              <div className="text-xs text-amber-700 mt-0.5 font-medium">Student Development</div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100">
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Part C</div>
              <div className="text-xl font-black text-emerald-900 mt-1">{staff.pbas_research_development_credit} pts</div>
              <div className="text-xs text-emerald-700 mt-0.5 font-medium">Research & Development</div>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100">
              <div className="text-xs font-bold text-purple-800 uppercase tracking-wider">Part D</div>
              <div className="text-xl font-black text-purple-900 mt-1">{staff.pbas_institutional_contribution_credit} pts</div>
              <div className="text-xs text-purple-700 mt-0.5 font-medium">Institutional Governance</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
