import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CDAPPage from './CDAPPage';
import ArticulationMatrixPage from './ArticulationMatrixPage';
import MarkEntryPage from './MarkEntryPage';
import LCAInstructionsPage from './LCAInstructionsPage';
import COAttainmentPage from './COAttainmentPage';
import CQIPage from './CQIPage';
import DashboardSidebar from '../components/DashboardSidebar';

type TabKey = 'cdap' | 'articulation' | 'marks' | 'lca' | 'co_attainment' | 'cqi';

export default function CourseOBEPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<TabKey>('marks');

  if (!code) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#666' }}>No course selected.</p>
        <button onClick={() => navigate('/obe')} className="obe-btn obe-btn-primary">Back</button>
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
        <div style={{ flex: 1, padding: '32px', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h2 style={{ margin: 0 }}>CDAP - {courseId}</h2>
                <div style={{ color: '#666', marginTop: 6 }}>Open CDAP workspace for this course</div>
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
              { key: 'lca', label: 'LCA Instructions' },
              { key: 'co_attainment', label: 'CO ATTAINMENT' },
              { key: 'cqi', label: 'CQI' },
            ].map((t) => {
              const isActive = activeTab === (t.key as TabKey);
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key as TabKey)}
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
            {activeTab === 'marks' && <MarkEntryPage courseId={courseId} />}
            {activeTab === 'lca' && <LCAInstructionsPage />}
            {activeTab === 'co_attainment' && <COAttainmentPage courseId={courseId} />}
            {activeTab === 'cqi' && <CQIPage courseId={courseId} />}
          </div>
        </div>
      </div>
    </main>
  );
}
