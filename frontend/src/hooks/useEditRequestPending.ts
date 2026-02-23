import { useEffect, useMemo, useState } from 'react';

import { DueAssessmentKey, EditScope, fetchMyLatestEditRequest, MyLatestEditRequestItem } from '../services/obe';

const PENDING_WINDOW_MS = 24 * 60 * 60 * 1000;

function computePendingUntilMs(row: MyLatestEditRequestItem | null): number | null {
  if (!row) return null;
  const status = String(row.status || '').toUpperCase();
  if (status !== 'PENDING') return null;
  if (!row.is_active) return null;
  const requestedAt = row.requested_at ? new Date(String(row.requested_at)).getTime() : 0;
  if (!requestedAt || !Number.isFinite(requestedAt)) return null;
  const until = requestedAt + PENDING_WINDOW_MS;
  return Number.isFinite(until) ? until : null;
}

export function useEditRequestPending(params: {
  enabled: boolean;
  assessment: DueAssessmentKey;
  subjectCode: string | null;
  scope: EditScope;
  teachingAssignmentId?: number;
}) {
  const { enabled, assessment, subjectCode, scope, teachingAssignmentId } = params;

  const [latest, setLatest] = useState<MyLatestEditRequestItem | null>(null);
  const [pendingUntilMs, setPendingUntilMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const pending = useMemo(() => {
    if (!pendingUntilMs) return false;
    return pendingUntilMs > Date.now();
  }, [pendingUntilMs]);

  const refresh = async (opts?: { silent?: boolean }) => {
    if (!enabled) return;
    if (!assessment || !subjectCode || !scope) return;

    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const resp = await fetchMyLatestEditRequest({
        assessment,
        subject_code: String(subjectCode),
        scope,
        teaching_assignment_id: teachingAssignmentId,
      });
      const row = resp?.result ?? null;
      setLatest(row);
      setPendingUntilMs(computePendingUntilMs(row));
    } catch {
      // Fail-open: if status can't be fetched, don't block requesting.
      setLatest(null);
      setPendingUntilMs(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setLatest(null);
      setPendingUntilMs(null);
      return;
    }
    refresh({ silent: true });
    const tid = window.setInterval(() => {
      refresh({ silent: true });
    }, 60000);
    return () => window.clearInterval(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, assessment, subjectCode, scope, teachingAssignmentId]);

  return {
    latest,
    pending,
    pendingUntilMs,
    loading,
    refresh,
    setPendingUntilMs,
  };
}
