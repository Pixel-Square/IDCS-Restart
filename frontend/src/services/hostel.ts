import fetchWithAuth from './fetchAuth';

const BASE = '/api/hostel';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type Department = { id: number; code: string; name: string; short_name?: string };

export type StudentBrief = {
  id: number;
  reg_no: string;
  roll_number?: string;
  name: string;
  email?: string;
  mobile_number?: string;
  department?: Department | null;
  programme?: string;
  semester?: number | null;
  section?: string;
  batch?: string;
  academic_year?: string;
  student_status?: string;
  gender?: string;
  photograph?: string;
  residence_category?: string;
  uses_college_bus?: boolean;
  facility_status?: string;
  hostel?: {
    allocation_id: number;
    building: string;
    building_code: string;
    floor: number;
    room_number: string;
    bed: string;
    hostel_category?: string;
    start_date: string;
  } | null;
};

export type Facility = {
  id: number;
  student: number;
  academic_year?: number | null;
  residence_category: string;
  uses_college_bus: boolean;
  status: string;
  day_scholar_address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  profile_verified?: boolean;
  submitted_at?: string | null;
  review_remarks?: string;
};

export type Allocation = {
  id: number;
  student: number;
  room: number;
  bed?: number | null;
  status: string;
  start_date: string;
  expected_end_date?: string | null;
  end_date?: string | null;
  building_name?: string;
  building_code?: string;
  floor_number?: number;
  room_number?: string;
  bed_number?: string;
  room_label?: string;
  remarks?: string;
  student_detail?: StudentBrief;
};

export type TransportAssignment = {
  id: number;
  student: number;
  route: number;
  bus?: number | null;
  stop?: number | null;
  route_name?: string;
  route_code?: string;
  bus_number?: string;
  stop_name_display?: string;
  boarding_point?: string;
  fee_amount?: string;
  status: string;
  assigned_at?: string;
  end_date?: string | null;
  remarks?: string;
};

export type FeePayment = {
  id: number;
  student_fee: number;
  amount: string;
  paid_on: string;
  method: string;
  reference_no?: string;
  receipt_number?: string;
  remarks?: string;
};

export type StudentFee = {
  id: number;
  student: number;
  fee_structure: number;
  fee_structure_name: string;
  fee_type: string;
  amount_due: string;
  amount_paid: string;
  balance: string;
  status: string;
  due_date?: string | null;
  remarks?: string;
  payments?: FeePayment[];
  student_detail?: StudentBrief;
};

export type Complaint = {
  id: number;
  ticket_no: string;
  student: number;
  building?: number | null;
  room?: number | null;
  building_name?: string;
  room_number?: string;
  category: string;
  priority: string;
  subject: string;
  description?: string;
  status: string;
  assigned_to?: number | null;
  assigned_to_name?: string;
  resolution_notes?: string;
  created_at: string;
  resolved_at?: string | null;
  student_detail?: StudentBrief;
};

export type MessMenu = {
  id: number;
  date: string;
  meal_type: string;
  items: string;
  building?: number | null;
  building_name?: string;
  is_published: boolean;
};

export type MessRequest = {
  id: number;
  student: number;
  request_type: string;
  description: string;
  status: string;
  remarks?: string;
  created_at?: string;
};

export type LeaveRequest = {
  id: number;
  student: number;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  destination?: string;
  guardian_contact?: string;
  status: string;
  remarks?: string;
  created_at?: string;
};

export type VacatingRequest = {
  id: number;
  student: number;
  allocation?: number | null;
  requested_vacate_date: string;
  reason?: string;
  status: string;
  room_verified?: boolean;
  assets_verified?: boolean;
  dues_cleared?: boolean;
  room_label?: string;
  remarks?: string;
  created_at?: string;
};

export type Notice = {
  id: number;
  title: string;
  body: string;
  notice_type: string;
  audience: string;
  building?: number | null;
  building_name?: string;
  is_emergency: boolean;
  published_at: string;
  expires_at?: string | null;
  is_active: boolean;
  is_live?: boolean;
  is_read?: boolean;
  created_by_name?: string;
};

