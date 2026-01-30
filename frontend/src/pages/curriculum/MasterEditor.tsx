import React, { useEffect, useState } from 'react';
import PillButton from '../../components/PillButton';
import { useParams, useNavigate } from 'react-router-dom';
import CurriculumLayout from './CurriculumLayout';
import { createMaster, updateMaster, fetchMasters } from '../../services/curriculum';

export default function MasterEditor() {
  const { id } = useParams();
  const effectiveId = id ?? (window.location.pathname.endsWith('/new') ? 'new' : undefined);
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({ regulation: '', semester: 1, for_all_departments: true, editable: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (effectiveId && effectiveId !== 'new') {
      setLoading(true);
      fetchMasters().then(list => {
        const found = list.find(m => String(m.id) === String(effectiveId));
        if (found) setForm(found);
      }).finally(() => setLoading(false));
    }
  }, [effectiveId]);

  async function save() {
    setLoading(true);
    try {
      // Validate form data
      if (!form.regulation) throw new Error('Regulation is required');
      if (!form.semester || form.semester <= 0) throw new Error('Semester must be a positive number');
      if (!form.course_code) throw new Error('Course Code is required');
      if (!form.course_name) throw new Error('Course Name is required');
      if (form.internal_mark < 0 || form.external_mark < 0) throw new Error('Marks cannot be negative');

      // Prepare payload; parse comma-separated department ids if provided
      const payload: any = { ...form };
      if (form.departments_input) {
        payload.departments = String(form.departments_input)
          .split(',')
          .map((s: string) => Number(s.trim()))
          .filter((n: number) => !Number.isNaN(n));
      }

      if (effectiveId === 'new') {
        const r = await createMaster(payload);
        navigate(`/curriculum/master/${r.id}`);
      } else {
        // Only call update when we have a valid numeric id
        const numericId = Number(effectiveId);
        if (Number.isNaN(numericId)) throw new Error('Invalid master id');
        await updateMaster(numericId, payload);
        navigate('/curriculum/master');
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <CurriculumLayout>
      <div className="welcome" style={{ marginBottom: 24 }}>
        <div className="welcome-left">
          <svg className="welcome-icon" fill="none" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e0e7ff"/><path d="M16 32V16h16v16H16zm2-2h12V18H18v12zm2-2v-8h8v8h-8z" fill="#6366f1"/></svg>
          <div>
            <h2 className="welcome-title" style={{ fontSize: 22, marginBottom: 2 }}>{id === 'new' ? 'New Master' : 'Edit Master'}</h2>
            <div className="welcome-sub">{id === 'new' ? 'Create a new master curriculum entry.' : 'Edit the selected master curriculum entry.'}</div>
          </div>
        </div>
      </div>
      <form
        onSubmit={e => { e.preventDefault(); save(); }}
        style={{
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 2px 8px #e5e7eb',
          padding: 32,
          maxWidth: 700,
          margin: '0 auto',
          display: 'grid',
          gap: 22
        }}
        autoComplete="off"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Regulation</label>
            <input className="input" value={form.regulation || ''} onChange={e => setForm({...form, regulation: e.target.value})} required style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Semester</label>
            <input className="input" type="number" min={1} value={form.semester || 1} onChange={e => setForm({...form, semester: Number(e.target.value)})} required style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Course Code</label>
            <input className="input" value={form.course_code || ''} onChange={e => setForm({...form, course_code: e.target.value})} required style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Course Name</label>
            <input className="input" value={form.course_name || ''} onChange={e => setForm({...form, course_name: e.target.value})} required style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18 }}>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>L</label>
            <input className="input" type="number" min={0} value={form.l || 0} onChange={e => setForm({...form, l: Number(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>T</label>
            <input className="input" type="number" min={0} value={form.t || 0} onChange={e => setForm({...form, t: Number(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>P</label>
            <input className="input" type="number" min={0} value={form.p || 0} onChange={e => setForm({...form, p: Number(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>S</label>
            <input className="input" type="number" min={0} value={form.s || 0} onChange={e => setForm({...form, s: Number(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>C</label>
            <input className="input" type="number" min={0} value={form.c || 0} onChange={e => setForm({...form, c: Number(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Internal Mark</label>
            <input className="input" type="number" min={0} value={form.internal_mark || 0} onChange={e => setForm({...form, internal_mark: Number(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>External Mark</label>
            <input className="input" type="number" min={0} value={form.external_mark || 0} onChange={e => setForm({...form, external_mark: Number(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <input type="checkbox" checked={!!form.for_all_departments} onChange={e => setForm({...form, for_all_departments: e.target.checked})} id="forAllDepts" />
            <label htmlFor="forAllDepts" style={{ fontWeight: 600, color: '#3730a3', marginBottom: 0 }}>For All Departments</label>
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Departments (comma-separated IDs)</label>
            <input className="input" value={form.departments_input || ''} onChange={e => setForm({...form, departments_input: e.target.value})} placeholder="e.g. 1,2,3" style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <input type="checkbox" checked={!!form.editable} onChange={e => setForm({...form, editable: e.target.checked})} id="editable" />
          <label htmlFor="editable" style={{ fontWeight: 600, color: '#3730a3', marginBottom: 0 }}>Editable</label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            type="submit"
            className="btn-primary"
            style={{ padding: '6px 18px', borderRadius: 8, fontWeight: 600, fontSize: 16, minWidth: 100 }}
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '6px 18px', borderRadius: 8, fontWeight: 600, fontSize: 16, minWidth: 100 }}
            onClick={() => navigate('/curriculum/master')}
          >
            Cancel
          </button>
        </div>
      </form>
    </CurriculumLayout>
  );
}
