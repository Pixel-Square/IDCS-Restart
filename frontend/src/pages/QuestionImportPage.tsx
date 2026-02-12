import React, { useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

type ImportResponse = {
  inserted: number;
  failed?: Array<{ index: number; error: string }>;
};

export default function QuestionImportPage(): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [scanDebug, setScanDebug] = useState<any | null>(null);

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'pending' | 'approved'>('pending');

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const visibleQuestions = useMemo(() => {
    // UI convention: hide alternate OR rows
    return questions.filter((q) => {
      const marks = String(q.marks ?? '').trim().toUpperCase();
      const btl = String(q.btl ?? '').trim().toUpperCase();
      const co = String(q.course_outcomes ?? '').trim().toUpperCase();
      return !(marks === '(OR)' && btl === '(OR)' && co === '(OR)');
    });
  }, [questions]);

  async function handleScan() {
    if (!file) {
      setScanError('Please select a .docx file first.');
      return;
    }

    setScanning(true);
    setScanError(null);
    setImportResult(null);
    setImportError(null);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/template/scan-docx`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
        },
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text();
        setScanError(txt || `Scan failed (${res.status})`);
        setQuestions([]);
        return;
      }

      const json = await res.json();
      const qs = Array.isArray(json?.questions) ? (json.questions as ParsedQuestion[]) : [];
      setScanDebug(json?.debug ?? null);
      // Debug: log received questions and images
      try {
        // eslint-disable-next-line no-console
        console.debug('scan_docx response: questions=', qs.length, 'sample=', qs[0] ? { q0: qs[0].question_text, imgs: (qs[0].images || []).slice(0,2) } : null);
        if (qs.length) {
          (qs as any).forEach((qq: any, i: number) => {
            // eslint-disable-next-line no-console
            console.log(`Q#${i+1} images:`, Array.isArray(qq.images) ? qq.images.map((im: any) => (typeof im==='string'? im.slice(0,80): typeof im)) : qq.images);
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('scan_docx debug log failed', e);
      }
      setQuestions(qs);
    } catch (e: any) {
      setScanError(e?.message || 'Scan failed');
      setQuestions([]);
    } finally {
      setScanning(false);
    }
  }

  async function handleImport() {
    if (!title.trim()) {
      setImportError('Title is required to import.');
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const payload = {
        title: title.trim(),
        status,
        questions: visibleQuestions,
      };

      const res = await fetch(`${API_BASE}/api/import/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        setImportError(txt || `Import failed (${res.status})`);
        return;
      }

      const json = (await res.json()) as ImportResponse;
      setImportResult(json);
    } catch (e: any) {
      setImportError(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Question Import</h1>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="file"
          accept=".docx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button onClick={handleScan} disabled={scanning || !file}>
          {scanning ? 'Scanning…' : 'Scan DOCX'}
        </button>
        <div style={{ color: '#666', fontSize: 13 }}>
          {questions.length ? `${questions.length} scanned (${visibleQuestions.length} visible)` : ''}
        </div>
      </div>

      {scanError && <div style={{ marginTop: 10, color: '#b91c1c' }}>{scanError}</div>}

      {scanDebug && (
        <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', border: '1px solid #e6eef8', borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: '#0747a6', fontWeight: 700 }}>Scan debug</div>
          <div style={{ fontSize: 13, color: '#333' }}>Questions parsed: {scanDebug.parsed_questions ?? '-'}</div>
          <div style={{ fontSize: 13, color: '#333' }}>Total images: {scanDebug.total_images ?? 0}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Sample questions: {Array.isArray(scanDebug.sample_questions) ? scanDebug.sample_questions.join(' | ') : '-'}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Sample image prefix: <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>{String(scanDebug.sample_image_prefix || '').slice(0,200)}</code></div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            First questions' images (raw):
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: '#fff', padding: 8, borderRadius: 6 }}>{JSON.stringify(questions.slice(0,3).map(q=>q.images), null, 2)}</pre>
          </div>
        </div>
      )}

      <hr style={{ margin: '20px 0' }} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g., Midterm 2026)"
          style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, minWidth: 260 }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6 }}
        >
          <option value="pending">pending</option>
          <option value="approved">approved</option>
        </select>
        <button onClick={handleImport} disabled={importing || visibleQuestions.length === 0}>
          {importing ? 'Importing…' : 'Import to Bank'}
        </button>
      </div>

      {importError && <div style={{ marginTop: 10, color: '#b91c1c' }}>{importError}</div>}
      {importResult && (
        <div style={{ marginTop: 10, color: '#166534' }}>
          Imported {importResult.inserted} question(s)
          {importResult.failed?.length ? `, ${importResult.failed.length} failed.` : '.'}
        </div>
      )}

      {importResult?.failed?.length ? (
        <div style={{ marginTop: 10 }}>
          <h3 style={{ margin: '10px 0' }}>Failures</h3>
          <ul>
            {importResult.failed.map((f) => (
              <li key={f.index} style={{ color: '#b91c1c' }}>
                #{f.index + 1}: {f.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <hr style={{ margin: '20px 0' }} />

      <h2 style={{ margin: '10px 0' }}>Preview</h2>
      {visibleQuestions.length === 0 ? (
        <div style={{ color: '#666' }}>No questions to preview yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          {visibleQuestions.slice(0, 50).map((q, idx) => (
            <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {idx + 1}. {q.question_text}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#555', fontSize: 13, marginBottom: 8 }}>
                {q.marks != null && <span>Marks: {String(q.marks)}</span>}
                {q.btl != null && <span>BTL: {String(q.btl)}</span>}
                {q.course_outcomes && <span>CO: {q.course_outcomes}</span>}
                {q.chapter && <span>Chapter: {q.chapter}</span>}
              </div>

              {Array.isArray(q.options) && q.options.length ? (
                <ol type="a" style={{ marginTop: 0 }}>
                  {q.options.map((opt: any, i: number) => (
                    <li key={i}>{String(opt)}</li>
                  ))}
                </ol>
              ) : null}

              {q.correct_answer ? (
                <div style={{ marginTop: 6, color: '#111', fontSize: 13 }}>
                  <strong>Answer:</strong> {q.correct_answer}
                </div>
              ) : null}

              {q.answer_text ? (
                <div style={{ marginTop: 4, color: '#444', fontSize: 13 }}>
                  <strong>Explanation:</strong> {q.answer_text}
                </div>
              ) : null}

              {Array.isArray(q.images) && q.images.length ? (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {q.images.slice(0, 6).map((img: any, i: number) => {
                    // normalize possible image shapes to a src string
                    let src: string | null = null;
                    try {
                      if (typeof img === 'string') {
                        src = img;
                        // plain base64 without data: prefix (heuristic)
                        if (!src.startsWith('data:') && /^[A-Za-z0-9+/=\n\r]+$/.test(src) && src.length > 100) {
                          src = `data:image/png;base64,${src.replace(/\s+/g, '')}`;
                        }
                      } else if (img && typeof img === 'object') {
                        if (img.url) src = img.url;
                        else if (img.base64) src = img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`;
                        else if (img.binary && img.binary instanceof Uint8Array) {
                          const blob = new Blob([img.binary as any], { type: 'image/png' });
                          src = URL.createObjectURL(blob);
                        }
                      } else if (img instanceof Uint8Array) {
                        const blob = new Blob([img as any], { type: 'image/png' });
                        src = URL.createObjectURL(blob);
                      }
                    } catch (e) {
                      src = null;
                    }
                    if (!src) return null;
                    return (
                      <img
                        key={i}
                        src={src}
                        alt={`q${idx + 1}-img${i + 1}`}
                        onClick={() => setLightboxSrc(src)}
                        style={{ maxHeight: 140, borderRadius: 8, border: '1px solid #eee', cursor: 'pointer', objectFit: 'contain' }}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
          {visibleQuestions.length > 50 && (
            <div style={{ color: '#666' }}>Showing first 50 questions.</div>
          )}
        </div>
      )}
      {/* Lightbox modal for image preview */}
      {lightboxSrc && (
        <div
          role="dialog"
          onClick={() => { setLightboxSrc(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90%', maxHeight: '90%', padding: 12 }}>
            <img src={lightboxSrc} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
          </div>
        </div>
      )}
    </div>
  );
}
