import React from 'react';
import DashboardEntryPoints from '../components/DashboardEntryPoints';
import DashboardSidebar from '../components/DashboardSidebar';
import './Dashboard.css';

export default function DashboardPage() {
  return (
    <div className="dashboard-root">
      <DashboardSidebar />
      <main className="dashboard-main">
        <h2>Dashboard</h2>
        <DashboardEntryPoints />
      </main>
    </div>
  );
}
