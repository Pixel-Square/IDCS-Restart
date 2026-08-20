import React, { useEffect, useRef, useState } from 'react';
import { fetchMasters, fetchBatchYears, createMaster, fetchDeptRows, Master, deleteMaster } from '../../services/curriculum';
import fetchWithAuth from '../../services/fetchAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import CurriculumLayout from './CurriculumLayout';
import { Link } from 'react-router-dom';
import { BookOpen, Download, Upload, Edit, RefreshCw, Copy, Trash2 } from 'lucide-react';
import { showAlert, showConfirm } from '../../utils/dialog';

export default function MasterList() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [batchYears, setBatchYears] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);
  const [propagateSection, setPropagateSection] = useState(false);
  const [propagateSectionTargets, setPropagateSecTargets] = useState<number[]>([]);
  const [propagatingSec, setPropagatingSec] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Master | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [propagateMessage, setPropagateMessage] = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null);
  const propagateMessageTimer = useRef<number | null>(null);
  const [deptList, setDeptList] = useState<Array<{ id: number; label: string }>>([]);
  const [batchDeptExisting, setBatchDeptExisting] = useState<Record<number, number[]>>({});
  const userPerms = (() => {
    try { return JSON.parse(localStorage.getItem('permissions') || '[]') as string[]; } catch { return []; }
  })();
  const masterWritePerms = [
    'curriculum.master.edit',
    'CURRICULUM_MASTER_EDIT',
    'curriculum.master.publish',
    'CURRICULUM_MASTER_PUBLISH',
    'curriculum_master_edit',
    'curriculum_master_publish',
    'obe.master.manage',
  ];
  const canDeleteMaster = Array.isArray(userPerms) && userPerms.some(p => masterWritePerms.includes(p));
  const loc = useLocation();
  const navigate = useNavigate();
  const uniqueRegs = data && data.length ? Array.from(new Set(data.map(d => d.regulation))) : [];
  const uniqueSems = data && data.length ? Array.from(new Set(data.map(d => Number(d.semester)))).sort((a,b)=>a-b) : [];
  const [selectedReg, setSelectedReg] = useState<string | null>(() => localStorage.getItem('masterCurriculumReg') || (uniqueRegs.length === 1 ? uniqueRegs[0] : (uniqueRegs[0] ?? null)));
  const [selectedSem, setSelectedSem] = useState<number | null>(() => {
    const saved = localStorage.getItem('masterCurriculumSem');
    return saved ? Number(saved) : (uniqueSems.length === 1 ? uniqueSems[0] : (uniqueSems[0] ?? null));
  });
  const filteredData = data.filter(m => (!selectedReg || m.regulation === selectedReg) && (!selectedSem || Number(m.semester) === selectedSem) && (!selectedBatch || (m.batch && m.batch.id === selectedBatch)));
  const totals = filteredData.reduce(
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

  useEffect(() => {
    if (selectedReg) localStorage.setItem('masterCurriculumReg', selectedReg);
    else localStorage.removeItem('masterCurriculumReg');
  }, [selectedReg]);

  useEffect(() => {
    if (selectedSem !== null) localStorage.setItem('masterCurriculumSem', String(selectedSem));
    else localStorage.removeItem('masterCurriculumSem');
  }, [selectedSem]);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const regs = Array.from(new Set(data.map(d => d.regulation)));
    if (regs.length === 1 && !selectedReg) setSelectedReg(regs[0]);
    else if (selectedReg && !regs.includes(selectedReg)) setSelectedReg(regs[0] ?? null);
    
    const sems = Array.from(new Set(data.map(d => Number(d.semester)))).sort((a,b)=>a-b);
    if (sems.length === 1 && !selectedSem) setSelectedSem(sems[0]);
    else if (selectedSem && !sems.includes(selectedSem)) setSelectedSem(sems[0] ?? null);
  }, [data]);

  useEffect(() => {
    fetchMasters()
      .then(r => setData(r))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
    fetchBatchYears().then(setBatchYears).catch(() => {});
  }, []);

  useEffect(() => {
    const isModalOpen = propagateSection;
    if (!isModalOpen) {
      setBatchDeptExisting({});
      return;
    }
    const reg = selectedReg;
    const sem = selectedSem;
    if (!reg || !sem) return;

    let active = true;
    const load = async () => {
      try {
        const [depsRes, deptRows] = await Promise.all([
          fetchWithAuth('/api/curriculum/departments/'),
          fetchDeptRows(),
        ]);
        if (!active) return;
        const depsData = depsRes.ok ? await depsRes.json() : { results: [] };
        const depList = Array.isArray(depsData) ? depsData : (depsData.results || []);
        const normalizedDeps = depList
          .map((d: any) => ({
            id: Number(d.id),
            label: String(d.short_name || d.shortname || d.code || d.name || `Dept ${d.id}`),
          }))
          .filter((d: any) => d.id > 0);
        const targets = propagateSectionTargets;
        const existing: Record<number, Set<number>> = {};
        for (const row of deptRows) {
          const batchId = (row as any)?.batch?.id ?? (row as any)?.batch_id ?? null;
          const deptId = (row as any)?.department?.id ?? null;
          if (!batchId || !deptId) continue;
          if (targets.length && !targets.includes(batchId)) continue;
          if (row.regulation !== reg || row.semester !== sem) continue;
          if (!existing[batchId]) existing[batchId] = new Set();
          existing[batchId].add(deptId);
        }
        const existingMap: Record<number, number[]> = {};
        Object.keys(existing).forEach((batchId) => {
          existingMap[Number(batchId)] = Array.from(existing[Number(batchId)] || []);
        });
        setDeptList(normalizedDeps);
        setBatchDeptExisting(existingMap);
      } catch (e) {
        console.error('Failed to load department occupancy', e);
      }
    };
    load();
    return () => { active = false; };
  }, [propagateSection, propagateSectionTargets, selectedReg, selectedSem]);

  const deptNameMap = new Map(deptList.map(d => [d.id, d.label]));
  const totalDeptCount = deptList.length;

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
      const [fresh, by] = await Promise.all([fetchMasters(), fetchBatchYears()]);
      setData(fresh);
      setBatchYears(by);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }

  function csvEscape(v: any) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    // wrap in quotes if contains comma or quote or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function handleDownloadVisible() {
    const rows = data.filter(m => (!selectedReg || m.regulation === selectedReg) && (!selectedSem || m.semester === selectedSem) && m.editable === true);
    if (!rows.length) { showAlert('No editable subjects in current view', 'warning'); return }
    const headers = ['regulation','semester','course_code','course_name','category','class_type','l','t','p','s','c','internal_mark','external_mark','for_all_departments','editable','departments'];
    const lines = [headers.join(',')];
    for (const m of rows) {
      const deps = (m.for_all_departments ? '' : (m.departments_display || []).map((d:any)=>d.short_name || d.shortname || d.code || d.name).join(','));
      const vals = [m.regulation, m.semester, m.course_code || '', m.course_name || '', m.category || '', m.class_type || '', m.l ?? 0, m.t ?? 0, m.p ?? 0, m.s ?? 0, m.c ?? 0, m.internal_mark ?? '', m.external_mark ?? '', m.for_all_departments ? 'True' : 'False', m.editable ? 'True' : 'False', deps];
      lines.push(vals.map(csvEscape).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `department_curriculum_editable_${selectedReg || 'all'}_${selectedSem || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>){
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!(await showConfirm(`Upload ${file.name} to import masters?`))) { e.currentTarget.value = ''; return }
    try{
      const fd = new FormData();
      fd.append('csv_file', file, file.name);
      // Use fetchWithAuth for automatic token refresh handling
      const res = await fetchWithAuth(`/api/curriculum/master/import/`, { method: 'POST', body: fd });
      
      if (res.status === 401) {
        await showAlert('Your session has expired. Please refresh the page and try again.', 'error');
        return;
      }
      
      if (!res.ok) {
        let txt = '';
        try{ txt = await res.text() }catch(_){ txt = res.statusText }
        await showAlert('Import failed: ' + (txt || res.statusText), 'error');
      } else {
        await showAlert('Import request submitted; refresh to see changes.');
        // re-fetch masters
        setLoading(true);
        fetchMasters().then(r=> setData(r)).catch(()=>{}).finally(()=> setLoading(false));
      }
    }catch(err:any){ console.error(err); await showAlert('Import failed: '+ (err.message || err), 'error'); }
    // Safely clear the file input value (element may be null if React re-rendered)
    try{
      const inp = document.getElementById('master-import-file') as HTMLInputElement | null;
      if (inp) inp.value = '';
    }catch(_){ }
  }

  async function handlePropagateSection() {
    const visibleRows = filteredData;
    if (visibleRows.length === 0) return;
    if (propagateMessageTimer.current) {
      window.clearTimeout(propagateMessageTimer.current);
      propagateMessageTimer.current = null;
    }
    setPropagateMessage(null);
    setPropagatingSec(true);
    let totalSuccess = 0;
    const allErrors: string[] = [];
    const warnings: string[] = [];
    try {
      const deptRows = await fetchDeptRows();
      const regs = Array.from(new Set(visibleRows.map((m) => m.regulation).filter(Boolean)));
      const sems = Array.from(new Set(visibleRows.map((m) => m.semester).filter(Boolean)));
      const existingMap = new Map<string, Set<number>>();
      for (const row of deptRows) {
        const batchId = (row as any)?.batch?.id ?? (row as any)?.batch_id ?? null;
        const deptId = (row as any)?.department?.id ?? null;
        if (!batchId || !deptId) continue;
        if (!propagateSectionTargets.includes(batchId)) continue;
        if (!regs.includes(row.regulation) || !sems.includes(row.semester)) continue;
        const key = `${batchId}|${row.regulation}|${row.semester}`;
        if (!existingMap.has(key)) existingMap.set(key, new Set());
        existingMap.get(key)!.add(deptId);
      }

      const needAllDepts = visibleRows.some((m) => m.for_all_departments);
      let allDeptIds: number[] = [];
      if (needAllDepts) {
        const depsRes = await fetchWithAuth('/api/curriculum/departments/');
        const depsData = depsRes.ok ? await depsRes.json() : { results: [] };
        const depList = Array.isArray(depsData) ? depsData : (depsData.results || []);
        allDeptIds = depList.map((d: any) => Number(d.id)).filter((id: number) => id > 0);
      }

      for (const m of visibleRows) {
        for (const batchId of propagateSectionTargets) {
          const key = `${batchId}|${m.regulation}|${m.semester}`;
          const existing = existingMap.get(key) || new Set<number>();
          const baseDepts = m.for_all_departments ? allDeptIds : (m.departments || []);
          const allowedDepts = baseDepts.filter((id: number) => !existing.has(id));
          const blockedCount = baseDepts.length - allowedDepts.length;
          if (blockedCount > 0) {
            const batchName = batchYears.find(b => b.id === batchId)?.name || String(batchId);
            warnings.push(`Batch ${batchName}: ${blockedCount} department(s) already have subjects; propagated to ${allowedDepts.length}.`);
          }
          if (allowedDepts.length === 0) {
            continue;
          }
          const payload: Partial<Master> = {
            regulation: m.regulation,
            semester: m.semester,
            batch_id: batchId,
            course_code: m.course_code,
            course_name: m.course_name,
            category: m.category,
            class_type: m.class_type,
            is_elective: m.is_elective,
            l: m.l, t: m.t, p: m.p, s: m.s, c: m.c,
            internal_mark: m.internal_mark,
            external_mark: m.external_mark,
            for_all_departments: false,
            departments: allowedDepts,
            editable: m.editable,
          };
          try {
            const created = await createMaster(payload);
            totalSuccess += 1;
            if (created?.id) {
              // noop
            }
          } catch (e: any) {
            allErrors.push(String(e));
          }
        }
      }
      if (allErrors.length) {
        setPropagateMessage({
          type: 'error',
          text: `${totalSuccess} created, ${allErrors.length} failed:\n${allErrors.slice(0, 5).join('\n')}`,
        });
      } else {
        const notice = warnings.length ? `\n${warnings.slice(0, 5).join('\n')}` : '';
        setPropagateMessage({
          type: warnings.length ? 'warn' : 'success',
          text: `Section propagated — ${totalSuccess} entries created across ${propagateSectionTargets.length} batch(es).${notice}`,
        });
      }
      await handleRefresh();
      setPropagateSection(false);
      setPropagateSecTargets([]);
    } catch (e: any) {
      setPropagateMessage({ type: 'error', text: 'Propagation failed: ' + String(e) });
    } finally {
      propagateMessageTimer.current = window.setTimeout(() => {
        setPropagateMessage(null);
        propagateMessageTimer.current = null;
      }, 5000);
      setPropagatingSec(false);
    }
  }


  async function handleDeleteMaster() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteMaster(deleteTarget.id);
      await handleRefresh();
      setDeleteTarget(null);
    } catch (e: any) {
      const message = String(e?.message || e || 'Delete failed');
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  }

  // show saved message when navigated from editor after create/update
  useEffect(() => {
    const state: any = loc.state as any;
    if (state && state.savedMessage) {
      setFlash(state.savedMessage);
      // clear the state so refresh/refreshing doesn't replay the message
      navigate(location.pathname, { replace: true, state: {} });
      setTimeout(() => setFlash(null), 2500);
    }
  }, [loc, navigate]);



  if (loading) return (
    <CurriculumLayout>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading masters…</p>
        </div>
      </div>
    </CurriculumLayout>
  );

  return (
    <CurriculumLayout>
      <div className="px-4 pb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Master Curriculum</h2>
              <p className="text-sm text-gray-600 mt-1">View and manage all master curriculum entries.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {(() => {
              try {
                const roles = JSON.parse(localStorage.getItem('roles') || '[]');
                const isIQAC = Array.isArray(roles) && roles.some((r: string) => String(r).toLowerCase() === 'iqac');
                if (isIQAC) return (
                  <Link
                    to="/curriculum/master/new"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    New Master
                  </Link>
                );
              } catch (e) {}
              return null;
            })()}
            <button
              onClick={() => handleDownloadVisible()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import CSV</span>
              <input id="master-import-file" type="file" accept=".csv" className="hidden" onChange={e => handleImportFile(e)} />
            </label>
          </div>
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
                {uniqueRegs.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
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
            {batchYears.length > 1 && (
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
        
        {/* Flash Message */}
        {flash && (
          <div className="mb-4 inline-block bg-green-100 text-green-800 px-4 py-2 rounded-lg font-semibold">
            {flash}
          </div>
        )}
        {propagateMessage && (
          <div
            className={`mb-4 rounded-lg px-4 py-2 text-sm font-semibold whitespace-pre-wrap ${
              propagateMessage.type === 'success'
                ? 'bg-green-100 text-green-800'
                : propagateMessage.type === 'warn'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            {propagateMessage.text}
          </div>
        )}
        
        {/* Scrollable Table View */}
        <div className="w-full overflow-x-auto bg-white rounded-lg shadow-md">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Code</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Batch</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Course</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">CAT</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Class</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Elective</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">L</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">T</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">P</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">S</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">C</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">INT</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">EXT</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">TTL</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Depts</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Editable</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-8 text-center text-gray-500">
                      No curriculum entries found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredData.map(m => (
                    <tr key={m.id} className={`hover:bg-gray-50 transition-colors ${m.editable ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-3 py-3 text-sm text-gray-900 whitespace-nowrap">{m.course_code || '-'}</td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">
                        {m.batch ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">{m.batch.name}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-900 font-medium min-w-[200px]">{m.course_name || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">{m.category || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">{m.class_type || '-'}</td>
                      <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                        {m.is_elective ? <span className="text-green-700 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900 whitespace-nowrap">{m.l ?? 0}</td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900 whitespace-nowrap">{m.t ?? 0}</td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900 whitespace-nowrap">{m.p ?? 0}</td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900 whitespace-nowrap">{m.s ?? 0}</td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900 whitespace-nowrap">{m.c ?? 0}</td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900 whitespace-nowrap">{m.internal_mark ?? '-'}</td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900 whitespace-nowrap">{m.external_mark ?? '-'}</td>
                      <td className="px-3 py-3 text-sm text-center text-gray-900 font-semibold whitespace-nowrap">{m.total_mark ?? '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {m.for_all_departments ? 'ALL' : 
                          (m.departments_display && m.departments_display.length > 0) ?
                            m.departments_display.map((d:any) => 
                              d.short_name || d.shortname || d.code || d.name
                            ).join(', ') :
                            'No Depts'
                        }
                      </td>
                      <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                        {m.editable ? <span className="text-green-700 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            to={`/curriculum/master/${m.id}`}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          {canDeleteMaster && (
                            <button
                              onClick={() => { setDeleteTarget(m); setDeleteError(null); }}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {m.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                className="px-3 py-1.5 text-green-600 hover:bg-green-50 text-xs font-medium rounded-lg transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="px-3 py-1.5 text-red-600 hover:bg-red-50 text-xs font-medium rounded-lg transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {filteredData.length > 0 && (
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={6} className="px-3 py-3 text-sm text-gray-700">Total</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-900">{totals.l}</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-900">{totals.t}</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-900">{totals.p}</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-900">{totals.s}</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-900">{totals.c}</td>
                    <td colSpan={6} className="px-3 py-3"></td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      </div>
      {/* Propagate Section Modal */}
      {propagateSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Propagate Entire Section</h3>
            <p className="text-sm text-gray-500 mb-1">
              Copy <strong>all {filteredData.length} visible rows</strong>
            </p>
            <p className="text-xs text-gray-400 mb-4">
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
                  
                  const existingIds = batchDeptExisting[b.id] || [];
                  const isBlocked = totalDeptCount > 0 && existingIds.length >= totalDeptCount;
                  return !isBlocked;
                });

                if (eligibleBatches.length === 0) {
                  return <p className="text-sm text-gray-500 italic">No eligible target batches found. All other active batches already have subjects for this selection.</p>;
                }

                return eligibleBatches.map(b => {
                  const existingIds = batchDeptExisting[b.id] || [];
                  const existingNames = existingIds.map(id => deptNameMap.get(id)).filter(Boolean).join(', ');
                  return (
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
                    {existingNames && (
                      <span className="ml-auto text-xs text-amber-700">Existing: {existingNames}</span>
                    )}
                  </label>
                  );
                });
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

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900">Delete Master Curriculum</h3>
            <p className="text-sm text-gray-600 mt-2">
              Are you sure you want to delete{' '}
              <span className="font-semibold">{deleteTarget.course_name || deleteTarget.course_code || 'this subject'}</span>?
            </p>
            <p className="text-xs text-gray-400 mt-1">This action cannot be undone.</p>
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
                onClick={handleDeleteMaster}
                disabled={deleteLoading}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </CurriculumLayout>
  );
}