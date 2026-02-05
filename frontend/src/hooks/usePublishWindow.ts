import { useEffect, useMemo, useState } from 'react';

import { DueAssessmentKey, fetchPublishWindow, PublishWindowResponse } from '../services/obe';

function computeRemainingSeconds(dueAtIso: string | null | undefined, nowIso: string | null | undefined): number | null {
  if (!dueAtIso) return null;
  const dueAt = new Date(dueAtIso).getTime();
  if (!Number.isFinite(dueAt)) return null;
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  if (!Number.isFinite(now)) return null;
  return Math.floor((dueAt - now) / 1000);
}

export function formatRemaining(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, '0')}m`;
  return `${mm}m ${String(ss).padStart(2, '0')}s`;
}

export function usePublishWindow(params: {
  assessment: DueAssessmentKey;
  subjectCode: string;
  teachingAssignmentId?: number;
}) {
  const { assessment, subjectCode, teachingAssignmentId } = params;
  const [data, setData] = useState<PublishWindowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const key = useMemo(() => `${assessment}|${subjectCode}|${teachingAssignmentId || ''}`, [assessment, subjectCode, teachingAssignmentId]);

  const refresh = async (opts?: { silent?: boolean }) => {
    if (!assessment || !subjectCode) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const resp = await fetchPublishWindow(assessment, subjectCode, teachingAssignmentId);
      setData(resp);
      const r = resp.remaining_seconds ?? computeRemainingSeconds(resp.due_at, resp.now);
      setRemainingSeconds(r);
    } catch (e: any) {
      setError(e?.message || 'Failed to check publish window');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    setData(null);
    setRemainingSeconds(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    // Poll to keep the due time/timer up-to-date if IQAC changes schedules.
    const tid = window.setInterval(() => {
      refresh({ silent: true });
    }, 30000);
    return () => window.clearInterval(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (remainingSeconds == null) return;
    if (remainingSeconds <= 0) return;
    const tid = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev == null) return prev;
        return prev <= 0 ? 0 : prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(tid);
  }, [remainingSeconds]);

  const publishAllowed = data?.publish_allowed ?? true;

  return { data, loading, error, remainingSeconds, publishAllowed, refresh };
}
