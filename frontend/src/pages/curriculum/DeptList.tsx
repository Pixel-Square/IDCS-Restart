import React, { useEffect, useState } from 'react';
import CurriculumLayout from './CurriculumLayout';
import { fetchDeptRows, updateDeptRow, approveDeptRow } from '../../services/curriculum';
import { useAppSelector } from '../../hooks';

export default function DeptList() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const uniqueRegs = rows && rows.length ? Array.from(new Set(rows.map(r => r.regulation))) : [];
  const [selectedReg, setSelectedReg] = useState<string | null>(uniqueRegs.length === 1 ? uniqueRegs[0] : (uniqueRegs[0] ?? null));
  const uniqueDepts = rows && rows.length ? Array.from(new Set(rows.map(r => r.department.id))) : [];

  useEffect(() => {
    // update selectedReg when rows change
    const regs = rows && rows.length ? Array.from(new Set(rows.map(r => r.regulation))) : [];
    if (regs.length === 1) setSelectedReg(regs[0]);
    else if (!regs.includes(selectedReg || '')) setSelectedReg(regs[0] ?? null);
  }, [rows]);
  useEffect(() => {
    fetchDeptRows().then(r => setRows(r)).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function onSave(row: any) {
    try {
      const updated = await updateDeptRow(row.id, row);
      setRows(rs => rs.map(r => r.id === updated.id ? updated : r));
      alert('Saved');
    } catch (e: any) {
      alert(String(e));
    }
  }

  async function onSaveRow(row: any) {
    try {
      const updated = await updateDeptRow(row.id, row);
      setRows(rs => rs.map(r => r.id === updated.id ? updated : r));
      setEditingRow(null);
      alert('Row updated successfully');
    } catch (e: any) {
      alert(String(e));
    }
  }

  const [editingRow, setEditingRow] = useState<number | null>(null);

  // detect if current user can approve
  const userPerms = (() => {
    try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[] } catch { return [] }
  })();
  const canApprove = Array.isArray(userPerms) && (userPerms.includes('curriculum.department.approve') || userPerms.includes('CURRICULUM_DEPARTMENT_APPROVE'));

  async function onApprove(rowId: number, action: 'approve'|'reject'){
    try{
      await approveDeptRow(rowId, action);
      // refresh all rows
      const fresh = await fetchDeptRows();
      setRows(fresh);
      alert('OK');
    }catch(e:any){ alert(String(e)); }
  }

  const [currentDept, setCurrentDept] = useState<number | null>(null);

  useEffect(() => {
    if (uniqueDepts.length === 1) setCurrentDept(uniqueDepts[0]);
    else if (!uniqueDepts.includes(currentDept || -1)) setCurrentDept(uniqueDepts[0] ?? null);
  }, [rows]);

  if (loading) return <CurriculumLayout><div>Loading...</div></CurriculumLayout>;

  return (
    <CurriculumLayout>
      <h2>Department Curriculum</h2>
      {uniqueRegs.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          Regulation:&nbsp;
          <select value={selectedReg ?? ''} onChange={e => setSelectedReg(e.target.value || null)}>
            {uniqueRegs.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      ) : null}
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {uniqueDepts.map(deptId => (
          <button
            key={deptId}
            onClick={() => setCurrentDept(deptId)}
            style={{
              padding: '8px 16px',
              backgroundColor: currentDept === deptId ? '#4CAF50' : '#f3f4f6',
              color: currentDept === deptId ? '#fff' : '#000',
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {rows.find(r => r.department.id === deptId)?.department.code || `Dept ${deptId}`}
          </button>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
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
            <th>Hours</th>
            <th>QP Type</th>
            <th>Editable</th>
            <th /></tr>
        </thead>
        <tbody>
          {rows.filter(r => !currentDept || r.department.id === currentDept).map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              {editingRow === r.id ? (
                <>
                  <td><input value={r.semester} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, semester: e.target.value } : row))} /></td>
                  <td><input value={r.course_code || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, course_code: e.target.value } : row))} /></td>
                  <td><input value={r.course_name || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, course_name: e.target.value } : row))} /></td>
                  <td><input value={r.l || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, l: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.t || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, t: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.p || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, p: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.s || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, s: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.c || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, c: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.internal_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, internal_mark: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.external_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, external_mark: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.total_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, total_mark: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.total_hours || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, total_hours: Number(e.target.value) } : row))} /></td>
                  <td><input value={r.question_paper_type || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, question_paper_type: e.target.value } : row))} /></td>
                  <td>{r.editable ? 'Yes' : 'No'}</td>
                  <td>
                    <button onClick={() => onSaveRow(r)}>Save</button>
                    <button onClick={() => setEditingRow(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{r.semester}</td>
                  <td>{r.course_code || '-'}</td>
                  <td>{r.course_name || '-'}</td>
                  <td>{r.l ?? 0}</td>
                  <td>{r.t ?? 0}</td>
                  <td>{r.p ?? 0}</td>
                  <td>{r.s ?? 0}</td>
                  <td>{r.c ?? 0}</td>
                  <td>{r.internal_mark ?? '-'}</td>
                  <td>{r.external_mark ?? '-'}</td>
                  <td>{r.total_mark ?? '-'}</td>
                  <td>{r.total_hours ?? '-'}</td>
                  <td>{r.question_paper_type || '-'}</td>
                  <td>{r.editable ? 'Yes' : 'No'}</td>
                  <td>
                    {r.editable ? <button onClick={() => setEditingRow(r.id)}>Edit</button> : 'View'}
                    <div style={{marginTop:6}}>Status: <strong>{r.approval_status || 'APPROVED'}</strong></div>
                    {canApprove && r.approval_status === 'PENDING' ? (
                      <div style={{marginTop:6}}>
                        <button onClick={() => onApprove(r.id, 'approve')} style={{marginRight:6}}>Approve</button>
                        <button onClick={() => onApprove(r.id, 'reject')}>Reject</button>
                      </div>
                    ): null}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </CurriculumLayout>
  );
}
