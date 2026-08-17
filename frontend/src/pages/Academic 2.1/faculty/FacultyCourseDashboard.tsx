import React, { useMemo, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, PhoneCall } from 'lucide-react';
import { fetchVAMyLink, fetchVAUsers, type VAMyLink, type VAUser } from '../../../services/visualAdmin';
import { getApiBase } from '../../../services/apiBase';

interface CourseInfoLike {
  id: string | number;
  course_code: string;
  course_name: string;
  class_name: string;
  section: string;
  semester: number;
  department: string;
  student_count: number;
  qp_type: string | null;
  class_type: { name: string; total_internal_marks: number };
}

function buildPowerBiFilter(table: string, fields: { courseCode: string; section: string; sem: string; qpType: string }, values: { courseCode: string; section: string; sem: string; qpType: string }) {
  const escapeValue = (value: string) => value.replaceAll("'", "''");
  const clauses: string[] = [];

  if (values.courseCode) {
    clauses.push(`${table}/${fields.courseCode} eq '${escapeValue(values.courseCode)}'`);
  }
  if (values.section) {
    clauses.push(`${table}/${fields.section} eq '${escapeValue(values.section)}'`);
  }
  if (values.sem) {
    const semNum = Number(values.sem);
    if (Number.isFinite(semNum)) {
      clauses.push(`${table}/${fields.sem} eq ${semNum}`);
    } else {
      clauses.push(`${table}/${fields.sem} eq '${escapeValue(values.sem)}'`);
    }
  }
  if (values.qpType) {
    clauses.push(`${table}/${fields.qpType} eq '${escapeValue(values.qpType)}'`);
  }

  return clauses.join(' and ');
}

