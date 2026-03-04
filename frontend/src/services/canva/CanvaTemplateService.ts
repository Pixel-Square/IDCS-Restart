/**
 * CanvaTemplateService.ts
 *
 * Fetch the Branding user's Canva designs and manage saved templates.
 * All API calls are proxied through the Django backend (/api/canva/).
 */

import { getConnection } from './CanvaAuthService';
import {
  getAllCanvaTemplates,
  saveCanvaTemplate,
  deleteCanvaTemplate,
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

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Fetch designs from the connected Canva account via backend proxy.
 * Returns the items array (paginated; up to 50 most recent by default).
 */
export async function listUserDesigns(query = ''): Promise<CanvaDesignItem[]> {
  const conn = getConnection();
  if (!conn) throw new Error('Not connected to Canva. Please connect your account first.');

  const params = new URLSearchParams({ access_token: conn.accessToken });
  if (query) params.set('query', query);

  const res = await fetch(`/api/canva/designs?${params.toString()}`);
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(e.detail ?? `Failed to list designs (${res.status})`);
  }

  const data = await res.json() as { items?: CanvaDesignItem[] };
  return data.items ?? [];
}

/**
 * Save a Canva design as a reusable event poster template in the local store.
 * The Canva design ID is preserved so it can be used to create autofilled copies.
 */
export function saveAsTemplate(design: CanvaDesignItem, savedBy: string): CanvaTemplate {
  return saveCanvaTemplate({
    name:             design.title || 'Untitled Template',
    canvaTemplateId:  design.id,
    previewUrl:       design.thumbnail?.url ?? '',
    thumbnailUrl:     design.thumbnail?.url ?? '',
    editUrl:          design.urls?.edit_url,
    savedBy,
  });
}

export { getAllCanvaTemplates, deleteCanvaTemplate };