export type MyFacilityResponse = {
  student: StudentBrief;
  facility: Facility | null;
  access: {
    is_student: boolean;
    has_selection: boolean;
    is_hosteller: boolean;
    is_day_scholar: boolean;
    uses_college_bus: boolean;
    page_access: boolean;
    reason: string;
  };
  selection_window: {
    id: number;
    title?: string;
    opens_at: string;
    closes_at: string;
    is_active: boolean;
    is_open_now?: boolean;
  } | null;
  selection_state: {
    open: boolean;
    reason: string;
    message: string;
    opens_at?: string | null;
    closes_at?: string | null;
  };
  policy: {
    allow_student_self_selection: boolean;
    require_approval_for_selection: boolean;
    allow_student_edit_after_selection: boolean;
    require_approval_for_changes: boolean;
  };
  allocation: Allocation | null;
  transport_assignment: TransportAssignment | null;
  options: {
    residence_categories: Array<{ value: string; label: string }>;
    college_bus: { value: boolean; label: string };
  };
  applied?: boolean;
  requires_approval?: boolean;
  message?: string;
  request?: FacilityChangeRequest | null;
};

export type FacilityChangeRequest = {
  id: number;
  student: number;
  previous_category?: string;
  requested_category: string;
  previous_uses_college_bus?: boolean;
  requested_uses_college_bus?: boolean;
  day_scholar_address?: string;
  reason?: string;
  status: string;
  created_at?: string;
  reviewed_by_name?: string;
  review_remarks?: string;
  student_detail?: StudentBrief;
};

export type Building = {
  id: number;
  code: string;
  name: string;
  building_type: string;
  hostel_category?: string;
  campus_location?: string;
  address?: string;
  planned_floors: number;
  status: string;
  actual_floor_count?: number;
  rooms_count?: number;
  total_room_capacity?: number;
  occupied_beds?: number;
  available_capacity?: number;
  remarks?: string;
};

export type Floor = {
  id: number;
  building: number;
  building_code?: string;
  building_name?: string;
  floor_number: number;
  name?: string;
  status: string;
  is_available_for_allocation: boolean;
  rooms_count?: number;
  total_capacity?: number;
  occupied_count?: number;
  available_capacity?: number;
  remarks?: string;
};

export type Room = {
  id: number;
  building: number;
  floor: number;
  building_code?: string;
  building_name?: string;
  floor_number?: number;
  room_number: string;
  room_type: string;
  room_purpose: string;
  capacity: number;
  occupied_count: number;
  available_capacity?: number;
  status: string;
  facilities?: string[];
  hostel_category?: string;
  building_hostel_category?: string;
  effective_hostel_category?: string;
  bed_count?: number | null;
  remarks?: string;
};

export type TransportRoute = {
  id: number;
  code: string;
  name: string;
  origin?: string;
  destination?: string;
  fee_amount?: string;
  is_active: boolean;
  bus_count?: number;
  assigned_students?: number;
};

export type CollegeBus = {
  id: number;
  bus_number: string;
  route?: number | null;
  route_name?: string;
  capacity: number;
  driver_name?: string;
  driver_contact?: string;
  is_active: boolean;
  assigned_students?: number;
};

export type FeeStructure = {
  id: number;
  name: string;
  fee_type: string;
  amount: string;
  due_date?: string | null;
  building?: number | null;
  route?: number | null;
  room_type?: string;
  is_active: boolean;
  academic_year?: number | null;
};

export type DashboardSummary = {
  students: {
    total: number;
    active: number;
    day_scholars: number;
    hostellers: number;
    college_bus_users: number;
    without_residence_category: number;
    pending_profile_verification: number;
    pending_change_requests: number;
    awaiting_hostel_allocation: number;
    male_students?: number;
    female_students?: number;
    gender_not_set?: number;
    male_hostellers?: number;
    female_hostellers?: number;
  };
  infrastructure: {
    buildings: number;
    hostel_buildings: number;
    floors: number;
    rooms: number;
    hostel_rooms: number;
    configured_hostel_beds: number;
    occupied_beds: number;
    vacant_beds: number;
    boys_hostel_rooms?: number;
    girls_hostel_rooms?: number;
    boys_beds?: number;
    girls_beds?: number;
    boys_occupied_beds?: number;
    girls_occupied_beds?: number;
    boys_vacant_beds?: number;
    girls_vacant_beds?: number;
  };
  by_department: Array<{ home_department__code?: string; home_department__name?: string; total: number }>;
  by_building: Array<{
    building__id: number;
    building__code: string;
    building__name: string;
    building__hostel_category?: string;
    rooms: number;
    capacity: number;
    occupied: number;
  }>;
};

export type Paged<T> = { count: number; page: number; page_size: number; results: T[] };

export type HostelConfig = {
  allow_student_self_selection: boolean;
  require_approval_for_selection: boolean;
  allow_student_edit_after_selection: boolean;
  require_approval_for_changes: boolean;
  release_room_on_category_change: boolean;
  profile_verification_required: boolean;
  notes?: string;
};

