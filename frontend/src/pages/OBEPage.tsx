import React, { useEffect, useMemo, useState } from 'react';

import CDAPPage from './CDAPPage';
import ArticulationMatrixPage from './ArticulationMatrixPage';
import MarkEntryPage from './MarkEntryPage';
// import LcaInstructionsPage from './LcaInstructionsPage';
import '../styles/obe-theme.css';

// OBE/marks/COAttainment fetch and types removed
import { getMe } from '../services/auth';
import { fetchMyTeachingAssignments, TeachingAssignmentItem } from '../services/obe';

function apiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return String(fromEnv).replace(/\/+$/, '');

  // Default to same-origin so `/api/...` works behind nginx/proxy setups.
  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = String(window.location.hostname || '').trim().toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000';
    return String(window.location.origin).replace(/\/+$/, '');
  }

  return 'https://db.krgi.co.in';
}

const API_BASE = apiBase();
const PRIMARY_API_BASE = API_BASE;
const FALLBACK_API_BASE = 'http://localhost:8000';

async function fetchWithFallback(url, options) {
  try {
    const res = await fetch(`${PRIMARY_API_BASE}${url}`, options);
    if (!res.ok) throw new Error('Primary failed');
    return res;
  } catch (e) {
    // Only attempt the http://localhost fallback when the frontend itself
    // is running on a localhost host. Browsers block requests from secure
    // public origins to loopback/private addresses (Private Network Access),
    // so avoid hitting the fallback when served from https production sites.
    if (typeof window !== 'undefined') {
      const h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1') {
        const res = await fetch(`${FALLBACK_API_BASE}${url}`, options);
        return res;
      }
    }
    throw e;
  }
}

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Me = {
  id?: number;
  username?: string;
  faculty_id?: string | number;
  staff_id?: string | number;
  employee_id?: string | number;
};

type ParsedQuestion = {
  question_text: string;
  type?: string | null;
  options?: any[] | null;
  images?: any[] | null;
  correct_answer?: string | null;
  answer_text?: string | null;
  btl?: number | string | null;
  marks?: number | string | null;
  chapter?: string | null;
  course_outcomes?: string | null;
  course_outcomes_numbers?: string | null;
  excel_type?: string | null;
  course_code?: string | null;
  course_name?: string | null;
  semester?: string | null;
  source_file_path?: string | null;
};

type OBEItem = {
  id: number;
  course: string;
  outcome: string;
  assessment: string;
  target: string;
  achieved: string;
};

type TabKey = 'courses' | 'exam';

