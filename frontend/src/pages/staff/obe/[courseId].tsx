import { useRouter } from 'next/router';
import { useState } from 'react';

export default function ObeCourseDetailPage() {
  const router = useRouter();
  const courseId = router.query.courseId as string | undefined;
  const [tab, setTab] = useState<'cdap'|'articulation'|'marks'>('cdap');

  if (!courseId) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>OBE • Course</h1>
      <div style={{ color: '#666', marginBottom: 12 }}>Subject ID: {courseId}</div>

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #ddd', marginBottom: 12 }}>
        <button onClick={() => setTab('cdap')} style={{ padding: 8 }}>CDAP</button>
        <button onClick={() => setTab('articulation')} style={{ padding: 8 }}>Articulation Matrix</button>
        <button onClick={() => setTab('marks')} style={{ padding: 8 }}>Mark Entry</button>
      </div>

      {tab === 'cdap' && <div>CDAP editor placeholder for {courseId}</div>}
      {tab === 'articulation' && <div>Articulation matrix placeholder for {courseId}</div>}
      {tab === 'marks' && <div>Mark entry placeholder for {courseId}</div>}
    </div>
  );
}
