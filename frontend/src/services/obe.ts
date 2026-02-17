export type TeachingAssignmentItem = {
  id: number;
  subject_id?: number;
  subject_code: string;
  subject_name: string;
  class_type?: string | null;
  curriculum_row_id?: number | null;
  elective_subject_id?: number | null;
  elective_subject_name?: string | null;
  section_id?: number | null;
  section_name?: string | null;
  academic_year?: string;
  semester?: number | null;
  batch?: any;
};

// Safe fetch for teaching assignments: use axios apiClient so automatic refresh runs
import { apiClient } from './auth';
import axios from 'axios';

export async function fetchMyTeachingAssignments(): Promise<TeachingAssignmentItem[]> {
  const url = `${apiBase()}/api/academics/my-teaching-assignments/`;
  try {
    const res = await apiClient.get(url);
    return res.data as TeachingAssignmentItem[];
  } catch (e: any) {
    if (e?.response?.status === 401) return [];
    throw e;
  }
}


export type Cia1MarksResponse = {
  subject: { code: string; name: string };
  students: Array<{ id: number; reg_no: string; name: string; section?: string | null }>;
  marks: Record<string, string | null>;
};

type DraftResponse<T> = {
  subject: { code: string; name: string };
  draft: T | null;
  updated_at?: string | null;
  updated_by?: { id?: number | null; username?: string | null; name?: string | null } | null;
};

export type DraftAssessmentKey = 'ssa1' | 'review1' | 'ssa2' | 'review2' | 'cia1' | 'cia2' | 'formative1' | 'formative2' | 'model';

export type DueAssessmentKey = DraftAssessmentKey;

function apiBase() {
  return import.meta.env.VITE_API_BASE || 'https://db.zynix.us';
}

function authHeader(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function iqacResetAssessment(assessment: DraftAssessmentKey, subjectId: string, teachingAssignmentId: number): Promise<any> {
  const url = `${apiBase()}/api/obe/iqac/reset/${encodeURIComponent(String(assessment))}/${encodeURIComponent(String(subjectId))}`;
  const res = await apiClient.post(url, { teaching_assignment_id: teachingAssignmentId });
  return res.data;
}

export type ResetNotification = {
  id: number;
  teaching_assignment_id: number;
  subject_code: string;
  subject_name: string;
  section_name: string;
  assessment: string;
  reset_at: string | null;
  reset_by: string | null;
};

export async function fetchResetNotifications(teachingAssignmentId?: number): Promise<ResetNotification[]> {
  const url = `${apiBase()}/api/obe/iqac/reset-notifications`;
  const params = teachingAssignmentId ? { teaching_assignment_id: teachingAssignmentId } : {};
  const res = await apiClient.get(url, { params });
  return res.data?.notifications || [];
}

export async function dismissResetNotifications(notificationIds: number[]): Promise<any> {
  const url = `${apiBase()}/api/obe/iqac/reset-notifications/dismiss`;
  const res = await apiClient.post(url, { notification_ids: notificationIds });
  return res.data;
}


async function tryRefreshAccess(): Promise<string | null> {
  try {
    const base = import.meta.env.VITE_API_BASE || 'https://db.zynix.us';
    const refresh = localStorage.getItem('refresh');
    if (!refresh) return null;
    const res = await axios.post(`${base}/api/accounts/token/refresh/`, { refresh });
    const { access, refresh: newRefresh } = res.data || {};
    if (access) localStorage.setItem('access', access);
    if (newRefresh) localStorage.setItem('refresh', newRefresh);
    return access || null;
  } catch (e) {
    try {
      const auth = await import('./auth');
      auth.logout();
    } catch (er) {
      // ignore
    }
    return null;
  }
}

async function fetchWithAuth(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const headers = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> || {}), ...authHeader() };
  const opts: RequestInit = { ...(init || {}), headers };

  let res = await fetch(input, opts);
  if (res.status !== 401) return res;

  // try refresh once
  const newAccess = await tryRefreshAccess();
  if (!newAccess) return res;

  const retryHeaders = { ...(opts.headers as Record<string, string>), Authorization: `Bearer ${newAccess}` };
  const retryOpts: RequestInit = { ...opts, headers: retryHeaders };
  res = await fetch(input, retryOpts);
  return res;
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
  semester?: { id: number; number: number | null } | null;
  teaching_assignment_id: number | null;
};

