import React, { useState } from 'react';

const DEFAULT_API_BASE = 'https://db.zynix.us';
const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000' : DEFAULT_API_BASE);

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildFriendlyUploadError(status: number, bodyText: string) {
  if (status === 401) return 'Authentication required. Please login and try again.';
  if (status === 403) return 'Permission required to upload CDAP Excel files.';
  if (status === 400) return 'Invalid file. Please upload a valid CDAP Excel template.';
  if (status === 404) return 'Upload endpoint not found. Please contact admin.';

  const trimmed = (bodyText || '').trim();
  if (trimmed && !trimmed.startsWith('<')) return trimmed;
  return `Upload failed with status ${status}. Please try again.`;
}

export default function CDAPUploader({ subjectId, onUpload }: { subjectId?: string; onUpload?: (res: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) {
      setStatus('error');
      setMessage('Please choose an Excel file first.');
      return;
    }

    setStatus('uploading');
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    if (subjectId) formData.append('subject_id', subjectId);

    try {
      const headers: Record<string, string> = {
        ...authHeaders(),
      };
      const res = await fetch(`${API_BASE}/api/obe/upload-cdap`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        setStatus('error');
        setMessage(buildFriendlyUploadError(res.status, text));
        return;
      }

      const parsed = await res.json();
      const normalizedRevision = {
        rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
        textbook: parsed?.books?.textbook ?? parsed?.textbook ?? '',
        reference: parsed?.books?.reference ?? parsed?.reference ?? '',
        activeLearningOptionsByRow:
          parsed?.active_learning?.optionsByRow ??
          parsed?.activeLearningOptions ??
          [],
        articulationExtras: parsed?.articulation_extras ?? {},
      };
      const rowCount = Array.isArray(parsed?.rows) ? parsed.rows.length : 0;
      if (!rowCount) {
        setStatus('success');
        setMessage('Upload completed, but no rows were parsed. Please check the Excel template format.');
      } else {
        setStatus('success');
        setMessage(`Upload complete. Parsed ${rowCount} rows from the Excel file.`);
      }

      onUpload && onUpload({ revision: normalizedRevision, uploadedAt: new Date().toISOString() });
    } catch (e: any) {
      setStatus('error');
      setMessage(e?.message || 'Upload failed. Please try again.');
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          id="cdap-upload-button"
          onClick={handleUpload}
          disabled={status === 'uploading'}
          aria-label="Upload CDAP Excel file"
          title="Upload parsed CDAP Excel"
          style={{
            background: '#1d4ed8',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            boxShadow: '0 8px 20px rgba(29,78,216,0.24)',
            fontWeight: 600,
            cursor: status === 'uploading' ? 'default' : 'pointer',
            transition: 'transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
            opacity: status === 'uploading' ? 0.65 : 1,
          }}
          onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)'; }}
          onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
        >
          {status === 'uploading' ? 'Uploading...' : 'Upload Excel'}
        </button>
        {file && <span style={{ fontSize: 12, color: '#555' }}>{file.name}</span>}
      </div>
      {message && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: status === 'error' ? '#b91c1c' : '#166534',
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}