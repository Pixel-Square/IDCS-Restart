import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth, useRole } from '../AuthContext'
import {
  LayoutDashboard, BookOpen, BarChart2,
  Code2, LogOut, ChevronRight,
  Layers, Eye,
} from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()
  const { isAdmin, isIncharge, isSectionIncharge } = useRole()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Code2 size={18} color="#fff" />
          </div>
          <div>
            <div className="sidebar-logo-text">IDCS Coder</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {isAdmin ? 'Code Admin' : isIncharge ? 'Course Incharge' : isSectionIncharge ? 'Section Incharge' : 'Student'}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {/* Admin nav */}
          {isAdmin && (
            <>
              <div className="nav-section">
                <div className="nav-label">Overview</div>
                <NavLink to="/admin" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <LayoutDashboard size={16} /> Dashboard
                </NavLink>
                <NavLink to="/admin/analytics" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <BarChart2 size={16} /> Analytics
                </NavLink>
              </div>
              <div className="nav-section">
                <div className="nav-label">Management</div>
                <NavLink to="/admin/courses" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <BookOpen size={16} /> Courses
                </NavLink>
                <NavLink to="/admin/classes" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <Layers size={16} /> Classes
                </NavLink>
              </div>
            </>
          )}

          {/* Incharge nav */}
          {isIncharge && (
            <>
              <div className="nav-section">
                <div className="nav-label">My Courses</div>
                <NavLink to="/incharge" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <LayoutDashboard size={16} /> Dashboard
                </NavLink>
              </div>
            </>
          )}

          {/* Student nav */}
          {!isAdmin && !isIncharge && !isSectionIncharge && (
            <>
              <div className="nav-section">
                <div className="nav-label">Learning</div>
                <NavLink to="/student" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <LayoutDashboard size={16} /> Dashboard
                </NavLink>
              </div>
            </>
          )}

          {/* Section Incharge nav */}
          {isSectionIncharge && (
            <>
              <div className="nav-section">
                <div className="nav-label">Monitor</div>
                <NavLink to="/section" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <LayoutDashboard size={16} /> Dashboard
                </NavLink>
                <NavLink to="/section/classes" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <Eye size={16} /> My Classes
                </NavLink>
              </div>
            </>
          )}
        </nav>

        {/* User footer */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <div style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, var(--brand-from), var(--brand-to))',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.875rem', fontWeight: 700, color: '#fff',
            flexShrink: 0,
          }}>
            {(user?.full_name || user?.username || '?')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, truncate: true }}>
              {user?.full_name || user?.username}
            </div>
            {user?.student_profile && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {user.student_profile.reg_no}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
