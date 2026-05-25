import fetchWithAuth from './fetchAuth';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();
const BASE = `${API_BASE}/api/academic-v2/visual-admin`;

export interface VAStaffRow {
  staff_id: string;
  internal_id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  profile_image: string;
  overall_url: string;
  use_course_urls: boolean;
}

export interface VACourseRow {
  ta_id: number;
  course_code: string;
  course_name: string;
  section: string;
  department: string;
  academic_year: string;
  url: string;
}

export interface VAStaffDetail {
  staff_id: string;
  name: string;
  overall_url: string;
  use_course_urls: boolean;
  courses: VACourseRow[];
}

export interface VAUser {
  id: number;
  name: string;
  email: string;
  profile_image: string;
  roles: string[];
  department: string;
  designation: string;
}

export interface VADashboardStats {
  total_staff: number;
  staff_with_link: number;
  staff_with_course_urls: number;
  staff_with_overall_only: number;
  staff_no_link: number;
  total_course_links: number;
  visual_admin_count: number;
}

export interface VAMyLink {
  url: string;
  source: 'course' | 'overall' | 'none';
}

export async function fetchVAStaffList(q = ''): Promise<VAStaffRow[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  const res = await fetchWithAuth(`${BASE}/staff/${params}`);
  if (!res.ok) throw new Error('Failed to fetch staff list');
  return res.json();
}

export async function fetchVAStaffDetail(staffId: string): Promise<VAStaffDetail> {
  const res = await fetchWithAuth(`${BASE}/staff/${encodeURIComponent(staffId)}/`);
  if (!res.ok) throw new Error('Failed to fetch staff detail');
  return res.json();
}

export async function saveVAStaffLink(
  staffId: string,
  payload: { overall_url: string; use_course_urls: boolean; course_links: { ta_id: number; url: string }[] },
): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/staff/${encodeURIComponent(staffId)}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save link');
}

export async function fetchVAUsers(): Promise<VAUser[]> {
  const res = await fetchWithAuth(`${BASE}/users/`);
  if (!res.ok) throw new Error('Failed to fetch visual admin users');
  return res.json();
}

export async function fetchVAMyLink(taId: number): Promise<VAMyLink> {
  const res = await fetchWithAuth(`${BASE}/my-link/${taId}/`);
  if (!res.ok) return { url: '', source: 'none' };
  return res.json();
}

export async function fetchVADashboardStats(): Promise<VADashboardStats> {
  const res = await fetchWithAuth(`${BASE}/dashboard-stats/`);
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}
