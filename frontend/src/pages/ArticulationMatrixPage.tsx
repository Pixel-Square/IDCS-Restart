import React, { useEffect, useState } from 'react';
import ArticulationMatrix from '../components/ArticulationMatrix';
import { fetchArticulationMatrix } from '../services/cdapDb';

type Props = { courseId?: string };

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%)',
    padding: '2rem',
  },
  card: {
    maxWidth: '1400px',
    margin: '0 auto',
    background: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '2rem 2.5rem',
    borderBottom: '1px solid #e5e7eb',
  },
  title: {
    fontSize: '1.875rem',
    fontWeight: '700',
    color: '#ffffff',
    margin: '0',
    letterSpacing: '-0.025em',
  },
  subtitle: {
    fontSize: '0.95rem',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: '0.5rem',
    fontWeight: '400',
  },
  content: {
    padding: '2rem 2.5rem',
  },
  inputSection: {
    marginBottom: '1.5rem',
    padding: '1.25rem',
    background: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.5rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.025em',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    border: '2px solid #e5e7eb',
    borderRadius: '6px',
    outline: 'none',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  inputFocus: {
    borderColor: '#667eea',
    boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)',
  },
  actionBar: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    marginBottom: '1.5rem',
    padding: '1.25rem',
    background: '#f9fafb',
    borderRadius: '8px',
  },
  button: {
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#ffffff',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)',
    outline: 'none',
  },
  buttonHover: {
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 8px rgba(102, 126, 234, 0.4)',
  },
  buttonDisabled: {
    background: '#9ca3af',
    cursor: 'not-allowed',
    boxShadow: 'none',
    opacity: 0.6,
  },
  infoText: {
    fontSize: '0.875rem',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  infoIcon: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#667eea',
    color: '#ffffff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: '700',
  },
  alert: {
    padding: '1rem 1.25rem',
    borderRadius: '8px',
    fontSize: '0.925rem',
    marginBottom: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontWeight: '500',
  },
  alertSuccess: {
    background: '#d1fae5',
    color: '#065f46',
    border: '1px solid #6ee7b7',
  },
  alertError: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fca5a5',
  },
  matrixContainer: {
    background: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '1.5rem',
    minHeight: '200px',
  },
  loadingSpinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTop: '2px solid #ffffff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
    marginRight: '0.5rem',
  },
};

export default function ArticulationMatrixPage({ courseId }: Props) {
  const [subject, setSubject] = useState<string>(courseId || '');
  const [matrix, setMatrix] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!subject) return;
    // Auto-load matrix from backend (computed from saved CDAP revision)
    (async () => {
      setStatus('loading');
      setMessage(null);
      try {
        const data = await fetchArticulationMatrix(subject);
        setMatrix(data);
        setStatus('success');
      } catch (e: any) {
        setMatrix(null);
        setStatus('error');
        setMessage(e?.message || 'Articulation Matrix fetch failed.');
      }
    })();
  }, [subject]);

  async function refresh() {
    if (!subject) return;
    setStatus('loading');
    setMessage(null);
    try {
      const data = await fetchArticulationMatrix(subject);
      setMatrix(data);
      setStatus('success');
      const unitCount = Array.isArray(data?.units) ? data.units.length : 0;
      setMessage(`Loaded articulation matrix from saved CDAP. Units: ${unitCount}.`);
    } catch (e: any) {
      setStatus('error');
      setMessage(e?.message || 'Articulation Matrix fetch failed.');
    }
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Articulation Matrix</h1>
          <p style={styles.subtitle}>
            {subject ? `Course: ${subject}` : 'Select a course to view the articulation matrix'}
          </p>
        </div>

        <div style={styles.content}>
          {!courseId && (
            <div style={styles.inputSection}>
              <label style={styles.label}>Course ID</label>
              <input 
                value={subject} 
                onChange={e => setSubject(e.target.value)} 
                placeholder="Enter course identifier (e.g., CS101)" 
                style={{
                  ...styles.input,
                  ...(isFocused ? styles.inputFocus : {}),
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
            </div>
          )}

          <div style={styles.actionBar}>
            <button 
              onClick={refresh} 
              disabled={status === 'loading' || !subject}
              style={{
                ...styles.button,
                ...(status === 'loading' || !subject ? styles.buttonDisabled : {}),
                ...(isHovered && status !== 'loading' && subject ? styles.buttonHover : {}),
              }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {status === 'loading' && <span style={styles.loadingSpinner}></span>}
              {status === 'loading' ? 'Loading...' : 'Refresh Matrix'}
            </button>
            <span style={styles.infoText}>
              <span style={styles.infoIcon}>i</span>
              Uses saved CDAP ticks + hours (no upload required)
            </span>
          </div>

          {message && (
            <div style={{
              ...styles.alert,
              ...(status === 'error' ? styles.alertError : styles.alertSuccess),
            }}>
              <span style={{ fontSize: '1.25rem' }}>
                {status === 'error' ? '⚠️' : '✓'}
              </span>
              {message}
            </div>
          )}

          <div style={styles.matrixContainer}>
            <ArticulationMatrix subjectId={subject} matrix={matrix} />
          </div>
        </div>
      </div>
    </div>
  );
}
