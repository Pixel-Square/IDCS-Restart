import fetchWithAuth from './fetchAuth';

export interface UserQuery {
  id: number;
  serial_number: number;
  dept_serial_number?: number;
  user: number;
  username: string;
  user_roles: string[];
  user_department: { id: number; code: string; name: string; short_name: string } | null;
  mobile_number?: string | null;
  mobile_verified?: boolean;
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

export async function fetchAllQueries(): Promise<{ queries: UserQuery[] }> {
  const res = await fetchWithAuth('/api/accounts/queries/all/');
  if (!res.ok) {
    throw new Error('Failed to fetch all queries');
  }
  return await res.json();
}

export async function updateQuery(id: number, data: { status: string; admin_notes?: string }): Promise<UserQuery> {
  const res = await fetchWithAuth(`/api/accounts/queries/${id}/update/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('Failed to update query');
  }
  return await res.json();
}
