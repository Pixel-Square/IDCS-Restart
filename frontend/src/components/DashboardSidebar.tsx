
import React from 'react';
import { Link, useLocation } from 'react-router-dom';



import useDashboard from '../hooks/useDashboard';
import { User, BookOpen, Layout, Grid, Home } from 'lucide-react';
import './DashboardSidebar.css';
import { useSidebar } from './SidebarContext';

const ICON_MAP: Record<string, any> = {
  profile: User,
  curriculum_master: BookOpen,
  department_curriculum: Layout,
  student_curriculum_view: Grid,
  home: Home,
  obe: BookOpen,
  obe_master: BookOpen,
};

export default function DashboardSidebar({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error } = useDashboard(baseUrl);
  const loc = useLocation();
  const { collapsed } = useSidebar();

  if (loading) return <aside className="dsb">Loading</aside>;
  if (error) return <aside className="dsb">Error loading sidebar</aside>;
  if (!data) return <aside className="dsb">Nodata</aside>;

  const entry = data.entry_points || {};

  const items: Array<{ key: string; label: string; to: string }> = [];
  if (entry.curriculum_master) items.push({ key: 'curriculum_master', label: 'Curriculum Master', to: '/curriculum/master' });
  if (entry.department_curriculum) items.push({ key: 'department_curriculum', label: 'Department Curriculum', to: '/curriculum/department' });
  if (entry.student_curriculum_view) items.push({ key: 'student_curriculum_view', label: 'My Curriculum', to: '/curriculum/student' });

  // fallback: always show profile
  items.unshift({ key: 'profile', label: 'Profile', to: '/profile' });


  const perms = (data.permissions || []).map((p) => String(p || '').toLowerCase());
<<<<<<< HEAD
  const roles = (data.roles || []).map((r) => typeof r === 'string' ? r.toLowerCase() : (r.name || '').toLowerCase());
  const isStaff = roles.includes('staff');
  const canObe = perms.some((p) => ['obe.view', 'obe.cdap.upload', 'obe.master.manage'].includes(p));
  const canObeMaster = perms.includes('obe.master.manage');

  // Always show OBE button at the end
  const obeItem = { key: 'obe', label: 'OBE', to: '/obe' };
  // Show OBE Master only for IQAC role
  if (roles.includes('iqac')) items.push({ key: 'obe_master', label: 'OBE Master', to: '/obe/master' });
=======
  const canObeMaster = perms.includes('obe.master.manage');

  items.push({ key: 'obe', label: 'OBE', to: '/obe' });
  if (canObeMaster) items.push({ key: 'obe_master', label: 'OBE Master', to: '/obe/master' });
>>>>>>> origin/rohit

  return (
    <aside className={`dsb modern-dsb ${collapsed ? 'collapsed' : ''}`}>
      <div className="dsb-header">Menu</div>
      <ul className="dsb-list">
        <li className="dsb-item">
          <Link to="/dashboard" className="dsb-link">
            <span className="dsb-icon"><Home /></span>
            <span className="dsb-label">Dashboard</span>
          </Link>
        </li>
        {items.map(i => {
          const Icon = ICON_MAP[i.key] || ICON_MAP.home || User;
          const active = loc.pathname.startsWith(i.to);
          return (
            <li key={i.key} className={`dsb-item ${active ? 'active' : ''}`}>
              <Link to={i.to} className="dsb-link">
                <span className="dsb-icon"><Icon /></span>
                <span className="dsb-label">{i.label}</span>
              </Link>
            </li>
          );
        })}
        {/* OBE button at the bottom */}
        <li key={obeItem.key} className={`dsb-item ${loc.pathname.startsWith(obeItem.to) ? 'active' : ''}`}>
          <Link to={obeItem.to} className="dsb-link">
            <span className="dsb-icon">{ICON_MAP.obe ? <ICON_MAP.obe /> : <User />}</span>
            <span className="dsb-label">{obeItem.label}</span>
          </Link>
        </li>
      </ul>
    </aside>
  );
}
