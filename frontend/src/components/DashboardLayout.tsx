import React from 'react';
import DashboardSidebar from './DashboardSidebar';
import '../pages/Dashboard.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-root">
      <DashboardSidebar />
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
