import React from 'react';
import useDashboard from '../hooks/useDashboard';
import { User, Layout, BookOpen, FileText, Grid } from 'lucide-react';
import '../pages/Dashboard.css';

const ICON_MAP: Record<string, any> = {
  profile: User,
  curriculum_master: BookOpen,
  department_curriculum: Layout,
  student_curriculum_view: Grid,
};

export default function DashboardEntryPoints({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error, refresh } = useDashboard(baseUrl);

  if (loading) return <div className="db-loading">Loading dashboard…</div>;
  if (error)
    return (
      <div className="db-error">
        <div>Error loading dashboard: {String(error)}</div>
        <button onClick={refresh} className="btn-primary">Retry</button>
      </div>
    );
  if (!data) return <div className="db-empty">No dashboard data</div>;

  const entry = data.entry_points || {};
  const flags = data.flags || {};

  const items = Object.entries(entry).map(([k, v]) => ({ key: k, available: Boolean(v) }));

  return (
    <section className="db-content">
      <div className="welcome">
        <div className="welcome-left">
          <User className="welcome-icon" />
          <div>
            <h1 className="welcome-title">Welcome back</h1>
            <p className="welcome-sub">Quick overview of your account and shortcuts.</p>
          </div>
        </div>
        <div className="welcome-actions">
          <button className="btn-primary" onClick={refresh}>Refresh</button>
        </div>
      </div>

      <h3 className="section-title">Quick Links</h3>
      <div className="entry-grid">
        {items.map(i => {
          const Icon = ICON_MAP[i.key] || FileText;
          return (
            <article key={i.key} className={`entry-card ${i.available ? 'available' : 'disabled'}`}>
              <div className="entry-icon"><Icon /></div>
              <div className="entry-body">
                <div className="entry-key">{i.key.replace(/_/g, ' ')}</div>
                <div className="entry-status">{i.available ? 'Available' : 'Locked'}</div>
              </div>
            </article>
          );
        })}
      </div>

      <h4 className="section-title">Flags</h4>
      <ul className="flags-list">
        {Object.entries(flags).map(([k, v]) => (
          <li key={k} className="flag-item">{k}: <strong>{String(v)}</strong></li>
        ))}
      </ul>
    </section>
  );
}
