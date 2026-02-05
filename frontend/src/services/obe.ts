export type TeachingAssignmentItem = {
  id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  section_id: number;
  section_name: string;
  academic_year: string;
};

export async function fetchMyTeachingAssignments(): Promise<TeachingAssignmentItem[]> {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
  const url = `${API_BASE}/api/academics/my-teaching-assignments/`;
  const token = window.localStorage.getItem('access');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Teaching assignments fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}


export type Cia1MarksResponse = {
  subject: { code: string; name: string };
  students: Array<{ id: number; reg_no: string; name: string; section?: string | null }>;
  marks: Record<string, string | null>;
};

type DraftResponse<T> = {
  subject: { code: string; name: string };
  draft: T | null;
};

export type DraftAssessmentKey = 'ssa1' | 'ssa2' | 'cia1' | 'cia2' | 'formative1' | 'formative2';

export type DueAssessmentKey = DraftAssessmentKey;

function apiBase() {
  return import.meta.env.VITE_API_BASE || 'http://localhost:8000';
}

function authHeader(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type PublishWindowResponse = {
  assessment: DueAssessmentKey;
  subject_code: string;
  publish_allowed: boolean;
  allowed_by_due: boolean;
  allowed_by_approval: boolean;
  global_override_active?: boolean;
  global_is_open?: boolean | null;
  allowed_by_global?: boolean | null;
  due_at: string | null;
  now: string | null;
  remaining_seconds: number | null;
  approval_until: string | null;
  academic_year: { id: number; name: string } | null;
  teaching_assignment_id: number | null;
};

export async function fetchPublishWindow(assessment: DueAssessmentKey, subjectId: string, teachingAssignmentId?: number): Promise<PublishWindowResponse> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/publish-window/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  // If token expires while the user is on the page, SimpleJWT will respond with 401.
  // Avoid spamming the UI with a large error blob; treat as publish not allowed.
  if (res.status === 401) {
    return {
      assessment,
      subject_code: String(subjectId),
      publish_allowed: false,
      allowed_by_due: false,
      allowed_by_approval: false,
      global_override_active: false,
      global_is_open: null,
      allowed_by_global: null,
      due_at: null,
      now: null,
      remaining_seconds: null,
      approval_until: null,
      academic_year: null,
      teaching_assignment_id: typeof teachingAssignmentId === 'number' ? teachingAssignmentId : null,
    };
  }
  if (!res.ok) await parseError(res, 'Publish window fetch failed');
  return res.json();
}

