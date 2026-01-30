import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CDAPPage from './CDAPPage';
import ArticulationMatrixPage from './ArticulationMatrixPage';
import MarkEntryPage from './MarkEntryPage';
import DashboardSidebar from '../components/DashboardSidebar';

type TabKey = 'cdap' | 'articulation' | 'marks';

export default function CourseOBEPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<TabKey>('cdap');

  if (!code) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#666' }}>No course selected.</p>
        <button onClick={() => navigate('/obe')} style={{ padding: '8px 12px' }}>Back</button>
      </div>
    );
  }

  const courseId = decodeURIComponent(code);

  return (
    <main className="obe-course-page" style={{ padding: 0, fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
      <div style={{ display: 'flex', flexDirection: 'row', minHeight: '100vh' }}>
        <div style={{ flex: '0 0 240px', background: '#f8fafc', minHeight: '100vh', borderRight: '1px solid #eee' }}>
          <DashboardSidebar />
        </div>
        <div style={{ flex: 1, padding: '32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h2 style={{ margin: 0 }}>CDAP - {courseId}</h2>
                <div style={{ color: '#666', marginTop: 6 }}>Open CDAP workspace for this course</div>
              </div>
              <div>
                <button onClick={() => navigate('/obe')} style={{ padding: '8px 12px' }}>Back to courses</button>
              </div>
            </div>
          </div>

          <div aria-label="OBE Tabs" style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            {[
              { key: 'cdap', label: 'CDAP' },
              { key: 'articulation', label: 'Articulation Matrix' },
              { key: 'marks', label: 'Mark Entry' },
            ].map((t) => {
              const isActive = activeTab === (t.key as TabKey);
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key as TabKey)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: isActive ? '2px solid #111827' : '1px solid #e5e7eb',
                    background: isActive ? '#111827' : '#fff',
                    color: isActive ? '#fff' : '#111827',
                    cursor: 'pointer',
                  }}
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
            {activeTab === 'marks' && <MarkEntryPage courseId={courseId} />}
          </div>
        </div>
      </div>
    </main>
  );
}
