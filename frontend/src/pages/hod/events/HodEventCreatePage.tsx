import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileDown, FileText, Send, Save, ChevronLeft, Eye, EyeOff,
  FileImage, LayoutTemplate, Download, Loader2, RefreshCw,
} from 'lucide-react';
import HodEventForm, { type EventFormState } from './HodEventForm';
import PosterPreview                          from './PosterPreview';
import PosterRenderer                         from './PosterRenderer';
import LivePosterCanvas                       from './LivePosterCanvas';
import { exportAsPDF, exportAsPNG, exportAsDoc } from './ExportService';
import { createEvent, submitEventToIqac, updateEvent, type CollegeEvent } from '../../../store/eventStore';
import { getAllTemplates, type BrandingTemplate } from '../../../store/templateStore';

// ─── form defaults ────────────────────────────────────────────────────────────

const EMPTY_FORM: EventFormState = {
  title: '',
  eventType: '',
  participants: '',
  venue: '',
  dateTime: '',
  resourcePersons: [{ name: '', designation: '', photoDataUrl: '' }],
  facultyCoordinator1: '',
  facultyCoordinator2: '',
  studentCoordinator: '',
  departmentLogoDataUrl: '',
  coordinatorCount: 1,
  hasChiefGuest: false,
  guestCount: 1,
  chiefGuests: [],
};

// ─── identity helper ──────────────────────────────────────────────────────────

function getCreatorIdentity(): { username: string; displayName: string } {
  for (const key of ['me', 'branding_user', 'user']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const u = JSON.parse(raw) as Record<string, unknown>;
      const un = String((u as any)?.username || (u as any)?.user?.username || '').trim();
      const dn = String(
        (u as any)?.profile?.full_name || (u as any)?.profile?.fullName ||
        (u as any)?.full_name          || (u as any)?.fullName          ||
        (u as any)?.name               || ''
      ).trim();
      if (un) return { username: un, displayName: dn || un };
    } catch { /* ignore */ }
  }
  return { username: 'hod', displayName: 'hod' };
}

// ─── Canva DB template shape (from /api/canva/templates) ─────────────────────

interface DbCanvaTemplate {
  id: number;
  name: string;
  canvaTemplateId: string;
  previewUrl: string;
  editUrl?: string;
}

// ─── template source discriminated union ─────────────────────────────────────

type TemplateSource =
  | { type: 'coded' }
  | { type: 'canva'; tpl: DbCanvaTemplate }
  | { type: 'local'; tpl: BrandingTemplate };

// ─── main component ───────────────────────────────────────────────────────────

