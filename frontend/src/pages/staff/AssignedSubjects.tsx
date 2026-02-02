import React, { useEffect, useState } from 'react'
import { fetchAssignedSubjects } from '../../services/staff'

type AssignedSubject = {
  id: number
  subject_code?: string | null
  subject_name?: string | null
  section_name?: string | null
  batch?: string | null
  semester?: number | null
}

export default function AssignedSubjectsPage(){
  const [items, setItems] = useState<AssignedSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load(){
    setLoading(true); setError(null)
    try{
      const data = await fetchAssignedSubjects()
      setItems(data)
    }catch(e:any){
      console.error(e)
      setError(e?.message || 'Failed to load')
    }finally{ setLoading(false) }
  }

  return (
    <div>
      <h2>Assigned Subjects</h2>
      {loading && <p>Loading...</p>}
      {error && <p style={{color:'red'}}>{error}</p>}
      {!loading && !error && (
        <table>
          <thead>
            <tr><th>Section</th><th>Batch</th><th>Semester</th><th>Subject</th></tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id}>
                <td>{it.section_name || '-'}</td>
                <td>{it.batch || '-'}</td>
                <td>{it.semester ?? '-'}</td>
                <td>{it.subject_name || it.subject_code || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
