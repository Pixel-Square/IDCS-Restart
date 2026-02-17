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
  const [lastRevision, setLastRevision] = useState<any | null>(null);

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
      setLastRevision(normalizedRevision);
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

  function extractCell(row: any, keys: string[]) {
    for (const k of keys) {
      if (row == null) continue;
      if (row[k] != null) return row[k];
      const lk = String(k).toLowerCase();
      for (const rk of Object.keys(row || {})) {
        if (String(rk).toLowerCase() === lk) return row[rk];
      }
    }
    return '';
  }

  function exportPdfRevision(revision: any) {
    if (!revision || !Array.isArray(revision.rows) || !revision.rows.length) return;
    const rows = revision.rows;
    const headers = ['#', 'Content type', 'PART NO.', 'TOPICS TO BE COVERED (SYLLBUS TOPICS)', 'SUB TOPICS (WHAT TO BE TAUGHT)', 'BT LEVEL'];

    const htmlRows = rows.map((r: any, idx: number) => {
      const content = extractCell(r, ['content_type', 'contentType', 'Content type', 'content']);
      const partNo = extractCell(r, ['part_no', 'partNo', 'PART NO', 'part']);
      const topics = extractCell(r, ['topics', 'topics_to_be_covered', 'Topics', 'TOPICS TO BE COVERED']);
      const subTopics = extractCell(r, ['sub_topics', 'subTopics', 'Sub Topics', 'SUB TOPICS', 'sub_topics_to_be_taught']);
      const bt = extractCell(r, ['bt_level', 'bt', 'BT LEVEL', 'btLevel']);
      return `<tr>
        <td style="padding:6px;border:1px solid #ccc;text-align:center;">${idx + 1}</td>
        <td style="padding:6px;border:1px solid #ccc">${String(content ?? '')}</td>
        <td style="padding:6px;border:1px solid #ccc">${String(partNo ?? '')}</td>
        <td style="padding:6px;border:1px solid #ccc">${String(topics ?? '')}</td>
        <td style="padding:6px;border:1px solid #ccc">${String(subTopics ?? '')}</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:center;">${String(bt ?? '')}</td>
      </tr>`;
    }).join('\n');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>CDAP Export</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;font-size:12px;padding:20px}table{border-collapse:collapse;width:100%}th{background:#f3f4f6;padding:8px;border:1px solid #ddd;text-align:left}td{vertical-align:top}</style>
      </head><body>
      <h2>CDAP Export</h2>
      <p>Exported rows: ${rows.length}</p>
      <table>
        <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${htmlRows}
        </tbody>
      </table>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      alert('Popup blocked — allow popups for this site to export PDF.');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    // Give browser a moment to render then open print dialog for saving as PDF
    setTimeout(() => {
      w.print();
    }, 300);
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
      {status === 'success' && lastRevision && Array.isArray(lastRevision.rows) && lastRevision.rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => exportPdfRevision(lastRevision)}
            style={{
              background: '#047857',
              color: '#fff',
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            aria-label="Export PDF"
            title="Export CDAP to PDF (will open print dialog)"
          >
            Export PDF
          </button>
        </div>
      )}
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