import React, { useEffect, useState } from 'react';
import MarkEntryTabs from '../components/MarkEntryTabs';

// Props: courseId is the selected course code (string) or undefined
type Props = { courseId?: string };

export default function MarkEntryPage({ courseId }: Props) {
  // subject is the current course code (string)
  const [subject, setSubject] = useState<string>(courseId || '');

  // Keep subject in sync with courseId prop
  useEffect(() => {
    if (courseId && courseId !== subject) {
      setSubject(courseId);
    }
    if (!courseId && subject) {
      setSubject('');
    }
  }, [courseId]);

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

      {!subject ? (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>
          Select a course to start mark entry.
        </div>
      ) : (
        <MarkEntryTabs subjectId={subject} />
      )}
    </div>
  );
}
