/**
 * TemplateAnalyzerService.ts
 *
 * Uses Tesseract.js OCR to scan a poster template image,
 * find placeholder text, and suggest EditorRegion zones.
 *
 * Tesseract.js v7 data tree:
 *   result.data.blocks[] → Block
 *     .paragraphs[]      → Paragraph
 *       .lines[]         → Line  { text, confidence, bbox, words[] }
 *         .words[]       → Word  { text, confidence, bbox }
 *
 * bbox = { x0, y0, x1, y1 } in original image pixel coords.
 */

import { createWorker } from 'tesseract.js';
import type { PlaceholderKey } from '../../../store/templateStore';
import type { EditorRegion } from './TemplateConverterService';
import { DEFAULT_REGION } from '../../../store/templateStore';

// ── Placeholder patterns ──────────────────────────────────────────────────────

const PATTERNS: Array<{
  regex: RegExp;
  key: PlaceholderKey;
  regionType: 'text' | 'image';
  style: Partial<EditorRegion>;
}> = [
  { regex: /event\s*(name|title)/i,          key: 'event_title',     regionType: 'text',  style: { fontSize: 36, fontWeight: 'bold',   textAlign: 'center', color: '#b91c1c' } },
  { regex: /event\s*type|workshop|seminar|webinar|hackathon|symposium/i,
                                              key: 'event_type',      regionType: 'text',  style: { fontSize: 14, fontWeight: 'bold',   textAlign: 'center', color: '#b91c1c' } },
  { regex: /^venue\s*(?:location)?$|^location$/i, key: 'venue',       regionType: 'text',  style: { fontSize: 13, fontWeight: 'normal', textAlign: 'left',   color: '#111827' } },
  { regex: /month.*year|date.*tbd/i,          key: 'date_time',       regionType: 'text',  style: { fontSize: 12, fontWeight: 'normal', textAlign: 'left',   color: '#111827' } },
  { regex: /\d{2}\.\d{2}\s*[ap]\.m\.|time\s*tbd|onwards|00\.00/i,
                                              key: 'date_time',       regionType: 'text',  style: { fontSize: 12, fontWeight: 'normal', textAlign: 'left',   color: '#111827' } },
  { regex: /chief\s*guest\s*\d?|resource\s*person/i,
                                              key: 'resource_person', regionType: 'text',  style: { fontSize: 14, fontWeight: 'bold',   textAlign: 'center', color: '#1e3a8a' } },
  { regex: /\[position\s*title\]|\[company\s*name\]|\[location\]|\[skill/i,
                                              key: 'resource_person', regionType: 'text',  style: { fontSize: 10, fontWeight: 'normal', textAlign: 'center', color: '#374151' } },
  { regex: /department\s*of|dept\.\s*of/i,   key: 'department',      regionType: 'text',  style: { fontSize: 14, fontWeight: 'bold',   textAlign: 'center', color: '#ffffff' } },
  { regex: /coordinator|faculty\s*in\s*charge/i,
                                              key: 'coordinators',    regionType: 'text',  style: { fontSize: 11, fontWeight: 'bold',   textAlign: 'center', color: '#1e3a8a' } },
  { regex: /participant|eligible|all\s*(?:are|students)/i,
                                              key: 'participants',    regionType: 'text',  style: { fontSize: 11, fontWeight: 'normal', textAlign: 'center', color: '#374151' } },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnalysisProgress = { status: string; progress: number };
export type ProgressCallback = (p: AnalysisProgress) => void;

export interface DetectedZone {
  key: PlaceholderKey;
  regionType: 'text' | 'image';
  bbox: { x0: number; y0: number; x1: number; y1: number };
  text: string;
  confidence: number;
  style: Partial<EditorRegion>;
}

export interface AnalysisResult {
  zones: DetectedZone[];
  rawText: string;
  imageWidth: number;
  imageHeight: number;
}

// ── Main analysis ─────────────────────────────────────────────────────────────

export async function analyzeTemplate(
  imageDataUrl: string,
  onProgress?: ProgressCallback,
): Promise<AnalysisResult> {
  onProgress?.({ status: 'Starting OCR engine…', progress: 0.05 });

  const { width: imageWidth, height: imageHeight } = await imgDims(imageDataUrl);

  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.({ status: 'Recognizing text…', progress: 0.1 + m.progress * 0.75 });
      } else if (m.status === 'loading language traineddata') {
        onProgress?.({ status: 'Loading language data…', progress: 0.06 + m.progress * 0.04 });
      }
    },
  });

  onProgress?.({ status: 'Running OCR…', progress: 0.1 });
  const result = await worker.recognize(imageDataUrl);
  await worker.terminate();

  onProgress?.({ status: 'Matching placeholder patterns…', progress: 0.87 });

  const rawText = result.data.text;

  // Flatten tree: blocks → paragraphs → lines → words
  type BBox = { x0: number; y0: number; x1: number; y1: number };
  const lines: Array<{ text: string; confidence: number; bbox: BBox }> = [];
  const words: Array<{ text: string; confidence: number; bbox: BBox }> = [];

  for (const block of (result.data.blocks ?? [])) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        lines.push({ text: line.text.trim(), confidence: line.confidence, bbox: line.bbox });
        for (const word of line.words) {
          words.push({ text: word.text.trim(), confidence: word.confidence, bbox: word.bbox });
        }
      }
    }
  }

  const zones: DetectedZone[] = [];
  const usedKeys = new Set<string>();

  // Pass 1: match at line level
  for (const line of lines) {
    if (!line.text || line.confidence < 30) continue;
    for (const pat of PATTERNS) {
      if (pat.regex.test(line.text)) {
        const dk = `${pat.key}:${line.bbox.x0}:${line.bbox.y0}`;
        if (usedKeys.has(dk)) continue;
        usedKeys.add(dk);
        zones.push({ key: pat.key, regionType: pat.regionType, bbox: line.bbox, text: line.text, confidence: line.confidence, style: pat.style });
        break;
      }
    }
  }

  // Pass 2: word level for anything missed
  for (const word of words) {
    if (!word.text || word.confidence < 35) continue;
    for (const pat of PATTERNS) {
      if (pat.regex.test(word.text)) {
        const nearby = zones.some((z) => z.key === pat.key && Math.abs(z.bbox.y0 - word.bbox.y0) < 20);
        const dk = `${pat.key}:${word.bbox.x0}:${word.bbox.y0}`;
        if (nearby || usedKeys.has(dk)) continue;
        usedKeys.add(dk);
        zones.push({ key: pat.key, regionType: pat.regionType, bbox: word.bbox, text: word.text, confidence: word.confidence, style: pat.style });
        break;
      }
    }
  }

  onProgress?.({ status: 'Done!', progress: 1 });
  return { zones, rawText, imageWidth, imageHeight };
}

// ── Zones → EditorRegions ─────────────────────────────────────────────────────

export function zonesToEditorRegions(
  zones: DetectedZone[],
  imageWidth: number,
  imageHeight: number,
  canvasW: number,
  canvasH: number,
): EditorRegion[] {
  const sx = canvasW / imageWidth;
  const sy = canvasH / imageHeight;

  return zones.map((zone, i) => {
    const x = Math.max(0, Math.round(zone.bbox.x0 * sx));
    const y = Math.max(0, Math.round(zone.bbox.y0 * sy));
    const w = Math.max(40, Math.round((zone.bbox.x1 - zone.bbox.x0) * sx));
    const h = Math.max(22, Math.round((zone.bbox.y1 - zone.bbox.y0) * sy));
    return {
      ...DEFAULT_REGION,
      ...zone.style,
      id: `ocr_${i}_${Date.now().toString(36)}`,
      type: zone.regionType,
      placeholderKey: zone.key,
      x,
      y,
      width:  Math.min(w, canvasW - x),
      height: Math.min(h, canvasH - y),
    } as EditorRegion;
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────

function imgDims(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}
