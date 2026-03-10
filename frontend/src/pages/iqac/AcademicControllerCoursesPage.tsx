import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDeptRows, fetchElectives, DeptRow } from '../../services/curriculum';

type CourseCard = {
  course_code: string;
  course_name: string;
  class_type?: string | null;
  question_paper_type?: string | null;
};

function normalize(s: any) {
  return String(s || '').trim();
}

export default function AcademicControllerCoursesPage(): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DeptRow[]>([]);
  const [electiveRows, setElectiveRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [semFilter, setSemFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [dept, electives] = await Promise.all([
          fetchDeptRows(),
          fetchElectives().catch(() => []),
        ]);
        if (!mounted) return;
        setRows(Array.isArray(dept) ? dept : []);
        const electiveList = Array.isArray(electives)
          ? electives
          : Array.isArray((electives as any)?.results)
          ? (electives as any).results
          : [];
        setElectiveRows(electiveList);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setRows([]);
        setElectiveRows([]);
        setError(e?.message || 'Failed to load courses');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const courses = useMemo(() => {
    const map = new Map<string, CourseCard>();

    // Department Curriculum rows
    for (const r of rows || []) {
      const code = normalize((r as any).course_code);
      if (!code) continue;

      const incoming: CourseCard = {
        course_code: code,
        course_name: normalize((r as any).course_name),
        class_type: normalize((r as any).class_type) || null,
        question_paper_type: normalize((r as any).question_paper_type) || null,
      };

      const existing = map.get(code);
      if (!existing) {
        map.set(code, incoming);
        continue;
      }

      const score = (c: CourseCard) =>
        (c.course_name ? 1 : 0) +
        (c.class_type ? 1 : 0) +
        (c.question_paper_type ? 1 : 0) +
        (String(c.question_paper_type || '').trim().toUpperCase() && String(c.question_paper_type || '').trim().toUpperCase() !== 'QP1' ? 1 : 0);

      if (score(incoming) > score(existing)) map.set(code, incoming);
    }

    // Elective subjects — merge in; don't overwrite a dept row that already provides full metadata
    for (const e of electiveRows || []) {
      const code = normalize((e as any).course_code);
      if (!code) continue;

      const incoming: CourseCard = {
        course_code: code,
        course_name: normalize((e as any).course_name),
        class_type: normalize((e as any).class_type) || 'ELECTIVE',
        question_paper_type: normalize((e as any).question_paper_type) || null,
      };

      if (!map.has(code)) {
        map.set(code, incoming);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.course_code.localeCompare(b.course_code));
  }, [rows, electiveRows]);

  // All distinct semester numbers from dept rows
  const semesters = useMemo(() => {
    const nums = Array.from(new Set(rows.map((r) => r.semester).filter(Boolean))).sort((a, b) => a - b);
    return nums;
  }, [rows]);

  // Course codes that belong to the selected semester
  const semesterCourseCodes = useMemo(() => {
    if (semFilter === 'all') return null;
    const codes = new Set(rows.filter((r) => r.semester === semFilter).map((r) => normalize((r as any).course_code)).filter(Boolean));
    return codes;
  }, [rows, semFilter]);

  const filtered = useMemo(() => {
    const needle = normalize(q).toLowerCase();
    return courses.filter((c) => {
      if (semesterCourseCodes && !semesterCourseCodes.has(c.course_code)) return false;
      if (needle) {
        const hay = `${c.course_code} ${c.course_name}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [courses, q, semesterCourseCodes]);

  if (loading) return <div style={{ color: '#6b7280' }}>Loading courses…</div>;
  if (error) return <div style={{ color: '#b91c1c' }}>{error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Courses</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Search and open a course to view sections and staff mappings.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {semesters.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Semester</div>
              <select
                value={semFilter}
                onChange={(e) => setSemFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', cursor: 'pointer', minWidth: 120 }}
              >
                <option value="all">All Semesters</option>
                {semesters.map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Course code or name"
              className="obe-input"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No courses found.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {filtered.map((c) => (
            <div key={c.course_code} className="obe-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 900, color: '#0f172a' }}>{c.course_code}</div>
              <div style={{ color: '#374151', fontWeight: 700 }}>{c.course_name || '—'}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {c.class_type ? `Class type: ${c.class_type}` : ''}{c.question_paper_type ? `  •  QP: ${c.question_paper_type}` : ''}
              </div>
              <div style={{ marginTop: 6 }}>
                <button
                  className="obe-btn obe-btn-primary"
                  onClick={() => navigate(`/iqac/academic-controller/course/${encodeURIComponent(c.course_code)}`)}
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
