import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Save, ArrowLeft, Plus, Trash2, Type, Image, Move, CheckCircle, AlertTriangle, ScanSearch, Loader2,
} from 'lucide-react';
import { convertAndSave, type EditorRegion } from './TemplateConverterService';
import {
  TEXT_PLACEHOLDER_LABELS, DEFAULT_REGION, type PlaceholderKey, type TemplateRegion,
} from '../../../store/templateStore';
import { analyzeTemplate, zonesToEditorRegions, type AnalysisProgress } from './TemplateAnalyzerService';

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 672; // display width in px
const MIN_SIZE = 30;
const HANDLE_SIZE = 10;

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const ALL_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  e: 'e-resize',  se: 'se-resize', s: 's-resize',
  sw: 'sw-resize', w: 'w-resize',
};

interface HandlePos { top: string; left: string; cursor: string }

function handlePosition(h: HandleId, rw: number, rh: number): HandlePos {
  const half = HANDLE_SIZE / 2;
  const mid = '50%';
  const m = `-${half}px`;
  const pos: Record<HandleId, { top: string; left: string }> = {
    nw: { top: m, left: m }, n: { top: m, left: mid }, ne: { top: m, left: `calc(100% - ${half}px)` },
    e: { top: mid, left: `calc(100% - ${half}px)` }, se: { top: `calc(100% - ${half}px)`, left: `calc(100% - ${half}px)` },
    s: { top: `calc(100% - ${half}px)`, left: mid }, sw: { top: `calc(100% - ${half}px)`, left: m },
    w: { top: mid, left: m },
  };
  // suppress unused params lint warning
  void rw; void rh;
  return { ...pos[h], cursor: HANDLE_CURSOR[h] };
}

// ── Interaction ref ────────────────────────────────────────────────────────────

