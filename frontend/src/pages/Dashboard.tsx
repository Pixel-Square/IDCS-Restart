import React from 'react';
import DashboardEntryPoints from '../components/DashboardEntryPoints';
import DashboardLayout from '../components/DashboardLayout';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Dashboard</h2>
        <DashboardEntryPoints />
      </div>
    </DashboardLayout>
  );
}
