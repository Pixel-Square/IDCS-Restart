import React from 'react';
import '../pages/Dashboard.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // DashboardLayout previously rendered the sidebar; layout is now provided by App
  return <>{children}</>;
}
