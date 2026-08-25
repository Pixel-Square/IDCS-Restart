import React, { useEffect, useState } from 'react';
import { fetchFacultyWiseAnalytics, FacultyWiseRow } from '../../../services/academicPerformance';
import { RefreshCw } from 'lucide-react';

interface Props {
  deptCode: string;
  onFacultyClick: (facultyId: string, facultyName: string, facultyData: FacultyWiseRow) => void;
}

export default function DepartmentAnalysis({ deptCode, onFacultyClick }: Props) {
  const [faculties, setFaculties] = useState<FacultyWiseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchFacultyWiseAnalytics(deptCode)
      .then(res => setFaculties(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [deptCode]);

  if (loading) {
    return (
      <div className="py-20 text-center animate-in fade-in">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600">Loading department faculty analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in-50">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Faculty / Staff Performance</h3>
          <p className="text-sm text-slate-500">Click a faculty member to view subject-wise analytics.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-bold">Staff Name</th>
                <th className="p-4 font-bold">Designation</th>
                <th className="p-4 font-bold">Subjects Handled</th>
                <th className="p-4 font-bold">Students Handled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {faculties.map((f) => {
                const totalStudents = f.handled_subjects.reduce((sum, s) => sum + s.student_count, 0);
                return (
                  <tr key={f.faculty_id} onClick={() => onFacultyClick(f.faculty_id, f.name, f)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                    <td className="p-4">
                      <div className="font-bold text-blue-700 flex items-center gap-2">
                        {f.name} <span className="text-xs text-slate-400 font-normal">({f.staff_id})</span>
                        <span className="opacity-0 group-hover:opacity-100 text-blue-500 text-xs">Drill down &rarr;</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm">{f.designation}</td>
                    <td className="p-4 font-semibold">{f.handled_subjects.length}</td>
                    <td className="p-4 font-semibold">{totalStudents}</td>
                  </tr>
                );
              })}
              {faculties.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500 font-medium">No faculty data available for this department.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
