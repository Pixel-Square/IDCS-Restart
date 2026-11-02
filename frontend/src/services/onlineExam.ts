import fetchWithAuth from './fetchAuth';

export interface OnlineExamQuestion {
  id?: number;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer?: string;
  co?: number;
  marks?: number;
}

export interface OnlineExamIncharge {
  id?: number;
  staff_id: string;
  staff_name: string;
  role: string;
  user_id?: number;
  staff?: number;
}

export interface SectionDetail {
  id: number;
  name: string;
  label: string;
  batch_name?: string;
  department_name?: string;
}

export interface OnlineExam {
  id: number;
  title: string;
  exam_date: string;
  start_mode: 'MANUAL' | 'AUTO';
  auto_start_time?: string;
  duration_minutes: number;
  status: 'SCHEDULED' | 'RUNNING' | 'ENDED';
  actual_start_time?: string;
  actual_end_time?: string;
  course_code: string;
  course_name: string;
  sections_details: SectionDetail[];
  incharges: OnlineExamIncharge[];
  questions_count: number;
  elapsed_seconds: number;
  is_today: boolean;
  created_at: string;
  cooldown_seconds?: number;
  max_violations?: number;
  is_retest?: boolean;
  is_results_published?: boolean;
  results_published_at?: string;
  submitted_count?: number;
  total_students_count?: number;
  submission?: {
    submitted: boolean;
    score?: number | null;
    total_questions: number;
    submitted_at?: string;
    is_results_published?: boolean;
    is_kicked?: boolean;
    kicked_reason?: string;
    kicked_at?: string;
    violations_count?: number;
    is_retest_allowed?: boolean;
    status?: string;
  } | null;
}

export interface StudentSubmissionItem {
  student_id: number;
  reg_no: string;
  name: string;
  profile_image?: string | null;
  department: string;
  batch: string;
  section: string;
  section_id?: number;
  score?: number;
  total_questions?: number;
  percentage?: number;
  status: string;
  submitted_at?: string | null;
  started_at?: string | null;
  answered_count: number;
  kicked_reason?: string;
  kicked_at?: string | null;
  violations_count?: number;
  is_retest_allowed?: boolean;
  retest_granted_at?: string | null;
}

export interface LiveSubmissionsResponse {
  exam: OnlineExam;
  sections: Array<{ id: number; name: string; label: string }>;
  submitted_count: number;
  not_submitted_count: number;
  kicked_count: number;
  total_students_count: number;
  submitted: StudentSubmissionItem[];
  not_submitted: StudentSubmissionItem[];
  kicked: StudentSubmissionItem[];
}

export interface StudentAnswerLogQuestion {
  id: number;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  selected_answer: string;
  is_answered: boolean;
  is_correct: boolean;
  co?: number;
  marks?: number;
}

export interface StudentAnswerLogResponse {
  exam: {
    id: number;
    title: string;
    course_code: string;
    course_name: string;
    duration_minutes: number;
  };
  student: {
    id: number;
    reg_no: string;
    name: string;
    profile_image?: string | null;
    department: string;
    batch: string;
    section: string;
  };
  submission: {
    score: number;
    total_questions: number;
    percentage: number;
    status: string;
    submitted_at?: string | null;
    answered_count: number;
  };
  questions: StudentAnswerLogQuestion[];
}

export interface OnlineExamQuestionBank {
  id: number;
  title: string;
  course_code?: string;
  course_name?: string;
  questions_count: number;
  questions_data: any[];
  created_at: string;
}

export interface OnlineExamMetaResponse {
  courses: Array<{ code: string; name: string; display: string }>;
  departments: Array<{ id: number; code: string; name: string; short_name: string; label: string }>;
  batches: Array<{ id: number; name: string; label: string }>;
  sections: Array<{ id: number; name: string; batch_id: number; batch_name: string; department_id: number; department_code: string; label: string }>;
  staff: Array<{ id: number; staff_id: string; name: string; department: string; designation: string; display: string }>;
  question_banks?: OnlineExamQuestionBank[];
}

export interface CreateExamPayload {
  title: string;
  question_bank_title?: string;
  exam_date: string;
  start_mode: 'MANUAL' | 'AUTO';
  auto_start_time?: string;
  duration_minutes: number;
  course_code: string;
  course_name: string;
  section_ids: number[];
  incharges: Array<{ user_id?: number; staff_id: string; staff_name: string; role: string }>;
  cooldown_seconds?: number;
  max_violations?: number;
  questions: Array<{
    question_number: number;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_answer: string;
    co?: number;
    marks?: number;
  }>;
}

export async function fetchOnlineExamMeta(): Promise<OnlineExamMetaResponse> {
  const res = await fetchWithAuth('/api/online-exam/meta/');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch online exam metadata');
  }
  return res.json();
}

