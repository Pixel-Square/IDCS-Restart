import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, Smartphone, Sparkles } from 'lucide-react'
import { getMe, login } from '../services/auth'

type LoginPageProps = {
  onLoggedIn: (user: Awaited<ReturnType<typeof getMe>>) => void
}

export default function LoginPage({ onLoggedIn }: LoginPageProps): JSX.Element {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(identifier.trim(), password)
      const user = await getMe()
      onLoggedIn(user)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      const data = err?.response?.data
      let message = 'Login failed.'
      if (data) {
        if (typeof data === 'string') message = data
        else if (data.detail) message = data.detail
        else if (data.non_field_errors) message = Array.isArray(data.non_field_errors) ? data.non_field_errors.join(' ') : String(data.non_field_errors)
        else if (data.identifier) message = Array.isArray(data.identifier) ? data.identifier.join(' ') : String(data.identifier)
      } else if (err?.message) {
        message = err.message
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-glow auth-glow-a" />
      <div className="auth-glow auth-glow-b" />

      <div className="auth-card glass-panel">
        <div className="auth-head">
          <div className="brand-mark brand-mark-lg">G</div>
          <div>
            <div className="eyebrow">Login</div>
            <h1>Gate</h1>
            <p>db.zynix.us</p>
          </div>
        </div>

        <div className="auth-highlights">
          <div className="highlight-chip"><span>Student</span><small>My applications</small></div>
          <div className="highlight-chip"><span>Faculty</span><small>Pending approvals</small></div>
          <div className="highlight-chip"><span>History</span><small>Track status</small></div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="gate-identifier">ID</label>
          <div className="field-shell">
            <Smartphone size={16} />
            <input
              id="gate-identifier"
              className="field-input"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              placeholder="Username / Reg No / Staff ID"
              required
            />
          </div>

          <label className="field-label" htmlFor="gate-password">Password</label>
          <div className="field-shell">
            <LockKeyhole size={16} />
            <input
              id="gate-password"
              className="field-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Password"
              required
            />
            <button type="button" className="field-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}

          <button type="submit" className="primary-3d-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <div className="hint-strip">
          <Sparkles size={16} />
          <span>Mobile approvals.</span>
        </div>
      </div>
    </div>
  )
}
