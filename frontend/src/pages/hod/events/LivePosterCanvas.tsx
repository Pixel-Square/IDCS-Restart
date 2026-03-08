/**
 * LivePosterCanvas.tsx
 *
 * Renders a Canva (or any image-based) template as the poster background and
 * overlays interactive, bidirectionally-synced editing zones on top.
 *
 * How it works:
 *  1. The template image is displayed as a <img> that fills the container.
 *  2. When the image loads, Tesseract OCR runs in the background — it scans
 *     the image and guesses where placeholders live (title, venue, date, etc.).
 *  3. Each detected zone is rendered as an `position:absolute` overlay div
 *     whose coordinates are expressed as percentages of the container size —
 *     so layout is pixel-perfect on any screen width.
 *  4. EDITING:
 *     - Left form  → zone text updates instantly (formState drives all values).
 *     - Click zone → inline <input>/<textarea> appears inside that zone.
 *       Typing updates the shared EventFormState → left form updates too.
 *  5. The component forwards its ref to the outer wrapper so PNG/PDF export
 *     works exactly as before.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Loader2, ScanSearch, CheckCircle2, Edit2, X } from 'lucide-react';
import {
  analyzeTemplate,
  type DetectedZone,
  type AnalysisProgress,
} from '../../branding/templates/TemplateAnalyzerService';
import type { PlaceholderKey } from '../../../store/templateStore';
import type { EventFormState } from './HodEventForm';

// ─── zone ↔ form-field mapping ───────────────────────────────────────────────

function fmtDateTime(dt: string): string {
  if (!dt) return '';
  const d = new Date(dt);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function zoneLabel(key: PlaceholderKey): string {
  const MAP: Partial<Record<PlaceholderKey, string>> = {
    event_title:     'Event Title',
    event_type:      'Event Type',
    venue:           'Venue',
    date_time:       'Date & Time',
    resource_person: 'Chief Guest / Resource Person',
    coordinators:    'Coordinator',
    participants:    'Participants',
    department:      'Department',
  };
  return MAP[key] ?? key;
}

function getZoneValue(key: PlaceholderKey, form: EventFormState): string {
  switch (key) {
    case 'event_title':     return form.title;
    case 'event_type':      return form.eventType;
    case 'venue':           return form.venue;
    case 'date_time':       return fmtDateTime(form.dateTime);
    case 'resource_person': return form.resourcePersons?.[0]?.name || '';
    case 'coordinators':    return [form.facultyCoordinator1, form.facultyCoordinator2].filter(Boolean).join(' · ');
    case 'participants':    return form.participants || '';
    default:                return '';
  }
}

function setZoneValue(
  key: PlaceholderKey,
  value: string,
  form: EventFormState,
  onChange: (f: EventFormState) => void,
) {
  switch (key) {
    case 'event_title':
      onChange({ ...form, title: value }); break;
    case 'event_type':
      onChange({ ...form, eventType: value }); break;
    case 'venue':
      onChange({ ...form, venue: value }); break;
    case 'resource_person': {
      const rp0 = form.resourcePersons?.[0] ?? { name: '', designation: '', photoDataUrl: '' };
      onChange({ ...form, resourcePersons: [{ ...rp0, name: value }, ...form.resourcePersons.slice(1)] });
      break;
    }
    case 'coordinators':
      onChange({ ...form, facultyCoordinator1: value }); break;
    case 'participants':
      onChange({ ...form, participants: value }); break;
    // date_time and department are not free-text editable here
    default: break;
  }
}

// ─── zone colour scheme ───────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  active:   { border: '#2563eb', bg: 'rgba(37,99,235,0.12)',  text: '#1e40af' },
  filled:   { border: '#16a34a', bg: 'rgba(22,163,74,0.08)',  text: '#166534' },
  empty:    { border: '#d97706', bg: 'rgba(217,119,6,0.07)',  text: '#92400e' },
};

function zoneColors(key: PlaceholderKey, form: EventFormState, active: boolean) {
  if (active) return ZONE_COLORS.active;
  return getZoneValue(key, form) ? ZONE_COLORS.filled : ZONE_COLORS.empty;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface PositionedZone extends DetectedZone {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface LivePosterCanvasProps {
  imageDataUrl: string;
  formState: EventFormState;
  onChange: (f: EventFormState) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

const LivePosterCanvas = forwardRef<HTMLDivElement, LivePosterCanvasProps>(
  ({ imageDataUrl, formState, onChange }, ref) => {
    const imgRef      = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [zones,        setZones]        = useState<PositionedZone[]>([]);
    const [analyzing,    setAnalyzing]    = useState(false);
    const [progress,     setProgress]     = useState<AnalysisProgress | null>(null);
    const [analysisDone, setAnalysisDone] = useState(false);
    const [activeKey,    setActiveKey]    = useState<string | null>(null);
    const [imgNW,        setImgNW]        = useState(0);
    const [imgNH,        setImgNH]        = useState(0);

    // ─── Run OCR whenever the image changes ───────────────────────────────────
    useEffect(() => {
      if (!imageDataUrl) return;
      setZones([]);
      setAnalysisDone(false);
      setActiveKey(null);

      let cancelled = false;
      setAnalyzing(true);

      (async () => {
        try {
          const result = await analyzeTemplate(imageDataUrl, (p) => {
            if (!cancelled) setProgress(p);
          });

          if (cancelled) return;

          const { imageWidth: iw, imageHeight: ih } = result;
          setImgNW(iw);
          setImgNH(ih);

          // De-duplicate zones by key (keep highest confidence per key)
          const seen = new Map<string, PositionedZone>();
          for (const z of result.zones) {
            const existing = seen.get(z.key);
            if (!existing || z.confidence > existing.confidence) {
              seen.set(z.key, {
                ...z,
                xPct: (z.bbox.x0 / iw) * 100,
                yPct: (z.bbox.y0 / ih) * 100,
                wPct: ((z.bbox.x1 - z.bbox.x0) / iw) * 100,
                hPct: ((z.bbox.y1 - z.bbox.y0) / ih) * 100,
              });
            }
          }
          setZones(Array.from(seen.values()));
          setAnalysisDone(true);
        } catch (err) {
          console.warn('[LivePosterCanvas] OCR error:', err);
          setAnalysisDone(true);
        } finally {
          if (!cancelled) setAnalyzing(false);
        }
      })();

      return () => { cancelled = true; };
    }, [imageDataUrl]);

    // ─── Editable zone handlers ────────────────────────────────────────────────
    const handleZoneClick = useCallback((key: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveKey(key);
    }, []);

    const handleZoneBlur = useCallback(() => {
      // Small delay so a click inside the same zone doesn't immediately blur
      setTimeout(() => setActiveKey(null), 150);
    }, []);

    const handleDismiss = useCallback(() => setActiveKey(null), []);

    // ─── render ────────────────────────────────────────────────────────────────
    return (
      <div
        ref={ref}
        style={{ position: 'relative', width: '480px', maxWidth: '100%', flexShrink: 0, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', borderRadius: 6, overflow: 'hidden' }}
        onClick={handleDismiss}
      >
        {/* ── template image ── */}
        <img
          ref={imgRef}
          src={imageDataUrl}
          alt="Poster template"
          style={{ width: '100%', display: 'block' }}
          onLoad={(e) => {
            const img = e.currentTarget;
            setImgNW(img.naturalWidth);
            setImgNH(img.naturalHeight);
          }}
        />

        {/* ── interactive zone overlays ── */}
        {zones.map((z) => {
          const isActive = activeKey === z.key;
          const colors   = zoneColors(z.key, formState, isActive);
          const val      = getZoneValue(z.key, formState);

          return (
            <div
              key={z.key}
              style={{
                position:   'absolute',
                left:       `${z.xPct}%`,
                top:        `${z.yPct}%`,
                width:      `${Math.max(z.wPct, 15)}%`,
                minHeight:  `${Math.max(z.hPct, 4)}%`,
                border:     `2px ${isActive ? 'solid' : 'dashed'} ${colors.border}`,
                background: colors.bg,
                borderRadius: 3,
                cursor:     'text',
                transition: 'border 0.15s, background 0.15s',
                zIndex:     isActive ? 20 : 10,
              }}
              title={`Click to edit: ${zoneLabel(z.key)}`}
              onClick={(e) => handleZoneClick(z.key, e)}
            >
              {/* zone label chip */}
              <span style={{
                position:   'absolute',
                top:        -18,
                left:       0,
                fontSize:   9,
                lineHeight: '14px',
                padding:    '1px 5px',
                borderRadius: 3,
                background: colors.border,
                color:      '#fff',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex:     30,
                letterSpacing: '0.02em',
              }}>
                {zoneLabel(z.key)}
              </span>

              {isActive ? (
                /* ── inline text editor ── */
                <div
                  style={{ width: '100%', height: '100%' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {(z.key === 'event_title') ? (
                    <textarea
                      autoFocus
                      value={val}
                      onChange={(e) => setZoneValue(z.key, e.target.value, formState, onChange)}
                      onBlur={handleZoneBlur}
                      rows={2}
                      style={{
                        width: '100%', background: 'rgba(255,255,255,0.92)',
                        border: 'none', outline: 'none', resize: 'none',
                        fontSize: 11, fontWeight: 700, color: colors.text,
                        padding: '3px 5px', borderRadius: 2,
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <input
                      autoFocus
                      type={z.key === 'date_time' ? 'datetime-local' : 'text'}
                      value={z.key === 'date_time' ? formState.dateTime : val}
                      onChange={(e) => {
                        if (z.key === 'date_time') {
                          onChange({ ...formState, dateTime: e.target.value });
                        } else {
                          setZoneValue(z.key, e.target.value, formState, onChange);
                        }
                      }}
                      onBlur={handleZoneBlur}
                      style={{
                        width: '100%', background: 'rgba(255,255,255,0.92)',
                        border: 'none', outline: 'none',
                        fontSize: 11, color: colors.text,
                        padding: '3px 5px', borderRadius: 2,
                        fontFamily: 'inherit',
                      }}
                    />
                  )}
                </div>
              ) : (
                /* ── display value or placeholder hint ── */
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 10, padding: '2px 4px',
                  color: val ? colors.text : colors.border,
                  fontStyle: val ? 'normal' : 'italic',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                }}>
                  <Edit2 size={8} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    fontWeight: val ? 600 : 400,
                  }}>
                    {val || `Enter ${zoneLabel(z.key)}`}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* ── OCR progress overlay ── */}
        {analyzing && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(15,23,42,0.72)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 12, zIndex: 50,
            borderRadius: 'inherit',
          }}>
            <Loader2 size={28} color="#a78bfa" style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#c4b5fd', fontSize: 12, fontWeight: 600, margin: 0 }}>
                Analysing template…
              </p>
              <p style={{ color: '#7c3aed', fontSize: 10, margin: '4px 0 0', opacity: 0.8 }}>
                {progress?.status ?? 'Initialising OCR engine'}
              </p>
            </div>
            {/* progress bar */}
            <div style={{ width: 160, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 9 }}>
              <div style={{
                width: `${(progress?.progress ?? 0) * 100}%`,
                height: '100%', background: '#7c3aed', borderRadius: 9,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {/* ── analysis done badge ── */}
        {analysisDone && !analyzing && zones.length > 0 && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: '#16a34a', color: '#fff',
            borderRadius: 20, padding: '4px 10px',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            zIndex: 40,
          }}>
            <CheckCircle2 size={11} />
            {zones.length} zones detected — click to edit
          </div>
        )}

        {/* ── no zones found ── */}
        {analysisDone && !analyzing && zones.length === 0 && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: '#d97706', color: '#fff',
            borderRadius: 20, padding: '4px 10px',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            zIndex: 40,
          }}>
            <ScanSearch size={11} />
            Edit via form · No text zones detected
          </div>
        )}

        {/* ── global spin keyframes (injected once) ── */}
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }
);

LivePosterCanvas.displayName = 'LivePosterCanvas';
export default LivePosterCanvas;
