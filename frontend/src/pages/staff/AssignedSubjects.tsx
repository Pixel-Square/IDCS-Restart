import React, { useEffect, useState } from 'react'
import { fetchAssignedSubjects } from '../../services/staff'
import './AssignedSubjects.css'

type AssignedSubject = {
  id: number
  subject_code?: string | null
  subject_name?: string | null
  section_name?: string | null
  batch?: string | null
  semester?: number | null
}

// Icons as inline SVG components
const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
)

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
)

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
)

const AlertCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
)

const FileTextIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
)

export default function AssignedSubjectsPage() {
  const [items, setItems] = useState<AssignedSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAssignedSubjects()
      setItems(data)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'Failed to load assigned subjects')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="assigned-subjects-container">
      {/* Header Section */}
      <div className="assigned-subjects-header">
        <div className="header-left">
          <div className="header-icon">
            <BookIcon />
          </div>
          <div>
            <h1 className="header-title">Assigned Subjects</h1>
            <p className="header-subtitle">View all subjects assigned to you for the current academic session</p>
          </div>
        </div>
        {!loading && !error && items.length > 0 && (
          <div className="subject-count-badge">
            <span>Total Subjects</span>
            <span className="count">{items.length}</span>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading your assigned subjects...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="error-container">
          <div className="error-icon">
            <AlertCircleIcon />
          </div>
          <p className="error-message">{error}</p>
          <button className="retry-btn" onClick={load}>
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="empty-container">
          <div className="empty-icon">
            <FileTextIcon />
          </div>
          <h3 className="empty-title">No Subjects Assigned</h3>
          <p className="empty-subtitle">You don't have any subjects assigned for the current session.</p>
        </div>
      )}

      {/* Table View */}
      {!loading && !error && items.length > 0 && (
        <div className="subjects-table-container">
          <table className="subjects-table">
            <thead>
              <tr>
                <th className="serial-cell">S.No</th>
                <th className="subject-cell">Subject</th>
                <th className="section-cell">Section</th>
                <th className="batch-cell">Batch</th>
                <th className="semester-cell">Semester</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td className="serial-cell" data-label="S.No">
                    <span className="serial-number">{index + 1}</span>
                  </td>
                  <td className="subject-cell" data-label="Subject">
                    <div className="subject-info">
                      <span className="subject-name">
                        {item.subject_name || 'Unnamed Subject'}
                      </span>
                      {item.subject_code && (
                        <span className="subject-code">{item.subject_code}</span>
                      )}
                    </div>
                  </td>
                  <td className="section-cell" data-label="Section">
                    {item.section_name ? (
                      <span className="section-badge">
                        <UsersIcon />
                        {item.section_name}
                      </span>
                    ) : (
                      <span className="no-data">—</span>
                    )}
                  </td>
                  <td className="batch-cell" data-label="Batch">
                    {item.batch ? (
                      <span className="batch-badge">
                        <CalendarIcon />
                        {item.batch}
                      </span>
                    ) : (
                      <span className="no-data">—</span>
                    )}
                  </td>
                  <td className="semester-cell" data-label="Semester">
                    {item.semester != null ? (
                      <span className="semester-badge">{item.semester}</span>
                    ) : (
                      <span className="no-data">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
