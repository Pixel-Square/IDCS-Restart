import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Download, Eye, FileText, Loader2, Megaphone, Plus, X } from 'lucide-react';

import { apiClient } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';

type TargetType = 'ALL' | 'DEPARTMENT' | 'CLASS' | 'ROLE';

type Announcement = {
  id: string;
  title: string;
  content: string;
  target_type: TargetType;
  target_roles: string[];
  department_name?: string | null;
  class_name?: string | null;
  created_by?: {
    username?: string | null;
    name?: string | null;
    profile_image?: string | null;
  } | null;
  created_by_name: string;
  created_by_role: string;
  created_by_label: string;
  created_at: string;
  is_read: boolean;
  attachment_url: string | null;
  tag?: string | null;
  expiry_date: string | null;
  is_expired: boolean;
};

type AnnouncementReader = {
  user_id: number;
  username: string;
  full_name: string;
  role?: string | null;
  is_read: boolean;
  read_at: string;
};

type OptionDepartment = { id: number; code: string; name: string };
type OptionClass = { id: number; label: string; name: string };

type CreateOptions = {
  can_create: boolean;
  allowed_target_types: TargetType[];
  allowed_target_roles: string[];
  departments: OptionDepartment[];
  classes: OptionClass[];
  department_locked: boolean;
  allow_multiple_departments: boolean;
  forced_department_ids: number[];
  class_locked: boolean;
  forced_class_id: number | null;
  show_sent_tab: boolean;
  user_roles: string[];
};

type AnnouncementListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Announcement[];
};

interface AnnouncementsPageProps {
  user?: { username: string } | null;
}

const ROLE_PRIORITY = ['PRINCIPAL', 'IQAC', 'HOD', 'STAFF', 'STUDENT'];

const formatAnnouncementDate = (value: string) => {
  const dt = new Date(value);
  const datePart = dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = dt.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
};

const formatExpiryRelative = (value: string | null) => {
  if (!value) return '';
  const now = new Date();
  const expiry = new Date(value);
  const diffMs = expiry.getTime() - now.getTime();
  if (Number.isNaN(diffMs)) return '';
  if (diffMs <= 0) return 'Expired';

  const daysTotal = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (daysTotal >= 30) {
    const months = Math.floor(daysTotal / 30);
    const days = daysTotal % 30;
    return `Expires in ${months} month${months > 1 ? 's' : ''}${days ? ` ${days} day${days > 1 ? 's' : ''}` : ''}`;
  }
  if (daysTotal >= 7) {
    const weeks = Math.floor(daysTotal / 7);
    const days = daysTotal % 7;
    return `Expires in ${weeks} week${weeks > 1 ? 's' : ''}${days ? ` ${days} day${days > 1 ? 's' : ''}` : ''}`;
  }
  if (daysTotal > 0) return `Expires in ${daysTotal} day${daysTotal > 1 ? 's' : ''}`;
  return 'Expires today';
};

const getCreatorName = (announcement: Announcement) => {
  const apiName = announcement.created_by?.name || announcement.created_by?.username;
  return apiName || announcement.created_by_label || announcement.created_by_name || 'Admin';
};

const getCreatorInitials = (announcement: Announcement) => {
  const name = getCreatorName(announcement);
  const letters = (name.match(/\b[A-Z]/gi) || []).slice(0, 2).join('').toUpperCase();
  return letters || 'AD';
};

