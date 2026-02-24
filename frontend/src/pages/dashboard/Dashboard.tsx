import React from 'react';
import DashboardEntryPoints from '../../components/layout/DashboardEntryPoints';
import DashboardLayout from '../../components/layout/DashboardLayout';
import UserQueriesComponent from '../../components/UserQueriesComponent';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Dashboard</h2>
        <DashboardEntryPoints />
        
        {/* User Queries Section */}
        <div className="mt-8">
          <UserQueriesComponent />
        </div>
      </div>
    </DashboardLayout>
  );
}
