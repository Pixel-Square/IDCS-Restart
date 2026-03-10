/**
 * CanvaDesignEditorPage.tsx
 *
 * Opens after HOD submits event data for a Canva-template-based poster.
 *
 * Flow:
 *  1. Shows the autofilled design details and a prominent "Open in Canva" button
 *     (Canva blocks cross-origin iframe embedding for regular designs).
 *  2. HOD edits the poster in a new Canva tab, then returns here.
 *  3. HOD clicks "Done — Export Poster" to trigger PNG + PDF export via backend proxy.
 *  4. Exported files are stored in IDCS backend and attached to the event.
 *  5. Returns to HOD event list with a success notice.
 */
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ExternalLink, Download, CheckCircle, AlertCircle, Loader,
  FileImage, FileText, ArrowLeft, Info,
} from 'lucide-react';
import { exportAndStore, exportDesign } from '../../../services/canva/CanvaExportService';

interface LocationState {
  designId: string;
  editUrl: string;
  eventId: string | null;
  eventTitle?: string;
}

type ExportState = 'idle' | 'exporting' | 'done' | 'error';

export default function CanvaDesignEditorPage() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const state      = (location.state ?? {}) as Partial<LocationState>;

  const designId   = state.designId   ?? '';
  const editUrl    = state.editUrl    ?? `https://www.canva.com/design/${designId}/edit`;
  const eventId    = state.eventId    ?? null;
  const eventTitle = state.eventTitle ?? 'Event Poster';

  const [openedCanva, setOpenedCanva]   = useState(false);
  const [exportState, setExportState]   = useState<ExportState>('idle');
  const [exportStep, setExportStep]     = useState('');
  const [exportedUrls, setExportedUrls] = useState<string[]>([]);
  const [error, setError]               = useState<string | null>(null);

  function handleOpenCanva() {
    window.open(editUrl, '_blank', 'noopener,noreferrer');
    setOpenedCanva(true);
  }

  async function handleExport() {
    if (!designId) { setError('No Canva design ID available.'); return; }
    setExportState('exporting');
    setError(null);
    const urls: string[] = [];

    try {
      // Export PNG
      setExportStep('Exporting as PNG…');
      if (eventId) {
        const res = await exportAndStore(eventId, designId, 'png');
        urls.push(...res.storedUrls);
      } else {
        const pngUrls = await exportDesign(designId, 'png');
        urls.push(...pngUrls);
      }

      // Export PDF
      setExportStep('Exporting as PDF…');
      if (eventId) {
        const res = await exportAndStore(eventId, designId, 'pdf');
        urls.push(...res.storedUrls);
      } else {
        const pdfUrls = await exportDesign(designId, 'pdf');
        urls.push(...pdfUrls);
      }

      setExportedUrls(urls);
      setExportState('done');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Export failed.');
      setExportState('error');
    }
  }

  function handleFinish() {
    navigate('/hod/events');
  }

  if (!designId) {
    return (
      <div className="max-w-lg mx-auto py-24 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-600">No design ID was provided. Please go back and generate the design again.</p>
        <button onClick={() => navigate(-1)} className="mt-5 px-5 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-semibold">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Canva Poster Editor</h1>
          <p className="text-gray-500 text-sm mt-0.5">{eventTitle}</p>
        </div>
      </div>

      {/* Step 1: open in Canva */}
      <div className={`bg-white rounded-2xl border p-6 mb-4 ${openedCanva ? 'border-green-200' : 'border-purple-200 shadow-sm'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm
            ${openedCanva ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
            {openedCanva ? <CheckCircle className="w-5 h-5" /> : '1'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 mb-1">Open &amp; Edit in Canva</h3>
            <p className="text-sm text-gray-500 mb-4">
              Your autofilled poster design has been created. Open it in Canva to review and make
              final adjustments, then come back here to export.
            </p>
            <div className="flex items-center gap-2 mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              Canva opens in a new tab. Return to this page when your edits are complete.
            </div>
            <button
              onClick={handleOpenCanva}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              {openedCanva ? 'Re-open in Canva' : 'Open in Canva Editor'}
            </button>
          </div>
        </div>
      </div>

      {/* Step 2: export */}
      <div className={`bg-white rounded-2xl border p-6 mb-4 transition-all
        ${!openedCanva ? 'border-gray-100 opacity-60' : exportState === 'done' ? 'border-green-200' : 'border-gray-200'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm
            ${exportState === 'done' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {exportState === 'done' ? <CheckCircle className="w-5 h-5" /> : '2'}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">Export &amp; Save Poster</h3>
            <p className="text-sm text-gray-500 mb-4">
              Once you're happy with the design, export it as PNG and PDF.
              {eventId ? ' The files will be saved to this event in IDCS.' : ''}
            </p>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Export failed</p>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {exportState === 'exporting' && (
              <div className="flex items-center gap-2 text-sm text-purple-600 mb-4">
                <Loader className="w-4 h-4 animate-spin" />
                {exportStep}
              </div>
            )}

            {exportState === 'done' && exportedUrls.length > 0 && (
              <div className="space-y-2 mb-4">
                {exportedUrls.map((url, i) => {
                  const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('pdf');
                  return (
                    <a
                      key={i}
                      href={url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {isPdf
                        ? <FileText className="w-4 h-4 text-red-500" />
                        : <FileImage className="w-4 h-4 text-green-500" />}
                      <span className="flex-1 truncate">{url.split('/').pop() ?? `Export ${i + 1}`}</span>
                      <Download className="w-3.5 h-3.5 text-gray-400" />
                    </a>
                  );
                })}
              </div>
            )}

            {exportState !== 'done' && (
              <button
                onClick={handleExport}
                disabled={!openedCanva || exportState === 'exporting'}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                {exportState === 'exporting' ? 'Exporting…' : 'Export PNG + PDF'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Finish */}
      {exportState === 'done' && (
        <div className="flex justify-end mt-2">
          <button
            onClick={handleFinish}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Done — Back to Events
          </button>
        </div>
      )}
    </div>
  );
}
