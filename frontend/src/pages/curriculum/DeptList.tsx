import React, { useEffect, useState } from 'react';
import CLASS_TYPES, { normalizeClassType } from '../../constants/classTypes';
import CurriculumLayout from './CurriculumLayout';
import { fetchDeptRows, updateDeptRow, approveDeptRow, createElective, fetchElectives, fetchBatchYears, propagateDeptRow, DeptRow } from '../../services/curriculum';
import fetchWithAuth from '../../services/fetchAuth';
import { Edit, Check, X, Save, RefreshCw, Copy } from 'lucide-react';

type Department = { id: number; code: string; name: string; short_name?: string };

export default function DeptList() {
  const [rows, setRows] = useState<any[]>([]);
  const [editAll, setEditAll] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [batchYears, setBatchYears] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);
  const [propagateRow, setPropagateRow] = useState<DeptRow | null>(null);
  const [propagateTargets, setPropagateTargets] = useState<number[]>([]);
  const [propagating, setPropagating] = useState(false);
  const [propagateSection, setPropagateSection] = useState(false);
  const [propagateSectionTargets, setPropagateSecTargets] = useState<number[]>([]);
  const [propagatingSec, setPropagatingSec] = useState(false);
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
    fetchBatchYears().then(setBatchYears).catch(() => {});
  }, []);

  // Fetch departments based on curriculum permissions
  useEffect(() => {
    fetchWithAuth('/api/curriculum/departments/')
      .then(res => res.json())
      .then(data => setAllDepartments(data.results || []))
      .catch(err => console.error('Failed to fetch departments:', err));
  }, []);

  // Auto-refresh when page becomes visible (e.g., returning from admin tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !loading && !refreshing) {
        handleRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loading, refreshing]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const [freshRows, depsRes, by] = await Promise.all([
        fetchDeptRows(),
        fetchWithAuth('/api/curriculum/departments/'),
        fetchBatchYears(),
      ]);
      setRows(freshRows);
      const depsData = await depsRes.json();
      setAllDepartments(depsData.results || []);
      setBatchYears(by);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }

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
  // Propagate/copy is only for users with master curriculum or all-department curriculum access
  const canPropagate = Array.isArray(userPerms) && (
    userPerms.some(p => ['curriculum.master.edit', 'CURRICULUM_MASTER_EDIT', 'curriculum.master.publish', 'CURRICULUM_MASTER_PUBLISH', 'curriculum_master_edit', 'curriculum_master_publish'].includes(p))
  );

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
  const [departmentGroups, setDepartmentGroups] = useState<any[]>([]);

  useEffect(() => {
    // load elective subjects for current filters
    fetchElectives({ department_id: currentDept ?? undefined, regulation: selectedReg ?? undefined, semester: selectedSem ?? undefined })
      .then(setElectiveSubjects)
      .catch(() => setElectiveSubjects([]));
  }, [currentDept, selectedReg, selectedSem, rows]);

  useEffect(() => {
    // Fetch department groups
    fetchWithAuth('/api/curriculum/department-groups/')
      .then(r => r.ok ? r.json() : [])
      .then(data => setDepartmentGroups(Array.isArray(data) ? data : data.results || []))
      .catch(() => setDepartmentGroups([]));
  }, []);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<any>({
    parent: null,
    department_id: currentDept || null,
    department_group_id: null,
    batch_id: null,
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

  // Edit elective UI state
  const [editElectiveOpen, setEditElectiveOpen] = useState(false);
  const [editElectiveForm, setEditElectiveForm] = useState<any>(null);

  function openEditElective(o: any) {
    setEditElectiveForm({ ...o });
    setEditElectiveOpen(true);
  }

  async function saveEditElective() {
    if (!editElectiveForm || !editElectiveForm.id) return;
    try {
      const res = await fetchWithAuth(`/api/curriculum/elective/${editElectiveForm.id}/`, {
        method: 'PATCH',
        body: JSON.stringify(editElectiveForm),
      });
      if (!res.ok) throw new Error(await res.text());
      // refresh data
      const fresh = await fetchDeptRows();
      setRows(fresh);
      const es = await fetchElectives({ department_id: currentDept ?? undefined, regulation: selectedReg ?? undefined, semester: selectedSem ?? undefined });
      setElectiveSubjects(es);
      setEditElectiveOpen(false);
      alert('Elective updated');
    } catch (e: any) {
      alert(String(e));
    }
  }

  if (loading) return (
    <CurriculumLayout>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading department curriculum…</p>
        </div>
      </div>
    </CurriculumLayout>
  );

  async function handlePropagateSection() {
    const visibleRows = rows.filter(r =>
      (!currentDept || r.department.id === currentDept) &&
      (!selectedReg || r.regulation === selectedReg) &&
      (!selectedSem || r.semester === selectedSem) &&
      (!selectedBatch || (r.batch && r.batch.id === selectedBatch))
    );
    if (visibleRows.length === 0) return;
    if (!confirm(`Propagate all ${visibleRows.length} visible row(s) to ${propagateSectionTargets.length} batch(es)?`)) return;
    setPropagatingSec(true);
    let totalSuccess = 0;
    const allErrors: string[] = [];
    try {
      for (const r of visibleRows) {
        const res = await propagateDeptRow(r as DeptRow, propagateSectionTargets);
        totalSuccess += res.success.length;
        allErrors.push(...res.errors);
      }
      if (allErrors.length) {
        alert(`${totalSuccess} created, ${allErrors.length} failed:\n${allErrors.slice(0, 5).join('\n')}`);
      } else {
        alert(`Section propagated — ${totalSuccess} entries created across ${propagateSectionTargets.length} batch(es).`);
      }
      await handleRefresh();
      setPropagateSection(false);
      setPropagateSecTargets([]);
    } catch (e: any) {
      alert('Propagation failed: ' + String(e));
    } finally {
      setPropagatingSec(false);
    }
  }

  async function handlePropagateDeptRow() {
    if (!propagateRow || propagateTargets.length === 0) return;
    setPropagating(true);
    try {
      const result = await propagateDeptRow(propagateRow, propagateTargets);
      if (result.errors.length) {
        alert(`${result.success.length} succeeded, ${result.errors.length} failed:\n${result.errors.join('\n')}`);
      } else {
        alert(`Successfully propagated to ${result.success.length} batch(es).`);
      }
      await handleRefresh();
      setPropagateRow(null);
      setPropagateTargets([]);
    } catch (e: any) {
      alert('Propagation failed: ' + String(e));
    } finally {
      setPropagating(false);
    }
  }

  async function saveAllVisible() {
    const visible = rows.filter(r => (!currentDept || r.department.id === currentDept) && (!selectedReg || r.regulation === selectedReg) && (!selectedSem || r.semester === selectedSem) && r.editable);
    if (visible.length === 0) return alert('No editable rows to save');
    if (!confirm(`Save ${visible.length} editable rows?`)) return;
    try {
      setSavingAll(true);
      const promises = visible.map(r => updateDeptRow(r.id, r).catch(e => ({ __error: String(e), id: r.id })));
      const results = await Promise.all(promises);
      // apply successful updates
      const updatedMap: Record<number, any> = {};
      results.forEach(res => { if (res && !res.__error) updatedMap[res.id] = res; });
      setRows(rs => rs.map(r => updatedMap[r.id] ? updatedMap[r.id] : r));
      const errors = results.filter(r => r && r.__error);
      if (errors.length) {
        alert(`${errors.length} rows failed to save. Check console for details.`);
        console.error('SaveAll errors', errors);
      } else {
        alert('All editable rows saved');
        setEditAll(false);
      }
    } catch (e:any) {
      alert(String(e));
    } finally { setSavingAll(false); }
  }

  return (
    <CurriculumLayout>
      <div className="px-4 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M16 32V16h16v16H16zm2-2h12V18H18v12zm2-2v-8h8v8h-8z" fill="#6366f1"/></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">Department Curriculum</h2>
            <p className="text-sm text-gray-600 mt-1">View and manage department-specific curriculum entries.</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {/* Filters */}
        {uniqueRegs.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 mb-6 bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Regulation:</span>
              <select
                value={selectedReg ?? ''}
                onChange={e => setSelectedReg(e.target.value || null)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {uniqueRegs.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Semester:</span>
              <select
                value={selectedSem ?? ''}
                onChange={e => setSelectedSem(e.target.value ? Number(e.target.value) : null)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {uniqueSems.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {batchYears.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Batch:</span>
                <select
                  value={selectedBatch ?? ''}
                  onChange={e => setSelectedBatch(e.target.value ? Number(e.target.value) : null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Batches</option>
                  {batchYears.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {batchYears.length > 1 && canPropagate && (
              <button
                onClick={() => { setPropagateSection(true); setPropagateSecTargets([]); }}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-all shadow-sm"
                title="Propagate entire visible section to another batch"
              >
                <Copy className="w-4 h-4" />
                Propagate Section
              </button>
            )}
          </div>
        )}
        
        {/* Department Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Filter by Department</h3>
          <div className="flex flex-wrap gap-2">
            {allDepartments.map(dept => {
              const isActive = currentDept === dept.id;
              const hasRows = uniqueDepts.includes(dept.id);
              const displayName = dept.short_name || dept.code || dept.name || `Dept ${dept.id}`;
              return (
                <button
                  key={dept.id}
                  onClick={() => setCurrentDept(dept.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : hasRows
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                  title={hasRows ? '' : 'No curriculum rows for this department'}
                >
                  {displayName}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between mb-4">
          <div />
          <div className="flex items-center gap-2">
            {editAll ? (
              <>
                <button onClick={() => { setEditAll(false); }} className="px-3 py-2 border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50">Cancel All</button>
                <button onClick={saveAllVisible} disabled={savingAll} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 ml-2">
                  {savingAll ? 'Saving…' : 'Save All'}
                </button>
              </>
            ) : (
              <button onClick={() => setEditAll(true)} className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Edit All</button>
            )}
          </div>
        </div>
      <div className="w-full overflow-x-auto bg-white rounded-lg shadow-md">
        <table className="w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-gray-50 to-indigo-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">Code</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">Mnemonic</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">Batch</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap min-w-[200px]">Course</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">CAT</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">Class</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">Elective</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">L</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">T</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">P</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">S</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">C</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">INT</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">EXT</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">TTL</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">Hours</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">QP Type</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">Editable</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.filter(r => (!currentDept || r.department.id === currentDept) && (!selectedReg || r.regulation === selectedReg) && (!selectedSem || r.semester === selectedSem)).map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${r.editable ? 'bg-slate-50' : ''}`}>
                {(editingRow === r.id || (editAll && r.editable)) ? (
                  <>
                    <td className="px-3 py-2 whitespace-nowrap"><input value={r.course_code || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, course_code: e.target.value } : row))} className="w-full min-w-[160px] px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input value={r.mnemonic || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, mnemonic: e.target.value } : row))} className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select
                        value={r.batch?.id ?? r.batch_id ?? ''}
                        onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, batch_id: e.target.value ? Number(e.target.value) : null } : row))}
                        className="w-full min-w-[100px] px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      >
                        <option value="">—</option>
                        {batchYears.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <textarea
                        value={r.course_name || ''}
                        onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, course_name: e.target.value } : row))}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        style={{ minHeight: '32px' }}
                        placeholder="Course Name"
                        rows={1}
                        onInput={e => {
                          const ta = e.target as HTMLTextAreaElement;
                          ta.style.height = '32px';
                          ta.style.height = ta.scrollHeight + 'px';
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input
                        value={r.category || ''}
                        onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, category: e.target.value } : row))}
                        className="w-full min-w-[140px] px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 edit-cell-input"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select
                        value={r.class_type || 'THEORY'}
                        onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, class_type: e.target.value } : row))}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 edit-cell-input"
                        style={{ minWidth: 90 }}
                      >
                        {CLASS_TYPES.map((ct) => (
                          <option key={ct.value} value={ct.value}>{ct.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <input type="checkbox" checked={!!r.is_elective} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, is_elective: e.target.checked } : row))} className="w-4 h-4" />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.l || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, l: Number(e.target.value) } : row))} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.t || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, t: Number(e.target.value) } : row))} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.p || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, p: Number(e.target.value) } : row))} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.s || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, s: Number(e.target.value) } : row))} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.c || 0} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, c: Number(e.target.value) } : row))} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.internal_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, internal_mark: Number(e.target.value) } : row))} className="w-full min-w-[88px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.external_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, external_mark: Number(e.target.value) } : row))} className="w-full min-w-[88px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.total_mark || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, total_mark: Number(e.target.value) } : row))} className="w-full min-w-[88px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.total_hours || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, total_hours: Number(e.target.value) } : row))} className="w-full min-w-[88px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input value={r.question_paper_type || ''} onChange={e => setRows(rs => rs.map(row => row.id === r.id ? { ...row, question_paper_type: e.target.value } : row))} className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.editable ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors mr-2"
                        onClick={() => onSaveRow(r)}
                        title="Save"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                        onClick={() => setEditingRow(null)}
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.course_code || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.mnemonic || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">
                      {r.batch ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">{r.batch.name}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-gray-900 font-medium">{r.course_name || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.category || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.class_type || '-'}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap text-sm">{r.is_elective ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.l ?? 0}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.t ?? 0}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.p ?? 0}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.s ?? 0}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.c ?? 0}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.internal_mark ?? '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.external_mark ?? '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.total_mark ?? '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.total_hours ?? '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.question_paper_type || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">{r.editable ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {r.editable ? (
                          <button
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            onClick={() => setEditingRow(r.id)}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="w-8 h-8"></div>
                        )}
                        {batchYears.length > 1 && canPropagate && (
                          <button
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            onClick={() => { setPropagateRow(r); setPropagateTargets([]); }}
                            title="Propagate to other batch"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                        
                        {canApprove && r.approval_status === 'PENDING' ? (
                          <>
                            <button
                              onClick={() => onApprove(r.id, 'approve')}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onApprove(r.id, 'reject')}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="w-8 h-8"></div>
                            <div className="w-8 h-8"></div>
                          </>
                        )}
                      </div>
                      <div className="text-xs mt-1 text-gray-600">
                        Status: <strong className="text-gray-900">{r.approval_status || 'APPROVED'}</strong>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Elective options section */}
      <div className="mt-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Elective Options</h3>
        {electives.length === 0 && electiveSubjects.filter(es => es.is_cross_department).length === 0 ? (
          <div className="text-gray-400 py-4">No elective options for selected department/semester.</div>
        ) : (
          <div className="space-y-6">
            {/* Department's own elective slots with merged cross-department subjects */}
            {electives.map(parent => {
              // Get subjects that belong directly to this parent
              const ownSubjects = electiveSubjects.filter(es => es.parent === parent.id);
              
              // Get cross-department subjects with matching parent names
              const parentName = parent.course_name || parent.course_code || '';
              const crossDeptMatches = electiveSubjects.filter(es => 
                es.is_cross_department && 
                es.parent_name && 
                (es.parent_name === parentName || es.parent_name.toLowerCase() === parentName.toLowerCase())
              );
              
              // Combine both lists
              const allOptions = [...ownSubjects, ...crossDeptMatches];
              
              return (
                <div key={parent.id} className="bg-white rounded-lg shadow-md p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-bold text-gray-900">{parent.course_name || parent.course_code || 'Elective'}</div>
                      {crossDeptMatches.length > 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800" title="Includes shared subjects from other departments">
                          +{crossDeptMatches.length} shared
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={() => openAddModal(parent)} 
                      className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add Subject
                    </button>
                  </div>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Code</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Course</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Dept</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">CAT</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Class</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">L</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">T</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">P</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">S</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">C</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">INT</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">EXT</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">TTL</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Hours</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">QP Type</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {allOptions.length === 0 ? (
                          <tr><td colSpan={16} className="px-3 py-4 text-gray-400 text-center">No subjects added yet.</td></tr>
                        ) : (
                          allOptions.map(o => (
                            <tr key={o.id} className={`hover:bg-gray-50 transition-colors ${o.is_cross_department ? 'bg-blue-50/30' : ''}`}>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.course_code || '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.course_name || '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">
                                {o.is_cross_department ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" title={`From ${o.owner_department_name}`}>
                                    {o.owner_department_name?.split(' - ')[1] || o.owner_department_name?.split(' - ')[0] || 'Other'}
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.category || '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.class_type || '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.l ?? 0}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.t ?? 0}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.p ?? 0}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.s ?? 0}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.c ?? 0}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.internal_mark ?? '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.external_mark ?? '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.total_mark ?? '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.total_hours ?? '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-sm">{o.question_paper_type || '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{o.editable ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}</span>
                                  {!o.is_cross_department && (
                                    <button
                                      onClick={() => openEditElective(o)}
                                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Edit"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            
            {/* Show unmatched cross-department electives (those without a matching parent slot in this dept) */}
            {(() => {
              const crossDeptElectives = electiveSubjects.filter(es => es.is_cross_department);
              if (crossDeptElectives.length === 0) return null;
              
              // Get all parent names from this department's electives
              const deptParentNames = electives.map(p => (p.course_name || p.course_code || '').toLowerCase());
              
              // Find cross-dept electives that don't match any of the department's parent names
              const unmatchedCrossDept = crossDeptElectives.filter(es => {
                const parentName = (es.parent_name || '').toLowerCase();
                return !deptParentNames.includes(parentName);
              });
              
              if (unmatchedCrossDept.length === 0) return null;
              
              // Group unmatched by parent name
              const groupedByParent = unmatchedCrossDept.reduce((acc: any, elective: any) => {
                const parentName = elective.parent_name || 'Unknown Elective';
                if (!acc[parentName]) {
                  acc[parentName] = [];
                }
                acc[parentName].push(elective);
                return acc;
              }, {});
              
              return (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg shadow-md p-4 border-2 border-amber-200">
                  <div className="mb-4">
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-bold text-gray-900">Other Shared Electives</h4>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        {unmatchedCrossDept.length} {unmatchedCrossDept.length === 1 ? 'subject' : 'subjects'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">These electives don't match your department's elective slots but are available via group mappings</p>
                  </div>
                  <div className="space-y-4">
                    {Object.entries(groupedByParent).map(([parentName, electives]: [string, any]) => (
                      <div key={parentName} className="bg-white rounded-lg shadow-sm p-4">
                        <h5 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-1 rounded bg-amber-100 text-amber-700 text-sm">
                            Elective Slot:
                          </span>
                          {parentName}
                        </h5>
                        <div className="w-full overflow-x-auto">
                          <table className="w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Code</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Course</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">From Dept</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Group</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">CAT</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Class</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">L</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">T</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">P</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">S</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">C</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">INT</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">EXT</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">TTL</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Hours</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                              {electives.map((o: any) => (
                                <tr key={o.id} className="hover:bg-amber-50/50 transition-colors">
                                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium">{o.course_code || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.course_name || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-sm" title={o.owner_department_name}>
                                      {o.owner_department_name?.split(' - ')[1] || o.owner_department_name?.split(' - ')[0] || 'Other'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                                    {o.department_group ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                                        {o.department_group.code}
                                      </span>
                                    ) : '-'}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.category || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.class_type || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.l ?? 0}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.t ?? 0}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.p ?? 0}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.s ?? 0}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.c ?? 0}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.internal_mark ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.external_mark ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.total_mark ?? '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.total_hours ?? '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {addModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="w-full max-w-3xl mx-4 bg-white rounded-lg shadow-2xl p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add Elective Subject</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Course Name</label>
                <input 
                  value={addForm.course_name || ''} 
                  onChange={e => setAddForm(f => ({ ...f, course_name: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Course Code</label>
                <input 
                  value={addForm.course_code || ''} 
                  onChange={e => setAddForm(f => ({ ...f, course_code: e.target.value }))} 
                  className="w-full min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Batch</label>
                <select
                  value={addForm.batch_id ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, batch_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— No Batch —</option>
                  {batchYears.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Department Group <span className="text-xs text-gray-500">(optional)</span>
                </label>
                <select 
                  value={addForm.department_group_id || ''} 
                  onChange={e => setAddForm(f => ({ ...f, department_group_id: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">None</option>
                  {departmentGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.code} - {g.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Assign to a group to share with other departments</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Class Type</label>
                <select 
                  value={addForm.class_type} 
                  onChange={e => setAddForm(f => ({ ...f, class_type: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {CLASS_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                <input 
                  value={addForm.category || ''} 
                  onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} 
                  className="w-full min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">L</label>
                <input 
                  type="number" 
                  value={addForm.l ?? 0} 
                  onChange={e => setAddForm(f => ({ ...f, l: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">T</label>
                <input 
                  type="number" 
                  value={addForm.t ?? 0} 
                  onChange={e => setAddForm(f => ({ ...f, t: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">P</label>
                <input 
                  type="number" 
                  value={addForm.p ?? 0} 
                  onChange={e => setAddForm(f => ({ ...f, p: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">S</label>
                <input 
                  type="number" 
                  value={addForm.s ?? 0} 
                  onChange={e => setAddForm(f => ({ ...f, s: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">C</label>
                <input 
                  type="number" 
                  value={addForm.c ?? 0} 
                  onChange={e => setAddForm(f => ({ ...f, c: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Internal Mark</label>
                <input 
                  type="number" 
                  value={addForm.internal_mark ?? ''} 
                  onChange={e => setAddForm(f => ({ ...f, internal_mark: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">External Mark</label>
                <input 
                  type="number" 
                  value={addForm.external_mark ?? ''} 
                  onChange={e => setAddForm(f => ({ ...f, external_mark: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Total Mark</label>
                <input 
                  type="number" 
                  value={addForm.total_mark ?? ''} 
                  onChange={e => setAddForm(f => ({ ...f, total_mark: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Total Hours</label>
                <input 
                  type="number" 
                  value={addForm.total_hours ?? ''} 
                  onChange={e => setAddForm(f => ({ ...f, total_hours: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Question Paper Type</label>
                <input 
                  value={addForm.question_paper_type || ''} 
                  onChange={e => setAddForm(f => ({ ...f, question_paper_type: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div className="flex items-center gap-2">
                <input 
                  id="add-editable" 
                  type="checkbox" 
                  checked={!!addForm.editable} 
                  onChange={e => setAddForm(f => ({ ...f, editable: e.target.checked }))} 
                  className="w-4 h-4" 
                />
                <label htmlFor="add-editable" className="text-sm font-medium text-gray-700">Editable</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setAddModalOpen(false)} 
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveAddForm} 
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {editElectiveOpen && editElectiveForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="w-full max-w-3xl mx-4 bg-white rounded-lg shadow-2xl p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Elective Subject</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Course Name</label>
                <input 
                  value={editElectiveForm.course_name || ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, course_name: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Course Code</label>
                <input 
                  value={editElectiveForm.course_code || ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, course_code: e.target.value }))} 
                  className="w-full min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Batch</label>
                <select
                  value={editElectiveForm.batch_id ?? editElectiveForm.batch?.id ?? ''}
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, batch_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— No Batch —</option>
                  {batchYears.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Department Group <span className="text-xs text-gray-500">(optional)</span>
                </label>
                <select 
                  value={editElectiveForm.department_group_id || ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, department_group_id: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">None</option>
                  {departmentGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.code} - {g.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Assign to a group to share with other departments</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Class Type</label>
                <select 
                  value={editElectiveForm.class_type || 'THEORY'} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, class_type: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {CLASS_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                <input 
                  value={editElectiveForm.category || ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, category: e.target.value }))} 
                  className="w-full min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">L</label>
                <input 
                  type="number" 
                  value={editElectiveForm.l ?? 0} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, l: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">T</label>
                <input 
                  type="number" 
                  value={editElectiveForm.t ?? 0} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, t: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">P</label>
                <input 
                  type="number" 
                  value={editElectiveForm.p ?? 0} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, p: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">S</label>
                <input 
                  type="number" 
                  value={editElectiveForm.s ?? 0} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, s: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">C</label>
                <input 
                  type="number" 
                  value={editElectiveForm.c ?? 0} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, c: Number(e.target.value) }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Internal Mark</label>
                <input 
                  type="number" 
                  value={editElectiveForm.internal_mark ?? ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, internal_mark: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">External Mark</label>
                <input 
                  type="number" 
                  value={editElectiveForm.external_mark ?? ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, external_mark: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Total Mark</label>
                <input 
                  type="number" 
                  value={editElectiveForm.total_mark ?? ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, total_mark: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Total Hours</label>
                <input 
                  type="number" 
                  value={editElectiveForm.total_hours ?? ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, total_hours: e.target.value ? Number(e.target.value) : null }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Question Paper Type</label>
                <input 
                  value={editElectiveForm.question_paper_type || ''} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, question_paper_type: e.target.value }))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              <div className="flex items-center gap-2">
                <input 
                  id="edit-editable" 
                  type="checkbox" 
                  checked={!!editElectiveForm.editable} 
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, editable: e.target.checked }))} 
                  className="w-4 h-4" 
                />
                <label htmlFor="edit-editable" className="text-sm font-medium text-gray-700">Editable</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setEditElectiveOpen(false)} 
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveEditElective} 
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Propagate Section Modal */}
      {propagateSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Propagate Entire Section</h3>
            <p className="text-sm text-gray-500 mb-1">
              Copy <strong>all {rows.filter(r => (!currentDept || r.department.id === currentDept) && (!selectedReg || r.regulation === selectedReg) && (!selectedSem || r.semester === selectedSem) && (!selectedBatch || (r.batch && r.batch.id === selectedBatch))).length} visible rows</strong>
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Dept: <span className="font-medium">{allDepartments.find(d => d.id === currentDept)?.short_name || allDepartments.find(d => d.id === currentDept)?.code || 'All'}</span> &nbsp;|&nbsp;
              Reg: <span className="font-medium">{selectedReg || 'All'}</span> &nbsp;|&nbsp;
              Sem: <span className="font-medium">{selectedSem ?? 'All'}</span> &nbsp;|&nbsp;
              Batch: <span className="font-medium">{batchYears.find(b => b.id === selectedBatch)?.name || 'All'}</span>
            </p>
            <p className="text-sm font-medium text-gray-700 mb-2">Select target batch(es):</p>
            <div className="space-y-2 mb-5">
              {batchYears
                .filter(b => !selectedBatch || b.id !== selectedBatch)
                .map(b => (
                  <label key={b.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 accent-purple-600"
                      checked={propagateSectionTargets.includes(b.id)}
                      onChange={e =>
                        setPropagateSecTargets(prev =>
                          e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id)
                        )
                      }
                    />
                    <span className="text-sm font-medium text-gray-700">{b.name}</span>
                  </label>
                ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPropagateSection(false); setPropagateSecTargets([]); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={propagateSectionTargets.length === 0 || propagatingSec}
                onClick={handlePropagateSection}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {propagatingSec ? 'Propagating…' : `Propagate to ${propagateSectionTargets.length} batch${propagateSectionTargets.length !== 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Propagate Row Modal */}
      {propagateRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Propagate to Other Batch</h3>
            <p className="text-sm text-gray-500 mb-4">
              Copy <strong>{propagateRow.course_name || propagateRow.course_code}</strong>{' '}
              from <span className="font-medium text-gray-700">{propagateRow.department?.name}</span>{' '}
              (Batch: <span className="font-medium text-indigo-700">{propagateRow.batch?.name || '—'}</span>) to:
            </p>
            <div className="space-y-2 mb-5">
              {batchYears
                .filter(b => b.id !== (propagateRow.batch?.id ?? propagateRow.batch_id))
                .map(b => (
                  <label key={b.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 accent-purple-600"
                      checked={propagateTargets.includes(b.id)}
                      onChange={e =>
                        setPropagateTargets(prev =>
                          e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id)
                        )
                      }
                    />
                    <span className="text-sm font-medium text-gray-700">{b.name}</span>
                  </label>
                ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPropagateRow(null); setPropagateTargets([]); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={propagateTargets.length === 0 || propagating}
                onClick={handlePropagateDeptRow}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {propagating
                  ? 'Propagating…'
                  : `Propagate to ${propagateTargets.length} batch${propagateTargets.length !== 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </CurriculumLayout>
  );
}
