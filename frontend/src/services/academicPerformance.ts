import fetchWithAuth from './fetchAuth';
import { getApiBase } from './apiBase';
import { DashboardDefinition, DashboardQueryResult } from './academicVisuals';

const API_BASE = getApiBase();

export interface PerformanceMetrics {
  total_students: number;
  total_exams_taken: number;
  overall_pass_pct: number;
  overall_marks_pct: number;
  overall_attendance?: number;
  overall_pass_count?: number;
  overall_fail_count?: number;
}

export interface UserContext {
  user_id: number;
  username: string;
  role: 'PRINCIPAL' | 'HOD' | 'ADVISOR' | 'FACULTY' | 'STUDENT' | 'STAFF';
  roles: string[];
  is_principal: boolean;
  is_hod: boolean;
  is_advisor: boolean;
  is_faculty: boolean;
  is_student: boolean;
  department_id?: string | null;
  department_code: string | null;
  department_name: string | null;
  lock_department: boolean;
  advised_sections?: Array<{ section_id: number | string; section_name: string; semester: string | number; batch?: string }>;
  assigned_subjects?: Array<Record<string, unknown>>;
  handled_subject_ids: number[];
  mentee_student_ids: number[];
  advisor_section_ids: number[];
  assigned_sections: Array<{
    section_id: number;
    section_name: string;
    department_code: string;
    semester: string;
  }>;
}

export interface DeptComparisonRow {
  dept_code: string;
  dept_name: string;
  pass_rate_pct: number;
  avg_marks_pct: number;
  total_records: number;
  total_students?: number;
  attendance_pct?: number;
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
  filter_options?: {
    sections?: string[];
    exam_types?: string[];
    assessments?: string[];
    batches?: string[];
    semesters?: Array<number | string>;
    batch_semesters?: Record<string, Array<number | string>>;
  };
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

export interface FacultyWiseRow {
  id: string;
  staff_id: string;
  name: string;
  designation: string;
  department: string;
  subjects_count: number;
  students_handled: number;
  avg_marks_pct: number | null;
  pass_pct: number | null;
  attendance_pct: number | null;
  total_records: number;
  subjects?: Array<{
    subject_code: string;
    subject_name: string;
    section: string;
    student_count: number;
    avg_score?: number | null;
    above_58_pct?: number | null;
    equal_58_pct?: number | null;
    below_58_pct?: number | null;
    pass_percentage?: number | null;
    attendance?: number | null;
  }>;
}

export interface ClassAdvisorDeepDiveResponse {
  section_info: {
    section_id: string;
    section_name: string;
    department: string;
    department_code: string;
    semester: string;
    total_students: number;
    class_average: number;
    pass_percentage: number;
    attendance_avg: number;
  };
  top_scorers: Array<{
    student_id: string;
    name: string;
    reg_no: string;
    avg_score: number;
    attendance: number;
    performance_level: string;
  }>;
  low_scorers: Array<{
    student_id: string;
    name: string;
    reg_no: string;
    avg_score: number;
    attendance: number;
    performance_level: string;
  }>;
  subject_matrix: Array<{
    subject_code: string;
    subject_name: string;
    avg_marks: number;
    highest_marks: number;
    lowest_marks: number;
    pass_percentage: number;
    attendance_avg: number;
  }>;
}

export interface RangeAnalysisResponse {
  total_students: number;
  range_distribution: Array<{
    label: string;
    min: number;
    max: number;
    student_count: number;
    percentage: number;
  }>;
}

export async function fetchPublishedDashboards(): Promise<{ user_context: UserContext; dashboards: DashboardDefinition[] }> {
  const url = `${API_BASE}/api/academic-v2/performance/dashboards/`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch published dashboards');
  }
  return response.json();
}