export type EditScope = 'MARK_ENTRY' | 'MARK_MANAGER';

export type EditWindowResponse = {
  assessment: DueAssessmentKey;
  subject_code: string;
  scope: EditScope;
  allowed_by_approval: boolean;
  approval_until: string | null;
  now: string | null;
  academic_year: { id: number; name: string } | null;
  semester?: { id: number; number: number | null } | null;
  teaching_assignment_id: number | null;
};

export type MarkTableLockStatusResponse = {
  assessment: DueAssessmentKey;
  subject_code: string;
  teaching_assignment_id: number | null;
  academic_year: { id: number; name: string } | null;
  section_name: string | null;
  exists: boolean;
  is_published: boolean;
  published_blocked: boolean;
  mark_entry_blocked: boolean;
  mark_manager_locked: boolean;
  mark_entry_unblocked_until: string | null;
  mark_manager_unlocked_until: string | null;
  entry_open: boolean;
  mark_manager_editable: boolean;
  updated_at?: string | null;
};

export async function fetchMarkTableLockStatus(
  assessment: DueAssessmentKey,
  subjectId: string,
  teachingAssignmentId?: number,
): Promise<MarkTableLockStatusResponse> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/mark-table-lock/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) {
    return {
      assessment,
      subject_code: String(subjectId),
      teaching_assignment_id: typeof teachingAssignmentId === 'number' ? teachingAssignmentId : null,
      academic_year: null,
      section_name: null,
      exists: false,
      is_published: false,
      published_blocked: false,
      mark_entry_blocked: false,
      mark_manager_locked: false,
      mark_entry_unblocked_until: null,
      mark_manager_unlocked_until: null,
      entry_open: false,
      mark_manager_editable: true,
      updated_at: null,
    };
  }
  if (!res.ok) await parseError(res, 'Mark table lock fetch failed');
  return res.json();
}

export async function fetchTeachingAssignmentEnabledAssessments(teachingAssignmentId: number): Promise<string[]> {
  const info = await fetchTeachingAssignmentEnabledAssessmentsInfo(teachingAssignmentId);
  return Array.isArray(info?.enabled_assessments)
    ? info.enabled_assessments.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean)
    : [];
}

export type EnabledAssessmentsMeta = {
  mode?: 'TEACHING_ASSIGNMENT' | 'SPECIAL_GLOBAL' | string;
  selection_id?: number | null;
  locked?: boolean;
  can_edit?: boolean;
  edit_request?: {
    id: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
    can_edit_until?: string | null;
    used_at?: string | null;
  } | null;
};

export type EnabledAssessmentsInfoResponse = {
  enabled_assessments: string[];
  meta?: EnabledAssessmentsMeta;
};

export async function fetchTeachingAssignmentEnabledAssessmentsInfo(teachingAssignmentId: number): Promise<EnabledAssessmentsInfoResponse> {
  const url = `${apiBase()}/api/academics/teaching-assignments/${encodeURIComponent(String(teachingAssignmentId))}/enabled_assessments/`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401 || res.status === 404) return { enabled_assessments: [], meta: { locked: false, can_edit: false } };
  if (!res.ok) await parseError(res, 'Failed to fetch enabled assessments');
  const data = await res.json();
  return {
    enabled_assessments: Array.isArray(data?.enabled_assessments) ? data.enabled_assessments.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean) : [],
    meta: data?.meta || undefined,
  };
}

export async function setTeachingAssignmentEnabledAssessments(teachingAssignmentId: number, assessments: string[]): Promise<string[]> {
  const url = `${apiBase()}/api/academics/teaching-assignments/${encodeURIComponent(String(teachingAssignmentId))}/enabled_assessments/`;
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify({ enabled_assessments: assessments }) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Failed to save enabled assessments');
  const data = await res.json();
  return Array.isArray(data?.enabled_assessments) ? data.enabled_assessments : [];
}

