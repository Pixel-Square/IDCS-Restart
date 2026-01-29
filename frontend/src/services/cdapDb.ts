const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function buildFriendlyError(res: Response, fallback: string) {
  if (res.status === 401) return `${fallback}: Authentication required. Please login.`;
  if (res.status === 403) return `${fallback}: Staff role required.`;
  if (res.status === 404) {
    return `${fallback}: No CDAP found for this course yet. Upload the Excel to create one.`;
  }

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'CDAP revision fetch failed');
    throw new Error(message);
  }
  return res.json();
}

export async function saveCdapRevision(payload: any) {
  const subjectId = payload?.subjectId || payload?.subject_id;
  if (!subjectId) throw new Error('subjectId is required to save CDAP revision');
  const url = `${API_BASE}/api/obe/cdap-revision/${encodeURIComponent(subjectId)}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'CDAP revision save failed');
    throw new Error(message);
  }
  return res.json();
}

export async function fetchGlobalAnalysisMapping() {
  const url = `${API_BASE}/api/obe/active-learning-mapping`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const message = await buildFriendlyError(res, 'Active learning mapping fetch failed');
    throw new Error(message);
  }
  const data = await res.json();
  return data?.mapping || {};
}

export function subscribeToGlobalAnalysisMapping(onChange: () => void, intervalMs = 30000) {
  const id = window.setInterval(() => onChange(), intervalMs);
  return () => window.clearInterval(id);
}

// Legacy aliases used by older pages
export async function getCdapRevision(subjectId: string) {
  return fetchCdapRevision(subjectId);
}
