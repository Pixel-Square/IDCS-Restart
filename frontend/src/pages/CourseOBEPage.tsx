import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import CDAPPage from './CDAPPage';
import ArticulationMatrixPage from './ArticulationMatrixPage';
import MarkEntryPage from './MarkEntryPage';
import LCAInstructionsPage from './LCAInstructionsPage';
import COAttainmentPage from './COAttainmentPage';
import CQIPage from './CQIPage';
import LCAPage from './LCAPage';
import InternalMarkCoursePage from './InternalMarkCoursePage';
import { fetchMyTeachingAssignments } from '../services/obe';
import { fetchDeptRows, fetchElectives } from '../services/curriculum';
import { fetchSpecialCourseEnabledAssessments } from '../services/obe';
import { normalizeClassType } from '../constants/classTypes';

type TabKey = 'marks' | 'lca_instructions' | 'co_attainment' | 'internal_mark' | 'cqi';

export default function CourseOBEPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = React.useState<TabKey>(() => {
    // default to 'marks'
    return 'marks';
  });

  React.useEffect(() => {
    // Derive active tab from the current pathname so direct URLs open correct tab
    if (!location || !location.pathname) return;
    const path = location.pathname.toLowerCase();
    // Prefer an explicit instructions path if present
    if (path.includes('/lca/instructions') || path.includes('/lca_instructions')) setActiveTab('lca_instructions');
    // legacy URLs: keep working but route through LCA Instructions
    else if (path.includes('/lca') || path.includes('/cdap') || path.includes('/articulation')) setActiveTab('lca_instructions');
    else if (path.includes('/marks')) setActiveTab('marks');
    else if (path.includes('/co_attainment')) setActiveTab('co_attainment');
    else if (path.includes('/internal_mark') || path.includes('/internal-mark')) setActiveTab('internal_mark');
    else if (path.includes('/cqi')) setActiveTab('cqi');
    else setActiveTab('marks');
  }, [location]);

  const lcaInitialTab = React.useMemo(() => {
    const path = String(location?.pathname || '').toLowerCase();
    if (path.includes('/cdap')) return 'cdap' as const;
    if (path.includes('/articulation')) return 'articulation' as const;
    if (path.includes('/lca') && !(path.includes('/lca/instructions') || path.includes('/lca_instructions'))) return 'lca' as const;
    return 'instructions' as const;
  }, [location?.pathname]);

  if (!code) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#666' }}>No course selected.</p>
        <button onClick={() => navigate('/obe')} className="obe-btn obe-btn-primary">Back</button>
      </div>
    );
  }

  const courseId = decodeURIComponent(code);
  const [courseName, setCourseName] = React.useState<string | null>(null);
  const [courseClassType, setCourseClassType] = React.useState<string | null>(null);
  const [classTypeLockedFromTA, setClassTypeLockedFromTA] = React.useState(false);
  const [courseQpType, setCourseQpType] = React.useState<string>(() => {
    try {
      const stored = localStorage.getItem(`obe_course_qp_${courseId}`);
      const v = String(stored || '').trim().toUpperCase();
      return v === 'QP2' ? 'QP2' : 'QP1';
    } catch {
      return 'QP1';
    }
  });
  const [courseEnabledAssessments, setCourseEnabledAssessments] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // reset TA lock on course change
        if (mounted) setClassTypeLockedFromTA(false);
        const list = await fetchMyTeachingAssignments();
        if (!mounted) return;
        const matches = (list || []).filter((a) => String(a.subject_code) === String(courseId));
        const any = matches[0] || null;
        if (any) setCourseName(any.subject_name || null);

        // Prefer the TA the user selected in Mark Entry (section-specific)
        let storedTaId: number | null = null;
        try {
          const raw = localStorage.getItem(`markEntry_selectedTa_${courseId}`);
          const n = raw == null ? NaN : Number(raw);
          storedTaId = Number.isFinite(n) ? n : null;
        } catch {
          storedTaId = null;
        }

        const picked =
          (storedTaId != null && matches.find((m) => Number(m.id) === Number(storedTaId))) ||
          matches.find((m) => String((m as any)?.class_type || '').trim()) ||
          any;

        const taCt = String((picked as any)?.class_type || '').trim();
        if (taCt) {
          setCourseClassType(taCt);
          setClassTypeLockedFromTA(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [courseId]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await fetchDeptRows();
        if (!mounted) return;
        const code = String(courseId);
        const codeU = code.toUpperCase();
        const matches = (rows || []).filter(
          (r) => String((r as any)?.course_code || '').trim() === code || String((r as any)?.course_code || '').trim().toUpperCase() === codeU,
        );
        const normQp = (v: any) => String(v || '').trim().toUpperCase();
        // Prefer the row that has a non-default QP type (this is what drives TCPR subtype behavior).
        const pick =
          matches.find((m) => {
            const qp = normQp((m as any)?.question_paper_type);
            return qp && qp !== 'QP1';
          }) ||
          // Otherwise pick any row with a QP type.
          matches.find((m) => normQp((m as any)?.question_paper_type)) ||
          // Fallbacks.
          matches.find((m) => String((m as any)?.class_type || '').trim()) ||
          matches[0];

        if (!classTypeLockedFromTA && pick && (pick as any).class_type) {
          const ct = String((pick as any).class_type || '').trim();
          setCourseClassType(ct || null);
        } else if (!classTypeLockedFromTA) {
          // If we couldn't find class_type on the curriculum row, check elective subjects
          try {
            const electives = await fetchElectives();
            if (!mounted) return;
            const match = (Array.isArray(electives) ? electives : (electives.results || [])).find((e: any) => String(e.course_code || '').trim().toUpperCase() === codeU);
            if (match && match.class_type) {
              setCourseClassType(String(match.class_type || '').trim() || null);
              // If elective provides enabled assessments, use them for SPECIAL handling
              if (Array.isArray(match.enabled_assessments) && match.enabled_assessments.length) {
                setCourseEnabledAssessments(match.enabled_assessments.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean));
              }
            }
          } catch (e) {
            // ignore elective fetch errors
          }
        }
        // Respect any user-selected override from localStorage.
        let override: string | null = null;
        try {
          override = localStorage.getItem(`obe_course_qp_${courseId}`);
        } catch {
          override = null;
        }
        const ov = String(override || '').trim().toUpperCase();
        if (ov === 'QP1' || ov === 'QP2') {
          setCourseQpType(ov);
        } else {
          const qp = String((pick as any)?.question_paper_type || '').trim().toUpperCase();
          setCourseQpType(qp === 'QP2' ? 'QP2' : 'QP1');
        }

        if (normalizeClassType((pick as any)?.class_type) === 'SPECIAL') {
          // Signal SPECIAL immediately to avoid intermediate non-SPECIAL fetches.
          setCourseEnabledAssessments([]);
          try {
            const ea = await fetchSpecialCourseEnabledAssessments(code);
            setCourseEnabledAssessments(Array.isArray(ea) ? ea : []);
          } catch {
            const ea = (pick as any)?.enabled_assessments;
            setCourseEnabledAssessments(Array.isArray(ea) ? ea.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean) : []);
          }
        } else {
          setCourseEnabledAssessments(null);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [courseId]);

  return (
    <main className="obe-course-page" style={{ padding: '32px 48px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ marginBottom: 24, background: '#fff', padding: '28px 32px', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>OBE - {courseId}</h2>
                <div style={{ color: '#64748b', marginTop: 8, fontSize: 16 }}>Course OBE workspace</div>
                {courseName && (
                  <div style={{ color: '#1e293b', marginTop: 12, fontWeight: 700, fontSize: 20 }}>{courseName}</div>
                )}
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {courseClassType && (
                    <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '6px 14px', borderRadius: 8, fontWeight: 600, fontSize: 14, border: '1px solid #bfdbfe' }}>
                      📚 Class type: <strong>{String(courseClassType).toLowerCase()[0].toUpperCase() + String(courseClassType).toLowerCase().slice(1)}</strong>
                    </div>
                  )}
                  <div style={{ background: '#f8fafc', color: '#475569', padding: '6px 14px', borderRadius: 8, fontWeight: 600, fontSize: 14, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📄 QP Type:</span>
                    <select
                      value={String(courseQpType || 'QP1').trim().toUpperCase() === 'QP2' ? 'QP2' : 'QP1'}
                      onChange={(e) => {
                        const v = String(e.target.value || '').trim().toUpperCase();
                        const next = v === 'QP2' ? 'QP2' : 'QP1';
                        setCourseQpType(next);
                        try {
                          localStorage.setItem(`obe_course_qp_${courseId}`, next);
                        } catch {
                          // ignore
                        }
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#0f172a',
                        background: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="QP1">QP1</option>
                      <option value="QP2">QP2</option>
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <button 
                  onClick={() => navigate('/obe')} 
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 15,
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  ← Back to courses
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: '#fff', padding: '8px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flexWrap: 'wrap' }} aria-label="OBE Tabs">
            {[
              { key: 'lca_instructions', label: '📚 LCA Instructions', icon: '📚' },
              { key: 'marks', label: '✍️ Mark Entry', icon: '✍️' },
              { key: 'co_attainment', label: '📊 CO Attainment', icon: '📊' },
              { key: 'cqi', label: '🎯 CQI', icon: '🎯' },
              { key: 'internal_mark', label: '📈 Internal Mark', icon: '📈' },
            ].map((t) => {
              const isActive = activeTab === (t.key as TabKey);
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setActiveTab(t.key as TabKey);
                    // navigate to a URL so the tab can be opened directly and bookmarked
                    if (code) {
                      const enc = encodeURIComponent(code);
                      // use a clearer path for instructions tab
                      const tabPath = t.key === 'lca_instructions' ? `lca/instructions` : String(t.key);
                      navigate(`/obe/course/${enc}/${tabPath}`);
                    }
                  }}
                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; e.currentTarget.style.color = '#3b82f6'; } }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; } }}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: isActive ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                    color: isActive ? '#fff' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: 15,
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? '0 2px 8px rgba(37,99,235,0.2)' : 'none'
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div>
            {activeTab === 'marks' && <MarkEntryPage courseId={courseId} classType={courseClassType} questionPaperType={courseQpType} enabledAssessments={courseEnabledAssessments} />}
            {activeTab === 'lca_instructions' && <LCAInstructionsPage courseCode={courseId} courseName={courseName} initialTab={lcaInitialTab} />}
            {activeTab === 'co_attainment' && <COAttainmentPage courseId={courseId} enabledAssessments={courseEnabledAssessments} classType={courseClassType} />}
            {activeTab === 'internal_mark' && <InternalMarkCoursePage courseId={courseId} enabledAssessments={courseEnabledAssessments} />}
            {activeTab === 'cqi' && <CQIPage courseId={courseId} />}
          </div>
      </div>
    </main>
  );
}
