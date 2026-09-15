import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText, Upload, CheckCircle, AlertCircle, Loader2, Download, Eye, ExternalLink
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import MyMarksLayout from './MyMarksLayout';

export default function SSAAssignmentPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [examId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/academic-v2/ssa/student/assignment/${examId}/`);
      if (!res.ok) throw new Error('Failed to fetch assignment');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !examId) return;

    if (!window.confirm('Are you sure you want to submit this file? This action might not be reversible.')) return;

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetchWithAuth(`/api/academic-v2/ssa/student/assignment/${examId}/submit/`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to submit assignment');
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <MyMarksLayout activeTab="courses" title="Loading Assignment" showBack>
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      </MyMarksLayout>
    );
  }

  if (error || !data) {
    return (
      <MyMarksLayout activeTab="courses" title="Error" showBack>
        <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2"><AlertCircle className="h-5 w-5" />{error || 'Not found'}</div>
      </MyMarksLayout>
    );
  }

  // API returns a flat object — map fields explicitly
  const assignment = {
    assignment_type: data.assignment_type,
    course_code: data.course_code,
    course_name: data.course_name,
    faculty_name: data.faculty_name,
    max_marks: data.max_marks,
    rubric_url: data.rubric_file_url,
    first_page_url: data.first_page_file_url,
    topic_url: data.student_topic_file_url,
  };
  const submission = data.submission_id
    ? {
        submission_status: data.submission_status,
        submitted_at: data.submitted_at,
        marks: data.marks,
        feedback: data.feedback,
        generated_file_url: data.generated_file_url || null,
      }
    : null;
  const isSubmitted = !!submission;

  return (
    <MyMarksLayout activeTab="courses" title={`SSA Assignment — ${assignment.assignment_type}`} subtitle={`${assignment.course_code} - ${assignment.course_name}`} showBack>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Assignment Details & Submission */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Submission Status</h2>
            </div>
            <div className="p-6">
              {isSubmitted ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {submission.submission_status === 'EVALUATED' ? (
                      <CheckCircle className="h-8 w-8 text-green-500" />
                    ) : (
                      <CheckCircle className="h-8 w-8 text-blue-500" />
                    )}
                    <div>
                      <p className="font-bold text-lg text-gray-900">
                        {submission.submission_status === 'EVALUATED' ? 'Evaluated' : 'Submitted'}
                      </p>
                      <p className="text-sm text-gray-500">Submitted on {new Date(submission.submitted_at).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  {submission.submission_status === 'EVALUATED' && (
                    <div className="bg-green-50 rounded-lg p-4 mt-4 border border-green-100">
                      <p className="text-sm text-green-800 font-medium uppercase tracking-wide mb-1">Marks Awarded</p>
                      <p className="text-3xl font-black text-green-700">{submission.marks} <span className="text-lg font-medium text-green-600">/ {assignment.max_marks}</span></p>
                      {submission.feedback && (
                        <div className="mt-3 text-sm text-green-900 bg-green-100/50 p-3 rounded-md">
                          <span className="font-semibold block mb-1">Feedback:</span>
                          {submission.feedback}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <a href={submission.generated_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-800 bg-indigo-50 px-4 py-2 rounded-lg">
                      <ExternalLink className="h-4 w-4" /> View Your Submission
                    </a>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-amber-800">Not Submitted Yet</h4>
                      <p className="text-sm text-amber-700 mt-1">Please combine your work into a single PDF file and upload it here.</p>
                    </div>
                  </div>

                  <label className="block w-full cursor-pointer bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-100 transition-colors">
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                    <span className="block text-sm font-medium text-gray-700 mb-1">Click to select PDF file</span>
                    <span className="block text-xs text-gray-500">Only .pdf files are accepted</span>
                    <input type="file" className="hidden" accept=".pdf,application/pdf" onChange={(e) => { if(e.target.files?.[0]) setFile(e.target.files[0]) }} />
                  </label>

                  {file && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex justify-between items-center">
                      <div className="flex items-center gap-3 truncate">
                        <FileText className="h-6 w-6 text-indigo-600 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-indigo-900 truncate">{file.name}</p>
                          <p className="text-xs text-indigo-700">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => window.open(URL.createObjectURL(file), '_blank')} className="text-indigo-700 hover:bg-indigo-100 p-2 rounded-lg text-sm font-medium flex items-center gap-1">
                          <Eye className="h-4 w-4" /> Preview
                        </button>
                      </div>
                    </div>
                  )}

                  <button type="submit" disabled={!file || submitting} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center gap-2 transition-colors">
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                    Submit Assignment
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Resources */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <h3 className="font-bold text-gray-900">Assignment Resources</h3>
            </div>
            <div className="p-4 space-y-3">
              <ResourceLink title="Evaluation Rubrics" url={assignment.rubric_url} />
              <ResourceLink title="First Page Template" url={assignment.first_page_url} />
              <ResourceLink title="Student Topic List" url={assignment.topic_url} />
            </div>
          </div>
        </div>

      </div>
    </MyMarksLayout>
  );
}

function ResourceLink({ title, url }: { title: string, url?: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-gray-400 group-hover:text-indigo-600" />
        <span className="text-sm font-medium text-gray-700 group-hover:text-indigo-900">{title}</span>
      </div>
      <Download className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" />
    </a>
  );
}
