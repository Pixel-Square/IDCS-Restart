import React, { useEffect, useState } from 'react';
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
      <h2>{id === 'new' ? 'New Master' : 'Edit Master'}</h2>
      <div style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
        <label>Regulation<input value={form.regulation || ''} onChange={e => setForm({...form, regulation: e.target.value})} /></label>
        <label>Semester<input type="number" value={form.semester || 1} onChange={e => setForm({...form, semester: Number(e.target.value)})} /></label>
        <label>Course Code<input value={form.course_code || ''} onChange={e => setForm({...form, course_code: e.target.value})} /></label>
        <label>Course Name<input value={form.course_name || ''} onChange={e => setForm({...form, course_name: e.target.value})} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>L<input type="number" value={form.l || 0} onChange={e => setForm({...form, l: Number(e.target.value)})} /></label>
          <label>T<input type="number" value={form.t || 0} onChange={e => setForm({...form, t: Number(e.target.value)})} /></label>
          <label>P<input type="number" value={form.p || 0} onChange={e => setForm({...form, p: Number(e.target.value)})} /></label>
          <label>S<input type="number" value={form.s || 0} onChange={e => setForm({...form, s: Number(e.target.value)})} /></label>
          <label>C<input type="number" value={form.c || 0} onChange={e => setForm({...form, c: Number(e.target.value)})} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>Internal Mark<input type="number" value={form.internal_mark || 0} onChange={e => setForm({...form, internal_mark: Number(e.target.value)})} /></label>
          <label>External Mark<input type="number" value={form.external_mark || 0} onChange={e => setForm({...form, external_mark: Number(e.target.value)})} /></label>
        </div>
        <label>For All Departments<input type="checkbox" checked={!!form.for_all_departments} onChange={e => setForm({...form, for_all_departments: e.target.checked})} /></label>
        <label>Departments (comma-separated IDs)<input value={form.departments_input || ''} onChange={e => setForm({...form, departments_input: e.target.value})} placeholder="e.g. 1,2,3" /></label>
        <label>Editable<input type="checkbox" checked={!!form.editable} onChange={e => setForm({...form, editable: e.target.checked})} /></label>
        <div>
          <button className="btn-primary" onClick={save} disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
          <button onClick={() => navigate('/curriculum/master')} style={{ marginLeft: 8 }}>Cancel</button>
        </div>
      </div>
    </CurriculumLayout>
  );
}
