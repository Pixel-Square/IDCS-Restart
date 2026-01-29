import React, { useEffect, useState } from 'react';
import { fetchMasters } from '../../services/curriculum';
import CurriculumLayout from './CurriculumLayout';
import { Link } from 'react-router-dom';

export default function MasterList() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const uniqueRegs = data && data.length ? Array.from(new Set(data.map(d => d.regulation))) : [];
  const [selectedReg, setSelectedReg] = useState<string | null>(uniqueRegs.length === 1 ? uniqueRegs[0] : (uniqueRegs[0] ?? null));

  useEffect(() => {
    const regs = data && data.length ? Array.from(new Set(data.map(d => d.regulation))) : [];
    if (regs.length === 1) setSelectedReg(regs[0]);
    else if (!regs.includes(selectedReg || '')) setSelectedReg(regs[0] ?? null);
  }, [data]);

  useEffect(() => {
    fetchMasters()
      .then(r => setData(r))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CurriculumLayout><div>Loading masters…</div></CurriculumLayout>;

  return (
    <CurriculumLayout>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Master Curricula</h2>
        {(() => {
          try {
            const roles = JSON.parse(localStorage.getItem('roles') || '[]');
            const isIQAC = Array.isArray(roles) && roles.some((r: string) => String(r).toLowerCase() === 'iqac');
            if (isIQAC) return <Link to="/curriculum/master/new" className="btn-primary">New Master</Link>;
          } catch (e) {}
          return null;
        })()}
      </div>
      {uniqueRegs.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          Regulation:&nbsp;
          <select value={selectedReg ?? ''} onChange={e => setSelectedReg(e.target.value || null)}>
            {uniqueRegs.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      ) : null}

      <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th>Sem</th>
            <th>Code</th>
            <th>Course</th>
            <th>L</th>
            <th>T</th>
            <th>P</th>
            <th>S</th>
            <th>C</th>
            <th>Internal</th>
            <th>External</th>
            <th>Total</th>
            <th>Depts</th>
            <th>Editable</th>
            <th /></tr>
        </thead>
        <tbody>
          {data.filter(m => !selectedReg || m.regulation === selectedReg).map(m => (
            <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td>{m.semester}</td>
              <td>{m.course_code || '-'}</td>
              <td>{m.course_name || '-'}</td>
              <td>{m.l ?? 0}</td>
              <td>{m.t ?? 0}</td>
              <td>{m.p ?? 0}</td>
              <td>{m.s ?? 0}</td>
              <td>{m.c ?? 0}</td>
              <td>{m.internal_mark ?? '-'}</td>
              <td>{m.external_mark ?? '-'}</td>
              <td>{m.total_mark ?? '-'}</td>
              <td>{m.for_all_departments ? 'ALL' : (m.departments_display || []).map((d:any)=>d.code).join(', ')}</td>
              <td>{m.editable ? 'Yes' : 'No'}</td>
              <td><Link to={`/curriculum/master/${m.id}`}>Edit</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </CurriculumLayout>
  );
}
