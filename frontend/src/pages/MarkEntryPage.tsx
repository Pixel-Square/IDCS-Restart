import React, { useEffect, useState } from 'react';
import { lsGet, lsSet } from '../utils/localStorage';

// Props: courseId is the selected course code (string) or undefined
type Props = { courseId?: string };

export default function MarkEntryPage({ courseId }: Props) {
  // subject is the current course code (string)
  const [subject, setSubject] = useState<string>(courseId || '');
  const [marks, setMarks] = useState<{ studentId: string; mark: number }[]>([]);

  // Keep subject in sync with courseId prop
  useEffect(() => {
    if (courseId && courseId !== subject) {
      setSubject(courseId);
    }
    if (!courseId && subject) {
      setSubject('');
    }
  }, [courseId]);

  // Load marks from localStorage when subject changes
  useEffect(() => {
    if (!subject) {
      setMarks([]);
      return;
    }
    const stored = lsGet<{ studentId: string; mark: number }[]>(`marks_${subject}`) || [];
    setMarks(stored);
  }, [subject]);

  function addRow() {
    setMarks(prev => [...prev, { studentId: '', mark: 0 }]);
  }

  function update(i: number, key: 'studentId' | 'mark', value: any) {
    setMarks(prev => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [key]: value };
      return copy;
    });
  }

  function saveLocal() {
    if (!subject) return alert('Select course id');
    lsSet(`marks_${subject}`, marks);
    alert('Marks saved to localStorage');
  }

  function exportCsv() {
    const header = 'studentId,mark\n';
    const rows = marks.map(m => `${m.studentId},${m.mark}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${subject || 'marks'}_marks.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2>Mark Entry - {subject || 'No course selected'}</h2>
      {!courseId && (
        <div style={{ marginBottom: 12 }}>
          <label>Course ID: </label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Enter course id"
          />
        </div>
      )}

      <div>
        {marks.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={m.studentId}
              onChange={e => update(i, 'studentId', e.target.value)}
              placeholder="Student ID"
            />
            <input
              type="number"
              value={m.mark}
              onChange={e => update(i, 'mark', Number(e.target.value))}
              style={{ width: 80 }}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={addRow}>Add Row</button>
        <button onClick={saveLocal} style={{ marginLeft: 8 }}>
          Save Local
        </button>
        <button
          onClick={exportCsv}
          style={{ marginLeft: 8 }}
          disabled={!marks.length}
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
