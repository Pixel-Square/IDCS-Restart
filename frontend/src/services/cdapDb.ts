import fetchWithAuth from './fetchAuth';

const DEFAULT_API_BASE = 'https://db.zynix.us';
const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000' : DEFAULT_API_BASE);

const ASSESSMENT_MASTER_CFG_CACHE_KEY = 'obe_assessment_master_config_cache';

async function buildFriendlyError(res: Response, fallback: string) {
  const contentType = res.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const data = await res.json();
      const detail = data?.detail || data?.message;
      if (detail) return `${fallback}: ${detail}`;
    }
  } catch {
    // ignore parse errors
  }

  if (res.status === 401) return `${fallback}: Authentication required. Please login.`;
  if (res.status === 403) return `${fallback}: Permission required.`;
  if (res.status === 404) {
    return `${fallback}: No CDAP found for this course yet. Upload the Excel to create one.`;
  }

  let text = '';
  try {
    text = await res.text();
  } catch {
    // ignore
  }
  const trimmed = (text || '').trim();
  if (trimmed && !trimmed.startsWith('<')) return `${fallback}: ${trimmed}`;
  return `${fallback}: Server returned ${res.status}.`;
}

export async function fetchCdapRevision(subjectId: string) {
  const url = `${API_BASE}/api/obe/cdap-revision/${encodeURIComponent(subjectId)}`;
  const res = await fetchWithAuth(url, { method: 'GET' });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'CDAP revision fetch failed');
    throw new Error(message);
  }
  return res.json();
}

export async function fetchArticulationMatrix(subjectId: string) {
  const url = `${API_BASE}/api/obe/articulation-matrix/${encodeURIComponent(subjectId)}`;
  const res = await fetchWithAuth(url, { method: 'GET' });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'Articulation Matrix fetch failed');
    throw new Error(message);
  }
  return res.json();
}

export async function saveCdapRevision(payload: any) {
  const subjectId = payload?.subjectId || payload?.subject_id;
  if (!subjectId) throw new Error('subjectId is required to save CDAP revision');
  const url = `${API_BASE}/api/obe/cdap-revision/${encodeURIComponent(subjectId)}`;
  const res = await fetchWithAuth(url, { method: 'PUT', body: JSON.stringify(payload) });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'CDAP revision save failed');
    throw new Error(message);
  }
  return res.json();
}

export async function fetchGlobalAnalysisMapping() {
  const url = `${API_BASE}/api/obe/active-learning-mapping`;
  const res = await fetchWithAuth(url, { method: 'GET' });

  if (!res.ok) {
    // If auth is missing/expired or network fails, fall back to last cached config.
    try {
      const cached = window.localStorage.getItem(ASSESSMENT_MASTER_CFG_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }

    const message = await buildFriendlyError(res, 'Active learning mapping fetch failed');
    throw new Error(message);
  }
  const data = await res.json();
  return data?.mapping || {};
}

export async function saveGlobalAnalysisMapping(mapping: Record<string, boolean[]>) {
  const url = `${API_BASE}/api/obe/active-learning-mapping`;
  const res = await fetchWithAuth(url, { method: 'PUT', body: JSON.stringify({ mapping }) });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'Active learning mapping save failed');
    throw new Error(message);
  }

  const data = await res.json();
  return data?.mapping || {};
}

export async function fetchAssessmentMasterConfig() {
  const url = `${API_BASE}/api/obe/assessment-master-config`;
  const res = await fetchWithAuth(url, { method: 'GET' });

  if (!res.ok) {
    // If auth is missing/expired or network fails, fall back to last cached config.
    try {
      const cached = window.localStorage.getItem(ASSESSMENT_MASTER_CFG_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }

    const message = await buildFriendlyError(res, 'Assessment master config fetch failed');
    throw new Error(message);
  }

  const data = await res.json();
  const cfg = data?.config || {};
  try {
    window.localStorage.setItem(ASSESSMENT_MASTER_CFG_CACHE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
  return cfg;
}

export async function saveAssessmentMasterConfig(config: any) {
  const url = `${API_BASE}/api/obe/assessment-master-config`;
  const res = await fetchWithAuth(url, { method: 'PUT', body: JSON.stringify({ config }) });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'Assessment master config save failed');
    throw new Error(message);
  }

  const data = await res.json();
  const cfg = data?.config || {};
  try {
    window.localStorage.setItem(ASSESSMENT_MASTER_CFG_CACHE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
  return cfg;
}

export async function uploadArticulationMatrixExcel(file: File) {
  const url = `${API_BASE}/api/obe/upload-articulation-matrix`;
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetchWithAuth(url, { method: 'POST', body: formData });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'Articulation Matrix parse failed');
    throw new Error(message);
  }
  return res.json();
}

export function subscribeToGlobalAnalysisMapping(onChange: () => void, intervalMs = 30000) {
  const id = window.setInterval(() => onChange(), intervalMs);
  return () => window.clearInterval(id);
}

// Legacy aliases used by older pages
export async function getCdapRevision(subjectId: string) {
  return fetchCdapRevision(subjectId);
}
