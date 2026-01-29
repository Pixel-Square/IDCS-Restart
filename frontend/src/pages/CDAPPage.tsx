import React, { useEffect, useState } from 'react';
import CDAPUploader from '../components/CDAPUploader';
import CDAPEditor from '../components/CDAPEditor';

type Props = {
  courseId?: string;
  showHeader?: boolean;
  showCourseInput?: boolean;
};

export default function CDAPPage({ courseId, showHeader = true, showCourseInput = true }: Props) {
  const [subject, setSubject] = useState<string>(courseId || '');
  const [uploadResult, setUploadResult] = useState<any>(null);

  useEffect(() => {
    if (courseId) setSubject(courseId);
  }, [courseId]);

  return (
    <div>
      {showHeader && <h2>CDAP - {subject || 'No course selected'}</h2>}

      {showCourseInput && !courseId && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ marginRight: 8 }}>Course ID:</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter course id"
            style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4 }}
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <CDAPUploader
          subjectId={subject}
          onUpload={(r) => {
            setUploadResult(r);
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <CDAPEditor
          subjectId={subject}
          imported={uploadResult?.revision || uploadResult}
        />
      </div>
    </div>
  );
}
