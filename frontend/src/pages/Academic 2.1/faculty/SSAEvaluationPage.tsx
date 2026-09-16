import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Loader2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

export default function SSAEvaluationPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('examId');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const [marks, setMarks] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [submissionId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/academic-v2/ssa/submission/${submissionId}/`);
      if (!res.ok) throw new Error('Failed to fetch submission details');
      const json = await res.json();
      setData(json);
      setMarks(json.submission.marks !== null ? String(json.submission.marks) : '');
      setFeedback(json.submission.feedback || '');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (status: 'UNDER_EVALUATION' | 'EVALUATED') => {
    try {
      setSaving(true);
      const markVal = parseFloat(marks);
      if (isNaN(markVal) || markVal < 0 || markVal > data.assignment_info.max_marks) {
        throw new Error(`Marks must be between 0 and ${data.assignment_info.max_marks}`);
      }
      const res = await fetchWithAuth(`/api/academic-v2/ssa/submission/${submissionId}/evaluate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks: markVal, feedback, status }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save evaluation');
      }
      await fetchData();
      if (status === 'EVALUATED') alert('Evaluation submitted successfully!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [requestingEdit, setRequestingEdit] = useState(false);

  const handleRequestEdit = async () => {
    if (!editReason.trim()) {
      alert('Please provide a reason');
      return;
    }
    try {
      setRequestingEdit(true);
      const res = await fetchWithAuth(`/api/academic-v2/exams/${examId}/request-edit/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: editReason }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Failed to request edit');
      }
      setShowEditModal(false);
      setEditReason('');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRequestingEdit(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8 h-screen items-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 m-4"><AlertCircle className="h-5 w-5" />{error}</div>;
  if (!data) return null;

  const { submission, assignment_info, all_submissions } = data;

  // Navigation
  const currentIndex = all_submissions.findIndex((s: any) => s.submission_id === submissionId);
  const prevSub = currentIndex > 0 ? all_submissions[currentIndex - 1] : null;
  const nextSub = currentIndex >= 0 && currentIndex < all_submissions.length - 1 ? all_submissions[currentIndex + 1] : null;

  const isLocked = submission.submission_status === 'EVALUATED' && !assignment_info.edit_window_active;

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden relative">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(examId ? `/academic-v2/ssa/submissions/${examId}` : -1 as any)} className="text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-bold text-gray-900">SSA Evaluation</h1>
            <p className="text-xs text-gray-500">{assignment_info.course_code} • {assignment_info.exam_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={!prevSub} onClick={() => prevSub && navigate(`/academic-v2/ssa/evaluate/${prevSub.submission_id}?examId=${examId}`)} className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium text-gray-600 px-2">{currentIndex + 1} of {all_submissions.length}</span>
          <button disabled={!nextSub} onClick={() => nextSub && navigate(`/academic-v2/ssa/evaluate/${nextSub.submission_id}?examId=${examId}`)} className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer - Left 2/3 */}
        <div className="flex-1 border-r border-gray-200 bg-gray-200 h-full p-4 overflow-hidden flex flex-col">
          <div className="bg-white rounded-lg shadow flex-1 overflow-hidden">
            {submission.generated_file_url ? (
              <iframe src={submission.generated_file_url} className="w-full h-full border-0" title="PDF Viewer" />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">No generated PDF available</div>
            )}
          </div>
        </div>

        {/* Evaluation Panel - Right 1/3 */}
        <div className="w-96 bg-white h-full overflow-y-auto p-6 flex flex-col gap-6 relative">

          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <h3 className="font-bold text-lg">{submission.student_name}</h3>
            <p className="text-sm text-gray-500 font-mono mt-1">{submission.reg_no}</p>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className={`px-2 py-1 rounded-full font-medium ${submission.submission_status === 'EVALUATED' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                {submission.submission_status}
              </span>
              <span className="text-gray-500">{new Date(submission.submitted_at).toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marks Obtained (Max: {assignment_info.max_marks})</label>
            <input
              type="number"
              value={marks}
              onChange={e => setMarks(e.target.value)}
              min="0"
              max={assignment_info.max_marks}
              step="0.5"
              disabled={isLocked}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Feedback (Optional)</label>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={4}
              disabled={isLocked}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Enter constructive feedback here..."
            />
          </div>

          <div className="mt-auto space-y-3">
            {isLocked ? (
              <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg text-center">
                <p className="text-sm text-orange-800 mb-3 font-medium">Evaluation Locked</p>
                {assignment_info.has_pending_edit_request ? (
                  <button disabled className="w-full bg-orange-200 text-orange-800 font-medium py-2 rounded-lg opacity-80">Request Pending</button>
                ) : (
                  <button onClick={() => setShowEditModal(true)} className="w-full bg-orange-600 text-white font-medium py-2 rounded-lg hover:bg-orange-700">Request Edit</button>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={() => handleSave('UNDER_EVALUATION')}
                  disabled={saving}
                  className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-2 rounded-lg hover:bg-gray-50 flex justify-center items-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Draft
                </button>
                <button
                  onClick={() => handleSave('EVALUATED')}
                  disabled={saving || !marks}
                  className="w-full bg-indigo-600 text-white font-medium py-2 rounded-lg hover:bg-indigo-700 flex justify-center items-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Submit Evaluation
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Request Edit Access</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <span className="sr-only">Close</span>✕
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason for requesting edit</label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                rows={3}
                placeholder="Briefly explain why you need to edit this evaluation..."
              />
              <p className="text-xs text-gray-500 mt-2">This request will be sent to the administrator. Once approved, the evaluation form will be unlocked temporarily.</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setShowEditModal(false)} disabled={requestingEdit} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleRequestEdit} disabled={requestingEdit || !editReason.trim()} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50">
                {requestingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {requestingEdit ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
