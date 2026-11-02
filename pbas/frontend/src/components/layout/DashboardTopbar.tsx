import React from 'react'
import { Calendar, Bell, Award, Building, Sparkles } from 'lucide-react'
import { AuthUser } from '../../types/pbas'

interface Props {
  user: AuthUser | null
}

export default function DashboardTopbar({ user }: Props) {
  const staffDept = user?.staff_profile?.department?.name || user?.student_profile?.home_department?.name || 'Department of CSE'
  const credits = user?.staff_profile?.pbas_credit ?? user?.student_profile?.pbas_credit ?? 0

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-800 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Appraisal Window: 2025 - 2026 Active</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
          <Building className="w-3.5 h-3.5 text-slate-500" />
          <span>{staffDept}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Credits Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60 shadow-sm">
          <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center">
            <Award className="w-3.5 h-3.5" />
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Credits</div>
            <div className="text-sm font-extrabold text-blue-700 leading-none">{credits} pts</div>
          </div>
        </div>

        {/* User Mini Profile */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-blue-500/30">
            {user?.first_name?.[0] || 'U'}
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-bold text-slate-900 leading-tight">
              {user?.full_name || user?.username}
            </div>
            <div className="text-[10px] font-medium text-slate-500">
              {user?.role_names?.join(', ') || 'Staff Member'}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
