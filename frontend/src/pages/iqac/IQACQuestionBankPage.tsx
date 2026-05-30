import React from 'react';
import { useParams } from 'react-router-dom';
import QuestionBankPage from '../QuestionBankPage';
import QuestionBankTypesModal from './QuestionBankTypesModal';
import { fetchDeptRows, fetchElectives } from '../../services/curriculum';
import { Settings } from 'lucide-react';

type CourseItem = { code: string; name: string };

function normalize(value: any): string {
  return String(value || '').trim();
}

export default function IQACQuestionBankPage(): JSX.Element {
  const { courseCode: routeCourseCode } = useParams<{ courseCode?: string }>();
  const [courses, setCourses] = React.useState<CourseItem[]>([]);
  const [selectedCourse, setSelectedCourse] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showTypesModal, setShowTypesModal] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [deptRows, electiveRows] = await Promise.all([
          fetchDeptRows(),
          fetchElectives().catch(() => []),
        ]);

        if (!mounted) return;

        const map = new Map<string, CourseItem>();

        for (const row of deptRows || []) {
          const code = normalize((row as any).course_code).toUpperCase();
          if (!code || map.has(code)) continue;
          map.set(code, {
            code,
            name: normalize((row as any).course_name) || code,
          });
        }

        const electiveList = Array.isArray(electiveRows)
          ? electiveRows
          : Array.isArray((electiveRows as any)?.results)
            ? (electiveRows as any).results
            : [];

        for (const row of electiveList || []) {
          const code = normalize((row as any).course_code).toUpperCase();
          if (!code || map.has(code)) continue;
          map.set(code, {
            code,
            name: normalize((row as any).course_name) || code,
          });
        }

        const courseList = Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
        setCourses(courseList);
        setSelectedCourse(routeCourseCode ? decodeURIComponent(routeCourseCode).trim().toUpperCase() : courseList[0]?.code || '');
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load courses');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [routeCourseCode]);

  const selected = courses.find((course) => course.code === selectedCourse) || null;

  if (loading) {
    return <div style={{ color: '#6b7280' }}>Loading question bank...</div>;
  }

  if (error) {
    return <div style={{ color: '#b91c1c' }}>{error}</div>;
  }

  if (!courses.length) {
    return <div style={{ color: '#6b7280' }}>No courses available.</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'flex-end', gap: '16px' }}>
        <div style={{ flex: 1 }}>
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
          {courses.map((course) => (
            <option key={course.code} value={course.code}>
              {course.code} - {course.name}
            </option>
          ))}
        </select>
        </div>
        <button
          onClick={() => setShowTypesModal(true)}
          style={{
            padding: '10px 16px',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Settings size={18} />
          Customise Question Bank Types
        </button>
      </div>

      {showTypesModal && <QuestionBankTypesModal onClose={() => setShowTypesModal(false)} />}

      {selected ? (
        <QuestionBankPage courseCode={selected.code} courseName={selected.name} allowAllColumnsEdit />
      ) : (
        <div style={{ color: '#6b7280' }}>No course selected.</div>
      )}
    </div>
  );
}
