import fetchWithAuth from './fetchAuth';

export interface StaffRequest {
  id: number;
  request_type_name: string;
  applicant_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  form_data: Record<string, any>;
  created_at: string;
}

export async function submitResetRequest(facultyCode: string, facultyName: string): Promise<any> {
  // We'll use the queries system as a "Token/Request" bus for now, 
  // or a dedicated requests endpoint if available.
  // The user asked for it to go to "COE request page".
  // Let's use /api/accounts/queries/ with a special prefix or dedicated type.
  const query_text = `[ESV_RESET_REQUEST] Faculty: ${facultyName} (${facultyCode}) requests complete reset of ESV allocations.`;
  
  const res = await fetchWithAuth('/api/accounts/queries/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query_text }),
  });
  
  if (!res.ok) {
    throw new Error('Failed to submit reset request');
  }
  return await res.json();
}
