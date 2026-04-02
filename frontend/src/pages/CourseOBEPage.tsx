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
import { fetchDeptRows, fetchElectives, fetchQpTypes, type QuestionPaperTypeItem } from '../services/curriculum';
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
  const [courseClassType, setCourseClassType] = React.useState<string | null>(() => {
    // Cache-first: show stored value immediately while DB loads
    if (!courseId) return null;
    try {
      const v = localStorage.getItem(`obe_class_type_${courseId}`);
      return v ? String(v).trim() : null;
    } catch { return null; }
  });
  const [classTypeLockedFromTA, setClassTypeLockedFromTA] = React.useState(false);
  // courseMetaLoaded becomes true once the dept-rows DB fetch completes (success or error).
  const [courseMetaLoaded, setCourseMetaLoaded] = React.useState(false);
  const [courseQpType, setCourseQpType] = React.useState<string>(() => {
    if (!courseId) return 'QP1';
    try {
      const stored = localStorage.getItem(`obe_course_qp_${courseId}`);
      const v = String(stored || '').trim().toUpperCase();
      // Accept any non-empty stored value; fall back to QP1 for legacy 'TCPR'
      // (TCPR is a class_type, not a QP type — if stored, convert to QP1)
      return v && v !== 'TCPR' ? v : 'QP1';
    } catch {
      return 'QP1';
    }
  });

  // DB-driven QP type list from QuestionPaperType master table.
  const [qpTypes, setQpTypes] = React.useState<QuestionPaperTypeItem[]>([]);
  React.useEffect(() => {
    fetchQpTypes()
      .then((types) => {
        setQpTypes(types);
        // If current selection is no longer in the list, fall back to first available.
        if (types.length && !types.some((t) => t.code === courseQpType)) {
          setCourseQpType(types[0].code);
        }
      })
      .catch(() => setQpTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
          try { localStorage.setItem(`obe_class_type_${courseId}`, taCt); } catch {}
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
        // Helper to extract QP type from a row, checking both possible field names
        const getQpType = (row: any): string => {
          // CurriculumDepartment uses 'question_paper_type', CurriculumMaster uses 'qp_type'
          const qpt = String(row?.question_paper_type || row?.qp_type || '').trim().toUpperCase();
          return qpt;
        };
        const normQp = (v: any) => String(v || '').trim().toUpperCase();
        // Prefer the row that has a non-default QP type (this is what drives TCPR subtype behavior).
        const pick =
          matches.find((m) => {
            const qp = getQpType(m);
            return qp && qp !== 'QP1';
          }) ||
          // Otherwise pick any row with a QP type.
          matches.find((m) => getQpType(m)) ||
          // Fallbacks.
          matches.find((m) => String((m as any)?.class_type || '').trim()) ||
          matches[0];

        // Holds QP type found via elective fallback (used for courses with no CurriculumDepartment row).
        let electiveQpType = '';

        if (!classTypeLockedFromTA && pick && (pick as any).class_type) {
          const ct = String((pick as any).class_type || '').trim();
          setCourseClassType(ct || null);
          if (ct) { try { localStorage.setItem(`obe_class_type_${courseId}`, ct); } catch {} }
        } else if (!classTypeLockedFromTA) {
          // If we couldn't find class_type on the curriculum row, check elective subjects
          try {
            const electives = await fetchElectives();
            if (!mounted) return;
            const match = (Array.isArray(electives) ? electives : (electives.results || [])).find((e: any) => String(e.course_code || '').trim().toUpperCase() === codeU);
            if (match && match.class_type) {
              const ect = String(match.class_type || '').trim();
              setCourseClassType(ect || null);
              if (ect) { try { localStorage.setItem(`obe_class_type_${courseId}`, ect); } catch {} }
              // If elective provides enabled assessments, use them for SPECIAL handling
              if (Array.isArray(match.enabled_assessments) && match.enabled_assessments.length) {
                setCourseEnabledAssessments(match.enabled_assessments.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean));
              }
            }
            // Capture QP type from elective — needed when the course has no CurriculumDepartment row.
            if (match) {
              const eqp = String((match as any).question_paper_type || (match as any).qp_type || '').trim().toUpperCase();
              if (eqp && eqp !== 'TCPR') electiveQpType = eqp;
            }
          } catch (e) {
            // ignore elective fetch errors
          }
        } else if (!pick) {
          // classTypeLockedFromTA is true but no dept curriculum row found.
          // Fetch elective to get the QP type for this course.
          try {
            const electives = await fetchElectives();
            if (!mounted) return;
            const match = (Array.isArray(electives) ? electives : (electives.results || [])).find((e: any) => String(e.course_code || '').trim().toUpperCase() === codeU);
            if (match) {
              const eqp = String((match as any).question_paper_type || (match as any).qp_type || '').trim().toUpperCase();
              if (eqp && eqp !== 'TCPR') electiveQpType = eqp;
            }
          } catch {
            // ignore
          }
        }
        // DB always wins for QP type — save back to localStorage as updated cache.
        // For elective-only courses (no CurriculumDepartment row), fall back to the elective's QP type.
        {
          // Read from database: check both field names (question_paper_type from CurriculumDepartment, qp_type from CurriculumMaster)
          let qp = getQpType(pick);
          // When no dept-curriculum row was found, use the elective subject's QP type.
          if (!qp && electiveQpType) qp = electiveQpType;
          // For backward compat: TCPR stored as QP type means class_type=TCPR — use QP1 pattern.
          // If database has empty/null value, default to QP1
          const finalQp = qp && qp !== 'TCPR' ? qp : 'QP1';
          setCourseQpType(finalQp);
          try { localStorage.setItem(`obe_course_qp_${courseId}`, finalQp); } catch {}
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
        if (mounted) setCourseMetaLoaded(true);
      } catch (e) {
        // ignore
        if (mounted) setCourseMetaLoaded(true);
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
              {/* Left: course code + name */}
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                  {courseId}
                </h2>
                {courseName ? (
                  <div className="mt-1 text-base font-semibold text-gray-500 truncate">{courseName}</div>
                ) : null}
              </div>

              {/* Right: meta pills + back button — all inline */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Course Type pill */}
                {!courseMetaLoaded && !courseClassType ? (
                  <div className="obe-meta-skeleton" style={{ width: 110, height: 40 }} aria-label="Loading class type…" />
                ) : courseClassType ? (
                  <div className="obe-meta-card obe-meta-card-type" style={{ minWidth: 0, padding: '5px 12px', gap: 2 }}>
                    <span className="obe-meta-card-label" style={{ fontSize: 9, letterSpacing: '0.06em' }}>
                      Course Type
                    </span>
                    <span className="obe-meta-card-value" style={{ fontSize: 13, fontWeight: 800 }}>{classTypeLabel}</span>
                  </div>
                ) : null}

                {/* QP Type pill */}
                {!courseMetaLoaded && !courseQpType ? (
                  <div className="obe-meta-skeleton" style={{ width: 110, height: 40 }} aria-label="Loading QP type…" />
                ) : courseQpType ? (
                  <div className="obe-meta-card obe-meta-card-qp" style={{ minWidth: 0, padding: '5px 12px', gap: 2 }}>
                    <span className="obe-meta-card-label" style={{ fontSize: 9, letterSpacing: '0.06em' }}>
                      QP Type
                    </span>
                    <span className="obe-meta-card-value" style={{ fontSize: 13, fontWeight: 800 }}>
                      {String(courseQpType).trim().toUpperCase()}
                      {!courseMetaLoaded && (
                        <span className="obe-meta-card-syncing" title="Syncing from database…" />
                      )}
                    </span>
                  </div>
                ) : null}

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
              <InternalMarkCoursePage courseId={courseId} enabledAssessments={courseEnabledAssessments} classType={courseClassType} questionPaperType={courseQpType} />
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
