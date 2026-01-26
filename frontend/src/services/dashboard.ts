export type DashboardResponse = {
  profile_type: string | null;
  roles: string[];
  permissions: string[];
  profile_status: string | null;
  capabilities: Record<string, string[]>;
  flags: Record<string, boolean>;
  entry_points: Record<string, boolean>;
};

export async function fetchDashboard(baseUrl = ''): Promise<DashboardResponse> {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
  const url = baseUrl ? `${baseUrl}/api/accounts/dashboard/` : `${API_BASE}/api/accounts/dashboard/`
  const token = window.localStorage.getItem('access');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // Do not include credentials (cookies) for JWT Bearer requests.
    // Including credentials triggers CORS preflight restrictions when
    // the backend responds with Access-Control-Allow-Origin='*'.
    // Leave credentials off because we send the JWT in the Authorization header.
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dashboard fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}
