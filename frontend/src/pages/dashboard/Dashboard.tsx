import React from 'react';
import DashboardEntryPoints from '../../components/layout/DashboardEntryPoints';
import DashboardLayout from '../../components/layout/DashboardLayout';
import UserQueriesComponent from '../../components/UserQueriesComponent';
import SwapRequestPopup from '../../components/SwapRequestPopup';
import AttendanceRequestPopup from '../../components/AttendanceRequestPopup';
import { getCachedMe } from '../../services/auth';
import { fetchNotifications, type UserNotification } from '../../services/proposalService';
import { X } from 'lucide-react';

export default function DashboardPage() {
  const [user, setUser] = React.useState<any>(null);
  const [semesterAlerts, setSemesterAlerts] = React.useState<UserNotification[]>([]);
  const [activeAlertIndex, setActiveAlertIndex] = React.useState(0);

  const isHrUser = React.useMemo(() => {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const normalized = roles
      .map((r: any) => (typeof r === 'string' ? r : r?.name))
      .map((r: any) => String(r || '').trim().toUpperCase());
    return normalized.includes('HR');
  }, [user]);

  React.useEffect(() => {
    // Use cached user data instead of making API call
    const cachedUser = getCachedMe();
    setUser(cachedUser);

    const onMeUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      setUser(detail);
    };

    window.addEventListener('idcs:me-updated', onMeUpdated as EventListener);
    return () => window.removeEventListener('idcs:me-updated', onMeUpdated as EventListener);
  }, []);

  React.useEffect(() => {
    if (!isHrUser) {
      setSemesterAlerts([]);
      setActiveAlertIndex(0);
      return;
    }

    let cancelled = false;

    const loadHrSemesterAlerts = async () => {
      try {
        const rows = await fetchNotifications();
        if (cancelled) return;
        const alerts = (rows || []).filter((n) => {
          const t = String(n?.data?.type || '').toLowerCase();
          return !n.read && (t === 'template_period_expired' || t === 'vacation_semester_expired');
        });
        setSemesterAlerts(alerts);
        setActiveAlertIndex(0);
      } catch {
        if (!cancelled) {
          setSemesterAlerts([]);
          setActiveAlertIndex(0);
        }
      }
    };

    loadHrSemesterAlerts();
    return () => {
      cancelled = true;
    };
  }, [isHrUser]);

  const closeCurrentAlert = React.useCallback(() => {
    setSemesterAlerts((prev) => {
      if (prev.length <= 1) {
        return [];
      }
      const next = prev.filter((_, idx) => idx !== activeAlertIndex);
      return next;
    });
    setActiveAlertIndex(0);
  }, [activeAlertIndex]);

  const activeAlert = semesterAlerts[activeAlertIndex] || null;

  return (
    <>
      {isHrUser && activeAlert && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/30 p-4 pt-20">
          <div className="w-full max-w-2xl rounded-xl border-2 border-red-300 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-red-800">Semester Reset Required</h3>
                <p className="mt-1 text-sm text-red-700">Please update the new from/to reset period for this form.</p>
              </div>
              <button
                type="button"
                onClick={closeCurrentAlert}
                className="rounded-md p-1 text-red-700 hover:bg-red-100"
                aria-label="Close alert"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4">
              <p className="text-sm font-semibold text-gray-900">{activeAlert.title}</p>
              <p className="mt-2 text-sm text-gray-700">{activeAlert.message}</p>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
              <span className="text-xs text-gray-500">
                This popup will continue to appear on HR login until reset period is updated.
              </span>
              <button
                type="button"
                onClick={closeCurrentAlert}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Request Popup - rendered outside layout to avoid stacking context issues */}
      {user?.profile_type === 'STAFF' && (
        <SwapRequestPopup />
      )}
      {/* Attendance Assignment Request Popup */}
      {user?.profile_type === 'STAFF' && (
        <AttendanceRequestPopup />
      )}
      
      <DashboardLayout>
      
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Dashboard</h2>
        
        <DashboardEntryPoints user={user} />
        
        {/* User Queries Section */}
        <div className="mt-8">
          <UserQueriesComponent user={user} />
        </div>
      </div>
      </DashboardLayout>
    </>
  );
}
