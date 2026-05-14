import React, { useMemo } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';

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

export default function FacultyCourseDashboard({ courseInfo }: { courseInfo: CourseInfoLike }) {
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
