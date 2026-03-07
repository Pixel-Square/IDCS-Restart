// Type definitions for Staff Requests module

export interface FormField {
  name: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'time' | 'email';
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  min?: string | number;
  max?: string | number;
}

export interface ApprovalStep {
  id?: number;
  step_order: number;
  approver_role: string;
  created_at?: string;
  updated_at?: string;
}

export interface RequestTemplate {
  id?: number;
  name: string;
  description: string;
  is_active: boolean;
  form_schema: FormField[];
  allowed_roles: string[];
  approval_steps?: ApprovalStep[];
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
