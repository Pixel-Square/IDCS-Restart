import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, SquarePen, History, UserRound, ShieldCheck, LogOut, Layers3 } from 'lucide-react'
import { GateUser, logout } from '../services/auth'
import { getMediaUrl } from '../services/apiBase'

type ShellProps = {
  user: GateUser | null
  children: React.ReactNode
}

function getDisplayName(user: GateUser | null): string {
  if (!user) return 'Guest'
  const full = `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim()
  return full || user.username || 'User'
}

function getInitials(user: GateUser | null): string {
  const name = getDisplayName(user)
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

function resolveAvatar(user: GateUser | null): string {
  const candidates = [user?.profile_image, user?.profile?.profile_image, user?.profile_image_url, user?.profile?.profile_image_url]
  for (const candidate of candidates) {
    const value = getMediaUrl(candidate)
    if (value) return value
  }
  return ''
}

export function Shell({ user, children }: ShellProps): JSX.Element {
  const location = useLocation()
  const avatar = resolveAvatar(user)
  const role = String(user?.role || user?.profile_type || 'User').toUpperCase()
  const isApproverArea = location.pathname.startsWith('/approvals')
  const isStaffRole = role.includes('STAFF')

  const items = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/apply', label: 'Apply', icon: SquarePen },
    ...(isStaffRole ? [{ to: '/approvals', label: 'Approvals', icon: Layers3 }] : []),
    { to: '/history', label: 'History', icon: History },
    { to: '/profile', label: 'Profile', icon: UserRound },
  ]

  return (
    <div className="app-shell">
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />

      <header className="topbar glass-panel">
        <div className="topbar-left">
          <div className="brand-mark">G</div>
          <div>
            <div className="topbar-title">Gate Portal</div>
            <div className="topbar-subtitle">Mobile approval workspace</div>
          </div>
        </div>

        <div className="topbar-right">
          <div className="user-chip">
            <span className="user-chip-role">{role}</span>
            <span className="user-chip-name">{getDisplayName(user)}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              logout()
              window.location.href = '/login'
            }}
            aria-label="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="app-content">
        <div className="profile-hero glass-panel">
          <div className="avatar-frame">
            {avatar ? (
              <img src={avatar} alt="Profile" className="avatar-image" />
            ) : (
              <div className="avatar-fallback">{getInitials(user)}</div>
            )}
          </div>
          <div className="profile-hero-copy">
            <div className="eyebrow">Welcome back</div>
            <h1>{getDisplayName(user)}</h1>
            <p>{user?.email || user?.username || 'Signed in securely with the backend at db.zynix.us'}</p>
          </div>
          <div className="profile-hero-badge">
            <ShieldCheck size={16} />
            <span>{isApproverArea ? 'Approver mode' : 'Secure session'}</span>
          </div>
        </div>

        <div className="screen-body">{children}</div>
      </main>

      <nav className="bottom-nav glass-panel" aria-label="Primary navigation" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
