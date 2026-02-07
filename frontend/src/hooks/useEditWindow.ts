import { useEffect, useMemo, useState } from 'react';

import { DueAssessmentKey, EditScope, EditWindowResponse, fetchEditWindow } from '../services/obe';

export function useEditWindow(params: {
  assessment: DueAssessmentKey;
  subjectCode: string;
  scope: EditScope;
  teachingAssignmentId?: number;
  options?: { poll?: boolean };
}) {
  const { assessment, subjectCode, scope, teachingAssignmentId, options } = params;
  const [data, setData] = useState<EditWindowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(() => `${assessment}|${subjectCode}|${scope}|${teachingAssignmentId || ''}`, [assessment, subjectCode, scope, teachingAssignmentId]);

  const refresh = async (opts?: { silent?: boolean }) => {
    if (!assessment || !subjectCode || !scope) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const resp = await fetchEditWindow(assessment, subjectCode, scope, teachingAssignmentId);
      setData(resp);
    } catch (e: any) {
      setError(e?.message || 'Failed to check edit window');
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
