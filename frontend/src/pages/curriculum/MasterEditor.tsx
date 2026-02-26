import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CurriculumLayout from './CurriculumLayout';
import CLASS_TYPES, { normalizeClassType, QP_TYPES } from '../../constants/classTypes';
import { createMaster, updateMaster, fetchMasters, fetchDeptRows } from '../../services/curriculum';
import { BookOpen, Save, X as CancelIcon } from 'lucide-react';

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
      <div className="px-2 sm:px-4 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{id === 'new' ? 'New Master' : 'Edit Master'}</h2>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">{id === 'new' ? 'Create a new master curriculum entry.' : 'Edit the selected master curriculum entry.'}</p>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={e => { e.preventDefault(); save(); }}
          className="bg-white rounded-lg shadow-md p-3 sm:p-4 lg:p-6 space-y-4"
          autoComplete="off"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Regulation</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                value={form.regulation || ''} 
                onChange={e => setForm({...form, regulation: e.target.value})} 
                required 
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Semester</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                type="number" 
                min={1} 
                value={form.semester || 1} 
                onChange={e => setForm({...form, semester: Number(e.target.value)})} 
                required 
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Course Code</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                value={form.course_code ?? ''} 
                onChange={e => setForm({...form, course_code: e.target.value})} 
                placeholder="Optional" 
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Course Name</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                value={form.course_name || ''} 
                onChange={e => setForm({...form, course_name: e.target.value})} 
                required 
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">CAT</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                value={form.category || ''} 
                onChange={e => setForm({...form, category: e.target.value})} 
                placeholder="e.g. CORE" 
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Class Type</label>
              <select 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                value={form.class_type || 'THEORY'} 
                onChange={e => setForm({...form, class_type: e.target.value})} 
              >
                {CLASS_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">QP Type</label>
              <select 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                value={form.qp_type || 'QP1'} 
                onChange={e => setForm({...form, qp_type: e.target.value})} 
              >
                {QP_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">L</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-sm" 
                type="number" 
                min={0} 
                value={form.l || 0} 
                onChange={e => setForm({...form, l: Number(e.target.value)})} 
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">T</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-sm" 
                type="number" 
                min={0} 
                value={form.t || 0} 
                onChange={e => setForm({...form, t: Number(e.target.value)})} 
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">P</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-sm" 
                type="number" 
                min={0} 
                value={form.p || 0} 
                onChange={e => setForm({...form, p: Number(e.target.value)})} 
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">S</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-sm" 
                type="number" 
                min={0} 
                value={form.s || 0} 
                onChange={e => setForm({...form, s: Number(e.target.value)})} 
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">C</label>
              <input 
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-sm" 
                type="number" 
                min={0} 
                value={form.c || 0} 
                onChange={e => setForm({...form, c: Number(e.target.value)})} 
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Internal Mark</label>
              <input
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                type="number"
                min={0}
                value={form.internal_mark ?? ''}
                onChange={e => setForm({...form, internal_mark: e.target.value === '' ? '' : Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">External Mark</label>
              <input
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                type="number"
                min={0}
                value={form.external_mark ?? ''}
                onChange={e => setForm({...form, external_mark: e.target.value === '' ? '' : Number(e.target.value)})}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <input 
                type="checkbox" 
                checked={!!form.for_all_departments} 
                onChange={e => setForm({...form, for_all_departments: e.target.checked})} 
                id="forAllDepts" 
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="forAllDepts" className="text-xs sm:text-sm font-semibold text-indigo-900">For All Departments</label>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Departments</label>
              {form.for_all_departments ? (
                <div className="text-gray-600 text-xs sm:text-sm p-2 bg-gray-50 rounded-lg">Applies to all departments</div>
              ) : (
                <div className="max-h-32 overflow-y-auto p-2 border border-gray-300 rounded-lg bg-white">
                  {departments.length === 0 && <div className="text-gray-400 text-xs">No departments available</div>}
                  {departments.map(d => (
                    <div key={d.id} className="flex items-center gap-1.5 mb-1.5">
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
                        className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <label htmlFor={`dept-${d.id}`} className="text-xs sm:text-sm text-gray-700">{d.code} — {d.name}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <input 
                type="checkbox" 
                checked={!!form.editable} 
                onChange={e => setForm({...form, editable: e.target.checked})} 
                id="editable" 
                className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="editable" className="text-xs sm:text-sm font-semibold text-indigo-900">Editable</label>
            </div>
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <input 
                type="checkbox" 
                checked={!!form.is_elective} 
                onChange={e => setForm({...form, is_elective: e.target.checked})} 
                id="is_elective" 
                className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="is_elective" className="text-xs sm:text-sm font-semibold text-indigo-900">Is Elective</label>
            </div>
          </div>
          {savedMessage && (
            <div className="bg-green-100 text-green-800 px-3 py-1.5 rounded-lg font-semibold text-sm inline-block">{savedMessage}</div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              disabled={loading}
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-sm"
              onClick={() => navigate('/curriculum/master')}
            >
              <CancelIcon className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </form>
      </div>
    </CurriculumLayout>
  );
}