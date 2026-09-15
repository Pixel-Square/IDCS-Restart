import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, FileText, CheckCircle, AlertCircle, Loader2, Users, FileCheck, Clock
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface Submission {
  submission_id: string | null;
  student_id: string;
  student_name: string;
  reg_no: string;
  submission_status: 'NOT_SUBMITTED' | 'SUBMITTED' | 'UNDER_EVALUATION' | 'EVALUATED';
  submitted_at: string | null;
  marks: number | null;
  evaluated_at: string | null;
  feedback: string | null;
}

export default function SSASubmissionsPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ assignment_info: any, submissions: Submission[] } | null>(null);

  useEffect(() => {
    fetchData();
  }, [examId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/academic-v2/ssa/assignment/${examId}/submissions/`);
      if (!res.ok) throw new Error('Failed to fetch submissions');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 m-4"><AlertCircle className="h-5 w-5" />{error}</div>;
  if (!data) return null;

  const { assignment_info, submissions } = data;

  const stats = {
    total: submissions.length,
    submitted: submissions.filter(s => s.submission_status !== 'NOT_SUBMITTED').length,
    evaluated: submissions.filter(s => s.submission_status === 'EVALUATED').length,
    pending: submissions.filter(s => s.submission_status === 'SUBMITTED' || s.submission_status === 'UNDER_EVALUATION').length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-medium">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Link to={`/academic-v2/exam/${assignment_info.exam_id}`} className="text-sm font-medium text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100">
          Enter Marks Page
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-2">SSA Submissions — {assignment_info.exam_type}</h1>
        <p className="text-gray-500 text-sm">{assignment_info.course_code} • {assignment_info.course_name} • {assignment_info.section_name}</p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
            <div className="bg-gray-200 p-2 rounded-full"><Users className="h-5 w-5 text-gray-600" /></div>
            <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Total Students</p></div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 flex items-center gap-4">
            <div className="bg-blue-200 p-2 rounded-full"><FileText className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-2xl font-bold">{stats.submitted}</p><p className="text-xs text-blue-600 uppercase font-semibold tracking-wider">Submitted</p></div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 flex items-center gap-4">
            <div className="bg-amber-200 p-2 rounded-full"><Clock className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-2xl font-bold">{stats.pending}</p><p className="text-xs text-amber-600 uppercase font-semibold tracking-wider">Pending Eval</p></div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 flex items-center gap-4">
            <div className="bg-green-200 p-2 rounded-full"><FileCheck className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-2xl font-bold">{stats.evaluated}</p><p className="text-xs text-green-600 uppercase font-semibold tracking-wider">Evaluated</p></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Register No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted On</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marks</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {submissions.map((sub, idx) => (
                <tr key={sub.student_id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sub.reg_no}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.student_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {sub.submission_status === 'NOT_SUBMITTED' && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Not Submitted</span>}
                    {sub.submission_status === 'SUBMITTED' && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Submitted</span>}
                    {sub.submission_status === 'UNDER_EVALUATION' && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Under Eval</span>}
                    {sub.submission_status === 'EVALUATED' && <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Evaluated</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {sub.marks !== null ? `${sub.marks} / ${assignment_info.max_marks}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                    {sub.submission_id && sub.submission_status !== 'NOT_SUBMITTED' ? (
                      <button onClick={() => navigate(`/academic-v2/ssa/evaluate/${sub.submission_id}?examId=${examId}`)} className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                        View Work
                      </button>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
