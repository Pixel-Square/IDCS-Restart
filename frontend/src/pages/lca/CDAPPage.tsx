import React, { useEffect, useState } from 'react';
import CDAPUploader from '../../components/CDAPUploader';
import CDAPEditor from '../../components/CDAPEditor';
import { saveCdapRevision } from '../../services/cdapDb';

type Props = {
  courseId?: string;
  showHeader?: boolean;
  showCourseInput?: boolean;
};

export default function CDAPPage({ courseId, showHeader = true, showCourseInput = true }: Props) {
  const [subject, setSubject] = useState<string>(courseId || '');
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSaveMessage, setAutoSaveMessage] = useState<string | null>(null);
  const [publishedLocked, setPublishedLocked] = useState(false);

  const teachingAssignmentId = React.useMemo(() => {
    if (!subject) return undefined;
    try {
      const raw = localStorage.getItem(`markEntry_selectedTa_${subject}`);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? (n as number) : undefined;
    } catch {
      return undefined;
    }
  }, [subject]);

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

      {!publishedLocked ? (
        <div style={{ marginBottom: 12 }}>
          <CDAPUploader
            subjectId={subject}
            onUpload={async (r) => {
              setUploadResult(r);

              // Auto-save the parsed upload so the Articulation Matrix can be computed from CDAP in DB.
              const revision = r?.revision || r;
              if (!subject || !revision) return;
              if (!Array.isArray(revision?.rows) || revision.rows.length === 0) return;

              try {
                setAutoSaveStatus('saving');
                setAutoSaveMessage(null);
                const savePromise = saveCdapRevision({
                  subjectId: subject,
                  status: 'draft',
                  rows: revision.rows,
                  books: { textbook: revision.textbook || '', reference: revision.reference || '' },
                  teaching_assignment_id: teachingAssignmentId,
                  active_learning: {
                    grid: [],
                    dropdowns: [],
                    optionsByRow: revision.activeLearningOptionsByRow || [],
                    articulation_extras: revision.articulationExtras || {},
                  },
                });
                const timeoutPromise = new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('Auto-save timed out. Server did not respond in time.')), 60_000)
                );
                await Promise.race([savePromise, timeoutPromise]);
                setAutoSaveStatus('saved');
                setAutoSaveMessage('Saved parsed CDAP to cloud (draft).');
              } catch (e: any) {
                setAutoSaveStatus('error');
                setAutoSaveMessage(e?.message || 'Auto-save failed. You can still publish from the editor.');
              }
            }}
          />
        </div>
      ) : null}

      {autoSaveMessage && (
        <div
          style={{
            marginBottom: 12,
            fontSize: 12,
            color: autoSaveStatus === 'error' ? '#b91c1c' : '#166534',
          }}
        >
          {autoSaveMessage}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <CDAPEditor
          subjectId={subject}
          imported={uploadResult?.revision || uploadResult}
          onLockChange={(locked) => setPublishedLocked(Boolean(locked))}
        />
      </div>
    </div>
  );
}
