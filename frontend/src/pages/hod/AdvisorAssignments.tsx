import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'
import '../../pages/Dashboard.css'

type Section = { id: number; name: string; batch: string; department_id?: number; department_code?: string }
type Staff = { id: number; user: string; staff_id: string; department?: number }
type Advisor = { id: number; section: string; section_id: number; advisor: string; advisor_id: number; is_active: boolean; department_id?: number }

export default function AdvisorAssignments() {
  const [sections, setSections] = useState<Section[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [assignments, setAssignments] = useState<Advisor[]>([])
  const [loading, setLoading] = useState(false)
  const [canAssign, setCanAssign] = useState(false)
  const [selectedDept, setSelectedDept] = useState<number | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const sres = await fetchWithAuth('/api/academics/section-advisors/?page_size=0')
      const ares = await fetchWithAuth('/api/academics/sections/?page_size=0')
      // use HOD-limited staff endpoint (backend/academics/hod-staff)
      const staffRes = await fetchWithAuth('/api/academics/hod-staff/?page_size=0')
      // fetch current user to get permissions
      const meRes = await fetchWithAuth('/api/accounts/me/')
      async function safeJson(res: Response) {
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) {
          const txt = await res.text()
          console.error('Expected JSON but got:', txt)
          throw new Error('Server returned non-JSON response (see console)')
        }
        return res.json()
      }

      if (sres.ok) {
        const d = await safeJson(sres); setAssignments(d.results || d)
      }
      if (ares.ok) {
        const d = await safeJson(ares); setSections(d.results || d)
      }
      if (staffRes.ok) {
        const d = await safeJson(staffRes); setStaff(d.results || d)
      }
      // no curriculum fetch needed for advisor assignment
      if (meRes.ok) {
        const md = await safeJson(meRes);
        setCanAssign(Boolean(md.permissions && (md.permissions.includes('academics.assign_advisor') || md.permissions.includes('academics.add_sectionadvisor'))))
      }
    } catch (e) {
      console.error(e)
      alert('Failed to load HOD assignments. Check console for server response.')
    } finally { setLoading(false) }
  }

  async function saveAssignment(sectionId: number, advisorId: number) {
    setLoading(true)
    try {
      if (!canAssign) return alert('You do not have permission to assign advisors')
      const payload = { section_id: sectionId, advisor_id: advisorId, is_active: true }
      const res = await fetchWithAuth('/api/academics/section-advisors/', { method: 'POST', body: JSON.stringify(payload) })
      if (res.ok) {
        await fetchData()
      } else {
        const err = await res.text(); alert('Error: ' + err)
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', background: 'none' }}>
      <div className="welcome" style={{ marginBottom: 24 }}>
        <div className="welcome-left">
          <svg className="welcome-icon" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M14 24a3 3 0 116 0 3 3 0 01-6 0zm8 0a3 3 0 116 0 3 3 0 01-6 0zm8 0a3 3 0 116 0 3 3 0 01-6 0z" fill="#6366f1"/></svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>Advisor Assignments (HOD)</h2>
            <div className="welcome-sub">Manage section advisors for your department.</div>
          </div>
        </div>
      </div>

        {loading && <div className="db-loading">Loading advisor assignments…</div>}

        {!loading && sections.length > 0 && (
          <>
            {/* Department selector pills */}
            <div style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {Array.from(new Set(sections.map(s => s.department_id || 0))).map(deptId => {
                const deptSections = sections.filter(s => (s.department_id || 0) === deptId);
                if (deptSections.length === 0) return null;
                const deptCode = deptSections[0]?.department_code || `Dept ${deptId}`;
                const isActive = selectedDept === deptId;

                return (
                  <button
                    key={deptId}
                    onClick={() => setSelectedDept(deptId)}
                    className={isActive ? 'dept-pill-active' : 'dept-pill'}
                    style={{
                      minWidth: 64,
                      height: 36,
                      borderRadius: 20,
                      fontWeight: isActive ? 600 : 500,
                      fontSize: 16,
                      border: 'none',
                      outline: 'none',
                      boxShadow: isActive ? '0 2px 8px #e0e7ff' : 'none',
                      background: isActive ? 'linear-gradient(90deg,#4f46e5,#06b6d4)' : '#f3f4f6',
                      color: isActive ? '#fff' : '#1e293b',
                      transition: 'background 0.18s, color 0.18s, box-shadow 0.18s',
                      padding: '0 22px',
                      margin: 0,
                      cursor: 'pointer',
                      letterSpacing: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    {deptCode}
                  </button>
                );
              })}
            </div>

            {/* Display sections for selected department */}
            {Array.from(new Set(sections.map(s => s.department_id || 0)))
              .filter(deptId => selectedDept === null || selectedDept === deptId)
              .map(deptId => {
              const deptSections = sections.filter(s => (s.department_id || 0) === deptId);
              if (deptSections.length === 0) return null;

              const deptCode = deptSections[0]?.department_code || `Department ${deptId}`;
              const deptStaff = staff.filter(st => (st.department || 0) === deptId);
              const deptAssignments = assignments.filter(a => {
                // Method 1: If assignment has direct department_id from API, use it (most reliable)
                if (a.department_id !== undefined && a.department_id !== null) {
                  return Number(a.department_id) === deptId;
                }
                // Method 2: If assignment has section_id, match against dept sections (reliable)
                if (a.section_id !== undefined && a.section_id !== null) {
                  return deptSections.some(s => s.id === Number(a.section_id));
                }
                // Method 3: Fallback to section text matching (last resort)
                const sectionText = String(a.section || '');
                const matchedSection = deptSections.find(s => {
                  // Strict match: section must contain BOTH batch and section name
                  const batchStr = String(s.batch || '');
                  const nameStr = String(s.name || '');
                  // Format: "BatchName / SectionName" or "Course - BatchYear / SectionName"
                  return sectionText.includes(batchStr) && sectionText.includes(nameStr);
                });
                return !!matchedSection;
              });

              return (
                <div key={deptId} style={{ marginBottom: 32 }}>
                  {/* Table */}
                  <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, boxShadow: '0 2px 8px #e5e7eb' }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(90deg,#f3f4f6,#e0e7ff)', textAlign: 'left', borderBottom: '2px solid #d1d5db' }}>
                          <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Batch</th>
                          <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Section</th>
                          <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Select Advisor</th>
                          <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptSections.map(sec => (
                          <tr key={sec.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.2s' }}>
                            <td style={{ padding: '10px 8px', fontWeight: 600, color: '#1e293b' }}>{sec.batch}</td>
                            <td style={{ padding: '10px 8px', color: '#1e293b' }}>{sec.name}</td>
                            <td style={{ padding: '10px 8px' }}>
                              <select
                                id={`advisor-${sec.id}`}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  border: '1px solid #d1d5db',
                                  background: '#fff',
                                  color: '#1e293b',
                                  fontWeight: 500,
                                  fontSize: 14,
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="">-- Select Advisor --</option>
                                {deptStaff.map(st => (
                                  <option key={st.id} value={st.id}>{st.staff_id} - {st.user}</option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              <button
                                disabled={!canAssign}
                                className="btn-primary"
                                style={{
                                  padding: '6px 18px',
                                  fontWeight: 600,
                                  borderRadius: 8,
                                  fontSize: 14,
                                  border: 'none',
                                  boxShadow: canAssign ? '0 1px 4px #e0e7ef1a' : 'none',
                                  background: canAssign ? 'linear-gradient(90deg,#4f46e5,#06b6d4)' : '#d1d5db',
                                  color: canAssign ? '#fff' : '#9ca3af',
                                  cursor: canAssign ? 'pointer' : 'not-allowed',
                                  opacity: canAssign ? 1 : 0.6
                                }}
                                onClick={() => {
                                  const sel = document.getElementById(`advisor-${sec.id}`) as HTMLSelectElement
                                  const val = sel.value
                                  if (!val) return alert('Select an advisor first')
                                  saveAssignment(sec.id, Number(val))
                                }}
                              >
                                {canAssign ? 'Assign' : 'No Permission'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Existing Assignments */}
                  <div style={{ marginTop: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#3730a3', marginTop: 0, marginBottom: 12 }}>
                      Existing Assignments
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                      {deptAssignments.map(a => {
                        const sectionText = String(a.section || '');
                        const parts = sectionText.split(' / ');
                        const left = parts[0] || '';
                        const right = parts[1] || '';
                        const leftParts = left.split(' - ');
                        const program = leftParts[0] || 'Program';
                        const batch = leftParts[1] || left || 'Batch';
                        const sectionName = right || (deptSections.find(s => s.id === Number(a.section_id))?.name || 'Section');

                        return (
                          <div
                            key={a.id}
                            style={{
                              background: '#fff',
                              padding: '12px 14px',
                              borderRadius: 10,
                              border: '1px solid #eef2f7',
                              boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
                              color: '#1e293b'
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                              {program}
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#475569', marginBottom: 8 }}>
                              <span style={{ fontWeight: 600 }}>Batch:</span>
                              <span>{batch}</span>
                              <span style={{ color: '#cbd5e1' }}>•</span>
                              <span style={{ fontWeight: 600 }}>Section:</span>
                              <span>{sectionName}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>
                              {a.advisor}
                            </div>
                          </div>
                        );
                      })}
                      {deptAssignments.length === 0 && (
                        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
                          No assignments yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {!loading && sections.length === 0 && (
          <div className="db-empty">No sections available for assignment.</div>
        )}
    </div>
  )
}