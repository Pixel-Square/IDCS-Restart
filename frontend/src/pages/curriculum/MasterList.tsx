

import React, { useEffect, useState } from 'react';
import PillButton from '../../components/PillButton';
import '../../components/PillButton.css';
import { fetchMasters } from '../../services/curriculum';
import { useLocation, useNavigate } from 'react-router-dom';
import CurriculumLayout from './CurriculumLayout';
import { Link } from 'react-router-dom';
import './CurriculumPage.css';
import '../Dashboard.css';

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
      const deps = (m.for_all_departments ? '' : (m.departments_display || []).map((d:any)=>d.code).join(','));
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
      <div className="db-loading">Loading masters…</div>
    </CurriculumLayout>
  );

  return (
    <CurriculumLayout>
      <div className="curriculum-header">
        <span className="curriculum-header-icon">
          <svg width="28" height="28" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M16 32V16h16v16H16zm2-2h12V18H18v12zm2-2v-8h8v8h-8z" fill="#6366f1"/></svg>
        </span>
        <div>
          <h2 className="curriculum-header-title">Department Curriculum</h2>
          <div className="curriculum-header-sub">View and manage all department curriculum entries.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {(() => {
            try {
              const roles = JSON.parse(localStorage.getItem('roles') || '[]');
              const isIQAC = Array.isArray(roles) && roles.some((r: string) => String(r).toLowerCase() === 'iqac');
              if (isIQAC) return (
                <>
                  <Link to="/curriculum/master/new" className="btn-primary" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: 8 }}>New Master</Link>
                </>
              );
            } catch (e) {}
            return null;
          })()}
          {/* Download editable subjects and import CSV */}
          <button className="btn" onClick={() => handleDownloadVisible()} style={{ marginLeft: 8 }}>Download Editable</button>
          <label className="btn" style={{ marginLeft: 8, cursor: 'pointer' }}>
            Import CSV
            <input id="master-import-file" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleImportFile(e)} />
          </label>
        </div>
      </div>
      {uniqueRegs.length > 0 && (
        <div className="curriculum-regs-row">
          <span style={{ color: '#374151', fontWeight: 500 }}>Regulation:</span>
          <div className="curriculum-regs-pills">
            {uniqueRegs.map(r => {
              const isActive = selectedReg === r;
              return (
                <PillButton
                  key={r}
                  onClick={() => setSelectedReg(r)}
                  variant={isActive ? 'primary' : 'secondary'}
                  style={isActive ? { boxShadow: '0 2px 8px #e0e7ff' } : {}}
                >
                  {r}
                </PillButton>
              );
            })}
          </div>
          <div style={{ width: 16 }} />
          <span style={{ color: '#374151', fontWeight: 500 }}>Semester:</span>
          <select
            value={selectedSem ?? ''}
            onChange={e => setSelectedSem(e.target.value ? Number(e.target.value) : null)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1e293b', fontWeight: 500, marginLeft: 8 }}
          >
            {uniqueSems.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        {flash && (
          <div style={{ marginBottom: 8, display: 'inline-block', background: '#ecfccb', color: '#365314', padding: '8px 12px', borderRadius: 8, fontWeight: 600 }}>{flash}</div>
        )}
        <table className="curriculum-table">
          <thead>
            <tr>
              <th>Sem</th>
              <th>Code</th>
              <th>Course</th>
              <th>CAT</th>
              <th>Class</th>
              <th>Elective</th>
              <th>L</th>
              <th>T</th>
              <th>P</th>
              <th>S</th>
              <th>C</th>
              <th>INT</th>
              <th>EXT</th>
              <th>TTL</th>
              <th>Depts</th>
              <th>Editable</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.filter(m => (!selectedReg || m.regulation === selectedReg) && (!selectedSem || m.semester === selectedSem)).map(m => (
              <tr key={m.id} style={{ background: m.editable ? '#f8fafc' : '#fff' }}>
                <td>{m.semester}</td>
                <td>{m.course_code || '-'}</td>
                <td>{m.course_name || '-'}</td>
                <td>{m.category || '-'}</td>
                <td>{m.class_type || '-'}</td>
                <td style={{ textAlign: 'center' }}>{m.is_elective ? <span style={{ color: '#059669', fontWeight: 600 }}>Yes</span> : <span style={{ color: '#9ca3af' }}>No</span>}</td>
                <td>{m.l ?? 0}</td>
                <td>{m.t ?? 0}</td>
                <td>{m.p ?? 0}</td>
                <td>{m.s ?? 0}</td>
                <td>{m.c ?? 0}</td>
                <td>{m.internal_mark ?? '-'}</td>
                <td>{m.external_mark ?? '-'}</td>
                <td>{m.total_mark ?? '-'}</td>
                <td>{m.for_all_departments ? 'ALL' : (m.departments_display || []).map((d:any)=>d.code).join(', ')}</td>
                <td style={{ padding: '10px 8px' }}>{m.editable ? <span style={{ color: '#059669', fontWeight: 600 }}>Yes</span> : <span style={{ color: '#9ca3af' }}>No</span>}</td>
                <td>
                  <span className={`curriculum-status ${String(m.status || '').toLowerCase()}`}>{
                    m.status === 'APPROVED' ? 'Approved' :
                    m.status === 'REJECTED' ? 'Rejected' :
                    'Pending'
                  }</span>
                </td>
                <td>
                  <div className="curriculum-actions">
                    <Link
                      to={`/curriculum/master/${m.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <PillButton variant="secondary" style={{ minWidth: 70, padding: '0 14px', height: 32, borderRadius: 999, fontWeight: 600, fontSize: 15 }}>
                        Edit
                      </PillButton>
                    </Link>
                    {m.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          style={{
                            padding: '6px 18px',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 16,
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
                          type="button"
                          style={{
                            padding: '6px 18px',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 16,
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
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CurriculumLayout>
  );
}