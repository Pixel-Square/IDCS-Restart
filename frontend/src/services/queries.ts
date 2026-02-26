import fetchWithAuth from './fetchAuth';

export interface UserQuery {
  id: number;
  serial_number: number;
  user: number;
  username: string;
  user_roles: string[];
  user_department: { id: number; code: string; name: string; short_name: string } | null;
  query_text: string;
  status: 'SENT' | 'VIEWED' | 'REVIEWED' | 'PENDING' | 'IN_PROGRESS' | 'FIXED' | 'LATER' | 'CLOSED';
  created_at: string;
  updated_at: string;
  admin_notes: string;
}

export interface UserQueryListItem {
  id: number;
  serial_number: number;
  username: string;
  query_preview: string;
  status: string;
  admin_notes: string;
  created_at: string;
  updated_at: string;
}

export async function fetchMyQueries(): Promise<UserQueryListItem[]> {
  const res = await fetchWithAuth('/api/accounts/queries/');
  if (!res.ok) {
    throw new Error('Failed to fetch queries');
  }
  return await res.json();
}

export async function fetchQueryDetail(id: number): Promise<UserQuery> {
  const res = await fetchWithAuth(`/api/accounts/queries/${id}/`);
  if (!res.ok) {
    throw new Error('Failed to fetch query detail');
  }
  return await res.json();
}

export async function createQuery(query_text: string): Promise<UserQuery> {
  const res = await fetchWithAuth('/api/accounts/queries/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query_text }),
  });
  if (!res.ok) {
    throw new Error('Failed to create query');
  }
  return await res.json();
}

// Receiver/Admin functions
export interface AllQueriesResponse {
  queries: UserQuery[];
  departments: Array<{ id: number; code: string; name: string; short_name: string }>;
  roles: Array<{ id: number; name: string }>;
  total_count: number;
  filtered_count: number;
}

export async function fetchAllQueries(
  statusFilter?: string,
  departmentFilter?: string,
  roleFilter?: string
): Promise<AllQueriesResponse> {
  const params = new URLSearchParams();
  if (statusFilter) params.append('status', statusFilter);
  if (departmentFilter) params.append('department', departmentFilter);
  if (roleFilter) params.append('role', roleFilter);
  
  let url = '/api/accounts/queries/all/';
  if (params.toString()) {
    url += `?${params.toString()}`;
  }
  
  const res = await fetchWithAuth(url);
  if (!res.ok) {
    throw new Error('Failed to fetch all queries');
  }
  return await res.json();
}

export async function updateQuery(
  id: number,
  updates: { status?: string; admin_notes?: string }
): Promise<UserQuery> {
  const res = await fetchWithAuth(`/api/accounts/queries/${id}/update/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error('Failed to update query');
  }
  return await res.json();
}
