import fetchWithAuth from './fetchAuth';

const BASE = '/api/hostel';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail =
      (data && (data.detail || data.error)) ||
      (data && typeof data === 'object' ? JSON.stringify(data) : '') ||
      `Request failed (${response.status})`;
    throw new Error(String(detail));
  }
  return data as T;
}

const qs = (params: Record<string, unknown> = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export type Paginated<T> = {
  count: number;
  page?: number;
  page_size?: number;
  results: T[];
  summary?: Record<string, number>;
};

function asPage<T>(data: Paginated<T> | T[]): Paginated<T> {
  if (Array.isArray(data)) {
    return { count: data.length, results: data };
  }
  return data;
}

export type StudentBrief = {
  id: number;
  reg_no: string;
  name: string;
  department?: { id: number; name: string; code: string } | null;
  semester?: number | null;
  mobile_number?: string;
};

export type Building = {
  id: number;
  code: string;
  name: string;
  hostel_category?: string;
};

export type MessMenu = {
  id: number;
  date: string;
  day_of_week: string;
  day_of_week_display?: string;
  effective_date?: string | null;
  meal_type: 'BREAKFAST' | 'LUNCH' | 'SNACKS' | 'DINNER';
  meal_type_display?: string;
  items: string;
  menu_items: string[];
  building?: number | null;
  building_name?: string;
  is_published: boolean;
};

export type MealBooking = {
  id: number;
  student: number;
  date: string;
  meal_type: string;
  is_opted_in: boolean;
  remarks?: string;
};

export type MessFeedback = {
  id: number;
  student: number;
  student_detail?: StudentBrief;
  date: string;
  meal_type: string;
  rating: number;
  category: 'QUALITY' | 'HYGIENE' | 'QUANTITY' | 'OTHER';
  comments: string;
};

export type Visitor = {
  id: number;
  student: number;
  student_detail?: StudentBrief;
  visitor_name: string;
  phone_number: string;
  purpose: string;
  building?: number | null;
  building_name?: string;
  room?: number | null;
  room_number?: string;
  entry_at: string;
  exit_at?: string | null;
  status: 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
  status_display?: string;
  logged_by_name?: string;
  remarks?: string;
};

export type GatePass = {
  id: number;
  student: number;
  student_detail?: StudentBrief;
  pass_type: 'LOCAL_OUTING' | 'HOME_LEAVE' | 'EMERGENCY' | 'NIGHT_OUT';
  pass_type_display?: string;
  from_date: string;
  expected_out_time: string;
  to_date: string;
  expected_in_time: string;
  reason: string;
  destination?: string;
  guardian_contact?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  status_display?: string;
  approved_by_name?: string;
  warden_remarks?: string;
  actual_out_time?: string | null;
  actual_in_time?: string | null;
  security_guard_out_name?: string;
  security_guard_in_name?: string;
  is_late_entry: boolean;
  is_expired: boolean;
  is_valid_at_gate: boolean;
  qr_token: string;
  qr_payload?: string;
  qr_image?: string;
  leave_request?: number | null;
};

export type Announcement = {
  id: number;
  title: string;
  message: string;
  priority: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  target_audience: string;
  building?: number | null;
  building_name?: string;
  target_year?: number | null;
  created_by_name?: string;
  published_at: string;
  expires_at?: string | null;
  is_active: boolean;
  is_read: boolean;
  read_count?: number;
};

export type Asset = {
  id: number;
  asset_code: string;
  name: string;
  asset_name?: string;
  category: 'FURNITURE' | 'ELECTRICAL' | 'COMMON_FACILITY' | 'OTHER';
  category_display?: string;
  status: 'GOOD' | 'NEEDS_REPAIR' | 'DAMAGED' | 'DISPOSED';
  status_display?: string;
  building?: number | null;
  building_name?: string;
  room?: number | null;
  room_number?: string;
  quantity: number;
  purchase_date?: string | null;
  cost: string;
  remarks?: string;
};

export type HostelDashboard = {
  students: Record<string, number>;
  infrastructure: Record<string, number>;
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
  complaints: {
    active: number;
    resolved: number;
    total: number;
    trend_last_7_days: Array<{ created_at__date: string; count: number }>;
  };
  movement: {
    visitors_today: number;
    visitors_inside: number;
    active_leaves: number;
    pending_leaves: number;
    active_gate_passes: number;
    pending_gate_passes: number;
    late_entries: number;
  };
  mess: { booked_today: number; opted_out_today: number; feedback_average: number };
  finance: {
    total_due: string;
    total_paid: string;
    outstanding: string;
    collection_rate: number;
    students_with_dues: number;
  };
  generated_at: string;
};

/* ------------------------------ Mess ------------------------------ */

export const getMenus = async (params: Record<string, unknown> = {}) =>
  asPage(await request<MessMenu[] | Paginated<MessMenu>>(`/mess-menus/${qs(params)}`));

export const createMenu = (payload: Partial<MessMenu>) =>
  request<MessMenu>('/mess-menus/', { method: 'POST', body: JSON.stringify(payload) });

export const updateMenu = (id: number, payload: Partial<MessMenu>) =>
  request<MessMenu>(`/mess-menus/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteMenu = (id: number) => request<void>(`/mess-menus/${id}/`, { method: 'DELETE' });

export const getMyMenus = (days = 7) => request<MessMenu[]>(`/me/mess/menu/?days=${days}`);

export const getMealBookings = (params: Record<string, unknown> = {}) =>
  request<Paginated<MealBooking>>(`/me/mess/bookings/${qs(params)}`);

export const setMealBooking = (payload: { date: string; meal_type: string; is_opted_in: boolean; remarks?: string }) =>
  request<MealBooking>('/me/mess/bookings/', { method: 'POST', body: JSON.stringify(payload) });

export const getMealHeadcount = (date: string) =>
  request<{ date: string; counts: Record<string, number>; total: number }>(
    `/meal-bookings/headcount/${qs({ date })}`,
  );

export const getMyMessFeedback = () => request<Paginated<MessFeedback>>('/me/mess/feedback/');

export const submitMessFeedback = (payload: {
  date: string;
  meal_type: string;
  rating: number;
  category: string;
  comments?: string;
}) => request<MessFeedback>('/me/mess/feedback/', { method: 'POST', body: JSON.stringify(payload) });

export const getMessFeedback = async (params: Record<string, unknown> = {}) =>
  asPage(await request<MessFeedback[] | Paginated<MessFeedback>>(`/mess-feedback/${qs(params)}`));

export const getMessFeedbackSummary = () =>
  request<{ average_rating: number; total_feedback: number; by_category: Array<{ category: string; count: number; average: number }> }>(
    '/mess-feedback/summary/',
  );

/* ----------------------------- Visitors ---------------------------- */

export const getVisitors = async (params: Record<string, unknown> = {}) =>
  asPage(await request<Visitor[] | Paginated<Visitor>>(`/visitors/${qs(params)}`));

export const createVisitor = (payload: Partial<Visitor>) =>
  request<Visitor>('/visitors/', { method: 'POST', body: JSON.stringify(payload) });

export const checkoutVisitor = (id: number) =>
  request<Visitor>(`/visitors/${id}/checkout/`, { method: 'POST', body: JSON.stringify({}) });

export const getVisitorSummary = () =>
  request<{ active: number; checked_out_today: number; today_total: number }>('/visitors/summary/');

/* ---------------------------- Gate passes -------------------------- */

export const getMyGatePasses = (params: Record<string, unknown> = {}) =>
  request<Paginated<GatePass> & { summary: { active: number; pending: number; late_entries: number } }>(
    `/me/gate-passes/${qs(params)}`,
  );

export const createGatePass = (payload: Partial<GatePass>) =>
  request<GatePass>('/me/gate-passes/', { method: 'POST', body: JSON.stringify(payload) });

export const cancelGatePass = (id: number) =>
  request<GatePass>(`/me/gate-passes/${id}/cancel/`, { method: 'POST', body: JSON.stringify({}) });

export const getGatePasses = async (params: Record<string, unknown> = {}) =>
  asPage(await request<GatePass[] | Paginated<GatePass>>(`/gate-passes/${qs(params)}`));

export const decideGatePass = (id: number, approve: boolean, warden_remarks = '') =>
  request<GatePass>(`/gate-passes/${id}/decision/`, {
    method: 'POST',
    body: JSON.stringify({ approve, warden_remarks }),
  });

export const verifyGateExit = (token: string) =>
  request<{ detail: string; pass: GatePass }>('/gate-passes/verify-exit/', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const verifyGateEntry = (token: string) =>
  request<{ detail: string; is_late_entry: boolean; pass: GatePass }>('/gate-passes/verify-entry/', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const scanGatePass = (token: string) =>
  request<{ valid: boolean; pass: GatePass; detail?: string }>('/gate-passes/scan/', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const getLeaves = (params: Record<string, unknown> = {}) =>
  request<Paginated<any>>(`/leave-requests/${qs(params)}`);

/* --------------------------- Announcements ------------------------- */

export const getAnnouncements = async (params: Record<string, unknown> = {}) =>
  asPage(await request<Announcement[] | Paginated<Announcement>>(`/announcements/${qs(params)}`));

export const createAnnouncement = (payload: Partial<Announcement>) =>
  request<Announcement>('/announcements/', { method: 'POST', body: JSON.stringify(payload) });

export const deleteAnnouncement = (id: number) =>
  request<void>(`/announcements/${id}/`, { method: 'DELETE' });

export const getMyAnnouncements = (params: Record<string, unknown> = {}) =>
  request<Paginated<Announcement> & { summary: { unread: number; emergency: number } }>(
    `/me/announcements/${qs(params)}`,
  );

export const markAnnouncementRead = (id: number) =>
  request<{ detail: string }>('/me/announcements/', {
    method: 'POST',
    body: JSON.stringify({ notice: id }),
  });

/* ----------------------------- Inventory --------------------------- */

export const getAssets = async (params: Record<string, unknown> = {}) =>
  asPage(await request<Asset[] | Paginated<Asset>>(`/assets/${qs(params)}`));

export const createAsset = (payload: Partial<Asset>) =>
  request<Asset>('/assets/', { method: 'POST', body: JSON.stringify(payload) });

export const updateAsset = (id: number, payload: Partial<Asset>) =>
  request<Asset>(`/assets/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });

export const setAssetStatus = (id: number, status: string) =>
  request<Asset>(`/assets/${id}/status/`, { method: 'POST', body: JSON.stringify({ status }) });

export const getAssetSummary = () =>
  request<{
    total_assets: number;
    good: number;
    needs_repair: number;
    damaged: number;
    disposed: number;
    by_category: Record<string, number>;
    total_cost: string;
    total_quantity: number;
  }>('/assets/summary/');

/* ----------------------------- Dashboard --------------------------- */

export const getHostelDashboard = (params: Record<string, unknown> = {}) =>
  request<HostelDashboard>(`/dashboard/${qs(params)}`);

export const getBuildings = () => request<Paginated<Building> | Building[]>('/buildings/');

export const getStudents = (params: Record<string, unknown> = {}) =>
  request<Paginated<StudentBrief>>(`/students/${qs(params)}`);

export const getLookups = () => request<Record<string, any>>('/lookups/');
