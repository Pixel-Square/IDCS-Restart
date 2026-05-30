import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import OBEPage from './obe/OBEPage';
import OBEMasterPage from './obe/OBEMasterPage';
import OBEDueDatesPage from './obe/OBEDueDatesPage';
import QuestionBankPage from './QuestionBankPage';

export default function AcademicPage(): JSX.Element {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialTab = (params.get('tab') as 'obe' | 'obe_master' | 'due_dates' | 'question_bank') || 'obe';
  const [tab, setTab] = useState<'obe' | 'obe_master' | 'due_dates' | 'question_bank'>(initialTab);

  // decide which tabs to show based on permissions exposed via window.__APP_ME__ if available
  const perms = (window as any).__APP_ME__?.permissions || (window as any).__ME__?.permissions || [];
  const lower = Array.isArray(perms) ? perms.map((p: any) => String(p || '').toLowerCase()) : [];
  const canObeMaster = lower.includes('obe.master.manage');

  const tabs = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    out.push({ key: 'obe', label: 'OBE' });
    out.push({ key: 'question_bank', label: 'Question Bank' });
    if (canObeMaster) {
      out.push({ key: 'obe_master', label: 'OBE Master' });
      out.push({ key: 'due_dates', label: 'OBE: Due Dates' });
    }
    return out;
  }, [canObeMaster]);

  // ensure selected tab is available
  React.useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key as any || 'obe');
  }, [tabs, tab]);

  useEffect(() => {
    // respond to URL changes (e.g. /academic?tab=obe_master)
    const p = new URLSearchParams(location.search).get('tab') as 'obe' | 'obe_master' | 'due_dates' | 'question_bank' | null;
    if (p && tabs.some((t) => t.key === p) && p !== tab) setTab(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  return (
    <main style={{ padding: 18, minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Academic</h2>
        <div style={{ color: '#6b7280', marginTop: 6 }}>Quick access to OBE tools.</div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: tab === t.key ? '1px solid #10b981' : '1px solid #e5e7eb',
              background: tab === t.key ? '#ecfdf5' : '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
        {tab === 'obe' && <OBEPage />}
        {tab === 'obe_master' && canObeMaster && <OBEMasterPage />}
        {tab === 'due_dates' && canObeMaster && <OBEDueDatesPage />}
        {tab === 'question_bank' && <QuestionBankPageWrapper />}
      </div>
    </main>
  );
}

// Wrapper component to handle course code resolution for Question Bank
function QuestionBankPageWrapper(): JSX.Element {
  const [assignedCourses, setAssignedCourses] = useState<Array<{ code: string; name: string }>>([]);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAssignedCourses();
  }, []);

  async function loadAssignedCourses() {
    try {
      const { fetchWithAuth } = await import('../services/fetchAuth');
      const res = await fetchWithAuth('/api/academics/staff/assigned-subjects/');
      if (res.ok) {
        const data = await res.json();
        const courses = (data.results || [])
          .map((item: any) => ({
            code: item.subject_code || '',
            name: item.subject_name || '',
          }))
          .filter((c: any) => c.code)
          .sort((a: any, b: any) => a.code.localeCompare(b.code));
        setAssignedCourses(courses);
        if (courses.length > 0) {
          setSelectedCourse(courses[0].code);
        }
      }
    } catch (e) {
      console.error('Failed to load assigned courses', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  if (assignedCourses.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        No courses assigned. Contact your HOD to assign courses.
      </div>
    );
  }

  if (!selectedCourse) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        No course selected.
      </div>
    );
  }

  const course = assignedCourses.find((c) => c.code === selectedCourse);

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>
          Select Course
        </label>
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        >
          {assignedCourses.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} - {c.name}
            </option>
          ))}
        </select>
      </div>
      {course && <QuestionBankPage courseCode={course.code} courseName={course.name} />}
    </div>
  );
}
