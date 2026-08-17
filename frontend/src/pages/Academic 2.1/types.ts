/**
 * Academic 2.1 - Types
 * Comprehensive type definitions for OBE mark entry system
 */

// ============================================================================
// ENUMS
// ============================================================================

export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'LOCKED' | 'EDIT_REQUESTED' | 'EDITING';

export type EditRequestStatus = 'PENDING' | 'HOD_PENDING' | 'IQAC_PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export type ApprovalStage = 'NONE' | 'HOD_ONLY' | 'HOD_IQAC';

export type QpType = 'CAT1' | 'CAT2' | 'MODEL' | 'ASSIGNMENT' | 'QUIZ' | 'LAB' | 'PROJECT' | 'SEMINAR' | string;

// ============================================================================
// SEMESTER CONFIG
// ============================================================================

export interface SemesterConfig {
  id: string;
  semester: string;
  semester_name?: string;
  due_date: string | null;
  publish_control_enabled: boolean;
  auto_publish_enabled: boolean;
  hod_approval_required: boolean;
  iqac_approval_required: boolean;
  created_at: string;
  updated_at: string;
  // Computed
  is_past_due?: boolean;
}

// ============================================================================
// CLASS TYPE
// ============================================================================

export interface ExamAssignmentDef {
  exam: string;
  exam_display_name: string;
  qp_type: QpType;
  weight: number;
  default_cos: number[];
  customize_questions: boolean;
}

export interface ClassType {
  id: string;
  name: string;
  description: string;
  college: string;
  college_name?: string;
  total_internal_marks: number;
  exam_assignments: ExamAssignmentDef[];
  allow_customize_questions: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// QP PATTERN
// ============================================================================

export interface QpPatternQuestion {
  title: string;
  max_marks: number;
  btl: number;
  co: number;
  enabled: boolean;
}

export interface QpPattern {
  id: string;
  name: string;
  qp_type: QpType;
  class_type: string | null;
  class_type_name?: string;
  batch: string | null;
  batch_name?: string;
  pattern: {
    questions: QpPatternQuestion[];
    total_marks?: number;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// COURSE & SECTION
// ============================================================================

export interface Course {
  id: string;
  subject: string;
  subject_name?: string;
  subject_code?: string;
  semester: string;
  semester_name?: string;
  class_type: string;
  class_type_name?: string;
  class_type_data?: ClassType;
  co_count: number;
  is_lab: boolean;
}

export interface Section {
  id: string;
  course: string;
  course_data?: Course;
  teaching_assignment: string | null;
  faculty_user: string | null;
  faculty_name?: string;
  section_name: string;
  students_ids: string[];
  student_count?: number;
}

// ============================================================================
// EXAM ASSIGNMENT
// ============================================================================

export interface ExamAssignment {
  id: string;
  section: string;
  section_data?: Section;
  exam: string;
  exam_display_name: string;
  qp_type: QpType;
  qp_pattern: string | null;
  qp_pattern_data?: QpPattern;
  weight: number;
  covered_cos: number[];
  max_marks: number;
  status: ExamStatus;
  draft_data: Record<string, unknown>;
  published_data: Record<string, unknown>;
  last_saved_at: string | null;
  last_saved_by: string | null;
  published_at: string | null;
  published_by: string | null;
  edit_window_until: string | null;
  created_at: string;
  updated_at: string;
  // Computed
  is_editable?: boolean;
  is_past_due?: boolean;
  publish_control?: boolean;
}

// ============================================================================
// STUDENT MARK
// ============================================================================

export interface StudentMark {
  id: string;
  exam_assignment: string;
  student: string;
  reg_no: string;
  student_name: string;
  question_marks: Record<string, number>;
  co1_mark: number | null;
  co2_mark: number | null;
  co3_mark: number | null;
  co4_mark: number | null;
  co5_mark: number | null;
  total_mark: number | null;
  is_absent: boolean;
  is_exempted: boolean;
  remarks: string;
  created_at: string;
  updated_at: string;
}

export interface StudentMarkBulkPayload {
  exam_assignment: string;
  marks: {
    student_id: string;
    reg_no: string;
    student_name: string;
    question_marks: Record<string, number>;
    is_absent?: boolean;
    is_exempted?: boolean;
    remarks?: string;
  }[];
}

// ============================================================================
// EDIT REQUEST
// ============================================================================

export interface EditRequest {
  id: string;
  exam_assignment: string;
  exam_assignment_data?: ExamAssignment;
  requested_by: string;
  requested_by_name?: string;
  reason: string;
  status: EditRequestStatus;
  current_stage: ApprovalStage;
  hod_approved_by: string | null;
  hod_approved_at: string | null;
  iqac_approved_by: string | null;
  iqac_approved_at: string | null;
  approved_by: string | null;
  approved_by_name?: string;
  approved_at: string | null;
  approved_until: string | null;
  approval_notes: string;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// INTERNAL MARK
// ============================================================================

export interface WeightedMarkEntry {
  exam: string;
  exam_display_name: string;
  raw_mark: number;
  max_marks: number;
  weight: number;
  weighted_mark: number;
}

export interface InternalMark {
  id: string;
  section: string;
  section_data?: Section;
  student: string;
  reg_no: string;
  student_name: string;
  weighted_marks: Record<string, WeightedMarkEntry>;
  co_totals: Record<string, number>;
  total_internal: number;
  computed_at: string;
}

// ============================================================================
// USER PATTERN OVERRIDE
// ============================================================================

export interface UserPatternOverride {
  id: string;
  course: string;
  course_data?: Course;
  exam_type: string;
  pattern: {
    questions: QpPatternQuestion[];
    total_marks?: number;
  };
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface CourseInternalSummary {
  course: Course;
  class_type: ClassType | null;
  exam_assignments: {
    id: string;
    exam: string;
    exam_display_name: string;
    qp_type: string;
    weight: number;
    covered_cos: number[];
    status: ExamStatus;
    section_id: string;
    section_name: string;
  }[];
  co_coverage: Record<string, { exam: string; weight: number }[]>;
  weight_matrix: Record<string, Record<string, number>>;
  total_internal_marks: number;
}

export interface ResolvedPattern {
  source: 'user_override' | 'batch_override' | 'global' | 'none';
  pattern: {
    questions: QpPatternQuestion[];
    total_marks?: number;
  };
}

// ============================================================================
// TABLE STATE (for ExamTableToolbar)
// ============================================================================

export interface ExamTableState {
  examAssignment: ExamAssignment;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  lastSavedAt: Date | null;
  dueDate: Date | null;
  countdown: {
    days: number;
    hours: number;
    minutes: number;
  } | null;
}

// ============================================================================
// TOOLBAR ACTIONS
// ============================================================================

export interface ToolbarActions {
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onReset: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onImportExcel: (file: File) => Promise<void>;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onRequestEdit: (reason: string) => Promise<void>;
}
