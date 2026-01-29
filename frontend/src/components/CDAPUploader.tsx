import React, { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildFriendlyUploadError(status: number, bodyText: string) {
  if (status === 401) return 'Authentication required. Please login and try again.';
  if (status === 403) return 'Staff role required to upload CDAP Excel files.';
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
      const rowCount = Array.isArray(parsed?.rows) ? parsed.rows.length : 0;
      if (!rowCount) {
        setStatus('success');
        setMessage('Upload completed, but no rows were parsed. Please check the Excel template format.');
      } else {
        setStatus('success');
        setMessage(`Upload complete. Parsed ${rowCount} rows from the Excel file.`);
      }

      onUpload && onUpload({ revision: parsed, uploadedAt: new Date().toISOString() });
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
        <button onClick={handleUpload} disabled={status === 'uploading'}>
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