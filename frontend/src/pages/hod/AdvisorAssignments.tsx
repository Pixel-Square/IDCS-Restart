import React, { useEffect, useState } from 'react'
import fetchWithAuth from '../../services/fetchAuth'

type Section = { id: number; name: string; batch: string }
type Staff = { id: number; user: string; staff_id: string }
type Advisor = { id: number; section: string; section_id: number; advisor: string; advisor_id: number; is_active: boolean }

export default function AdvisorAssignments() {
  const [sections, setSections] = useState<Section[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [assignments, setAssignments] = useState<Advisor[]>([])
  const [loading, setLoading] = useState(false)
  const [canAssign, setCanAssign] = useState(false)

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
    <div>
      <h2>Advisor assignments (HOD)</h2>
      {loading && <div>Loading…</div>}
      <table>
        <thead><tr><th>Section</th><th>Advisor</th><th>Action</th></tr></thead>
        <tbody>
          {sections.map(sec => (
            <tr key={sec.id}>
              <td>{sec.batch} / {sec.name}</td>
              <td>
                <select id={`advisor-${sec.id}`}>
                  <option value="">-- select --</option>
                  {staff.map(st => (
                    <option key={st.id} value={st.id}>{st.staff_id} - {st.user}</option>
                  ))}
                </select>
              </td>
              <td>
                <button disabled={!canAssign} onClick={() => {
                  const sel = document.getElementById(`advisor-${sec.id}`) as HTMLSelectElement
                  const val = sel.value
                  if (!val) return alert('Select advisor')
                  saveAssignment(sec.id, Number(val))
                }}>{canAssign ? 'Assign' : 'No permission'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Existing advisor assignments</h3>
      <ul>
        {assignments.map(a => (
          <li key={a.id}>{a.section} → {a.advisor}</li>
        ))}
      </ul>
    </div>
  )
}
