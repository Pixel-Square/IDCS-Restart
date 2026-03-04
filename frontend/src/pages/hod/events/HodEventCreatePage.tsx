import React, { useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, FileText, Send, Save, ChevronLeft, Eye, EyeOff, FileImage, LayoutTemplate, Sparkles, Loader } from 'lucide-react';
import HodEventForm, { type EventFormState } from './HodEventForm';
import PosterRenderer from './PosterRenderer';
import { exportAsPDF, exportAsPNG, exportAsDoc } from './ExportService';
import { createEvent, updateEvent, type CollegeEvent } from '../../../store/eventStore';
import { getAllTemplates, type BrandingTemplate } from '../../../store/templateStore';
import { getAllCanvaTemplates, getConnection, type CanvaTemplate } from '../../../store/canvaStore';
import {
  waitForAutofill,
  createDesignFromTemplate,
  buildEditorUrl,
  type AutofillData,
} from '../../../services/canva/CanvaDesignService';

const EMPTY_FORM: EventFormState = {
  title: '',
  venue: '',
  dateTime: '',
  coordinatorCount: 1,
  hasChiefGuest: false,
  guestCount: 1,
  chiefGuests: [],
};

function getCreatorIdentity(): { username: string; displayName: string } {
  try {
    // Main app login persists the current user under `me`.
    const rawMe = localStorage.getItem('me');
    if (rawMe) {
      const me = JSON.parse(rawMe) as any;
      const username = String(me?.username || me?.user?.username || '').trim();
      const displayName = String(
        me?.profile?.full_name ||
        me?.profile?.fullName ||
        me?.profile?.name ||
        me?.full_name ||
        me?.fullName ||
        me?.name ||
        ''
      ).trim();
      if (username) return { username, displayName: displayName || username };
    }
  } catch { /* ignore */ }

  try {
    // Branding module demo login uses `branding_user`.
    const rawBranding = localStorage.getItem('branding_user');
    if (rawBranding) {
      const u = JSON.parse(rawBranding) as any;
      const username = String(u?.username || '').trim();
      const displayName = String(u?.fullName || u?.full_name || u?.name || '').trim();
      if (username) return { username, displayName: displayName || username };
    }
  } catch { /* ignore */ }

  // Legacy / fallback.
  try {
    const rawUser = localStorage.getItem('user');
    if (rawUser) {
      const u = JSON.parse(rawUser) as any;
      const username = String(u?.username || '').trim();
      const displayName = String(u?.fullName || u?.full_name || u?.name || '').trim();
      if (username) return { username, displayName: displayName || username };
    }
  } catch { /* ignore */ }

  return { username: 'hod', displayName: 'hod' };
}

