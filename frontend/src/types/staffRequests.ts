// Type definitions for Staff Requests module

export interface FormField {
  name: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'time' | 'email' | 'file';
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  max_size_mb?: number; // For file uploads
  allowed_extensions?: string[]; // For file uploads, e.g., ['.pdf', '.docx', '.jpg']
}

export interface ApprovalStep {
  id?: number;
  step_order: number;
  approver_role: string;
  created_at?: string;
  updated_at?: string;
}

export interface LeavePolicy {
  action?: 'deduct' | 'earn' | 'neutral';
  allotment_per_role?: Record<string, number>;
  reset_duration?: 'yearly' | 'monthly';
  overdraft_name?: string;
  attendance_status?: string;
}

export interface AttendanceAction {
  change_status?: boolean;
  from_status?: string;
  to_status?: string;
  apply_to_dates?: string[];  // Array of field names that contain dates to update
  date_format?: string;  // Format of the date fields (e.g., 'YYYY-MM-DD')
  add_notes?: boolean;
  notes_template?: string;  // Template string with {field_name} placeholders
}

export interface LeaveBalance {
  leave_type: string;
  balance: number;
  updated_at?: string;
}

export interface LeaveBalancesResponse {
  user: {
    id: number;
    username: string;
    full_name: string;
  };
  balances: LeaveBalance[];
}

export interface RequestTemplate {
  id?: number;
  name: string;
  description: string;
  is_active: boolean;
  form_schema: FormField[];
  allowed_roles: string[];
  approval_steps?: ApprovalStep[];
  leave_policy?: LeavePolicy;
  attendance_action?: AttendanceAction;
  total_steps?: number;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  staff_id?: string;
}

export interface ApprovalLog {
  id: number;
  step_order: number;
  action: 'approved' | 'rejected';
  comments: string;
  approver: User;
  approver_role?: string;
  action_date: string;
}

export interface WorkflowStep {
  step_order: number;
  approver_role: string;
  is_current: boolean;
  is_completed: boolean;
  status: 'approved' | 'rejected' | null;
  approver: User | null;
  comments: string | null;
  action_date: string | null;
}

export interface StaffRequest {
  id: number;
  applicant: User;
  template: RequestTemplate;
  template_name?: string;
  form_data: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected';
  current_step: number;
  current_approver_role?: string;
  total_steps?: number;
  completed_steps?: number;
  is_final_step?: boolean;
  workflow_progress?: WorkflowStep[];
  approval_logs: ApprovalLog[];
  created_at: string;
  updated_at: string;
}

export interface StaffRequestCreate {
  template_id: number;
  form_data: Record<string, any>;
}

export interface ProcessApprovalPayload {
  action: 'approve' | 'reject';
  comments?: string;
}

export interface ProcessApprovalResponse {
  message: string;
  request: StaffRequest;
}

// Available approval roles
export const APPROVER_ROLES = [
  'HOD',
  'AHOD',
  'HR',
  'PRINCIPAL',
  'IQAC',
  'HAA',
  'PS'
] as const;

export type ApproverRole = typeof APPROVER_ROLES[number];
