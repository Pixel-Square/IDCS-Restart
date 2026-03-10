/**
 * canvaStore.ts
 *
 * localStorage store for:
 *   1. CanvaConnection  — live OAuth tokens + Canva user identity
 *   2. CanvaTemplate    — Branding-user-saved Canva designs usable as event poster templates
 *
 * Storage keys:
 *   idcs_canva_connection  — single CanvaConnection object (or absent)
 *   idcs_canva_templates   — CanvaTemplate[]
 */

const CONNECTION_KEY = 'idcs_canva_connection';
const TEMPLATES_KEY  = 'idcs_canva_templates';

// ── Connection ────────────────────────────────────────────────────────────────

export interface CanvaConnection {
  accessToken: string;
  refreshToken?: string;
  /** Unix timestamp (ms) when access token expires */
  expiresAt: number;
  userId: string;
  displayName: string;
}

export function getConnection(): CanvaConnection | null {
  try {
    const raw = localStorage.getItem(CONNECTION_KEY);
    if (!raw) return null;
    const conn = JSON.parse(raw) as CanvaConnection;
    // Treat as expired if within 60 s of expiry
    if (Date.now() >= conn.expiresAt - 60_000) {
      clearConnection();
      return null;
    }
    return conn;
  } catch {
    return null;
  }
}

export function saveConnection(conn: CanvaConnection): void {
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(conn));
}

export function clearConnection(): void {
  localStorage.removeItem(CONNECTION_KEY);
}

// ── Canva Template ────────────────────────────────────────────────────────────

export interface CanvaTemplate {
  /** Local IDCS-generated ID */
  id: string;
  /** Human-readable name (from Canva design title) */
  name: string;
  /** Canva design ID (used as templateId when creating new designs) */
  canvaTemplateId: string;
  /** URL of the design thumbnail / preview image served by Canva */
  previewUrl: string;
  thumbnailUrl?: string;
  /** Canva editor URL for the original template design */
  editUrl?: string;
  /** Username of the Branding user who saved this template */
  savedBy: string;
  savedAt: string;
}

function loadTemplates(): CanvaTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? (JSON.parse(raw) as CanvaTemplate[]) : [];
  } catch {
    return [];
  }
}

function persistTemplates(templates: CanvaTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export function getAllCanvaTemplates(): CanvaTemplate[] {
  return loadTemplates().sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function getCanvaTemplateById(id: string): CanvaTemplate | null {
  return loadTemplates().find((t) => t.id === id) ?? null;
}

/**
 * Save a Canva design as a reusable template.
 * De-duplicates by canvaTemplateId (updates existing entry if already saved).
 */
export function saveCanvaTemplate(
  data: Omit<CanvaTemplate, 'id' | 'savedAt'>,
): CanvaTemplate {
  const now = new Date().toISOString();
  const existing = loadTemplates().find((t) => t.canvaTemplateId === data.canvaTemplateId);
  if (existing) {
    // Update the existing entry in-place
    const updated: CanvaTemplate = { ...existing, ...data, savedAt: now };
    persistTemplates(loadTemplates().map((t) => (t.id === existing.id ? updated : t)));
    return updated;
  }
  const t: CanvaTemplate = {
    ...data,
    id: `ctpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    savedAt: now,
  };
  persistTemplates([t, ...loadTemplates()]);
  return t;
}

export function deleteCanvaTemplate(id: string): void {
  persistTemplates(loadTemplates().filter((t) => t.id !== id));
}