interface Interaction {
  type: 'drag' | 'resize';
  regionId: string;
  handle?: HandleId;
  startMX: number; startMY: number;
  startBounds: { x: number; y: number; w: number; h: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function newEditorRegion(
  key: PlaceholderKey,
  regionType: 'text' | 'image',
  canvasH: number,
): EditorRegion {
  return {
    ...DEFAULT_REGION,
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type: regionType,
    placeholderKey: key,
    x: Math.round(CANVAS_W * 0.1),
    y: Math.round(canvasH * 0.1),
    width: Math.round(CANVAS_W * 0.8),
    height: regionType === 'image' ? 120 : 60,
  };
}

/** Convert persisted TemplateRegion (pct) → EditorRegion (px) for edit mode */
function fromPercentage(r: TemplateRegion, canvasH: number): EditorRegion {
  return {
    ...r,
    x: (r.xPct / 100) * CANVAS_W,
    y: (r.yPct / 100) * canvasH,
    width:  (r.wPct / 100) * CANVAS_W,
    height: (r.hPct / 100) * canvasH,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

interface LocationState {
  imageDataUrl: string;
  aspectRatio: number;
  templateName: string;
  existingId?: string;
  existingRegions?: TemplateRegion[];
}

export default function TemplateEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as Partial<LocationState>;

  const imageDataUrl = state.imageDataUrl ?? '';
  const aspectRatio  = state.aspectRatio  ?? 1.414;
  const CANVAS_H     = Math.round(CANVAS_W / aspectRatio);

  const [templateName, setTemplateName] = useState(state.templateName ?? 'Untitled Template');
  const [regions, setRegions]           = useState<EditorRegion[]>(() => {
    if (state.existingRegions && state.existingRegions.length > 0) {
      return state.existingRegions.map((r) => fromPercentage(r, CANVAS_H));
    }
    return [];
  });
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // OCR auto-detect state
  const [ocrRunning, setOcrRunning]     = useState(false);
  const [ocrProgress, setOcrProgress]   = useState<AnalysisProgress | null>(null);
  const [ocrSuggest, setOcrSuggest]     = useState<EditorRegion[] | null>(null);

  const canvasRef   = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);

  // ── Mouse interaction ───────────────────────────────────────────────────────

  const onMouseMove = useCallback((e: MouseEvent) => {
    const act = interaction.current;
    if (!act) return;
    const dx = e.clientX - act.startMX;
    const dy = e.clientY - act.startMY;
    const { x: sx, y: sy, w: sw, h: sh } = act.startBounds;

    setRegions((prev) => prev.map((r) => {
      if (r.id !== act.regionId) return r;
      if (act.type === 'drag') {
        return {
          ...r,
          x: Math.max(0, Math.min(CANVAS_W - r.width,  sx + dx)),
          y: Math.max(0, Math.min(CANVAS_H - r.height, sy + dy)),
        };
      }
      // resize
      let { x, y, width, height } = r;
      const h = act.handle!;
      if (h.includes('e')) { width  = Math.max(MIN_SIZE, sw + dx); }
      if (h.includes('w')) { width  = Math.max(MIN_SIZE, sw - dx); x = Math.min(sx + dx, sx + sw - MIN_SIZE); }
      if (h.includes('s')) { height = Math.max(MIN_SIZE, sh + dy); }
      if (h.includes('n')) { height = Math.max(MIN_SIZE, sh - dy); y = Math.min(sy + dy, sy + sh - MIN_SIZE); }
      return { ...r, x: Math.max(0, x), y: Math.max(0, y), width: Math.min(width, CANVAS_W - x), height: Math.min(height, CANVAS_H - y) };
    }));
  }, [CANVAS_H]);

  const onMouseUp = useCallback(() => {
    interaction.current = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove]);

  function startDrag(e: React.MouseEvent, regionId: string) {
    e.stopPropagation();
    const r = regions.find((x) => x.id === regionId)!;
    interaction.current = { type: 'drag', regionId, startMX: e.clientX, startMY: e.clientY, startBounds: { x: r.x, y: r.y, w: r.width, h: r.height } };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    setSelectedId(regionId);
  }

  function startResize(e: React.MouseEvent, regionId: string, handle: HandleId) {
    e.stopPropagation();
    const r = regions.find((x) => x.id === regionId)!;
    interaction.current = { type: 'resize', regionId, handle, startMX: e.clientX, startMY: e.clientY, startBounds: { x: r.x, y: r.y, w: r.width, h: r.height } };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  useEffect(() => () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove, onMouseUp]);

  // ── Region actions ──────────────────────────────────────────────────────────

  function addRegion(key: PlaceholderKey) {
    const type: 'text' | 'image' = key === 'chief_guests' ? 'image' : 'text';
    const r = newEditorRegion(key, type, CANVAS_H);
    setRegions((p) => [...p, r]);
    setSelectedId(r.id);
    setAddMenuOpen(false);
  }

  function removeRegion(id: string) {
    setRegions((p) => p.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function updateSelected<K extends keyof EditorRegion>(key: K, value: EditorRegion[K]) {
    setRegions((p) => p.map((r) => (r.id === selectedId ? { ...r, [key]: value } : r)));
  }

  const selected = useMemo(() => regions.find((r) => r.id === selectedId) ?? null, [regions, selectedId]);

  // ── OCR Auto-Detect ────────────────────────────────────────────────────────

  async function handleAutoDetect() {
    if (!imageDataUrl || ocrRunning) return;
    setOcrRunning(true);
    setOcrProgress({ status: 'Starting…', progress: 0 });
    setOcrSuggest(null);
    try {
      const result = await analyzeTemplate(imageDataUrl, (p) => setOcrProgress(p));
      const suggested = zonesToEditorRegions(
        result.zones,
        result.imageWidth,
        result.imageHeight,
        CANVAS_W,
        CANVAS_H,
      );
      if (suggested.length === 0) {
        setToast({ msg: 'No placeholder text detected. Try placing regions manually.', ok: false });
      } else {
        setOcrSuggest(suggested);
      }
    } catch (err) {
      setToast({ msg: `OCR failed: ${(err as Error).message}`, ok: false });
    } finally {
      setOcrRunning(false);
      setOcrProgress(null);
    }
  }

  function acceptOcrSuggestions() {
    if (!ocrSuggest) return;
    // Merge with existing — don't duplicate same placeholderKey zones
    setRegions((prev) => {
      const existingKeys = new Set(prev.map((r) => r.placeholderKey));
      const toAdd = ocrSuggest.filter((r) => !existingKeys.has(r.placeholderKey));
      return [...prev, ...toAdd];
    });
    setToast({ msg: `Added ${ocrSuggest.length} detected placeholder zone(s). Drag to fine-tune.`, ok: true });
    setOcrSuggest(null);
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  function handleSave() {
    if (!imageDataUrl) { setToast({ msg: 'No background image.', ok: false }); return; }
    const { validation } = convertAndSave({
      name: templateName,
      backgroundDataUrl: imageDataUrl,
      aspectRatio,
      editorRegions: regions,
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
      existingId: state.existingId,
    });
    const warns = validation.warnings.join(' ');
    if (!validation.valid) {
      setToast({ msg: warns || 'Cannot save.', ok: false });
    } else {
      setToast({ msg: 'Template successfully converted and stored in Branding Presets.' + (warns ? ` (${warns})` : ''), ok: true });
      setTimeout(() => navigate('/branding/templates'), 2000);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const PLACEHOLDER_KEYS = Object.keys(TEXT_PLACEHOLDER_LABELS) as PlaceholderKey[];

  if (!imageDataUrl) {
    return (
      <div className="max-w-lg mx-auto py-24 text-center">
        <p className="text-gray-500 text-sm">No image provided. Please go back and upload a PNG.</p>
        <button onClick={() => navigate('/branding/templates')} className="mt-4 text-purple-600 text-sm hover:underline">← Back to Templates</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium max-w-lg text-center
          ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <button onClick={() => navigate('/branding/templates')} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="flex-1 max-w-xs border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="Template name..."
        />
        <span className="text-xs text-gray-400 hidden sm:block">Drag regions · Click to select · Resize via handles</span>
        <button
          onClick={handleSave}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" /> Save Template
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Canvas area ── */}
        <div className="flex-1 overflow-auto bg-gray-900 flex items-start justify-center p-6">
          <div
            ref={canvasRef}
            className="relative flex-shrink-0 select-none"
            style={{ width: CANVAS_W, height: CANVAS_H }}
            onMouseDown={() => setSelectedId(null)}
          >
            {/* Background image */}
            <img
              src={imageDataUrl}
              alt="Template background"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              draggable={false}
            />

            {/* Regions */}
            {regions.map((r) => {
              const isSelected = r.id === selectedId;
              return (
                <div
                  key={r.id}
                  className={`absolute group border-2 transition-colors
                    ${isSelected ? 'border-purple-400' : 'border-white/60 hover:border-purple-300'}`}
                  style={{
                    left: r.x, top: r.y, width: r.width, height: r.height,
                    cursor: 'move',
                    backgroundColor: isSelected
                      ? (r.type === 'image' ? 'rgba(59,130,246,0.3)' : 'rgba(147,51,234,0.3)')
                      : (r.type === 'image' ? 'rgba(59,130,246,0.15)' : 'rgba(147,51,234,0.15)'),
                  }}
                  onMouseDown={(e) => startDrag(e, r.id)}
                >
                  {/* Region label */}
                  <div className={`absolute -top-5 left-0 flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-t-lg whitespace-nowrap
                    ${r.type === 'image' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'}`}>
                    {r.type === 'image' ? <Image className="w-3 h-3" /> : <Type className="w-3 h-3" />}
                    {r.placeholderKey}
                  </div>

                  {/* Move icon */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                    <Move className="w-5 h-5 text-white" />
                  </div>

                  {/* Resize handles (visible only when selected) */}
                  {isSelected && ALL_HANDLES.map((h) => {
                    const pos = handlePosition(h, r.width, r.height);
                    return (
                      <div
                        key={h}
                        className="absolute w-2.5 h-2.5 bg-white border-2 border-purple-500 rounded-sm z-10"
                        style={{
                          top: pos.top, left: pos.left,
                          cursor: pos.cursor,
                          transform: 'translate(-50%, -50%)',
                          marginTop: 0, marginLeft: 0,
                        }}
                        onMouseDown={(e) => { e.stopPropagation(); startResize(e, r.id, h); }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel ── */}
        <aside className="w-72 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">

          {/* ── OCR Auto-Detect ── */}
          <div className="p-4 border-b border-gray-100 bg-gradient-to-br from-purple-50 to-indigo-50">
            <div className="flex items-center gap-2 mb-2">
              <ScanSearch className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-bold text-purple-800">Auto-Detect Placeholders</span>
            </div>
            <p className="text-xs text-purple-600 mb-2.5 leading-relaxed">
              Uses OCR to scan your template image and automatically find placeholder text regions.
            </p>

            {/* Progress bar */}
            {ocrRunning && ocrProgress && (
              <div className="mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                  <span className="text-xs text-purple-600">{ocrProgress.status}</span>
                </div>
                <div className="w-full bg-purple-100 rounded-full h-1.5">
                  <div
                    className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round(ocrProgress.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* OCR suggestion confirmation */}
            {ocrSuggest && !ocrRunning && (
              <div className="mb-2.5 bg-white border border-purple-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-purple-800 mb-1">
                  ✦ {ocrSuggest.length} zone{ocrSuggest.length !== 1 ? 's' : ''} detected
                </p>
                <ul className="text-xs text-purple-600 space-y-0.5 mb-2.5">
                  {ocrSuggest.map((r, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                      {r.placeholderKey}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-1.5">
                  <button
                    onClick={acceptOcrSuggestions}
                    className="flex-1 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700"
                  >
                    Accept All
                  </button>
                  <button
                    onClick={() => setOcrSuggest(null)}
                    className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleAutoDetect}
              disabled={ocrRunning || !imageDataUrl}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {ocrRunning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                : <><ScanSearch className="w-3.5 h-3.5" /> Scan Template for Placeholders</>
              }
            </button>
          </div>

          {/* Add region */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <button
                onClick={() => setAddMenuOpen((v) => !v)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-purple-300 text-purple-600 text-sm font-semibold hover:bg-purple-50 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Placeholder Region
              </button>
              {addMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-20 py-1 max-h-56 overflow-y-auto">
                  {PLACEHOLDER_KEYS.map((key) => {
                    const isImage = key === 'chief_guests';
                    return (
                      <button
                        key={key}
                        onClick={() => addRegion(key)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors text-left"
                      >
                        {isImage ? <Image className="w-4 h-4 text-blue-500" /> : <Type className="w-4 h-4 text-purple-500" />}
                        <span>{TEXT_PLACEHOLDER_LABELS[key]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Region list */}
          <div className="p-3 border-b border-gray-100 space-y-1.5">
            {regions.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">No regions yet. Add placeholders above.</p>
            )}
            {regions.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors
                  ${r.id === selectedId ? 'bg-purple-100 text-purple-800' : 'hover:bg-gray-50 text-gray-700'}`}
              >
                {r.type === 'image' ? <Image className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" /> : <Type className="w-3.5 h-3.5 flex-shrink-0 text-purple-500" />}
                <span className="text-xs font-medium flex-1 truncate">{r.placeholderKey}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeRegion(r.id); }}
                  className="p-0.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Properties panel */}
          {selected ? (
            <div className="p-4 space-y-4 flex-1">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Region Properties</p>

              {/* Placeholder key */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Placeholder</label>
                <select
                  value={selected.placeholderKey}
                  onChange={(e) => {
                    const key = e.target.value as PlaceholderKey;
                    updateSelected('placeholderKey', key);
                    updateSelected('type', key === 'chief_guests' ? 'image' : 'text');
                  }}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                >
                  {PLACEHOLDER_KEYS.map((k) => (
                    <option key={k} value={k}>{TEXT_PLACEHOLDER_LABELS[k]}</option>
                  ))}
                </select>
              </div>

              {selected.type === 'text' ? (
                <>
                  {/* Font size */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Font Size (px)</label>
                    <input type="number" min={8} max={120} value={selected.fontSize}
                      onChange={(e) => updateSelected('fontSize', Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-purple-500" />
                  </div>

                  {/* Color */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">Text Color</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={selected.color}
                          onChange={(e) => updateSelected('color', e.target.value)}
                          className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
                        <input type="text" value={selected.color}
                          onChange={(e) => updateSelected('color', e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-purple-500 font-mono" />
                      </div>
                    </div>
                  </div>

                  {/* Weight + Style */}
                  <div className="flex gap-2">
                    <button onClick={() => updateSelected('fontWeight', selected.fontWeight === 'bold' ? 'normal' : 'bold')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selected.fontWeight === 'bold' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                      Bold
                    </button>
                    <button onClick={() => updateSelected('fontStyle', selected.fontStyle === 'italic' ? 'normal' : 'italic')}
                      className={`flex-1 py-1.5 rounded-lg text-xs italic border transition-colors ${selected.fontStyle === 'italic' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                      Italic
                    </button>
                  </div>

                  {/* Alignment */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Alignment</label>
                    <div className="flex gap-2">
                      {(['left', 'center', 'right'] as const).map((a) => (
                        <button key={a} onClick={() => updateSelected('textAlign', a)}
                          className={`flex-1 py-1.5 rounded-lg text-xs capitalize border transition-colors
                            ${selected.textAlign === a ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Max count */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Max Guest Images</label>
                    <input type="number" min={1} max={10} value={selected.maxCount}
                      onChange={(e) => updateSelected('maxCount', Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-purple-500" />
                  </div>
                  {/* Layout */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Layout</label>
                    <div className="flex gap-2">
                      {(['row', 'grid'] as const).map((l) => (
                        <button key={l} onClick={() => updateSelected('layout', l)}
                          className={`flex-1 py-1.5 rounded-lg text-xs capitalize border transition-colors
                            ${selected.layout === l ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Position readout */}
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-gray-500">Position</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 font-mono">
                  <span>x: {selected.x.toFixed(0)}px</span>
                  <span>y: {selected.y.toFixed(0)}px</span>
                  <span>w: {selected.width.toFixed(0)}px</span>
                  <span>h: {selected.height.toFixed(0)}px</span>
                </div>
              </div>

              <button
                onClick={() => removeRegion(selected.id)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove Region
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center px-6 py-8">
              <p className="text-xs text-gray-400">Click a region to edit its properties, or add new regions with the button above.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