export default function HodEventCreatePage() {
  const navigate  = useNavigate();
  const posterRef = useRef<HTMLDivElement>(null);

  const [form, setForm]               = useState<EventFormState>(EMPTY_FORM);
  const [showPreview, setShowPreview] = useState(true);
  const [savedEvent, setSavedEvent]   = useState<CollegeEvent | null>(null);
  const [toast, setToast]             = useState<{ msg: string; type: 'success' | 'info' } | null>(null);
  const [pdfLoading, setPdfLoading]   = useState(false);
  const [pngLoading, setPngLoading]   = useState(false);

  // ── template state ──────────────────────────────────────────────────────────
  const [source, setSource]           = useState<TemplateSource>({ type: 'coded' });
  const [dbTemplates, setDbTemplates] = useState<DbCanvaTemplate[]>([]);
  const [dbLoading, setDbLoading]     = useState(false);
  const [canvaImgUrl, setCanvaImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading]   = useState(false);
  const [imgError, setImgError]       = useState<string | null>(null);

  const localTemplates: BrandingTemplate[] = useMemo(() => getAllTemplates(), []);

  // ── fetch saved Canva templates from DB on mount ────────────────────────────
  useEffect(() => {
    setDbLoading(true);
    fetch('/api/canva/templates')
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => setDbTemplates((d.templates ?? []) as DbCanvaTemplate[]))
      .catch(() => { /* non-fatal */ })
      .finally(() => setDbLoading(false));
  }, []);

  // ── proxy-fetch thumbnail when a Canva template is selected ─────────────────
  useEffect(() => {
    if (source.type !== 'canva') { setCanvaImgUrl(null); setImgError(null); return; }

    const { previewUrl } = source.tpl;
    if (!previewUrl) { setImgError('No preview URL stored for this template.'); return; }

    if (previewUrl.startsWith('data:')) { setCanvaImgUrl(previewUrl); return; }

    setImgLoading(true);
    setCanvaImgUrl(null);
    setImgError(null);

    fetch(`/api/canva/thumbnail-proxy/?url=${encodeURIComponent(previewUrl)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((d: { dataUrl: string }) => {
        if (!d.dataUrl) throw new Error('Empty response');
        setCanvaImgUrl(d.dataUrl);
      })
      .catch((err) => {
        console.error('[HodEventCreatePage] thumbnail proxy:', err);
        setImgError('Could not load template image. Check Canva connection.');
      })
      .finally(() => setImgLoading(false));
  }, [source]);

  // ── poster data live-synced with form ────────────────────────────────────────
  const posterData = {
    title: form.title, eventType: form.eventType,
    participants: form.participants, venue: form.venue, dateTime: form.dateTime,
    resourcePersons: form.resourcePersons,
    facultyCoordinator1: form.facultyCoordinator1, facultyCoordinator2: form.facultyCoordinator2,
    studentCoordinator: form.studentCoordinator, departmentLogoDataUrl: form.departmentLogoDataUrl,
    coordinatorCount: form.coordinatorCount, hasChiefGuest: form.hasChiefGuest,
    chiefGuests: form.chiefGuests,
  };

  // ── helpers ───────────────────────────────────────────────────────────────────
  function notify(msg: string, type: 'success' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function isValid() { return !!(form.title.trim() && form.venue.trim() && form.dateTime); }

  function buildPayload(status: 'Draft' | 'Pending IQAC Approval'): Parameters<typeof createEvent>[0] {
    const { username, displayName } = getCreatorIdentity();
    return {
      title: form.title.trim(), venue: form.venue.trim(), dateTime: form.dateTime,
      coordinatorCount: form.coordinatorCount, hasChiefGuest: form.hasChiefGuest,
      chiefGuests: form.hasChiefGuest ? form.chiefGuests.slice(0, form.guestCount) : [],
      status, createdBy: username, createdByName: displayName,
    };
  }

  function handleSave() {
    if (!isValid()) return;
    if (savedEvent) { const u = updateEvent(savedEvent.id, buildPayload('Draft')); if (u) setSavedEvent(u); }
    else setSavedEvent(createEvent(buildPayload('Draft')));
    notify('Event saved as Draft.');
  }

  function handleForward() {
    if (!isValid()) return;
    if (savedEvent) {
      const drafted = updateEvent(savedEvent.id, buildPayload('Pending IQAC Approval'));
      const forwarded = submitEventToIqac(savedEvent.id);
      setSavedEvent(forwarded || drafted || savedEvent);
    } else {
      const created = createEvent(buildPayload('Pending IQAC Approval'));
      const forwarded = submitEventToIqac(created.id);
      setSavedEvent(forwarded || created);
    }
    notify('Event forwarded to IQAC for approval.', 'info');
  }

  async function handleDownloadPDF() {
    if (!posterRef.current) return;
    setPdfLoading(true);
    try { await exportAsPDF(posterRef.current, { title: form.title || 'Event' }); }
    finally { setPdfLoading(false); }
  }

  async function handleDownloadPNG() {
    if (!posterRef.current) return;
    setPngLoading(true);
    try { await exportAsPNG(posterRef.current, `${form.title || 'poster'}.png`); }
    finally { setPngLoading(false); }
  }

  function handleDownloadDoc() {
    const ev: CollegeEvent = savedEvent ?? { ...buildPayload('Draft'), id: 'preview', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    exportAsDoc(ev, source.type === 'local' ? source.tpl : undefined);
  }

  // ── template selector ─────────────────────────────────────────────────────────
  function handleTemplateChange(value: string) {
    if (!value || value === '__coded__') { setSource({ type: 'coded' }); return; }
    if (value.startsWith('canva:')) {
      const id = Number(value.slice(6));
      const tpl = dbTemplates.find((t) => t.id === id);
      if (tpl) setSource({ type: 'canva', tpl });
      return;
    }
    if (value.startsWith('local:')) {
      const id = value.slice(6);
      const tpl = localTemplates.find((t) => t.id === id);
      if (tpl) setSource({ type: 'local', tpl });
      return;
    }
  }

  function selectedValue(): string {
    if (source.type === 'coded') return '__coded__';
    if (source.type === 'canva') return `canva:${source.tpl.id}`;
    if (source.type === 'local') return `local:${source.tpl.id}`;
    return '__coded__';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'}`}>
          {toast.type === 'success' ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/hod/events')}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Event</h1>
          <p className="text-gray-500 text-sm mt-0.5">Fill the form · click zones on the poster to edit directly · both stay in sync.</p>
        </div>
        <div className="ml-auto">
          <button onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
      </div>

      <div className={`grid gap-6 ${showPreview ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 max-w-2xl'}`}>

        {/* ── Left: Form ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-3">Event Details</h2>

          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <HodEventForm form={form} onChange={setForm} />

            <div className="mt-8 space-y-3">
              <div className="flex gap-3">
                <button type="button" onClick={handleSave} disabled={!isValid()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40 transition-colors">
                  <Save className="w-4 h-4" />Confirm &amp; Save
                </button>
                <button type="button" onClick={handleForward} disabled={!isValid()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                  <Send className="w-4 h-4" />Forward to IQAC
                </button>
              </div>
              <div className="flex gap-2 pt-1 flex-wrap">
                <button type="button" onClick={handleDownloadPNG} disabled={pngLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-green-200 text-green-700 text-sm font-medium hover:bg-green-50 disabled:opacity-50">
                  <FileImage className="w-4 h-4" />{pngLoading ? 'Saving…' : 'PNG'}
                </button>
                <button type="button" onClick={handleDownloadPDF} disabled={pdfLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50">
                  <FileDown className="w-4 h-4" />{pdfLoading ? 'PDF…' : 'PDF'}
                </button>
                <button type="button" onClick={handleDownloadDoc}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-blue-200 text-blue-600 text-sm font-medium hover:bg-blue-50">
                  <FileText className="w-4 h-4" />Word
                </button>
              </div>
            </div>
          </form>

          {savedEvent && (
            <div className="mt-4 bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">Saved as:</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full
                ${savedEvent.status === 'Draft' ? 'bg-gray-200 text-gray-700' :
                  savedEvent.status === 'Pending IQAC Approval' ? 'bg-amber-100 text-amber-700' :
                  savedEvent.status === 'Pending Branding Approval' ? 'bg-indigo-100 text-indigo-700' :
                  savedEvent.status === 'Approved' ? 'bg-green-100 text-green-700' :
                  'bg-red-100 text-red-700'}`}>
                {savedEvent.status}
              </span>
            </div>
          )}
        </div>

        {/* ── Right: Live Poster Preview ──────────────────────────────────── */}
        {showPreview && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 w-full flex flex-col items-center">

              {/* card header */}
              <div className="w-full mb-4 border-b border-gray-100 pb-3 flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-bold text-gray-800 flex-1">
                  Live Poster Preview
                  {source.type === 'canva' && (
                    <span className="ml-2 text-xs font-normal text-purple-600 bg-purple-50 border border-purple-100 rounded px-2 py-0.5">
                      Canva · {source.tpl.name}
                    </span>
                  )}
                  {source.type === 'local' && (
                    <span className="ml-2 text-xs font-normal text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">
                      Local · {source.tpl.name}
                    </span>
                  )}
                </h2>

                {source.type === 'canva' && (
                  <button
                    onClick={() => { setCanvaImgUrl(null); setImgError(null); setSource({ ...source }); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                    title="Reload template image"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}

                <LayoutTemplate className="w-4 h-4 text-purple-500 flex-shrink-0" />
                <select
                  value={selectedValue()}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:ring-2 focus:ring-purple-500 max-w-[200px]"
                >
                  <option value="__coded__">Event Template 1 (Built-in)</option>
                  {dbLoading && <option disabled>Loading Canva templates…</option>}
                  {dbTemplates.length > 0 && (
                    <optgroup label="── Canva Connected Templates">
                      {dbTemplates.map((t) => (
                        <option key={t.id} value={`canva:${t.id}`}>{t.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {localTemplates.length > 0 && (
                    <optgroup label="── Local IDCS Templates">
                      {localTemplates.map((t) => (
                        <option key={t.id} value={`local:${t.id}`}>{t.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Canva template loading / error states */}
              {source.type === 'canva' && imgLoading && (
                <div className="w-full flex flex-col items-center py-20 gap-4">
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                  <p className="text-xs text-gray-500 text-center">
                    Loading template via Canva proxy…<br />
                    <span className="text-gray-400">{source.tpl.name}</span>
                  </p>
                </div>
              )}
              {source.type === 'canva' && imgError && !imgLoading && (
                <div className="w-full text-center py-12 text-red-500 text-xs">
                  <p className="font-semibold mb-1">Failed to load template image</p>
                  <p className="text-gray-400">{imgError}</p>
                  <p className="mt-2 text-gray-400">Make sure Branding has connected Canva.</p>
                </div>
              )}

              {/* POSTER */}
              <div className="overflow-hidden rounded-2xl shadow-xl">
                {source.type === 'coded' && (
                  <PosterPreview ref={posterRef} data={posterData} />
                )}
                {source.type === 'canva' && !imgLoading && !imgError && canvaImgUrl && (
                  <LivePosterCanvas
                    ref={posterRef}
                    imageDataUrl={canvaImgUrl}
                    formState={form}
                    onChange={setForm}
                  />
                )}
                {source.type === 'local' && (
                  <PosterRenderer ref={posterRef} template={source.tpl} data={posterData} />
                )}
              </div>

              {/* contextual tip */}
              {source.type === 'canva' && canvaImgUrl && !imgLoading && (
                <p className="mt-3 text-center text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-1.5 w-full">
                  ✏️ <strong>Click any highlighted zone</strong> on the poster to edit directly — changes sync with the form instantly.
                </p>
              )}
              {source.type === 'coded' && (
                <p className="mt-3 text-center text-xs text-gray-400 w-full">
                  Updating form fields on the left refreshes this preview instantly.
                </p>
              )}

              {/* Quick export strip */}
              <div className="mt-4 w-full flex gap-2">
                <button onClick={handleDownloadPNG} disabled={pngLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                  <Download className="w-3.5 h-3.5" />{pngLoading ? 'Saving…' : 'Save as PNG'}
                </button>
                <button onClick={handleDownloadPDF} disabled={pdfLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                  <FileDown className="w-3.5 h-3.5" />{pdfLoading ? 'PDF…' : 'Save as PDF'}
                </button>
              </div>
            </div>

            {/* How it works */}
            <div className="w-full bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4 text-xs text-indigo-700 leading-relaxed">
              <p className="font-semibold text-indigo-800 mb-1">How it works</p>
              <ul className="list-disc list-inside space-y-1 text-indigo-600">
                <li>Fill the form on the left — the poster updates instantly.</li>
                <li>Select a <strong>Canva template</strong> → loads live from your connected Canva account.</li>
                <li>OCR auto-detects text zones — <strong>click any highlighted box</strong> on the poster to edit directly.</li>
                <li>Form ↔ poster click are always in sync.</li>
                <li>Download as PNG / PDF or forward to Branding.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

