import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAttendanceNotificationCount } from '../../hooks/useAttendanceNotificationCount';

interface AttendanceNotificationBellProps {
  roles: string[];
}

/**
 * Bell icon with a red badge showing the count of pending attendance
 * unlock requests. Only rendered for HOD and IQAC users.
 * Clicking navigates to the Attendance Analytics – Requests page.
 */
export default function AttendanceNotificationBell({ roles }: AttendanceNotificationBellProps) {
  const rolesUpper = roles.map((r) => r.toUpperCase());
  const isHodOrIqac = rolesUpper.includes('HOD') || rolesUpper.includes('IQAC');

  const { count } = useAttendanceNotificationCount(isHodOrIqac);
  const navigate = useNavigate();

  if (!isHodOrIqac) return null;

  const handleClick = () => {
    navigate('/attendance-analytics/requests');
  };

  return (
    <button
      onClick={handleClick}
      className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={`Attendance requests${count > 0 ? `, ${count} pending` : ''}`}
      title="Attendance Analytics Requests"
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none"
          aria-hidden="true"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
