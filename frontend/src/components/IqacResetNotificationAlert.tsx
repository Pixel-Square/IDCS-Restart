import React, { useEffect, useState } from 'react';
import { fetchResetNotifications, dismissResetNotifications, ResetNotification } from '../services/obe';

interface Props {
  teachingAssignmentId: number;
}

export default function IqacResetNotificationAlert({ teachingAssignmentId }: Props): JSX.Element | null {
  const [notifications, setNotifications] = useState<ResetNotification[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const notifs = await fetchResetNotifications(teachingAssignmentId);
        if (!mounted) return;
        // Filter to ensure we only show notifications for this specific teaching assignment
        const filtered = notifs.filter(n => n.teaching_assignment_id === teachingAssignmentId);
        setNotifications(filtered);
        if (filtered.length === 0) setDismissed(true);
      } catch (e) {
        console.error('Failed to fetch reset notifications:', e);
        if (mounted) setDismissed(true);
      }
    })();
    return () => { mounted = false; };
  }, [teachingAssignmentId]);

  const handleDismiss = async () => {
    if (notifications.length === 0) return;
    try {
      const ids = notifications.map(n => n.id);
      await dismissResetNotifications(ids);
      setDismissed(true);
    } catch (e) {
      console.error('Failed to dismiss notifications:', e);
      setDismissed(true); // dismiss UI anyway to avoid blocking user
    }
  };

  if (dismissed || notifications.length === 0) return null;

  const assessmentLabels: Record<string, string> = {
    ssa1: 'SSA1',
    review1: 'Review 1',
    ssa2: 'SSA2',
    review2: 'Review 2',
    cia1: 'CIA1',
    cia2: 'CIA2',
    formative1: 'Formative 1',
    formative2: 'Formative 2',
    model: 'Model Exam',
  };

  // Group notifications by assessment
  const assessments = [...new Set(notifications.map(n => n.assessment))];
  const assessmentNames = assessments.map(a => assessmentLabels[a] || a).join(', ');

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={handleDismiss}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          maxWidth: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, marginBottom: 12, color: '#dc2626', fontSize: 18, fontWeight: 800 }}>
          ⚠️ Course Reset by IQAC
        </h3>
        <p style={{ margin: 0, marginBottom: 16, color: '#374151', lineHeight: 1.6 }}>
          The following assessment(s) have been reset by the IQAC administrator:
        </p>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
            {notifications[0]?.subject_code} — {notifications[0]?.subject_name}
          </div>
          <div style={{ fontSize: 14, color: '#7f1d1d' }}>
            Section: {notifications[0]?.section_name || '—'}
          </div>
          <div style={{ fontSize: 14, color: '#7f1d1d', marginTop: 4 }}>
            Assessments: {assessmentNames}
          </div>
        </div>
        <p style={{ margin: 0, marginBottom: 16, color: '#6b7280', fontSize: 14 }}>
          All previously entered data for these assessment(s) has been cleared. You will need to re-enter the marks.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="obe-btn obe-btn-primary"
            onClick={handleDismiss}
            style={{ minWidth: 80 }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
