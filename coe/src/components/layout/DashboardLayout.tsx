import React from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl">{children}</div>;
}
