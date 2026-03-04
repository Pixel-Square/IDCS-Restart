/**
 * CanvaExportService.ts
 *
 * Export a Canva design to PNG or PDF via the backend proxy,
 * then optionally persist the result in the IDCS backend (attached to an event).
 */

import { getConnection } from './CanvaAuthService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExportFormat = 'png' | 'pdf';

export interface ExportJob {
  jobId: string;
  status: 'pending' | 'success' | 'failed';
  /** Download URLs provided by Canva on successful export */
  urls?: string[];
}

export interface StoredPoster {
  /** IDCS backend URLs of the persisted files */
  storedUrls: string[];
  attachmentIds: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function requireConnection() {
  const conn = getConnection();
  if (!conn) throw new Error('Not connected to Canva. Please connect your account first.');
  return conn;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Submit a Canva export job (async — returns a jobId to poll). */
export async function submitExport(
  designId: string,
  format: ExportFormat,
): Promise<ExportJob> {
  const conn = requireConnection();

  const res = await fetch('/api/canva/exports', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      access_token: conn.accessToken,
      design_id:    designId,
      format,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Export submission failed (${res.status})`);
  }

  const data = await res.json() as { job: { id: string } };
  return { jobId: data.job.id, status: 'pending' };
}

/** Poll a Canva export job once. */
export async function pollExport(jobId: string): Promise<ExportJob> {
  const conn = requireConnection();

  const res = await fetch(
    `/api/canva/exports/${jobId}?access_token=${encodeURIComponent(conn.accessToken)}`,
  );
  if (!res.ok) throw new Error(`Export poll failed (${res.status})`);

  const data = await res.json() as { job: { id: string; status: string; urls?: string[] } };
  const job = data.job;

  if (job.status === 'success') return { jobId, status: 'success', urls: job.urls ?? [] };
  if (job.status === 'failed')  return { jobId, status: 'failed' };
  return { jobId, status: 'pending' };
}

/**
 * Submit an export job and poll until it completes (or times out).
 * Returns the CDN URLs of the exported files.
 */
export async function exportDesign(
  designId: string,
  format: ExportFormat,
  maxWaitMs = 60_000,
): Promise<string[]> {
  const { jobId } = await submitExport(designId, format);
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const result = await pollExport(jobId);
    if (result.status === 'success') return result.urls ?? [];
    if (result.status === 'failed')  throw new Error('Canva export job failed.');
    await sleep(2500);
  }
  throw new Error('Export timed out after ' + maxWaitMs / 1000 + ' seconds.');
}

/**
 * Tell the IDCS backend to download the exported file(s) from Canva's CDN
 * and persist them as EventPosterAttachment records linked to the given event.
 *
 * @param eventId       Frontend event ID (from eventStore)
 * @param canvaDesignId The Canva design ID
 * @param exportUrls    CDN URLs returned by Canva's export API
 * @param format        'png' | 'pdf'
 */
export async function storeExportedPoster(
  eventId: string,
  canvaDesignId: string,
  exportUrls: string[],
  format: ExportFormat,
): Promise<StoredPoster> {
  const res = await fetch(`/api/canva/events/${eventId}/poster`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      canva_design_id: canvaDesignId,
      export_urls:     exportUrls,
      format,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Failed to store poster in backend (${res.status})`);
  }

  const data = await res.json() as { stored_urls: string[]; attachment_ids: number[] };
  return {
    storedUrls:    data.stored_urls    ?? [],
    attachmentIds: data.attachment_ids ?? [],
  };
}

/**
 * Convenience: export a design AND store it in the backend in one call.
 * Returns the final backend URLs.
 */
export async function exportAndStore(
  eventId: string,
  designId: string,
  format: ExportFormat,
): Promise<StoredPoster> {
  const urls = await exportDesign(designId, format);
  return storeExportedPoster(eventId, designId, urls, format);
}
