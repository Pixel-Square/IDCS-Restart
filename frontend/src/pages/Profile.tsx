import React, { useEffect, useState } from 'react';
import { getMe } from '../services/auth';
import { User, Mail, Shield } from 'lucide-react';
import './Dashboard.css';
import DashboardLayout from '../components/DashboardLayout';

type RoleObj = { name: string };
type Me = {
  id: number;
  username: string;
  email?: string;
  roles?: string[] | RoleObj[];
  permissions?: string[];
  profile_type?: string | null;
  profile_status?: string | null;
  capabilities?: Record<string, string[]>;
};

export default function ProfilePage({ user: initialUser }: { user?: Me | null }) {
  const [user, setUser] = useState<Me | null | undefined>(initialUser === undefined ? null : initialUser);
  const [loading, setLoading] = useState(initialUser ? false : true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialUser) return;
    let mounted = true;
    setLoading(true);
    getMe()
      .then((r) => {
        if (!mounted) return;
        // normalize roles
        const normalized = {
          ...r,
          roles: Array.isArray(r.roles)
            ? r.roles.map((role: string | RoleObj) => (typeof role === 'string' ? role : role.name))
            : [],
        } as Me;
        setUser(normalized);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, [initialUser]);

  if (loading) return <div className="db-loading">Loading profile…</div>;
  if (error) return <div className="db-error">Error loading profile: {error}</div>;
  if (!user) return <div className="db-empty">No profile available</div>;

  const initials = (user.username || 'U').slice(0, 2).toUpperCase();

  return (
    <DashboardLayout>
      <div className="welcome" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 14, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#4f46e5' }}>{initials}</div>
          <div>
            <h1 className="welcome-title">{user.username}</h1>
            <p className="welcome-sub">{user.email || 'No email provided'}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Profile type</div>
          <div style={{ fontWeight: 700 }}>{user.profile_type || '—'}</div>
        </div>
      </div>

      <section style={{ marginTop: 18 }}>
        <h3 className="section-title">Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="entry-card">
            <div className="entry-icon"><User /></div>
            <div>
              <div className="entry-key">Account</div>
              <div className="entry-status">ID: {user.id}</div>
            </div>
          </div>

          <div className="entry-card">
            <div className="entry-icon"><Mail /></div>
            <div>
              <div className="entry-key">Email</div>
              <div className="entry-status">{user.email || '—'}</div>
            </div>
          </div>

          <div className="entry-card">
            <div className="entry-icon"><Shield /></div>
            <div>
              <div className="entry-key">Roles</div>
              <div className="entry-status">{(user.roles || []).join(', ') || '—'}</div>
            </div>
          </div>

          <div className="entry-card">
            <div className="entry-icon"><File /></div>
            <div>
              <div className="entry-key">Permissions</div>
              <div className="entry-status">{(user.permissions || []).slice(0,5).join(', ') || '—'}</div>
            </div>
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}

// local icon to avoid import error if File isn't available from lucide-react in this runtime
function File() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>;
}
