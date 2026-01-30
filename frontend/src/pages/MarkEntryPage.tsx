import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SSA1Page from './SSA1Page';
import FA1Page from './FA1Page';
import CIA1Page from './CIA1Page';

// Props: courseId is the selected course code (string) or undefined
type Props = { courseId?: string };

type ActivePage = null | 'ssa1' | 'fa1' | 'cia1';

export default function MarkEntryPage({ courseId }: Props) {
  const [activePage, setActivePage] = useState<ActivePage>(null);

  if (activePage === 'ssa1') {
    return <SSA1Page onBack={() => setActivePage(null)} />;
  }

  if (activePage === 'fa1') {
    return <FA1Page onBack={() => setActivePage(null)} />;
  }

  if (activePage === 'cia1') {
    return <CIA1Page onBack={() => setActivePage(null)} />;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Mark Entry - {courseId || 'GEA1221'}</h2>

      <div style={{ marginTop: '30px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActivePage('ssa1')}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: '#1677ff',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background-color 0.3s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0c5fb8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1677ff')}
        >
          SSA1
        </button>

        <button
          onClick={() => setActivePage('fa1')}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: '#1677ff',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background-color 0.3s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0c5fb8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1677ff')}
        >
          FA1
        </button>

        <button
          onClick={() => setActivePage('cia1')}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: '#1677ff',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background-color 0.3s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0c5fb8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1677ff')}
        >
          CIA1
        </button>
      </div>
    </div>
  );
}
