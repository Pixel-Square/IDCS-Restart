import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchAttendanceNotificationCount } from '../services/academics';
import { ATTENDANCE_REQUEST_PROCESSED_EVENT } from '../pages/staff/AttendanceRequests';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Polls the backend every 30 seconds to get the pending attendance
 * unlock-request count visible to the current user (HOD or IQAC only).
 *
 * Call `refresh()` imperatively after a request is processed so
 * the badge updates immediately without waiting for the next poll.
 */
export function useAttendanceNotificationCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const [role, setRole] = useState<string>('none');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await fetchAttendanceNotificationCount();
      setCount(data.count ?? 0);
      setRole(data.role ?? 'none');
    } catch {
      // Silently ignore errors (network down, not authenticated, etc.)
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      setRole('none');
      return;
    }

    load();
    timerRef.current = setInterval(load, POLL_INTERVAL_MS);

    // Refresh immediately when the user processes a request on the requests page
    window.addEventListener(ATTENDANCE_REQUEST_PROCESSED_EVENT, load);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener(ATTENDANCE_REQUEST_PROCESSED_EVENT, load);
    };
  }, [enabled, load]);

  return { count, role, refresh: load };
}
