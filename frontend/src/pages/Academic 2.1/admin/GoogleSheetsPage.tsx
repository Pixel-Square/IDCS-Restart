import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Database,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { fetchWithAuth } from '../../../services/fetchAuth';

type TabView = 'config' | 'links';

type GoogleSheetConfig = {
  serviceAccountEmail: string;
  privateKey: string;
  spreadsheetFolderId: string;
  impersonatedUserEmail: string;
  pollingIntervalMinutes: string;
  sharingDomain: string;
};

type StudentRow = {
  name: string;
  registerNo: string;
  [key: string]: string | undefined;
};

type CourseLink = {
  id: string;
  courseCode: string;
  courseName: string;
  semester: string;
  department: string;
  batch: string;
  facultyName: string;
  section: string;
  active: boolean;
  sheetUrl?: string;
  assignments: string[];
  students: StudentRow[];
};

const STORAGE_KEY = 'academic-v2-google-sheets-page';

const initialConfig: GoogleSheetConfig = {
  serviceAccountEmail: 'google-sheets@your-project.iam.gserviceaccount.com',
  privateKey: '-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----',
  spreadsheetFolderId: '1ABC123XYZ',
  impersonatedUserEmail: '',
  pollingIntervalMinutes: '10',
  sharingDomain: 'krct.ac.in',
};

function generateSheetUrl(courseCode: string) {
  return `https://docs.google.com/spreadsheets/d/${courseCode.toLowerCase()}-sheet/edit`;
}