export async function fetchPerformanceAnalytics(filters: {
  year?: string;
  sem?: string;
  dept?: string;
  section?: string;
  qp_type?: string;
  subject?: string;
}): Promise<PerformanceAnalyticsResponse> {
  const queryParams = new URLSearchParams();
  if (filters.year) queryParams.set('year', filters.year);
  if (filters.sem) queryParams.set('sem', filters.sem);
  if (filters.dept) queryParams.set('dept', filters.dept);
  if (filters.section) queryParams.set('section', filters.section);
  if (filters.qp_type) queryParams.set('qp_type', filters.qp_type);
  if (filters.subject) queryParams.set('subject', filters.subject);

  const url = `${API_BASE}/api/academic-v2/performance/analytics/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch performance analytics');
  }
  return response.json();
}

export async function fetchStudentProgressReport(studentId: string, examType?: string): Promise<StudentProgressReportResponse> {
  let url = `${API_BASE}/api/academic-v2/performance/student/${encodeURIComponent(studentId)}/`;
  if (examType) {
    url += `?exam_type=${encodeURIComponent(examType)}`;
  }
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch student progress report');
  }
  return response.json();
}

export async function searchStudents(q: string, dept?: string): Promise<Array<{ id: string; reg_no: string; name: string; department: string; section: string; semester: string }>> {
  const queryParams = new URLSearchParams();
  if (q) queryParams.set('q', q);
  if (dept) queryParams.set('dept', dept);

  const url = `${API_BASE}/api/academic-v2/performance/student-search/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) return [];
  const data = await response.json();
  return data.students || [];
}

export async function compareStudents(studentIds: string[], subjectIds: string[]): Promise<any[]> {
  const url = `${API_BASE}/api/academic-v2/performance/student-compare/`;
  const response = await fetchWithAuth(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_ids: studentIds, subject_ids: subjectIds }),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.comparison || [];
}

export async function fetchFacultyWiseAnalytics(dept?: string): Promise<FacultyWiseRow[]> {
  const queryParams = new URLSearchParams();
  if (dept) queryParams.set('dept', dept);

  const url = `${API_BASE}/api/academic-v2/performance/faculty-wise/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) return [];
  const data = await response.json();
  return data.faculties || [];
}

export interface FacultyAnalysisFilters {
  faculty: string;
  dept?: string;
  year?: string;
  sem?: string;
  section?: string;
  exam?: string;
}

export interface FacultyAnalysisResponse {
  faculty: {
    id: string;
    name: string;
    staff_id: string;
    designation: string;
    department: string;
  };
  metrics: {
    subjects: number;
    students: number;
    average_marks_pct: number | null;
    pass_pct: number | null;
    attendance_pct: number | null;
    pass_count: number;
    fail_count: number;
    total_records: number;
  };
  subjects: Array<{
    subject_code: string;
    subject_name: string;
    sections: string[];
    student_count: number | null;
    avg_marks_pct: number | null;
    pass_pct: number | null;
    attendance_pct: number | null;
    total_records: number;
  }>;
  students: Array<{
    student_id: string;
    reg_no: string;
    name: string;
    section: string;
    semester: string;
    batch: string;
    subjects: string[];
    avg_marks_pct: number | null;
    result: 'Pass' | 'Fail' | null;
    total_records: number;
  }>;
  mentees: Array<{
    student_id: string;
    reg_no: string;
    name: string;
    section: string;
    avg_marks_pct: number | null;
    pass_pct: number | null;
    attendance_pct: number | null;
    total_records: number;
  }>;
  charts: {
    subject_avg: Array<{ label: string; value: number | null }>;
    subject_pass: Array<{ label: string; value: number | null }>;
    subject_attendance: Array<{ label: string; value: number | null }>;
    pass_fail: Array<{ label: string; value: number }>;
  };
  assessment: string;
  user_context: Record<string, unknown>;
}

export async function fetchFacultyAnalysis(filters: FacultyAnalysisFilters): Promise<FacultyAnalysisResponse> {
  const queryParams = new URLSearchParams();
  if (filters.faculty) queryParams.set('faculty', filters.faculty);
  if (filters.dept) queryParams.set('dept', filters.dept);
  if (filters.year) queryParams.set('year', filters.year);
  if (filters.sem) queryParams.set('sem', filters.sem);
  if (filters.section) queryParams.set('section', filters.section);
  if (filters.exam) queryParams.set('exam', filters.exam);

  const url = `${API_BASE}/api/academic-v2/performance/faculty-wise/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch faculty analysis');
  }
  return response.json();
}

export async function fetchClassAdvisorDeepDive(sectionId: string): Promise<ClassAdvisorDeepDiveResponse> {
  const url = `${API_BASE}/api/academic-v2/performance/class-advisor/${encodeURIComponent(sectionId)}/`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch class advisor analytics');
  }
  return response.json();
}

export async function fetchRangeAnalysis(ranges?: Array<{ min: number; max: number; label: string }>): Promise<RangeAnalysisResponse> {
  const url = `${API_BASE}/api/academic-v2/performance/range-analysis/`;
  const response = await fetchWithAuth(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ranges }),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch range analysis');
  }
  return response.json();
}


