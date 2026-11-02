export type PBASViewer = 'faculty' | 'student'
export type PBASAudience = 'faculty' | 'student' | 'both'
export type PBASInputMode = 'upload' | 'link'

export type PBASFormFieldType = 'short_text' | 'long_text' | 'dropdown' | 'checkboxes' | 'file_upload'

export type PBASFormField = {
  id: string
  label: string
  field_type: PBASFormFieldType
  required?: boolean
  options?: string[]
  placeholder?: string
}

export type PBASCustomDepartment = {
  id: string
  title: string
  accesses: string[]
  department_id?: number
  department_code?: string
  department_short_name?: string
  department_name?: string
  show_in_submission?: boolean
  created_at?: string
}

export type PBASNode = {
  id: string
  label: string
  audience: PBASAudience
  input_mode?: PBASInputMode
  form_schema?: PBASFormField[]
  pbas_credit?: number | null
  mentor_credit?: number | null
  link?: string | null
  uploaded_name?: string | null
  limit?: number | null
  college_required?: boolean
  position?: number
  approvers?: { id: number; username: string; name: string }[]
  children?: PBASNode[]
}

export type PBASDuration = {
  id: string
  title: string
  start_date: string
  end_date: string
  created_at?: string
}

export type PBASApprovalItem = {
  id: string
  node_id: string
  node_ancestor_ids: string[]
  applicant_type: 'student' | 'staff'
  category: string
  department_code?: string | null
  department_name?: string | null
  user: {
    id: number
    name: string
    reg_or_staff_id: string
    username: string
    profile_image?: string | null
  }
  leaf_title: string
  parent_path: string
  submission_type: 'form' | 'upload' | 'link'
  form_data?: Record<string, any>
  form_schema?: PBASFormField[]
  link?: string | null
  file_url?: string | null
  file_name?: string | null
  pbas_credit: number
  status: 'pending' | 'approved' | 'rejected'
  current_step?: string
  approval_history?: Array<{
    step: string
    action: string
    by_name: string
    timestamp: string
    remarks?: string
  }>
  created_at?: string | null
  reviewed_at?: string | null
  approved_by_name?: string | null
  rejection_reason?: string
}

export type PBASSubmission = {
  id: string
  node: string
  leaf_title: string
  parent_path: string
  pbas_credit: number
  student_credit: number
  mentor_credit: number
  submission_type: 'form' | 'upload' | 'link'
  form_data: Record<string, any>
  form_schema: PBASFormField[]
  link?: string | null
  file?: string | null
  file_name?: string | null
  status: 'pending' | 'approved' | 'rejected'
  current_step: string
  approval_history: any[]
  approved_by_name?: string | null
  reviewed_at?: string | null
  rejection_reason?: string
  created_at: string
}

export type AuthUser = {
  id: number
  email: string
  username: string
  first_name: string
  last_name: string
  full_name: string
  roles: Array<{ id: number; name: string; description: string }>
  role_names: string[]
  profile_type: 'faculty' | 'student'
  staff_profile?: {
    staff_id: string
    designation: string
    department?: { id: number; code: string; name: string }
    pbas_credit: number
    pbas_academics_credit: number
    pbas_student_development_credit: number
    pbas_research_development_credit: number
    pbas_institutional_contribution_credit: number
  }
  student_profile?: {
    reg_no: string
    home_department?: { id: number; code: string; name: string }
    batch: string
    pbas_credit: number
  }
  is_superuser: boolean
  is_staff: boolean
}

export type DemoAccount = {
  role: string
  badge: string
  email: string
  password: string
  name: string
  department: string
  staff_id?: string
  reg_no?: string
  description: string
}
