import fetchWithAuth from './fetchAuth';

export interface UserQuery {
  id: number;
  user: number;
  username: string;
  query_text: string;
  status: 'SENT' | 'VIEWED' | 'REVIEWED' | 'PENDING' | 'IN_PROGRESS' | 'FIXED' | 'LATER' | 'CLOSED';
  created_at: string;
  updated_at: string;
  admin_notes: string;
}

export interface UserQueryListItem {
  id: number;
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
export async function fetchAllQueries(statusFilter?: string): Promise<UserQuery[]> {
  let url = '/api/accounts/queries/all/';
  if (statusFilter) {
    url += `?status=${statusFilter}`;
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
