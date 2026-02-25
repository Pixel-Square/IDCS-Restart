import React from 'react';
import DashboardEntryPoints from '../../components/layout/DashboardEntryPoints';
import DashboardLayout from '../../components/layout/DashboardLayout';
import UserQueriesComponent from '../../components/UserQueriesComponent';
import { getMe } from '../../services/auth';

export default function DashboardPage() {
  const [user, setUser] = React.useState<any>(null);

  React.useEffect(() => {
    getMe().then(setUser).catch(console.error);
  }, []);

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Dashboard</h2>
        <DashboardEntryPoints user={user} />
        
        {/* User Queries Section */}
        <div className="mt-8">
          <UserQueriesComponent />
        </div>
      </div>
    </DashboardLayout>
  );
}
