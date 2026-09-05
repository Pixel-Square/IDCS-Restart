import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, Legend,
} from 'recharts';
import { RefreshCw, Users, Award, TrendingUp, Clock, UserCheck, ChevronRight } from 'lucide-react';
import {
  SubjectAnalysisResponse,
  SubjectAnalysisStudentRow,
} from '../../../services/academicPerformance';

interface Props {
  data: SubjectAnalysisResponse | null;
  loading: boolean;
  error: string;
  sectionFilter: string;
  onSectionClick: (sectionName: string) => void;
  onViewStudent: (studentId: string) => void;
}

const PASS_COLOR = '#059669';
const FAIL_COLOR = '#e11d48';

export default function SubjectWiseAnalysis({
  data, loading, error, sectionFilter, onSectionClick, onViewStudent,
}: Props) {
  if (loading) {
    return (
      <div className="py-16 text-center">
        <RefreshCw className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-500">Loading subject analysis...</p>
      </div>
    );
  }
  if (error) {
    return <div className="py-16 text-center text-rose-600 font-bold text-sm">{error}</div>;
  }
  if (!data) {
    return (
      <div className="py-16 text-center text-slate-500 text-sm">
        No subject data found for the selected scope.
      </div>
    );
  }

  const m = data.metrics;
  const facultyLabel = data.faculty.length === 1
    ? data.faculty[0].name
    : `${data.faculty.length} Faculty Members`;

  // Student table respects the section click-filter.
  const students: SubjectAnalysisStudentRow[] = sectionFilter
    ? data.students.filter((s) => s.section === sectionFilter)
    : data.students;

  const kpis = [
    { label: 'Total Students', value: `${m.students}`, icon: Users },
    { label: 'Average Marks %', value: m.average_marks_pct != null ? `${m.average_marks_pct}%` : '—', icon: TrendingUp },
    { label: 'Pass %', value: m.pass_pct != null ? `${m.pass_pct}%` : '—', icon: Award },
    { label: 'Attendance', value: m.attendance_pct != null ? `${m.attendance_pct}%` : 'N/A', icon: Clock },
    { label: 'Faculty', value: facultyLabel, icon: UserCheck },
  ];

  return (
    <div className="space-y-5">
      {/* Subject header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-black text-slate-900">{data.subject.code}</p>
            <p className="text-sm font-bold text-blue-700">{data.subject.name}</p>
          </div>
          <div className="text-xs text-slate-600 space-y-0.5 text-left md:text-right">
            <p><span className="font-bold">Department:</span> {data.subject.department || '—'}</p>
            <p><span className="font-bold">Faculty:</span> {facultyLabel}</p>
            <p><span className="font-bold">Academic Year:</span> {data.subject.academic_year || 'All'}</p>
            <p><span className="font-bold">Semester:</span> {data.subject.semester || 'All'}</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-blue-500" />
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
            </div>
            <p className="text-xl font-black text-slate-900 mt-1 truncate" title={value}>{value}</p>
          </div>
        ))}
      </div>

      {/* Section-wise analysis */}
      {data.sections.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">Section-wise Analysis</h4>
            {sectionFilter && (
              <button
                type="button"
                onClick={() => onSectionClick('')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                Clear section filter ({sectionFilter})
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4 text-center">Students</th>
                  <th className="py-3 px-4 text-center">Average Marks %</th>
                  <th className="py-3 px-4 text-center">Pass %</th>
                  <th className="py-3 px-4 text-center">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.sections.map((s) => (
                  <tr
                    key={s.section}
                    onClick={() => onSectionClick(sectionFilter === s.section ? '' : s.section)}
                    className={`cursor-pointer transition-colors ${sectionFilter === s.section ? 'bg-blue-50' : 'hover:bg-slate-50/60'}`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-900">{s.section}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{s.students}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{s.avg_marks_pct != null ? `${s.avg_marks_pct}%` : '—'}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{s.pass_pct != null ? `${s.pass_pct}%` : '—'}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{s.attendance_pct != null ? `${s.attendance_pct}%` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Student Marks Distribution</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.marks_distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="students" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Pass / Fail Distribution</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.pass_fail}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name="Students" radius={[4, 4, 0, 0]}>
                {data.charts.pass_fail.map((e) => (
                  <Cell key={e.label} fill={e.label === 'Pass' ? PASS_COLOR : FAIL_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Section-wise Average Marks</h4>
          {data.charts.section_avg.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">No assessment data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.charts.section_avg}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" name="Avg Marks %" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Section-wise Pass Percentage</h4>
          {data.charts.section_pass.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">No assessment data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.charts.section_pass}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" name="Pass %" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 lg:col-span-2">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Assessment Comparison</h4>
          {data.charts.assessment_comparison.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">No assessment data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.charts.assessment_comparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" name="Avg Marks %" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Student performance table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900">Student Performance</h4>
          <span className="text-[11px] font-bold text-slate-400">{students.length} students</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Register No</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4 text-center">Section</th>
                <th className="py-3 px-4 text-center">Assessment</th>
                <th className="py-3 px-4 text-center">Percentage</th>
                <th className="py-3 px-4 text-center">Result</th>
                <th className="py-3 px-4 text-center">Attendance</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.length === 0 ? (
                <tr><td colSpan={8} className="py-6 text-center text-slate-400">No students found for the selected scope.</td></tr>
              ) : (
                students.map((s) => (
                  <tr key={s.student_id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-bold text-slate-900">{s.reg_no}</td>
                    <td className="py-3 px-4 text-slate-700">{s.name}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{s.section}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{s.assessment}</td>
                    <td className="py-3 px-4 text-center text-slate-700">
                      {s.marks_pct != null ? `${s.marks_pct}%` : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.result === 'Pass' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                        {s.result || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-700">
                      {s.attendance_pct != null ? `${s.attendance_pct}%` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onViewStudent(s.student_id)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                      >
                        View Analysis <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