export async function setTeachingAssignmentEnabledAssessmentsInfo(teachingAssignmentId: number, assessments: string[]): Promise<EnabledAssessmentsInfoResponse> {
  const url = `${apiBase()}/api/academics/teaching-assignments/${encodeURIComponent(String(teachingAssignmentId))}/enabled_assessments/`;
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify({ enabled_assessments: assessments }) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Failed to save enabled assessments');
  const data = await res.json();
  return {
    enabled_assessments: Array.isArray(data?.enabled_assessments) ? data.enabled_assessments : [],
    meta: data?.meta || undefined,
  };
}

export async function requestTeachingAssignmentEnabledAssessmentsEdit(teachingAssignmentId: number): Promise<any> {
  const url = `${apiBase()}/api/academics/teaching-assignments/${encodeURIComponent(String(teachingAssignmentId))}/enabled_assessments/request-edit/`;
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify({}) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Failed to request edit approval');
  return res.json();
}

export async function fetchSpecialCourseEnabledAssessments(courseCode: string, academicYearId?: number): Promise<string[]> {
  const qp = academicYearId ? `?academic_year_id=${encodeURIComponent(String(academicYearId))}` : '';
  const url = `${apiBase()}/api/academics/special-courses/${encodeURIComponent(String(courseCode))}/enabled_assessments/${qp}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Failed to fetch enabled assessments');
  const data = await res.json();
  const arr = Array.isArray(data?.enabled_assessments) ? data.enabled_assessments : [];
  return arr.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean);
}

export async function confirmMarkManagerLock(
  assessment: DueAssessmentKey,
  subjectId: string,
  teachingAssignmentId?: number,
): Promise<{ status: string } & Partial<MarkTableLockStatusResponse>> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/mark-table-lock/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}/confirm-mark-manager${qp}`;
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify({}) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Mark Manager confirm failed');
  return res.json();
}

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

