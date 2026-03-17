/**
 * TemplatesListPage.tsx  (Canva-powered)
 *
 * Branding users can:
 *   1. Connect their Canva account (server-side PKCE OAuth – same flow as
 *      the Canva ecommerce starter kit, handled entirely by the Django backend)
 *   2. Browse existing Canva designs and save them to the IDCS template library
 *      (stored in the Django DB, shared with all HOD users)
 *   3. View, preview, and delete saved templates
 *   4. Open any saved template in Canva for editing
 *
 * After the OAuth callback, Django redirects to
 *   /branding/templates?canva_connected=1
 * and this page detects that param, loads the connection from session, then
 * strips it from the URL.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, ExternalLink, BookmarkPlus, Trash2, RefreshCw,
  Layout, Palette, AlertCircle, Loader, Link2Off, CheckCircle,
  AlertTriangle, Upload, ScanSearch, Edit3, ImagePlus, Plus, ChevronUp,
} from 'lucide-react';
import {
  getAllCanvaTemplates,
  getConnection,
  clearConnection,
  type CanvaTemplate,
} from '../../../store/canvaStore';
import {
  listUserBrandTemplates,
  fetchTemplatesFromBackend,
  saveAsTemplate,
  deleteTemplate,
  type CanvaBrandTemplateItem,
} from '../../../services/canva/CanvaTemplateService';
import {
  disconnect,
  initiateOAuth,
  loadConnectionFromBackend,
} from '../../../services/canva/CanvaAuthService';
import {
  getAllTemplates, deleteTemplate as deleteBrandingTemplate,
  type BrandingTemplate,
} from '../../../store/templateStore';


// ── Canva App banner ──────────────────────────────────────────────────────────

function CanvaAppBanner() {
  return (
    <div className="flex items-start gap-4 bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-7">
      <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">CA</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm mb-0.5">IDCS Poster Maker — Canva App</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Open any event poster in Canva's editor and launch the{' '}
          <strong>IDCS Poster Maker</strong> app from the <strong>Apps panel</strong>.
          It lets you inject event text fields directly into the design.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <a href="https://www.canva.com/apps" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors">
            <ExternalLink className="w-3 h-3" /> Open Canva Apps
          </a>
          <span className="text-xs text-gray-400">
            App ID: <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-mono">AAHAAJpXAcc</code>
          </span>
        </div>
      </div>
    </div>
  );
}

function getBrandingUser(): string {
  try {
    const me = localStorage.getItem('me');
    if (me) return JSON.parse(me)?.username ?? 'branding';
  } catch { /* ignore */ }
  return 'branding';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TemplatesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const didInit = useRef(false);
  const localUploadRef = useRef<HTMLInputElement>(null);

  const [isConnected,   setIsConnected]   = useState(false);
  const [checkingConn,  setCheckingConn]  = useState(true);
  const [connectErr,    setConnectErr]    = useState<string | null>(null);

  // Browse state
  const [showBrowse,     setShowBrowse]     = useState(false);
  const [designs,        setDesigns]        = useState<CanvaBrandTemplateItem[]>([]);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [fetchingDesigns, setFetchingDesigns] = useState(false);
  const [fetchError,     setFetchError]     = useState<string | null>(null);
  const [savedIds,       setSavedIds]       = useState<Set<string>>(new Set());
  const [savingId,       setSavingId]       = useState<string | null>(null);

  // Saved templates state
  const [templates,   setTemplates]   = useState<CanvaTemplate[]>([]);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [deleteConf,  setDeleteConf]  = useState<string | null>(null);

  // ── Local (image-based) IDCS Templates ────────────────────────────────────
  const [localTemplates, setLocalTemplates] = useState<BrandingTemplate[]>(() => getAllTemplates());

  function refreshLocalTemplates() {
    setLocalTemplates(getAllTemplates());
  }

  function handleLocalUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const imageDataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        navigate('/branding/templates/editor', {
          state: {
            imageDataUrl,
            aspectRatio,
            templateName: file.name.replace(/\.[^.]+$/, ''),
          },
        });
      };
      img.src = imageDataUrl;
    };
    reader.readAsDataURL(file);
    // reset input so same file can be re-selected
    e.target.value = '';
  }

  function handleDeleteLocal(id: string) {
    deleteBrandingTemplate(id);
    refreshLocalTemplates();
  }

  function handleEditLocal(tpl: BrandingTemplate) {
    navigate('/branding/templates/editor', {
      state: {
        imageDataUrl: tpl.backgroundDataUrl,
        aspectRatio: tpl.aspectRatio,
        templateName: tpl.name,
        existingId: tpl.id,
        existingRegions: tpl.regions,
      },
    });
  }

  // ── Init: check connection (handles ?canva_connected=1 OR ?canva_error=...) ──

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const connectedParam = searchParams.get('canva_connected');
    const errorParam     = searchParams.get('canva_error');

    if (errorParam) {
      setConnectErr(decodeURIComponent(errorParam));
      setCheckingConn(false);
      setSearchParams({}, { replace: true });
      return;
    }

    // Load connection from backend session (covers both first-load and post-OAuth)
    loadConnectionFromBackend().then((conn) => {
      const connected = !!conn;
      setIsConnected(connected);
      setCheckingConn(false);
      if (connectedParam) setSearchParams({}, { replace: true });
      if (connected) {
        loadTemplates();
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load templates from backend DB ────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    try {
      const items = await fetchTemplatesFromBackend();
      setTemplates(items);
      setSavedIds(new Set(items.map((t) => t.canvaTemplateId)));
    } catch {
      setTemplates(getAllCanvaTemplates()); // localStorage fallback
    }
  }, []);

  // ── Load Canva Brand Templates ────────────────────────────────────────────

  const loadDesigns = useCallback(async (query: string) => {
    setFetchingDesigns(true);
    setFetchError(null);
    try {
      const items = await listUserBrandTemplates(query);
      setDesigns(items);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'Failed to load brand templates.';
      setFetchError(msg);
      if (msg.toLowerCase().includes('401') || msg.toLowerCase().includes('unauthori')) {
        clearConnection();
        setIsConnected(false);
      }
    } finally {
      setFetchingDesigns(false);
    }
  }, []);

  // ── OAuth ─────────────────────────────────────────────────────────────────

  function handleConnect() {
    setConnectErr(null);
    initiateOAuth(); // redirects browser to /api/canva/oauth/authorize
  }

  async function handleDisconnect() {
    await disconnect();
    setIsConnected(false);
    setDesigns([]);
    setTemplates([]);
  }

  // ── Save / delete templates ───────────────────────────────────────────────

  async function handleSaveTemplate(design: CanvaBrandTemplateItem) {
    setSavingId(design.id);
    try {
      await saveAsTemplate(design, getBrandingUser());
      await loadTemplates();
      setShowBrowse(false); // close panel after saving
    } catch (err: unknown) {
      alert((err as Error).message ?? 'Failed to save template.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeleteConf(null);
    setDeletingId(id);
    try {
      await deleteTemplate(id);
      await loadTemplates();
    } finally {
      setDeletingId(null);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadDesigns(searchQuery);
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (checkingConn) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-gray-400 text-sm">
        <Loader className="w-5 h-5 animate-spin" /> Checking Canva connection…
      </div>
    );
  }

  // ── UNCONNECTED STATE ─────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-purple-100 flex items-center justify-center mx-auto mb-5">
            <Palette className="w-10 h-10 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Templates</h1>
          <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed">
            Connect your Canva account to browse your Brand Templates and save them as reusable
            autofill-ready poster templates for HOD use.
          </p>
        </div>

        {/* Feature list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 space-y-3">
          {[
            'Browse and save Canva Brand Templates as IDCS event templates',
            'Templates are stored in the DB — shared with all HOD event flows',
            'HODs generate autofilled poster designs from your saved templates',
            'Open the autofilled design in Canva for final adjustments',
            'Export finished posters as PNG or PDF — stored inside IDCS',
          ].map((text) => (
            <div key={text} className="flex items-center gap-3">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              <p className="text-sm text-gray-700">{text}</p>
            </div>
          ))}
        </div>

        {/* Error */}
        {connectErr && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Could not connect to Canva</p>
              <p className="mt-0.5">{connectErr}</p>
              {(connectErr === 'invalid_request' || connectErr.includes('redirect')) && (
                <p className="mt-2 text-xs text-red-600 bg-red-100 rounded-lg p-2 leading-relaxed">
                  <strong>Fix required:</strong> Register the redirect URI in your Canva Developer Portal
                  (<a href="https://www.canva.com/developers/" className="underline" target="_blank" rel="noopener noreferrer">canva.com/developers</a>):<br />
                  <code className="block mt-1 bg-white rounded px-2 py-1 font-mono text-[11px] text-red-700">
                    {window.location.origin}/api/canva/oauth/callback
                  </code>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Redirect URI instruction */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-xs text-amber-800">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Register this redirect URI in the Canva Developer Portal first:
          </p>
          <code className="block bg-white rounded px-2 py-1.5 font-mono text-[11px] text-amber-900 select-all">
            {window.location.origin}/api/canva/oauth/callback
          </code>
          <p className="mt-1.5 text-amber-700">
            Go to <a href="https://www.canva.com/developers/" className="underline font-medium" target="_blank" rel="noopener noreferrer">canva.com/developers</a>{' '}
            → Your App → Redirect URLs → Add the URL above.
          </p>
        </div>

        <button
          onClick={handleConnect}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors shadow-md"
        >
          <Palette className="w-5 h-5" />
          Connect Canva Account
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          You will be redirected to Canva to authorise access.
        </p>
      </div>
    );
  }

  // ── CONNECTED STATE ───────────────────────────────────────────────────────

  const connection = getConnection()!;

  return (
    <div className="max-w-5xl mx-auto">

      {/* Delete confirmation */}
      {deleteConf && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">Remove Template?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This only removes it from IDCS. Your Canva design is not deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConf(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium">Cancel</button>
              <button onClick={() => handleDelete(deleteConf)} disabled={!!deletingId}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                {deletingId === deleteConf ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-500 text-sm mt-1">
            Connected as <span className="font-semibold text-gray-700">{connection.displayName}</span>
          </p>
        </div>
        <button onClick={handleDisconnect}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 transition-colors">
          <Link2Off className="w-4 h-4" /> Disconnect Canva
        </button>
      </div>

      <CanvaAppBanner />

      {/* ── Browse Canva Brand Templates (collapsed by default) ── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-base font-bold text-gray-800">Import Brand Templates from Canva</h2>
          <div className="flex items-center gap-2">
            {showBrowse && (
              <button onClick={() => loadDesigns(searchQuery)} disabled={fetchingDesigns}
                className="flex items-center gap-1.5 text-xs text-purple-600 font-medium hover:text-purple-700">
                <RefreshCw className={`w-3.5 h-3.5 ${fetchingDesigns ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
            <button
              onClick={() => {
                if (!showBrowse) loadDesigns(searchQuery);
                setShowBrowse((v) => !v);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors">
              {showBrowse ? <><ChevronUp className="w-3.5 h-3.5" /> Hide</> : <><Plus className="w-3.5 h-3.5" /> Browse Brand Templates</>}
            </button>
          </div>
        </div>

        {!showBrowse && (
          <p className="text-xs text-gray-400 mb-2">Browse your Canva Brand Templates and save them as autofill-ready templates.</p>
        )}

        {showBrowse && (<>
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your Canva Brand Templates…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          </div>
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors">
            Search
          </button>
        </form>

        {fetchingDesigns && (
          <div className="flex items-center justify-center py-12 gap-3 text-gray-500 text-sm">
            <Loader className="w-5 h-5 animate-spin" /> Loading your Canva Brand Templates…
          </div>
        )}
        {!fetchingDesigns && fetchError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div><p className="font-semibold">Failed to load Brand Templates</p><p className="mt-0.5">{fetchError}</p></div>
          </div>
        )}
        {!fetchingDesigns && !fetchError && designs.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            No Brand Templates found.{' '}
            <a href="https://www.canva.com" target="_blank" rel="noopener noreferrer"
              className="text-purple-600 hover:underline inline-flex items-center gap-1">
              Open Canva <ExternalLink className="w-3.5 h-3.5" />
            </a>{' '}to publish a Brand Template, then refresh.
          </div>
        )}

        {!fetchingDesigns && designs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {designs.map((design) => {
              const isSaved  = savedIds.has(design.id);
              const isSaving = savingId === design.id;
              return (
                <div key={design.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="aspect-video bg-gray-100 overflow-hidden relative">
                    {design.thumbnail?.url ? (
                      <img src={design.thumbnail.url} alt={design.title}
                        className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Layout className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                    {isSaved && (
                      <div className="absolute top-2 right-2 bg-green-500/90 text-white text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Saved
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-gray-900 text-sm truncate mb-2">{design.title || 'Untitled'}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveTemplate(design)}
                        disabled={isSaving}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors
                          ${isSaved
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                          } disabled:opacity-60`}
                      >
                        {isSaving
                          ? <Loader className="w-3.5 h-3.5 animate-spin" />
                          : <BookmarkPlus className="w-3.5 h-3.5" />
                        }
                        {isSaving ? 'Saving…' : isSaved ? 'Re-save' : 'Save as Template'}
                      </button>
                      {design.create_url && (
                        <a href={design.create_url} target="_blank" rel="noopener noreferrer"
                          className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                          title="Open in Canva">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>)}
      </section>

      {/* ── Saved Templates ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-800">
            Saved Templates
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({templates.length}) — available in HOD event creation
            </span>
          </h2>
          <button onClick={loadTemplates} className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-dashed border-gray-200">
            No templates saved yet. Browse your Canva Brand Templates above and click{' '}
            <span className="font-semibold text-purple-600">Save as Template</span>.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="aspect-video bg-gray-100 overflow-hidden relative">
                  {tpl.previewUrl ? (
                    <img src={tpl.previewUrl} alt={tpl.name}
                      className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Palette className="w-8 h-8 text-purple-200" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                  <div className="absolute bottom-2 left-2 text-white text-xs font-semibold drop-shadow">{tpl.name}</div>
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-400 mb-3">
                    Saved {new Date(tpl.savedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })} · by {tpl.savedBy}
                  </p>
                  <div className="flex gap-2">
                    {tpl.editUrl && (
                      <a href={tpl.editUrl} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" /> Edit in Canva
                      </a>
                    )}
                    <button onClick={() => setDeleteConf(tpl.id)} disabled={deletingId === tpl.id}
                      className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
                      title="Remove">
                      {deletingId === tpl.id
                        ? <Loader className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          IDCS LOCAL POSTER TEMPLATES
          Upload a college event poster PNG → mark placeholder zones → save.
          HOD users see these templates in their event creation poster preview.
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <ImagePlus className="w-4 h-4 text-purple-600" />
              IDCS Poster Templates
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload a poster image, draw placeholder zones, and save — HOD users will see these in the Live Poster Preview.
            </p>
          </div>
          <button
            onClick={refreshLocalTemplates}
            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Upload card */}
        <div
          className="mb-5 border-2 border-dashed border-purple-200 rounded-2xl p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all"
          onClick={() => localUploadRef.current?.click()}
        >
          <input
            ref={localUploadRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleLocalUpload}
          />
          <Upload className="w-8 h-8 text-purple-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-purple-700">Upload a Poster Template Image</p>
          <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP — any size. The editor will open so you can mark placeholder zones.</p>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-purple-500">
            <ScanSearch className="w-3.5 h-3.5" />
            <span>After upload, use "Scan Template" to auto-detect placeholder text via OCR</span>
          </div>
        </div>

        {/* How-it-works guide */}
        <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700">
          <p className="font-semibold text-indigo-800 mb-1">How to create a local poster template:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Upload a college event poster image above.</li>
            <li>In the editor, click <strong>"Scan Template for Placeholders"</strong> to auto-detect zones via OCR.</li>
            <li>Drag zones to fine-tune positions. Add/remove zones from the right panel.</li>
            <li>Set text style (font size, color, bold) for each zone.</li>
            <li>Click <strong>Save Template</strong> — it becomes available to HODs in their event creation page.</li>
          </ol>
        </div>

        {/* Local templates grid */}
        {localTemplates.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-dashed border-gray-200">
            No local poster templates yet. Upload a poster image above to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {localTemplates.map((tpl) => (
              <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm group">
                {/* Preview */}
                <div className="aspect-video bg-gray-100 overflow-hidden relative">
                  <img src={tpl.backgroundDataUrl} alt={tpl.name}
                    className="w-full h-full object-cover" />
                  {/* Zone count badge */}
                  <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {tpl.regions.length} zone{tpl.regions.length !== 1 ? 's' : ''}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-2 left-2 text-white text-xs font-semibold drop-shadow">{tpl.name}</div>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-400 mb-2">
                    {new Date(tpl.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    {' · '}{tpl.regions.length} placeholder{tpl.regions.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditLocal(tpl)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-purple-200 text-purple-600 text-xs font-semibold hover:bg-purple-50 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Zones
                    </button>
                    <button
                      onClick={() => handleDeleteLocal(tpl.id)}
                      className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
