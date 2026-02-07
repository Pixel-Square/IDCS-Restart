import React, { useEffect, useState } from 'react';
import CurriculumLayout from './CurriculumLayout';
import { fetchDeptRows, updateDeptRow, approveDeptRow, createElective, fetchElectives } from '../../services/curriculum';
import { useAppSelector } from '../../hooks';

export default function DeptList() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const uniqueRegs = rows && rows.length ? Array.from(new Set(rows.map(r => r.regulation))) : [];
  const uniqueSems = rows && rows.length ? Array.from(new Set(rows.map(r => r.semester))).sort((a,b)=>a-b) : [];
  const [selectedReg, setSelectedReg] = useState<string | null>(uniqueRegs.length === 1 ? uniqueRegs[0] : (uniqueRegs[0] ?? null));
  const [selectedSem, setSelectedSem] = useState<number | null>(uniqueSems.length === 1 ? uniqueSems[0] : (uniqueSems[0] ?? null));
  const uniqueDepts = rows && rows.length ? Array.from(new Set(rows.map(r => r.department.id))) : [];

  useEffect(() => {
    // update selectedReg when rows change
    const regs = rows && rows.length ? Array.from(new Set(rows.map(r => r.regulation))) : [];
    if (regs.length === 1) setSelectedReg(regs[0]);
    else if (!regs.includes(selectedReg || '')) setSelectedReg(regs[0] ?? null);
    const sems = rows && rows.length ? Array.from(new Set(rows.map(r => r.semester))).sort((a:any,b:any)=>a-b) : [];
    if (sems.length === 1) setSelectedSem(sems[0]);
    else if (!sems.includes(selectedSem || -1)) setSelectedSem(sems[0] ?? null);
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
  // electives will be derived from `rows` where `is_elective === true`

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

  // derive elective options from department rows
  const electives = rows.filter(r => r.is_elective && (!currentDept || r.department.id === currentDept) && (!selectedReg || r.regulation === selectedReg) && (!selectedSem || r.semester === selectedSem));

  const [electiveSubjects, setElectiveSubjects] = useState<any[]>([]);

  useEffect(() => {
    // load elective subjects for current filters
    fetchElectives({ department_id: currentDept ?? undefined, regulation: selectedReg ?? undefined, semester: selectedSem ?? undefined })
      .then(setElectiveSubjects)
      .catch(() => setElectiveSubjects([]));
  }, [currentDept, selectedReg, selectedSem, rows]);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<any>({
    parent: null,
    department_id: currentDept || null,
    regulation: selectedReg || null,
    semester_id: selectedSem || null,
    course_code: '',
    course_name: '',
    class_type: 'THEORY',
    category: '',
    is_elective: true,
    l: 0, t: 0, p: 0, s: 0, c: 0,
    internal_mark: null,
    external_mark: null,
    total_mark: null,
    total_hours: null,
    question_paper_type: '',
    editable: false,
  });

  function openAddModal(parent: any) {
    setAddForm((f: any) => ({
      ...f,
      parent: parent.id,
      department_id: currentDept || f.department_id,
      regulation: selectedReg || f.regulation,
      semester_id: selectedSem || f.semester_id,
      course_name: '',
      course_code: '',
    }));
    setAddModalOpen(true);
  }

  async function saveAddForm() {
    try {
      const payload: any = { ...addForm };
      // ensure parent is present
      if (!payload.parent) throw new Error('Parent curriculum id missing');
      // convert empty strings to null where appropriate
      if (!payload.course_code) delete payload.course_code;
      if (!payload.course_name) delete payload.course_name;
      await createElective(payload);
      const fresh = await fetchDeptRows();
      setRows(fresh);
      // refresh elective subjects for UI
      const es = await fetchElectives({ department_id: currentDept ?? undefined, regulation: selectedReg ?? undefined, semester: selectedSem ?? undefined });
      setElectiveSubjects(es);
      setAddModalOpen(false);
      alert('Elective subject added');
    } catch (e: any) {
      alert(String(e));
    }
  }

  if (loading) return (
    <CurriculumLayout>
      <div className="db-loading">Loading department curriculum…</div>
    </CurriculumLayout>
  );

  return (
    <CurriculumLayout>
      <div className="welcome" style={{ marginBottom: 24 }}>
        <div className="welcome-left">
          <svg className="welcome-icon" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M16 32V16h16v16H16zm2-2h12V18H18v12zm2-2v-8h8v8h-8z" fill="#6366f1"/></svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>Department Curriculum</h2>
            <div className="welcome-sub">View and manage department-specific curriculum entries.</div>
          </div>
        </div>
      </div>
      {uniqueRegs.length > 0 && (
        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#374151', fontWeight: 500 }}>Regulation:</span>
          <select
            value={selectedReg ?? ''}
            onChange={e => setSelectedReg(e.target.value || null)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1e293b', fontWeight: 500 }}
          >
            {uniqueRegs.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ width: 12 }} />
          <span style={{ color: '#374151', fontWeight: 500 }}>Semester:</span>
          <select
            value={selectedSem ?? ''}
            onChange={e => setSelectedSem(e.target.value ? Number(e.target.value) : null)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1e293b', fontWeight: 500 }}
          >
            {uniqueSems.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      <div style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {uniqueDepts.map(deptId => {
          const isActive = currentDept === deptId;
          return (
            <button
              key={deptId}
              onClick={() => setCurrentDept(deptId)}
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
              {rows.find(r => r.department.id === deptId)?.department.code || `Dept ${deptId}`}
            </button>
          );
        })}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, boxShadow: '0 2px 8px #e5e7eb' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(90deg,#f3f4f6,#e0e7ff)', textAlign: 'left', borderBottom: '2px solid #d1d5db' }}>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Sem</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Code</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Course</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>CAT</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Class</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Elective</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>L</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>T</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>P</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>S</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>C</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>INT</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>EXT</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>TTL</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Hours</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>QP Type</th>
              <th style={{ padding: '12px 8px', color: '#3730a3', fontWeight: 700 }}>Editable</th>
              <th style={{ padding: '12px 8px' }} />
            </tr>
          </thead>
          <tbody>
            {rows.filter(r => (!currentDept || r.department.id === currentDept) && (!selectedReg || r.regulation === selectedReg) && (!selectedSem || r.semester === selectedSem)).map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.2s', background: r.editable ? '#f8fafc' : '#fff' }}>
                {editingRow === r.id ? (
                  <>
                    <td><input value={r.semester} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, semester: e.target.value } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.course_code || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, course_code: e.target.value } : row))} className="edit-cell-input" /></td>
                    <td style={{ padding: '10px 8px', verticalAlign: 'middle', overflow: 'visible', whiteSpace: 'normal' }}>
                      <textarea
                        value={r.course_name || ''}
                        onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, course_name: e.target.value } : row))}
                        className="edit-cell-input course-textarea"
                        style={{
                          minWidth: 90,
                          width: '100%',
                          fontSize: 15,
                          color: '#1e293b',
                          fontWeight: 500,
                          background: '#f8fafc',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          minHeight: 32,
                          maxHeight: 120,
                          boxSizing: 'border-box',
                          margin: 0,
                          padding: '5px 8px',
                          resize: 'none',
                          overflow: 'hidden',
                          lineHeight: 1.4,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          display: 'block',
                        }}
                        placeholder="Course Name"
                        aria-label="Course Name"
                        rows={1}
                        onInput={e => {
                          const ta = e.target as HTMLTextAreaElement;
                          ta.style.height = '32px';
                          ta.style.height = ta.scrollHeight + 'px';
                        }}
                      />
                    </td>
                    <td><input value={r.category || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, category: e.target.value } : row))} className="edit-cell-input" /></td>
                    <td>
                      <select value={r.class_type || 'THEORY'} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, class_type: e.target.value } : row))} className="edit-cell-input" style={{ minWidth: 90 }}>
                        <option value="THEORY">THEORY</option>
                        <option value="LAB">LAB</option>
                        <option value="TCPL">TCPL</option>
                        <option value="TCPR">TCPR</option>
                        <option value="PRACTICAL">PRACTICAL</option>
                        <option value="AUDIT">AUDIT</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!r.is_elective} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, is_elective: e.target.checked } : row))} />
                    </td>
                    <td><input value={r.l || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, l: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.t || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, t: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.p || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, p: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.s || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, s: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.c || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, c: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.internal_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, internal_mark: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.external_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, external_mark: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.total_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, total_mark: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.total_hours || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, total_hours: Number(e.target.value) } : row))} className="edit-cell-input" /></td>
                    <td><input value={r.question_paper_type || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, question_paper_type: e.target.value } : row))} className="edit-cell-input" style={{ minWidth: 60 }} /></td>
                    <td>{r.editable ? <span style={{ color: '#059669', fontWeight: 600 }}>Yes</span> : <span style={{ color: '#9ca3af' }}>No</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn-primary"
                        style={{ padding: '6px 18px', fontWeight: 600, borderRadius: 8, fontSize: 14, marginRight: 6, border: 'none', boxShadow: '0 1px 4px #e0e7ef1a', background: 'linear-gradient(90deg,#4f46e5,#06b6d4)' }}
                        onClick={() => onSaveRow(r)}
                      >
                        Save
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 18px', fontWeight: 600, borderRadius: 8, fontSize: 14, border: 'none', background: '#f3f4f6', color: '#374151' }}
                        onClick={() => setEditingRow(null)}
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>{r.semester}</td>
                    <td style={{ padding: '10px 8px' }}>{r.course_code || '-'}</td>
                    <td style={{ padding: '10px 8px', verticalAlign: 'middle', fontSize: 15, color: '#1e293b', fontWeight: 500 }}>
                      {r.course_name || '-'}
                    </td>
                    <td style={{ padding: '10px 8px' }}>{r.category || '-'}</td>
                    <td style={{ padding: '10px 8px' }}>{r.class_type || '-'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>{r.is_elective ? <span style={{ color: '#059669', fontWeight: 600 }}>Yes</span> : <span style={{ color: '#9ca3af' }}>No</span>}</td>
                    <td style={{ padding: '10px 8px' }}>{r.l ?? 0}</td>
                    <td style={{ padding: '10px 8px' }}>{r.t ?? 0}</td>
                    <td style={{ padding: '10px 8px' }}>{r.p ?? 0}</td>
                    <td style={{ padding: '10px 8px' }}>{r.s ?? 0}</td>
                    <td style={{ padding: '10px 8px' }}>{r.c ?? 0}</td>
                    <td style={{ padding: '10px 8px' }}>{r.internal_mark ?? '-'}</td>
                    <td style={{ padding: '10px 8px' }}>{r.external_mark ?? '-'}</td>
                    <td style={{ padding: '10px 8px' }}>{r.total_mark ?? '-'}</td>
                    <td style={{ padding: '10px 8px' }}>{r.total_hours ?? '-'}</td>
                    <td style={{ padding: '10px 8px' }}>{r.question_paper_type || '-'}</td>
                    <td style={{ padding: '10px 8px' }}>{r.editable ? <span style={{ color: '#059669', fontWeight: 600 }}>Yes</span> : <span style={{ color: '#9ca3af' }}>No</span>}</td>
                    <td style={{ padding: '10px 8px' }}>
                      {r.editable ? (
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 16px', fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                          onClick={() => setEditingRow(r.id)}
                        >
                          Edit
                        </button>
                      ) : 'View'}
                      <div style={{marginTop:6}}>Status: <strong>{r.approval_status || 'APPROVED'}</strong></div>
                      {canApprove && r.approval_status === 'PENDING' ? (
                        <div style={{marginTop:6}}>
                          <button
                            onClick={() => onApprove(r.id, 'approve')}
                            style={{
                              marginRight: 6,
                              padding: '6px 18px',
                              borderRadius: 8,
                              fontWeight: 600,
                              fontSize: 15,
                              minWidth: 100,
                              background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                              color: '#fff',
                              border: 'none',
                              boxShadow: '0 2px 8px #bbf7d0',
                              cursor: 'pointer',
                              transition: 'background 0.18s, color 0.18s, box-shadow 0.18s',
                              letterSpacing: '0.5px'
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => onApprove(r.id, 'reject')}
                            style={{
                              padding: '6px 18px',
                              borderRadius: 8,
                              fontWeight: 600,
                              fontSize: 15,
                              minWidth: 100,
                              background: 'linear-gradient(90deg, #ef4444, #b91c1c)',
                              color: '#fff',
                              border: 'none',
                              boxShadow: '0 2px 8px #fecaca',
                              cursor: 'pointer',
                              transition: 'background 0.18s, color 0.18s, box-shadow 0.18s',
                              letterSpacing: '0.5px'
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      ): null}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Elective options section */}
      <div style={{ marginTop: 18 }}>
        <h3 style={{ marginBottom: 8 }}>Elective Options</h3>
        {electives.length === 0 ? (
          <div style={{ color: '#9ca3af' }}>No elective options for selected department/semester.</div>
        ) : (
          <div style={{ marginTop: 8, display: 'grid', gap: 18 }}>
            {electives.map(parent => {
              const options = electiveSubjects.filter(es => es.parent === parent.id);
              return (
                <div key={parent.id} style={{ background: '#fff', borderRadius: 8, padding: 12, boxShadow: '0 1px 4px rgba(2,6,23,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{parent.course_name || parent.course_code || 'Elective'}</div>
                    <button onClick={() => openAddModal(parent)} style={{ padding: '6px 12px', borderRadius: 8, background: 'linear-gradient(90deg,#4f46e5,#06b6d4)', color: '#fff', border: 'none', fontWeight: 600 }}>Add Subject</button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: '8px' }}>Sem</th>
                          <th style={{ padding: '8px' }}>Code</th>
                          <th style={{ padding: '8px' }}>Course</th>
                          <th style={{ padding: '8px' }}>CAT</th>
                          <th style={{ padding: '8px' }}>Class</th>
                          <th style={{ padding: '8px' }}>L</th>
                          <th style={{ padding: '8px' }}>T</th>
                          <th style={{ padding: '8px' }}>P</th>
                          <th style={{ padding: '8px' }}>S</th>
                          <th style={{ padding: '8px' }}>C</th>
                          <th style={{ padding: '8px' }}>INT</th>
                          <th style={{ padding: '8px' }}>EXT</th>
                          <th style={{ padding: '8px' }}>TTL</th>
                          <th style={{ padding: '8px' }}>Hours</th>
                          <th style={{ padding: '8px' }}>QP Type</th>
                          <th style={{ padding: '8px' }}>Editable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {options.length === 0 ? (
                          <tr><td colSpan={16} style={{ padding: 12, color: '#9ca3af' }}>No subjects added yet.</td></tr>
                        ) : (
                          options.map(o => (
                            <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px' }}>{o.semester ?? '-'}</td>
                              <td style={{ padding: '8px' }}>{o.course_code || '-'}</td>
                              <td style={{ padding: '8px' }}>{o.course_name || '-'}</td>
                              <td style={{ padding: '8px' }}>{o.category || '-'}</td>
                              <td style={{ padding: '8px' }}>{o.class_type || '-'}</td>
                              <td style={{ padding: '8px' }}>{o.l ?? 0}</td>
                              <td style={{ padding: '8px' }}>{o.t ?? 0}</td>
                              <td style={{ padding: '8px' }}>{o.p ?? 0}</td>
                              <td style={{ padding: '8px' }}>{o.s ?? 0}</td>
                              <td style={{ padding: '8px' }}>{o.c ?? 0}</td>
                              <td style={{ padding: '8px' }}>{o.internal_mark ?? '-'}</td>
                              <td style={{ padding: '8px' }}>{o.external_mark ?? '-'}</td>
                              <td style={{ padding: '8px' }}>{o.total_mark ?? '-'}</td>
                              <td style={{ padding: '8px' }}>{o.total_hours ?? '-'}</td>
                              <td style={{ padding: '8px' }}>{o.question_paper_type || '-'}</td>
                              <td style={{ padding: '8px' }}>{o.editable ? <span style={{ color: '#059669', fontWeight: 600 }}>Yes</span> : <span style={{ color: '#9ca3af' }}>No</span>}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addModalOpen ? (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div style={{ width: 760, maxWidth: '95%', background: '#fff', borderRadius: 8, padding: 18, boxShadow: '0 8px 24px rgba(2,6,23,0.2)' }}>
            <h3 style={{ marginTop: 0 }}>Add Elective Subject</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>Course Name</label>
                <input value={addForm.course_name || ''} onChange={e => setAddForm(f => ({ ...f, course_name: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>Course Code</label>
                <input value={addForm.course_code || ''} onChange={e => setAddForm(f => ({ ...f, course_code: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>Class Type</label>
                <select value={addForm.class_type} onChange={e => setAddForm(f => ({ ...f, class_type: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
                  <option value="THEORY">THEORY</option>
                  <option value="LAB">LAB</option>
                  <option value="TCPL">TCPL</option>
                  <option value="TCPR">TCPR</option>
                  <option value="PRACTICAL">PRACTICAL</option>
                  <option value="AUDIT">AUDIT</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>Category</label>
                <input value={addForm.category || ''} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>L</label>
                <input type="number" value={addForm.l ?? 0} onChange={e => setAddForm(f => ({ ...f, l: Number(e.target.value) }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>T</label>
                <input type="number" value={addForm.t ?? 0} onChange={e => setAddForm(f => ({ ...f, t: Number(e.target.value) }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>P</label>
                <input type="number" value={addForm.p ?? 0} onChange={e => setAddForm(f => ({ ...f, p: Number(e.target.value) }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>S</label>
                <input type="number" value={addForm.s ?? 0} onChange={e => setAddForm(f => ({ ...f, s: Number(e.target.value) }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>C</label>
                <input type="number" value={addForm.c ?? 0} onChange={e => setAddForm(f => ({ ...f, c: Number(e.target.value) }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>Internal Mark</label>
                <input type="number" value={addForm.internal_mark ?? ''} onChange={e => setAddForm(f => ({ ...f, internal_mark: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>External Mark</label>
                <input type="number" value={addForm.external_mark ?? ''} onChange={e => setAddForm(f => ({ ...f, external_mark: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>Total Mark</label>
                <input type="number" value={addForm.total_mark ?? ''} onChange={e => setAddForm(f => ({ ...f, total_mark: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600 }}>Total Hours</label>
                <input type="number" value={addForm.total_hours ?? ''} onChange={e => setAddForm(f => ({ ...f, total_hours: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontWeight: 600 }}>Question Paper Type</label>
                <input value={addForm.question_paper_type || ''} onChange={e => setAddForm(f => ({ ...f, question_paper_type: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input id="add-editable" type="checkbox" checked={!!addForm.editable} onChange={e => setAddForm(f => ({ ...f, editable: e.target.checked }))} />
                <label htmlFor="add-editable">Editable</label>
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setAddModalOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff' }}>Cancel</button>
              <button onClick={saveAddForm} style={{ padding: '8px 14px', borderRadius: 8, background: 'linear-gradient(90deg,#4f46e5,#06b6d4)', color: '#fff', border: 'none' }}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </CurriculumLayout>
  );
}
