import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ObeCoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/obe/subjects');
        const json = await res.json();
        setCourses(json.results ?? []);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>OBE • Courses</h1>
      {courses.map((c) => (
        <div key={c.id} style={{ padding: 12, border: '1px solid #ddd', marginTop: 8 }}>
          <div style={{ fontWeight: 600 }}><Link href={`/staff/obe/${c.id}`}>{c.name}</Link></div>
          <div style={{ color: '#666' }}>{c.subject_code ?? ''} {c.department ?? ''}</div>
        </div>
      ))}
    </div>
  );
}