export default function FacultyCourseDashboard({
  courseInfo,
  taId,
}: {
  courseInfo: CourseInfoLike;
  taId?: number;
}) {
  // Visual Admin link takes priority over env-based URL
  const [vaLink, setVaLink] = useState<VAMyLink | null>(null);
  const [vaLoading, setVaLoading] = useState(!!taId);
  const [contactPopupOpen, setContactPopupOpen] = useState(false);

  useEffect(() => {
    if (!taId) { setVaLoading(false); return; }
    fetchVAMyLink(taId)
      .then(setVaLink)
      .catch(() => setVaLink({ url: '', source: 'none' }))
      .finally(() => setVaLoading(false));
  }, [taId]);

  const baseEmbedUrl = (import.meta.env as any).VITE_POWERBI_EMBED_URL as string | undefined;
  const filterTable = ((import.meta.env as any).VITE_POWERBI_FILTER_TABLE as string | undefined) || 'course_dashboard';
  const fieldCourseCode = ((import.meta.env as any).VITE_POWERBI_FILTER_COURSE_CODE_FIELD as string | undefined) || 'course_code';
  const fieldSection = ((import.meta.env as any).VITE_POWERBI_FILTER_SECTION_FIELD as string | undefined) || 'section';
  const fieldSem = ((import.meta.env as any).VITE_POWERBI_FILTER_SEMESTER_FIELD as string | undefined) || 'sem';
  const fieldQpType = ((import.meta.env as any).VITE_POWERBI_FILTER_QP_TYPE_FIELD as string | undefined) || 'qp_type';

  const resolvedEmbedUrl = useMemo(() => {
    if (!baseEmbedUrl || !courseInfo) return '';

    const replacements: Record<string, string> = {
      course_id: String(courseInfo.id || ''),
      course_code: String(courseInfo.course_code || ''),
      course_name: String(courseInfo.course_name || ''),
      section: String(courseInfo.section || ''),
      semester: String(courseInfo.semester ?? ''),
      sem: String(courseInfo.semester ?? ''),
      qp_type: String(courseInfo.qp_type || ''),
      class_type: String(courseInfo.class_type?.name || ''),
      department: String(courseInfo.department || ''),
    };

    let nextUrl = baseEmbedUrl;
    for (const [key, value] of Object.entries(replacements)) {
      nextUrl = nextUrl.replaceAll(`{${key}}`, encodeURIComponent(value));
    }

    const filterExpr = buildPowerBiFilter(
      filterTable,
      {
        courseCode: fieldCourseCode,
        section: fieldSection,
        sem: fieldSem,
        qpType: fieldQpType,
      },
      {
        courseCode: replacements.course_code,
        section: replacements.section,
        sem: replacements.sem,
        qpType: replacements.qp_type,
      },
    );

    try {
      const url = new URL(nextUrl);

      if (filterExpr) {
        const existingFilter = url.searchParams.get('filter');
        const merged = existingFilter ? `(${existingFilter}) and ${filterExpr}` : filterExpr;
        url.searchParams.set('filter', merged);
      }

      // Keep basic params too in case report/page uses URL-bound fields/slicers.
      url.searchParams.set('course_code', replacements.course_code);
      url.searchParams.set('section', replacements.section);
      url.searchParams.set('sem', replacements.sem);
      if (replacements.qp_type) url.searchParams.set('qp_type', replacements.qp_type);

      return url.toString();
    } catch {
      return nextUrl;
    }
  }, [
    baseEmbedUrl,
    filterTable,
    fieldCourseCode,
    fieldSection,
    fieldSem,
    fieldQpType,
    courseInfo,
  ]);

  if (vaLoading) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-gray-400 animate-pulse">
        Loading dashboard…
      </div>
    );
  }

  // VA link configured → use it directly (no env filters applied)
  if (vaLink && vaLink.url) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Power BI dashboard for {courseInfo.course_code} | Section {courseInfo.section}
          </div>
          <a
            href={vaLink.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-800"
          >
            Open in Power BI <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <iframe
            title="Faculty Course Power BI Dashboard"
            src={vaLink.url}
            className="w-full h-[78vh]"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  // VA link was checked but none configured → show "contact visual admin"
  if (taId && vaLink && vaLink.source === 'none') {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
          <PhoneCall size={28} className="text-orange-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Dashboard Not Configured</h3>
        <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
          Your Power BI dashboard link has not been set up yet. Please contact the Visual Admin incharge.
        </p>
        <button
          onClick={() => setContactPopupOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <PhoneCall size={16} />
          Contact Visual Admin
        </button>
        {contactPopupOpen && (
          <VisualAdminContactPopup onClose={() => setContactPopupOpen(false)} />
        )}
      </div>
    );
  }

  if (!resolvedEmbedUrl) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-gray-500">
        <p className="font-medium">Power BI dashboard is not configured.</p>
        <p className="text-sm text-gray-400 mt-2">
          Set VITE_POWERBI_EMBED_URL in frontend env.
        </p>
      </div>
    );
  }

  const looksLikePublicView = resolvedEmbedUrl.includes('app.powerbi.com/view?');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          Showing Power BI for {courseInfo.course_code} | Section {courseInfo.section} | Sem {courseInfo.semester}
        </div>
        <a
          href={resolvedEmbedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-800"
        >
          Open in Power BI <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {looksLikePublicView && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <span>
            You are using a public view link. If filters are not strict, switch to reportEmbed URL for stronger auto-filter behavior.
          </span>
        </div>
      )}

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <iframe
          title="Faculty Course Power BI Dashboard"
          src={resolvedEmbedUrl}
          className="w-full h-[78vh]"
          allowFullScreen
        />
      </div>
    </div>
  );
}

/* ──────────────── Visual Admin Contact Popup ──────────────── */

function VisualAdminContactPopup({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<VAUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VAUser | null>(null);
  const API_BASE = getApiBase();

  useEffect(() => {
    fetchVAUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const resolveImage = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE}/media/${path.replace(/^\/+/, '')}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Visual Admin Incharges</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-6 animate-pulse">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-6">No Visual Admin contacts found.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    {u.profile_image ? (
                      <img src={resolveImage(u.profile_image)} alt={u.name} className="w-9 h-9 rounded-full object-cover border" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                        {u.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.department || u.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(u)}
                    className="text-xs text-indigo-600 hover:underline font-medium"
                  >
                    View Profile
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-60 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="float-right text-gray-400 hover:text-gray-600 text-xl">×</button>
            <div className="flex items-start gap-4 mt-1">
              {selected.profile_image ? (
                <img src={resolveImage(selected.profile_image)} alt={selected.name} className="w-16 h-16 rounded-xl object-cover border" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600">
                  {selected.name.charAt(0)}
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selected.name}</h3>
                {selected.designation && <p className="text-sm text-indigo-600">{selected.designation}</p>}
                {selected.department && <p className="text-sm text-gray-500">{selected.department}</p>}
                <p className="text-sm text-gray-500 mt-1">{selected.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selected.roles.map((r) => (
                    <span key={r} className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">{r}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