export async function fetchGlobalPublishControls(academicYearIds: number[], assessments: string[]): Promise<{ results: Array<{ id: number; academic_year: { id: number; name: string } | null; assessment: string; is_open: boolean; updated_at: string | null; updated_by: number | null }> }> {
  const qpParts: string[] = [];
  if (academicYearIds?.length) qpParts.push(`academic_year_ids=${encodeURIComponent(academicYearIds.join(','))}`);
  if (assessments?.length) qpParts.push(`assessments=${encodeURIComponent(assessments.join(','))}`);
  const qp = qpParts.length ? `?${qpParts.join('&')}` : '';
  const url = `${apiBase()}/api/obe/global-publish-controls${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Global publish controls fetch failed');
  return res.json();
}

export async function bulkSetGlobalPublishControls(payload: { academic_year_ids: number[]; assessments: string[]; is_open: boolean }): Promise<{ status: string; updated: number }> {
  const url = `${apiBase()}/api/obe/global-publish-controls/bulk-set`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Bulk set global publish controls failed');
  return res.json();
}

export async function bulkResetGlobalPublishControls(payload: { academic_year_ids: number[]; assessments: string[] }): Promise<{ status: string; deleted: number }> {
  const url = `${apiBase()}/api/obe/global-publish-controls/bulk-reset`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Bulk reset global publish controls failed');
  return res.json();
}

export type DueScheduleRow = {
  id: number;
  academic_year: { id: number; name: string };
  subject_code: string;
  subject_name: string;
  assessment: DueAssessmentKey;
  due_at: string;
  is_active: boolean;
  updated_at: string | null;
};

export async function fetchDueSchedules(academicYearIds: number[]): Promise<{ results: DueScheduleRow[] }> {
  const qp = academicYearIds?.length ? `?academic_year_ids=${encodeURIComponent(academicYearIds.join(','))}` : '';
  const url = `${apiBase()}/api/obe/due-schedules${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Due schedules fetch failed');
  return res.json();
}

export async function fetchDueScheduleSubjects(academicYearIds: number[]): Promise<{ subjects_by_academic_year: Record<string, Array<{ subject_code: string; subject_name: string }>> }> {
  const qp = `?academic_year_ids=${encodeURIComponent(academicYearIds.join(','))}`;
  const url = `${apiBase()}/api/obe/due-schedule-subjects${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Due schedule subjects fetch failed');
  return res.json();
}

export async function upsertDueSchedule(payload: { academic_year_id: number; subject_code: string; subject_name?: string; assessment: DueAssessmentKey; due_at: string }): Promise<any> {
  const url = `${apiBase()}/api/obe/due-schedule-upsert`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Due schedule save failed');
  return res.json();
}

export async function bulkUpsertDueSchedule(payload: { academic_year_id: number; subject_codes: string[]; assessments: DueAssessmentKey[]; due_at: string }): Promise<{ status: string; updated: number }> {
  const url = `${apiBase()}/api/obe/due-schedule-bulk-upsert`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Due schedule bulk save failed');
  return res.json();
}

export async function createPublishRequest(payload: { assessment: DueAssessmentKey; subject_code: string; reason?: string; teaching_assignment_id?: number }): Promise<any> {
  const url = `${apiBase()}/api/obe/publish-request`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Publish request failed');
  return res.json();
}

export type PendingPublishRequestItem = {
  id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  assessment: DueAssessmentKey;
  subject_code: string;
  subject_name: string | null;
  reason: string | null;
  requested_at: string | null;
  academic_year: { id: number; name: string } | null;
  staff: { id: number; username: string; name: string | null };
};

export async function fetchPendingPublishRequests(): Promise<{ results: PendingPublishRequestItem[] }> {
  const url = `${apiBase()}/api/obe/publish-requests/pending`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Pending requests fetch failed');
  return res.json();
}

export async function fetchPendingPublishRequestCount(): Promise<{ pending: number }> {
  const url = `${apiBase()}/api/obe/publish-requests/pending-count`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Pending requests count fetch failed');
  return res.json();
}

export async function approvePublishRequest(reqId: number, windowMinutes = 120): Promise<any> {
  const url = `${apiBase()}/api/obe/publish-requests/${encodeURIComponent(String(reqId))}/approve`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ window_minutes: windowMinutes }),
  });
  if (!res.ok) await parseError(res, 'Approve request failed');
  return res.json();
}

export async function rejectPublishRequest(reqId: number): Promise<any> {
  const url = `${apiBase()}/api/obe/publish-requests/${encodeURIComponent(String(reqId))}/reject`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
  });
  if (!res.ok) await parseError(res, 'Reject request failed');
  return res.json();
}

async function parseError(res: Response, fallback: string) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    const detail = j?.detail || fallback;
    const how = Array.isArray(j?.how_to_fix) ? `\nHow to fix:\n- ${j.how_to_fix.join('\n- ')}` : '';
    const errors = Array.isArray(j?.errors) ? `\nErrors:\n- ${j.errors.join('\n- ')}` : '';
    throw new Error(`${detail}${how}${errors}`);
  } catch {
    throw new Error(`${fallback}: ${res.status} ${text}`);
  }
}

export async function fetchDraft<T>(assessment: DraftAssessmentKey, subjectId: string): Promise<DraftResponse<T>> {
  const url = `${apiBase()}/api/obe/draft/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
  });
  if (!res.ok) await parseError(res, 'Draft fetch failed');
  return res.json();
}

export async function saveDraft<T>(assessment: DraftAssessmentKey, subjectId: string, data: T): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/draft/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'Draft save failed');
  return res.json();
}

export type PublishedSsa1Response = {
  subject: { code: string; name: string };
  marks: Record<string, string | null>;
};

export async function fetchPublishedSsa1(subjectId: string): Promise<PublishedSsa1Response> {
  const url = `${apiBase()}/api/obe/ssa1-published/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'SSA1 published fetch failed');
  return res.json();
}

export async function publishSsa1(subjectId: string, data: any): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/ssa1-publish/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'SSA1 publish failed');
  return res.json();
}

export type PublishedSsa2Response = {
  subject: { code: string; name: string };
  marks: Record<string, string | null>;
};

export async function fetchPublishedSsa2(subjectId: string): Promise<PublishedSsa2Response> {
  const url = `${apiBase()}/api/obe/ssa2-published/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'SSA2 published fetch failed');
  return res.json();
}

export async function publishSsa2(subjectId: string, data: any): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/ssa2-publish/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'SSA2 publish failed');
  return res.json();
}

export type PublishedFormative1Response = {
  subject: { code: string; name: string };
  marks: Record<string, { skill1: string | null; skill2: string | null; att1: string | null; att2: string | null; total: string | null }>;
};

export async function fetchPublishedFormative1(subjectId: string): Promise<PublishedFormative1Response> {
  const url = `${apiBase()}/api/obe/formative1-published/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Formative1 published fetch failed');
  return res.json();
}

export async function publishFormative1(subjectId: string, data: any): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/formative1-publish/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'Formative1 publish failed');
  return res.json();
}

export async function fetchPublishedFormative(assessment: 'formative1' | 'formative2', subjectId: string): Promise<PublishedFormative1Response> {
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-published/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, `${assessment} published fetch failed`);
  return res.json();
}

export async function publishFormative(assessment: 'formative1' | 'formative2', subjectId: string, data: any): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-publish/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, `${assessment} publish failed`);
  return res.json();
}

export type PublishedLabSheetResponse = {
  subject: { code: string; name: string };
  assessment: 'formative1' | 'formative2';
  data: any | null;
};

export async function fetchPublishedLabSheet(assessment: 'formative1' | 'formative2', subjectId: string): Promise<PublishedLabSheetResponse> {
  const url = `${apiBase()}/api/obe/lab-published-sheet/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Lab published sheet fetch failed');
  return res.json();
}

