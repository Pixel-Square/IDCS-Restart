import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import CDAPPage from './lca/CDAPPage';
import ArticulationMatrixPage from './lca/ArticulationMatrixPage';
import MarkEntryPage from './MarkEntryPage';
import LCAInstructionsPage from './lca/LCAInstructionsPage';
import COAttainmentPage from './COAttainmentPage';
import CQIPage from './CQIPage';
import LCAPage from './lca/LCAPage';
import InternalMarkCoursePage from './InternalMarkCoursePage';
import ResultAnalysisPage from './obe/ResultAnalysisPage';
import { fetchMyTeachingAssignments } from '../services/obe';
import { fetchDeptRows, fetchElectives } from '../services/curriculum';
import { fetchSpecialCourseEnabledAssessments } from '../services/obe';
import { normalizeClassType } from '../constants/classTypes';
import '../styles/obe-theme.css';

type TabKey = 'marks' | 'lca_instructions' | 'internal_mark' | 'result_analysis';

export default function CourseOBEPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // All hooks MUST be called before any conditional returns (Rules of Hooks).
  const courseId = code ? decodeURIComponent(code) : '';

  const [activeTab, setActiveTab] = React.useState<TabKey>(() => {
    // default to 'marks'
    return 'marks';
  });
  const [courseName, setCourseName] = React.useState<string | null>(null);
  const [courseClassType, setCourseClassType] = React.useState<string | null>(null);
  const [classTypeLockedFromTA, setClassTypeLockedFromTA] = React.useState(false);
  const [courseQpType, setCourseQpType] = React.useState<string>(() => {
    if (!courseId) return 'QP1';
    try {
      const stored = localStorage.getItem(`obe_course_qp_${courseId}`);
      const v = String(stored || '').trim().toUpperCase();
      return v === 'QP2' || v === 'TCPR' ? v : 'QP1';
    } catch {
      return 'QP1';
    }
  });
  const [courseEnabledAssessments, setCourseEnabledAssessments] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    // Derive active tab from the current pathname so direct URLs open correct tab
    if (!location || !location.pathname) return;
    const path = location.pathname.toLowerCase();
    // Prefer an explicit instructions path if present
    if (path.includes('/lca/instructions') || path.includes('/lca_instructions')) setActiveTab('lca_instructions');
    // legacy URLs: keep working but route through LCA Instructions
    else if (path.includes('/lca') || path.includes('/cdap') || path.includes('/articulation')) setActiveTab('lca_instructions');
    else if (path.includes('/marks')) setActiveTab('marks');
    else if (path.includes('/internal_mark') || path.includes('/internal-mark')) setActiveTab('internal_mark');
    else if (path.includes('/result_analysis') || path.includes('/result-analysis') || path.includes('/result')) setActiveTab('result_analysis');
    else setActiveTab('marks');
  }, [location]);

  const lcaInitialTab = React.useMemo(() => {
    const path = String(location?.pathname || '').toLowerCase();
    if (path.includes('/cdap')) return 'cdap' as const;
    if (path.includes('/articulation')) return 'articulation' as const;
    if (path.includes('/lca') && !(path.includes('/lca/instructions') || path.includes('/lca_instructions'))) return 'lca' as const;
    return 'instructions' as const;
  }, [location?.pathname]);

  React.useEffect(() => {
    if (!courseId) return;
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
    if (!courseId) return;
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
        if (ov === 'QP1' || ov === 'QP2' || ov === 'TCPR') {
          setCourseQpType(ov);
        } else {
          const qp = String((pick as any)?.question_paper_type || '').trim().toUpperCase();
          setCourseQpType(qp === 'QP2' || qp === 'TCPR' ? qp : 'QP1');
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

  if (!code) {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="obe-card">
            <p className="obe-small-muted">No course selected.</p>
            <div className="mt-4">
              <button onClick={() => navigate('/obe')} className="obe-btn obe-btn-primary">Back</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const classTypeLabel = courseClassType
    ? String(courseClassType).toLowerCase()[0].toUpperCase() + String(courseClassType).toLowerCase().slice(1)
    : '';

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full min-w-0">
          <div className="obe-card mb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                  {courseId}
                </h2>
                {courseName ? (
                  <div className="mt-2 text-lg font-bold text-gray-900 truncate">{courseName}</div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {courseClassType ? (
                    <span className="obe-pill obe-neutral-pill">
                      Class type: <span className="ml-1 font-extrabold">{classTypeLabel}</span>
                    </span>
                  ) : null}

                  <span className="obe-pill obe-neutral-pill">
                    QP Type:
                    <select
                      className="ml-2 obe-input"
                      value={(() => {
                        const current = String(courseQpType || 'QP1').trim().toUpperCase();
                        return current === 'QP2' || current === 'TCPR' ? current : 'QP1';
                      })()}
                      onChange={(e) => {
                        const v = String(e.target.value || '').trim().toUpperCase();
                        const next = v === 'QP2' || v === 'TCPR' ? v : 'QP1';
                        setCourseQpType(next);
                        try {
                          localStorage.setItem(`obe_course_qp_${courseId}`, next);
                        } catch {
                          // ignore
                        }
                      }}
                      style={{ width: 84, paddingTop: 6, paddingBottom: 6 }}
                      aria-label="Question paper type"
                    >
                      <option value="QP1">QP1</option>
                      <option value="QP2">QP2</option>
                      <option value="TCPR">TCPR</option>
                    </select>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => navigate('/obe')} className="obe-btn">
                  ← Back to courses
                </button>
              </div>
            </div>
          </div>

          <div className="obe-tab-nav" aria-label="OBE Tabs">
            {[
              { key: 'lca_instructions', label: 'Learner Centric Approach' },
              { key: 'marks', label: 'Mark Entry' },
              { key: 'internal_mark', label: 'Internal Mark' },
              { key: 'result_analysis', label: 'Result Analysis' },
            ].map((t) => {
              const isActive = activeTab === (t.key as TabKey);
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`obe-tab-btn${isActive ? ' active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setActiveTab(t.key as TabKey);
                    if (code) {
                      const enc = encodeURIComponent(code);
                      const tabPath = t.key === 'lca_instructions' ? `lca/instructions` : String(t.key);
                      navigate(`/obe/course/${enc}/${tabPath}`);
                    }
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div>
            {activeTab === 'marks' && (
              <MarkEntryPage
                courseId={courseId}
                classType={courseClassType}
                questionPaperType={courseQpType}
                enabledAssessments={courseEnabledAssessments}
              />
            )}
            {activeTab === 'lca_instructions' && (
              <LCAInstructionsPage courseCode={courseId} courseName={courseName} initialTab={lcaInitialTab} />
            )}
            {activeTab === 'internal_mark' && (
              <InternalMarkCoursePage courseId={courseId} enabledAssessments={courseEnabledAssessments} classType={courseClassType} />
            )}
            {activeTab === 'result_analysis' && (
              <ResultAnalysisPage courseId={courseId} classType={courseClassType} enabledAssessments={courseEnabledAssessments} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