export async function fetchEditWindow(
  assessment: DueAssessmentKey,
  subjectId: string,
  scope: EditScope,
  teachingAssignmentId?: number,
): Promise<EditWindowResponse> {
  const qpParts: string[] = [`scope=${encodeURIComponent(String(scope))}`];
  if (teachingAssignmentId) qpParts.push(`teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}`);
  const qp = qpParts.length ? `?${qpParts.join('&')}` : '';
  const url = `${apiBase()}/api/obe/edit-window/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (res.status === 401) {
    return {
      assessment,
      subject_code: String(subjectId),
      scope,
      allowed_by_approval: false,
      approval_until: null,
      now: null,
      academic_year: null,
      teaching_assignment_id: typeof teachingAssignmentId === 'number' ? teachingAssignmentId : null,
    };
  }
  if (!res.ok) await parseError(res, 'Edit window fetch failed');
  return res.json();
}

export async function fetchGlobalPublishControls(semesterIds: number[], assessments: string[]): Promise<{ results: Array<{ id: number; semester: { id: number; number: number | null } | null; assessment: string; is_open: boolean; updated_at: string | null; updated_by: number | null }> }> {
  const qpParts: string[] = [];
  if (semesterIds?.length) qpParts.push(`semester_ids=${encodeURIComponent(semesterIds.join(','))}`);
  if (assessments?.length) qpParts.push(`assessments=${encodeURIComponent(assessments.join(','))}`);
  const qp = qpParts.length ? `?${qpParts.join('&')}` : '';
  const url = `${apiBase()}/api/obe/global-publish-controls${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Global publish controls fetch failed');
  return res.json();
}

export async function bulkSetGlobalPublishControls(payload: { semester_ids: number[]; assessments: string[]; is_open: boolean }): Promise<{ status: string; updated: number }> {
  const url = `${apiBase()}/api/obe/global-publish-controls/bulk-set`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Bulk set global publish controls failed');
  return res.json();
}

export async function bulkResetGlobalPublishControls(payload: { semester_ids: number[]; assessments: string[] }): Promise<{ status: string; deleted: number }> {
  const url = `${apiBase()}/api/obe/global-publish-controls/bulk-reset`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Bulk reset global publish controls failed');
  return res.json();
}

export type ObeSemesterRow = { id: number; number: number };

export async function fetchObeSemesters(): Promise<{ results: ObeSemesterRow[] }> {
  const url = `${apiBase()}/api/obe/semesters`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Semesters fetch failed');
  return res.json();
}

export type DueScheduleRow = {
  id: number;
  semester: { id: number; number: number | null } | null;
  subject_code: string;
  subject_name: string;
  assessment: DueAssessmentKey;
  due_at: string;
  is_active: boolean;
  updated_at: string | null;
};

export async function fetchDueSchedules(semesterIds: number[]): Promise<{ results: DueScheduleRow[] }> {
  const qp = semesterIds?.length ? `?semester_ids=${encodeURIComponent(semesterIds.join(','))}` : '';
  const url = `${apiBase()}/api/obe/due-schedules${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Due schedules fetch failed');
  return res.json();
}

export async function fetchDueScheduleSubjects(semesterIds: number[]): Promise<{ subjects_by_semester: Record<string, Array<{ subject_code: string; subject_name: string }>> }> {
  const qp = `?semester_ids=${encodeURIComponent(semesterIds.join(','))}`;
  const url = `${apiBase()}/api/obe/due-schedule-subjects${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Due schedule subjects fetch failed');
  return res.json();
}

export async function upsertDueSchedule(payload: { semester_id: number; subject_code: string; subject_name?: string; assessment: DueAssessmentKey; due_at: string }): Promise<any> {
  const url = `${apiBase()}/api/obe/due-schedule-upsert`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Due schedule save failed');
  return res.json();
}

export async function bulkUpsertDueSchedule(payload: { semester_id: number; subject_codes: string[]; assessments: DueAssessmentKey[]; due_at: string }): Promise<{ status: string; updated: number }> {
  const url = `${apiBase()}/api/obe/due-schedule-bulk-upsert`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Due schedule bulk save failed');
  return res.json();
}

export type QpPatternExam = 'CIA' | 'CIA1' | 'CIA2' | 'MODEL';

export type QpPatternConfig = {
  marks: number[];
  cos?: Array<number | string>;
};

export type QpPatternResponse = {
  class_type: string;
  question_paper_type: string | null;
  exam: QpPatternExam;
  pattern: QpPatternConfig;
  updated_at: string | null;
  updated_by: number | null;
};

function normalizeQpPattern(raw: any): QpPatternConfig {
  // Legacy: pattern is an array of marks.
  if (Array.isArray(raw)) {
    const marks = raw
      .map((x: any) => Number(x))
      .filter((n: any) => Number.isFinite(n));
    return { marks };
  }

  // New: pattern is an object.
  if (raw && typeof raw === 'object') {
    const marksRaw = Array.isArray((raw as any).marks) ? (raw as any).marks : [];
    const marks = marksRaw
      .map((x: any) => Number(x))
      .filter((n: any) => Number.isFinite(n));

    const cosRaw = Array.isArray((raw as any).cos) ? (raw as any).cos : undefined;
    const cos = cosRaw
      ? cosRaw.map((v: any) => {
          if (typeof v === 'string') return v;
          const n = Number(v);
          return Number.isFinite(n) ? n : '';
        })
      : undefined;

    const out: QpPatternConfig = { marks };
    if (cos) out.cos = cos.filter((v: any) => v !== '');
    return out;
  }

  return { marks: [] };
}

export async function fetchIqacQpPattern(params: { class_type: string; question_paper_type?: string | null; exam: QpPatternExam }): Promise<QpPatternResponse> {
  const qpParts: string[] = [];
  qpParts.push(`class_type=${encodeURIComponent(String(params.class_type || '').trim())}`);
  if (params.question_paper_type) qpParts.push(`question_paper_type=${encodeURIComponent(String(params.question_paper_type || '').trim())}`);
  qpParts.push(`exam=${encodeURIComponent(String(params.exam || '').trim())}`);
  const qp = qpParts.length ? `?${qpParts.join('&')}` : '';
  const url = `${apiBase()}/api/obe/iqac/qp-pattern${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'QP pattern fetch failed');
  const data = await res.json();
  const pattern = normalizeQpPattern(data?.pattern);
  return {
    class_type: String(data?.class_type || ''),
    question_paper_type: data?.question_paper_type == null ? null : String(data.question_paper_type),
    exam: (() => {
      const e = String(data?.exam || 'CIA').trim().toUpperCase();
      if (e === 'MODEL') return 'MODEL';
      if (e === 'CIA1') return 'CIA1';
      if (e === 'CIA2') return 'CIA2';
      return 'CIA';
    })(),
    pattern,
    updated_at: data?.updated_at ?? null,
    updated_by: typeof data?.updated_by === 'number' ? data.updated_by : null,
  };
}

export async function upsertIqacQpPattern(payload: { class_type: string; question_paper_type?: string | null; exam: QpPatternExam; pattern: QpPatternConfig }): Promise<QpPatternResponse> {
  const url = `${apiBase()}/api/obe/iqac/qp-pattern/save`;
  const body = {
    class_type: String(payload.class_type || '').trim(),
    question_paper_type: payload.question_paper_type ? String(payload.question_paper_type || '').trim() : null,
    exam: payload.exam,
    pattern: {
      marks: Array.isArray(payload.pattern?.marks) ? payload.pattern.marks : [],
      cos: Array.isArray(payload.pattern?.cos) ? payload.pattern.cos : undefined,
    },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify(body) });
  if (!res.ok) await parseError(res, 'QP pattern save failed');
  const data = await res.json();
  const pattern = normalizeQpPattern(data?.pattern);
  return {
    class_type: String(data?.class_type || ''),
    question_paper_type: data?.question_paper_type == null ? null : String(data.question_paper_type),
    exam: (() => {
      const e = String(data?.exam || 'CIA').trim().toUpperCase();
      if (e === 'MODEL') return 'MODEL';
      if (e === 'CIA1') return 'CIA1';
      if (e === 'CIA2') return 'CIA2';
      return 'CIA';
    })(),
    pattern,
    updated_at: data?.updated_at ?? null,
    updated_by: typeof data?.updated_by === 'number' ? data.updated_by : null,
  };
}

export async function deleteDueSchedule(payload: { semester_id: number; subject_code: string; assessment: DueAssessmentKey }): Promise<{ status: string; deleted: number }> {
  const url = `${apiBase()}/api/obe/due-schedule-delete`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, 'Due schedule delete failed');
  return res.json();
}

export async function createPublishRequest(payload: { assessment: DueAssessmentKey; subject_code: string; reason?: string; teaching_assignment_id?: number; force?: boolean }): Promise<any> {
  const url = `${apiBase()}/api/obe/publish-request`;
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify(payload) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Publish request failed');
  return res.json();
}

export async function createEditRequest(payload: {
  assessment: DueAssessmentKey;
  subject_code: string;
  scope: EditScope;
  reason?: string;
  teaching_assignment_id?: number;
}): Promise<any> {
  const url = `${apiBase()}/api/obe/edit-request`;
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify(payload) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Edit request failed');
  return res.json();
}

export type MyLatestEditRequestItem = {
  id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  assessment: DueAssessmentKey;
  scope: EditScope;
  subject_code: string;
  reason: string | null;
  requested_at: string | null;
  updated_at: string | null;
  reviewed_at: string | null;
  approved_until: string | null;
  is_active: boolean;
  reviewed_by: { id: number | null; username: string | null; name: string | null } | null;
};

export async function fetchMyLatestEditRequest(payload: {
  assessment: DueAssessmentKey;
  subject_code: string;
  scope: EditScope;
  teaching_assignment_id?: number;
}): Promise<{ result: MyLatestEditRequestItem | null }> {
  const qpParts: string[] = [];
  qpParts.push(`assessment=${encodeURIComponent(String(payload.assessment))}`);
  qpParts.push(`subject_code=${encodeURIComponent(String(payload.subject_code))}`);
  qpParts.push(`scope=${encodeURIComponent(String(payload.scope))}`);
  if (typeof payload.teaching_assignment_id === 'number') qpParts.push(`teaching_assignment_id=${encodeURIComponent(String(payload.teaching_assignment_id))}`);
  const qp = qpParts.length ? `?${qpParts.join('&')}` : '';
  const url = `${apiBase()}/api/obe/edit-requests/my-latest${qp}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) return { result: null };
  if (!res.ok) await parseError(res, 'My edit request status fetch failed');
  return res.json();
}

export type PendingEditRequestItem = {
  id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  assessment: DueAssessmentKey;
  scope: EditScope;
  subject_code: string;
  subject_name: string | null;
  reason: string | null;
  requested_at: string | null;
  academic_year: { id: number; name: string } | null;
  staff: { id: number; username: string; name: string | null; department?: string | null };
};

export type EditRequestHistoryItem = PendingEditRequestItem & {
  status: 'APPROVED' | 'REJECTED';
  reviewed_by: { id: number; username: string; name: string | null } | null;
  reviewed_at: string | null;
  approved_until: string | null;
};

export async function fetchPendingEditRequests(scope?: EditScope): Promise<{ results: PendingEditRequestItem[] }> {
  const qp = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  const url = `${apiBase()}/api/obe/edit-requests/pending${qp}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) return { results: [] };
  if (!res.ok) await parseError(res, 'Pending edit requests fetch failed');
  return res.json();
}

export async function fetchEditRequestsHistory(payload?: { statuses?: Array<'APPROVED' | 'REJECTED'>; limit?: number; scope?: EditScope }): Promise<{ results: EditRequestHistoryItem[] }> {
  const statuses = payload?.statuses?.length ? payload.statuses.join(',') : '';
  const limit = typeof payload?.limit === 'number' ? payload.limit : 200;
  const qpParts: string[] = [];
  if (statuses) qpParts.push(`statuses=${encodeURIComponent(statuses)}`);
  if (Number.isFinite(limit)) qpParts.push(`limit=${encodeURIComponent(String(limit))}`);
  if (payload?.scope) qpParts.push(`scope=${encodeURIComponent(payload.scope)}`);
  const qp = qpParts.length ? `?${qpParts.join('&')}` : '';
  const url = `${apiBase()}/api/obe/edit-requests/history${qp}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) return { results: [] };
  if (!res.ok) await parseError(res, 'Edit requests history fetch failed');
  return res.json();
}

