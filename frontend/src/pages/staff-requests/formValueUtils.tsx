import React from 'react';
import { getApiBase } from '../../services/apiBase';

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getBackendOrigin(): string {
  try {
    const base = getApiBase();
    const parsed = new URL(base, window.location.origin);
    return parsed.origin;
  } catch {
    return window.location.origin;
  }
}

function toAbsoluteMaybe(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }

  const backendOrigin = getBackendOrigin();

  if (raw.startsWith('/')) {
    return `${backendOrigin}${raw}`;
  }

  if (raw.startsWith('media/')) {
    return `${backendOrigin}/${raw}`;
  }

  // Legacy payloads may store just a filename for uploaded proofs.
  const looksLikeFileName = /\.[a-z0-9]{2,8}$/i.test(raw) && !raw.includes('/');
  if (looksLikeFileName) {
    return `${backendOrigin}/media/${encodeURIComponent(raw)}`;
  }

  return `${backendOrigin}/${raw.replace(/^\/+/, '')}`;
}

export function formatFieldLabel(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getFileMeta(value: unknown): { filename: string; href: string } | null {
  if (!isObject(value)) return null;

  const filename =
    String(value.filename || value.file_name || value.name || value.original_name || '').trim();

  const hrefRaw =
    String(value.content || value.url || value.file_url || value.path || '').trim();

  if (!filename && !hrefRaw) return null;

  return {
    filename: filename || 'Uploaded document',
    href: toAbsoluteMaybe(hrefRaw),
  };
}

export function formatShortFormValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const fileMeta = getFileMeta(value);
  if (fileMeta) return fileMeta.filename;

  if (Array.isArray(value)) {
    const text = value.map((v) => String(v)).join(', ');
    return text.length > 50 ? `${text.slice(0, 50)}...` : text;
  }

  if (isObject(value)) {
    const text = JSON.stringify(value);
    return text.length > 50 ? `${text.slice(0, 50)}...` : text;
  }

  const text = String(value);
  return text.length > 50 ? `${text.slice(0, 50)}...` : text;
}

function getFileExtension(filename: string, href: string): string {
  const fromName = String(filename || '').split('.').pop() || '';
  if (fromName) return fromName.toLowerCase();
  try {
    const cleanHref = String(href || '').split('#')[0].split('?')[0];
    const fromHref = cleanHref.split('.').pop() || '';
    return fromHref.toLowerCase();
  } catch {
    return '';
  }
}

function isImageFile(filename: string, href: string): boolean {
  const ext = getFileExtension(filename, href);
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
}

function isPdfFile(filename: string, href: string): boolean {
  return getFileExtension(filename, href) === 'pdf';
}

function FilePreviewLink({ filename, href }: { filename: string; href: string }) {
  const [open, setOpen] = React.useState(false);
  const imageMode = isImageFile(filename, href);
  const pdfMode = isPdfFile(filename, href);
  const previewable = imageMode || pdfMode;

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!previewable) return;
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <a
        href={href}
        target={previewable ? undefined : '_blank'}
        rel={previewable ? undefined : 'noreferrer'}
        onClick={onClick}
        className="text-blue-700 underline hover:text-blue-900"
      >
        {filename}
      </a>

      {open && (
        <div className="fixed inset-0 z-[1200] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-800 truncate">{filename}</div>
              <div className="flex items-center gap-2">
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 text-white hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-[55vh] bg-gray-100">
              {imageMode ? (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-3">
                  <img src={href} alt={filename} className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <iframe title={filename} src={href} className="w-full h-full border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function renderFormValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') return '-';

  const fileMeta = getFileMeta(value);
  if (fileMeta) {
    return fileMeta.href ? (
      <FilePreviewLink filename={fileMeta.filename} href={fileMeta.href} />
    ) : (
      fileMeta.filename
    );
  }

  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join(', ');
  }

  if (isObject(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}
