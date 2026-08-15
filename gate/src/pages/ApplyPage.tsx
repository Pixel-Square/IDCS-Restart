import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, FilePlus2, Layers3 } from 'lucide-react'
import { fetchApplicationTypes, type ApplicationTypeListItem } from '../services/applications'
import { ensureProfilePhotoPresent } from '../services/auth'

export default function ApplyPage(): JSX.Element {
  const navigate = useNavigate()
  const [types, setTypes] = useState<ApplicationTypeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const typesRes = await fetchApplicationTypes()
        if (!mounted) return
        setTypes(typesRes)
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load applications.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <section className="page-stack">
      <div className="page-heading apply-heading">
        <div>
          <div className="eyebrow">Apply</div>
          <h2>Applications</h2>
        </div>
        <div className="page-icon"><FilePlus2 size={20} /></div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="section-card glass-panel apply-panel">
        <div className="section-header">
          <div>
            <div className="section-kicker">Available application types</div>
          </div>
          <div className="section-chip"><Layers3 size={14} /> {types.length} types</div>
        </div>

        {loading ? <div className="loading-shell">Loading templates...</div> : null}
        <div className="apply-type-grid">
          {types.map((type) => (
            <button
              key={type.id}
              className="card-3d type-card"
              onClick={async () => {
                const hasPhoto = await ensureProfilePhotoPresent()
                if (!hasPhoto) {
                  window.alert('Please upload your profile photo before applying. You will be taken to Profile.')
                  navigate('/profile')
                  return
                }
                navigate(`/apply/new/${type.id}`)
              }}
            >
              <div className="type-code">{type.code || 'APP'}</div>
              <div className="type-name">{type.name}</div>
              <div className="type-desc">{type.description || 'Open a dynamic form built from the backend schema.'}</div>
              <div className="type-cta">Apply <ArrowRight size={14} /></div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
