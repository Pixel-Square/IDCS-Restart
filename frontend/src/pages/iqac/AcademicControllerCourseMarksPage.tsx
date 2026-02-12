import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MarkEntryTabs from '../../components/MarkEntryTabs';
import { normalizeClassType } from '../../constants/classTypes';
import { fetchIQACCourseTeachingMap, IQACTeachingMapRow } from '../../services/academics';
import { fetchDeptRows, fetchMasters } from '../../services/curriculum';
import { fetchSpecialCourseEnabledAssessments } from '../../services/obe';
import type { TeachingAssignmentItem } from '../../services/obe';

export default function AcademicControllerCourseMarksPage(): JSX.Element {
  const { courseCode, taId } = useParams<{ courseCode: string; taId: string }>();

  const code = useMemo(() => decodeURIComponent(String(courseCode || '')).trim(), [courseCode]);
  const teachingAssignmentId = useMemo(() => (taId ? Number(taId) : NaN), [taId]);

  const [mapping, setMapping] = useState<IQACTeachingMapRow | null>(null);
  const [classType, setClassType] = useState<string | null>(null);
  const [qpType, setQpType] = useState<string | null>(null);
  const [enabledAssessments, setEnabledAssessments] = useState<string[] | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!code) return;
      try {
        const [rows, masters] = await Promise.all([fetchDeptRows(), fetchMasters()]);
        if (!mounted) return;
        const matches = (rows || []).filter((r: any) => String(r?.course_code || '').trim().toUpperCase() === code.toUpperCase());
        const pick = matches[0];
        if (pick) {
          setClassType(pick?.class_type ? String(pick.class_type) : null);
          setQpType(pick?.question_paper_type ? String(pick.question_paper_type) : null);
          const ct = String(pick?.class_type || '').trim().toUpperCase();
          if (ct === 'SPECIAL') {
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
        } else {
          const m = (masters || []).find((mm: any) => String(mm?.course_code || '').trim().toUpperCase() === code.toUpperCase());
          setClassType(m?.class_type ? String(m.class_type) : null);
          setQpType(null);
          setEnabledAssessments(null);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [code]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!code || !Number.isFinite(teachingAssignmentId)) return;
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

  const ct = normalizeClassType(classType);

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

  return (
    <main style={{ padding: 18, minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Mark Entry Viewer</h2>
          <div style={{ color: '#374151', marginTop: 6, fontWeight: 800 }}>{code}</div>
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            {mapping ? `${mapping.section_name} — ${mapping.academic_year}` : '—'}
            {mapping?.staff?.name || mapping?.staff?.username ? `  •  ${mapping.staff?.name || mapping.staff?.username}` : ''}
            {ct ? `  •  ${ct}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="obe-btn obe-btn-secondary" to={`/iqac/academic-controller/course/${encodeURIComponent(code)}`}>
            Back
          </Link>
        </div>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
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
    </main>
  );
}
