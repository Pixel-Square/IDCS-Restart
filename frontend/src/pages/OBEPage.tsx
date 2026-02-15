import React, { useEffect, useMemo, useState } from 'react';

import CDAPPage from './CDAPPage';
import ArticulationMatrixPage from './ArticulationMatrixPage';
import MarkEntryPage from './MarkEntryPage';
// import LcaInstructionsPage from './LcaInstructionsPage';
import '../styles/obe-theme.css';

// OBE/marks/COAttainment fetch and types removed
import { getMe } from '../services/auth';
import { fetchMyTeachingAssignments, TeachingAssignmentItem } from '../services/obe';

const PRIMARY_API_BASE = import.meta.env.VITE_API_BASE || 'https://db.zynix.us';
const FALLBACK_API_BASE = 'http://localhost:8000';
const API_BASE = import.meta.env.VITE_API_BASE || 'https://db.zynix.us';

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
        <main className="obe-page" style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
          <header style={{ marginBottom: 8, marginTop: 0, paddingTop: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
              <div style={{ textAlign: 'left' }}>
                <h1 style={{ margin: 0 }}>
                  Outcome Based Education (OBE)
                </h1>
                {/* OBE/marks/COAttainment course header removed */}
                <div style={{ marginTop: 4, color: '#444', fontSize: 15 }}>
                  Select a course, then work through CDAP, Articulation Matrix and Mark Entry.
                </div>
              </div>
            </div>
          </header>
              {/* Tabs header */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => setActiveTab('courses')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: activeTab === 'courses' ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: activeTab === 'courses' ? '#f0f6ff' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Courses
                </button>
                <button
                  onClick={() => setActiveTab('exam')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: activeTab === 'exam' ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: activeTab === 'exam' ? '#f0f6ff' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Exam Management
                </button>
              </div>

              {/* Courses tab content */}
              {activeTab === 'courses' && (
                <section
                  aria-label="Course selector"
                  style={{ marginBottom: 24 }}
                >
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Select a course to work on:</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 16,
                      marginBottom: 24,
                    }}
                  >
                    {/* Course list: show assignments when available (safe fetch) */}
                    {loadingAssignments ? (
                      <div style={{ gridColumn: '1/-1', color: '#666', fontSize: 16, textAlign: 'center', padding: 40 }}>Loading courses…</div>
                    ) : assignments.length === 0 ? (
                      <div style={{ gridColumn: '1/-1', color: '#888', fontSize: 20, textAlign: 'center', padding: 40 }}>
                        No courses found. You have no teaching assignments.<br />
                        (If you expect to see courses here, please check with your backend/API or contact admin.)
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
                            style={{
                              border: '1px solid #e5e7eb',
                              borderRadius: 10,
                              padding: 18,
                              background: '#fff',
                              boxShadow: '0 1px 4px #0001',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              minHeight: 100,
                              position: 'relative',
                              transition: 'border 0.2s, box-shadow 0.2s',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{it.subject_name}</div>
                            <div style={{ fontSize: 15, color: '#444', marginBottom: 12 }}>{it.subject_code}</div>
                            <div style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigateToCourse(it.subject_code); }}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: '#2563eb',
                                  color: '#fff',
                                  fontWeight: 600,
                                  fontSize: 15,
                                  cursor: 'pointer',
                                  boxShadow: '0 1px 2px #0001',
                                }}
                              >
                                Open
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation(); window.location.href = `/obe/course/${encodeURIComponent(it.subject_code)}/lca`; }}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #e5e7eb',
                                  background: '#fff',
                                  color: '#111827',
                                  fontWeight: 600,
                                  fontSize: 13,
                                  cursor: 'pointer',
                                }}
                              >
                                LCA
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation(); window.location.href = `/obe/course/${encodeURIComponent(it.subject_code)}/co_attainment`; }}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #e5e7eb',
                                  background: '#fff',
                                  color: '#111827',
                                  fontWeight: 600,
                                  fontSize: 13,
                                  cursor: 'pointer',
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
                <section aria-label="Exam management" style={{ padding: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Upload area */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                      <label htmlFor="exam-upload-input" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#2563eb', color: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                        {examUploadStatus === 'uploading' ? 'Uploading...' : 'Upload .docx'}
                      </label>

                      <div style={{ color: '#666', fontSize: 13 }}>
                        Upload exam spreadsheets or related files here.
                      </div>
                    </div>

                    {/* Search bar */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="search"
                        placeholder="Search exams, courses, entries..."
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }}
                        onChange={() => { /* TODO: wire search */ }}
                      />
                      <button style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>Search</button>
                    </div>

                    {/* Recent uploads */}
                    <div style={{ marginTop: 4 }}>
                      <h3 style={{ margin: '6px 0' }}>Recent</h3>
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
                      <div style={{ marginTop: 8, fontSize: 13, color: examUploadStatus === 'error' ? '#b91c1c' : '#166534' }}>{examUploadMessage}</div>
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
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 50,
                    padding: 16,
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 'min(980px, 100%)',
                      background: '#fff',
                      borderRadius: 12,
                      boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                      overflow: 'hidden',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>Question Import</div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>
                          Step {wizardStep} of 3 • {scanStatus === 'scanning' ? 'Scanning…' : scanStatus === 'error' ? 'Scan failed' : 'Ready'}
                        </div>
                      </div>
                      <button
                        onClick={closeWizard}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
                      >
                        Close
                      </button>
                    </div>

                    {/* sliding pages */}
                    <div style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          display: 'flex',
                          width: '300%',
                          transform: `translateX(-${(wizardStep - 1) * 33.3333333}%)`,
                          transition: 'transform 240ms ease',
                        }}
                      >
                        {/* Step 1: Preview */}
                        <div style={{ width: '33.3333333%', padding: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>Preview</div>
                              <div style={{ fontSize: 13, color: '#6b7280' }}>
                                {uploadedDocxPath ? `Source: ${uploadedDocxPath}` : 'Source: (not available)'}
                              </div>
                            </div>
                            <div style={{ fontSize: 13, color: '#374151' }}>
                              Questions: <b>{visibleQuestions.length}</b>
                            </div>
                          </div>

                          {scanMessage && (
                            <div style={{ marginBottom: 10, fontSize: 13, color: scanStatus === 'error' ? '#b91c1c' : '#166534' }}>
                              {scanMessage}
                            </div>
                          )}

                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, maxHeight: 360, overflow: 'auto' }}>
                            {scanStatus === 'scanning' && (
                              <div style={{ color: '#6b7280' }}>Scanning your DOCX…</div>
                            )}
                            {scanStatus !== 'scanning' && visibleQuestions.length === 0 && (
                              <div style={{ color: '#6b7280' }}>No questions to preview yet.</div>
                            )}
                            {visibleQuestions.map((q, idx) => (
                              <div key={idx} style={{ padding: '10px 8px', borderBottom: '1px solid #f3f4f6' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                  <div style={{ fontWeight: 700, color: '#111827' }}>Q{idx + 1}</div>
                                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                                    Marks: {String((q as any)?.marks ?? '-')}{' '}
                                    • BTL: {String((q as any)?.btl ?? '-')}{' '}
                                    • CO: {String((q as any)?.course_outcomes ?? '-')}
                                  </div>
                                </div>
                                <div style={{ marginTop: 6, color: '#111827', whiteSpace: 'pre-wrap' }}>
                                  {String((q as any)?.question_text ?? '').slice(0, 500)}
                                  {String((q as any)?.question_text ?? '').length > 500 ? '…' : ''}
                                </div>

                                {Array.isArray((q as any)?.images) && (q as any).images.length ? (
                                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {(q as any).images.slice(0, 4).map((img: any, i: number) => {
                                      const src = normalizeImageSrc(img);
                                      if (!src) return null;
                                      return (
                                        <img
                                          key={i}
                                          src={src}
                                          alt={`q${idx + 1}-img${i + 1}`}
                                          onClick={() => setLightboxSrc(src)}
                                          style={{ maxHeight: 120, borderRadius: 8, border: '1px solid #eee', cursor: 'pointer', objectFit: 'contain', background: '#fff' }}
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
                        <div style={{ width: '33.3333333%', padding: 16 }}>
                          <div style={{ fontWeight: 700, marginBottom: 10 }}>Save details</div>
                          {importError && (
                            <div style={{ marginBottom: 10, fontSize: 13, color: '#b91c1c' }}>{importError}</div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                        <div style={{ width: '33.3333333%', padding: 16 }}>
                          <div style={{ fontWeight: 700, marginBottom: 10 }}>Confirmation</div>

                          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>
                            {/* Left column: Profile card and Course details */}
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

                            {/* Right column: Exam info + Questions preview */}
                            <div>
                              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                  <div>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>Questions to import</div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>{visibleQuestions.length}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>Exam name</div>
                                    <div style={{ fontWeight: 700 }}>{examName || '—'}</div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Assessment</div>
                                    <div style={{ fontWeight: 700 }}>{examAssessment || '—'}</div>
                                  </div>
                                </div>

                                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                  <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam Type</span><div style={{ fontWeight: 700 }}>{examType || '—'}</div></div>
                                  <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam date</span><div style={{ fontWeight: 700 }}>{examDate || '—'}</div></div>
                                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#6b7280', fontSize: 12 }}>Sections</span><div style={{ fontWeight: 700, whiteSpace: 'pre-wrap' }}>{examSections || '—'}</div></div>
                                </div>
                              </div>

                              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Questions preview</div>
                                <div style={{ maxHeight: 220, overflow: 'auto' }}>
                                  {visibleQuestions.slice(0, 10).map((q, i) => (
                                    <div key={i} style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                      <div style={{ fontWeight: 700, color: '#111827', width: 36 }}>{i+1}.</div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ color: '#111827' }}>{String(q.question_text).slice(0, 260)}</div>
                                        {Array.isArray(q.images) && q.images.length ? (
                                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                            {q.images.slice(0,2).map((im: any, j: number) => {
                                              const src = normalizeImageSrc(im);
                                              if (!src) return null;
                                              return <img key={j} src={src} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee', cursor: 'pointer' }} onClick={() => setLightboxSrc(src)} />
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
                            <div style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{importError}</div>
                          )}
                          {importResult && (
                            <div style={{ marginTop: 10, fontSize: 13, color: '#166534' }}>
                              Imported {importResult.inserted} question(s)
                              {importResult.failed?.length ? `, failed ${importResult.failed.length}.` : '.'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* footer */}
                    <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <button
                        onClick={() => setWizardStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)))}
                        disabled={wizardStep === 1}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #e5e7eb',
                          background: wizardStep === 1 ? '#f9fafb' : '#fff',
                          cursor: wizardStep === 1 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Back
                      </button>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Next
                          </button>
                        ) : (
                          <button
                            onClick={handleConfirmImport}
                            disabled={importingToBank || scanStatus === 'scanning' || visibleQuestions.length === 0}
                            style={{
                              padding: '8px 14px',
                              borderRadius: 8,
                              border: 'none',
                              background: importingToBank ? '#93c5fd' : '#16a34a',
                              color: '#fff',
                              fontWeight: 800,
                              cursor: importingToBank ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {importingToBank ? 'Importing…' : 'Confirm & Import'}
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
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}
                >
                  <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90%', maxHeight: '90%', padding: 12 }}>
                    <img src={lightboxSrc} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
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
                <div style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 120 }}>
                  <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}>
                    <div style={{ fontWeight: 800 }}>Imported</div>
                    <div style={{ fontSize: 13, color: '#065f46' }}>{importResult?.inserted ?? 0} question(s) imported successfully.</div>
                  </div>
                </div>
              )}
        </main>
  );
}