export default function OBEPage(): JSX.Element {
  const [data, setData] = useState<OBEItem[]>([]);

  // OBE/marks/COAttainment UI removed
  const [activeTab, setActiveTab] = useState<TabKey>('courses');

  const [me, setMe] = useState<Me | null>(null);

  const [assignments, setAssignments] = useState<TeachingAssignmentItem[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Import wizard state (Exam Management)
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scannedQuestions, setScannedQuestions] = useState<ParsedQuestion[]>([]);
  const [uploadedDocxPath, setUploadedDocxPath] = useState<string | null>(null);

  const [examName, setExamName] = useState('');
  // examAssessment: CIA1/CIA2/MODEL/ESE
  const [examAssessment, setExamAssessment] = useState('');
  // examType: QP1/QP2 (named by UI as 'Exam Type')
  const [examType, setExamType] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examSections, setExamSections] = useState('');

  const [importingToBank, setImportingToBank] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; failed?: Array<{ index: number; error: string }> } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [recentImports, setRecentImports] = useState<Array<any>>([]);
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [selectedRecentIndex, setSelectedRecentIndex] = useState<number>(0);
  const [uploadedFiles, setUploadedFiles] = useState<Array<any>>([]);
  const [previewUpload, setPreviewUpload] = useState<any | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[] | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  function normalizeImageSrc(img: any): string | null {
    try {
      if (typeof img === 'string') {
        let src = img;
        // plain base64 without data: prefix (heuristic)
        if (!src.startsWith('data:') && /^[A-Za-z0-9+/=\n\r]+$/.test(src) && src.length > 100) {
          src = `data:image/png;base64,${src.replace(/\s+/g, '')}`;
        }
        return src;
      }
      if (img && typeof img === 'object') {
        if (typeof img.url === 'string' && img.url) return img.url;
        if (typeof img.base64 === 'string' && img.base64) {
          return img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`;
        }
        if (img.binary && img.binary instanceof Uint8Array) {
          const blob = new Blob([img.binary], { type: 'image/png' });
          return URL.createObjectURL(blob);
        }
      }
      if (img instanceof Uint8Array) {
        const blob = new Blob([img as any], { type: 'image/png' });
        return URL.createObjectURL(blob);
      }
      return null;
    } catch {
      return null;
    }
  }

  // OBE/marks/COAttainment effect removed

  useEffect(() => {
    // Fetch current user for Faculty ID display
    getMe()
      .then((u) => setMe(u as Me))
      .catch(() => setMe(null));

    // load teaching assignments (non-blocking; 401 treated as empty)
    (async () => {
      try {
        setLoadingAssignments(true);
        const r = await fetchMyTeachingAssignments();
        if (Array.isArray(r)) setAssignments(r);
      } catch (e) {
        // ignore errors here to avoid blocking UI
        console.warn('Failed to load teaching assignments', e);
        setAssignments([]);
      } finally {
        setLoadingAssignments(false);
      }
    })();

    // load uploaded files list for the uploads folder (used when no recents)
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/obe/list-uploads`, { headers: { ...authHeaders() } });
        if (!res.ok) return;
        const js = await res.json();
        if (Array.isArray(js?.files)) setUploadedFiles(js.files || []);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const facultyId = useMemo(() => {
    if (!me) return null;
    return me.faculty_id ?? me.staff_id ?? me.employee_id ?? me.id ?? null;
  }, [me]);


  // OBE/marks/COAttainment course selection removed
  const selectedCourse = null;

 

  const parsePercent = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const navigateToCourse = (code: string) => {
    // navigate to a course-specific OBE page; adjust path if your router differs
    const path = `/obe/course/${encodeURIComponent(code)}`;
    window.location.href = path;
  };

  const visibleQuestions = useMemo(() => {
    return (scannedQuestions || []).filter((q) => {
      const marks = String((q as any)?.marks ?? '').trim().toUpperCase();
      const btl = String((q as any)?.btl ?? '').trim().toUpperCase();
      const co = String((q as any)?.course_outcomes ?? '').trim().toUpperCase();
      return !(marks === '(OR)' && btl === '(OR)' && co === '(OR)');
    });
  }, [scannedQuestions]);

  const [examUploadStatus, setExamUploadStatus] = useState<'idle'|'uploading'|'success'|'error'>('idle');
  const [examUploadMessage, setExamUploadMessage] = useState<string | null>(null);

  async function handleExamUploadFile(f: File) {
    setExamUploadStatus('uploading');
    setExamUploadMessage(null);
    setScanStatus('idle');
    setScanMessage(null);
    setImportResult(null);
    setImportError(null);
    const fd = new FormData();
    fd.append('file', f);
    try {
      // 1) Upload docx (store it)
      const res = await fetch(`${API_BASE}/api/obe/upload-docx`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
        },
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        setExamUploadStatus('error');
        setExamUploadMessage(txt || `Upload failed (${res.status})`);
        return;
      }
      const json = await res.json();
      setExamUploadStatus('success');

      const savedPath = (json?.file_url || json?.saved_path || '') as string;
      setUploadedDocxPath(savedPath || null);
      setExamUploadMessage(`Uploaded: ${savedPath}`);

      // Open wizard immediately (scan continues in background)
      setImportWizardOpen(true);
      setWizardStep(1);
      setScannedQuestions([]);

      // 2) Scan docx into questions and open wizard
      setScanStatus('scanning');
      setScanMessage('Scanning DOCX…');

      const scanFd = new FormData();
      scanFd.append('file', f);

      const scanRes = await fetch(`${API_BASE}/api/template/scan-docx`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
        },
        body: scanFd,
      });

      if (!scanRes.ok) {
        const txt = await scanRes.text();
        setScanStatus('error');
        setScanMessage(txt || `Scan failed (${scanRes.status})`);
        setScannedQuestions([]);
        return;
      }

      const scanJson = await scanRes.json();
      const qs = Array.isArray(scanJson?.questions) ? (scanJson.questions as ParsedQuestion[]) : [];

      // attach source file path on each question for traceability
      const withSource = qs.map((q) => ({ ...q, source_file_path: savedPath || q.source_file_path || null }));
      setScannedQuestions(withSource);
      setScanStatus('success');
      setScanMessage(`Scanned ${withSource.length} question(s).`);

      // Prefill exam name from filename if empty
      if (!examName.trim()) {
        const name = f.name.replace(/\.docx$/i, '');
        setExamName(name);
      }

    } catch (e: any) {
      setExamUploadStatus('error');
      setExamUploadMessage(e?.message || 'Upload failed');
      setScanStatus('error');
      setScanMessage(e?.message || 'Scan failed');
    }
  }

  function closeWizard() {
    setImportWizardOpen(false);
    setWizardStep(1);
  }

  async function handleConfirmImport() {
    if (!examName.trim()) {
      setImportError('Exam name is required.');
      setWizardStep(2);
      return;
    }
    if (!examType.trim()) {
      setImportError('Exam type is required.');
      setWizardStep(2);
      return;
    }
    if (!examDate.trim()) {
      setImportError('Exam date is required.');
      setWizardStep(2);
      return;
    }

    setImportingToBank(true);
    setImportError(null);
    setImportResult(null);

    try {
      const sectionsList = examSections
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      // Put exam meta on each question (non-breaking for backend)
      const payloadQuestions = visibleQuestions.map((q) => ({
        ...q,
        excel_type: q.excel_type || examType,
        source_file_path: q.source_file_path || uploadedDocxPath || null,
      }));

      const res = await fetch(`${API_BASE}/api/import/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          title: examName.trim(),
          status: 'pending',
          exam_type: examType.trim(),
          exam_date: examDate.trim(),
          sections: sectionsList,
          faculty_id: facultyId,
          questions: payloadQuestions,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        setImportError(txt || `Import failed (${res.status})`);
        return;
      }

      const json = await res.json();
      setImportResult(json);
      // add to local recents and show popup
      const newItem = {
        title: examName.trim(),
        inserted: json.inserted || 0,
        failed: Array.isArray(json.failed) ? json.failed.length : 0,
        source_file_path: uploadedDocxPath || null,
        title_id: json.title_id || null,
        exam_date: examDate || null,
        exam_type: examType || null,
        faculty_id: facultyId || null,
        created_at: new Date().toISOString(),
      };
      setRecentImports((r) => [newItem, ...r]);
      setShowImportPopup(true);
      setTimeout(() => setShowImportPopup(false), 4000);
      // close the wizard after successful import
      setTimeout(() => closeWizard(), 600);
    } catch (e: any) {
      setImportError(e?.message || 'Import failed');
    } finally {
      setImportingToBank(false);
    }
  }

  const totalItems = data.length;
  const averageAchievement = totalItems
    ? (data.reduce((sum, it) => sum + parsePercent(it.achieved), 0) / totalItems).toFixed(1) + '%'
    : 'N/A';

      return (
        <main className="obe-page" style={{ padding: '32px 48px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
          <header style={{ marginBottom: 32, background: '#fff', padding: '28px 32px', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
              <div style={{ textAlign: 'left' }}>
                <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  Outcome Based Education (OBE)
                </h1>
                {/* OBE/marks/COAttainment course header removed */}
                <div style={{ marginTop: 8, color: '#64748b', fontSize: 16, fontWeight: 400 }}>
                  Select a course, then work through CDAP, Articulation Matrix and Mark Entry.
                </div>
              </div>
            </div>
          </header>
              {/* Tabs header */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: '#fff', padding: '8px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <button
                  onClick={() => setActiveTab('courses')}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeTab === 'courses' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                    color: activeTab === 'courses' ? '#fff' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: activeTab === 'courses' ? 600 : 500,
                    fontSize: 15,
                    transition: 'all 0.2s ease',
                    boxShadow: activeTab === 'courses' ? '0 2px 8px rgba(37,99,235,0.2)' : 'none'
                  }}
                >
                  📚 Courses
                </button>
                <button
                  onClick={() => setActiveTab('exam')}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeTab === 'exam' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                    color: activeTab === 'exam' ? '#fff' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: activeTab === 'exam' ? 600 : 500,
                    fontSize: 15,
                    transition: 'all 0.2s ease',
                    boxShadow: activeTab === 'exam' ? '0 2px 8px rgba(37,99,235,0.2)' : 'none'
                  }}
                >
                  📝 Exam Management
                </button>
              </div>

              {/* Courses tab content */}
              {activeTab === 'courses' && (
                <section
                  aria-label="Course selector"
                  style={{ marginBottom: 32 }}
                >
                  <div style={{ fontSize: 14, color: '#475569', marginBottom: 20, fontWeight: 500 }}>Select a course to work on:</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      gap: 24,
                      marginBottom: 32,
                    }}
                  >
                    {/* Course list: show assignments when available (safe fetch) */}
                    {loadingAssignments ? (
                      <div style={{ gridColumn: '1/-1', color: '#64748b', fontSize: 16, textAlign: 'center', padding: 60, background: '#fff', borderRadius: 12 }}>⏳ Loading courses…</div>
                    ) : assignments.length === 0 ? (
                      <div style={{ gridColumn: '1/-1', color: '#94a3b8', fontSize: 18, textAlign: 'center', padding: 60, background: '#fff', borderRadius: 12, border: '2px dashed #e2e8f0' }}>
                        📭 No courses found. You have no teaching assignments.<br />
                        <span style={{ fontSize: 14, marginTop: 12, display: 'block' }}>(If you expect to see courses here, please check with your backend/API or contact admin.)</span>
                      </div>
                    ) : (
                      assignments
                        .reduce((acc: TeachingAssignmentItem[], it) => {
                          if (!acc.some(a => a.subject_code === it.subject_code)) acc.push(it);
                          return acc;
                        }, [] as TeachingAssignmentItem[])
                        .map((it) => (
                          <div
                            key={it.subject_code}
                            onClick={() => navigateToCourse(it.subject_code)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') navigateToCourse(it.subject_code); }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                            style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: 12,
                              padding: 24,
                              background: '#fff',
                              boxShadow: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              minHeight: 140,
                              position: 'relative',
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 6, color: '#0f172a', lineHeight: 1.3 }}>{it.subject_name}</div>
                            <div style={{ fontSize: 14, color: '#3b82f6', marginBottom: 16, fontWeight: 600, background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>{it.subject_code}</div>
                            <div style={{ marginTop: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigateToCourse(it.subject_code); }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'; e.currentTarget.style.transform = 'scale(1)'; }}
                                style={{
                                  padding: '8px 18px',
                                  borderRadius: 8,
                                  border: 'none',
                                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                  color: '#fff',
                                  fontWeight: 600,
                                  fontSize: 14,
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                Open Course
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation(); window.location.href = `/obe/course/${encodeURIComponent(it.subject_code)}/lca`; }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                style={{
                                  padding: '8px 14px',
                                  borderRadius: 8,
                                  border: '1px solid #e2e8f0',
                                  background: '#fff',
                                  color: '#475569',
                                  fontWeight: 600,
                                  fontSize: 13,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                LCA
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation(); window.location.href = `/obe/course/${encodeURIComponent(it.subject_code)}/co_attainment`; }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                style={{
                                  padding: '8px 14px',
                                  borderRadius: 8,
                                  border: '1px solid #e2e8f0',
                                  background: '#fff',
                                  color: '#475569',
                                  fontWeight: 600,
                                  fontSize: 13,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                CO
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>

                  {/* OBE/marks/COAttainment error display removed */}
                </section>
              )}

              {/* Exam Management tab (placeholder) */}
              {activeTab === 'exam' && (
                <section aria-label="Exam management" style={{ background: '#fff', padding: 28, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Upload area */}
                    <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '2px dashed #cbd5e1' }}>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <input
                          id="exam-upload-input"
                          type="file"
                          accept=".docx"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files && e.target.files[0];
                            if (f) {
                              handleExamUploadFile(f);
                            }
                            // allow re-uploading the same file
                            e.currentTarget.value = '';
                          }}
                        />
                        <label htmlFor="exam-upload-input" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 15, boxShadow: '0 2px 8px rgba(37,99,235,0.25)', transition: 'all 0.2s ease' }}>
                          {examUploadStatus === 'uploading' ? '⏳ Uploading...' : '📤 Upload .docx'}
                        </label>

                        <div style={{ color: '#64748b', fontSize: 14 }}>
                          Upload exam spreadsheets or related files here.
                        </div>
                      </div>
                    </div>

                    {/* Search bar */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <input
                        type="search"
                        placeholder="🔍 Search exams, courses, entries..."
                        style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 15, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                        onChange={() => { /* TODO: wire search */ }}
                      />
                      <button style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#475569', transition: 'all 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Search</button>
                    </div>

                    {/* Recent uploads */}
                    <div style={{ marginTop: 8 }}>
                      <h3 style={{ margin: '12px 0 16px 0', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>📋 Recent</h3>
                      {recentImports.length === 0 ? (
                        <div style={{ color: '#666' }}>
                          {/* No recents: show all uploaded DOCX files for this faculty */}
                          <div style={{ marginBottom: 8, fontSize: 13 }}>Uploaded DOCX files</div>
                          {uploadedFiles.length === 0 ? (
                            <div style={{ color: '#666' }}>No uploaded DOCX files found.</div>
                          ) : (
                            <div style={{ display: 'grid', gap: 8 }}>
                              {uploadedFiles.map((f, i) => (
                                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontWeight: 700 }}>{f.name}</div>
                                      <div style={{ fontSize: 12, color: '#6b7280' }}>{f.path}</div>
                                    </div>
                                    <div>
                                      <button onClick={() => setPreviewUpload(f)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 6 }}>Open</button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {recentImports.slice(0, 12).map((it, idx) => {
                              const selected = idx === selectedRecentIndex;
                              return (
                                <div key={idx} onClick={() => setSelectedRecentIndex(idx)} role="button" tabIndex={0}
                                  style={{ border: selected ? '2px solid #2563eb' : '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                                        <path d="M6 2h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="#e6f0ff" stroke="#2563eb" strokeWidth="0.5" />
                                        <path d="M13 2v6h6" fill="#fff" />
                                        <rect x="7" y="11" width="10" height="2.2" rx="0.6" fill="#2563eb" />
                                        <rect x="7" y="14" width="6" height="2.2" rx="0.6" fill="#2563eb" />
                                        <text x="7" y="18.8" fontSize="2.8" fill="#2563eb" fontFamily="Arial, Helvetica, sans-serif">DOCX</text>
                                      </svg>
                                      <div style={{ fontWeight: 700 }}>{it.title}</div>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>{it.exam_type || '—'} • {it.exam_date || '—'}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 800, color: '#16a34a' }}>{it.inserted}</div>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>questions</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div>
                            {/* Preview pane: show Step 3 style confirmation for selected recent */}
                            {recentImports[selectedRecentIndex] && (
                              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
                                  <div>
                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <div style={{ width: 64, height: 64, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6b7280' }}>
                                          {me?.username ? String(me.username).slice(0,1).toUpperCase() : 'U'}
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{me?.username || '—'}</div>
                                          <div style={{ fontSize: 13, color: '#6b7280' }}>Faculty</div>
                                          <div style={{ fontSize: 13, color: '#6b7280' }}>—</div>
                                        </div>
                                      </div>
                                      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Faculty ID: <strong style={{ color: '#111827' }}>{facultyId ?? '—'}</strong></div>
                                    </div>

                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Course details</div>
                                      <div style={{ fontWeight: 700 }}>—</div>
                                      <div style={{ fontSize: 13, color: '#6b7280' }}>—</div>
                                      <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>Assignments: <strong style={{ color: '#111827' }}>—</strong></div>
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                        <div>
                                          <div style={{ fontSize: 12, color: '#6b7280' }}>Questions imported</div>
                                          <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>{recentImports[selectedRecentIndex].inserted}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                          <div style={{ fontSize: 12, color: '#6b7280' }}>Title</div>
                                          <div style={{ fontWeight: 700 }}>{recentImports[selectedRecentIndex].title || '—'}</div>
                                          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Assessment</div>
                                          <div style={{ fontWeight: 700 }}>{recentImports[selectedRecentIndex].exam_type || '—'}</div>
                                        </div>
                                      </div>

                                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam Type</span><div style={{ fontWeight: 700 }}>{recentImports[selectedRecentIndex].exam_type || '—'}</div></div>
                                        <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam date</span><div style={{ fontWeight: 700 }}>{recentImports[selectedRecentIndex].exam_date || '—'}</div></div>
                                        <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#6b7280', fontSize: 12 }}>Uploaded file</span><div style={{ fontWeight: 700, whiteSpace: 'pre-wrap' }}>{recentImports[selectedRecentIndex].source_file_path || '—'}</div></div>
                                      </div>
                                    </div>

                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div style={{ fontSize: 13, color: '#6b7280' }}>Questions preview</div>
                                        <div>
                                          <button
                                            onClick={async () => {
                                              setPreviewQuestions(null);
                                              try {
                                                // try title_id first
                                                const tid = recentImports[selectedRecentIndex]?.title_id;
                                                let url = '';
                                                if (tid) url = `${API_BASE}/api/import/questions/list?title_id=${tid}`;
                                                else url = `${API_BASE}/api/import/questions/list?title=${encodeURIComponent(recentImports[selectedRecentIndex]?.title || '')}`;
                                                const resp = await fetch(url, { headers: { ...authHeaders() } });
                                                if (!resp.ok) {
                                                  setPreviewQuestions([]);
                                                  return;
                                                }
                                                const js = await resp.json();
                                                setPreviewQuestions(Array.isArray(js?.questions) ? js.questions : []);
                                              } catch (e) {
                                                setPreviewQuestions([]);
                                              }
                                            }}
                                            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
                                          >
                                            Load questions
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ maxHeight: 220, overflow: 'auto' }}>
                                        {previewQuestions === null ? (
                                          <div style={{ color: '#6b7280' }}>Click "Load questions" to fetch saved questions for this import.</div>
                                        ) : previewQuestions.length === 0 ? (
                                          <div style={{ color: '#6b7280' }}>No saved questions found for this title.</div>
                                        ) : (
                                          previewQuestions.slice(0, 20).map((q, i) => (
                                            <div key={i} style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                                              <div style={{ fontWeight: 700, color: '#111827' }}>{i+1}.</div>
                                              <div style={{ color: '#111827' }}>{String(q.question_text).slice(0, 300)}</div>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {examUploadMessage && (
                      <div style={{ marginTop: 12, fontSize: 14, color: examUploadStatus === 'error' ? '#dc2626' : '#16a34a', background: examUploadStatus === 'error' ? '#fef2f2' : '#f0fdf4', padding: '12px 16px', borderRadius: 10, border: `1px solid ${examUploadStatus === 'error' ? '#fecaca' : '#bbf7d0'}` }}>{examUploadMessage}</div>
                    )}
                  </div>
                </section>
              )}

              {/* Question Import Wizard Modal */}
              {importWizardOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  onClick={closeWizard}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 50,
                    padding: 20,
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 'min(1000px, 100%)',
                      background: '#fff',
                      borderRadius: 16,
                      boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                      overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 20, color: '#0f172a' }}>📥 Question Import</div>
                        <div style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
                          Step {wizardStep} of 3 • {scanStatus === 'scanning' ? 'Scanning…' : scanStatus === 'error' ? 'Scan failed' : 'Ready'}
                        </div>
                      </div>
                      <button
                        onClick={closeWizard}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                        style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#64748b', transition: 'all 0.2s ease' }}
                      >
                        ✕ Close
                      </button>
                    </div>

                    {/* sliding pages */}
                    <div style={{ overflow: 'hidden', background: '#fafbfc' }}>
                      <div
                        style={{
                          display: 'flex',
                          width: '300%',
                          transform: `translateX(-${(wizardStep - 1) * 33.3333333}%)`,
                          transition: 'transform 360ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        {/* Step 1: Preview */}
                        <div style={{ width: '33.3333333%', padding: 24 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 18, color: '#0f172a' }}>🔍 Preview</div>
                              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                                {uploadedDocxPath ? `Source: ${uploadedDocxPath}` : 'Source: (not available)'}
                              </div>
                            </div>
                            <div style={{ fontSize: 14, color: '#0f172a', background: '#eff6ff', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
                              Questions: <b style={{ color: '#3b82f6' }}>{visibleQuestions.length}</b>
                            </div>
                          </div>

                          {scanMessage && (
                            <div style={{ marginBottom: 12, fontSize: 14, color: scanStatus === 'error' ? '#dc2626' : '#16a34a', background: scanStatus === 'error' ? '#fef2f2' : '#f0fdf4', padding: '12px 16px', borderRadius: 10, border: `1px solid ${scanStatus === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
                              {scanMessage}
                            </div>
                          )}

                          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, maxHeight: 420, overflow: 'auto', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                            {scanStatus === 'scanning' && (
                              <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>⏳ Scanning your DOCX…</div>
                            )}
                            {scanStatus !== 'scanning' && visibleQuestions.length === 0 && (
                              <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>📄 No questions to preview yet.</div>
                            )}
                            {visibleQuestions.map((q, idx) => (
                              <div key={idx} style={{ padding: '14px 12px', borderBottom: idx < visibleQuestions.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                                  <div style={{ fontWeight: 700, color: '#3b82f6', fontSize: 15, background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>Q{idx + 1}</div>
                                  <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', padding: '4px 10px', borderRadius: 6 }}>
                                    Marks: {String((q as any)?.marks ?? '-')}{' '}
                                    • BTL: {String((q as any)?.btl ?? '-')}{' '}
                                    • CO: {String((q as any)?.course_outcomes ?? '-')}
                                  </div>
                                </div>
                                <div style={{ marginTop: 8, color: '#1e293b', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>
                                  {String((q as any)?.question_text ?? '').slice(0, 500)}
                                  {String((q as any)?.question_text ?? '').length > 500 ? '…' : ''}
                                </div>

                                {Array.isArray((q as any)?.images) && (q as any).images.length ? (
                                  <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {(q as any).images.slice(0, 4).map((img: any, i: number) => {
                                      const src = normalizeImageSrc(img);
                                      if (!src) return null;
                                      return (
                                        <img
                                          key={i}
                                          src={src}
                                          alt={`q${idx + 1}-img${i + 1}`}
                                          onClick={() => setLightboxSrc(src)}
                                          style={{ maxHeight: 140, borderRadius: 10, border: '2px solid #e2e8f0', cursor: 'pointer', objectFit: 'contain', background: '#fff', transition: 'all 0.2s ease', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}
                                        />
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Step 2: Exam details */}
                        <div style={{ width: '33.3333333%', padding: 24 }}>
                          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 18, color: '#0f172a' }}>📋 Save details</div>
                          {importError && (
                            <div style={{ marginBottom: 12, fontSize: 14, color: '#dc2626', background: '#fef2f2', padding: '12px 16px', borderRadius: 10, border: '1px solid #fecaca' }}>{importError}</div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam name</label>
                              <input
                                value={examName}
                                onChange={(e) => setExamName(e.target.value)}
                                placeholder="e.g., Unit 1 - Introduction"
                                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e6eef8', boxShadow: 'inset 0 1px 2px #00000008' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam (CIA / Model / ESE)</label>
                              <select
                                value={examAssessment}
                                onChange={(e) => setExamAssessment(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e6eef8', background: '#fff' }}
                              >
                                <option value="">Select assessment</option>
                                <option value="CIA1">CIA1</option>
                                <option value="CIA2">CIA2</option>
                                <option value="MODEL">MODEL</option>
                                <option value="ESE">ESE</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam Type</label>
                              <select
                                value={examType}
                                onChange={(e) => setExamType(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e6eef8', background: '#fff' }}
                              >
                                <option value="">Select paper</option>
                                <option value="QP1">QP1</option>
                                <option value="QP2">QP2</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam date</label>
                              <input
                                type="date"
                                value={examDate}
                                onChange={(e) => setExamDate(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e6eef8' }}
                              />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Sections</label>
                              <textarea
                                value={examSections}
                                onChange={(e) => setExamSections(e.target.value)}
                                placeholder="e.g., Part A\nPart B\nSection 1"
                                rows={3}
                                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e6eef8', resize: 'vertical' }}
                              />
                            </div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                            This metadata is shown for confirmation. (Currently, only the exam name is used as the imported “title”.)
                          </div>
                        </div>

                        {/* Step 3: Confirmation */}
                        <div style={{ width: '33.3333333%', padding: 24 }}>
                          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 18, color: '#0f172a' }}>✔️ Confirmation</div>

                          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
                            {/* Left column: Profile card and Course details */}
                            <div>
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                  <div style={{ width: 64, height: 64, borderRadius: 10, background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 24 }}>
                                    {me?.username ? String(me.username).slice(0,1).toUpperCase() : '👤'}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{me?.username || '—'}</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Faculty</div>
                                  </div>
                                </div>
                                <div style={{ marginTop: 12, fontSize: 13, color: '#475569', background: '#f8fafc', padding: '8px 12px', borderRadius: 8 }}>Faculty ID: <strong style={{ color: '#0f172a' }}>{facultyId ?? '—'}</strong></div>
                              </div>

                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10, fontWeight: 600 }}>📚 Course details</div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>—</div>
                                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>—</div>
                                <div style={{ marginTop: 12, fontSize: 13, color: '#475569' }}>Assignments: <strong style={{ color: '#0f172a' }}>—</strong></div>
                              </div>
                            </div>

                            {/* Right column: Exam info + Questions preview */}
                            <div>
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                  <div>
                                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Questions to import</div>
                                    <div style={{ fontSize: 28, fontWeight: 900, color: '#3b82f6', marginTop: 4 }}>{visibleQuestions.length}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Exam name</div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 16, marginTop: 2 }}>{examName || '—'}</div>
                                    <div style={{ marginTop: 8, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Assessment</div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{examAssessment || '—'}</div>
                                  </div>
                                </div>

                                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                                  <div><span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Exam Type</span><div style={{ fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{examType || '—'}</div></div>
                                  <div><span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Exam date</span><div style={{ fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{examDate || '—'}</div></div>
                                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Sections</span><div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'pre-wrap', marginTop: 4 }}>{examSections || '—'}</div></div>
                                </div>
                              </div>

                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 10, fontWeight: 600 }}>📝 Questions preview</div>
                                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                                  {visibleQuestions.slice(0, 10).map((q, i) => (
                                    <div key={i} style={{ padding: '10px 8px', borderBottom: i < Math.min(visibleQuestions.length, 10) - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                      <div style={{ fontWeight: 700, color: '#3b82f6', minWidth: 40, background: '#eff6ff', padding: '4px 8px', borderRadius: 6, textAlign: 'center' }}>{i+1}</div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ color: '#1e293b', fontSize: 14, lineHeight: 1.5 }}>{String(q.question_text).slice(0, 260)}</div>
                                        {Array.isArray(q.images) && q.images.length ? (
                                          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                                            {q.images.slice(0,2).map((im: any, j: number) => {
                                              const src = normalizeImageSrc(im);
                                              if (!src) return null;
                                              return <img key={j} src={src} style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 8, border: '2px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s ease' }} onClick={() => setLightboxSrc(src)} />
                                            })}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {importError && (
                            <div style={{ marginTop: 16, fontSize: 14, color: '#dc2626', background: '#fef2f2', padding: '12px 16px', borderRadius: 10, border: '1px solid #fecaca' }}>❌ {importError}</div>
                          )}
                          {importResult && (
                            <div style={{ marginTop: 16, fontSize: 14, color: '#16a34a', background: '#f0fdf4', padding: '12px 16px', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                              ✅ Imported {importResult.inserted} question(s)
                              {importResult.failed?.length ? `, failed ${importResult.failed.length}.` : '.'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* footer */}
                    <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fafbfc' }}>
                      <button
                        onClick={() => setWizardStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)))}
                        disabled={wizardStep === 1}
                        onMouseEnter={(e) => { if (wizardStep !== 1) e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { if (wizardStep !== 1) e.currentTarget.style.background = '#fff'; }}
                        style={{
                          padding: '10px 18px',
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          background: wizardStep === 1 ? '#f1f5f9' : '#fff',
                          cursor: wizardStep === 1 ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          fontSize: 14,
                          color: wizardStep === 1 ? '#94a3b8' : '#475569',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        ← Back
                      </button>

                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {wizardStep < 3 ? (
                          <button
                            onClick={() => {
                              setImportError(null);
                              if (wizardStep === 2) {
                                if (!examName.trim()) {
                                  setImportError('Exam name is required.');
                                  return;
                                }
                                if (!examType.trim()) {
                                  setImportError('Exam type is required.');
                                  return;
                                }
                                if (!examDate.trim()) {
                                  setImportError('Exam date is required.');
                                  return;
                                }
                              }
                              setWizardStep((s) => ((s + 1) as 1 | 2 | 3));
                            }}
                            disabled={wizardStep === 1 && scanStatus === 'scanning'}
                            onMouseEnter={(e) => { if (!(wizardStep === 1 && scanStatus === 'scanning')) e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'; }}
                            onMouseLeave={(e) => { if (!(wizardStep === 1 && scanStatus === 'scanning')) e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'; }}
                            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15, boxShadow: '0 2px 8px rgba(37,99,235,0.25)', transition: 'all 0.2s ease' }}
                          >
                            Next →
                          </button>
                        ) : (
                          <button
                            onClick={handleConfirmImport}
                            disabled={importingToBank || scanStatus === 'scanning' || visibleQuestions.length === 0}
                            onMouseEnter={(e) => { if (!importingToBank && scanStatus !== 'scanning' && visibleQuestions.length > 0) e.currentTarget.style.background = 'linear-gradient(135deg, #15803d 0%, #166534 100%)'; }}
                            onMouseLeave={(e) => { if (!importingToBank && scanStatus !== 'scanning' && visibleQuestions.length > 0) e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'; }}
                            style={{
                              padding: '10px 24px',
                              borderRadius: 10,
                              border: 'none',
                              background: importingToBank ? '#cbd5e1' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: 15,
                              cursor: importingToBank ? 'not-allowed' : 'pointer',
                              boxShadow: importingToBank ? 'none' : '0 2px 8px rgba(22,163,74,0.25)',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {importingToBank ? '⏳ Importing…' : '✔️ Confirm & Import'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lightbox modal for image preview */}
              {lightboxSrc && (
                <div
                  role="dialog"
                  onClick={() => { setLightboxSrc(null); }}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}
                >
                  <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95%', maxHeight: '95%', padding: 16, background: '#fff', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                    <img src={lightboxSrc} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} />
                  </div>
                </div>
              )}
              {/* Preview modal for uploaded DOCX (Step 3 style) */}
              {previewUpload && (
                <div
                  role="dialog"
                  onClick={() => { setPreviewUpload(null); }}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16 }}
                >
                  <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(900px, 100%)', background: '#fff', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>Uploaded file preview</div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>Preview of uploaded DOCX • {previewUpload.name}</div>
                      </div>
                      <button
                        onClick={() => setPreviewUpload(null)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
                      >
                        Close
                      </button>
                    </div>

                    <div style={{ padding: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>
                        <div>
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                              <div style={{ width: 64, height: 64, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6b7280' }}>
                                {me?.username ? String(me.username).slice(0,1).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{me?.username || '—'}</div>
                                <div style={{ fontSize: 13, color: '#6b7280' }}>Faculty</div>
                                <div style={{ fontSize: 13, color: '#6b7280' }}>—</div>
                              </div>
                            </div>
                            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Faculty ID: <strong style={{ color: '#111827' }}>{facultyId ?? '—'}</strong></div>
                          </div>

                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>File details</div>
                            <div style={{ fontWeight: 700 }}>{previewUpload.name}</div>
                            <div style={{ fontSize: 13, color: '#6b7280' }}>{previewUpload.path}</div>
                            <div style={{ marginTop: 8 }}>
                              <a href={previewUpload.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Download file</a>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>Uploaded file</div>
                                <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>{previewUpload.name}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>Uploaded path</div>
                                <div style={{ fontWeight: 700 }}>{previewUpload.path}</div>
                              </div>
                            </div>
                            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                              <div><span style={{ color: '#6b7280', fontSize: 12 }}>Notes</span><div style={{ fontWeight: 700 }}>{'This preview shows file metadata. Open the file to view full content or import to parse questions.'}</div></div>
                            </div>
                          </div>

                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Importer preview</div>
                            <div style={{ maxHeight: 260, overflow: 'auto' }}>
                              <div style={{ color: '#6b7280' }}>To see a full questions preview, upload and scan this DOCX using the importer — then the Step 3 confirmation contains the parsed question list.</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* transient import success popup */}
              {showImportPopup && (
                <div style={{ position: 'fixed', left: 24, bottom: 24, zIndex: 120, animation: 'slideIn 0.3s ease' }}>
                  <div style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', color: '#065f46', border: '1px solid #6ee7b7', padding: '16px 20px', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>✅ Imported</div>
                    <div style={{ fontSize: 14, color: '#047857' }}>{importResult?.inserted ?? 0} question(s) imported successfully.</div>
                  </div>
                </div>
              )}
        </main>
  );
}
