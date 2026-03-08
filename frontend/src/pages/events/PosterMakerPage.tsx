/**
 * PosterMakerPage.tsx
 *
 * Dynamic Canva Brand Template poster maker.
 *
 * Flow:
 *   1. Load live Canva Brand Templates that support autofill datasets
 *   2. User selects one Brand Template
 *   3. IDCS renders inputs directly from the template's Canva dataset fields
 *   4. Entered values are sent straight into Canva autofill via Django → n8n → Canva
 *   5. User downloads the generated poster or opens it in Canva
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Info,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  getBrandTemplateDataset,
  listUserBrandTemplates,
  type CanvaBrandTemplateItem,
} from '../../services/canva/CanvaTemplateService';

type Step = 'select-template' | 'fill-form' | 'generating' | 'result';
type CanvaDatasetField = { type: 'text' | 'image' | 'chart' | string };

type PosterResult = {
  design_id: string;
  export_url: string;
  dataUrl: string;
  canva_edit_url: string;
  warning?: string;
};

function humanizeFieldKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function buildPlaceholder(fieldKey: string, type: string): string {
  if (type === 'image') return `Upload image for ${humanizeFieldKey(fieldKey)}`;
  return `Enter ${humanizeFieldKey(fieldKey)}`;
}

async function uploadImageToMedia(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/canva/upload-media', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Failed to upload image');
  const data = await res.json() as { url: string };
  return data.url;
}

export default function PosterMakerPage() {
  const [step, setStep] = useState<Step>('select-template');
  const [templates, setTemplates] = useState<CanvaBrandTemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CanvaBrandTemplateItem | null>(null);
  const [templateDataset, setTemplateDataset] = useState<Record<string, CanvaDatasetField>>({});
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({});
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [genProgress, setGenProgress] = useState('');
  const [result, setResult] = useState<PosterResult | null>(null);
  const [error, setError] = useState('');
  const [format, setFormat] = useState<'png' | 'pdf'>('png');
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const datasetEntries = Object.entries(templateDataset);
  const textFields = datasetEntries.filter(([, def]) => def.type === 'text');
  const imageFields = datasetEntries.filter(([, def]) => def.type === 'image');
  const chartFields = datasetEntries.filter(([, def]) => def.type === 'chart');
  const supportedFieldCount = textFields.length + imageFields.length;
  const hasFilledFields =
    textFields.some(([key]) => (fieldValues[key] ?? '').trim()) ||
    imageFields.some(([key]) => !!imageFiles[key]);

  const clearDynamicState = () => {
    Object.values(imagePreviews).forEach((url) => URL.revokeObjectURL(url));
    setTemplateDataset({});
    setFieldValues({});
    setImageFiles({});
    setImagePreviews({});
    setDatasetError('');
  };

  const loadTemplates = async (query = '') => {
    setTemplatesLoading(true);
    setTemplatesError('');
    setSelectedTemplate(null);
    clearDynamicState();
    try {
      const items = await listUserBrandTemplates(query);
      setTemplates(items);
    } catch (e: unknown) {
      setTemplatesError(e instanceof Error ? e.message : 'Failed to load Brand Templates.');
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    return () => {
      Object.values(imagePreviews).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadTemplates(searchQuery.trim());
  };

  const handleTemplateSelect = async (tpl: CanvaBrandTemplateItem) => {
    setSelectedTemplate(tpl);
    setStep('fill-form');
    setError('');
    setResult(null);
    clearDynamicState();
    setDatasetLoading(true);
    try {
      const dataset = await getBrandTemplateDataset(tpl.id);
      setTemplateDataset(dataset);
      if (!Object.keys(dataset).length) {
        setDatasetError('This Brand Template has no autofill dataset fields. Add data fields in Canva first.');
      }
    } catch (e: unknown) {
      setDatasetError(e instanceof Error ? e.message : 'Failed to load template dataset.');
    } finally {
      setDatasetLoading(false);
    }
  };

  const setFieldValue = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageChange = (key: string, file?: File) => {
    if (!file) return;
    if (imagePreviews[key]) URL.revokeObjectURL(imagePreviews[key]);
    setImageFiles((prev) => ({ ...prev, [key]: file }));
    setImagePreviews((prev) => ({ ...prev, [key]: URL.createObjectURL(file) }));
  };

  const removeImage = (key: string) => {
    if (imagePreviews[key]) URL.revokeObjectURL(imagePreviews[key]);
    setImageFiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setImagePreviews((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function handleGenerate() {
    if (!selectedTemplate) {
      setError('Please select a Brand Template first.');
      return;
    }
    if (!supportedFieldCount) {
      setError('This Brand Template has no supported text or image autofill fields.');
      return;
    }
    if (!hasFilledFields) {
      setError('Enter at least one field value before generating the poster.');
      return;
    }

    setStep('generating');
    setError('');
    setResult(null);

    try {
      const fields: Record<string, { type: string; text?: string; url?: string }> = {};

      setGenProgress('Preparing Brand Template autofill fields…');
      for (const [fieldKey] of textFields) {
        const value = (fieldValues[fieldKey] ?? '').trim();
        if (value) fields[fieldKey] = { type: 'text', text: value };
      }

      if (imageFields.length > 0) {
        setGenProgress('Uploading images to server…');
      }
      for (const [fieldKey] of imageFields) {
        const file = imageFiles[fieldKey];
        if (!file) continue;
        const url = await uploadImageToMedia(file);
        fields[fieldKey] = { type: 'image', url };
      }

      if (!Object.keys(fields).length) {
        throw new Error('No autofill values were provided.');
      }

      setGenProgress('Sending exact Brand Template fields to Canva via n8n ⚡…');
      const res = await fetch('/api/canva/poster-maker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_template_id: selectedTemplate.id,
          format,
          fields,
        }),
      });

      const data = await res.json() as {
        design_id?: string;
        export_url?: string;
        dataUrl?: string;
        canva_edit_url?: string;
        warning?: string;
        detail?: string;
      };

      if (!res.ok || data.detail) {
        throw new Error(data.detail ?? `Server error (${res.status})`);
      }

      setGenProgress('Poster ready!');
      setResult({
        design_id: data.design_id ?? '',
        export_url: data.export_url ?? '',
        dataUrl: data.dataUrl ?? '',
        canva_edit_url: data.canva_edit_url ?? '',
        warning: data.warning,
      });
      setStep('result');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
      setStep('fill-form');
    }
  }

  function handleDownload() {
    if (!result) return;
    if (result.dataUrl) {
      const a = document.createElement('a');
      a.href = result.dataUrl;
      a.download = `poster_${Date.now()}.${format}`;
      a.click();
    } else if (result.export_url) {
      window.open(result.export_url, '_blank');
    }
  }

  function reset() {
    setStep('select-template');
    setSelectedTemplate(null);
    clearDynamicState();
    setResult(null);
    setError('');
    setGenProgress('');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-violet-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Canva Poster Maker</h1>
            <p className="text-sm text-gray-500">
              Live Canva Brand Templates → dynamic IDCS fields → Canva autofill → download
            </p>
          </div>
          {step !== 'select-template' && (
            <button
              onClick={reset}
              className="ml-auto flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" /> Start Over
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-6 text-sm">
          {(['select-template', 'fill-form', 'generating', 'result'] as Step[]).map((s, i) => {
            const labels: Record<Step, string> = {
              'select-template': '1. Brand Template',
              'fill-form': '2. Template Fields',
              'generating': '3. Live Preview…',
              'result': '4. Preview & Download',
            };
            const isActive = step === s;
            const isDone = (['select-template', 'fill-form', 'generating', 'result'] as Step[]).indexOf(step) > i;
            return (
              <span
                key={s}
                className={`flex items-center gap-1.5 font-medium ${isActive ? 'text-violet-600' : isDone ? 'text-green-600' : 'text-gray-400'}`}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : null}
                {labels[s]}
              </span>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {step === 'select-template' && (
          <div>
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Choose a Canva Brand Template</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Only live Canva Brand Templates with autofill datasets are shown here.
                </p>
              </div>
              <button
                onClick={() => loadTemplates(searchQuery.trim())}
                className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2 mb-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your Canva Brand Templates…"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
              >
                Search
              </button>
            </form>

            {templatesLoading && (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading Brand Templates…
              </div>
            )}

            {templatesError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 flex items-start gap-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Failed to load Brand Templates</p>
                  <p className="text-sm mt-0.5">{templatesError}</p>
                </div>
              </div>
            )}

            {!templatesLoading && templates.length === 0 && !templatesError && (
              <div className="text-center py-20">
                <LayoutTemplate className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-700">No Brand Templates found</p>
                <p className="text-sm text-gray-500 mt-1">
                  Publish Brand Templates in Canva Brand Kit, then refresh this page.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => { void handleTemplateSelect(tpl); }}
                  className="group rounded-xl border-2 border-gray-200 hover:border-violet-400 bg-white overflow-hidden transition-all text-left focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <div className="aspect-[3/4] bg-gray-100 relative overflow-hidden">
                    {tpl.thumbnail?.url ? (
                      <img
                        src={`/api/canva/thumbnail-proxy/?url=${encodeURIComponent(tpl.thumbnail.url)}`}
                        alt={tpl.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-10 h-10 text-gray-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                        Select
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-800 truncate">{tpl.title}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">Brand Template</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'fill-form' && selectedTemplate && (
          <div>
            <div className="flex items-start gap-4 mb-6">
              <button onClick={() => setStep('select-template')} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">Fill Template Fields</h2>
                <p className="text-sm text-gray-500">
                  Brand Template: <strong className="text-violet-700">{selectedTemplate.title}</strong>
                  {' · '}
                  <button onClick={() => setStep('select-template')} className="text-violet-600 hover:underline text-xs">
                    Change
                  </button>
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Format:</span>
                {(['png', 'pdf'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`px-3 py-1 rounded-full font-medium border transition-colors ${
                      format === f ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-200 text-gray-600 hover:border-violet-300'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 p-3 text-blue-700 flex items-start gap-2 text-xs">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                The IDCS form below is generated directly from the Canva Brand Template dataset.
                Entered values are sent straight into the matching Canva autofill fields, then a live Canva-rendered preview is shown before download.
              </span>
            </div>

            {datasetLoading && (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-500 bg-white rounded-xl border border-gray-200">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading Brand Template fields…
              </div>
            )}

            {!datasetLoading && datasetError && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800 mb-4">
                <p className="font-medium">Could not load autofill fields</p>
                <p className="text-sm mt-1">{datasetError}</p>
                <p className="text-xs mt-2">If you just enabled new Canva scopes, reconnect the Canva account once and refresh.</p>
              </div>
            )}

            {!datasetLoading && !datasetError && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Autofill Dataset</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {supportedFieldCount} supported field{supportedFieldCount !== 1 ? 's' : ''}
                      {chartFields.length ? ` · ${chartFields.length} chart field${chartFields.length !== 1 ? 's' : ''} not shown` : ''}
                    </p>
                  </div>
                  <a
                    href={selectedTemplate.create_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-violet-600 hover:text-violet-800 inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" /> Open template in Canva
                  </a>
                </div>

                {!supportedFieldCount && (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
                    This Brand Template has no text or image autofill fields that IDCS can render.
                  </div>
                )}

                {textFields.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">Text Fields</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {textFields.map(([fieldKey]) => (
                        <Field
                          key={fieldKey}
                          label={humanizeFieldKey(fieldKey)}
                          value={fieldValues[fieldKey] ?? ''}
                          onChange={(v) => setFieldValue(fieldKey, v)}
                          placeholder={buildPlaceholder(fieldKey, 'text')}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {imageFields.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">Image Fields</h4>
                    <div className="space-y-4">
                      {imageFields.map(([fieldKey]) => (
                        <ImageUploadField
                          key={fieldKey}
                          label={humanizeFieldKey(fieldKey)}
                          hint={buildPlaceholder(fieldKey, 'image')}
                          preview={imagePreviews[fieldKey]}
                          file={imageFiles[fieldKey]}
                          onChange={(file) => handleImageChange(fieldKey, file)}
                          onRemove={() => removeImage(fieldKey)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {chartFields.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800 text-xs">
                    Chart autofill fields are present in this template but are not rendered in IDCS yet:
                    <div className="mt-2 flex flex-wrap gap-2">
                      {chartFields.map(([fieldKey]) => (
                        <span key={fieldKey} className="px-2 py-1 rounded-full bg-amber-100 border border-amber-200">
                          {humanizeFieldKey(fieldKey)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={datasetLoading || !!datasetError || !supportedFieldCount || !hasFilledFields}
                className="flex items-center gap-2 px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                Generate Live Preview
              </button>
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-violet-500" />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-800">Generating Live Canva Preview</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">
                {genProgress || 'Processing through n8n → Canva Autofill API…'}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Brand Template field mapping is being sent to n8n and Canva
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Waiting for Canva to process the autofill (30–90 s typical)
              </div>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
                <CheckCircle2 className="w-4 h-4" />
                Live Preview Ready!
              </div>
              <h2 className="text-2xl font-bold text-gray-900">{selectedTemplate?.title}</h2>
              {result.warning && (
                <p className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1">
                  <Info className="w-3.5 h-3.5" />
                  {result.warning}
                </p>
              )}
            </div>

            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-lg mb-6">
              {result.dataUrl ? (
                <img src={result.dataUrl} alt="Generated poster" className="w-full object-contain max-h-[600px]" />
              ) : result.export_url ? (
                <div className="bg-gray-50 p-8 text-center">
                  <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Preview not available — use the download link below.</p>
                </div>
              ) : (
                <div className="bg-gray-50 p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm">Poster created! Open it in Canva to view and download.</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              {(result.dataUrl || result.export_url) && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl shadow transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Download {format.toUpperCase()}
                </button>
              )}
              {result.canva_edit_url && (
                <a
                  href={result.canva_edit_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 hover:border-violet-400 text-gray-700 hover:text-violet-700 font-semibold rounded-xl shadow-sm transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Canva
                </a>
              )}
              <button
                onClick={reset}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 font-medium rounded-xl transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Make Another
              </button>
            </div>

            {result.design_id && (
              <p className="text-center text-xs text-gray-400 mt-4">Canva Design ID: {result.design_id}</p>
            )}
          </div>
        )}
      </div>

      <a ref={downloadRef} className="hidden" />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const cls =
    'w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 ' +
    'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent ' +
    'transition-shadow';
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cls}
      />
    </label>
  );
}

function ImageUploadField({
  label,
  hint,
  preview,
  file,
  onChange,
  onRemove,
}: {
  label: string;
  hint: string;
  preview?: string;
  file?: File;
  onChange: (f: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50">
      <div
        className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 bg-white flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-violet-400 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-6 h-6 text-gray-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
        {file && <p className="text-xs text-violet-600 mt-1 truncate">{file.name}</p>}
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium"
          >
            <Upload className="w-3.5 h-3.5" />
            {file ? 'Change' : 'Upload'}
          </button>
          {file && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
