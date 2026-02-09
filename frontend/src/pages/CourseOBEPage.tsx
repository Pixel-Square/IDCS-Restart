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
import { fetchDeptRows } from '../services/curriculum';
import { fetchSpecialCourseEnabledAssessments } from '../services/obe';
import { normalizeClassType } from '../constants/classTypes';

type TabKey = 'cdap' | 'articulation' | 'marks' | 'lca_instructions' | 'lca' | 'co_attainment' | 'internal_mark' | 'cqi';

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
    else if (path.includes('/lca')) setActiveTab('lca');
    else if (path.includes('/cdap')) setActiveTab('cdap');
    else if (path.includes('/articulation')) setActiveTab('articulation');
    else if (path.includes('/marks')) setActiveTab('marks');
    else if (path.includes('/co_attainment')) setActiveTab('co_attainment');
    else if (path.includes('/internal_mark') || path.includes('/internal-mark')) setActiveTab('internal_mark');
    else if (path.includes('/cqi')) setActiveTab('cqi');
    else setActiveTab('marks');
  }, [location]);

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
  const [courseQpType, setCourseQpType] = React.useState<string | null>(null);
  const [courseEnabledAssessments, setCourseEnabledAssessments] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchMyTeachingAssignments();
        if (!mounted) return;
        const found = list.find((a) => String(a.subject_code) === String(courseId));
        if (found) setCourseName(found.subject_name || null);
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

        if (pick && (pick as any).class_type) {
          const ct = String((pick as any).class_type || '').trim();
          setCourseClassType(ct || null);
        }
        const qp = String((pick as any)?.question_paper_type || '').trim();
        setCourseQpType(qp || null);

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
    <main className="obe-course-page" style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
      <div style={{ padding: '0px', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h2 style={{ margin: 0 }}>CDAP - {courseId}</h2>
                <div style={{ color: '#666', marginTop: 6 }}>Open CDAP workspace for this course</div>
                {courseName && (
                  <div style={{ color: '#222', marginTop: 6, fontWeight: 600 }}>{courseName}</div>
                )}
                {courseClassType && (
                  <div style={{ color: '#374151', marginTop: 4 }}>Class type: <strong style={{ color: '#111827' }}>{String(courseClassType).toLowerCase()[0].toUpperCase() + String(courseClassType).toLowerCase().slice(1)}</strong></div>
                )}
                {courseQpType && (
                  <div style={{ color: '#374151', marginTop: 2 }}>QP Type: <strong style={{ color: '#111827' }}>{String(courseQpType)}</strong></div>
                )}
              </div>
              <div>
                <button onClick={() => navigate('/obe')} className="obe-btn obe-btn-secondary">Back to courses</button>
              </div>
            </div>
          </div>

          <div className="obe-tab-nav" aria-label="OBE Tabs">
            {[
              { key: 'cdap', label: 'CDAP' },
              { key: 'articulation', label: 'Articulation Matrix' },
              { key: 'marks', label: 'Mark Entry' },
              { key: 'lca_instructions', label: 'LCA Instructions' },
              { key: 'lca', label: 'LCA' },
              { key: 'co_attainment', label: 'CO ATTAINMENT' },
              { key: 'internal_mark', label: 'INTERNAL MARK' },
              { key: 'cqi', label: 'CQI' },
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
                  className={`obe-tab-btn ${isActive ? 'active' : ''}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
            {activeTab === 'cdap' && (
              <CDAPPage courseId={courseId} showHeader={false} showCourseInput={false} />
            )}
            {activeTab === 'articulation' && <ArticulationMatrixPage courseId={courseId} />}
            {activeTab === 'marks' && <MarkEntryPage courseId={courseId} classType={courseClassType} questionPaperType={courseQpType} enabledAssessments={courseEnabledAssessments} />}
            {activeTab === 'lca_instructions' && <LCAInstructionsPage courseCode={courseId} courseName={courseName} />}
            {activeTab === 'lca' && <LCAPage courseId={courseId} />}
            {activeTab === 'co_attainment' && <COAttainmentPage courseId={courseId} enabledAssessments={courseEnabledAssessments} />}
            {activeTab === 'internal_mark' && <InternalMarkCoursePage courseId={courseId} enabledAssessments={courseEnabledAssessments} />}
            {activeTab === 'cqi' && <CQIPage courseId={courseId} />}
          </div>
      </div>
    </main>
  );
}