export type ClassTypeWeightsItem = {
  ssa1: number;
  cia1: number;
  formative1: number;
  internal_mark_weights?: number[] | null;
};

export async function fetchClassTypeWeights(): Promise<Record<string, ClassTypeWeightsItem>> {
  const url = `${apiBase()}/api/obe/iqac/class-type-weights`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) throw new Error('Authentication required to fetch class-type weights');
  if (!res.ok) await parseError(res, 'Fetch class-type weights failed');
  const data = await res.json();
  return data?.results || {};
}

export async function fetchInternalMarkMapping(subjectId: string): Promise<{ subject: { code: string; name: string }; mapping: any | null; updated_at?: string | null; updated_by?: number | null }> {
  const url = `${apiBase()}/api/obe/iqac/internal-mark-mapping/${encodeURIComponent(subjectId)}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Failed to fetch internal mark mapping');
  return res.json();
}

export async function upsertInternalMarkMapping(subjectId: string, mapping: Record<string, any>): Promise<any> {
  const url = `${apiBase()}/api/obe/iqac/internal-mark-mapping/${encodeURIComponent(subjectId)}/save`;
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify({ mapping }) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Failed to save internal mark mapping');
  return res.json();
}

export async function upsertClassTypeWeights(payload: Record<string, any>): Promise<Record<string, ClassTypeWeightsItem>> {
  const url = `${apiBase()}/api/obe/iqac/class-type-weights/save`;
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify(payload) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Save class-type weights failed');
  const data = await res.json();
  return data?.results || {};
}

export async function fetchPendingEditRequestCount(scope?: EditScope): Promise<{ pending: number }> {
  const qp = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  const url = `${apiBase()}/api/obe/edit-requests/pending-count${qp}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) return { pending: 0 };
  if (!res.ok) await parseError(res, 'Pending edit requests count fetch failed');
  return res.json();
}