export default function HodEventCreatePage() {
  const navigate = useNavigate();
  const posterRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  const [showPreview, setShowPreview] = useState(true);
  const [savedEvent, setSavedEvent] = useState<CollegeEvent | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pngLoading, setPngLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | ''>('');

  // ── Canva integration ──────────────────────────────────────────────────────
  const canvaTemplates: CanvaTemplate[] = useMemo(() => getAllCanvaTemplates(), []);
  const canvaConnected = useMemo(() => !!getConnection(), []);
  const [selectedCanvaTemplateId, setSelectedCanvaTemplateId] = useState<string>('');
  const [isGeneratingCanva, setIsGeneratingCanva] = useState(false);
  // ──────────────────────────────────────────────────────────────────────────

  const templates: BrandingTemplate[] = useMemo(() => getAllTemplates(), []);
  const selectedTemplate = useMemo(
    () => (selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) ?? null : null),
    [selectedTemplateId, templates],
  );

  function notify(msg: string, type: 'success' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function isValid() {
    return form.title.trim() && form.venue.trim() && form.dateTime;
  }

  function buildPayload(status: 'Draft' | 'Pending Approval'): Parameters<typeof createEvent>[0] {
    const creator = getCreatorIdentity();
    return {
      title: form.title.trim(),
      venue: form.venue.trim(),
      dateTime: form.dateTime,
      coordinatorCount: form.coordinatorCount,
      hasChiefGuest: form.hasChiefGuest,
      chiefGuests: form.hasChiefGuest ? form.chiefGuests.slice(0, form.guestCount) : [],
      status,
      createdBy: creator.username,
      createdByName: creator.displayName,
    };
  }

  // "Confirm & Save" → Draft
  function handleSave() {
    if (!isValid()) return;
    if (savedEvent) {
      const updated = updateEvent(savedEvent.id, { ...buildPayload('Draft') });
      if (updated) setSavedEvent(updated);
    } else {
      const ev = createEvent(buildPayload('Draft'));
      setSavedEvent(ev);
    }
    notify('Event saved as Draft.');
  }

  // "Forward to Branding" → Pending Approval
  function handleForward() {
    if (!isValid()) return;
    if (savedEvent) {
      const updated = updateEvent(savedEvent.id, { status: 'Pending Approval', ...buildPayload('Pending Approval') });
      if (updated) setSavedEvent(updated);
    } else {
      const ev = createEvent(buildPayload('Pending Approval'));
      setSavedEvent(ev);
    }
    notify('Event forwarded to Branding for approval.', 'info');
  }

  async function handleDownloadPDF() {
    if (!posterRef.current) return;
    setPdfLoading(true);
    try {
      await exportAsPDF(posterRef.current, { title: form.title || 'Event' });
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDownloadPNG() {
    if (!posterRef.current) return;
    setPngLoading(true);
    try {
      await exportAsPNG(posterRef.current, `${form.title || 'poster'}.png`);
    } finally {
      setPngLoading(false);
    }
  }

  function handleDownloadDoc() {
    const ev: CollegeEvent = savedEvent ?? {
      ...buildPayload('Draft'),
      id: 'preview',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    exportAsDoc(ev, selectedTemplate);
  }

  async function handleGenerateCanva() {
    const template = canvaTemplates.find((t) => t.id === selectedCanvaTemplateId);
    if (!template || !isValid()) return;

    // Persist event as draft first so we have an eventId for the poster attachment.
    let currentEventId: string | null = savedEvent ? savedEvent.id : null;
    if (!savedEvent) {
      const ev = createEvent(buildPayload('Draft'));
      setSavedEvent(ev);
      currentEventId = ev.id;
      notify('Event saved as Draft.');
    }

    setIsGeneratingCanva(true);
    try {
      const autofillData: AutofillData = {
        event_title: form.title.trim(),
        venue:       form.venue.trim(),
        date_time:   form.dateTime,
      };

      let designId: string;
      let editUrl: string;

      try {
        // Attempt autofill (requires Canva Brand Template with data fields).
        const result = await waitForAutofill(template.canvaTemplateId, autofillData);
        if (result.status === 'success' && result.designId) {
          designId = result.designId;
          editUrl  = result.designEditUrl ?? buildEditorUrl(designId);
        } else {
          throw new Error('Autofill did not produce a design.');
        }
      } catch {
        // Fall back: create a plain copy of the template; user fills data manually in Canva.
        const newDesign = await createDesignFromTemplate(template.canvaTemplateId);
        designId = newDesign.designId;
        editUrl  = newDesign.editUrl;
      }

      navigate('/hod/events/canva-editor', {
        state: {
          designId,
          editUrl,
          eventId:    currentEventId,
          eventTitle: form.title || 'Event Poster',
        },
      });
    } catch (err: unknown) {
      notify((err as Error).message ?? 'Failed to create Canva design.', 'info');
    } finally {
      setIsGeneratingCanva(false);
    }
  }

  const posterData = {
    title: form.title,
    venue: form.venue,
    dateTime: form.dateTime,
    coordinatorCount: form.coordinatorCount,
    hasChiefGuest: form.hasChiefGuest,
    chiefGuests: form.chiefGuests,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium
            ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'}`}
        >
          {toast.type === 'success' ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/hod/events')}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Event</h1>
          <p className="text-gray-500 text-sm mt-0.5">Fill in the details, preview the poster, then save or forward to Branding.</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
      </div>

      <div className={`grid gap-6 ${showPreview ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 max-w-2xl'}`}>
        {/* ── Left: Form ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-3">Event Details</h2>

          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <HodEventForm form={form} onChange={setForm} />

            {/* Action buttons */}
            <div className="mt-8 space-y-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isValid()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Confirm &amp; Save
                </button>
                <button
                  type="button"
                  onClick={handleForward}
                  disabled={!isValid()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Forward to Branding
                </button>
              </div>

              {/* Download row */}
              <div className="flex gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={handleDownloadPNG}
                  disabled={pngLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-green-200 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                  <FileImage className="w-4 h-4" />
                  {pngLoading ? 'Saving...' : 'PNG'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={pdfLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4" />
                  {pdfLoading ? 'PDF...' : 'PDF'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDoc}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-blue-200 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Word
                </button>
              </div>
            </div>
          </form>

          {/* Status strip */}
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

        {/* ── Right: Poster Preview ── */}
        {showPreview && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 w-full flex flex-col items-center">
              <div className="w-full mb-4 border-b border-gray-100 pb-3 flex items-center gap-3">
                <h2 className="text-base font-bold text-gray-800 flex-1">Live Poster Preview</h2>
                {/* Template selector */}
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent max-w-[160px]"
                  >
                    <option value="">Default template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl shadow-xl">
                <PosterRenderer ref={posterRef} template={selectedTemplate} data={posterData} />
              </div>
            </div>

            {/* ── Canva Poster Generation ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5 w-full">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-gray-800">Generate with Canva</h3>
              </div>

              {!canvaConnected ? (
                <p className="text-xs text-gray-400">
                  No Canva account linked. Ask the Branding team to connect a Canva account under
                  {' '}<strong>Branding → Templates</strong>.
                </p>
              ) : canvaTemplates.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No Canva templates saved yet. Visit{' '}<strong>Branding → Templates</strong> to browse and
                  save designs from Canva.
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Select a Canva template to auto-fill event details and open the Canva editor.
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={selectedCanvaTemplateId}
                      onChange={(e) => setSelectedCanvaTemplateId(e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-2 text-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">— Choose a template —</option>
                      {canvaTemplates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleGenerateCanva}
                      disabled={!selectedCanvaTemplateId || !isValid() || isGeneratingCanva}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isGeneratingCanva ? (
                        <><Loader className="w-3.5 h-3.5 animate-spin" /> Generating&hellip;</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5" /> Generate</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
