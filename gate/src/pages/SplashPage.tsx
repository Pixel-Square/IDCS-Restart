import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCachedMe } from '../services/auth'

export default function SplashPage(): JSX.Element {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const me = getCachedMe()
      navigate(me ? '/dashboard' : '/login', { replace: true })
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [navigate])

  return (
    <div className="splash-screen">
      <div className="splash-orb splash-orb-a" />
      <div className="splash-orb splash-orb-b" />
      <div className="splash-card glass-panel">
        <div className="brand-mark brand-mark-lg">G</div>
        <div className="splash-copy">
          <div className="eyebrow">Gate</div>
          <h1>Cloudy. Calm. Fast.</h1>
          <p>Applications and approvals.</p>
        </div>
        <div className="splash-loader">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
