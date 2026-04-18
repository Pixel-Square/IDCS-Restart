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
  allotment_per_role?: Record<string, number>; // For deduct and neutral: initial balance allocation
  from_date?: string; // Start date for reset period (YYYY-MM-DD) - deprecated for neutral forms
  to_date?: string; // End date for reset period (YYYY-MM-DD) - deprecated for neutral forms
  split_date?: string; // OPTIONAL: Mid-period split date (YYYY-MM-DD) - splits allotment into two equal halves
  overdraft_name?: string; // LOP field name (Loss of Pay)
  lop_non_reset?: boolean; // If true, LOP never resets (recommended)
  reset_period?: 'monthly' | 'half_yearly' | 'yearly'; // Reset frequency for neutral/deduct actions
  reset_duration?: 'yearly' | 'monthly' | 'half_yearly'; // Alternative name for reset_period
  attendance_status?: string;
  // LOP Logic: LOP = Absent days - Approved deduct days for those absent dates
  // Absent 4 days = LOP:4, approve leave for 2 = LOP:2
  // Reset Behavior: COL resets to 0, Deduct/Neutral reset to allotment, LOP resets to 0 (unless lop_non_reset)
  // Split Logic: If split_date set, staff gets half initially (from_date), then second half added on split_date
  // Neutral forms now use allotment deduction (12 → 11 → 10 ... → 0), overflow goes to LOP
  max_uses?: number; // Deprecated: Old neutral usage limit (no longer used)
  usage_reset_duration?: 'yearly' | 'monthly'; // Deprecated: Old neutral reset period
  usage_from_date?: string; // Deprecated: Old neutral custom usage reset start
  usage_to_date?: string; // Deprecated: Old neutral custom usage reset end
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

export interface LateEntryStats {
  month: string;
  ten_mins: number;
  one_hr: number;
  total: number;
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

export interface VacationEntitlementRule {
  id?: number;
  condition?: '>' | '<' | '=' | '>=' | '<=';
  min_years: number;
  min_months: number;
  entitled_days: number;
  is_active?: boolean;
  notes?: string;
}

export interface VacationSemester {
  id?: number;
  name: string;
  from_date: string;
  to_date: string;
  is_active?: boolean;
}

export interface VacationSlot {
  id?: number;
  semester_id?: number | null;
  semester?: string;
  semester_from_date?: string | null;
  semester_to_date?: string | null;
  slot_name: string;
  from_date: string;
  to_date: string;
  total_days?: number;
  is_active?: boolean;
}

export interface VacationConfirmSlot {
  id?: number;
  semester_id?: number | null;
  semester?: string;
  slot_name?: string;
  from_date: string;
  to_date: string;
  total_days?: number;
  department_ids: number[];
  is_active?: boolean;
}

export interface VacationDashboardSlot {
  id: number;
  semester: string;
  slot_name: string;
  from_date: string;
  to_date: string;
  total_days: number;
  existing_request_id?: number | null;
  existing_request_status?: 'pending' | 'approved' | 'rejected' | null;
  can_apply: boolean;
  is_confirmed?: boolean;
  multi_group_key?: number;
  multi_select_allowed?: boolean;
}

export interface VacationDashboardResponse {
  eligible: boolean;
  experience: { years: number; months: number };
  entitlement_days: number;
  used_days: number;
  remaining_days: number;
  vacation_template_id: number | null;
  cancellation_template_id: number | null;
  slots: VacationDashboardSlot[];
}

export interface VacationSettingsResponse {
  rules: VacationEntitlementRule[];
  semesters: VacationSemester[];
  slots: VacationSlot[];
  confirm_slots: VacationConfirmSlot[];
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