export type SelectionWindow = {
  id: number;
  academic_year?: number | null;
  academic_year_name?: string;
  title?: string;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  allow_self_selection: boolean;
  require_approval: boolean;
  is_open_now?: boolean;
  notes?: string;
};

export type Lookup = {
  buildings: Array<{ id: number; code: string; name: string; building_type: string; hostel_category?: string; is_hostel: boolean }>;
  residence_categories: Array<{ value: string; label: string }>;
  hostel_categories: Array<{ value: string; label: string }>;
  genders: Array<{ value: string; label: string }>;
  room_types: Array<{ value: string; label: string }>;
  room_statuses: Array<{ value: string; label: string }>;
  complaint_categories: Array<{ value: string; label: string }>;
  complaint_priorities: Array<{ value: string; label: string }>;
  fee_types: Array<{ value: string; label: string }>;
  academic_years: Array<{ id: number; name: string; is_active: boolean }>;
  selection_state: { open: boolean; message: string };
};

/* ------------------------------------------------------------------ */
/* Request helper                                                     */
/* ------------------------------------------------------------------ */

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetchWithAuth(`${BASE}${path}`, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') {
        message = data.detail;
      } else if (data && typeof data === 'object') {
        const entry = Object.entries(data).find(
          ([key, value]) => key !== 'status_code' && value !== null && value !== undefined && value !== '',
        );
        if (entry) {
          const [key, value] = entry;
          const text = Array.isArray(value) ? value.join(', ') : String(value);
          message = `${key}: ${text}`;
        }
      }
    } catch {
      try {
        const text = await res.text();
        if (text) message = text;
      } catch {
        /* ignore */
      }
    }
    throw new Error(message);
  }
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const patch = (body: unknown): RequestInit => ({
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const put = (body: unknown): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const qs = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

/* ------------------------------------------------------------------ */
/* Student endpoints                                                  */
/* ------------------------------------------------------------------ */

export const getMyFacility = () => req<MyFacilityResponse>('/me/facility/');

export const submitMyFacility = (payload: {
  residence_category: string;
  uses_college_bus: boolean;
  day_scholar_address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  gender?: string;
  reason?: string;
}) => req<MyFacilityResponse>('/me/facility/', json(payload));

export const getMyOverview = () => req<any>('/me/overview/');

export const getMyAllocation = () => req<Paged<Allocation>>('/me/allocation/');

export const getMyFees = () => req<Paged<StudentFee> & { summary?: any }>('/me/fees/');

export const getMyComplaints = () => req<Paged<Complaint>>('/me/complaints/');

export const createMyComplaint = (payload: {
  category: string;
  priority: string;
  subject: string;
  description?: string;
}) => req<Complaint>('/me/complaints/', json(payload));

export const getMyMessMenu = (days = 7) => req<MessMenu[]>(`/me/mess/menu/?days=${days}`);

export const getMyMessFeedback = () => req<Paged<any>>('/me/mess/feedback/');

export const submitMessFeedback = (payload: {
  date: string;
  meal_type: string;
  rating: number;
  comments?: string;
}) => req<any>('/me/mess/feedback/', json(payload));

export const getMyMessRequests = () => req<Paged<MessRequest>>('/me/mess/requests/');

export const createMessRequest = (payload: { request_type: string; description: string }) =>
  req<MessRequest>('/me/mess/requests/', json(payload));

export const getMyLeaves = () => req<Paged<LeaveRequest>>('/me/leaves/');

export const createMyLeave = (payload: {
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  destination?: string;
  guardian_contact?: string;
}) => req<LeaveRequest>('/me/leaves/', json(payload));

export const getMyVisitors = () => req<Paged<any>>('/me/visitors/');

export const getMyTransport = () =>
  req<{ active: TransportAssignment | null; history: TransportAssignment[] }>('/me/transport/');

export const getMyNotices = () => req<Paged<Notice>>('/me/notices/');

export const markNoticeRead = (noticeId: number) => req<{ detail: string }>('/me/notices/', json({ notice: noticeId }));

export const getMyVacating = () => req<Paged<VacatingRequest>>('/me/vacating/');

export const createVacatingRequest = (payload: { requested_vacate_date: string; reason?: string }) =>
  req<VacatingRequest>('/me/vacating/', json(payload));

/* ------------------------------------------------------------------ */
/* Admin endpoints                                                    */
/* ------------------------------------------------------------------ */

export const getHostelConfig = () => req<HostelConfig>('/config/');

export const updateHostelConfig = (payload: Partial<HostelConfig>) =>
  req<HostelConfig>('/config/', patch(payload));

export const getLookups = () => req<Lookup>('/lookups/');

export const getDashboard = (params: Record<string, unknown> = {}) =>
  req<DashboardSummary>(`/dashboard/${qs(params)}`);

export const getStudents = (params: Record<string, unknown> = {}) =>
  req<Paged<StudentBrief>>(`/students/${qs(params)}`);

export const getStudentDetail = (regNo: string) => req<any>(`/students/${encodeURIComponent(regNo)}/`);

export const updateStudentFacility = (regNo: string, payload: Record<string, unknown>) =>
  req<Facility>(`/students/${encodeURIComponent(regNo)}/facility/`, patch(payload));

export const importFacilityCsv = (file: File, overwriteVerified = false) => {
  const form = new FormData();
  form.append('file', file);
  form.append('overwrite_verified', overwriteVerified ? 'true' : 'false');
  return req<any>('/students/import/', { method: 'POST', body: form });
};

export const getSyncRuns = () => req<Paged<any>>('/students/sync-runs/');

export const getFacilityRequests = (params: Record<string, unknown> = {}) =>
  req<Paged<FacilityChangeRequest> | FacilityChangeRequest[]>(`/facility-requests/${qs(params)}`);

export const decideFacilityRequest = (id: number, approve: boolean, remarks = '') =>
  req<FacilityChangeRequest>(`/facility-requests/${id}/decision/`, json({ approve, remarks }));

export const getFacilityHistory = (params: Record<string, unknown> = {}) =>
  req<Paged<any>>(`/facility-history/${qs(params)}`);

/* Buildings */
export const getBuildings = (params: Record<string, unknown> = {}) =>
  req<Building[] | Paged<Building>>(`/buildings/${qs(params)}`);
export const createBuilding = (payload: Record<string, unknown>) => req<Building>('/buildings/', json(payload));
export const updateBuilding = (id: number, payload: Record<string, unknown>) =>
  req<Building>(`/buildings/${id}/`, patch(payload));
export const deleteBuilding = (id: number) => req<null>(`/buildings/${id}/`, { method: 'DELETE' });
export const getBuildingSummary = (id: number) => req<any>(`/buildings/${id}/summary/`);

/* Floors */
export const getFloors = (params: Record<string, unknown> = {}) =>
  req<Floor[] | Paged<Floor>>(`/floors/${qs(params)}`);
export const createFloor = (payload: Record<string, unknown>) => req<Floor>('/floors/', json(payload));
export const updateFloor = (id: number, payload: Record<string, unknown>) =>
  req<Floor>(`/floors/${id}/`, patch(payload));
export const deleteFloor = (id: number) => req<null>(`/floors/${id}/`, { method: 'DELETE' });

/* Rooms */
export const getRooms = (params: Record<string, unknown> = {}) =>
  req<Room[] | Paged<Room>>(`/rooms/${qs(params)}`);
export const createRoom = (payload: Record<string, unknown>) => req<Room>('/rooms/', json(payload));
export const updateRoom = (id: number, payload: Record<string, unknown>) =>
  req<Room>(`/rooms/${id}/`, patch(payload));
export const deleteRoom = (id: number) => req<null>(`/rooms/${id}/`, { method: 'DELETE' });

/* Allocations */
export const getAllocations = (params: Record<string, unknown> = {}) =>
  req<Paged<Allocation> | Allocation[]>(`/allocations/${qs(params)}`);
export const createAllocation = (payload: Record<string, unknown>) =>
  req<Allocation>('/allocations/', json(payload));
export const autoAllocate = (payload: Record<string, unknown>) =>
  req<{
    requested: number;
    allocated: number;
    skipped: number;
    allocations: Array<{ student: number; reg_no: string; name: string; allocation: Allocation }>;
    errors: Array<{ student?: number; reg_no?: string; reason: string }>;
  }>('/allocations/auto/', json(payload));
export const transferAllocation = (id: number, payload: Record<string, unknown>) =>
  req<Allocation>(`/allocations/${id}/transfer/`, json(payload));
export const vacateAllocation = (id: number, payload: Record<string, unknown> = {}) =>
  req<Allocation>(`/allocations/${id}/vacate/`, json(payload));

/* Transport */
export const getRoutes = () => req<TransportRoute[] | Paged<TransportRoute>>('/routes/');
export const createRoute = (payload: Record<string, unknown>) => req<TransportRoute>('/routes/', json(payload));
export const getBuses = (params: Record<string, unknown> = {}) =>
  req<CollegeBus[] | Paged<CollegeBus>>(`/buses/${qs(params)}`);
export const createBus = (payload: Record<string, unknown>) => req<CollegeBus>('/buses/', json(payload));
export const getTransportAssignments = (params: Record<string, unknown> = {}) =>
  req<Paged<TransportAssignment> | TransportAssignment[]>(`/transport-assignments/${qs(params)}`);
export const createTransportAssignment = (payload: Record<string, unknown>) =>
  req<TransportAssignment>('/transport-assignments/', json(payload));

/* Fees */
export const getFeeStructures = (params: Record<string, unknown> = {}) =>
  req<FeeStructure[] | Paged<FeeStructure>>(`/fee-structures/${qs(params)}`);
export const createFeeStructure = (payload: Record<string, unknown>) =>
  req<FeeStructure>('/fee-structures/', json(payload));
export const getStudentFees = (params: Record<string, unknown> = {}) =>
  req<Paged<StudentFee>>(`/student-fees/${qs(params)}`);
export const createStudentFee = (payload: Record<string, unknown>) =>
  req<StudentFee>('/student-fees/', json(payload));
export const recordPayment = (payload: Record<string, unknown>) =>
  req<FeePayment>('/payments/', json(payload));

/* Complaints */
export const getComplaints = (params: Record<string, unknown> = {}) =>
  req<Paged<Complaint>>(`/complaints/${qs(params)}`);
export const updateComplaintStatus = (id: number, payload: { status: string; note?: string; resolution_notes?: string }) =>
  req<Complaint>(`/complaints/${id}/status_update/`, json(payload));
export const assignComplaint = (id: number, assignedTo: number) =>
  req<Complaint>(`/complaints/${id}/assign/`, json({ assigned_to: assignedTo }));

/* Notices */
export const getNotices = (params: Record<string, unknown> = {}) =>
  req<Paged<Notice> | Notice[]>(`/notices/${qs(params)}`);
export const createNotice = (payload: Record<string, unknown>) => req<Notice>('/notices/', json(payload));

/* Mess (admin) */
export const getMessMenus = (params: Record<string, unknown> = {}) =>
  req<Paged<MessMenu> | MessMenu[]>(`/mess-menus/${qs(params)}`);
export const createMessMenu = (payload: Record<string, unknown>) => req<MessMenu>('/mess-menus/', json(payload));

/* Visitors */
export const getVisitors = (params: Record<string, unknown> = {}) =>
  req<Paged<any>>(`/visitors/${qs(params)}`);
export const checkoutVisitor = (id: number) => req<any>(`/visitors/${id}/checkout/`, json({}));

/* Leaves (admin) */
export const getLeaveRequests = (params: Record<string, unknown> = {}) =>
  req<Paged<LeaveRequest>>(`/leave-requests/${qs(params)}`);
export const decideLeave = (id: number, approve: boolean, remarks = '') =>
  req<LeaveRequest>(`/leave-requests/${id}/decision/`, json({ approve, remarks }));

/* Vacating (admin) */
export const getVacatingRequests = (params: Record<string, unknown> = {}) =>
  req<Paged<VacatingRequest>>(`/vacating-requests/${qs(params)}`);
export const verifyVacatingStep = (id: number, step: string, approve = true, notes = '') =>
  req<VacatingRequest>(`/vacating-requests/${id}/verify_step/`, json({ step, approve, notes }));
export const decideVacating = (id: number, approve: boolean, remarks = '') =>
  req<VacatingRequest>(`/vacating-requests/${id}/decision/`, json({ approve, remarks }));

/* Selection windows */
export const getSelectionWindows = () =>
  req<SelectionWindow[] | Paged<SelectionWindow>>('/selection-windows/');
export const createSelectionWindow = (payload: Record<string, unknown>) =>
  req<SelectionWindow>('/selection-windows/', json(payload));
export const updateSelectionWindow = (id: number, payload: Record<string, unknown>) =>
  req<SelectionWindow>(`/selection-windows/${id}/`, patch(payload));

/* Reports / audit */
export const getOccupancyReport = (params: Record<string, unknown> = {}) =>
  req<any>(`/reports/occupancy/${qs(params)}`);
export const getFeeReport = (params: Record<string, unknown> = {}) =>
  req<any>(`/reports/fees/${qs(params)}`);
export const getAuditLog = () => req<Paged<any>>('/audit-log/');