const getCreatorAvatar = (announcement: Announcement) => {
  const url = announcement.created_by?.profile_image;
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${getApiBase()}${url}`;
  return url;
};

const getTagMeta = (tag?: string | null) => {
  const key = (tag || '').trim().toUpperCase();
  if (!key) return null;
  if (key === 'CRITICAL') return { label: 'Critical', bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' };
  if (key === 'INFO') return { label: 'Info', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
  if (key === 'EVENT') return { label: 'Event', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
  return { label: key, bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
};

const roleLabel = (role: string) => {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'STUDENT') return 'Students';
  if (normalized === 'STAFF') return 'Staff';
  if (normalized === 'HOD') return 'HOD';
  if (normalized === 'IQAC') return 'IQAC';
  if (normalized === 'PRINCIPAL') return 'Principal';
  return normalized;
};

const targetTypeLabel = (targetType: TargetType) => {
  if (targetType === 'ALL') return 'All';
  if (targetType === 'ROLE') return 'Role';
  if (targetType === 'DEPARTMENT') return 'Department';
  if (targetType === 'CLASS') return 'Class';
  return targetType;
};

const isImageUrl = (url: string | null) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg');
};

const isPdfAttachment = (url: string | null) => {
  if (!url) return false;
  return url.toLowerCase().endsWith('.pdf');
};

export default function AnnouncementsPage({ user }: AnnouncementsPageProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [sentAnnouncements, setSentAnnouncements] = useState<Announcement[]>([]);
  const [options, setOptions] = useState<CreateOptions | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'sent'>('all');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [announcementReaders, setAnnouncementReaders] = useState<Record<string, AnnouncementReader[]>>({});
  const [readerRoleFilter, setReaderRoleFilter] = useState<'ALL' | 'HOD' | 'STAFF' | 'STUDENT'>('ALL');

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tag, setTag] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('ALL');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<number[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [expiresIn, setExpiresIn] = useState<'1W' | '1M' | '3M' | '6M' | '1Y'>('1M');

  const normalizedRoles = useMemo(
    () => (options?.user_roles || []).map((role) => String(role || '').toUpperCase()),
    [options?.user_roles],
  );

  const actorRole = useMemo(() => {
    for (const role of ROLE_PRIORITY) {
      if (normalizedRoles.includes(role)) return role;
    }
    return '';
  }, [normalizedRoles]);

  const canCreate = Boolean(options?.can_create && actorRole !== 'STUDENT');
  const allowedTargetTypes = options?.allowed_target_types || [];
  const allowedTargetRoles = options?.allowed_target_roles || [];
  const departments = options?.departments || [];
  const classes = options?.classes || [];

  const showRoleSelector = targetType !== 'CLASS' && allowedTargetRoles.length > 0;
  const showDepartmentSelector = targetType === 'DEPARTMENT' || actorRole === 'HOD';
  const showClassSelector = targetType === 'CLASS';
  const showTargetTypeDropdown = !(allowedTargetTypes.length === 1 && allowedTargetTypes[0] === 'CLASS');
  const showSentTab = Boolean(options?.show_sent_tab && actorRole !== 'STUDENT');

  const unreadCount = useMemo(
    () => announcements.filter((announcement) => !announcement.is_read).length,
    [announcements],
  );

  const visibleAnnouncements = useMemo(() => {
    if (activeTab === 'unread') return announcements.filter((announcement) => !announcement.is_read);
    if (activeTab === 'sent') return sentAnnouncements;
    return announcements;
  }, [announcements, sentAnnouncements, activeTab]);

  const initializeCreateDefaults = (loadedOptions: CreateOptions) => {
    const firstTargetType = loadedOptions.allowed_target_types[0] || 'ALL';
    setTargetType(firstTargetType);

    if (loadedOptions.department_locked) {
      setSelectedDepartmentIds(loadedOptions.forced_department_ids || []);
    } else {
      setSelectedDepartmentIds([]);
    }

    if (firstTargetType === 'CLASS' || loadedOptions.allowed_target_roles.length === 0) {
      setSelectedRoles([]);
    } else {
      setSelectedRoles(loadedOptions.allowed_target_roles);
    }

    if (loadedOptions.class_locked && loadedOptions.forced_class_id) {
      setSelectedClassId(loadedOptions.forced_class_id);
    } else {
      setSelectedClassId('');
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [listRes, optionsRes] = await Promise.all([
        apiClient.get<AnnouncementListResponse>(`${getApiBase()}/api/announcements/announcements/`),
        apiClient.get<CreateOptions>(`${getApiBase()}/api/announcements/announcements/options/`),
      ]);

      const loadedOptions = optionsRes.data;
      const sentRes = loadedOptions.show_sent_tab
        ? await apiClient.get<AnnouncementListResponse>(`${getApiBase()}/api/announcements/announcements/sent/`)
        : null;

      setAnnouncements((listRes.data?.results || []).filter((item) => !item.is_expired));
      setSentAnnouncements((sentRes?.data?.results || []).filter((item) => !item.is_expired));
      setOptions(loadedOptions);
      initializeCreateDefaults(loadedOptions);
    } catch (loadError) {
      console.error('Announcements load failed', loadError);
      setError('Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (actorRole === 'STUDENT' && location.pathname.endsWith('/announcements/sent')) {
      navigate('/announcements', { replace: true });
      return;
    }
    setActiveTab(location.pathname.endsWith('/announcements/sent') ? 'sent' : 'all');
  }, [location.pathname, actorRole, navigate]);

  useEffect(() => {
    loadData();
  }, []);

  const toggleTab = (tab: 'all' | 'unread' | 'sent') => {
    if (tab === 'sent' && !showSentTab) return;
    setActiveTab(tab);
    navigate(tab === 'sent' ? '/announcements/sent' : '/announcements');
  };

  const markAsRead = async (announcementId: string) => {
    try {
      await apiClient.post(`${getApiBase()}/api/announcements/announcements/${announcementId}/mark-read/`);
      setAnnouncements((prev) => prev.map((item) => (item.id === announcementId ? { ...item, is_read: true } : item)));
      setSelectedAnnouncement((prev) => (prev && prev.id === announcementId ? { ...prev, is_read: true } : prev));
    } catch (markError) {
      console.error('Failed to mark announcement as read', markError);
    }
  };

  const openAnnouncement = async (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    if (!announcement.is_read) {
      await markAsRead(announcement.id);
    }

    try {
      const res = await apiClient.get<{ readers: AnnouncementReader[] }>(`${getApiBase()}/api/announcements/announcements/${announcement.id}/readers/`);
      setAnnouncementReaders((prev) => ({ ...prev, [announcement.id]: res.data.readers || [] }));
    } catch (fetchError: any) {
      if (fetchError?.response?.status !== 403) {
        console.error('Failed to load readers', fetchError);
      }
    }
  };

  const onTargetTypeChange = (value: TargetType) => {
    setTargetType(value);

    if (!(options?.class_locked && options?.forced_class_id)) {
      setSelectedClassId('');
    }

    if (!options?.department_locked) {
      setSelectedDepartmentIds([]);
    }

    if (value === 'CLASS' || allowedTargetRoles.length === 0) {
      setSelectedRoles([]);
    } else {
      setSelectedRoles(allowedTargetRoles);
    }
  };

  const toggleRole = (role: string) => {
    const normalizedRole = String(role || '').toUpperCase();
    setSelectedRoles((prev) => (
      prev.includes(normalizedRole)
        ? prev.filter((item) => item !== normalizedRole)
        : [...prev, normalizedRole]
    ));
  };

  const toggleDepartment = (departmentId: number) => {
    if (options?.department_locked) return;

    if (options?.allow_multiple_departments) {
      setSelectedDepartmentIds((prev) => (
        prev.includes(departmentId)
          ? prev.filter((item) => item !== departmentId)
          : [...prev, departmentId]
      ));
      return;
    }

    setSelectedDepartmentIds([departmentId]);
  };

  const extractErrorMessage = (payload: any): string => {
    if (!payload) return 'Failed to create announcement.';
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (trimmed.startsWith('<')) return 'Failed to create announcement.'; // avoid surfacing HTML responses
      return trimmed || 'Failed to create announcement.';
    }
    if (Array.isArray(payload)) return String(payload[0] || 'Failed to create announcement.');

    if (typeof payload === 'object') {
      for (const value of Object.values(payload)) {
        if (Array.isArray(value) && value.length > 0) return String(value[0]);
        if (value) return String(value);
      }
    }

    return 'Failed to create announcement.';
  };

  const validateForm = (): string | null => {
    if (!title.trim()) return 'Title is required.';
    if (!content.trim()) return 'Content is required.';

    if (showRoleSelector && selectedRoles.length === 0) {
      return 'Invalid target role selected';
    }

    if (showDepartmentSelector && selectedDepartmentIds.length === 0) {
      return 'Select at least one department.';
    }

    if (showClassSelector && !selectedClassId) {
      return 'Class is required.';
    }

    if (attachment) {
      const lowerName = attachment.name.toLowerCase();
      const validAttachment = lowerName.endsWith('.pdf') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png');
      if (!validAttachment) return 'Only PDF, JPG, and PNG files are allowed.';
    }

    return null;
  };

  const resetCreateForm = () => {
    setTitle('');
    setContent('');
    setTag('');
    setSelectedClassId('');
    setAttachment(null);
    setExpiresIn('1M');

    if (options) {
      initializeCreateDefaults(options);
    }
  };

  const createAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('content', content.trim());
      formData.append('target_type', targetType.toUpperCase());
      formData.append('is_active', 'true');
      formData.append('expires_in', expiresIn);
      if (tag.trim()) {
        formData.append('tag', tag.trim());
      }

      selectedRoles.forEach((role) => formData.append('target_roles', role.toUpperCase()));
      selectedDepartmentIds.forEach((departmentId) => formData.append('department_ids', String(departmentId)));
      if (selectedDepartmentIds.length > 0) {
        formData.append('department', String(selectedDepartmentIds[0]));
      }
      if (selectedClassId) {
        formData.append('class_id', String(selectedClassId));
      }
      if (attachment) {
        formData.append('attachment', attachment);
      }

      await apiClient.post(`${getApiBase()}/api/announcements/announcements/create/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      resetCreateForm();
      setShowCreate(false);
      await loadData();
    } catch (createError: any) {
      console.error('Announcement create failed', createError?.response?.data || createError);
      const message = extractErrorMessage(createError?.response?.data);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const targetSummary = (announcement: Announcement) => {
    if (announcement.target_type === 'ALL') return 'All users';
    if (announcement.target_type === 'CLASS') return 'Class students';
    if (announcement.target_type === 'DEPARTMENT') {
      return announcement.department_name ? `Department: ${announcement.department_name}` : 'Selected departments';
    }
    return 'Role-based recipients';
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Announcements</h1>
              <p className="mt-1 text-sm text-slate-600">Stay updated with institutional announcements</p>
            </div>
          </div>

          {canCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {showCreate ? 'Close Create' : 'Create Announcement'}
            </button>
          ) : null}
        </header>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : null}

        {canCreate && showCreate ? (
          <form onSubmit={createAnnouncement} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Write a clear title"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Content</label>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Share the full announcement content"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tag (optional)</label>
                <select
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">No tag</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="INFO">Info</option>
                  <option value="EVENT">Event</option>
                </select>
              </div>

              {showTargetTypeDropdown ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Target Type</label>
                  <select
                    value={targetType}
                    onChange={(event) => onTargetTypeChange(event.target.value as TargetType)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {allowedTargetTypes.map((type) => (
                      <option key={type} value={type}>{targetTypeLabel(type)}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Target Type</label>
                  <div className="flex h-11 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700">Class</div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Expiry</label>
                <select
                  value={expiresIn}
                  onChange={(event) => setExpiresIn(event.target.value as '1W' | '1M' | '3M' | '6M' | '1Y')}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="1W">1 Week</option>
                  <option value="1M">1 Month</option>
                  <option value="3M">3 Months</option>
                  <option value="6M">6 Months</option>
                  <option value="1Y">1 Year</option>
                </select>
              </div>
            </div>

            <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Target Audience</h3>

              {showRoleSelector ? (
                <div className="flex flex-wrap gap-2">
                  {allowedTargetRoles.map((role) => {
                    const selected = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300'}`}
                      >
                        {roleLabel(role)}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {showClassSelector ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Class</label>
                  <select
                    value={selectedClassId}
                    disabled={Boolean(options?.class_locked)}
                    onChange={(event) => setSelectedClassId(event.target.value ? Number(event.target.value) : '')}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">Select class</option>
                    {classes.map((klass) => (
                      <option key={klass.id} value={klass.id}>{klass.label}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </section>

            {showDepartmentSelector ? (
              <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-800">Departments</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {departments.map((department) => {
                    const selected = selectedDepartmentIds.includes(department.id);
                    return (
                      <button
                        key={department.id}
                        type="button"
                        disabled={Boolean(options?.department_locked)}
                        onClick={() => toggleDepartment(department.id)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${selected ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300'} ${options?.department_locked ? 'cursor-not-allowed opacity-80' : ''}`}
                      >
                        {department.code} - {department.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800">Attachment</h3>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(event) => setAttachment(event.target.files?.[0] || null)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </section>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Publish
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  resetCreateForm();
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => toggleTab('all')} className={`rounded-full px-4 py-1.5 text-sm font-medium ${activeTab === 'all' ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>
            All
          </button>
          <button type="button" onClick={() => toggleTab('unread')} className={`rounded-full px-4 py-1.5 text-sm font-medium ${activeTab === 'unread' ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>
            Unread ({unreadCount})
          </button>
          {showSentTab ? (
            <button type="button" onClick={() => toggleTab('sent')} className={`rounded-full px-4 py-1.5 text-sm font-medium ${activeTab === 'sent' ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>
              Sent ({sentAnnouncements.length})
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
            <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
            Loading announcements...
          </div>
        ) : visibleAnnouncements.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No announcements found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {visibleAnnouncements.map((announcement) => (
              <button
                key={announcement.id}
                type="button"
                onClick={() => openAnnouncement(announcement)}
                className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {getTagMeta(announcement.tag) ? (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getTagMeta(announcement.tag)?.bg} ${getTagMeta(announcement.tag)?.text} ${getTagMeta(announcement.tag)?.border}`}>
                          {getTagMeta(announcement.tag)?.label}
                        </span>
                      ) : null}
                      {!announcement.is_read && activeTab !== 'sent' ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">New</span>
                      ) : null}
                      {announcement.attachment_url ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          <FileText className="h-3 w-3" /> Attachment
                        </span>
                      ) : null}
                    </div>
                    <h3 className="truncate text-lg font-bold text-slate-900">{announcement.title}</h3>
                    <p className="line-clamp-2 text-sm text-slate-600">{announcement.content}</p>
                    {activeTab === 'sent' ? (
                      <div className="text-xs text-slate-500">{targetSummary(announcement)}</div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-start gap-3">
                    {!announcement.is_read && activeTab !== 'sent' ? (
                      <span className="mt-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]" aria-hidden />
                    ) : null}
                    {getCreatorAvatar(announcement) ? (
                      <img
                        src={getCreatorAvatar(announcement) as string}
                        alt={getCreatorName(announcement)}
                        className="h-11 w-11 rounded-full border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                        {getCreatorInitials(announcement)}
                      </div>
                    )}
                    <div className="text-right text-[11px] leading-tight text-slate-500">
                      <div className="font-semibold text-slate-800">{getCreatorName(announcement)}</div>
                      <div>{formatAnnouncementDate(announcement.created_at)}</div>
                      {announcement.expiry_date ? (
                        <div className="text-[10px] text-slate-500">{formatExpiryRelative(announcement.expiry_date)}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedAnnouncement ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-slate-900">{selectedAnnouncement.title}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  By {selectedAnnouncement.created_by_label || selectedAnnouncement.created_by_name} &bull; {formatAnnouncementDate(selectedAnnouncement.created_at)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{targetSummary(selectedAnnouncement)}</p>
              </div>
              <button type="button" onClick={() => setSelectedAnnouncement(null)} className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selectedAnnouncement.content}</p>

                {announcementReaders[selectedAnnouncement.id] ? (
                  <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                      <span>Views</span>
                      <span className="text-xs text-slate-500">{targetSummary(selectedAnnouncement)}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      {(() => {
                        const rolesPresent = new Set(
                          announcementReaders[selectedAnnouncement.id]
                            .map((reader) => (reader.role || '').toUpperCase())
                            .filter((r) => r),
                        );
                        const options: Array<'ALL' | 'HOD' | 'STAFF' | 'STUDENT'> = ['ALL'];
                        if (rolesPresent.has('HOD')) options.push('HOD');
                        if (rolesPresent.has('STAFF')) options.push('STAFF');
                        if (rolesPresent.has('STUDENT')) options.push('STUDENT');

                        return options.map((role) => {
                          const active = readerRoleFilter === role;
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => setReaderRoleFilter(role)}
                              className={`rounded-full border px-3 py-1 font-semibold transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300'}`}
                            >
                              {role === 'ALL' ? 'All' : roleLabel(role)}
                            </button>
                          );
                        });
                      })()}
                    </div>

                    {announcementReaders[selectedAnnouncement.id].filter((reader) => readerRoleFilter === 'ALL' || (reader.role || '').toUpperCase() === readerRoleFilter).length === 0 ? (
                      <p className="text-xs text-slate-500">No views yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                        {announcementReaders[selectedAnnouncement.id]
                          .filter((reader) => readerRoleFilter === 'ALL' || (reader.role || '').toUpperCase() === readerRoleFilter)
                          .map((reader) => (
                            <div key={reader.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-slate-700">
                              <div className="font-semibold text-slate-800">{reader.full_name || reader.username}</div>
                              <div className="text-right text-slate-500">{formatAnnouncementDate(reader.read_at)}</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </section>
                ) : null}

              {selectedAnnouncement.attachment_url ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <FileText className="h-4 w-4" />
                      <span>Attachment</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={selectedAnnouncement.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </a>
                      <a
                        href={selectedAnnouncement.attachment_url}
                        download
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition hover:bg-blue-700"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  </div>

                  {isImageUrl(selectedAnnouncement.attachment_url) ? (
                    <img src={selectedAnnouncement.attachment_url} alt="Announcement attachment" className="max-h-80 w-full rounded-lg border border-slate-200 bg-white object-contain" />
                  ) : null}

                  {isPdfAttachment(selectedAnnouncement.attachment_url) ? (
                    <p className="text-xs text-slate-500">PDF preview available through View.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
