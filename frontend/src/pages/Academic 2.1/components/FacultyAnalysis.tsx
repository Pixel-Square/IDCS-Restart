import React from 'react';
import { FacultyWiseRow } from '../../../services/academicPerformance';

interface Props {
  facultyData: FacultyWiseRow;
  onSubjectClick: (subjectCode: string, subjectName: string, subjectData: any) => void;
}

export default function FacultyAnalysis({ facultyData, onSubjectClick }: Props) {
  return (
    <div className="space-y-6 animate-in fade-in-50">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">{facultyData.name}</h2>
          <p className="text-slate-500 font-medium">{facultyData.designation} • {facultyData.department}</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-blue-50 px-4 py-2 rounded-xl text-center border border-blue-100">
            <p className="text-xs font-bold text-blue-500 uppercase">Subjects</p>
            <p className="text-xl font-black text-blue-700">{facultyData.subjects_count}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Subjects Handled</h3>
          <p className="text-sm text-slate-500">Click a subject to view student performance details.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-bold">Subject</th>
                <th className="p-4 font-bold">Section</th>
                <th className="p-4 font-bold">Students</th>
                <th className="p-4 font-bold">Avg Score</th>
                <th className="p-4 font-bold text-emerald-600">Above 58%</th>
                <th className="p-4 font-bold text-indigo-600">Equal 58%</th>
                <th className="p-4 font-bold text-amber-600">Below 58%</th>
                <th className="p-4 font-bold">Pass %</th>
                <th className="p-4 font-bold">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {facultyData.subjects && facultyData.subjects.filter(sub => sub.student_count && sub.student_count > 0).map((sub: any) => (
                <tr key={sub.id} onClick={() => onSubjectClick(sub.subject_code, sub.subject_name, sub)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                  <td className="p-4">
                    <div className="font-bold text-blue-700 flex items-center gap-2">
                      {sub.subject_name} <span className="text-xs text-slate-400 font-normal">({sub.subject_code})</span>
                      <span className="opacity-0 group-hover:opacity-100 text-blue-500 text-xs">Drill down &rarr;</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm font-medium">{sub.section}</td>
                  <td className="p-4 font-semibold">{sub.student_count}</td>
                  <td className="p-4 font-semibold">{sub.avg_score}%</td>
                  <td className="p-4 font-semibold text-emerald-600">{sub.above_58_pct ?? '-'}%</td>
                  <td className="p-4 font-semibold text-indigo-600">{sub.equal_58_pct ?? '-'}%</td>
                  <td className="p-4 font-semibold text-amber-600">{sub.below_58_pct ?? '-'}%</td>
                  <td className="p-4 font-semibold">{sub.pass_percentage}%</td>
                  <td className="p-4 font-semibold">
                    {sub.attendance !== null && sub.attendance !== undefined ? `${sub.attendance}%` : 'N/A'}
                  </td>
                </tr>
              ))}
              {(!facultyData.subjects || facultyData.subjects.filter(sub => sub.student_count && sub.student_count > 0).length === 0) && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">No subjects available for this faculty.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
