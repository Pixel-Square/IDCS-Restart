import { useEffect, useMemo, useState } from 'react';

import { DueAssessmentKey, fetchMarkTableLockStatus, MarkTableLockStatusResponse } from '../services/obe';

export function useMarkTableLock(params: {
  assessment: DueAssessmentKey;
  subjectCode: string;
  teachingAssignmentId?: number;
  options?: { poll?: boolean };
}) {
  const { assessment, subjectCode, teachingAssignmentId, options } = params;
  const [data, setData] = useState<MarkTableLockStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(
    () => `${assessment}|${subjectCode}|${teachingAssignmentId || ''}`,
    [assessment, subjectCode, teachingAssignmentId],
  );

  const refresh = async (opts?: { silent?: boolean }) => {
    if (!assessment || !subjectCode) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const resp = await fetchMarkTableLockStatus(assessment, subjectCode, teachingAssignmentId);
      setData(resp);
    } catch (e: any) {
      setError(e?.message || 'Failed to load lock status');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    setData(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (options?.poll === false) return;
    const tid = window.setInterval(() => {
      refresh({ silent: true });
    }, 30000);
    return () => window.clearInterval(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, options?.poll]);

  return { data, loading, error, refresh };
}
