import React, { useEffect, useRef, useState } from 'react';
import * as OBE from '../services/obe';

const ALL_KEYS = ['ssa1', 'formative1', 'ssa2', 'formative2', 'cia1', 'cia2'] as const;

type Props = { teachingAssignmentId?: number | null; onSaved?: (arr: string[]) => void; onClose?: () => void };

export default function FacultyAssessmentPanel({ teachingAssignmentId, onSaved, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<OBE.EnabledAssessmentsMeta | null>(null);
  const [requestingEdit, setRequestingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCanEditRef = useRef<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!teachingAssignmentId) return;
    (async () => {
      setLoading(true);
      try {
        const info = await OBE.fetchTeachingAssignmentEnabledAssessmentsInfo(Number(teachingAssignmentId));
        if (!mounted) return;
        setEnabled(new Set(info?.enabled_assessments || []));
        setMeta(info?.meta || null);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [teachingAssignmentId]);

  // Poll approval status when a request is pending so faculty sees approval/reject.
  useEffect(() => {
    if (!teachingAssignmentId) return;
    if (meta?.mode !== 'SPECIAL_GLOBAL') return;
    if (meta?.edit_request?.status !== 'PENDING') return;

    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const info = await OBE.fetchTeachingAssignmentEnabledAssessmentsInfo(Number(teachingAssignmentId));
        if (cancelled) return;
        setEnabled(new Set(info?.enabled_assessments || []));
        setMeta(info?.meta || null);
      } catch {
        // ignore polling errors
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [teachingAssignmentId, meta?.mode, meta?.edit_request?.status]);

  const locked = Boolean(meta?.locked);
  const canEdit = meta?.can_edit !== false; // default allow unless explicitly false
  const readOnly = locked && !canEdit;
  const editReq = meta?.edit_request || null;
  const editReqStatus = String(editReq?.status || '').toUpperCase();
  const editReqPending = editReqStatus === 'PENDING';

  // Notify once when edit becomes granted.
  useEffect(() => {
    if (meta?.mode !== 'SPECIAL_GLOBAL') return;
    const prev = lastCanEditRef.current;
    lastCanEditRef.current = canEdit;
    if (prev === false && canEdit === true) {
      alert('IQAC approval granted. You can now edit and re-save the enabled exams.');
    }
  }, [canEdit, meta?.mode]);

  const toggle = (k: string) => {
    if (readOnly) return;
    setEnabled((s) => {
      const copy = new Set(s);
      if (copy.has(k)) copy.delete(k); else copy.add(k);
      return copy;
    });
  };

  const save = async () => {
    if (!teachingAssignmentId) return;
    setSaving(true);
    try {
      const arr = Array.from(enabled.values());
      const resp = await OBE.setTeachingAssignmentEnabledAssessmentsInfo(Number(teachingAssignmentId), arr);
      const saved = resp?.enabled_assessments || [];
      setEnabled(new Set(saved));
      setMeta(resp?.meta || meta);
      setError(null);
      onSaved && onSaved(saved);
      alert('Saved enabled assessments.');
    } catch (e: any) {
      setError(e?.message || 'Save failed');
      alert('Save failed: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const requestEdit = async (alreadyPending?: boolean) => {
    if (!teachingAssignmentId) return;
    setRequestingEdit(true);
    try {
      const resp = await OBE.requestTeachingAssignmentEnabledAssessmentsEdit(Number(teachingAssignmentId));
      setMeta((m) => ({
        ...(m || {}),
        locked: true,
        can_edit: false,
        edit_request: resp || { status: 'PENDING' },
      }));
      if (alreadyPending) {
        alert('Request is already pending. Synced status with server.');
      } else {
        alert('Edit request sent to IQAC for approval.');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to request edit');
      alert('Edit request failed: ' + (e?.message || ''));
    } finally {
      setRequestingEdit(false);
    }
  };

  const onClickRequestEdit = async () => {
    await requestEdit(editReqPending);
    await refreshStatus();
  };

  const refreshStatus = async () => {
    if (!teachingAssignmentId) return;
    try {
      setLoading(true);
      const info = await OBE.fetchTeachingAssignmentEnabledAssessmentsInfo(Number(teachingAssignmentId));
      setEnabled(new Set(info?.enabled_assessments || []));
      setMeta(info?.meta || null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 8, background: '#ffffff', maxWidth: 520 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Select Exams for this Assignment</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {meta?.mode === 'SPECIAL_GLOBAL' ? 'Special course (global lock)' : 'Faculty override'}
        </div>
      </div>

      {meta?.mode === 'SPECIAL_GLOBAL' && locked && (
        <div style={{ fontSize: 12, color: readOnly ? '#92400e' : '#065f46', marginBottom: 8 }}>
          {readOnly ? 'Locked after first save. Edit requires IQAC approval.' : 'Editing permitted (approved by IQAC/admin).'}
          {editReq?.status ? <span style={{ marginLeft: 8, color: '#6b7280' }}>Request: {String(editReq.status)}</span> : null}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6b7280' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
          {ALL_KEYS.map((k) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={enabled.has(k)} onChange={() => toggle(k)} disabled={readOnly || saving} />
              <span style={{ textTransform: 'uppercase', fontSize: 13 }}>{k.toUpperCase()}</span>
            </label>
          ))}
        </div>
      )}
      {error && <div style={{ color: '#b91c1c', marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {!readOnly && (
          <button className="obe-btn obe-btn-primary" onClick={save} disabled={saving || loading || !teachingAssignmentId}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}

        {readOnly && meta?.mode === 'SPECIAL_GLOBAL' && (
          <>
            <button
              className="obe-btn"
              onClick={onClickRequestEdit}
              disabled={
                requestingEdit ||
                saving ||
                loading ||
                !teachingAssignmentId
              }
              title={editReqPending ? 'Request already pending. Wait for IQAC approval.' : undefined}
            >
              {requestingEdit ? 'Requesting…' : (editReqPending ? 'Edit Request Pending' : 'Edit (Request IQAC Approval)')}
            </button>
            <button className="obe-btn" onClick={refreshStatus} disabled={saving || loading || !teachingAssignmentId}>
              Refresh
            </button>
          </>
        )}

        <button className="obe-btn" onClick={() => onClose && onClose()} disabled={saving}>{'Close'}</button>
      </div>
    </div>
  );
}
