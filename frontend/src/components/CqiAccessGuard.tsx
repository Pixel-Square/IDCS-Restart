import React, { useCallback, useEffect, useRef, useState } from 'react';
import CqiAccessAlert from './CqiAccessAlert';
import {
  CqiPublicationStatusResponse,
  fetchCqiPublicationStatus,
} from '../services/obe';
import {
  CqiCycle,
  detectCycleFromCos,
  getRequiredComponentsForCycle,
  resolveGuardedCourseType,
} from '../utils/cqiAccessGuard';

const COUNTDOWN_SECONDS = 3;

type Props = {
  subjectId: string;
  teachingAssignmentId: number | null | undefined;
  classType: string | null | undefined;
  cos: ReadonlyArray<string | number> | null | undefined;
  onRedirect: (tabKey: string) => void;
  children: React.ReactNode;
};

type State =
  | { kind: 'validating' }
  | { kind: 'allowed' }
  | { kind: 'blocked'; firstUnpublishedLabel: string; firstUnpublishedTabKey: string; cycle: CqiCycle }
  | { kind: 'error'; message: string };

export default function CqiAccessGuard({
  subjectId,
  teachingAssignmentId,
  classType,
  cos,
  onRedirect,
  children,
}: Props): JSX.Element {
  const [state, setState] = useState<State>({ kind: 'validating' });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const redirectFiredRef = useRef(false);

  const cycle = detectCycleFromCos(cos);
  const courseType = resolveGuardedCourseType(classType);

  const runValidation = useCallback(async () => {
    if (cycle === null) {
      // No COs to guard against — render children.
      setState({ kind: 'allowed' });
      return;
    }
    setState({ kind: 'validating' });
    redirectFiredRef.current = false;
    try {
      const result: CqiPublicationStatusResponse = await fetchCqiPublicationStatus(
        subjectId,
        typeof teachingAssignmentId === 'number' ? teachingAssignmentId : null,
        cycle,
        courseType,
      );
      if (result.all_published || !result.first_unpublished) {
        setState({ kind: 'allowed' });
        return;
      }
      // Prefer the label from our own matrix so course-type-specific labels (LAB 1, Review 1)
      // win even if the backend matrix drifts.
      const required = getRequiredComponentsForCycle(classType, cycle);
      const fromMatrix = required.find((c) => c.key === result.first_unpublished!.key);
      setState({
        kind: 'blocked',
        firstUnpublishedLabel: fromMatrix?.label || result.first_unpublished.label,
        firstUnpublishedTabKey: fromMatrix?.tabKey || result.first_unpublished.tab_key,
        cycle,
      });
    } catch (err: any) {
      setState({
        kind: 'error',
        message: err?.message ? String(err.message) : 'Unable to verify exam publication status.',
      });
    }
  }, [cycle, courseType, classType, subjectId, teachingAssignmentId]);

  useEffect(() => {
    runValidation();
  }, [runValidation, refreshToken]);

  // Re-validate when faculty publishes or resets marks elsewhere in the tab.
  useEffect(() => {
    const onPublished = () => setRefreshToken((t) => t + 1);
    const onReset = () => setRefreshToken((t) => t + 1);
    window.addEventListener('obe:published', onPublished);
    window.addEventListener('obe:reset', onReset);
    return () => {
      window.removeEventListener('obe:published', onPublished);
      window.removeEventListener('obe:reset', onReset);
    };
  }, []);

  // Countdown + auto-redirect while blocked.
  useEffect(() => {
    if (state.kind !== 'blocked') {
      setCountdown(null);
      return;
    }
    setCountdown(COUNTDOWN_SECONDS);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = COUNTDOWN_SECONDS - elapsed;
      if (remaining <= 0) {
        window.clearInterval(interval);
        setCountdown(0);
        if (!redirectFiredRef.current) {
          redirectFiredRef.current = true;
          onRedirect(state.firstUnpublishedTabKey);
        }
        return;
      }
      setCountdown(remaining);
    }, 250);
    return () => window.clearInterval(interval);
  }, [state, onRedirect]);

  if (state.kind === 'validating') {
    return (
      <div style={{ padding: 24, color: '#6b7280', fontSize: 14 }}>
        Checking exam publication status…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div
        style={{
          margin: '24px auto',
          maxWidth: 720,
          background: '#FEF3C7',
          border: '2px solid #F59E0B',
          borderRadius: 8,
          padding: '16px 20px',
          color: '#78350f',
        }}
        role="alert"
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Unable to validate exam assignments</div>
        <div style={{ fontSize: 14, marginBottom: 12 }}>{state.message}</div>
        <button type="button" className="obe-btn obe-btn-primary" onClick={() => setRefreshToken((t) => t + 1)}>
          Retry
        </button>
      </div>
    );
  }

  if (state.kind === 'blocked') {
    return (
      <CqiAccessAlert
        cycle={state.cycle}
        unpublishedLabel={state.firstUnpublishedLabel}
        countdownSeconds={countdown}
        onGoNow={() => {
          if (redirectFiredRef.current) return;
          redirectFiredRef.current = true;
          onRedirect(state.firstUnpublishedTabKey);
        }}
        onDismiss={() => {
          redirectFiredRef.current = true;
          setRefreshToken((t) => t + 1);
        }}
      />
    );
  }

  return <>{children}</>;
}
