/**
 * Visual Admin URLs Page
 * Manage Power BI URL assignments for Staff, Students, HOCs, Principal
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, ChevronDown, ChevronUp, Link2, Check, X, Download,
  Upload, User, Users, AlertCircle, ExternalLink, FileText,
  BookOpen, Phone,
} from 'lucide-react';
import {
  fetchVAStaffList, fetchVAStaffDetail, saveVAStaffLink, fetchVAUsers,
  type VAStaffRow, type VAStaffDetail, type VACourseRow, type VAUser,
} from '../../services/visualAdmin';
import { getApiBase } from '../../services/apiBase';

type Tab = 'students' | 'staff' | 'hocs' | 'principal';

const TABS: { key: Tab; label: string }[] = [
  { key: 'staff', label: 'Staff' },
  { key: 'students', label: 'Students' },
  { key: 'hocs', label: 'HOCs' },
  { key: 'principal', label: 'Principal' },
];

export default function VisualAdminURLsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('staff');
  const [contactPopupOpen, setContactPopupOpen] = useState(false);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Link2 size={26} className="text-indigo-600" />
            URL Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure Power BI dashboard links for each faculty and role
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportImportButtons />
          <button
            onClick={() => setContactPopupOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
          >
            <Phone size={15} />
            Contact the Incharge
          </button>
        </div>
      </div>

      {/* Top Tab Slider */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-[100px] px-5 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'staff' && <StaffTab />}
      {activeTab === 'students' && (
        <ComingSoon label="Student URL management is under development." />
      )}
      {activeTab === 'hocs' && (
        <ComingSoon label="HOC URL management is under development." />
      )}
      {activeTab === 'principal' && (
        <ComingSoon label="Principal URL management is under development." />
      )}

      {/* Contact Incharge Popup */}
      {contactPopupOpen && (
        <ContactInchargePopup onClose={() => setContactPopupOpen(false)} />
      )}
    </div>
  );
}

/* ─────────────────────── Staff Tab ─────────────────────── */

