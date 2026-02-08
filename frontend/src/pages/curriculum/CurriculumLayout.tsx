import React from 'react';
import DashboardLayout from '../../components/DashboardLayout';

export default function CurriculumLayout({ children }: { children?: React.ReactNode }) {
  return (
    <DashboardLayout>
      <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', background: 'none' }}>
        {children}
      </div>
    </DashboardLayout>
  );
}