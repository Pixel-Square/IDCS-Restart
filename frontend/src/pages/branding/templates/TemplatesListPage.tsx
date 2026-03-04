/**
 * TemplatesListPage.tsx  (Canva-powered – replaces the previous PNG-upload version)
 *
 * Branding users can:
 *   1. Connect their Canva account (OAuth PKCE)
 *   2. Browse existing Canva designs and save them as IDCS poster templates
 *   3. View, preview, and delete saved templates
 *   4. Open any saved template in Canva for editing
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Search, ExternalLink, BookmarkPlus, Trash2, CheckCircle2, RefreshCw,
  Layout, Palette, AlertCircle, Loader, Link2Off, CheckCircle,
} from 'lucide-react';
import {
  getAllCanvaTemplates,
  deleteCanvaTemplate,
  getConnection,
  clearConnection,
  type CanvaTemplate,
} from '../../../store/canvaStore';
import {
  listUserDesigns,
  saveAsTemplate,
  type CanvaDesignItem,
} from '../../../services/canva/CanvaTemplateService';
import {
  disconnect,
  initiateOAuth,
} from '../../../services/canva/CanvaAuthService';

// ── Canva App banner at the top of the connected view ─────────────────────────

function CanvaAppBanner() {
  return (
    <div className="flex items-start gap-4 bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-7">
      <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        CA
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm mb-0.5">
          IDCS Poster Maker — Canva App
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Open any event poster in Canva's editor and launch the{' '}
          <strong>IDCS Poster Maker</strong> app from the{' '}
          <strong>Apps panel</strong> inside Canva. It lets you inject event
          text fields directly into the design and choose from preset poster
          layouts — no copy-pasting.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <a
            href="https://www.canva.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors"
          >
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function getBrandingUser(): string {
  try {
    const raw = localStorage.getItem('branding_user');
    return raw ? (JSON.parse(raw)?.username ?? 'branding') : 'branding';
  } catch { return 'branding'; }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TemplatesListPage() {
  const [isConnected, setIsConnected] = useState(() => !!getConnection());

  // Browse state
  const [designs, setDesigns]          = useState<CanvaDesignItem[]>([]);
  const [searchQuery, setSearchQuery]  = useState('');
  const [fetchingDesigns, setFetching] = useState(false);
  const [fetchError, setFetchError]    = useState<string | null>(null);
  const [savedIds, setSavedIds]        = useState<Set<string>>(
    () => new Set(getAllCanvaTemplates().map((t) => t.canvaTemplateId)),
  );

  // Saved templates state
  const [templates, setTemplates] = useState<CanvaTemplate[]>(getAllCanvaTemplates);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Connect state
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);

  // ── Fetch designs ──────────────────────────────────────────────────────────

  const loadDesigns = useCallback(async (query = '') => {
    setFetching(true);
    setFetchError(null);
    try {
      const items = await listUserDesigns(query);
      setDesigns(items);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'Failed to load designs.';
      setFetchError(msg);
      if (msg.toLowerCase().includes('401') || msg.toLowerCase().includes('unauthori')) {
        clearConnection();
        setIsConnected(false);
      }
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) loadDesigns('');
  }, [isConnected, loadDesigns]);

  // ── OAuth ──────────────────────────────────────────────────────────────────

  async function handleConnect() {
    try {
      setConnecting(true);
      setConnectErr(null);
      await initiateOAuth();
    } catch (err: unknown) {
      setConnectErr((err as Error).message ?? 'OAuth failed.');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnect();
    setIsConnected(false);
    setDesigns([]);
  }

  // ── Save / delete templates ────────────────────────────────────────────────

  function handleSaveTemplate(design: CanvaDesignItem) {
    saveAsTemplate(design, getBrandingUser());
    setTemplates(getAllCanvaTemplates());
    setSavedIds((prev) => new Set([...prev, design.id]));
  }

  function handleDelete(id: string) {
    deleteCanvaTemplate(id);
    const remaining = getAllCanvaTemplates();
    setTemplates(remaining);
    setSavedIds(new Set(remaining.map((t) => t.canvaTemplateId)));
    setDeletingId(null);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadDesigns(searchQuery);
  }

  // ── UNCONNECTED STATE ──────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-purple-100 flex items-center justify-center mx-auto mb-5">
            <Palette className="w-10 h-10 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Templates</h1>
          <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed">
            Connect your Canva account to browse your designs and save them as reusable
            event poster templates for HOD use.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 space-y-3">
          {[
            'Browse and save Canva designs as IDCS event templates',
            'HODs generate autofilled poster designs from your templates',
            'Open the final design in Canva for adjustments',
            'Export finished posters as PNG or PDF — stored in IDCS',
          ].map((text) => (
            <div key={text} className="flex items-center gap-3">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              <p className="text-sm text-gray-700">{text}</p>
            </div>
          ))}
        </div>

        {connectErr && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Could not start OAuth</p>
              <p className="mt-0.5">{connectErr}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={connecting}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors shadow-md disabled:opacity-60"
        >
          <Palette className="w-5 h-5" />
          {connecting ? 'Redirecting to Canva…' : 'Connect Canva Account'}
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          You will be redirected to Canva to authorise access.
        </p>
      </div>
    );
  }

  // ── CONNECTED STATE ────────────────────────────────────────────────────────

  const connection = getConnection()!;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">Remove Template?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This only removes it from IDCS. Your Canva design is unaffected.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium">Cancel</button>
              <button onClick={() => handleDelete(deletingId)} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">Remove</button>
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
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 transition-colors"
        >
          <Link2Off className="w-4 h-4" /> Disconnect Canva
        </button>
      </div>

      {/* Canva App quickstart banner */}
      <CanvaAppBanner />

      {/* ── Browse Canva Designs ── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-base font-bold text-gray-800">Browse Your Canva Designs</h2>
          <button
            onClick={() => loadDesigns(searchQuery)}
            disabled={fetchingDesigns}
            className="flex items-center gap-1.5 text-xs text-purple-600 font-medium hover:text-purple-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingDesigns ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your Canva designs…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors">
            Search
          </button>
        </form>

        {fetchingDesigns && (
          <div className="flex items-center justify-center py-12 gap-3 text-gray-500 text-sm">
            <Loader className="w-5 h-5 animate-spin" /> Loading your Canva designs…
          </div>
        )}

        {!fetchingDesigns && fetchError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div><p className="font-semibold">Failed to load designs</p><p className="mt-0.5">{fetchError}</p></div>
          </div>
        )}

        {!fetchingDesigns && !fetchError && designs.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            No designs found.{' '}
            <a href="https://www.canva.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline inline-flex items-center gap-1">
              Open Canva <ExternalLink className="w-3.5 h-3.5" />
            </a>{' '}to create one, then refresh.
          </div>
        )}

        {!fetchingDesigns && designs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {designs.map((design) => {
              const isSaved = savedIds.has(design.id);
              return (
                <div key={design.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="aspect-video bg-gray-100 overflow-hidden relative">
                    {design.thumbnail?.url ? (
                      <img src={design.thumbnail.url} alt={design.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Layout className="w-8 h-8 text-gray-300" /></div>
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
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors ${isSaved ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        {isSaved ? 'Re-save' : 'Save as Template'}
                      </button>
                      {design.urls?.edit_url && (
                        <a href={design.urls.edit_url} target="_blank" rel="noopener noreferrer"
                          className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors" title="Open in Canva">
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
      </section>

      {/* ── Saved Templates ── */}
      <section>
        <h2 className="text-base font-bold text-gray-800 mb-4">
          Saved Templates
          <span className="ml-2 text-xs font-normal text-gray-400">
            ({templates.length}) — available in HOD event creation
          </span>
        </h2>

        {templates.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-dashed border-gray-200">
            No templates saved yet. Browse your Canva designs above and click{' '}
            <span className="font-semibold text-purple-600">Save as Template</span>.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="aspect-video bg-gray-100 overflow-hidden relative">
                  {tpl.previewUrl ? (
                    <img src={tpl.previewUrl} alt={tpl.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Palette className="w-8 h-8 text-purple-200" /></div>
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
                    <button onClick={() => setDeletingId(tpl.id)}
                      className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors" title="Remove">
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
