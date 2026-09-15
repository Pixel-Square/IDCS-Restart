import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Download
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface SSAAssignState {
  exists: boolean;
  assignment: any | null;
  exam_info: {
    exam_id: string;
    exam_type: string;
    course_code: string;
    course_name: string;
    faculty_name: string;
    section_name: string;
    semester: number;
    max_marks: number;
  } | null;
}

export default function SSAAssignPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SSAAssignState | null>(null);

  const [rubricsFile, setRubricsFile] = useState<File | null>(null);
  const [topicFile, setTopicFile] = useState<File | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    fetchData();
  }, [examId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/academic-v2/ssa/assignment/${examId}/`);
      if (!res.ok) throw new Error('Failed to fetch assignment details');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examId) return;
    
    const formData = new FormData();
    if (rubricsFile) formData.append('rubric_file', rubricsFile);
    if (topicFile) formData.append('student_topic_file', topicFile);

    try {
      setSaving(true);
      const res = await fetchWithAuth(`/api/academic-v2/ssa/assignment/${examId}/`, {
        method: 'POST',
        body: formData, // fetchWithAuth will omit Content-Type for FormData
      });
      if (!res.ok) throw new Error('Failed to save assignment files');
      await fetchData();
      setRubricsFile(null);
      setTopicFile(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    const hasUnsavedFiles = rubricsFile || topicFile;
    if (!window.confirm(`Are you sure you want to finalize this assignment?${hasUnsavedFiles ? ' This will upload your selected files first.' : ''} Students will be able to see it.`)) return;
    
    try {
      setFinalizing(true);
      
      // Auto-upload if there are pending files
      if (hasUnsavedFiles) {
        const formData = new FormData();
        if (rubricsFile) formData.append('rubric_file', rubricsFile);
        if (topicFile) formData.append('student_topic_file', topicFile);

        const uploadRes = await fetchWithAuth(`/api/academic-v2/ssa/assignment/${examId}/`, {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) throw new Error('Failed to save assignment files before finalizing');
      }

      const res = await fetchWithAuth(`/api/academic-v2/ssa/assignment/${examId}/finalize/`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to finalize assignment');
      
      await fetchData();
      setRubricsFile(null);
      setTopicFile(null);
    } catch (err: any) {
      setError(err.message || 'Failed to finalize');
    } finally {
      setFinalizing(false);
    }
  };

  const [showTopicModal, setShowTopicModal] = useState(false);
  const [numTopics, setNumTopics] = useState(1);

  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const res = await fetchWithAuth(`/api/academic-v2/ssa/assignment/${examId}/topic-template/?num_topics=${numTopics}`);
      if (!res.ok) throw new Error('Failed to download template');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student_topics_template_${data?.exam_info?.course_code || 'assignment'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setShowTopicModal(false);
    } catch (err: any) {
      alert(err.message || 'An error occurred during download');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 m-4"><AlertCircle className="h-5 w-5" />{error}</div>;
  if (!data || !data.exam_info) return null;

  const { exam_info, assignment } = data;
  const isFinalized = assignment?.finalized_at != null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 relative">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-6 font-medium">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">SSA Assignment — {exam_info.exam_type}</h1>
          {isFinalized && <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Finalized</span>}
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-gray-500">Course Code</p><p className="font-semibold">{exam_info.course_code}</p></div>
          <div><p className="text-gray-500">Course Name</p><p className="font-semibold">{exam_info.course_name}</p></div>
          <div><p className="text-gray-500">Faculty</p><p className="font-semibold">{exam_info.faculty_name}</p></div>
          <div><p className="text-gray-500">Section</p><p className="font-semibold">{exam_info.section_name}</p></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Assignment Files</h2>
        
        <form onSubmit={handleFileUpload} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FileUploadCard title="Rubrics" file={rubricsFile} setFile={setRubricsFile} existingUrl={assignment?.rubric_file_url} isFinalized={isFinalized} />
            <FileUploadCard title="Student Topic" file={topicFile} setFile={setTopicFile} existingUrl={assignment?.student_topic_file_url} isFinalized={isFinalized} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onDownloadTemplate={() => setShowTopicModal(true)} />
          </div>

          {!isFinalized && (
            <div className="flex justify-end gap-3 mt-6 border-t pt-4">
              <button type="submit" disabled={saving || (!rubricsFile && !topicFile)} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload Files
              </button>
              <button type="button" onClick={handleFinalize} disabled={finalizing || !(assignment?.rubric_file_url || rubricsFile) || !(assignment?.student_topic_file_url || topicFile)} className="px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Finalize Assignment
              </button>
            </div>
          )}
        </form>
      </div>

      {showTopicModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Download Topic Template</h3>
              <button onClick={() => setShowTopicModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">How many topics per student?</label>
              <input type="number" min={1} max={10} value={numTopics} onChange={(e) => setNumTopics(Number(e.target.value) || 1)} className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border" />
              <p className="text-xs text-gray-500 mt-2">This will generate an Excel template with the corresponding number of topic columns for each student in this section.</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setShowTopicModal(false)} disabled={downloadingTemplate} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleDownloadTemplate} disabled={downloadingTemplate} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50">
                {downloadingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} 
                {downloadingTemplate ? 'Downloading...' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileUploadCard({ title, file, setFile, existingUrl, isFinalized, accept = ".pdf,application/pdf", onDownloadTemplate }: { title: string, file: File | null, setFile: (f: File | null) => void, existingUrl?: string, isFinalized?: boolean, accept?: string, onDownloadTemplate?: () => void }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 flex flex-col items-center text-center h-full">
      <h3 className="font-medium text-gray-900 mb-2">{title}</h3>
      {existingUrl && (
        <a href={existingUrl} target="_blank" rel="noreferrer" className={`text-indigo-600 hover:underline flex items-center gap-1 ${isFinalized ? 'text-sm font-medium bg-indigo-50 px-4 py-2 rounded-lg mt-2' : 'text-xs mb-3'}`}>
          {isFinalized ? <FileText className="h-4 w-4" /> : <Download className="h-3 w-3" />} View Document
        </a>
      )}
      {!isFinalized && (
        file ? (
          <div className="w-full bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex justify-between items-center text-sm mt-auto">
            <div className="truncate flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600 flex-shrink-0" /><span className="truncate">{file.name}</span></div>
            <button type="button" onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <div className="w-full mt-auto flex flex-col gap-2">
            {onDownloadTemplate && (
              <button type="button" onClick={onDownloadTemplate} className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2">
                <Download className="h-4 w-4" /> Template
              </button>
            )}
            <label className="w-full cursor-pointer bg-gray-50 border border-dashed border-gray-300 rounded-lg py-6 flex flex-col items-center hover:bg-gray-100 transition-colors">
              <Upload className="h-6 w-6 text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">Click to select file</span>
              <input type="file" className="hidden" accept={accept} onChange={(e) => { if(e.target.files?.[0]) setFile(e.target.files[0]) }} />
            </label>
          </div>
        )
      )}
    </div>
  );
}
