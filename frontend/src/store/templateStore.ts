/**
 * templateStore.ts
 *
 * Centralised store for Branding user poster templates.
 * Templates are persisted in localStorage under STORAGE_KEY.
 * Each template stores the background PNG as a base-64 data-URL alongside
 * structured region metadata so HOD event creation can inject live data.
 */

const STORAGE_KEY = 'idcs_branding_templates';

// ── Region types ──────────────────────────────────────────────────────────────

export type PlaceholderKey =
  | 'event_title'
  | 'venue'
  | 'department'
  | 'date_time'
  | 'coordinators'
  | 'chief_guests';

export type RegionType = 'text' | 'image';

export type TextAlign = 'left' | 'center' | 'right';

export interface TemplateRegion {
  id: string;
  type: RegionType;
  placeholderKey: PlaceholderKey;
  /** Position and dimensions as % of canvas (0–100).  Stored this way so
   *  the template is resolution-independent. */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  // ── text props ──────────────────────────────────────────────────
  fontSize: number;         // px at 600-wide canvas
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  textAlign: TextAlign;
  // ── image props ─────────────────────────────────────────────────
  maxCount: number;          // chief_guests: max images in grid
  layout: 'row' | 'grid';   // arrangement of multiple images
}

// ── Template ──────────────────────────────────────────────────────────────────

export interface BrandingTemplate {
  id: string;
  name: string;
  backgroundDataUrl: string;   // base-64 PNG uploaded by branding user
  /** Natural aspect ratio stored so renderer can compute canvas height:
   *  canvasHeight = canvasWidth / aspectRatio */
  aspectRatio: number;
  regions: TemplateRegion[];
  createdAt: string;
  updatedAt: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_REGION: Omit<TemplateRegion, 'id' | 'placeholderKey'> = {
  type: 'text',
  xPct: 10, yPct: 10, wPct: 80, hPct: 10,
  fontSize: 28,
  fontWeight: 'bold',
  fontStyle: 'normal',
  color: '#ffffff',
  textAlign: 'center',
  maxCount: 4,
  layout: 'row',
};

export const TEXT_PLACEHOLDER_LABELS: Record<PlaceholderKey, string> = {
  event_title:  'Event Title',
  venue:        'Venue',
  department:   'Department',
  date_time:    'Date & Time',
  coordinators: 'Coordinators',
  chief_guests: 'Chief Guests (images)',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function load(): BrandingTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BrandingTemplate[]) : [];
  } catch {
    return [];
  }
}

function save(templates: BrandingTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getAllTemplates(): BrandingTemplate[] {
  return load().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getTemplateById(id: string): BrandingTemplate | null {
  return load().find((t) => t.id === id) ?? null;
}

export function saveTemplate(template: Omit<BrandingTemplate, 'id' | 'createdAt' | 'updatedAt'>): BrandingTemplate {
  const now = new Date().toISOString();
  const t: BrandingTemplate = {
    ...template,
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
  };
  const all = load();
  all.unshift(t);
  save(all);
  return t;
}

export function updateTemplate(id: string, patch: Partial<BrandingTemplate>): BrandingTemplate | null {
  const all = load();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  save(all);
  return all[idx];
}

export function deleteTemplate(id: string): void {
  save(load().filter((t) => t.id !== id));
}
