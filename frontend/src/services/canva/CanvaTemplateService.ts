/**
 * CanvaTemplateService.ts
 *
 * Fetch the Branding user's Canva designs and manage saved IDCS templates.
 * Templates are stored in the Django DB (shared across all users) via the
 * backend API at /api/canva/templates.
 *
 * The localStorage cache in canvaStore is still used for quick reads by
 * the HOD event-creation page so it works offline too.
 */

import { getConnection } from './CanvaAuthService';
import fetchWithAuth from '../fetchAuth';
import {
  saveCanvaTemplate,
  deleteCanvaTemplate,
  getAllCanvaTemplates,
  type CanvaTemplate,
} from '../../store/canvaStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CanvaDesignItem {
  id: string;
  title: string;
  thumbnail?: { url: string };
  urls: { edit_url: string; view_url: string };
  created_at: number;
  updated_at: number;
}

export interface CanvaBrandTemplateItem {
  id: string;
  title: string;
  thumbnail?: { url: string };
  view_url: string;
  create_url: string;
  created_at: number;
  updated_at: number;
}

export interface CanvaBrandTemplateDataset {
  dataset?: Record<string, { type: 'text' | 'image' | 'chart' | string }>;
}

// ── Designs ───────────────────────────────────────────────────────────────────

/**
 * Fetch designs from the connected Canva account via backend proxy.
 * Returns up to 50 most recent by default.
 */
export async function listUserDesigns(query = ''): Promise<CanvaDesignItem[]> {
  const conn = getConnection();
  if (!conn) throw new Error('Not connected to Canva. Please connect your account first.');

  const params = new URLSearchParams({ access_token: conn.accessToken });
  if (query) params.set('query', query);

  const res = await fetchWithAuth(`/api/canva/designs?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Failed to list designs (${res.status})`);
  }

  const data = await res.json() as { items?: CanvaDesignItem[] };
  return data.items ?? [];
}

/** Fetch live Canva Brand Templates that support autofill datasets. */
export async function listUserBrandTemplates(query = ''): Promise<CanvaBrandTemplateItem[]> {
  const conn = getConnection();
  const params = new URLSearchParams({ dataset: 'non_empty', ownership: 'any', limit: '100' });

  if (conn?.accessToken) params.set('access_token', conn.accessToken);
  if (query) params.set('query', query);

  const res = await fetchWithAuth(`/api/canva/brand-templates?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Failed to list brand templates (${res.status})`);
  }

  const data = await res.json() as { items?: CanvaBrandTemplateItem[] };
  return data.items ?? [];
}

/** Fetch the autofill dataset definition for one Brand Template. */
export async function getBrandTemplateDataset(brandTemplateId: string): Promise<Record<string, { type: 'text' | 'image' | 'chart' | string }>> {
  const conn = getConnection();
  const params = new URLSearchParams();
  if (conn?.accessToken) params.set('access_token', conn.accessToken);

  const res = await fetchWithAuth(
    `/api/canva/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset?${params.toString()}`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Failed to load brand template dataset (${res.status})`);
  }

  const data = await res.json() as CanvaBrandTemplateDataset;
  return data.dataset ?? {};
}

// ── Template library (DB-backed) ──────────────────────────────────────────────

/** Fetch all saved IDCS templates from the backend DB and refresh localStorage cache. */
export async function fetchTemplatesFromBackend(): Promise<CanvaTemplate[]> {
  const res = await fetchWithAuth('/api/canva/templates', { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);

  const data = await res.json() as {
    templates: Array<{
      id: number;
      name: string;
      canvaTemplateId: string;
      previewUrl: string;
      is_brand_template: boolean;
      editUrl: string;
      savedBy: string;
      savedAt: string;
    }>;
  };

  // Sync to localStorage
  const current = getAllCanvaTemplates();
  const currentIds = new Set(current.map((t) => t.canvaTemplateId));
  const backendItems = data.templates ?? [];

  for (const t of backendItems) {
    if (!currentIds.has(t.canvaTemplateId)) {
      saveCanvaTemplate({
        name:            t.name,
        canvaTemplateId: t.canvaTemplateId,
        previewUrl:      t.previewUrl,
        thumbnailUrl:    t.previewUrl,
        editUrl:         t.editUrl,
        savedBy:         t.savedBy,
      });
    }
  }

  return getAllCanvaTemplates();
}

/**
 * Save a Canva design as a reusable template.
 * Persists to backend DB AND updates localStorage cache.
 */
export async function saveAsTemplate(
  design: CanvaDesignItem | CanvaBrandTemplateItem,
  savedBy: string,
): Promise<CanvaTemplate> {
  // 1. Save to backend DB
  const res = await fetchWithAuth('/api/canva/templates', {
    method:  'POST',
    body:    JSON.stringify({
      name:              design.title || 'Untitled Template',
      canva_design_id:   design.id,
      thumbnail_url:     design.thumbnail?.url ?? '',
      is_brand_template: true,
      edit_url:          ('urls' in design ? design.urls?.edit_url : design.create_url) ?? '',
      saved_by:          savedBy,
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Failed to save template (${res.status})`);
  }

  // 2. Update localStorage cache
  return saveCanvaTemplate({
    name:            design.title || 'Untitled Template',
    canvaTemplateId: design.id,
    previewUrl:      design.thumbnail?.url ?? '',
    thumbnailUrl:    design.thumbnail?.url ?? '',
    editUrl:         'urls' in design ? design.urls?.edit_url : design.create_url,
    savedBy,
  });
}

/**
 * Delete a template by its localStorage ID.
 * Also deletes from backend DB by matching canvaTemplateId.
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  // Find the backend integer ID by looking up from templates list
  try {
    const res = await fetchWithAuth('/api/canva/templates', { method: 'GET' });
    if (res.ok) {
      const tpl = getAllCanvaTemplates().find((t) => t.id === templateId);
      if (tpl) {
        const data = await res.json() as { templates: Array<{ id: number; canvaTemplateId: string }> };
        const backendEntry = data.templates.find((t) => t.canvaTemplateId === tpl.canvaTemplateId);
        if (backendEntry) {
          await fetchWithAuth(`/api/canva/templates/${backendEntry.id}`, { method: 'DELETE' });
        }
      }
    }
  } catch {
    // localStorage delete below will run regardless
  }
  deleteCanvaTemplate(templateId);
}

export { getAllCanvaTemplates };
