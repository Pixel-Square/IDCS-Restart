import { useState } from 'react'
import { Eye, EyeOff, Code2, Zap, Shield, Terminal } from 'lucide-react'
import { useAuth } from '../../AuthContext'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      // DRF returns errors in various shapes: detail, non_field_errors, identifier, etc.
      const data = err?.response?.data
      let msg = 'Invalid credentials. Please try again.'
      if (data) {
        if (typeof data === 'string') {
          msg = data
        } else if (data.detail) {
          msg = data.detail
        } else if (data.non_field_errors) {
          msg = Array.isArray(data.non_field_errors) ? data.non_field_errors.join(' ') : data.non_field_errors
        } else if (data.identifier) {
          msg = Array.isArray(data.identifier) ? data.identifier.join(' ') : data.identifier
        } else {
          // Show first value in the error object
          const firstKey = Object.keys(data)[0]
          const firstVal = data[firstKey]
          msg = Array.isArray(firstVal) ? firstVal.join(' ') : String(firstVal)
        }
      } else if (err?.message) {
        msg = err.message
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { icon: Code2, label: 'Monaco Editor', desc: 'Full IDE in browser' },
    { icon: Zap, label: 'Docker Sandbox', desc: 'Secure code execution' },
    { icon: Shield, label: 'Locked Regions', desc: 'Tamper-proof code' },
    { icon: Terminal, label: 'Live Output', desc: 'Instant feedback' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--bg-base)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle at 20% 50%, rgba(99,102,241,0.08) 0%, transparent 50%),
                          radial-gradient(circle at 80% 20%, rgba(139,92,246,0.08) 0%, transparent 50%)`,
        pointerEvents: 'none',
      }} />

      {/* Left panel */}
      <div style={{
        flex: '0 0 52%',
        background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '4rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Glowing orb */}
        <div style={{
          position: 'absolute',
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          top: '10%', left: '-100px',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem', animation: 'fadeIn 0.6s ease' }}>
          <div style={{
            width: 52, height: 52,
            background: 'linear-gradient(135deg, var(--brand-from), var(--brand-to))',
            borderRadius: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(99,102,241,0.4)',
          }}>
            <Code2 size={26} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              IDCS <span className="text-gradient">Coder</span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Integrated Development & Assessment Platform</div>
          </div>
        </div>

        <h1 style={{
          fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.2,
          marginBottom: '1.25rem',
          animation: 'fadeIn 0.6s ease 0.1s both',
        }}>
          Build. Run.{' '}
          <span className="text-gradient" style={{ animation: 'glow 3s ease-in-out infinite' }}>Learn.</span>
        </h1>

        <p style={{
          color: 'var(--text-secondary)', fontSize: '1.0625rem', lineHeight: 1.7,
          marginBottom: '3rem',
          animation: 'fadeIn 0.6s ease 0.2s both',
        }}>
          A CodeTantra-style coding platform integrated with your college's IDCS system.
          Real-time execution, automated grading, and comprehensive analytics.
        </p>

        {/* Feature cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem',
          animation: 'fadeIn 0.6s ease 0.3s both',
        }}>
          {features.map(({ icon: Icon, label, desc }) => (
            <div key={label} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '1rem',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{
                width: 34, height: 34, flexShrink: 0,
                background: 'rgba(99,102,241,0.1)',
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={16} color="var(--brand-light)" />
              </div>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Code preview decoration */}
        <div style={{
          marginTop: '2.5rem',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          animation: 'fadeIn 0.6s ease 0.4s both',
        }}>
          <span style={{ color: 'var(--accent-purple)' }}>public class</span>{' '}
          <span style={{ color: 'var(--accent-blue)' }}>Main</span>{' {'}
          <br />
          {'  '}<span style={{ color: 'var(--accent-purple)' }}>public static void</span>{' '}
          <span style={{ color: 'var(--accent-green)' }}>main</span>(String[] args){' {'}
          <br />
          {'    '}System.out.println(<span style={{ color: 'var(--accent-yellow)' }}>"Hello, IDCS Coder!"</span>);
          <br />
          {'  }'}
          <br />
          {'}'}
          <span style={{
            display: 'inline-block', width: 2, height: '0.9em',
            background: 'var(--brand)',
            marginLeft: 2,
            animation: 'pulse-brand 1s infinite',
            verticalAlign: 'text-bottom',
          }} />
        </div>
      </div>

      {/* Right panel - Login form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 420,
          animation: 'fadeIn 0.5s ease',
        }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>Welcome back</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
              Sign in with your IDCS credentials
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="label" htmlFor="coder-email">Email / Reg No / Staff ID</label>
              <input
                id="coder-email"
                className="input"
                type="text"
                placeholder="email, reg no, or staff ID"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="coder-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="coder-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '2px',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent-red)',
                fontSize: '0.875rem',
              }}>
                {error}
              </div>
            )}

            <button
              id="coder-login-btn"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ justifyContent: 'center', marginTop: '0.5rem' }}
            >
              {loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
          }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Note:</strong>{' '}
            Use the same credentials as your IDCS account. Roles (Admin, Incharge, Student) are assigned by your institution's admin.
          </div>
        </div>
      </div>
    </div>
  )
}
