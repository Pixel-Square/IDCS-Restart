

import React, { useEffect, useState } from 'react';
import { fetchMasters } from '../../services/curriculum';
import { useLocation, useNavigate } from 'react-router-dom';
import CurriculumLayout from './CurriculumLayout';
import { Link } from 'react-router-dom';
import { BookOpen, Download, Upload, Edit } from 'lucide-react';

export default function MasterList() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const loc = useLocation();
  const navigate = useNavigate();
  const uniqueRegs = data && data.length ? Array.from(new Set(data.map(d => d.regulation))) : [];
  const uniqueSems = data && data.length ? Array.from(new Set(data.map(d => d.semester))).sort((a,b)=>a-b) : [];
  const [selectedReg, setSelectedReg] = useState<string | null>(uniqueRegs.length === 1 ? uniqueRegs[0] : (uniqueRegs[0] ?? null));
  const [selectedSem, setSelectedSem] = useState<number | null>(uniqueSems.length === 1 ? uniqueSems[0] : (uniqueSems[0] ?? null));

  useEffect(() => {
    const regs = data && data.length ? Array.from(new Set(data.map(d => d.regulation))) : [];
    if (regs.length === 1) setSelectedReg(regs[0]);
    else if (!regs.includes(selectedReg || '')) setSelectedReg(regs[0] ?? null);
    const sems = data && data.length ? Array.from(new Set(data.map(d => d.semester))).sort((a:any,b:any)=>a-b) : [];
    if (sems.length === 1) setSelectedSem(sems[0]);
    else if (!sems.includes(selectedSem || -1)) setSelectedSem(sems[0] ?? null);
  }, [data]);

  useEffect(() => {
    fetchMasters()
      .then(r => setData(r))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // helpers for download / import
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

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
    if (!rows.length) { alert('No editable subjects in current view'); return }
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
    if (!confirm(`Upload ${file.name} to import masters?`)) { e.currentTarget.value = ''; return }
    try{
      const fd = new FormData();
      fd.append('csv_file', file, file.name);
      // Use native fetch so browser sets Content-Type boundary; include Authorization header manually
      const token = window.localStorage.getItem('access');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/curriculum/master/import/`, { method: 'POST', body: fd, headers });
      if (!res.ok) {
        // network-level failures and CORS preflight errors often throw before here
        let txt = '';
        try{ txt = await res.text() }catch(_){ txt = res.statusText }
        alert('Import failed: ' + (txt || res.statusText));
      } else {
        alert('Import request submitted; refresh to see changes.');
        // re-fetch masters
        setLoading(true);
        fetchMasters().then(r=> setData(r)).catch(()=>{}).finally(()=> setLoading(false));
      }
    }catch(err:any){ console.error(err); alert('Import failed: '+ (err.message || err)); }
    // Safely clear the file input value (element may be null if React re-rendered)
    try{
      const inp = document.getElementById('master-import-file') as HTMLInputElement | null;
      if (inp) inp.value = '';
    }catch(_){ }
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
          </div>
        )}
        
        {/* Flash Message */}
        {flash && (
          <div className="mb-4 inline-block bg-green-100 text-green-800 px-4 py-2 rounded-lg font-semibold">
            {flash}
          </div>
        )}
        
        {/* Scrollable Table View */}
        <div className="w-full overflow-x-auto bg-white rounded-lg shadow-md">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">Code</th>
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
                {data.filter(m => (!selectedReg || m.regulation === selectedReg) && (!selectedSem || m.semester === selectedSem)).length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-8 text-center text-gray-500">
                      No curriculum entries found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  data.filter(m => (!selectedReg || m.regulation === selectedReg) && (!selectedSem || m.semester === selectedSem)).map(m => (
                    <tr key={m.id} className={`hover:bg-gray-50 transition-colors ${m.editable ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-3 py-3 text-sm text-gray-900 whitespace-nowrap">{m.course_code || '-'}</td>
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
              </tbody>
            </table>
        </div>
      </div>
    </CurriculumLayout>
  );
}