export interface ComparisonAnalyticsParams {
  depts?: string[];
  batches?: string[];
  sems?: string[];
  sections?: string[];
  subjects?: string[];
  subject_codes?: string[];
  qp_types?: string[];
}

export interface ComparisonAnalyticsResponse {
  line_series: Array<{
    name: string;
    data: Array<{ exam: string; score: number }>;
  }>;
  departments_list: Array<{ id: string; code: string; short_name: string; name: string }>;
  batches_list: string[];
  sems_list: string[];
  sections_list: string[];
  subjects_list: Array<{ id: string; code: string; name: string }>;
  user_context: any;
}

export async function fetchComparisonAnalytics(params: ComparisonAnalyticsParams): Promise<ComparisonAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params.depts) query.set('depts', params.depts.join(','));
  if (params.batches) query.set('batches', params.batches.join(','));
  if (params.sems) query.set('sems', params.sems.join(','));
  if (params.sections) query.set('sections', params.sections.join(','));
  if (params.subjects) query.set('subjects', params.subjects.join(','));
  if (params.subject_codes) query.set('subject_codes', params.subject_codes.join(','));
  if (params.qp_types) query.set('qp_types', params.qp_types.join(','));

  const response = await fetch(`/api/academic-v2/performance/comparison-analytics/?${query.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch comparison analytics data');
  }
  return response.json();
}

export interface StudentCurriculumMarksResponse {
  subjects: Array<{ id: string; code: string; name: string }>;
  students: Array<{
    student_id: string;
    reg_no: string;
    name: string;
    department: string;
    section: string;
    semester?: string;
    academic_year?: string;
    marks: Record<string, number>;
    attendance: number;
  }>;
  exam_type: string;
}

export async function fetchStudentCurriculumMarks(filters: {
  year?: string;
  sem?: string;
  dept?: string;
  section?: string;
  exam?: string;
  subject?: string;
  q?: string;
}): Promise<StudentCurriculumMarksResponse> {
  const queryParams = new URLSearchParams();
  if (filters.year) queryParams.set('year', filters.year);
  if (filters.sem) queryParams.set('sem', filters.sem);
  if (filters.dept) queryParams.set('dept', filters.dept);
  if (filters.section) queryParams.set('section', filters.section);
  if (filters.exam) queryParams.set('exam', filters.exam);
  if (filters.subject) queryParams.set('subject', filters.subject);
  if (filters.q) queryParams.set('q', filters.q);

  const url = `${API_BASE}/api/academic-v2/performance/student-curriculum-marks/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch student curriculum marks');
  }
  return response.json();
}

export interface StudentAnalysisChartsResponse {
  student_name: string;
  reg_no: string;
  department?: string;
  section?: string;
  semester?: string;
  academic_year?: string;
  avg_pct?: number;
  pass_pct?: number;
  marks_data: Array<{ subject_code: string; subject_name: string; score: number; result?: string }>;
  attendance_series: Array<{ week: string; attendance: number }>;
}

export async function fetchStudentAnalysisCharts(studentId: string, exam: string, subject?: string): Promise<StudentAnalysisChartsResponse> {
  const queryParams = new URLSearchParams();
  if (exam) queryParams.set('exam', exam);
  if (subject) queryParams.set('subject', subject);

  const url = `${API_BASE}/api/academic-v2/performance/student-analysis-charts/${encodeURIComponent(studentId)}/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch student analysis charts');
  }
  return response.json();
}

export interface DepartmentSectionAnalysisRow {
  section: string;
  students: number;
  avg_marks: number | null;
  pass_pct: number;
  attendance: number | null;
}

export interface DepartmentSubjectAnalysisRow {
  subject_code: string;
  subject_name: string;
  students: number;
  avg_marks: number;
  pass_pct: number;
  pass_count: number;
  fail_count: number;
}

export interface DepartmentAnalysisResponse {
  department: string;
  department_id: number | null;
  filters: { year: string; sem: string; exam: string; section: string };
  metrics: {
    total_students: number;
    pass_count: number;
    fail_count: number;
    pass_pct: number;
    avg_marks: number;
    attendance: number | null;
  };
  section_wise: DepartmentSectionAnalysisRow[];
  subject_wise: DepartmentSubjectAnalysisRow[];
  distribution: Record<string, number>;
  students: Array<{
    student_id: string;
    reg_no: string;
    name: string;
    section: string;
    avg_marks: number | null;
    result: string;
  }>;
}

export async function fetchDepartmentAnalysis(filters: {
  dept: string;
  year?: string;
  sem?: string;
  exam?: string;
  section?: string;
}): Promise<DepartmentAnalysisResponse> {
  const queryParams = new URLSearchParams();
  if (filters.dept) queryParams.set('dept', filters.dept);
  if (filters.year) queryParams.set('year', filters.year);
  if (filters.sem) queryParams.set('sem', filters.sem);
  if (filters.exam) queryParams.set('exam', filters.exam);
  if (filters.section) queryParams.set('section', filters.section);

  const url = `${API_BASE}/api/academic-v2/performance/department-analysis/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch department analysis');
  }
  return response.json();
}

