import React, { useMemo, useState } from 'react';

const DEFAULT_API_BASE = 'https://db.krgi.co.in';
const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000' : DEFAULT_API_BASE);

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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
