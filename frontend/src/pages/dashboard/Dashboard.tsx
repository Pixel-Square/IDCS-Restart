import React from 'react';
import DashboardEntryPoints from '../../components/layout/DashboardEntryPoints';
import DashboardLayout from '../../components/layout/DashboardLayout';
import UserQueriesComponent from '../../components/UserQueriesComponent';
import SwapRequestPopup from '../../components/SwapRequestPopup';
import AttendanceRequestPopup from '../../components/AttendanceRequestPopup';
import { getCachedMe } from '../../services/auth';

export default function DashboardPage() {
  const [user, setUser] = React.useState<any>(null);

  React.useEffect(() => {
    // Use cached user data instead of making API call
    const cachedUser = getCachedMe();
    setUser(cachedUser);
  }, []);

  return (
    <>
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