export async function fetchOnlineExams(type: 'upcoming' | 'past' | 'all' = 'all'): Promise<OnlineExam[]> {
  const res = await fetchWithAuth(`/api/online-exam/exams/?type=${type}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch online exams');
  }
  return res.json();
}

export async function createOnlineExam(payload: CreateExamPayload): Promise<OnlineExam> {
  const res = await fetchWithAuth('/api/online-exam/exams/create/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to create online exam');
  }
  return res.json();
}

export async function startOnlineExam(examId: number, password: string): Promise<OnlineExam> {
  const res = await fetchWithAuth(`/api/online-exam/exams/${examId}/start/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to start exam');
  }
  return res.json();
}

export async function endOnlineExam(examId: number, password: string): Promise<OnlineExam> {
  const res = await fetchWithAuth(`/api/online-exam/exams/${examId}/end/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to end exam');
  }
  return res.json();
}

export interface StudentExamsResponse {
  has_exams?: boolean;
  student_section?: string;
  active: OnlineExam[];
  past: OnlineExam[];
}

export async function fetchStudentExams(): Promise<StudentExamsResponse> {
  const res = await fetchWithAuth('/api/online-exam/student/exams/');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch student exams');
  }
  return res.json();
}

export async function fetchStudentExamDetail(examId: number): Promise<OnlineExam> {
  const res = await fetchWithAuth(`/api/online-exam/student/exams/${examId}/detail/`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to load exam details');
  }
  return res.json();
}

export interface StudentTakeExamResponse {
  exam_id: number;
  title: string;
  course_code: string;
  course_name: string;
  duration_minutes: number;
  remaining_seconds: number;
  cooldown_seconds?: number;
  max_violations?: number;
  status?: string;
  is_retest?: boolean;
  questions: OnlineExamQuestion[];
  saved_answers: Record<string, string>;
  student?: {
    id: number;
    name: string;
    reg_no: string;
    profile_image?: string | null;
    department?: string;
    section?: string;
  };
}

export async function fetchStudentTakeExam(examId: number): Promise<StudentTakeExamResponse> {
  const res = await fetchWithAuth(`/api/online-exam/student/exams/${examId}/take/`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorObj: any = new Error(err.detail || err.error || 'Failed to load exam questions');
    errorObj.data = err;
    throw errorObj;
  }
  return res.json();
}

export async function submitStudentExam(
  examId: number,
  answers: Record<string, string>,
  statusVal: 'SUBMITTED' | 'KICKED' = 'SUBMITTED',
  kickedReason?: string,
  violationsCount?: number
): Promise<{ success: boolean; score: number; total_questions: number; status?: string }> {
  const res = await fetchWithAuth(`/api/online-exam/student/exams/${examId}/take/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers,
      status: statusVal,
      kicked_reason: kickedReason,
      violations_count: violationsCount
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to submit exam');
  }
  return res.json();
}

export async function kickStudentExam(
  examId: number,
  reason: string,
  answers: Record<string, string>,
  violationsCount: number
): Promise<{ success: boolean; message: string; status: string; kicked_reason: string }> {
  const res = await fetchWithAuth(`/api/online-exam/student/exams/${examId}/kick/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, answers, violations_count: violationsCount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to record security violation kick');
  }
  return res.json();
}

export async function allowStudentRetest(
  examId: number,
  studentId: number
): Promise<{ success: boolean; message: string; is_retest_allowed: boolean }> {
  const res = await fetchWithAuth(`/api/online-exam/exams/${examId}/allow-retest/${studentId}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to allow re-test');
  }
  return res.json();
}

export async function fetchQuestionBanks(): Promise<OnlineExamQuestionBank[]> {
  const res = await fetchWithAuth('/api/online-exam/question-banks/');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to load question banks');
  }
  return res.json();
}

export async function publishExamResults(examId: number): Promise<{ success: boolean; message: string; exam: OnlineExam }> {
  const res = await fetchWithAuth(`/api/online-exam/exams/${examId}/publish-results/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to publish exam results');
  }
  return res.json();
}

export async function fetchLiveSubmissions(examId: number): Promise<LiveSubmissionsResponse> {
  const res = await fetchWithAuth(`/api/online-exam/exams/${examId}/submissions/`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch exam submissions');
  }
  return res.json();
}

export async function fetchStudentAnswerLog(examId: number, studentId: number): Promise<StudentAnswerLogResponse> {
  const res = await fetchWithAuth(`/api/online-exam/exams/${examId}/student-log/${studentId}/`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch student answer log');
  }
  return res.json();
}

export async function saveStudentExamDraft(
  examId: number,
  answers: Record<string, string>
): Promise<{ success: boolean; answered_count: number; exam_status?: string; is_kicked?: boolean; kicked_reason?: string }> {
  const res = await fetchWithAuth(`/api/online-exam/student/exams/${examId}/save-draft/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to save answer draft');
  }
  return res.json();
}


