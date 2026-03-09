import { fetchWithAuth } from './fetchAuth';

export type RFReaderGate = {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
};

export type RFReaderStudent = {
  id: number;
  roll_no: string;
  name: string;
  impres_code?: string;
  rf_uid?: string | null;
  is_active: boolean;
};

export type RFReaderLastScan = {
  scanned_at: string | null;
  uid: string | null;
  roll_no: string | null;
  name: string | null;
  impres_code: string | null;
  gate: { id: number; name: string } | null;
};

export async function rfreaderCreateGate(payload: { name: string; description?: string }): Promise<RFReaderGate> {
  const res = await fetchWithAuth('/api/academics/rfreader/gates/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create gate (HTTP ${res.status})`);
  return (await res.json()) as RFReaderGate;
}

export async function rfreaderCreateStudent(payload: {
  roll_no: string;
  name: string;
  impres_code?: string;
  rf_uid?: string | null;
}): Promise<RFReaderStudent> {
  const res = await fetchWithAuth('/api/academics/rfreader/students/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create student (HTTP ${res.status})`);
  return (await res.json()) as RFReaderStudent;
}

export async function rfreaderFetchLastScan(): Promise<RFReaderLastScan> {
  const res = await fetchWithAuth('/api/academics/rfreader/last-scan/', { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to fetch last scan (HTTP ${res.status})`);
  return (await res.json()) as RFReaderLastScan;
}
