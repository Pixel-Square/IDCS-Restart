import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchIQACCourseTeachingMap, IQACTeachingMapRow } from '../../services/academics';
import { fetchDeptRows, DeptRow } from '../../services/curriculum';
import { iqacResetAssessment, DraftAssessmentKey } from '../../services/obe';
import { clearLocalDraftCache } from '../../utils/obeDraftCache';

export default function AcademicControllerCoursePage(): JSX.Element {
  const { courseCode } = useParams<{ courseCode: string }>();
  const navigate = useNavigate();

  const code = useMemo(() => decodeURIComponent(String(courseCode || '')).trim(), [courseCode]);
  const [rows, setRows] = useState<IQACTeachingMapRow[]>([]);
  const [deptRows, setDeptRows] = useState<DeptRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!code) return;
      try {
        const [r, drows] = await Promise.all([fetchIQACCourseTeachingMap(code), fetchDeptRows()]);
        if (!mounted) return;
        setRows(Array.isArray(r) ? r : []);
        setDeptRows(Array.isArray(drows) ? drows : []);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setRows([]);
        setError(e?.message || 'Failed to load course mapping');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [code]);

  const title = rows[0]?.course_name || code;

  const grouped = useMemo(() => {
    const map = new Map<string, { section_name: string; academic_year: string | null; items: IQACTeachingMapRow[] }>();
    for (const r of rows || []) {
      const sectionName = String((r as any)?.section_name || '').trim() || 'Section';
      const ay = (r as any)?.academic_year ? String((r as any).academic_year) : null;
      const key = `${sectionName}__${ay || ''}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(r);
      } else {
        map.set(key, { section_name: sectionName, academic_year: ay, items: [r] });
      }
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      const s = a.section_name.localeCompare(b.section_name);
      if (s !== 0) return s;
      return String(a.academic_year || '').localeCompare(String(b.academic_year || ''));
    });
    for (const g of groups) {
      g.items.sort((a, b) => {
        const aName = String(a.staff?.name || a.staff?.username || '').trim();
        const bName = String(b.staff?.name || b.staff?.username || '').trim();
        return aName.localeCompare(bName);
      });
    }
    return groups;
  }, [rows]);

  async function resetCourseForTeachingAssignment(teachingAssignmentId: number) {
    if (!teachingAssignmentId) return;
    const ok = window.confirm('Resetting this course will delete all entered exam data for this teaching assignment. This cannot be undone. Proceed?');
    if (!ok) return;
    const assessments: DraftAssessmentKey[] = ['ssa1', 'review1', 'ssa2', 'review2', 'cia1', 'cia2', 'formative1', 'formative2', 'model'];
    try {
      // sequentially reset each assessment; ignore errors for individual ones but surface at end
      for (const a of assessments) {
        try {
          // subject id here is the course code
          await iqacResetAssessment(a, code, teachingAssignmentId);

          // Clear local cached drafts too (helps IQAC verify reset immediately)
          clearLocalDraftCache(code, a);
        } catch (e) {
          // continue resetting others
          // eslint-disable-next-line no-console
          console.warn('reset assessment failed', a, e);
        }
      }
      // reload rows
      setLoading(true);
      const r = await fetchIQACCourseTeachingMap(code);
      setRows(Array.isArray(r) ? r : []);
      setError(null);
      window.alert('Reset completed.');
    } catch (e: any) {
      window.alert('Reset failed: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 18, minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{code}</h2>
          <div style={{ color: '#374151', marginTop: 6, fontWeight: 800 }}>{title}</div>
          <div style={{ color: '#6b7280', marginTop: 4 }}>Sections and staff mapping.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="obe-btn obe-btn-secondary" to={'/iqac/academic-controller?tab=courses'}>
            Back
          </Link>
          <button className="obe-btn" onClick={() => navigate(`/obe/course/${encodeURIComponent(code)}`)}>
            Open OBE (faculty view)
          </button>
        </div>
      </div>

      {loading ? <div style={{ color: '#6b7280' }}>Loading…</div> : null}
      {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}

      {!loading && !error && rows.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No active teaching assignments found for this course.</div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grouped.map((g) => (
            <div key={`${g.section_name}__${g.academic_year || ''}`} className="obe-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ fontWeight: 900, color: '#0f172a' }}>{g.section_name}</div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{g.academic_year || '—'}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                {g.items.map((r) => (
                  <div
                    key={String(r.teaching_assignment_id)}
                    style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                      <div style={{ color: '#111827', fontWeight: 800 }}>{r.staff?.name || r.staff?.username || '—'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {r.section_name ? `Section: ${r.section_name}` : ''}
                        {r.academic_year ? `  •  AY: ${r.academic_year}` : ''}
                        {(() => {
                          const dept = (deptRows || []).find((d) => String(d?.course_code || '').trim().toUpperCase() === code.toUpperCase());
                          return dept ? `  •  Dept: ${dept.department?.name || dept.department?.code || ''}  •  Sem: ${dept.semester || '—'}` : '';
                        })()}
                      </div>
                    <div style={{ marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="obe-btn obe-btn-primary"
                        onClick={() => navigate(`/iqac/academic-controller/course/${encodeURIComponent(code)}/marks/${encodeURIComponent(String(r.teaching_assignment_id))}`)}
                      >
                        Open Mark Entry
                      </button>
                      <button
                        className="obe-btn"
                        onClick={() => navigate(`/iqac/academic-controller/course/${encodeURIComponent(code)}/obe/${encodeURIComponent(String(r.teaching_assignment_id))}/marks`)}
                      >
                        Open OBE (view-only)
                      </button>
                      <button className="obe-btn" onClick={() => resetCourseForTeachingAssignment(Number(r.teaching_assignment_id))}>
                        Reset Course
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
