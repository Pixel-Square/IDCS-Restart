import React from 'react';
import { Users, GraduationCap, Award, TrendingUp, CheckCircle2 } from 'lucide-react';
import { PerformanceAnalyticsResponse } from '../../../services/academicPerformance';

interface Props {
  data: PerformanceAnalyticsResponse | null;
  onDepartmentClick: (deptCode: string, deptName: string) => void;
}

export default function CollegeOverview({ data, onDepartmentClick }: Props) {
  if (!data) return null;

  const metrics = data.metrics as any;
  const depts = data.dept_comparison || [];

  return (
    <div className="space-y-6 animate-in fade-in-50">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        {/* Total Students */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Students</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{metrics?.total_students || 0}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
            <Users className="w-6 h-6" />
          </div>
        </div>
        {/* Overall Pass % */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Pass %</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{metrics?.overall_pass_pct || 0}%</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
        {/* Overall Average Marks */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Average Marks</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{metrics?.overall_marks_pct || 0}%</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>
        {/* Overall Attendance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Attendance</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              {metrics?.overall_attendance !== null && metrics?.overall_attendance !== undefined ? `${metrics.overall_attendance}%` : 'N/A'}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
        {/* Overall Pass / Fail Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pass / Fail Count</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              {metrics?.overall_pass_count ?? 0} / {metrics?.overall_fail_count ?? 0}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600 border border-red-100">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Department Wise Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Department-wise Academic Performance</h3>
          <p className="text-sm text-slate-500">Click a department to drill down into faculty analytics.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-bold">Department</th>
                <th className="p-4 font-bold">Total Students</th>
                <th className="p-4 font-bold">Pass %</th>
                <th className="p-4 font-bold">Avg Marks %</th>
                <th className="p-4 font-bold">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {depts.map((d: any) => (
                <tr key={d.dept_code} onClick={() => onDepartmentClick(d.id, d.dept_name)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                  <td className="p-4">
                    <div className="font-bold text-blue-700 group-hover:text-blue-800 flex items-center gap-2">
                      {d.dept_name}
                      <span className="opacity-0 group-hover:opacity-100 text-blue-500 text-xs">Drill down &rarr;</span>
                    </div>
                  </td>
                  <td className="p-4 font-semibold">{d.total_students}</td>
                  <td className="p-4 font-semibold">{d.pass_rate_pct}%</td>
                  <td className="p-4 font-semibold">{d.avg_marks_pct}%</td>
                  <td className="p-4 font-semibold">
                    {d.attendance !== null && d.attendance !== undefined ? `${d.attendance}%` : 'N/A'}
                  </td>
                </tr>
              ))}
              {depts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">No department data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
