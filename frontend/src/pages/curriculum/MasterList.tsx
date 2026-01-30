

import React, { useEffect, useState } from 'react';
import PillButton from '../../components/PillButton';
import '../../components/PillButton.css';
import { fetchMasters } from '../../services/curriculum';
import CurriculumLayout from './CurriculumLayout';
import { Link } from 'react-router-dom';
import './CurriculumPage.css';
import '../Dashboard.css';

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
        <div style={{ marginLeft: 'auto' }}>
          {(() => {
            try {
              const roles = JSON.parse(localStorage.getItem('roles') || '[]');
              const isIQAC = Array.isArray(roles) && roles.some((r: string) => String(r).toLowerCase() === 'iqac');
              if (isIQAC) return (
                <Link to="/curriculum/master/new" className="btn-primary" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: 8 }}>New Master</Link>
              );
            } catch (e) {}
            return null;
          })()}
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
        </div>
      )}
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="curriculum-table">
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
              <th>Depts</th>
              <th>Editable</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.filter(m => !selectedReg || m.regulation === selectedReg).map(m => (
              <tr key={m.id} style={{ background: m.editable ? '#f8fafc' : '#fff' }}>
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
                <td>
                  <span className={`curriculum-status ${m.status?.toLowerCase()}`}>{
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