export async function publishLabSheet(assessment: 'formative1' | 'formative2', subjectId: string, data: any): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/lab-publish-sheet/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'Lab publish failed');
  return res.json();
}

export type PublishedCia1SheetResponse = {
  subject: { code: string; name: string };
  data: any | null;
};

export async function fetchPublishedCia1Sheet(subjectId: string): Promise<PublishedCia1SheetResponse> {
  const url = `${apiBase()}/api/obe/cia1-published-sheet/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'CIA1 published sheet fetch failed');
  return res.json();
}

export async function publishCia1Sheet(subjectId: string, data: any): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/cia1-publish-sheet/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'CIA1 publish failed');
  return res.json();
}

export type PublishedCiaSheetResponse = {
  subject: { code: string; name: string };
  data: any | null;
};

export async function fetchPublishedCiaSheet(assessment: 'cia1' | 'cia2', subjectId: string): Promise<PublishedCiaSheetResponse> {
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-published-sheet/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, `${assessment} published sheet fetch failed`);
  return res.json();
}

export async function publishCiaSheet(assessment: 'cia1' | 'cia2', subjectId: string, data: any): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-publish-sheet/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, `${assessment} publish failed`);
  return res.json();
}

export async function fetchCiaMarks(assessment: 'cia1' | 'cia2', subjectId: string, teachingAssignmentId?: number): Promise<Cia1MarksResponse> {
  const sanitizeHttpErrorText = (text: string, limit = 1200) => {
    const raw = String(text || '');
    const noScripts = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const stripped = noScripts
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const cleaned = stripped || raw.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= limit) return cleaned;
    return cleaned.slice(0, limit) + '… (truncated)';
  };

  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-marks/${encodeURIComponent(subjectId)}${qp}`;
  const token = window.localStorage.getItem('access');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      const detail = j?.detail || `${assessment.toUpperCase()} roster fetch failed: ${res.status}`;
      const how = Array.isArray(j?.how_to_fix) ? `\nHow to fix:\n- ${j.how_to_fix.join('\n- ')}` : '';
      throw new Error(`${detail}${how}`);
    } catch {
      const cleaned = sanitizeHttpErrorText(text);
      throw new Error(
        `${assessment.toUpperCase()} roster fetch failed: ${res.status}\n${cleaned || 'Server returned a non-JSON error response.'}`,
      );
    }
  }

  return res.json();
}

export async function fetchCia1Marks(subjectId: string, teachingAssignmentId?: number): Promise<Cia1MarksResponse> {
  const sanitizeHttpErrorText = (text: string, limit = 1200) => {
    const raw = String(text || '');
    const noScripts = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const stripped = noScripts
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const cleaned = stripped || raw.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= limit) return cleaned;
    return cleaned.slice(0, limit) + '… (truncated)';
  };

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${API_BASE}/api/obe/cia1-marks/${encodeURIComponent(subjectId)}${qp}`;
  const token = window.localStorage.getItem('access');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      const detail = j?.detail || `CIA1 roster fetch failed: ${res.status}`;
      const how = Array.isArray(j?.how_to_fix) ? `\nHow to fix:\n- ${j.how_to_fix.join('\n- ')}` : '';
      throw new Error(`${detail}${how}`);
    } catch {
      const cleaned = sanitizeHttpErrorText(text);
      throw new Error(
        `CIA1 roster fetch failed: ${res.status}\n${cleaned || 'Server returned a non-JSON error response.'}`,
      );
    }
  }

  return res.json();
}

export async function saveCia1Marks(subjectId: string, marks: Record<number, number | null>): Promise<Cia1MarksResponse> {
  const sanitizeHttpErrorText = (text: string, limit = 1200) => {
    const raw = String(text || '');
    const noScripts = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const stripped = noScripts
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const cleaned = stripped || raw.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= limit) return cleaned;
    return cleaned.slice(0, limit) + '… (truncated)';
  };

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
  const url = `${API_BASE}/api/obe/cia1-marks/${encodeURIComponent(subjectId)}`;
  const token = window.localStorage.getItem('access');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ marks }),
  });

  const dataText = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(dataText);
      const detail = j?.detail || `CIA1 save failed: ${res.status}`;
      const how = Array.isArray(j?.how_to_fix) ? `\nHow to fix:\n- ${j.how_to_fix.join('\n- ')}` : '';
      const errors = Array.isArray(j?.errors) ? `\nErrors:\n- ${j.errors.join('\n- ')}` : '';
      throw new Error(`${detail}${how}${errors}`);
    } catch {
      const cleaned = sanitizeHttpErrorText(dataText);
      throw new Error(`CIA1 save failed: ${res.status}\n${cleaned || 'Server returned a non-JSON error response.'}`);
    }
  }

  return JSON.parse(dataText);
}