export async function approveEditRequest(reqId: number, windowMinutes = 120): Promise<any> {
  const url = `${apiBase()}/api/obe/edit-requests/${encodeURIComponent(String(reqId))}/approve`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ window_minutes: windowMinutes }),
  });
  if (!res.ok) await parseError(res, 'Approve edit request failed');
  return res.json();
}

export async function rejectEditRequest(reqId: number): Promise<any> {
  const url = `${apiBase()}/api/obe/edit-requests/${encodeURIComponent(String(reqId))}/reject`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Reject edit request failed');
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
  staff: { id: number; username: string; name: string | null; department?: string | null };
};

export type PublishRequestHistoryItem = PendingPublishRequestItem & {
  status: 'APPROVED' | 'REJECTED';
  reviewed_by: { id: number; username: string; name: string | null } | null;
  reviewed_at: string | null;
  approved_until: string | null;
};

export async function fetchPendingPublishRequests(): Promise<{ results: PendingPublishRequestItem[] }> {
  const url = `${apiBase()}/api/obe/publish-requests/pending`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) return { results: [] };
  if (!res.ok) await parseError(res, 'Pending requests fetch failed');
  return res.json();
}

export async function fetchPublishRequestsHistory(payload?: { statuses?: Array<'APPROVED' | 'REJECTED'>; limit?: number }): Promise<{ results: PublishRequestHistoryItem[] }> {
  const statuses = payload?.statuses?.length ? payload.statuses.join(',') : '';
  const limit = typeof payload?.limit === 'number' ? payload.limit : 200;
  const qpParts: string[] = [];
  if (statuses) qpParts.push(`statuses=${encodeURIComponent(statuses)}`);
  if (Number.isFinite(limit)) qpParts.push(`limit=${encodeURIComponent(String(limit))}`);
  const qp = qpParts.length ? `?${qpParts.join('&')}` : '';
  const url = `${apiBase()}/api/obe/publish-requests/history${qp}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) return { results: [] };
  if (!res.ok) await parseError(res, 'History requests fetch failed');
  return res.json();
}

export async function fetchPendingPublishRequestCount(): Promise<{ pending: number }> {
  const url = `${apiBase()}/api/obe/publish-requests/pending-count`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) return { pending: 0 };
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
    const trimmed = String(text ?? '').replace(/^\uFEFF/, '').trim();
    const j = JSON.parse(trimmed);
    const detail = j?.detail || fallback;
    const how = Array.isArray(j?.how_to_fix) ? `\nHow to fix:\n- ${j.how_to_fix.join('\n- ')}` : '';
    const errors = Array.isArray(j?.errors) ? `\nErrors:\n- ${j.errors.join('\n- ')}` : '';

    const err: any = new Error(`${detail}${how}${errors}`);
    err.status = res.status;
    err.body = j;
    throw err;
  } catch {
    const err: any = new Error(`${fallback}: ${res.status} ${text}`);
    err.status = res.status;
    err.bodyText = text;
    throw err;
  }
}

export async function fetchDraft<T>(assessment: DraftAssessmentKey, subjectId: string, teachingAssignmentId?: number): Promise<DraftResponse<T>> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/draft/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (res.status === 401) {
    return { subject: { code: String(subjectId), name: '' }, draft: null, updated_at: null, updated_by: null } as DraftResponse<T>;
  }
  if (!res.ok) await parseError(res, 'Draft fetch failed');
  return res.json();
}

export async function saveDraft<T>(assessment: DraftAssessmentKey, subjectId: string, data: T): Promise<{ status: string }> {
  const url = `${apiBase()}/api/obe/draft/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}`;
  const res = await fetchWithAuth(url, { method: 'PUT', body: JSON.stringify({ data }) });
  if (res.status === 401) throw new Error('Authentication required');
  if (!res.ok) await parseError(res, 'Draft save failed');
  return res.json();
}

export type PublishedSsa1Response = {
  subject: { code: string; name: string };
  marks: Record<string, string | null>;
};

export async function fetchPublishedSsa1(subjectId: string, teachingAssignmentId?: number): Promise<PublishedSsa1Response> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/ssa1-published/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'SSA1 published fetch failed');
  return res.json();
}

export async function publishSsa1(subjectId: string, data: any, teachingAssignmentId?: number): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/ssa1-publish/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'SSA1 publish failed');
  return res.json();
}

export type PublishedReview1Response = PublishedSsa1Response;

export async function fetchPublishedReview1(subjectId: string): Promise<PublishedReview1Response> {
  const url = `${apiBase()}/api/obe/review1-published/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Review 1 published fetch failed');
  return res.json();
}

