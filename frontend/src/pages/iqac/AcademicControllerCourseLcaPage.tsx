import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import CDAPPage from '../lca/CDAPPage';

/**
 * IQAC LCA/CDAP page for a specific course and teaching assignment.
 * IQAC users can view and edit published CDAP without needing approval.
 */
export default function AcademicControllerCourseLcaPage(): JSX.Element {
  const { courseCode, taId } = useParams<{ courseCode: string; taId: string }>();

  const code = decodeURIComponent(String(courseCode || '')).trim();
  const taIdNum = taId ? Number(decodeURIComponent(taId)) : NaN;

  // Store the teaching assignment in localStorage so CDAPEditor / CDAPUploader can pick it up
  useEffect(() => {
    if (!code || !Number.isFinite(taIdNum)) return;
    try {
      window.localStorage.setItem(`markEntry_selectedTa_${code}`, String(taIdNum));
    } catch {
      // ignore
    }
  }, [code, taIdNum]);

  return (
    <main style={{ padding: 18, minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link
          to={`/iqac/academic-controller/course/${encodeURIComponent(code)}`}
          style={{ fontSize: 13, color: '#2563eb', textDecoration: 'underline' }}
        >
          ← Back to {code}
        </Link>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>|</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          LCA / CDAP &nbsp;·&nbsp; TA ID: {Number.isFinite(taIdNum) ? taIdNum : '—'}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            background: '#fef3c7',
            color: '#92400e',
            padding: '2px 8px',
            borderRadius: 6,
            border: '1px solid #fcd34d',
          }}
        >
          IQAC — Editing Enabled
        </span>
      </div>

      <CDAPPage
        courseId={code}
        showHeader={true}
        showCourseInput={false}
        isIqac={true}
      />
    </main>
  );
}
