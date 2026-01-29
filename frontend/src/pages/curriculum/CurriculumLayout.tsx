import React from 'react';
import DashboardLayout from '../../components/DashboardLayout';

export default function CurriculumLayout({ children }: { children?: React.ReactNode }) {
  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1100 }}>
        {children}
      </div>
    </DashboardLayout>
  );
}
