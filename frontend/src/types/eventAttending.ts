// ── Event Attending Types ────────────────────────────────────────────

export interface ApprovedODForm {
  id: number;
  template_name: string;
  form_data: Record<string, any>;
  form_schema: Array<{ name: string; label: string; type: string; [key: string]: any }>;
  has_event_form: boolean;
  created_at: string;
}

export interface TravelExpenseRow {
  date: string;
  bill_no: string;
  mode_of_travel: string;
  from: string;
  to: string;
  amount: number;
}

export interface FoodExpenseRow {
  date: string;
  bill_no: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  amount: number;
}

export interface OtherExpenseRow {
  s_no: number;
  date: string;
  bill_no: string;
  expense_details: string;
  amount: number;
}

export interface EventAttendingFile {
  id: number;
  expense_type: 'travel' | 'food' | 'other' | 'fees';
  expense_index: number;
  file: string;
  file_url: string | null;
  original_filename: string;
  orientation?: 'portrait' | 'landscape';
  uploaded_at: string;
}

export interface WorkflowStep {
  step_order: number;
  approver_role: string;
  is_current: boolean;
  is_completed: boolean;
  status: 'approved' | 'rejected' | null;
  approver: { id: number; name: string; username: string } | null;
  comments: string | null;
  action_date: string | null;
}

export interface ApprovalLogEntry {
  id: number;
  step_order: number;
  action: 'approved' | 'rejected';
  comments: string;
  approver: { id: number; name: string; username: string };
  action_date: string;
}

export interface EventAttendingFormDetail {
  id: number;
  applicant: {
    id: number;
    name: string;
    username: string;
    department?: string;
    staff_id?: string;
  };
  on_duty_request_id?: number | null;
  on_duty_form_data: Record<string, any>;
  on_duty_form_schema?: Array<{ name: string; label: string; type: string; can_change_form_fields?: boolean; conditional_fields?: Record<string, any[]>; [k: string]: any }>;
  on_duty_template_name?: string;
  custom_event_details?: Record<string, any> | null;
  travel_expenses: TravelExpenseRow[];
  food_expenses: FoodExpenseRow[];
  other_expenses: OtherExpenseRow[];
  total_fees_spend: number;
  advance_amount_received: number;
  advance_date: string | null;
  travel_total: number;
  food_total: number;
  other_total: number;
  grand_total: number;
  balance: number;
  status: 'pending' | 'approved' | 'rejected';
  current_step: number | null;
  current_approver_role: string | null;
  files?: EventAttendingFile[];
  workflow_progress?: WorkflowStep[];
  full_workflow?: { step_order: number; approver_role: string; is_active: boolean }[];
  approval_logs?: ApprovalLogEntry[];
  created_at: string;
  updated_at: string;
}

export interface EventAttendingFormListItem {
  id: number;
  applicant: {
    id: number;
    name: string;
    username: string;
    department?: string;
    staff_id?: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  current_step: number;
  travel_total: number;
  food_total: number;
  other_total: number;
  grand_total: number;
  balance: number;
  on_duty_form_data: Record<string, any>;
  custom_event_details?: Record<string, any> | null;
  event_proof?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventWorkflowRule {
  id?: number;
  applicant_role: string;
  step_order: number;
  approver_role: string;
  is_active: boolean;
}

export interface StaffDeclaration {
  id: number;
  user_id: number;
  staff_id_display: string;
  staff_name: string;
  department_name: string;
  designation: string;
  experience_years: number;
  normal_events_budget: number;
  conference_budget: number;
  updated_at: string;
}

export interface MyEventBudget {
  normal_events_budget: number;
  conference_budget: number;
  normal_used: number;
  conference_used: number;
  normal_available: number;
  conference_available: number;
}

// ── IQAC Budget Conditions ────────────────────────────────────────────

export type ExpCondition = '>' | '>=' | '<' | '<=' | '==';
export type EventType = 'normal' | 'conference';

export interface EventBudgetCondition {
  id?: number;
  event_type: EventType;
  designation: string;
  /** Optional lower-bound experience in years (inclusive). E.g. exp_from=5 means exp >= 5 yrs */
  exp_from?: number | null;
  exp_condition: ExpCondition;
  /** Float: upper/exact bound. Integer part = years, one decimal digit = months. E.g. 2.2 = 2 yrs 2 months */
  exp_value: number;
  /** Budget amount in INR */
  amount: number;
  from_date: string;   // ISO date string
  to_date: string;     // ISO date string
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AcademicCalendarInfo {
  from_date: string | null;
  to_date: string | null;
  name: string | null;
  academic_year?: string | null;
}

export interface ConditionExpiryStatus {
  expired: boolean;
  last_to_date: string | null;
  count?: number;
}
