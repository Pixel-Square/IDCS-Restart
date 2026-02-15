import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import CDAPPage from '../CDAPPage';
import ArticulationMatrixPage from '../ArticulationMatrixPage';
import LCAInstructionsPage from '../LCAInstructionsPage';
import LCAPage from '../LCAPage';
import COAttainmentPage from '../COAttainmentPage';
import CQIPage from '../CQIPage';

import MarkEntryTabs from '../../components/MarkEntryTabs';
import { fetchIQACCourseTeachingMap, IQACTeachingMapRow } from '../../services/academics';
import { fetchDeptRows, fetchMasters } from '../../services/curriculum';
import { fetchSpecialCourseEnabledAssessments } from '../../services/obe';
import type { TeachingAssignmentItem } from '../../services/obe';
import { normalizeClassType } from '../../constants/classTypes';

type TabKey = 'cdap' | 'articulation' | 'marks' | 'lca_instructions' | 'lca' | 'co_attainment' | 'cqi';

function normalize(s: any) {
  return String(s || '').trim();
}

export default function AcademicControllerCourseOBEPage(): JSX.Element {
  const { courseCode, taId } = useParams<{ courseCode: string; taId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const code = useMemo(() => decodeURIComponent(String(courseCode || '')).trim(), [courseCode]);
  const teachingAssignmentId = useMemo(() => (taId ? Number(taId) : NaN), [taId]);

  const [activeTab, setActiveTab] = useState<TabKey>('marks');
  const [mapping, setMapping] = useState<IQACTeachingMapRow | null>(null);
  const [classType, setClassType] = useState<string | null>(null);
  const [qpType, setQpType] = useState<string | null>(null);
  const [enabledAssessments, setEnabledAssessments] = useState<string[] | null>(null);

  useEffect(() => {
    if (!location?.pathname) return;
    const path = location.pathname.toLowerCase();
    if (path.includes('/lca/instructions') || path.includes('/lca_instructions')) setActiveTab('lca_instructions');
    else if (path.includes('/lca')) setActiveTab('lca');
    else if (path.includes('/cdap')) setActiveTab('cdap');
    else if (path.includes('/articulation')) setActiveTab('articulation');
    else if (path.includes('/marks')) setActiveTab('marks');
    else if (path.includes('/co_attainment')) setActiveTab('co_attainment');
    else if (path.includes('/cqi')) setActiveTab('cqi');
    else setActiveTab('marks');
  }, [location]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!code) return;
      try {
        const rows = await fetchIQACCourseTeachingMap(code);
        if (!mounted) return;
        const found = (rows || []).find((r) => Number(r.teaching_assignment_id) === Number(teachingAssignmentId)) || null;
        setMapping(found);
      } catch {
        if (!mounted) return;
        setMapping(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [code, teachingAssignmentId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!code) return;
      try {
        const [deptRows, masters] = await Promise.all([fetchDeptRows(), fetchMasters()]);
        if (!mounted) return;

        const codeU = code.toUpperCase();
        const matches = (deptRows || []).filter((r: any) => normalize(r?.course_code).toUpperCase() === codeU);
        const normQp = (v: any) => normalize(v).toUpperCase();

        const pick =
          matches.find((m: any) => {
            const qp = normQp(m?.question_paper_type);
            return qp && qp !== 'QP1';
          }) ||
          matches.find((m: any) => normQp(m?.question_paper_type)) ||
          matches.find((m: any) => normalize(m?.class_type)) ||
          matches[0];

        if (pick) {
          setClassType(pick?.class_type ? normalize(pick.class_type) : null);
          setQpType(pick?.question_paper_type ? normalize(pick.question_paper_type) : null);

          if (normalizeClassType(pick?.class_type) === 'SPECIAL') {
            // Signal SPECIAL immediately to avoid intermediate non-SPECIAL fetches.
            setEnabledAssessments([]);
            try {
              const ea = await fetchSpecialCourseEnabledAssessments(code);
              setEnabledAssessments(Array.isArray(ea) ? ea : []);
            } catch {
              const ea = (pick as any)?.enabled_assessments;
              setEnabledAssessments(Array.isArray(ea) ? ea.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean) : []);
            }
          } else {
            setEnabledAssessments(null);
          }
          return;
        }

        const m = (masters || []).find((mm: any) => normalize(mm?.course_code).toUpperCase() === codeU) as any;
        setClassType(m?.class_type ? normalize(m.class_type) : null);
        setQpType(null);
        setEnabledAssessments(null);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [code]);

  const taOverride: TeachingAssignmentItem[] = useMemo(() => {
    if (!Number.isFinite(teachingAssignmentId)) return [];
    return [
      {
        id: teachingAssignmentId,
        subject_id: 0,
        subject_code: code,
        subject_name: mapping?.course_name || code,
        section_id: mapping?.section_id || 0,
        section_name: mapping?.section_name || 'Section',
        academic_year: mapping?.academic_year || '',
      },
    ];
  }, [teachingAssignmentId, code, mapping]);

  if (!code || !Number.isFinite(teachingAssignmentId)) {
    return (
      <main style={{ padding: 18, minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ color: '#b91c1c' }}>Invalid teaching assignment.</div>
        <div style={{ marginTop: 10 }}>
          <Link className="obe-btn obe-btn-secondary" to={'/iqac/academic-controller?tab=courses'}>
            Back
          </Link>
        </div>
      </main>
    );
  }

  const title = mapping?.course_name || code;
  const sectionLine = [mapping?.section_name, mapping?.academic_year].filter(Boolean).join(' — ');
  const staffLine = mapping?.staff?.name || mapping?.staff?.username || '';

  return (
    <main className="obe-course-page" style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
      <div style={{ padding: '0px', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 12, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0 }}>OBE Viewer - {code}</h2>
              <div style={{ color: '#666', marginTop: 6 }}>View-only (IQAC)</div>
              <div style={{ color: '#222', marginTop: 6, fontWeight: 800 }}>{title}</div>
              <div style={{ color: '#374151', marginTop: 4 }}>
                {sectionLine || '—'}
                {staffLine ? `  •  ${staffLine}` : ''}
                {classType ? `  •  ${String(classType).toUpperCase()}` : ''}
              </div>
              {qpType ? (
                <div style={{ color: '#374151', marginTop: 2 }}>
                  QP Type: <strong style={{ color: '#111827' }}>{String(qpType)}</strong>
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="obe-btn obe-btn-secondary" to={`/iqac/academic-controller/course/${encodeURIComponent(code)}`}>
                Back
              </Link>
              <button
                onClick={() => navigate(`/iqac/academic-controller/course/${encodeURIComponent(code)}/marks/${encodeURIComponent(String(teachingAssignmentId))}`)}
                className="obe-btn"
              >
                Mark Entry Only
              </button>
            </div>
          </div>
        </div>

        <div className="obe-tab-nav" aria-label="OBE Tabs" style={{ padding: '0 18px' }}>
          {[
            { key: 'lca_instructions', label: 'LCA Instructions' },
            { key: 'lca', label: 'LCA' },
            { key: 'cdap', label: 'CDAP' },
            { key: 'articulation', label: 'Articulation Matrix' },
            { key: 'marks', label: 'Mark Entry' },
            { key: 'co_attainment', label: 'CO ATTAINMENT' },
            { key: 'cqi', label: 'CQI' },
          ].map((t) => {
            const isActive = activeTab === (t.key as TabKey);
            return (
              <button
                key={t.key}
                onClick={() => {
                  setActiveTab(t.key as TabKey);
                  const encCode = encodeURIComponent(code);
                  const encTa = encodeURIComponent(String(teachingAssignmentId));
                  const tabPath = t.key === 'lca_instructions' ? `lca/instructions` : String(t.key);
                  navigate(`/iqac/academic-controller/course/${encCode}/obe/${encTa}/${tabPath}`);
                }}
                className={`obe-tab-btn ${isActive ? 'active' : ''}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, margin: 18 }}>
          <fieldset disabled={true} style={{ border: 0, padding: 0, margin: 0 }}>
            {activeTab === 'cdap' && <CDAPPage courseId={code} showHeader={false} showCourseInput={false} />}
            {activeTab === 'articulation' && <ArticulationMatrixPage courseId={code} />}
            {activeTab === 'lca_instructions' && <LCAInstructionsPage courseCode={code} courseName={mapping?.course_name || null} />}
            {activeTab === 'lca' && <LCAPage courseId={code} />}
            {activeTab === 'co_attainment' && <COAttainmentPage courseId={code} enabledAssessments={enabledAssessments} />}
            {activeTab === 'cqi' && <CQIPage courseId={code} />}
          </fieldset>

          {activeTab === 'marks' ? (
            <div>
              <MarkEntryTabs
                subjectId={code}
                classType={classType}
                questionPaperType={qpType}
                enabledAssessments={enabledAssessments}
                teachingAssignmentsOverride={taOverride}
                fixedTeachingAssignmentId={teachingAssignmentId}
                iqacResetEnabled={true}
                viewerMode={false}
              />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
