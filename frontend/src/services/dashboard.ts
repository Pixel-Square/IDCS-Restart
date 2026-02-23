export type DashboardResponse = {
  profile_type: string | null;
  roles: string[];
  permissions: string[];
  profile_status: string | null;
  capabilities: Record<string, string[]>;
  flags: Record<string, boolean>;
  entry_points: Record<string, boolean>;
};

import fetchWithAuth from './fetchAuth'

export async function fetchDashboard(baseUrl = ''): Promise<DashboardResponse> {
  const url = baseUrl ? `${baseUrl}/api/accounts/dashboard/` : '/api/accounts/dashboard/'
  const res = await fetchWithAuth(url, { method: 'GET' })

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dashboard fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}