export async function publishReview1(subjectId: string, data: any, teachingAssignmentId?: number): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/review1-publish/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'Review 1 publish failed');
  return res.json();
}

export type PublishedSsa2Response = {
  subject: { code: string; name: string };
  marks: Record<string, string | null>;
};

export async function fetchPublishedSsa2(subjectId: string, teachingAssignmentId?: number): Promise<PublishedSsa2Response> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/ssa2-published/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'SSA2 published fetch failed');
  return res.json();
}

export async function publishSsa2(subjectId: string, data: any, teachingAssignmentId?: number): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/ssa2-publish/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'SSA2 publish failed');
  return res.json();
}

export async function fetchPublishedReview2(subjectId: string): Promise<PublishedSsa2Response> {
  const url = `${apiBase()}/api/obe/review2-published/${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Review 2 published fetch failed');
  return res.json();
}

export async function publishReview2(subjectId: string, data: any, teachingAssignmentId?: number): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/review2-publish/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'Review 2 publish failed');
  return res.json();
}

export type PublishedFormative1Response = {
  subject: { code: string; name: string };
  marks: Record<string, { skill1: string | null; skill2: string | null; att1: string | null; att2: string | null; total: string | null }>;
};

export async function fetchPublishedFormative1(subjectId: string, teachingAssignmentId?: number): Promise<PublishedFormative1Response> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/formative1-published/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Formative1 published fetch failed');
  return res.json();
}

export async function publishFormative1(subjectId: string, data: any, teachingAssignmentId?: number): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/formative1-publish/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) await parseError(res, 'Formative1 publish failed');
  return res.json();
}

export async function fetchPublishedFormative(assessment: 'formative1' | 'formative2', subjectId: string, teachingAssignmentId?: number): Promise<PublishedFormative1Response> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-published/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, `${assessment} published fetch failed`);
  return res.json();
}

export async function publishFormative(assessment: 'formative1' | 'formative2', subjectId: string, data: any, teachingAssignmentId?: number): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-publish/${encodeURIComponent(subjectId)}${qp}`;
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
  assessment: 'cia1' | 'cia2' | 'model' | 'formative1' | 'formative2';
  data: any | null;
};

