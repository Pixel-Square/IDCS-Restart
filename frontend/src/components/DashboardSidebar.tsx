import React from 'react';
import { Link } from 'react-router-dom';
import useDashboard from '../hooks/useDashboard';
import './DashboardSidebar.css';

export default function DashboardSidebar({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error } = useDashboard(baseUrl);

  if (loading) return <aside className="dsb">Loading…</aside>;
  if (error) return <aside className="dsb">Error loading sidebar</aside>;
  if (!data) return <aside className="dsb">No data</aside>;

  const entry = data.entry_points || {};

  const items: Array<{ key: string; label: string; to: string }> = [];
  if (entry.curriculum_master) items.push({ key: 'curriculum_master', label: 'Curriculum Master', to: '/curriculum/master' });
  if (entry.department_curriculum) items.push({ key: 'department_curriculum', label: 'Department Curriculum', to: '/curriculum/department' });
  if (entry.student_curriculum_view) items.push({ key: 'student_curriculum_view', label: 'My Curriculum', to: '/curriculum/student' });

  // fallback: always show profile
  items.unshift({ key: 'profile', label: 'Profile\n  { label: 'OBE', href: '/staff/obe', show: dashboard?.is_staff === true },', to: '/profile' });

  return (
    <aside className="dsb">
      <div className="dsb-header">Navigation</div>
      <ul className="dsb-list">
        {items.map(i => (
          <li key={i.key} className="dsb-item">
            <Link to={i.to}>{i.label}</Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
