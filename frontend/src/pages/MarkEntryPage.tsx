
import React, { useEffect, useState } from 'react';
import MarkEntryTabs from '../components/MarkEntryTabs';

// Props: courseId is the selected course code (string) or undefined
type Props = { courseId?: string };

export default function MarkEntryPage({ courseId }: Props) {
  // subject is the current course code (string)
  const [subject, setSubject] = useState<string>(courseId || '');
  const [focus, setFocus] = useState(false);

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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 60%)',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        background: '#ffffff',
        borderRadius: 12,
        boxShadow: '0 8px 20px rgba(2,6,23,0.06)'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          color: '#ffffff',
          padding: '20px 24px',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12
        }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Mark Entry</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}> {subject ? `Course: ${subject}` : 'No course selected'} </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {!courseId && (
            <div className="obe-card" style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Course ID</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Enter course id"
                className="obe-input"
                style={{ marginTop: 6, ...(focus ? { boxShadow: '0 0 0 3px rgba(16,185,129,0.2)', borderColor: '#a7f3d0' } : {}) }}
                onFocus={() => setFocus(true)}
                onBlur={() => setFocus(false)}
              />
            </div>
          )}

          {!subject ? (
            <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 14, padding: 12, borderRadius: 10 }}>
              Select a course to start mark entry.
            </div>
          ) : (
            <MarkEntryTabs subjectId={subject} />
          )}
        </div>
      </div>
    </div>
  );
}
