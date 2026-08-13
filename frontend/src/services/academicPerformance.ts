import fetchWithAuth from './fetchAuth';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

export interface PerformanceMetrics {
  total_students: number;
  total_exams_taken: number;
  overall_pass_pct: number;
  overall_marks_pct: number;
}

export interface UserContext {
  role: 'PRINCIPAL' | 'HOD' | 'FACULTY' | 'STUDENT';
  department: string;
  lock_department: boolean;
}

export interface DeptComparisonRow {
  dept_code: string;
  dept_name: string;
  pass_rate_pct: number;
  avg_marks_pct: number;
  total_records: number;
}

export interface SubjectPerformanceRow {
  course_code: string;
  course_name: string;
  pass_rate_pct: number;
  avg_marks_pct: number;
  total_students: number;
}

export interface PassFailTrendRow {
  name: string;
  pass: number;
  fail: number;
  total: number;
  pass_rate_pct: number;
}

export interface WeakStudentRow {
  student_id: string;
  reg_no: string;
  name: string;
  dept: string;
  section: string;
  sem: string;
  photo: string;
  total_exams: number;
  passed_exams: number;
  failed_exams: number;
  avg_score_pct: number;
  status: string;
}

export interface PerformanceAnalyticsResponse {
  metrics: PerformanceMetrics;
  user_context: UserContext;
  dept_comparison: DeptComparisonRow[];
  subject_performance: SubjectPerformanceRow[];
  pass_fail_trends: PassFailTrendRow[];
  weak_students: WeakStudentRow[];
  total_weak_students: number;
}

export interface StudentProgressReportResponse {
  student_info: {
    student_id: string;
    reg_no: string;
    name: string;
    dept: string;
    section: string;
    sem: string;
    photo: string;
    overall_score_pct: number;
    pass_rate_pct: number;
    total_exams: number;
    passed_exams: number;
    status: string;
  };
  subject_results: Array<{
    course_code: string;
    course_name: string;
    exam_name: string;
    total_mark: number;
    max_mark: number;
    is_pass: boolean;
    faculty: string;
  }>;
  growth_graph: Array<{
    semester: string;
    score_pct: number;
  }>;
}

export async function fetchPerformanceAnalytics(filters: {
  year?: string;
  sem?: string;
  dept?: string;
  section?: string;
  qp_type?: string;
}): Promise<PerformanceAnalyticsResponse> {
  const queryParams = new URLSearchParams();
  if (filters.year) queryParams.set('year', filters.year);
  if (filters.sem) queryParams.set('sem', filters.sem);
  if (filters.dept) queryParams.set('dept', filters.dept);
  if (filters.section) queryParams.set('section', filters.section);
  if (filters.qp_type) queryParams.set('qp_type', filters.qp_type);

  const url = `${API_BASE}/api/academic-v2/performance/analytics/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch performance analytics');
  }
  return response.json();
}

export async function fetchStudentProgressReport(studentId: string): Promise<StudentProgressReportResponse> {
  const url = `${API_BASE}/api/academic-v2/performance/student/${encodeURIComponent(studentId)}/`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch student progress report');
  }
  return response.json();
}