export async function fetchPublishedLabSheet(
  assessment: 'cia1' | 'cia2' | 'model' | 'formative1' | 'formative2',
  subjectId: string,
  teachingAssignmentId?: number,
): Promise<PublishedLabSheetResponse> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/lab-published-sheet/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'Lab published sheet fetch failed');
  return res.json();
}

export async function publishLabSheet(
  assessment: 'cia1' | 'cia2' | 'model' | 'formative1' | 'formative2',
  subjectId: string,
  data: any,
  teachingAssignmentId?: number,
): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/lab-publish-sheet/${encodeURIComponent(assessment)}/${encodeURIComponent(subjectId)}${qp}`;
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

export async function fetchPublishedCia1Sheet(subjectId: string, teachingAssignmentId?: number): Promise<PublishedCia1SheetResponse> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/cia1-published-sheet/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, 'CIA1 published sheet fetch failed');
  return res.json();
}

export async function publishCia1Sheet(subjectId: string, data: any, teachingAssignmentId?: number): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/cia1-publish-sheet/${encodeURIComponent(subjectId)}${qp}`;
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

export async function fetchPublishedCiaSheet(assessment: 'cia1' | 'cia2', subjectId: string, teachingAssignmentId?: number): Promise<PublishedCiaSheetResponse> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-published-sheet/${encodeURIComponent(subjectId)}${qp}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json', ...authHeader() } });
  if (!res.ok) await parseError(res, `${assessment} published sheet fetch failed`);
  return res.json();
}

export async function publishCiaSheet(assessment: 'cia1' | 'cia2', subjectId: string, data: any, teachingAssignmentId?: number): Promise<{ status: string }> {
  const qp = teachingAssignmentId ? `?teaching_assignment_id=${encodeURIComponent(String(teachingAssignmentId))}` : '';
  const url = `${apiBase()}/api/obe/${encodeURIComponent(assessment)}-publish-sheet/${encodeURIComponent(subjectId)}${qp}`;
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

  const DEFAULT_API_BASE = 'https://db.zynix.us';
  const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000' : DEFAULT_API_BASE);
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

  const DEFAULT_API_BASE = 'https://db.zynix.us';
  const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000' : DEFAULT_API_BASE);
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
