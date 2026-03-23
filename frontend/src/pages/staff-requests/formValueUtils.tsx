import React from 'react';

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toAbsoluteMaybe(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${window.location.origin}${url}`;
  }
  return url;
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

export function renderFormValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') return '-';

  const fileMeta = getFileMeta(value);
  if (fileMeta) {
    return fileMeta.href ? (
      <a
        href={fileMeta.href}
        target="_blank"
        rel="noreferrer"
        className="text-blue-700 underline hover:text-blue-900"
      >
        {fileMeta.filename}
      </a>
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
