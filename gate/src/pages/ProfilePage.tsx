import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { getCachedMe, logout } from '../services/auth'
import { getMediaUrl } from '../services/apiBase'

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

export default function ProfilePage(): JSX.Element {
  const user = getCachedMe()
  const displayName = useMemo(() => {
    const full = `${String(user?.first_name || '').trim()} ${String(user?.last_name || '').trim()}`.trim()
    return full || user?.username || 'User'
  }, [user])
  const avatar = getMediaUrl(user?.profile_image || user?.profile?.profile_image || user?.profile_image_url || user?.profile?.profile_image_url)

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Account</div>
          <h2>Profile</h2>
          <p>Identity, session, and role information tied to the shared backend user record.</p>
        </div>
        <div className="page-icon"><UserRound size={20} /></div>
      </div>

      <article className="profile-panel glass-panel">
        <div className="profile-avatar-wrap">
          {avatar ? <img src={avatar} alt="Profile" className="profile-avatar" /> : <div className="profile-avatar fallback">{initials(displayName)}</div>}
        </div>
        <div className="profile-details">
          <h3>{displayName}</h3>
          <div className="profile-meta"><Mail size={14} /> {user?.email || 'No email on file'}</div>
          <div className="profile-meta"><ShieldCheck size={14} /> {String(user?.role || user?.profile_type || 'USER').toUpperCase()}</div>
          <div className="profile-meta">{user?.profile?.reg_no || user?.profile?.staff_id || user?.username || 'No identifier'}</div>
        </div>
        <div className="profile-actions">
          <button
            type="button"
            className="primary-3d-button"
            onClick={() => {
              logout()
              window.location.href = '/login'
            }}
          >
            <LogOut size={16} /> Logout
          </button>
          <Link className="secondary-3d-button" to="/dashboard">Back to dashboard</Link>
        </div>
      </article>
    </section>
  )
}
