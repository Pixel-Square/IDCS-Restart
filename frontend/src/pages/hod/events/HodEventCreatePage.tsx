import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileDown, FileText, Send, Save, ChevronLeft, Eye, EyeOff,
  FileImage, LayoutTemplate, Download, Loader2, RefreshCw,
  Wand2, ExternalLink, ImageDown, CheckCircle2, AlertTriangle,
  Trash2, Zap, ChevronDown, X,
} from 'lucide-react';
import HodEventForm, { type EventFormState } from './HodEventForm';
import PosterPreview                          from './PosterPreview';
import PosterRenderer                         from './PosterRenderer';
import LivePosterCanvas                       from './LivePosterCanvas';
import { exportAsPDF, exportAsPNG, exportAsDoc } from './ExportService';
import { createEvent, updateEvent, type CollegeEvent } from '../../../store/eventStore';
import { getAllTemplates, type BrandingTemplate } from '../../../store/templateStore';

// ─── form defaults ────────────────────────────────────────────────────────────

const EMPTY_FORM: EventFormState = {
  title: '',
  eventType: '',
  department: '',
  organizer: '',
  description: '',
  contact: '',
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

// ─── debounce helper ──────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ─── delete a Canva template from the DB ─────────────────────────────────────

async function deleteDbTemplate(id: number): Promise<void> {
  const res = await fetch(`/api/canva/templates/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

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
  const [dbError, setDbError]         = useState<string | null>(null);
  const [canvaImgUrl, setCanvaImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading]   = useState(false);
  const [imgError, setImgError]       = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [deletingId, setDeletingId]   = useState<number | null>(null);

  // ── Canva autofill → generate poster state ──────────────────────────────────
  const [generating,        setGenerating]        = useState(false);
  const [generateStep,      setGenerateStep]       = useState<string>('');
  const [generatedImgUrl,   setGeneratedImgUrl]    = useState<string | null>(null);
  const [generatedDesignId, setGeneratedDesignId]  = useState<string | null>(null);
  const [generatedExportUrl,setGeneratedExportUrl] = useState<string | null>(null);
  const [generateError,     setGenerateError]      = useState<string | null>(null);
  // When true the right-panel shows the GENERATED poster instead of the template bg
  const [showGenerated,     setShowGenerated]      = useState(false);

  // Debounced form for auto-generation (1.5 s after last keystroke)
  const debouncedForm = useDebounce(form, 1500);

  const localTemplates: BrandingTemplate[] = useMemo(() => getAllTemplates(), []);

  // ── fetch saved Canva templates from DB on mount ────────────────────────────
  useEffect(() => {
    setDbLoading(true);
    setDbError(null);
    fetch('/api/canva/templates', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setDbTemplates((d.templates ?? []) as DbCanvaTemplate[]))
      .catch((err) => {
        console.error('[HodEventCreatePage] Failed to load Canva templates:', err);
        setDbError(String(err));
      })
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

  // ── auto-generate when Canva template selected + form has enough data ────────
  // Triggers whenever debounced form changes and a Canva template is active.
  const autoGenerating = useRef(false);
  useEffect(() => {
    if (source.type !== 'canva') return;
    if (!source.tpl.canvaTemplateId) return;
    if (generating || autoGenerating.current) return;
    if (!debouncedForm.title.trim() || !debouncedForm.venue.trim() || !debouncedForm.dateTime) return;

    autoGenerating.current = true;
    // Reset previous result so the preview cleanly transitions
    setGenerateError(null);
    setGeneratedImgUrl(null);
    setShowGenerated(false);
    doGeneratePoster(source.tpl.canvaTemplateId, debouncedForm).finally(() => {
      autoGenerating.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedForm, source]);

  // ── delete template handler ──────────────────────────────────────────────────
  const handleDeleteTemplate = useCallback(async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Remove this template from the IDCS library?')) return;
    setDeletingId(id);
    try {
      await deleteDbTemplate(id);
      setDbTemplates((prev) => prev.filter((t) => t.id !== id));
      // If the deleted template is currently selected, fall back to coded
      if (source.type === 'canva' && source.tpl.id === id) {
        setSource({ type: 'coded' });
        setGeneratedImgUrl(null);
        setShowGenerated(false);
      }
      notify('Template removed.', 'info');
    } catch {
      notify('Could not delete template — check Canva connection.', 'info');
    } finally {
      setDeletingId(null);
    }
  }, [source]);

  // ── clear ALL branding templates ─────────────────────────────────────────────
  const handleClearAllTemplates = useCallback(async () => {
    if (!window.confirm('Remove ALL saved Canva templates from the library? This cannot be undone.')) return;
    const ids = dbTemplates.map((t) => t.id);
    for (const id of ids) {
      try { await deleteDbTemplate(id); } catch { /* continue */ }
    }
    setDbTemplates([]);
    setSource({ type: 'coded' });
    setGeneratedImgUrl(null);
    setShowGenerated(false);
    notify(`${ids.length} template(s) cleared.`, 'info');
  }, [dbTemplates]);
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

  function buildPayload(status: 'Draft' | 'Pending Approval'): Parameters<typeof createEvent>[0] {
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
    if (savedEvent) { const u = updateEvent(savedEvent.id, { status: 'Pending Approval', ...buildPayload('Pending Approval') }); if (u) setSavedEvent(u); }
    else setSavedEvent(createEvent(buildPayload('Pending Approval')));
    notify('Event forwarded to Branding for approval.', 'info');
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

  // ── Core poster generation logic (callable from button OR auto-effect) ──────
  const doGeneratePoster = useCallback(async (
    templateId: string,
    formData: typeof form,
  ): Promise<void> => {
    setGenerating(true);
    setGenerateError(null);
    setGeneratedImgUrl(null);
    setGeneratedDesignId(null);
    setGeneratedExportUrl(null);
    setShowGenerated(false);

    const fmtDt = formData.dateTime
      ? new Date(formData.dateTime).toLocaleString('en-IN', {
          weekday: 'long', year: 'numeric', month: 'long',
          day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
        })
      : '';

    const fields = {
      event_title:           formData.title,
      event_type:            formData.eventType,
      department:            formData.department,
      organizer:             formData.organizer || 'IDCS College of Engineering',
      description:           formData.description,
      date_time:             fmtDt,
      venue:                 formData.venue,
      contact:               formData.contact,
      participants:          formData.participants,
      resource_person:       formData.resourcePersons?.[0]?.name ?? '',
      resource_designation:  formData.resourcePersons?.[0]?.designation ?? '',
      faculty_coordinator_1: formData.facultyCoordinator1,
      faculty_coordinator_2: formData.facultyCoordinator2,
      student_coordinator:   formData.studentCoordinator,
    };

    try {
      setGenerateStep('Sending to n8n automation…');
      const resp = await fetch('/api/canva/trigger-n8n-poster', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ brand_template_id: templateId, format: 'png', fields }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setGenerateError(data.detail || `Server error ${resp.status}`);
        return;
      }

      setGeneratedDesignId(data.design_id ?? null);
      setGeneratedExportUrl(data.export_url ?? null);

      if (data.dataUrl) {
        setGenerateStep('Poster ready!');
        setGeneratedImgUrl(data.dataUrl);
        setShowGenerated(true);   // ← replace the live-canvas with the generated image
        notify('Poster ready! Download below or view in Canva.', 'success');
      } else if (data.warning) {
        setGenerateError(data.warning);
      } else {
        setGenerateError('Poster generated but the image could not be fetched automatically.');
      }
    } catch (err) {
      setGenerateError(`Network error: ${String(err)}`);
    } finally {
      setGenerating(false);
      setGenerateStep('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Manual "Generate" button wrapper ─────────────────────────────────────────
  async function handleGeneratePoster() {
    if (source.type !== 'canva') return;
    if (!isValid()) { notify('Please fill in Title, Venue and Date/Time first.', 'info'); return; }
    await doGeneratePoster(source.tpl.canvaTemplateId, form);
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

      {/* Click-away backdrop for template picker */}
      {templatePickerOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setTemplatePickerOpen(false)} />
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
                  <Send className="w-4 h-4" />Forward to Branding
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
                  savedEvent.status === 'Pending Approval' ? 'bg-amber-100 text-amber-700' :
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

                {/* Custom template picker with delete buttons */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTemplatePickerOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:border-purple-300 hover:text-purple-600 transition-colors max-w-[220px]"
                  >
                    <LayoutTemplate className="w-3.5 h-3.5 flex-shrink-0 text-purple-500" />
                    <span className="truncate max-w-[150px]">
                      {source.type === 'coded' && 'Event Template 1 (Built-in)'}
                      {source.type === 'canva' && source.tpl.name}
                      {source.type === 'local' && source.tpl.name}
                    </span>
                    <ChevronDown className="w-3 h-3 flex-shrink-0" />
                  </button>

                  {templatePickerOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-100 z-30 py-1 overflow-hidden"
                      onBlur={() => setTemplatePickerOpen(false)}
                    >
                      {/* Built-in */}
                      <button
                        type="button"
                        onClick={() => { handleTemplateChange('__coded__'); setTemplatePickerOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${source.type === 'coded' ? 'font-semibold text-indigo-600 bg-indigo-50' : 'text-gray-700'}`}
                      >
                        Event Template 1 (Built-in)
                      </button>

                      {/* Canva templates */}
                      {dbError && (
                        <div className="px-3 py-2 text-[10px] text-red-500">
                          Could not load templates — check console.
                        </div>
                      )}
                      {!dbLoading && !dbError && dbTemplates.length === 0 && (
                        <div className="px-3 py-2 text-[10px] text-gray-400">
                          No branded templates saved yet.{' '}
                          <a href="/branding/templates" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">Go to Branding → Templates</a> to save one.
                        </div>
                      )}
                      {dbTemplates.length > 0 && (
                        <>
                          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center justify-between">
                            <span>Canva Connected</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setTemplatePickerOpen(false); handleClearAllTemplates(); }}
                              className="text-red-400 hover:text-red-600 font-medium normal-case"
                              title="Remove all Canva templates from library"
                            >
                              Clear all
                            </button>
                          </div>
                          {dbTemplates.map((t) => (
                            <div key={t.id} className={`flex items-center gap-1 px-3 py-1.5 hover:bg-purple-50 group
                              ${source.type === 'canva' && source.tpl.id === t.id ? 'bg-purple-50' : ''}`}>
                              <button
                                type="button"
                                className={`flex-1 text-left text-xs truncate ${source.type === 'canva' && source.tpl.id === t.id ? 'font-semibold text-purple-700' : 'text-gray-700'}`}
                                onClick={() => { handleTemplateChange(`canva:${t.id}`); setTemplatePickerOpen(false); }}
                              >
                                {t.name}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { setTemplatePickerOpen(false); handleDeleteTemplate(t.id, e); }}
                                disabled={deletingId === t.id}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 transition-all"
                                title={`Delete "${t.name}"`}
                              >
                                {deletingId === t.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Trash2 className="w-3 h-3" />}
                              </button>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Local templates */}
                      {localTemplates.length > 0 && (
                        <>
                          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                            Local IDCS Templates
                          </div>
                          {localTemplates.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => { handleTemplateChange(`local:${t.id}`); setTemplatePickerOpen(false); }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 ${source.type === 'local' && source.tpl.id === t.id ? 'font-semibold text-indigo-700 bg-indigo-50' : 'text-gray-700'}`}
                            >
                              {t.name}
                            </button>
                          ))}
                        </>
                      )}

                      {dbLoading && (
                        <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading templates…
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

              {/* POSTER — shows generated image when available, else live canvas */}
              <div className="overflow-hidden rounded-2xl shadow-xl relative">
                {/* Generated poster replaces the canvas */}
                {showGenerated && generatedImgUrl && (
                  <>
                    <img
                      src={generatedImgUrl}
                      alt="Generated poster"
                      className="w-full"
                    />
                    <button
                      type="button"
                      onClick={() => { setShowGenerated(false); setGeneratedImgUrl(null); setGenerateError(null); }}
                      className="absolute top-2 right-2 bg-white rounded-full p-1.5 shadow text-gray-500 hover:text-red-500 transition-colors"
                      title="Clear generated poster"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* Live canvas — hidden while generated poster is shown */}
                {!showGenerated && source.type === 'coded' && (
                  <PosterPreview ref={posterRef} data={posterData} />
                )}
                {!showGenerated && source.type === 'canva' && !imgLoading && !imgError && canvaImgUrl && (
                  <LivePosterCanvas
                    ref={posterRef}
                    imageDataUrl={canvaImgUrl}
                    formState={form}
                    onChange={setForm}
                  />
                )}
                {!showGenerated && source.type === 'local' && (
                  <PosterRenderer ref={posterRef} template={source.tpl} data={posterData} />
                )}

                {/* Generating overlay */}
                {generating && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-2xl">
                    <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                    <p className="text-xs text-gray-600 font-medium text-center px-4">{generateStep || 'Sending to Canva…'}</p>
                    <p className="text-[10px] text-gray-400">This can take up to 60 seconds</p>
                  </div>
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

              {/* ── Generate Poster via Canva autofill ── */}
              {source.type === 'canva' && (
                <div className="w-full mt-3 border-t border-gray-100 pt-3 space-y-2">
                  {!source.tpl.canvaTemplateId && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      ⚠️ This template has no Canva Template ID. Re-save it from the Branding → Templates page.
                    </p>
                  )}

                  {source.tpl.canvaTemplateId && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleGeneratePoster}
                        disabled={generating || !isValid()}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                          bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-semibold
                          hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {generating ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />{generateStep || 'Generating…'}</>
                        ) : showGenerated ? (
                          <><RefreshCw className="w-4 h-4" />Regenerate Poster</>
                        ) : (
                          <><Zap className="w-4 h-4" />Generate Poster (Auto-fill Canva)</>
                        )}
                      </button>
                      {showGenerated && (
                        <button
                          type="button"
                          onClick={() => { setShowGenerated(false); setGeneratedImgUrl(null); }}
                          className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors"
                          title="Discard generated poster"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {!isValid() && source.tpl.canvaTemplateId && (
                    <p className="text-[10px] text-gray-400 text-center">
                      Fill in Title, Venue and Date/Time to enable generation
                    </p>
                  )}

                  {generateError && (
                    <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{generateError}</span>
                    </div>
                  )}

                  {showGenerated && generatedImgUrl && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2 text-xs text-green-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Poster generated — shown in preview above
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={generatedImgUrl}
                          download={`${form.title || 'event-poster'}.png`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                            bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                        >
                          <ImageDown className="w-3.5 h-3.5" /> Download PNG
                        </a>
                        {generatedDesignId && (
                          <a
                            href={`https://www.canva.com/design/${generatedDesignId}/edit`}
                            target="_blank" rel="noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                              border border-purple-200 text-purple-700 text-xs font-semibold hover:bg-purple-50"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> View in Canva
                          </a>
                        )}
                      </div>
                      {generatedExportUrl && (
                        <a
                          href={generatedExportUrl}
                          target="_blank" rel="noreferrer"
                          className="text-xs text-gray-400 underline block text-center"
                        >
                          Direct CDN link (may expire)
                        </a>
                      )}
                    </div>
                  )}
                </div>
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

