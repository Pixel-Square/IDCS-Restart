import React, { useEffect, useMemo, useState } from 'react';

import CDAPPage from './CDAPPage';
import ArticulationMatrixPage from './ArticulationMatrixPage';
import MarkEntryPage from './MarkEntryPage';

import { fetchMyTeachingAssignments, TeachingAssignmentItem } from '../services/obe';
import { getMe } from '../services/auth';
import DashboardSidebar from '../components/DashboardSidebar';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

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

  const [assignments, setAssignments] = useState<TeachingAssignmentItem[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [selectedCourseKey, setSelectedCourseKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('courses');

  const [me, setMe] = useState<Me | null>(null);

  // Import wizard state (Exam Management)
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scannedQuestions, setScannedQuestions] = useState<ParsedQuestion[]>([]);
  const [uploadedDocxPath, setUploadedDocxPath] = useState<string | null>(null);

  const [examName, setExamName] = useState('');
  const [examType, setExamType] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examSections, setExamSections] = useState('');

  const [importingToBank, setImportingToBank] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; failed?: Array<{ index: number; error: string }> } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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
        const blob = new Blob([img], { type: 'image/png' });
        return URL.createObjectURL(blob);
      }
      return null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetchMyTeachingAssignments();
        if (!mounted) return;
        setAssignments(res);
        setAssignmentsError(null);

        // pick a sensible default
        if (!selectedCourseKey && res.length) {
          setSelectedCourseKey(res[0].subject_code);
        }
      } catch (e: any) {
        if (!mounted) return;
        setAssignmentsError(e?.message || 'Failed to load courses');
        setAssignments([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Fetch current user for Faculty ID display
    getMe()
      .then((u) => setMe(u as Me))
      .catch(() => setMe(null));
  }, []);

  const facultyId = useMemo(() => {
    if (!me) return null;
    return me.faculty_id ?? me.staff_id ?? me.employee_id ?? me.id ?? null;
  }, [me]);

  const selectedCourse = useMemo(() => {
    if (!selectedCourseKey) return null;
    // we key by subject_code for now (it matches existing localStorage flows)
    const first = assignments.find(a => a.subject_code === selectedCourseKey);
    if (!first) return null;
    return {
      subject_code: first.subject_code,
      subject_name: first.subject_name,
    };
  }, [assignments, selectedCourseKey]);

 

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
          <div style={{ display: 'flex', flexDirection: 'row', minHeight: '100vh' }}>
            <div style={{ flex: '0 0 240px', background: '#f8fafc', minHeight: '100vh', borderRight: '1px solid #eee' }}>
              <DashboardSidebar />
            </div>
            <div style={{ flex: 1, padding: '32px 32px 24px 32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
              <header style={{ marginBottom: 8, marginTop: 0, paddingTop: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', width: '100%' }}>
                  <div style={{ textAlign: 'right' }}>
                    <h1 style={{ margin: 0 }}>
                      Outcome Based Education (OBE)
                    </h1>
                    {selectedCourse && (
                      <div style={{ fontSize: 20, color: '#222', fontWeight: 600, lineHeight: 1.2 }}>
                        {selectedCourse.subject_name} ({selectedCourse.subject_code})
                      </div>
                    )}
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
                  style={{ marginBottom: 12 }}
                >
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Select a course to work on:</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: 16,
                      marginBottom: 8,
                      minHeight: 180,
                      alignItems: 'start',
                      justifyItems: 'center',
                    }}
                  >
                    {assignments.length === 0 ? (
                      <div style={{ gridColumn: '1/-1', color: '#888', fontSize: 20, textAlign: 'center', padding: 40 }}>
                        No courses found. You have no teaching assignments.<br />
                        (If you expect to see courses here, please check your backend/API or contact admin.)
                      </div>
                    ) : (
                      assignments
                        .reduce((acc: TeachingAssignmentItem[], it) => {
                          // de-dupe by subject_code for this selector
                          if (!acc.some(a => a.subject_code === it.subject_code)) acc.push(it);
                          return acc;
                        }, [])
                        .map((it) => (
                          <div
                            key={it.subject_code}
                            onClick={() => navigateToCourse(it.subject_code)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') navigateToCourse(it.subject_code); }}
                            style={{
                              border: selectedCourseKey === it.subject_code ? '2px solid #2563eb' : '1px solid #e5e7eb',
                              borderRadius: 10,
                              padding: 18,
                              background: selectedCourseKey === it.subject_code ? '#f0f6ff' : '#fff',
                              boxShadow: selectedCourseKey === it.subject_code ? '0 2px 8px #2563eb22' : '0 1px 4px #0001',
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
                            <button
                              onClick={(e) => { e.stopPropagation(); navigateToCourse(it.subject_code); }}
                              style={{
                                marginTop: 'auto',
                                padding: '6px 18px',
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
                          </div>
                        ))
                    )}
                  </div>
                  {assignmentsError && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{assignmentsError}</div>
                  )}
                </section>
              )}

              {/* Exam Management tab (placeholder) */}
              {activeTab === 'exam' && (
                <section aria-label="Exam management" style={{ minHeight: 240, padding: 20, border: '1px dashed #e5e7eb', borderRadius: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

                    {/* Recent placeholder */}
                    <div style={{ marginTop: 4 }}>
                      <h3 style={{ margin: '6px 0' }}>Recent</h3>
                      <div style={{ color: '#666' }}>
                        Recent exam uploads and actions will appear here.
                        (You will provide details for this section later.)
                      </div>
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
                                placeholder="e.g., CIA 1 - CSE201"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam type</label>
                              <input
                                value={examType}
                                onChange={(e) => setExamType(e.target.value)}
                                placeholder="e.g., CIA / Model / Semester"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam date</label>
                              <input
                                type="date"
                                value={examDate}
                                onChange={(e) => setExamDate(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Sections</label>
                              <textarea
                                value={examSections}
                                onChange={(e) => setExamSections(e.target.value)}
                                placeholder="e.g., Part A\nPart B\nSection 1"
                                rows={3}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', resize: 'vertical' }}
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
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>Faculty ID</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{facultyId ?? '—'}</div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>{me?.username ? `User: ${me.username}` : ''}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>Questions to import</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{visibleQuestions.length}</div>
                              </div>
                            </div>

                            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam name</span><div style={{ fontWeight: 700 }}>{examName || '—'}</div></div>
                              <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam type</span><div style={{ fontWeight: 700 }}>{examType || '—'}</div></div>
                              <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam date</span><div style={{ fontWeight: 700 }}>{examDate || '—'}</div></div>
                              <div><span style={{ color: '#6b7280', fontSize: 12 }}>Sections</span><div style={{ fontWeight: 700, whiteSpace: 'pre-wrap' }}>{examSections || '—'}</div></div>
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
            </div>
          </div>
        </main>
  );
}
