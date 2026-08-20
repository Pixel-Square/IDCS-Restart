import React, { useEffect, useState } from 'react';
import CLASS_TYPES, { normalizeClassType } from '../../constants/classTypes';
import CurriculumLayout from './CurriculumLayout';
import { fetchDeptRows, updateDeptRow, approveDeptRow, createElective, fetchElectives, fetchBatchYears, propagateDeptRow, deleteCurriculumDepartment, deleteElective, fetchElectiveChoices, DeptRow } from '../../services/curriculum';
import fetchWithAuth from '../../services/fetchAuth';
import { Edit, Check, X, Save, RefreshCw, Copy, Trash2 } from 'lucide-react';
import { showAlert, showConfirm } from '../../utils/dialog';

type Department = { id: number; code: string; name: string; short_name?: string };
type QPType = { id: number; code: string; label: string };

export default function DeptList() {
  const draftStorageKey = 'curriculum.dept.drafts.v1';
  const readDrafts = (): Record<number, any> => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };
  const writeDrafts = (drafts: Record<number, any>) => {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(drafts));
    } catch {
      // ignore storage failures (private mode or quota)
    }
  };
  const applyDrafts = (baseRows: any[], drafts: Record<number, any>) => (
    baseRows.map((row) => (drafts[row.id] ? { ...row, ...drafts[row.id] } : row))
  );

  const [rows, setRows] = useState<any[]>([]);
  const [draftRows, setDraftRows] = useState<Record<number, any>>(() => readDrafts());
  const [editAll, setEditAll] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [batchYears, setBatchYears] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);
  const [propagateSection, setPropagateSection] = useState(false);
  const [propagateSectionTargets, setPropagateSecTargets] = useState<number[]>([]);
  const [propagatingSec, setPropagatingSec] = useState(false);
  const [qpTypes, setQpTypes] = useState<QPType[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeptRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLinkedCount, setDeleteLinkedCount] = useState<number | null>(null);
  const uniqueRegs = rows && rows.length ? Array.from(new Set(rows.map(r => r.regulation))) : [];
  const uniqueSems = rows && rows.length ? Array.from(new Set(rows.map(r => Number(r.semester)))).sort((a,b)=>a-b) : [];
  const [selectedReg, setSelectedReg] = useState<string | null>(() => localStorage.getItem('deptCurriculumReg') || (uniqueRegs.length === 1 ? uniqueRegs[0] : (uniqueRegs[0] ?? null)));
  const [selectedSem, setSelectedSem] = useState<number | null>(() => {
    const saved = localStorage.getItem('deptCurriculumSem');
    return saved ? Number(saved) : (uniqueSems.length === 1 ? uniqueSems[0] : (uniqueSems[0] ?? null));
  });
  const uniqueDepts = rows && rows.length ? Array.from(new Set(rows.map(r => r.department.id))) : [];

  useEffect(() => {
    if (selectedReg) localStorage.setItem('deptCurriculumReg', selectedReg);
    else localStorage.removeItem('deptCurriculumReg');
  }, [selectedReg]);

  useEffect(() => {
    if (selectedSem !== null) localStorage.setItem('deptCurriculumSem', String(selectedSem));
    else localStorage.removeItem('deptCurriculumSem');
  }, [selectedSem]);

  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const regs = Array.from(new Set(rows.map(r => r.regulation)));
    if (regs.length === 1 && !selectedReg) setSelectedReg(regs[0]);
    else if (selectedReg && !regs.includes(selectedReg)) setSelectedReg(regs[0] ?? null);
    
    const sems = Array.from(new Set(rows.map(r => Number(r.semester)))).sort((a,b)=>a-b);
    if (sems.length === 1 && !selectedSem) setSelectedSem(sems[0]);
    else if (selectedSem && !sems.includes(selectedSem)) setSelectedSem(sems[0] ?? null);
  }, [rows]);
  useEffect(() => {
    fetchDeptRows()
      .then(r => setRows(applyDrafts(r, draftRows)))
      .catch(console.error)
      .finally(() => setLoading(false));
    fetchBatchYears().then(setBatchYears).catch(() => {});
  }, []);

  useEffect(() => {
    fetchWithAuth('/api/curriculum/qp-types/')
      .then(res => res.ok ? res.json() : [])
      .then(data => setQpTypes(Array.isArray(data) ? data : []))
      .catch(() => setQpTypes([]));
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
      setRows(applyDrafts(freshRows, draftRows));
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
      clearDraftsForRowIds([updated.id]);
      await showAlert('Saved');
    } catch (e: any) {
      await showAlert(String(e), 'error');
    }
  }

  async function onSaveRow(row: any) {
    try {
      const updated = await updateDeptRow(row.id, row);
      setRows(rs => rs.map(r => r.id === updated.id ? updated : r));
      clearDraftsForRowIds([updated.id]);
      setEditingRow(null);
      await showAlert('Row updated successfully');
    } catch (e: any) {
      await showAlert(String(e), 'error');
    }
  }

  const updateRowValue = (rowId: number, patch: Record<string, any>) => {
    setRows(rs => rs.map(row => row.id === rowId ? { ...row, ...patch } : row));
    setDraftRows(prev => {
      const next = { ...prev, [rowId]: { ...(prev[rowId] || {}), ...patch } };
      writeDrafts(next);
      return next;
    });
  };

  const clearDraftsForRowIds = (rowIds: number[]) => {
    setDraftRows(prev => {
      if (!rowIds.length) return prev;
      const next = { ...prev };
      rowIds.forEach(id => { delete next[id]; });
      writeDrafts(next);
      return next;
    });
  };

  const [editingRow, setEditingRow] = useState<number | null>(null);
  // electives will be derived from `rows` where `is_elective === true`

  // detect if current user can approve
  const userPerms = (() => {
    try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[] } catch { return [] }
  })();
  const userRoles = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('roles') || '[]') as Array<string | { name?: string }>;
      return Array.isArray(parsed)
        ? parsed.map((role) => (typeof role === 'string' ? role : String(role?.name || '')))
        : [];
    } catch {
      return [] as string[];
    }
  })();
  const isIqac = userRoles.map((r) => String(r || '').toUpperCase()).includes('IQAC');
  const isHod = userRoles.map((r) => String(r || '').toUpperCase()).includes('HOD');
  const canApprove = Array.isArray(userPerms) && (userPerms.includes('curriculum.department.approve') || userPerms.includes('CURRICULUM_DEPARTMENT_APPROVE'));
  const masterWritePerms = [
    'curriculum.master.edit',
    'CURRICULUM_MASTER_EDIT',
    'curriculum.master.publish',
    'CURRICULUM_MASTER_PUBLISH',
    'curriculum_master_edit',
    'curriculum_master_publish',
    'obe.master.manage',
  ];
  const deptWritePerms = [
    'curriculum.department.approve',
    'CURRICULUM_DEPARTMENT_APPROVE',
    'curriculum_department_approve',
    'academics.manage_curriculum',
    'academics.change_elective_teaching',
  ];
  // Propagate/copy is allowed for master or department curriculum access users
  const canPropagate = Array.isArray(userPerms) && userPerms.some(p => masterWritePerms.includes(p) || deptWritePerms.includes(p));
  // Delete stays restricted to master-level permissions
  const canDeleteDept = Array.isArray(userPerms) && userPerms.some(p => masterWritePerms.includes(p));

  async function onApprove(rowId: number, action: 'approve'|'reject'){
    try{
      await approveDeptRow(rowId, action);
      // refresh all rows
      const fresh = await fetchDeptRows();
      setRows(fresh);
      await showAlert('OK');
    }catch(e:any){ await showAlert(String(e), 'error'); }
  }

  async function handleDeleteDeptRow() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteCurriculumDepartment(deleteTarget.id);
      clearDraftsForRowIds([deleteTarget.id]);
      await handleRefresh();
      setDeleteTarget(null);
      setDeleteLinkedCount(null);
    } catch (e: any) {
      const message = String(e?.message || e || 'Delete failed');
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!deleteTarget || !deleteTarget.is_elective) {
      setDeleteLinkedCount(null);
      return;
    }
    fetchElectiveChoices({ parent_id: deleteTarget.id, include_inactive: true, page_size: 1 })
      .then((res) => {
        if (cancelled) return;
        setDeleteLinkedCount(res.count || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setDeleteLinkedCount(null);
      });
    return () => { cancelled = true; };
  }, [deleteTarget]);

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
      department_id: parent.department?.id || parent.department_id || currentDept || f.department_id,
      regulation: parent.regulation || selectedReg || f.regulation,
      semester_id: parent.semester || selectedSem || f.semester_id,
      batch_id: parent.batch_id || parent.batch?.id || f.batch_id,
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
      await showAlert('Elective subject added');
    } catch (e: any) {
      await showAlert(String(e), 'error');
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
      const payload: any = { ...editElectiveForm };
      if (!payload.course_code) delete payload.course_code;
      if (!payload.course_name) delete payload.course_name;
      await updateDeptRow(payload.id, payload);
      const fresh = await fetchDeptRows();
      setRows(fresh);
      const es = await fetchElectives({ department_id: currentDept ?? undefined, regulation: selectedReg ?? undefined, semester: selectedSem ?? undefined });
      setElectiveSubjects(es);
      setEditElectiveOpen(false);
      await showAlert('Elective subject updated');
    } catch (e: any) {
      await showAlert(String(e), 'error');
    }
  }

  async function handleDeleteElective(o: any) {
    if (!(await showConfirm(`Are you sure you want to delete elective subject "${o.course_name || o.course_code}"?`))) return;
    try {
      await deleteElective(o.id);
      const fresh = await fetchDeptRows();
      setRows(fresh);
      const es = await fetchElectives({ department_id: currentDept ?? undefined, regulation: selectedReg ?? undefined, semester: selectedSem ?? undefined });
      setElectiveSubjects(es);
      await showAlert('Elective subject deleted');
    } catch (e: any) {
      await showAlert(String(e), 'error');
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
    const visibleRows = filteredRows;
    if (visibleRows.length === 0) return;
    const invalidTargets = propagateSectionTargets.filter((batchId) =>
      hasExistingDeptForBatch(batchId, currentDept, selectedReg, selectedSem)
    );
    if (invalidTargets.length > 0) {
      await showAlert('Propagation blocked: target batch already has subjects for this regulation/semester. Delete existing course(s) to propagate to avoid duplication, else edit manually.', 'error');
      return;
    }
    if (!(await showConfirm(`Propagate all ${visibleRows.length} visible row(s) to ${propagateSectionTargets.length} batch(es)?`))) return;
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
        await showAlert(`${totalSuccess} created, ${allErrors.length} failed:\n${allErrors.slice(0, 5).join('\n')}`, 'warning');
      } else {
        await showAlert(`Section propagated — ${totalSuccess} entries created across ${propagateSectionTargets.length} batch(es).`);
      }
      await handleRefresh();
      setPropagateSection(false);
      setPropagateSecTargets([]);
    } catch (e: any) {
      await showAlert('Propagation failed: ' + String(e), 'error');
    } finally {
      setPropagatingSec(false);
    }
  }

  async function saveAllVisible() {
    const visible = filteredRows.filter(r => r.editable);
    if (visible.length === 0) return await showAlert('No editable rows to save', 'warning');
    if (!(await showConfirm(`Save ${visible.length} editable rows?`))) return;
    try {
      setSavingAll(true);
      const promises = visible.map(r => updateDeptRow(r.id, r).catch(e => ({ __error: String(e), id: r.id })));
      const results = await Promise.all(promises);
      // apply successful updates
      const updatedMap: Record<number, any> = {};
      results.forEach(res => { if (res && !res.__error) updatedMap[res.id] = res; });
      setRows(rs => rs.map(r => updatedMap[r.id] ? updatedMap[r.id] : r));
      clearDraftsForRowIds(Object.keys(updatedMap).map((id) => Number(id)));
      const errors = results.filter(r => r && r.__error);
      if (errors.length) {
        await showAlert(`${errors.length} rows failed to save. Check console for details.`, 'error');
        console.error('SaveAll errors', errors);
      } else {
        await showAlert('All editable rows saved');
        setEditAll(false);
      }
    } catch (e:any) {
      await showAlert(String(e), 'error');
    } finally { setSavingAll(false); }
  }

  const isPendingSubject = (row: any) => {
    const statusRaw = String(row?.approval_status ?? row?.status ?? '').toUpperCase().trim();
    return !row?.is_elective && statusRaw === 'PENDING';
  };
  const matchesFilter = (row: any) => {
    const rowBatchId = row?.batch?.id ?? row?.batch_id ?? null;
    return (
      (!selectedReg || row.regulation === selectedReg) &&
      (!selectedSem || row.semester === selectedSem) &&
      (!selectedBatch || rowBatchId === selectedBatch || rowBatchId === null)
    );
  };
  const matchesFilterWithDept = (row: any) => (
    (!currentDept || row.department.id === currentDept) &&
    matchesFilter(row)
  );
  function hasExistingDeptForBatch(batchId: number, deptId: number | null, regulation: string | null, semester: number | null) {
    if (!batchId || !deptId || !regulation || !semester) return false;
    return rows.some((r) => {
      const rBatchId = r.batch?.id ?? r.batch_id ?? null;
      return rBatchId === batchId && r.department?.id === deptId && r.regulation === regulation && Number(r.semester) === Number(semester);
    });
  }
  const filteredRows = rows.filter(matchesFilterWithDept);
  const totals = filteredRows.reduce(
    (acc, row) => {
      acc.l += Number(row.l || 0);
      acc.t += Number(row.t || 0);
      acc.p += Number(row.p || 0);
      acc.s += Number(row.s || 0);
      acc.c += Number(row.c || 0);
      return acc;
    },
    { l: 0, t: 0, p: 0, s: 0, c: 0 }
  );
  const filteredPendingRows = rows.filter((row) => isPendingSubject(row) && matchesFilter(row));
  const filteredPendingByDepartment = filteredPendingRows.reduce((acc: Record<number, number>, row: any) => {
    const deptId = Number(row?.department?.id || 0);
    if (!deptId) return acc;
    acc[deptId] = (acc[deptId] || 0) + 1;
    return acc;
  }, {});
  const filteredTotalPendingCount = filteredPendingRows.length;
  const getPendingForDepartment = (departmentId: number) => Number(filteredPendingByDepartment[departmentId] || 0);
  const selectedDepartment = allDepartments.find((d) => d.id === currentDept) || null;
  const selectedDepartmentLabel = selectedDepartment
    ? (selectedDepartment.short_name || selectedDepartment.code || selectedDepartment.name || `Dept ${selectedDepartment.id}`)
    : null;

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
                  {isIqac && getPendingForDepartment(dept.id) > 0 ? (
                    <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[11px] font-semibold rounded-full bg-red-600 text-white">
                      {getPendingForDepartment(dept.id)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        {isIqac && selectedDepartmentLabel ? (
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <span>{selectedDepartmentLabel} Department</span>
              {getPendingForDepartment(currentDept || 0) > 0 ? (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[11px] font-semibold rounded-full bg-red-600 text-white">
                  {getPendingForDepartment(currentDept || 0)}
                </span>
              ) : null}
            </h3>
          </div>
        ) : null}
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
            {filteredRows.map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${r.editable ? 'bg-slate-50' : ''}`}>
                {(editingRow === r.id || (editAll && r.editable)) ? (
                  <>
                    <td className="px-3 py-2 whitespace-nowrap"><input value={r.course_code || ''} onChange={e => updateRowValue(r.id, { course_code: e.target.value })} className="w-full min-w-[160px] px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input value={r.mnemonic || ''} onChange={e => updateRowValue(r.id, { mnemonic: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select
                        value={r.batch?.id ?? r.batch_id ?? ''}
                        onChange={e => updateRowValue(r.id, { batch_id: e.target.value ? Number(e.target.value) : null })}
                        className="w-full min-w-[100px] px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      >
                        <option value="">—</option>
                        {batchYears.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <textarea
                        value={r.course_name || ''}
                        onChange={e => updateRowValue(r.id, { course_name: e.target.value })}
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
                        onChange={e => updateRowValue(r.id, { category: e.target.value })}
                        className="w-full min-w-[140px] px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 edit-cell-input"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select
                        value={r.class_type || 'THEORY'}
                        onChange={e => updateRowValue(r.id, { class_type: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 edit-cell-input"
                        style={{ minWidth: 90 }}
                      >
                        {CLASS_TYPES.map((ct) => (
                          <option key={ct.value} value={ct.value}>{ct.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <input type="checkbox" checked={!!r.is_elective} onChange={e => updateRowValue(r.id, { is_elective: e.target.checked })} className="w-4 h-4" />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.l || 0} onChange={e => updateRowValue(r.id, { l: Number(e.target.value) })} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.t || 0} onChange={e => updateRowValue(r.id, { t: Number(e.target.value) })} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.p || 0} onChange={e => updateRowValue(r.id, { p: Number(e.target.value) })} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.s || 0} onChange={e => updateRowValue(r.id, { s: Number(e.target.value) })} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.c || 0} onChange={e => updateRowValue(r.id, { c: Number(e.target.value) })} className="w-full min-w-[72px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.internal_mark || ''} onChange={e => updateRowValue(r.id, { internal_mark: Number(e.target.value) })} className="w-full min-w-[88px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.external_mark || ''} onChange={e => updateRowValue(r.id, { external_mark: Number(e.target.value) })} className="w-full min-w-[88px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.total_mark || ''} onChange={e => updateRowValue(r.id, { total_mark: Number(e.target.value) })} className="w-full min-w-[88px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><input type="number" value={r.total_hours || ''} onChange={e => updateRowValue(r.id, { total_hours: Number(e.target.value) })} className="w-full min-w-[88px] text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select
                        value={r.question_paper_type || ''}
                        onChange={e => updateRowValue(r.id, { question_paper_type: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 edit-cell-input"
                        style={{ minWidth: 90 }}
                      >
                        <option value="">— Select —</option>
                        {qpTypes.map(qt => (
                          <option key={qt.code} value={qt.code}>{qt.label}</option>
                        ))}
                      </select>
                    </td>
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
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-sm">{r.question_paper_type || '-'}</span>
                    </td>
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
                        {canDeleteDept && (
                          <button
                            onClick={() => { setDeleteTarget(r); setDeleteError(null); }}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
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
            {filteredRows.length > 0 && (
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={7} className="px-3 py-3 text-sm text-gray-700">Total</td>
                <td className="px-3 py-3 text-sm text-gray-900">{totals.l}</td>
                <td className="px-3 py-3 text-sm text-gray-900">{totals.t}</td>
                <td className="px-3 py-3 text-sm text-gray-900">{totals.p}</td>
                <td className="px-3 py-3 text-sm text-gray-900">{totals.s}</td>
                <td className="px-3 py-3 text-sm text-gray-900">{totals.c}</td>
                <td colSpan={7} className="px-3 py-3"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900">Delete Department Curriculum</h3>
            <p className="text-sm text-gray-600 mt-2">
              Are you sure you want to delete{' '}
              <span className="font-semibold">{deleteTarget.course_name || deleteTarget.course_code || 'this subject'}</span>?
            </p>
            <p className="text-xs text-gray-400 mt-1">This action cannot be undone.</p>
            {deleteTarget.is_elective && deleteLinkedCount && deleteLinkedCount > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Note: Students have already chosen subjects for this elective. Deleting it may affect their choices.
              </div>
            )}
            {deleteError && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 whitespace-pre-wrap">
                {deleteError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => { if (!deleteLoading) setDeleteTarget(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDeptRow}
                disabled={deleteLoading}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-bold text-gray-900">{parent.course_name || parent.course_code || 'Elective'}</div>
                        {crossDeptMatches.length > 0 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800" title="Includes shared subjects from other departments">
                            +{crossDeptMatches.length} shared
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        {parent.batch?.name && <span>Batch: {parent.batch.name}</span>}
                        {parent.regulation && <span>Regulation: {parent.regulation}</span>}
                        {parent.semester !== undefined && parent.semester !== null && <span>Semester: {parent.semester}</span>}
                      </div>
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
                                    <>
                                      <button
                                        onClick={() => openEditElective(o)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteElective(o)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
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
                            {parentName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {electives.length} {electives.length === 1 ? 'subject' : 'subjects'}
                          </span>
                        </h5>
                        <div className="w-full overflow-x-auto">
                          <table className="w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Code</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Course</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Dept</th>
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
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">QP Type</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                              {electives.map((o: any) => (
                                <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.course_code || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.course_name || '-'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" title={`From ${o.owner_department_name}`}>
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
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{o.question_paper_type || '-'}</td>
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
                <select
                  value={addForm.question_paper_type || ''}
                  onChange={e => setAddForm(f => ({ ...f, question_paper_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— Select —</option>
                  {qpTypes.map(qt => (
                    <option key={qt.code} value={qt.code}>{qt.label}</option>
                  ))}
                </select>
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
                <select
                  value={editElectiveForm.question_paper_type || ''}
                  onChange={e => setEditElectiveForm((f:any) => ({ ...f, question_paper_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— Select —</option>
                  {qpTypes.map(qt => (
                    <option key={qt.code} value={qt.code}>{qt.label}</option>
                  ))}
                </select>
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
              Copy <strong>all {filteredRows.length} visible rows</strong>
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Dept: <span className="font-medium">{allDepartments.find(d => d.id === currentDept)?.short_name || allDepartments.find(d => d.id === currentDept)?.code || 'All'}</span> &nbsp;|&nbsp;
              Reg: <span className="font-medium">{selectedReg || 'All'}</span> &nbsp;|&nbsp;
              Sem: <span className="font-medium">{selectedSem ?? 'All'}</span> &nbsp;|&nbsp;
              Batch: <span className="font-medium">{batchYears.find(b => b.id === selectedBatch)?.name || 'All'}</span>
            </p>
            <p className="text-sm font-medium text-gray-700 mb-2">Select target batch(es):</p>
            <div className="space-y-2 mb-5">
              {(() => {
                const eligibleBatches = batchYears.filter(b => {
                  if (b.is_graduated) return false;
                  if (selectedBatch && b.id === selectedBatch) return false;
                  return !hasExistingDeptForBatch(b.id, currentDept, selectedReg, selectedSem);
                });

                if (eligibleBatches.length === 0) {
                  return <p className="text-sm text-gray-500 italic">No eligible target batches found. All other batches already have subjects for this selection.</p>;
                }

                return eligibleBatches.map(b => (
                  <label key={b.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50">
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
                ));
              })()}
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
      </div>
    </CurriculumLayout>
  );
}
