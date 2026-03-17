/**
 * Frontend API service for the Event Proposal approval workflow.
 */
import fetchWithAuth from './fetchAuth';

export interface EventProposal {
  id: string;
  title: string;
  department_name: string;
  event_type: string;
  start_date: string | null;
  end_date: string | null;
  venue: string;
  mode: string;
  expert_category: string;
  is_repeated: boolean;
  participants: string;
  coordinator_name: string;
  co_coordinator_name: string;
  chief_guest_name: string;
  chief_guest_designation: string;
  chief_guest_affiliation: string;
  poster_url: string;
  poster_data_url: string;
  has_final_poster: boolean;
  proposal_doc_url: string;
  proposal_doc_name: string;
  canva_design_id: string;
  canva_edit_url: string;
  status: string;
  status_display: string;
  created_by_name: string;
  branding_reviewed_by_name: string;
  branding_reviewed_at: string | null;
  branding_note: string;
  hod_approved_by_name: string;
  hod_approved_at: string | null;
  hod_note: string;
  haa_approved_by_name: string;
  haa_approved_at: string | null;
  haa_note: string;
  rejection_reason: string;
  rejected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  proposal_data: Record<string, any>;
}

export interface UserNotification {
  id: number;
  title: string;
  message: string;
  link: string;
  read: boolean;
  data: Record<string, any>;
  created_at: string;
}

export interface DeleteAllProposalsResponse {
  ok: boolean;
  deleted_count: number;
}

const BASE = '/api/academic-calendar';

/** Build a doc download URL with the JWT token as query param so browsers can open it directly. */
export function buildDocUrl(url: string): string {
  if (!url) return url;
  const token = window.localStorage.getItem('access') || '';
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

/** Build a proposal poster URL that can be opened directly in a new tab. */
export function buildPosterUrl(proposalId: string, finalOnly = false): string {
  const suffix = finalOnly ? '?final_only=1' : '';
  const url = `${BASE}/proposals/${proposalId}/poster/${suffix}`;
  return buildDocUrl(url);
}

function pickDownloadFilename(headerValue: string | null, fallback: string): string {
  const raw = headerValue || '';
  const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // Fall back to simple filename parsing.
    }
  }
  const simpleMatch = raw.match(/filename="?([^";]+)"?/i);
  return (simpleMatch?.[1] || fallback).trim();
}

async function fetchPosterBlob(proposalId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetchWithAuth(`${BASE}/proposals/${proposalId}/poster/`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to load poster' }));
    throw new Error(err.detail || 'Failed to load poster');
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const err = await res.json().catch(() => ({ detail: 'Failed to load poster' }));
    throw new Error(err.detail || 'Failed to load poster');
  }

  const blob = await res.blob();
  const filename = pickDownloadFilename(res.headers.get('content-disposition'), `poster_${proposalId}.png`);
  return { blob, filename };
}

export async function openPosterInNewTab(proposalId: string): Promise<void> {
  const { blob } = await fetchPosterBlob(proposalId);
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function downloadPoster(proposalId: string): Promise<void> {
  const { blob, filename } = await fetchPosterBlob(proposalId);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function downloadProposalDocByUrl(url: string, fallbackName = 'proposal_document.docx'): Promise<void> {
  if (!url) throw new Error('Proposal document URL is missing');

  const absoluteUrl = buildDocUrl(url);
  const link = document.createElement('a');
  link.href = absoluteUrl;
  link.download = fallbackName;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadFinalApprovalDocWithPoster(proposalId: string, fallbackName = 'Final_Approval_With_Poster.docx'): Promise<void> {
  if (!proposalId) throw new Error('Proposal ID is missing');

  const absoluteUrl = buildDocUrl(`${BASE}/proposals/${proposalId}/final-download/`);
  const link = document.createElement('a');
  link.href = absoluteUrl;
  link.download = fallbackName;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function fetchProposals(statusFilter?: string, mineOnly?: boolean): Promise<EventProposal[]> {
  const params = new URLSearchParams();
  if (statusFilter) params.set('status', statusFilter);
  if (mineOnly) params.set('mine', '1');
  const qs = params.toString();
  const url = qs ? `${BASE}/proposals/?${qs}` : `${BASE}/proposals/`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error('Failed to fetch proposals');
  return res.json();
}

export async function fetchProposalDetail(id: string): Promise<EventProposal> {
  const res = await fetchWithAuth(`${BASE}/proposals/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch proposal');
  return res.json();
}

export async function brandingForward(id: string, note?: string): Promise<EventProposal> {
  const res = await fetchWithAuth(`${BASE}/proposals/${id}/branding-forward/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: note || '' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to forward' }));
    throw new Error(err.error || 'Failed to forward');
  }
  return res.json();
}

export async function hodApprove(id: string, note?: string): Promise<EventProposal> {
  const res = await fetchWithAuth(`${BASE}/proposals/${id}/hod-approve/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: note || '' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to approve' }));
    throw new Error(err.error || 'Failed to approve');
  }
  return res.json();
}

export async function haaApprove(id: string, note?: string): Promise<EventProposal> {
  const res = await fetchWithAuth(`${BASE}/proposals/${id}/haa-approve/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: note || '' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to approve' }));
    throw new Error(err.error || 'Failed to approve');
  }
  return res.json();
}

export async function rejectProposal(id: string, reason: string): Promise<EventProposal> {
  const res = await fetchWithAuth(`${BASE}/proposals/${id}/reject/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to reject' }));
    throw new Error(err.error || 'Failed to reject');
  }
  return res.json();
}

export async function deleteAllProposals(): Promise<DeleteAllProposalsResponse> {
  const res = await fetchWithAuth(`${BASE}/proposals/delete-all/`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete proposals' }));
    throw new Error(err.error || 'Failed to delete proposals');
  }
  return res.json();
}

export async function uploadBrandingFinalPoster(id: string, posterFile: File): Promise<EventProposal> {
  const formData = new FormData();
  formData.append('poster', posterFile);

  const res = await fetchWithAuth(`${BASE}/proposals/${id}/branding-upload-final-poster/`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to upload final poster' }));
    throw new Error(err.error || 'Failed to upload final poster');
  }

  return res.json();
}

export async function fetchNotifications(): Promise<UserNotification[]> {
  const res = await fetchWithAuth(`${BASE}/notifications/`);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await fetchWithAuth(`${BASE}/notifications/unread-count/`);
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count || 0;
}

export async function markNotificationRead(id: number): Promise<void> {
  await fetchWithAuth(`${BASE}/notifications/${id}/read/`, { method: 'POST' });
}