export default function GoogleSheetsPage() {
  const [view, setView] = useState<TabView>('config');
  const [config, setConfig] = useState<GoogleSheetConfig>(initialConfig);
  const [links, setLinks] = useState<CourseLink[]>([]);
  const [filters, setFilters] = useState({ semester: 'all', department: 'all', batch: 'all' });
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [selectedInactiveIds, setSelectedInactiveIds] = useState<string[]>([]);
  const [previewLink, setPreviewLink] = useState<CourseLink | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [savedState, setSavedState] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [oauthStatus, setOauthStatus] = useState<{ authorized: boolean; userEmail: string | null }>({ authorized: false, userEmail: null });
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.config) setConfig({ ...initialConfig, ...parsed.config });
      }
    } catch {
      // Ignore malformed storage values and fall back to defaults
    }
  }, []);

  const fetchGoogleSheetsEndpoint = async (path: string, init?: RequestInit) => {
    let response = await fetchWithAuth(`/api/academic-v2${path}`, init);
    if (!response.ok && response.status === 404) {
      response = await fetchWithAuth(`/api/accounts/academic-v2${path}`, init);
    }
    return response;
  };

  useEffect(() => {
    let cancelled = false;

    const loadLinks = async () => {
      setIsLoadingLinks(true);
      setLinksError(null);

      try {
        const response = await fetchGoogleSheetsEndpoint('/google-sheets/links/');

        if (!response.ok) {
          throw new Error(`Unable to load course sheet links from the backend. (${response.status})`);
        }

        const payload = await response.json().catch(() => null);
        if (!cancelled) {
          setLinks(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (!cancelled) {
          setLinks([]);
          setLinksError(error instanceof Error ? error.message : 'Unable to load course sheet links from the backend.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLinks(false);
        }
      }
    };

    loadLinks();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ config }));
    } catch {
      // Ignore storage failures.
    }
  }, [config]);

  useEffect(() => {
    const refreshOauthStatus = async () => {
      try {
        const response = await fetchGoogleSheetsEndpoint('/google-sheets/oauth/status/');
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        if (payload) {
          setOauthStatus({ authorized: Boolean(payload.authorized), userEmail: payload.userEmail || null });
        }
      } catch {
        // Ignore OAuth status errors and keep the button available.
      }
    };

    refreshOauthStatus();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google-oauth-success') {
        refreshOauthStatus();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const filteredActiveLinks = useMemo(() => {
    return links.filter((item) => {
      if (!item.active) return false;
      const matchesSemester = filters.semester === 'all' || item.semester === filters.semester;
      const matchesDepartment = filters.department === 'all' || item.department === filters.department;
      const matchesBatch = filters.batch === 'all' || item.batch === filters.batch;
      return matchesSemester && matchesDepartment && matchesBatch;
    });
  }, [filters, links]);

  const filteredInactiveLinks = useMemo(() => {
    return links.filter((item) => {
      if (item.active) return false;
      const matchesSemester = filters.semester === 'all' || item.semester === filters.semester;
      const matchesDepartment = filters.department === 'all' || item.department === filters.department;
      const matchesBatch = filters.batch === 'all' || item.batch === filters.batch;
      return matchesSemester && matchesDepartment && matchesBatch;
    });
  }, [filters, links]);

  const semesterOptions = useMemo(() => Array.from(new Set(links.map((item) => item.semester))).sort(), [links]);
  const departmentOptions = useMemo(() => Array.from(new Set(links.map((item) => item.department))).sort(), [links]);
  const batchOptions = useMemo(() => Array.from(new Set(links.map((item) => item.batch))).sort(), [links]);

  const toggleInactiveSelection = (id: string) => {
    setSelectedInactiveIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleAuthorizeGoogle = async () => {
    setOauthLoading(true);
    try {
      const response = await fetchGoogleSheetsEndpoint('/google-sheets/oauth/start/');
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || 'Unable to start Google authorization.');
      }

      const payload = await response.json().catch(() => null);
      if (!payload?.authUrl) {
        throw new Error('The authorization URL was not returned by the backend.');
      }

      const popup = window.open(payload.authUrl, 'google-oauth', 'width=700,height=800,left=120,top=80');
      if (!popup) {
        throw new Error('Please allow pop-ups for this page so the Google authorization window can open.');
      }
      setSavedState({ message: 'Google authorization window opened. Complete sign-in and return to this page.', type: 'success' });
    } catch (error) {
      setSavedState({ message: error instanceof Error ? error.message : 'Unable to start Google authorization.', type: 'error' });
    } finally {
      setOauthLoading(false);
    }
  };

  const handleGenerateSheets = async () => {
    const selected = links.filter((item) => selectedInactiveIds.includes(item.id));
    if (!selected.length) return;

    const folderId = config.spreadsheetFolderId?.trim();
    if (!folderId || folderId === '1ABC123XYZ') {
      setSavedState({ message: 'Spreadsheet folder ID is required before creating Google sheets. Please enter a valid Drive folder ID.', type: 'error' });
      return;
    }

    if (!oauthStatus.authorized) {
      setSavedState({
        message: 'You must authorize your Google account first. Go to the Config tab and click "Authorize Google" — this lets the system use your personal Drive storage instead of the service account (which has no storage).',
        type: 'error',
      });
      return;
    }

    const requestBody = {
      section_ids: selected.map((item) => item.id),
      config: {
        serviceAccountEmail: config.serviceAccountEmail,
        privateKey: config.privateKey,
        spreadsheetFolderId: folderId,
        impersonatedUserEmail: config.impersonatedUserEmail?.trim(),
        sharingDomain: config.sharingDomain,
      },
    };

    try {
      const response = await fetchGoogleSheetsEndpoint('/google-sheets/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail: string = payload?.detail || 'Unable to create Google sheets.';
        if (response.status === 507 || detail.includes('STORAGE_QUOTA_EXCEEDED') || detail.toLowerCase().includes('storage quota')) {
          setSavedState({
            message:
              '⚠️ Drive Storage Quota Error — Google service accounts have no personal Drive storage. ' +
              'Please go to the Config tab and click "Authorize Google" to connect your own Google account. ' +
              'Once authorized, sheets will be created using your account\'s storage.',
            type: 'error',
          });
          setView('config');
          return;
        }
        throw new Error(detail);
      }

      const createdById = Array.isArray(payload)
        ? new Map(payload.map((entry: any) => [entry.id, entry]))
        : new Map();

      setLinks((current) =>
        current.map((item) => {
          const created = createdById.get(item.id);
          if (!created) return item;
          return {
            ...item,
            active: true,
            sheetUrl: created.sheetUrl || item.sheetUrl || generateSheetUrl(item.courseCode),
          };
        })
      );
      setSelectedInactiveIds([]);
      setSavedState({ message: Array.isArray(payload) && payload.length ? `Created ${payload.length} Google sheet${payload.length === 1 ? '' : 's'} successfully.` : 'No Google sheets were created.', type: 'success' });
    } catch (error) {
      setSavedState({ message: error instanceof Error ? error.message : 'Unable to create Google sheets.', type: 'error' });
    }
  };

  const handleDeactivate = (id: string) => {
    setLinks((current) => current.map((item) => (item.id === id ? { ...item, active: false, sheetUrl: undefined } : item)));
    setPreviewLink(null);
    setSavedState({ message: 'The sheet link was moved to Inactive Links.', type: 'success' });
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      setTimeout(() => setCopiedLink(null), 1500);
    } catch {
      setCopiedLink(url);
    }
  };

  const handleSaveConfig = () => {
    setSavedState({ message: 'Google Sheets configuration was saved locally for this admin session.', type: 'success' });
  };

  const handleResetConfig = () => {
    setConfig(initialConfig);
    setSavedState({ message: 'Configuration reset to the default demo values.', type: 'warning' });
  };

  const selectedCount = selectedInactiveIds.length;

  const getStudentValue = (student: StudentRow, assignment: string) => {
    const rawValue = student[assignment];
    return rawValue && rawValue.trim() ? rawValue : '—';
  };

  const renderCourseCard = (item: CourseLink, isActive: boolean) => {
    return (
      <div key={item.id} className={`rounded-xl border p-4 shadow-sm ${isActive ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">{item.courseName}</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">{item.courseCode} • {item.department} • Sem {item.semester} • Batch {item.batch}</p>
            <p className="mt-2 text-xs text-slate-600">Faculty: {item.facultyName}</p>
            <p className="mt-1 text-xs text-slate-600">Section: {item.section}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {item.assignments.map((assignment) => (
            <span key={assignment} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
              {assignment}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!isActive && (
            <label className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={selectedInactiveIds.includes(item.id)}
                onChange={() => toggleInactiveSelection(item.id)}
                className="h-3.5 w-3.5"
              />
              Select
            </label>
          )}

          {isActive ? (
            <>
              <button
                type="button"
                onClick={() => setPreviewLink(item)}
                className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Eye className="h-3.5 w-3.5" /> View
              </button>
              <button
                type="button"
                onClick={() => item.sheetUrl && handleCopyLink(item.sheetUrl)}
                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
              >
                <Copy className="h-3.5 w-3.5" /> Copy link
              </button>
              <button
                type="button"
                onClick={() => handleDeactivate(item.id)}
                className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => toggleInactiveSelection(item.id)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {selectedInactiveIds.includes(item.id) ? 'Selected' : 'Choose'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-blue-600" />
              <h1 className="text-2xl font-bold text-slate-900">Google Sheets</h1>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Connect Academic 2.1 course sheets, manage per-course links, and preview auto-generated mark-entry tables.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setView('config')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${view === 'config' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              Configs
            </button>
            <button
              type="button"
              onClick={() => setView('links')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${view === 'links' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              Links
            </button>
          </div>
        </div>

        {savedState ? (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              savedState.type === 'error'
                ? 'border-red-300 bg-red-50 text-red-700'
                : savedState.type === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span>{savedState.message}</span>
              {savedState.type === 'error' && (
                <button
                  type="button"
                  onClick={() => setSavedState(null)}
                  className="ml-2 shrink-0 text-red-400 hover:text-red-600"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ) : null}

        {isLoadingLinks ? (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Loading live Academic 2.1 sheet data from the backend...
          </div>
        ) : null}

        {linksError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {linksError}
          </div>
        ) : null}

        {view === 'config' ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">Google API connection settings</h2>
              </div>
              <p className="mb-6 text-sm text-slate-600">
                Configure the Google API credentials that will be used later to create and sync course sheets.
              </p>

              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Authorize Google from the UI</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {oauthStatus.authorized
                        ? `Connected to ${oauthStatus.userEmail || 'your Google account'}.`
                        : 'Authorize once from the browser so the backend can create sheets using stored OAuth credentials.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAuthorizeGoogle}
                    disabled={oauthLoading}
                    className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {oauthLoading ? 'Opening...' : oauthStatus.authorized ? 'Re-authorize' : 'Authorize Google'}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Service account email
                  <input
                    value={config.serviceAccountEmail}
                    onChange={(event) => setConfig((current) => ({ ...current, serviceAccountEmail: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Polling interval (minutes)
                  <input
                    value={config.pollingIntervalMinutes}
                    onChange={(event) => setConfig((current) => ({ ...current, pollingIntervalMinutes: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  Private key
                  <textarea
                    value={config.privateKey}
                    onChange={(event) => setConfig((current) => ({ ...current, privateKey: event.target.value }))}
                    rows={6}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Spreadsheet folder ID
                  <input
                    value={config.spreadsheetFolderId}
                    onChange={(event) => setConfig((current) => ({ ...current, spreadsheetFolderId: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Enter the Drive folder ID where the service account should create spreadsheets. This must be a shared folder that counts against the folder owner's storage.
                  </p>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Impersonated user email (optional)
                  <input
                    value={config.impersonatedUserEmail}
                    onChange={(event) => setConfig((current) => ({ ...current, impersonatedUserEmail: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Optional: only use if you have domain delegation"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Leave empty to use the service account directly. Only fill this if your organization has a valid impersonation setup.
                  </p>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Share with domain
                  <input
                    value={config.sharingDomain}
                    onChange={(event) => setConfig((current) => ({ ...current, sharingDomain: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Save className="h-4 w-4" /> Save configuration
                </button>
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" /> Reset
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Next steps</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="rounded-lg border border-slate-200 bg-slate-50 p-3">Use the credentials above to create course spreadsheets via the Google Sheets API.</li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 p-3">Each course sheet can contain tabs for the exam assignments configured in the QP pattern.</li>
                <li className="rounded-lg border border-slate-200 bg-slate-50 p-3">The Links tab below lets you activate or deactivate the generated links for each course and section.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {!oauthStatus.authorized && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>⚠️ Google not authorized.</strong> You must click{' '}
                <button
                  type="button"
                  onClick={() => setView('config')}
                  className="font-semibold underline hover:text-amber-900"
                >
                  Config → Authorize Google
                </button>{' '}
                before generating sheets. Service accounts have no Drive storage — authorization connects your own Google account (which has the storage you see in Drive).
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Course sheet links</h2>
                  <p className="mt-1 text-sm text-slate-600">List course-to-section mappings, activate generated links, and preview the mark-entry sheet structure.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedInactiveIds(filteredInactiveLinks.map((item) => item.id))}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Search className="h-4 w-4" /> Select all
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateSheets}
                    disabled={!selectedCount}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <ExternalLink className="h-4 w-4" /> Generate sheets ({selectedCount})
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">
                  Semester
                  <select
                    value={filters.semester}
                    onChange={(event) => setFilters((current) => ({ ...current, semester: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">All semesters</option>
                    {semesterOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Department
                  <select
                    value={filters.department}
                    onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">All departments</option>
                    {departmentOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Batch
                  <select
                    value={filters.batch}
                    onChange={(event) => setFilters((current) => ({ ...current, batch: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">All batches</option>
                    {batchOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Active links</h3>
                    <p className="mt-1 text-sm text-slate-600">These links are currently available for faculty and students.</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{filteredActiveLinks.length} active</span>
                </div>
                <div className="space-y-3">
                  {!isLoadingLinks && !links.length && !linksError ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      No live course sheet links are available yet. Make sure the Academic 2.1 backend has course/section data and that you are signed in.
                    </div>
                  ) : null}
                  {filteredActiveLinks.length ? filteredActiveLinks.map((item) => renderCourseCard(item, true)) : !isLoadingLinks && !links.length ? null : <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">No active links match the selected filters.</div>}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Non active links</h3>
                    <p className="mt-1 text-sm text-slate-600">Select one or more course-section mappings to generate new Google Sheets.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{filteredInactiveLinks.length} inactive</span>
                </div>
                <div className="space-y-3">
                  {filteredInactiveLinks.length ? filteredInactiveLinks.map((item) => renderCourseCard(item, false)) : !isLoadingLinks && !links.length ? null : <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">No inactive links match the selected filters.</div>}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      {previewLink ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{previewLink.courseName} • {previewLink.section}</h3>
                <p className="text-sm text-slate-600">Auto-generated sheet preview with exam assignment tabs.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => previewLink.sheetUrl && handleCopyLink(previewLink.sheetUrl)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-4 w-4" /> {copiedLink === previewLink.sheetUrl ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" onClick={() => setPreviewLink(null)} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="flex flex-wrap gap-2">
                {previewLink.assignments.map((assignment) => (
                  <span key={assignment} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                    {assignment}
                  </span>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  Sheet tabs: {previewLink.assignments.join(', ')}
                </div>
                <div className="overflow-x-auto p-4">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left text-slate-700">
                        <th className="border border-slate-200 px-3 py-2">Student Name</th>
                        <th className="border border-slate-200 px-3 py-2">Register Number</th>
                        {previewLink.assignments.map((assignment) => (
                          <th key={assignment} className="border border-slate-200 px-3 py-2">{assignment}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewLink.students.map((student) => (
                        <tr key={student.registerNo} className="bg-white text-slate-700">
                          <td className="border border-slate-200 px-3 py-2">{student.name}</td>
                          <td className="border border-slate-200 px-3 py-2">{student.registerNo}</td>
                          {previewLink.assignments.map((assignment) => (
                            <td key={`${student.registerNo}-${assignment}`} className="border border-slate-200 px-3 py-2">
                              {getStudentValue(student, assignment)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
