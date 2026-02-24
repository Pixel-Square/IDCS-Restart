import React from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';

export default function CurriculumLayout({ children }: { children?: React.ReactNode }) {
  return (
    <DashboardLayout>
      <div className="flex flex-col w-full max-w-full overflow-x-hidden">
        {children}
      </div>
    </DashboardLayout>
  );
}