// ── Subject-wise Analysis (Phase 1) ──────────────────────────────────────────
// College → Department → Faculty → Subject. Subject identity comes from real
// TeachingAssignment links (elective > curriculum row > Subject); marks are
// normalized per-assessment against the observed maximum in scope.

export interface SubjectAnalysisFacultyRow {
  id: string;
  name: string;
  staff_id: string;
  designation: string;
  sections: string[];
}

export interface SubjectAnalysisSectionRow {
  section: string;
  students: number;
  avg_marks_pct: number | null;
  pass_pct: number | null;
  attendance_pct: number | null;
  total_records: number;
}

export interface SubjectAnalysisStudentRow {
  student_id: string;
  reg_no: string;
  name: string;
  section: string;
  semester: string;
  assessment: string;
  marks_pct: number | null;
  result: 'Pass' | 'Fail' | null;
  total_records: number;
  attendance_pct: number | null;
}

export interface SubjectAnalysisAssessmentRow {
  assessment: string;
  students: number;
  avg_marks_pct: number | null;
  pass_pct: number | null;
  total_records: number;
}

export interface SubjectAnalysisResponse {
  subject: {
    id: number | null;
    code: string;
    name: string;
    department: string;
    academic_year: string;
    semester: string;
  };
  faculty: SubjectAnalysisFacultyRow[];
  metrics: {
    students: number;
    average_marks_pct: number | null;
    pass_pct: number | null;
    attendance_pct: number | null;
    pass_count: number;
    fail_count: number;
    total_records: number;
  };
  sections: SubjectAnalysisSectionRow[];
  students: SubjectAnalysisStudentRow[];
  assessments: SubjectAnalysisAssessmentRow[];
  charts: {
    marks_distribution: Array<{ label: string; students: number }>;
    section_avg: Array<{ label: string; value: number | null }>;
    section_pass: Array<{ label: string; value: number | null }>;
    assessment_comparison: Array<{ label: string; value: number | null }>;
    pass_fail: Array<{ label: string; value: number }>;
  };
  assessment: string;
  user_context: Record<string, unknown>;
}

export interface SubjectOptionRow {
  subject_code: string;
  subject_name: string;
  faculties: Array<{ id: string; name: string; staff_id: string }>;
  sections: string[];
  sections_count: number;
  faculty_count: number;
  ta_count: number;
}

export async function fetchSubjectAnalysis(filters: {
  subject: string;
  dept?: string;
  faculty?: string;
  year?: string;
  sem?: string;
  section?: string;
  exam?: string;
}): Promise<SubjectAnalysisResponse> {
  const queryParams = new URLSearchParams();
  queryParams.set('subject', filters.subject);
  if (filters.dept) queryParams.set('dept', filters.dept);
  if (filters.faculty) queryParams.set('faculty', filters.faculty);
  if (filters.year) queryParams.set('year', filters.year);
  if (filters.sem) queryParams.set('sem', filters.sem);
  if (filters.section) queryParams.set('section', filters.section);
  if (filters.exam) queryParams.set('exam', filters.exam);

  const url = `${API_BASE}/api/academic-v2/performance/subject-wise/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch subject analysis');
  }
  return response.json();
}

export async function fetchSubjectOptions(filters: {
  dept?: string;
  faculty?: string;
  year?: string;
  sem?: string;
  section?: string;
}): Promise<SubjectOptionRow[]> {
  const queryParams = new URLSearchParams();
  if (filters.dept) queryParams.set('dept', filters.dept);
  if (filters.faculty) queryParams.set('faculty', filters.faculty);
  if (filters.year) queryParams.set('year', filters.year);
  if (filters.sem) queryParams.set('sem', filters.sem);
  if (filters.section) queryParams.set('section', filters.section);

  const url = `${API_BASE}/api/academic-v2/performance/subject-wise/?${queryParams.toString()}`;
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    throw new Error('Failed to fetch subject options');
  }
  const res = await response.json();
  return res.subjects || [];
}


