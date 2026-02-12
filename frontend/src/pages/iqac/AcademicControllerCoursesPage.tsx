import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDeptRows, DeptRow } from '../../services/curriculum';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const dept = await fetchDeptRows();
        if (!mounted) return;
        setRows(Array.isArray(dept) ? dept : []);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setRows([]);
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

    // Department Curriculum is the source of truth for course selection.
    // Multiple departments can have rows with the same course_code; pick the best row per code.
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

      // Keep whichever has "better" metadata; ties keep existing.
      if (score(incoming) > score(existing)) map.set(code, incoming);
    }
    return Array.from(map.values()).sort((a, b) => a.course_code.localeCompare(b.course_code));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = normalize(q).toLowerCase();
    if (!needle) return courses;
    return courses.filter((c) => {
      const hay = `${c.course_code} ${c.course_name}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [courses, q]);

  if (loading) return <div style={{ color: '#6b7280' }}>Loading courses…</div>;
  if (error) return <div style={{ color: '#b91c1c' }}>{error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Courses</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Search and open a course to view sections and staff mappings.</div>
        </div>
        <div style={{ minWidth: 280 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Search</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Course code or name"
            className="obe-input"
          />
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