function StaffTab() {
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [rows, setRows] = useState<VAStaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQ(query), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  useEffect(() => {
    setLoading(true);
    fetchVAStaffList(debouncedQ)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [debouncedQ]);

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search staff by name or staff ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">
            Searching…
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_3fr] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <span>Faculty Name</span>
          <span className="text-center">Course Links</span>
          <span>Power BI URL</span>
        </div>

        {rows.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No staff found. Try a different search.
          </div>
        )}

        {rows.map((row) => (
          <StaffRow
            key={row.staff_id}
            row={row}
            expanded={expandedStaff === row.staff_id}
            onToggle={() =>
              setExpandedStaff((prev) => (prev === row.staff_id ? null : row.staff_id))
            }
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── Staff Row ─────────────────────── */

function StaffRow({
  row,
  expanded,
  onToggle,
}: {
  row: VAStaffRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [detail, setDetail] = useState<VAStaffDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [overallUrl, setOverallUrl] = useState(row.overall_url);
  const [useCourseUrls, setUseCourseUrls] = useState(row.use_course_urls);
  const [courseUrls, setCourseUrls] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load detail on expand
  useEffect(() => {
    if (!expanded) return;
    if (detail) return;
    setLoadingDetail(true);
    fetchVAStaffDetail(row.staff_id)
      .then((d) => {
        setDetail(d);
        setOverallUrl(d.overall_url);
        setUseCourseUrls(d.use_course_urls);
        const map: Record<number, string> = {};
        d.courses.forEach((c) => { map[c.ta_id] = c.url; });
        setCourseUrls(map);
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [expanded, row.staff_id, detail]);

  const handleSave = async () => {
    setSaving(true);
    const courseLinks = Object.entries(courseUrls).map(([ta_id, url]) => ({
      ta_id: Number(ta_id),
      url,
    }));
    try {
      await saveVAStaffLink(row.staff_id, {
        overall_url: overallUrl,
        use_course_urls: useCourseUrls,
        course_links: courseLinks,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // handled silently
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Main row */}
      <div className="grid grid-cols-[2fr_1fr_3fr] gap-0 px-4 py-3 items-center hover:bg-gray-50 transition-colors">
        {/* Faculty name */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className={`flex-shrink-0 w-5 h-5 rounded border transition-colors flex items-center justify-center ${
              useCourseUrls
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-gray-300 bg-white'
            }`}
            title={useCourseUrls ? 'Per-course URLs enabled' : 'Enable per-course URLs'}
          >
            {useCourseUrls && <Check size={12} />}
          </button>
          <div>
            <p className="text-sm font-medium text-gray-900">{row.name}</p>
            <p className="text-xs text-gray-400">{row.staff_id} · {row.department}</p>
          </div>
          <button
            onClick={onToggle}
            className="ml-2 text-gray-400 hover:text-gray-600"
            title="Expand / collapse course links"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Checkbox indicator */}
        <div className="flex justify-center">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
              useCourseUrls
                ? 'bg-indigo-100 text-indigo-700'
                : overallUrl
                ? 'bg-green-100 text-green-700'
                : 'bg-orange-100 text-orange-600'
            }`}
          >
            {useCourseUrls ? 'Per-course' : overallUrl ? 'Overall' : 'None'}
          </span>
        </div>

        {/* Overall URL input */}
        <div className="flex items-center gap-2">
          <input
            type="url"
            placeholder="Paste Power BI URL here…"
            value={overallUrl}
            onChange={(e) => setOverallUrl(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-gray-50"
          />
          {overallUrl && (
            <a href={overallUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-600">
              <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {saving ? '…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Expanded: per-course links */}
      {expanded && (
        <div className="bg-indigo-50 border-t border-indigo-100 px-6 py-4">
          {loadingDetail ? (
            <p className="text-sm text-gray-400 animate-pulse">Loading courses…</p>
          ) : detail && detail.courses.length === 0 ? (
            <p className="text-sm text-gray-500">No teaching assignments found for this staff.</p>
          ) : detail ? (
            <>
              {/* Toggle switch */}
              <div className="flex items-center gap-3 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => setUseCourseUrls((v) => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      useCourseUrls ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        useCourseUrls ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    Use per-course links
                  </span>
                </label>
                <span className="text-xs text-gray-400">
                  {useCourseUrls
                    ? 'Each course can have its own Power BI URL'
                    : 'All courses use the overall URL above'}
                </span>
              </div>

              {/* Course table */}
              <div className="rounded-lg overflow-hidden border border-indigo-200">
                <table className="w-full text-sm">
                  <thead className="bg-indigo-100 text-indigo-700 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Course</th>
                      <th className="px-4 py-2 text-left">Section</th>
                      <th className="px-4 py-2 text-left">Department</th>
                      <th className="px-4 py-2 text-left w-64">Power BI URL</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {detail.courses.map((course) => (
                      <CourseRow
                        key={course.ta_id}
                        course={course}
                        url={courseUrls[course.ta_id] ?? ''}
                        onChange={(url) =>
                          setCourseUrls((prev) => ({ ...prev, [course.ta_id]: url }))
                        }
                        disabled={!useCourseUrls}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    saved
                      ? 'bg-green-500 text-white'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save All Changes'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Course Row ─────────────────────── */

function CourseRow({
  course,
  url,
  onChange,
  disabled,
}: {
  course: VACourseRow;
  url: string;
  onChange: (url: string) => void;
  disabled: boolean;
}) {
  return (
    <tr className={disabled ? 'opacity-40' : ''}>
      <td className="px-4 py-2.5">
        <p className="font-medium text-gray-900">{course.course_code}</p>
        <p className="text-xs text-gray-400">{course.course_name}</p>
      </td>
      <td className="px-4 py-2.5 text-gray-600 text-xs">{course.section || '—'}</td>
      <td className="px-4 py-2.5 text-gray-600 text-xs">{course.department || '—'}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input
            type="url"
            placeholder="Paste URL…"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          {url && !disabled && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-600 flex-shrink-0">
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─────────────────────── Export / Import ─────────────────────── */

function ExportImportButtons() {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const API_BASE = getApiBase();

  const handleExport = (format: 'excel' | 'pdf') => {
    setShowExportMenu(false);
    const token = localStorage.getItem('access') || '';
    const url = `${API_BASE}/api/academic-v2/visual-admin/export/?export_format=${format}`;
    // Use a hidden link approach with auth header via fetch
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Export failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `visual_admin_links.${format === 'excel' ? 'xlsx' : 'pdf'}`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert('Export failed: ' + err.message));
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('access') || '';
    fetch(`${API_BASE}/api/academic-v2/visual-admin/import/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as any).detail || 'Import failed');
        const msg = (data as any).message || 'Import successful';
        alert(msg);
        window.location.reload();
      })
      .catch((err) => alert('Import error: ' + err.message))
      .finally(() => setImporting(false));
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-2">
      {/* Export */}
      <div className="relative">
        <button
          onClick={() => setShowExportMenu((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <Download size={15} />
          Export
          <ChevronDown size={13} />
        </button>
        {showExportMenu && (
          <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px]">
            <button
              onClick={() => handleExport('excel')}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <FileText size={14} className="text-green-600" /> Excel (.xlsx)
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <FileText size={14} className="text-red-500" /> PDF
            </button>
          </div>
        )}
      </div>

      {/* Import */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        <Upload size={15} />
        {importing ? 'Importing…' : 'Import'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleImport}
      />
    </div>
  );
}

/* ─────────────────────── Contact Incharge Popup ─────────────────────── */

function ContactInchargePopup({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<VAUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<VAUser | null>(null);
  const API_BASE = getApiBase();

  useEffect(() => {
    fetchVAUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const resolveProfileImage = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE}/media/${path.replace(/^\/+/, '')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Users size={18} className="text-indigo-500" />
            Visual Admin Incharges
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-gray-400 text-sm animate-pulse text-center py-6">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">
              No Visual Admin users found.
            </p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {u.profile_image ? (
                      <img
                        src={resolveProfileImage(u.profile_image)}
                        alt={u.name}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-sm">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.department || u.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUser(u)}
                    className="text-xs text-indigo-600 font-medium hover:underline"
                  >
                    View Profile
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Profile card overlay */}
      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/40 z-60 flex items-center justify-center p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800">Profile Details</h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <ProfileCard user={selectedUser} resolveImage={resolveProfileImage} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Profile Card ─────────────────────── */

function ProfileCard({
  user,
  resolveImage,
}: {
  user: VAUser;
  resolveImage: (s: string) => string;
}) {
  return (
    <div className="p-6">
      <div className="flex items-start gap-5">
        {/* Avatar */}
        {user.profile_image ? (
          <img
            src={resolveImage(user.profile_image)}
            alt={user.name}
            className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-200 flex-shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-2xl flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-gray-900 mb-1">{user.name}</h3>
          {user.designation && (
            <p className="text-sm text-indigo-600 font-medium mb-2">{user.designation}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {user.department && (
              <InfoChip label="Department" value={user.department} />
            )}
            <InfoChip label="Email" value={user.email} />
            {user.roles.length > 0 && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-1">Roles</p>
                <div className="flex flex-wrap gap-1.5">
                  {user.roles.map((r) => (
                    <span
                      key={r}
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium truncate">{value}</p>
    </div>
  );
}

/* ─────────────────────── Placeholder ─────────────────────── */

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
      <BookOpen size={36} className="mx-auto text-gray-300 mb-3" />
      <p className="text-gray-500 text-sm">{label}</p>
    </div>
  );
}
