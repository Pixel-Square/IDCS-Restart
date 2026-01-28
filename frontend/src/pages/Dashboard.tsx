import React from 'react';
import DashboardEntryPoints from '../components/DashboardEntryPoints';
import DashboardLayout from '../components/DashboardLayout';
import './Dashboard.css';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <h2>Dashboard</h2>
      <DashboardEntryPoints />
    </DashboardLayout>
  );
}
