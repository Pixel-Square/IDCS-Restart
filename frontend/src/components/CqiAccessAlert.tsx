import React from 'react';

type Props = {
  cycle: 1 | 2 | 3;
  unpublishedLabel: string;
  countdownSeconds: number | null;
  onGoNow: () => void;
  onDismiss: () => void;
};

export default function CqiAccessAlert({
  cycle,
  unpublishedLabel,
  countdownSeconds,
  onGoNow,
  onDismiss,
}: Props): JSX.Element {
  const cycleLabel = cycle === 3 ? 'MODEL Exam' : `Cycle ${cycle}`;

  return (
    <div
      style={{
        margin: '24px auto',
        maxWidth: 720,
        background: '#FEE2E2',
        border: '3px solid #DC2626',
        borderRadius: 8,
        padding: '20px 24px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        color: '#7f1d1d',
      }}
      role="alert"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
        <span aria-hidden>⚠️</span>
        <span>Exam Assignments Incomplete</span>
      </div>
      <div style={{ fontSize: 15, marginBottom: 12 }}>
        Kindly enter and publish other exam marks before opening this CQI page.
      </div>
      <div style={{ fontSize: 14, marginBottom: 6 }}>
        <strong>CQI cycle:</strong> {cycleLabel}
      </div>
      <div style={{ fontSize: 14, marginBottom: 14 }}>
        <strong>Unpublished:</strong> {unpublishedLabel}
      </div>
      {countdownSeconds !== null && (
        <div style={{ fontSize: 13, marginBottom: 14, color: '#991b1b' }}>
          Redirecting to <strong>{unpublishedLabel}</strong> in {countdownSeconds}s…
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="obe-btn obe-btn-primary" onClick={onGoNow}>
          Go to {unpublishedLabel} now
        </button>
        <button type="button" className="obe-btn obe-btn-secondary" onClick={onDismiss}>
          Dismiss &amp; retry
        </button>
      </div>
    </div>
  );
}
