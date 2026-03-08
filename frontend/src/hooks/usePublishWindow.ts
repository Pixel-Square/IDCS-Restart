import { useEffect, useMemo, useState } from 'react';

import { autoPublishDue, DueAssessmentKey, fetchPublishWindow, PublishWindowResponse } from '../services/obe';

function computeRemainingSeconds(dueAtIso: string | null | undefined, nowIso: string | null | undefined): number | null {
  if (!dueAtIso) return null;
  const dueAt = new Date(dueAtIso).getTime();
  if (!Number.isFinite(dueAt)) return null;
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  if (!Number.isFinite(now)) return null;
  return Math.floor((dueAt - now) / 1000);
}

function computeStartsInSeconds(openFromIso: string | null | undefined, nowIso: string | null | undefined): number | null {
  if (!openFromIso) return null;
  const openFrom = new Date(openFromIso).getTime();
  if (!Number.isFinite(openFrom)) return null;
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  if (!Number.isFinite(now)) return null;
  return Math.floor((openFrom - now) / 1000);
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
  options?: { poll?: boolean };
}) {
  const { assessment, subjectCode, teachingAssignmentId, options } = params;
  const [data, setData] = useState<PublishWindowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [startsInSeconds, setStartsInSeconds] = useState<number | null>(null);
  const [autoPublishDone, setAutoPublishDone] = useState(false);

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
      const s = (resp as any).starts_in_seconds ?? computeStartsInSeconds(resp.open_from, resp.now);
      setStartsInSeconds(s);
    } catch (e: any) {
      setError(e?.message || 'Failed to check publish window');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    setData(null);
    setRemainingSeconds(null);
    setStartsInSeconds(null);
    setAutoPublishDone(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    // Poll to keep the due time/timer up-to-date if IQAC changes schedules.
    if (options?.poll === false) return;
    const tid = window.setInterval(() => {
      refresh({ silent: true });
    }, 30000);
    return () => window.clearInterval(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, options?.poll]);

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

  useEffect(() => {
    if (startsInSeconds == null) return;
    if (startsInSeconds <= 0) return;
    const tid = window.setInterval(() => {
      setStartsInSeconds((prev) => {
        if (prev == null) return prev;
        return prev <= 0 ? 0 : prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(tid);
  }, [startsInSeconds]);

  useEffect(() => {
    // Trigger auto-publish once when the due timer hits 0.
    if (autoPublishDone) return;
    if (!data) return;
    const windowState = String((data as any).window_state || '').trim().toUpperCase();
    const unlimited = windowState === 'UNLIMITED' || Boolean(data.global_override_active && data.global_is_open);
    if (unlimited) return;
    if (remainingSeconds == null) return;
    if (remainingSeconds > 0) return;
    // Only attempt when backend agrees the window ended.
    if (windowState !== 'ENDED') return;

    let cancelled = false;
    (async () => {
      try {
        await autoPublishDue(assessment, subjectCode, teachingAssignmentId);
      } catch {
        // ignore; server will also auto-publish on next publish-window poll
      } finally {
        if (cancelled) return;
        setAutoPublishDone(true);
        refresh({ silent: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPublishDone, data?.window_state, remainingSeconds, key]);

  const publishAllowed = data?.publish_allowed ?? true;
  const editAllowed = (data as any)?.edit_allowed ?? true;

  return { data, loading, error, remainingSeconds, startsInSeconds, publishAllowed, editAllowed, refresh };
}
