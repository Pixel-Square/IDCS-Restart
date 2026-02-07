import React, { useEffect, useState } from 'react';
import PillButton from '../../components/PillButton';
import { useParams, useNavigate } from 'react-router-dom';
import CurriculumLayout from './CurriculumLayout';
import { createMaster, updateMaster, fetchMasters, fetchDeptRows } from '../../services/curriculum';

export default function MasterEditor() {
  const { id } = useParams();
  const effectiveId = id ?? (window.location.pathname.endsWith('/new') ? 'new' : undefined);
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({ regulation: '', semester: 1, for_all_departments: true, editable: false, is_elective: false });
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Array<{id:number; code:string; name:string}>>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (effectiveId && effectiveId !== 'new') {
      setLoading(true);
      fetchMasters().then(list => {
        const found = list.find(m => String(m.id) === String(effectiveId));
        if (found) setForm(found);
      }).finally(() => setLoading(false));
    }
  }, [effectiveId]);

  // load departments list for checkboxes
  useEffect(() => {
    fetchDeptRows().then(rows => {
      const map = new Map<number, any>();
      rows.forEach(r => map.set(r.department.id, r.department));
      setDepartments(Array.from(map.values()));
    }).catch(() => setDepartments([]));
  }, []);

  async function save() {
    setLoading(true);
    try {
      // Validate form data
      if (!form.regulation) throw new Error('Regulation is required');
      if (!form.semester || form.semester <= 0) throw new Error('Semester must be a positive number');
      // course_code is optional now
      if (!form.course_name) throw new Error('Course Name is required');
      if ((form.internal_mark !== '' && form.internal_mark != null && form.internal_mark < 0) || (form.external_mark !== '' && form.external_mark != null && form.external_mark < 0)) throw new Error('Marks cannot be negative');

      // Prepare payload; use selected department ids array
      const payload: any = { ...form };
      if (!form.for_all_departments) {
        payload.departments = Array.isArray(form.departments) ? form.departments : [];
      } else {
        payload.departments = [];
      }

      // coerce empty marks to 0 for payload
      payload.internal_mark = (form.internal_mark === '' || form.internal_mark == null) ? 0 : Number(form.internal_mark);
      payload.external_mark = (form.external_mark === '' || form.external_mark == null) ? 0 : Number(form.external_mark);
      // ensure course_code is null when left empty
      payload.course_code = (form.course_code === '' || form.course_code == null) ? null : form.course_code;

      if (effectiveId === 'new') {
        const r = await createMaster(payload);
        // After creating a new master, navigate back to the list and pass
        // a small saved message so the list can show feedback and reload.
        navigate('/curriculum/master', { state: { savedMessage: 'Saved', newId: r.id } });
      } else {
        // Only call update when we have a valid numeric id
        const numericId = Number(effectiveId);
        if (Number.isNaN(numericId)) throw new Error('Invalid master id');
        const updated = await updateMaster(numericId, payload);
        // refresh component with server response and show saved message
        setForm(updated);
        setSavedMessage('Saved');
        setTimeout(() => setSavedMessage(null), 2500);
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
            <input className="input" value={form.course_code ?? ''} onChange={e => setForm({...form, course_code: e.target.value})} placeholder="Optional" style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Course Name</label>
            <input className="input" value={form.course_name || ''} onChange={e => setForm({...form, course_name: e.target.value})} required style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>CAT</label>
            <input className="input" value={form.category || ''} onChange={e => setForm({...form, category: e.target.value})} placeholder="e.g. CORE" style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Class</label>
            <input className="input" value={form.class_type || ''} onChange={e => setForm({...form, class_type: e.target.value})} placeholder="e.g. Theory" style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }} />
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
            <input
              className="input"
              type="number"
              min={0}
              value={form.internal_mark ?? ''}
              onChange={e => setForm({...form, internal_mark: e.target.value === '' ? '' : Number(e.target.value)})}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>External Mark</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.external_mark ?? ''}
              onChange={e => setForm({...form, external_mark: e.target.value === '' ? '' : Number(e.target.value)})}
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', marginTop: 4 }}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <input type="checkbox" checked={!!form.for_all_departments} onChange={e => setForm({...form, for_all_departments: e.target.checked})} id="forAllDepts" />
            <label htmlFor="forAllDepts" style={{ fontWeight: 600, color: '#3730a3', marginBottom: 0 }}>For All Departments</label>
          </div>
          <div>
            <label style={{ fontWeight: 600, color: '#3730a3' }}>Departments</label>
            {form.for_all_departments ? (
              <div style={{ marginTop: 6, color: '#6b7280' }}>Applies to all departments</div>
            ) : (
              <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto', padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                {departments.length === 0 && <div style={{ color: '#9ca3af' }}>No departments available</div>}
                {departments.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={Array.isArray(form.departments) ? form.departments.includes(d.id) : false}
                      onChange={e => {
                        const cur = Array.isArray(form.departments) ? [...form.departments] : [];
                        if (e.target.checked) {
                          if (!cur.includes(d.id)) cur.push(d.id);
                        } else {
                          const idx = cur.indexOf(d.id); if (idx >= 0) cur.splice(idx, 1);
                        }
                        setForm({ ...form, departments: cur });
                      }}
                      id={`dept-${d.id}`}
                    />
                    <label htmlFor={`dept-${d.id}`} style={{ marginBottom: 0 }}>{d.code} — {d.name}</label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <input type="checkbox" checked={!!form.editable} onChange={e => setForm({...form, editable: e.target.checked})} id="editable" />
          <label htmlFor="editable" style={{ fontWeight: 600, color: '#3730a3', marginBottom: 0 }}>Editable</label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <input type="checkbox" checked={!!form.is_elective} onChange={e => setForm({...form, is_elective: e.target.checked})} id="is_elective" />
          <label htmlFor="is_elective" style={{ fontWeight: 600, color: '#3730a3', marginBottom: 0 }}>Is Elective</label>
        </div>
        {savedMessage && (
          <div style={{ background: '#ecfccb', color: '#365314', padding: '8px 12px', borderRadius: 8, fontWeight: 600, display: 'inline-block' }}>{savedMessage}</div>
        )}
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
