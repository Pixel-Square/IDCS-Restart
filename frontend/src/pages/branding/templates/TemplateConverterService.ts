/**
 * TemplateConverterService.ts
 *
 * Converts editor pixel-based regions to portable percentage-based
 * TemplateRegion metadata, validates the result, and integrates with
 * templateStore to persist the final BrandingTemplate.
 */
import {
  saveTemplate,
  updateTemplate,
  type BrandingTemplate,
  type TemplateRegion,
  type PlaceholderKey,
} from '../../../store/templateStore';

// ── Editor region (pixels) ────────────────────────────────────────────────────

export interface EditorRegion {
  id: string;
  type: 'text' | 'image';
  placeholderKey: PlaceholderKey;
  /** Pixel coords relative to the editor canvas top-left */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  textAlign: 'left' | 'center' | 'right';
  maxCount: number;
  layout: 'row' | 'grid';
}

// ── Conversion ────────────────────────────────────────────────────────────────

/**
 * Convert pixel-based editor regions to percentage-based TemplateRegions.
 *
 * @param regions   Regions in editor pixels
 * @param canvasW   Canvas pixel width  (container.clientWidth)
 * @param canvasH   Canvas pixel height (container.clientHeight)
 */
export function convertRegions(
  regions: EditorRegion[],
  canvasW: number,
  canvasH: number,
): TemplateRegion[] {
  return regions.map((r) => ({
    id: r.id,
    type: r.type,
    placeholderKey: r.placeholderKey,
    xPct: clamp((r.x / canvasW) * 100),
    yPct: clamp((r.y / canvasH) * 100),
    wPct: clamp((r.width  / canvasW) * 100),
    hPct: clamp((r.height / canvasH) * 100),
    fontSize: r.fontSize,
    fontWeight: r.fontWeight,
    fontStyle: r.fontStyle,
    color: r.color,
    textAlign: r.textAlign,
    maxCount: r.maxCount,
    layout: r.layout,
  }));
}

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateRegions(regions: TemplateRegion[]): ValidationResult {
  const warnings: string[] = [];
  if (regions.length === 0) {
    return { valid: false, warnings: ['No regions defined. Add at least one placeholder.'] };
  }
  const keys = regions.map((r) => r.placeholderKey);
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (duplicates.length > 0) {
    warnings.push(`Duplicate placeholder keys: ${[...new Set(duplicates)].join(', ')}`);
  }
  if (!keys.includes('event_title')) {
    warnings.push('No Event Title region — it will not appear on the poster.');
  }
  return { valid: true, warnings };
}

// ── Save ──────────────────────────────────────────────────────────────────────

export interface SavePayload {
  name: string;
  backgroundDataUrl: string;
  aspectRatio: number;
  editorRegions: EditorRegion[];
  canvasW: number;
  canvasH: number;
  existingId?: string;   // supply when editing an existing template
}

export function convertAndSave(payload: SavePayload): {
  template: BrandingTemplate;
  validation: ValidationResult;
} {
  const regions = convertRegions(payload.editorRegions, payload.canvasW, payload.canvasH);
  const validation = validateRegions(regions);

  let template: BrandingTemplate;
  if (payload.existingId) {
    const updated = updateTemplate(payload.existingId, {
      name: payload.name,
      backgroundDataUrl: payload.backgroundDataUrl,
      aspectRatio: payload.aspectRatio,
      regions,
    });
    template = updated!;
  } else {
    template = saveTemplate({
      name: payload.name,
      backgroundDataUrl: payload.backgroundDataUrl,
      aspectRatio: payload.aspectRatio,
      regions,
    });
  }

  return { template, validation };
}
