import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPublishRequest } from '../../services/obe';
import fetchWithAuth from '../../services/fetchAuth';
import { fetchTeachingAssignmentRoster } from '../../services/roster';
import { ModalPortal } from '../../components/ModalPortal';

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

  const [viewReasonOpen, setViewReasonOpen] = useState(false);
  const [viewReasonBusy, setViewReasonBusy] = useState(false);
  const [viewReasonError, setViewReasonError] = useState<string | null>(null);
  const [viewReasonMe, setViewReasonMe] = useState<any | null>(null);
  const [viewReasonTa, setViewReasonTa] = useState<any | null>(null);
  const [viewReasonTaId, setViewReasonTaId] = useState<number | null>(null);

  const taIdNum = useMemo(() => {
    const raw = String(teachingAssignmentId || '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [teachingAssignmentId]);

  async function openViewReason() {
    setViewReasonOpen(true);
    setViewReasonBusy(true);
    setViewReasonError(null);
    try {
      if (!viewReasonMe) {
        const meRes = await fetchWithAuth('/api/accounts/me/', { method: 'GET' });
        if (meRes.ok) {
          setViewReasonMe(await meRes.json());
        }
      }

      if (taIdNum != null && viewReasonTaId !== taIdNum) {
        try {
          const ta = await fetchTeachingAssignmentRoster(taIdNum);
          setViewReasonTa(ta);
          setViewReasonTaId(taIdNum);
        } catch (e: any) {
          // Don't block the modal if roster fetch fails
          setViewReasonTa(null);
          setViewReasonTaId(null);
          setViewReasonError(e?.message || 'Failed to load course details');
        }
      }
    } catch (e: any) {
      setViewReasonError(e?.message || 'Failed to load profile');
    } finally {
      setViewReasonBusy(false);
    }
  }

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

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="obe-btn obe-btn-secondary" type="button" onClick={openViewReason}>
              View Reason
            </button>
          </div>

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

      {viewReasonOpen ? (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              overflowY: 'auto',
              padding: 16,
              paddingTop: 40,
              paddingBottom: 40,
              zIndex: 80,
            }}
            onClick={() => {
              if (viewReasonBusy) return;
              setViewReasonOpen(false);
            }}
          >
            <div
              style={{
                width: 'min(760px, 96vw)',
                maxHeight: 'min(86vh, 900px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                background: '#fff',
                borderRadius: 14,
                border: '1px solid #e5e7eb',
                padding: 14,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 950, fontSize: 14, color: '#111827' }}>View Reason</div>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{String(assessment || '').toUpperCase()}</div>
                <button
                  type="button"
                  className="obe-btn"
                  style={{ padding: '6px 10px', minHeight: 34 }}
                  onClick={() => setViewReasonOpen(false)}
                  disabled={viewReasonBusy}
                >
                  Close
                </button>
              </div>

              {viewReasonBusy ? <div className="obe-small-muted" style={{ marginBottom: 10 }}>Loading…</div> : null}
              {viewReasonError ? <div className="obe-danger-pill" style={{ marginBottom: 10 }}>{viewReasonError}</div> : null}

              <div className="obe-card" style={{ padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Staff</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.35 }}>
                  <div>
                    <strong>Name:</strong> {String(viewReasonMe?.profile?.name || viewReasonMe?.username || viewReasonMe?.email || '—')}
                  </div>
                  <div>
                    <strong>Staff ID:</strong> {String(viewReasonMe?.profile?.staff_id || '—')}
                  </div>
                  <div>
                    <strong>Department:</strong>{' '}
                    {String(viewReasonMe?.profile?.department?.short_name || viewReasonMe?.profile?.department?.name || viewReasonMe?.profile?.department?.code || '—')}
                  </div>
                </div>
              </div>

              <div className="obe-card" style={{ padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Course</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.35 }}>
                  <div>
                    <strong>Course Code:</strong> {String(viewReasonTa?.teaching_assignment?.subject_code || subjectCode || '—')}
                  </div>
                  <div>
                    <strong>Course Name:</strong> {String(viewReasonTa?.teaching_assignment?.subject_name || '—')}
                  </div>
                  <div>
                    <strong>Class/Section:</strong> {String(viewReasonTa?.teaching_assignment?.section_name || '—')}
                  </div>
                  <div>
                    <strong>Teaching Assignment ID:</strong> {taIdNum != null ? String(taIdNum) : '—'}
                  </div>
                </div>
              </div>

              <div className="obe-card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Reason</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#111827', lineHeight: 1.45 }}>
                  {String(reason || '').trim() ? String(reason) : '—'}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
