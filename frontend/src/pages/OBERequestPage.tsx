import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPublishRequest } from '../services/obe';

export default function OBERequestPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const initial = useMemo(() => {
    const subject_code = String(params.get('subject_code') || '').trim();
    const assessment = String(params.get('assessment') || '').trim().toLowerCase();
    const reason = String(params.get('reason') || 'Edit Marks').trim();
    const taRaw = params.get('teaching_assignment_id');
    const teaching_assignment_id = taRaw ? Number(taRaw) : undefined;
    return {
      subject_code,
      assessment,
      reason,
      teaching_assignment_id: Number.isFinite(teaching_assignment_id as any) ? (teaching_assignment_id as number) : undefined,
    };
  }, [params]);

  const [subjectCode, setSubjectCode] = useState(initial.subject_code);
  const [assessment, setAssessment] = useState(initial.assessment);
  const [reason, setReason] = useState(initial.reason);
  const [teachingAssignmentId, setTeachingAssignmentId] = useState(String(initial.teaching_assignment_id ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const taIdRaw = (teachingAssignmentId || '').trim();
      const taIdNum = taIdRaw ? Number(taIdRaw) : undefined;
      await createPublishRequest({
        assessment: assessment as any,
        subject_code: subjectCode,
        reason,
        teaching_assignment_id: Number.isFinite(taIdNum as any) ? (taIdNum as number) : undefined,
        force: true,
      });
      alert('Edit request sent to IQAC.');
      navigate(-1);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>OBE Request</div>

      <div className="obe-card">
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div className="obe-small-muted" style={{ fontWeight: 800 }}>
              Subject Code
            </div>
            <input className="obe-input" value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} placeholder="e.g., GEA1268" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div className="obe-small-muted" style={{ fontWeight: 800 }}>
              Assessment
            </div>
            <input className="obe-input" value={assessment} onChange={(e) => setAssessment(e.target.value)} placeholder="cia1 | cia2 | model | formative1 | formative2" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div className="obe-small-muted" style={{ fontWeight: 800 }}>
              Teaching Assignment ID (optional)
            </div>
            <input
              className="obe-input"
              value={teachingAssignmentId}
              onChange={(e) => setTeachingAssignmentId(e.target.value)}
              placeholder="e.g., 123"
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div className="obe-small-muted" style={{ fontWeight: 800 }}>
              Reason
            </div>
            <textarea
              className="obe-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Edit Marks"
              style={{ resize: 'vertical' }}
            />
          </label>

          {error ? <div className="obe-danger-pill">{error}</div> : null}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="obe-btn" type="button" onClick={() => navigate(-1)} disabled={busy}>
              Cancel
            </button>
            <button className="obe-btn obe-btn-primary" type="button" onClick={submit} disabled={busy || !subjectCode || !assessment}>
              {busy ? 'Requesting…' : 'Request Edit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
