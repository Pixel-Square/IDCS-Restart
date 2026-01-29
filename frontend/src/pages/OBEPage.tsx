import React, { useEffect, useMemo, useState } from 'react';

import CDAPPage from './CDAPPage';
import ArticulationMatrixPage from './ArticulationMatrixPage';
import MarkEntryPage from './MarkEntryPage';

import { fetchMyTeachingAssignments, TeachingAssignmentItem } from '../services/obe';
import DashboardSidebar from '../components/DashboardSidebar';

type OBEItem = {
  id: number;
  course: string;
  outcome: string;
  assessment: string;
  target: string;
  achieved: string;
};

type TabKey = 'cdap' | 'articulation' | 'marks';

export default function OBEPage(): JSX.Element {
  const [data, setData] = useState<OBEItem[]>([]);

  const [assignments, setAssignments] = useState<TeachingAssignmentItem[]>([]);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [selectedCourseKey, setSelectedCourseKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('cdap');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetchMyTeachingAssignments();
        if (!mounted) return;
        setAssignments(res);
        setAssignmentsError(null);

        // pick a sensible default
        if (!selectedCourseKey && res.length) {
          setSelectedCourseKey(res[0].subject_code);
        }
      } catch (e: any) {
        if (!mounted) return;
        setAssignmentsError(e?.message || 'Failed to load courses');
        setAssignments([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedCourse = useMemo(() => {
    if (!selectedCourseKey) return null;
    // we key by subject_code for now (it matches existing localStorage flows)
    const first = assignments.find(a => a.subject_code === selectedCourseKey);
    if (!first) return null;
    return {
      subject_code: first.subject_code,
      subject_name: first.subject_name,
    };
  }, [assignments, selectedCourseKey]);

 

  const parsePercent = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const navigateToCourse = (code: string) => {
    // navigate to a course-specific OBE page; adjust path if your router differs
    const path = `/obe/course/${encodeURIComponent(code)}`;
    window.location.href = path;
  };

  const totalItems = data.length;
  const averageAchievement = totalItems
    ? (data.reduce((sum, it) => sum + parsePercent(it.achieved), 0) / totalItems).toFixed(1) + '%'
    : 'N/A';

      return (
        <main className="obe-page" style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
          <div style={{ display: 'flex', flexDirection: 'row', minHeight: '100vh' }}>
            <div style={{ flex: '0 0 240px', background: '#f8fafc', minHeight: '100vh', borderRight: '1px solid #eee' }}>
              <DashboardSidebar />
            </div>
            <div style={{ flex: 1, padding: '32px 32px 24px 32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
              <header style={{ marginBottom: 8, marginTop: 0, paddingTop: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', width: '100%' }}>
                  <div style={{ textAlign: 'right' }}>
                    <h1 style={{ margin: 0 }}>
                      Outcome Based Education (OBE)
                    </h1>
                    {selectedCourse && (
                      <div style={{ fontSize: 20, color: '#222', fontWeight: 600, lineHeight: 1.2 }}>
                        {selectedCourse.subject_name} ({selectedCourse.subject_code})
                      </div>
                    )}
                    <div style={{ marginTop: 4, color: '#444', fontSize: 15 }}>
                      Select a course, then work through CDAP, Articulation Matrix and Mark Entry.
                    </div>
                  </div>
                </div>
              </header>
              <section
                aria-label="Course selector"
                style={{ marginBottom: 12 }}
              >
                <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Select a course to work on:</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 16,
                    marginBottom: 8,
                    minHeight: 180,
                    alignItems: 'start',
                    justifyItems: 'center',
                  }}
                >
                  {assignments.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', color: '#888', fontSize: 20, textAlign: 'center', padding: 40 }}>
                      No courses found. You have no teaching assignments.<br />
                      (If you expect to see courses here, please check your backend/API or contact admin.)
                    </div>
                  ) : (
                    assignments
                      .reduce((acc: TeachingAssignmentItem[], it) => {
                        // de-dupe by subject_code for this selector
                        if (!acc.some(a => a.subject_code === it.subject_code)) acc.push(it);
                        return acc;
                      }, [])
                      .map((it) => (
                        <div
                          key={it.subject_code}
                          onClick={() => navigateToCourse(it.subject_code)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter') navigateToCourse(it.subject_code); }}
                          style={{
                            border: selectedCourseKey === it.subject_code ? '2px solid #2563eb' : '1px solid #e5e7eb',
                            borderRadius: 10,
                            padding: 18,
                            background: selectedCourseKey === it.subject_code ? '#f0f6ff' : '#fff',
                            boxShadow: selectedCourseKey === it.subject_code ? '0 2px 8px #2563eb22' : '0 1px 4px #0001',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            minHeight: 100,
                            position: 'relative',
                            transition: 'border 0.2s, box-shadow 0.2s',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{it.subject_name}</div>
                          <div style={{ fontSize: 15, color: '#444', marginBottom: 12 }}>{it.subject_code}</div>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigateToCourse(it.subject_code); }}
                            style={{
                              marginTop: 'auto',
                              padding: '6px 18px',
                              borderRadius: 6,
                              border: 'none',
                              background: '#2563eb',
                              color: '#fff',
                              fontWeight: 600,
                              fontSize: 15,
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px #0001',
                            }}
                          >
                            Open
                          </button>
                        </div>
                      ))
                  )}
                </div>
                {assignmentsError && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{assignmentsError}</div>
                )}
              </section>
            </div>
          </div>
        </main>
  );
}
