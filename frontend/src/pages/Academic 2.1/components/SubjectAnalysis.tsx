import React, { useEffect, useState } from 'react';
import { fetchStudentCurriculumMarks } from '../../../services/academicPerformance';
import { RefreshCw } from 'lucide-react';

interface Props {
  subjectCode: string;
  subjectName: string;
  deptCode: string;
  year: string;
  sem: string;
  exam: string;
  onStudentClick: (studentId: string, studentName: string) => void;
}

export default function SubjectAnalysis({ subjectCode, subjectName, deptCode, year, sem, exam, onStudentClick }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Reuse the existing curriculum marks endpoint which gives individual students
    fetchStudentCurriculumMarks({
      year, sem, dept: deptCode, exam
    })
      .then(res => setData(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [subjectCode, deptCode, year, sem, exam]);

  if (loading) {
    return (
      <div className="py-20 text-center animate-in fade-in">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600">Loading student performance data...</p>
      </div>
    );
  }

  // Find the subject id matching the code
  const subjectObj = data?.subjects?.find((s: any) => s.code === subjectCode);
  const subjectId = subjectObj?.id;

  const students = data?.students || [];

  return (
    <div className="space-y-6 animate-in fade-in-50">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Student Performance in {subjectName}</h3>
          <p className="text-sm text-slate-500">Showing all students enrolled in this subject.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-bold">Register Number</th>
                <th className="p-4 font-bold">Student Name</th>
                <th className="p-4 font-bold">Section</th>
                <th className="p-4 font-bold">Internal Mark (%)</th>
                <th className="p-4 font-bold">Classification</th>
                <th className="p-4 font-bold">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s: any) => {
                const mark = subjectId ? s.marks[subjectId] : null;
                const isAvailable = mark !== null && mark !== undefined;
                let classification = "N/A";
                let clsColor = "text-slate-500";
                
                if (isAvailable) {
                  if (mark > 58.0) { classification = "Above 58%"; clsColor = "text-emerald-600"; }
                  else if (mark === 58.0) { classification = "Equal to 58%"; clsColor = "text-indigo-600"; }
                  else { classification = "Below 58%"; clsColor = "text-amber-600"; }
                }

                return (
                  <tr key={s.student_id} onClick={() => onStudentClick(s.student_id, s.name)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                    <td className="p-4 font-medium text-slate-600">{s.reg_no}</td>
                    <td className="p-4">
                      <div className="font-bold text-blue-700 group-hover:text-blue-800 flex items-center gap-2">
                        {s.name}
                        <span className="opacity-0 group-hover:opacity-100 text-blue-500 text-xs">View Report &rarr;</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm font-medium">{s.section}</td>
                    <td className="p-4 font-bold">{isAvailable ? `${mark}%` : '-'}</td>
                    <td className={`p-4 font-bold ${clsColor}`}>{classification}</td>
                    <td className="p-4 font-semibold">
                      {s.attendance !== null && s.attendance !== undefined ? `${s.attendance}%` : 'N/A'}
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">No students available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
