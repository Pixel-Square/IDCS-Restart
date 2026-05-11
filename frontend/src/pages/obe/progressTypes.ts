export type ObeProgressExam = {
  assessment: string;
  rows_filled: number;
  total_students: number;
  percentage: number;
  published: boolean;
};

export type ObeProgressTA = {
  id: number | null;
  subject_code: string | null;
  subject_name: string | null;
  class_type?: string | null;
  enabled_assessments: string[];
  exam_progress: ObeProgressExam[];
};

export type ObeProgressStaff = {
  id: number;
  name: string;
  user_id: number | null;
  teaching_assignments: ObeProgressTA[];
};

export type ObeProgressSection = {
  id: number | null;
  name: string | null;
  batch: { id: number | null; name: string | null };
  course: { id: number | null; name: string | null };
  department: { id: number | null; code: string | null; name: string | null; short_name: string | null };
  semester?: number | null;
  staff: ObeProgressStaff[];
};

export type ObeProgressResponse = {
  role: 'HOD' | 'ADVISOR' | 'FACULTY' | string;
  academic_year: { id: number | null; name: string | null } | null;
  department: { id: number | null; code: string | null; name: string | null; short_name: string | null } | null;
  sections: ObeProgressSection[];
};
