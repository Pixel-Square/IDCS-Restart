/**
 * CanvaDesignService.ts
 *
 * Create Canva designs from saved templates and inject event data via autofill.
 *
 * Canva Autofill notes:
 *  - Only works with Brand Templates that have named Data Fields configured
 *    inside Canva itself (via the "Data fields" panel in the template editor).
 *  - Field keys used here must exactly match the field names set up in Canva.
 *  - Text field types use { type: "text", text: "..." }.
 */

import { getConnection } from './CanvaAuthService';
import fetchWithAuth from '../fetchAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutofillData {
  event_title?: string;
  event_type?: string;
  participants?: string;
  venue?: string;
  department?: string;
  date_time?: string;
  coordinators?: string;
  resource_person?: string;
  resource_designation?: string;
  faculty_coordinator_1?: string;
  faculty_coordinator_2?: string;
  student_coordinator?: string;
}

export interface CanvaJobResult {
  jobId: string;
  status: 'pending' | 'success' | 'failed';
  /** Present on success — the newly created design's ID */
  designId?: string;
  /** Present on success — the Canva editor URL for the autofilled design */
  designEditUrl?: string;
}

export interface NewDesignResult {
  designId: string;
  editUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Get the current user's personal Canva access token, or an empty string if
 * they haven't connected.  When the token is empty, the Django backend falls
 * back to the branding-user service token stored in the DB, so Canva API calls
 * work for HODs without requiring them to connect their own Canva account.
 */
function getAccessToken(): string {
  return getConnection()?.accessToken ?? '';
}

/** Convert structured AutofillData into Canva's data-field wire format. */
function buildAutofillFields(data: AutofillData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const add = (key: string, text: string | undefined) => {
    if (text) fields[key] = { type: 'text', text };
  };
  add('event_title',  data.event_title);
  add('venue',        data.venue);
  add('department',   data.department);
  add('date_time',    data.date_time);
  add('coordinators', data.coordinators);
  return fields;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new Canva design that is a copy of an existing design/template.
 * The backend proxies to POST /v1/designs with design_type.from_template.
 */
export async function createDesignFromTemplate(
  canvaTemplateId: string,
): Promise<NewDesignResult> {
  const res = await fetchWithAuth('/api/canva/designs', {
    method:  'POST',
    body:    JSON.stringify({
      access_token: getAccessToken(),   // empty → backend uses service token
      template_id:  canvaTemplateId,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Failed to create design (${res.status})`);
  }

  const data = await res.json() as { design: { id: string; urls: { edit_url: string } } };
  return {
    designId: data.design.id,
    editUrl:  data.design.urls.edit_url,
  };
}

/**
 * Submit an autofill job.
 * Uses the Canva Brand Template autofill endpoint (POST /v1/autofills).
 * `brandTemplateId` must be a Canva Brand Template (not a regular design).
 */
export async function submitAutofill(
  brandTemplateId: string,
  autofillData: AutofillData,
): Promise<CanvaJobResult> {
  const fields = buildAutofillFields(autofillData);

  if (Object.keys(fields).length === 0) {
    throw new Error('No autofill data provided.');
  }

  const res = await fetchWithAuth('/api/canva/autofills', {
    method:  'POST',
    body:    JSON.stringify({
      access_token:       getAccessToken(),   // empty → backend uses service token
      brand_template_id:  brandTemplateId,
      data:               fields,
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Autofill submission failed (${res.status})`);
  }

  const result = await res.json() as { job: { id: string } };
  return { jobId: result.job.id, status: 'pending' };
}

/** Poll the autofill job status once. */
export async function pollAutofill(jobId: string): Promise<CanvaJobResult> {
  const tok = getAccessToken();
  const res = await fetchWithAuth(`/api/canva/autofills/${jobId}?access_token=${encodeURIComponent(tok)}`, { method: 'GET' });
  if (!res.ok) throw new Error(`Autofill poll failed (${res.status})`);

  const data = await res.json() as {
    job: {
      id: string;
      status: string;
      result?: { design?: { id: string; urls?: { edit_url?: string } } };
    };
  };
  const job = data.job;

  if (job.status === 'success') {
    return {
      jobId,
      status:        'success',
      designId:      job.result?.design?.id,
      designEditUrl: job.result?.design?.urls?.edit_url,
    };
  }
  if (job.status === 'failed') return { jobId, status: 'failed' };
  return { jobId, status: 'pending' };
}

/**
 * Submit autofill and poll until complete (or timeout).
 * Resolves with the finalized CanvaJobResult.
 */
export async function waitForAutofill(
  brandTemplateId: string,
  autofillData: AutofillData,
  maxWaitMs = 30_000,
): Promise<CanvaJobResult> {
  const { jobId } = await submitAutofill(brandTemplateId, autofillData);
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const result = await pollAutofill(jobId);
    if (result.status !== 'pending') return result;
    await sleep(2000);
  }
  return { jobId, status: 'failed' };
}

/**
 * Build the Canva editor URL for a given designId.
 * This URL can be used in an anchor/popup (Canva blocks cross-origin iframes).
 */
export function buildEditorUrl(designId: string): string {
  return `https://www.canva.com/design/${designId}/edit`;
}
