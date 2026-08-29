import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import CurriculumLayout from './CurriculumLayout';
import CLASS_TYPES, { normalizeClassType, QP_TYPES } from '../../constants/classTypes';
import { createMaster, updateMaster, fetchMasters, fetchBatchYears, fetchFieldSchemas, CurriculumFieldSchema } from '../../services/curriculum';
import fetchWithAuth from '../../services/fetchAuth';
import { BookOpen, Save, X as CancelIcon, ArrowLeft } from 'lucide-react';
import { showAlert } from '../../utils/dialog';


function coerceSchemaDefault(schema: CurriculumFieldSchema) {
  const raw = schema.default_value;
  if (raw === '' || raw === null || raw === undefined) {
    return schema.data_type === 'bool' ? false : '';
  }
  if (schema.data_type === 'int') {
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isNaN(parsed) ? '' : parsed;
  }
  if (schema.data_type === 'float') {
    const parsed = Number.parseFloat(String(raw));
    return Number.isNaN(parsed) ? '' : parsed;
  }
  if (schema.data_type === 'bool') {
    return ['true', '1', 'yes', 'y', 'on'].includes(String(raw).trim().toLowerCase());
  }
  return String(raw);
}

export default function MasterEditor() {
  const { id: routeCollegeId, masterId: routeMasterId } = useParams();
  
  useEffect(() => {
    if (routeCollegeId) {
      window.localStorage.setItem('selectedCollegeId', routeCollegeId);
    }
  }, [routeCollegeId]);

  const selectedCollegeId = routeCollegeId || window.localStorage.getItem('selectedCollegeId');

  const effectiveId = routeMasterId ?? (window.location.pathname.endsWith('/new') ? 'new' : undefined);
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({ regulation: '', semester: 1, for_all_departments: true, editable: false, is_elective: false, dynamic_data: {} });
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Array<{id:number; code:string; name:string}>>([]);
  const [batchYears, setBatchYears] = useState<any[]>([]);
  const [fieldSchemas, setFieldSchemas] = useState<CurriculumFieldSchema[]>([]);
  const [regulations, setRegulations] = useState<Array<{ id: number; code: string; name?: string; is_active?: boolean }>>([]);
  const [semesters, setSemesters] = useState<Array<{ id: number; number: number; name?: string }>>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const activeFieldSchemas = useMemo(
    // Use is_core to distinguish backend hardcoded fields (is_core=true) from
    // user-created custom fields (is_core=false). This is the authoritative flag
    // and avoids the fragile key-name exclusion list that could hide valid custom fields.
    () => fieldSchemas.filter((schema) => !schema.is_core && schema.is_active && (schema.scope === 'both' || schema.scope === 'master')),
    [fieldSchemas],
  );

  const isFieldActive = (key: string) => fieldSchemas.length === 0 || fieldSchemas.some(s => s.key === key);


  useEffect(() => {
    if (effectiveId && effectiveId !== 'new') {
      setLoading(true);
      fetchMasters().then(list => {
        const found = list.find(m => String(m.id) === String(effectiveId));
        if (found) setForm({ ...found, dynamic_data: found.dynamic_data || {} });
      }).finally(() => setLoading(false));
    }
  }, [effectiveId]);

  // load departments list for checkboxes (curriculum permissions)
  useEffect(() => {
    fetchWithAuth('/api/curriculum/departments/')
      .then(res => res.json())
      .then(data => setDepartments(data.results || []))
      .catch(() => setDepartments([]));
    fetchBatchYears().then(setBatchYears).catch(() => {});
    fetchFieldSchemas('master')
      .then(data => setFieldSchemas(data.filter(schema => schema.is_active)))
      .catch(() => setFieldSchemas([]));

    const collegeParam = selectedCollegeId ? `?college_id=${encodeURIComponent(String(selectedCollegeId))}` : '';
    fetchWithAuth(`/api/curriculum/regulations/${collegeParam}`)
      .then(res => res.ok ? res.json() : { results: [] })
      .then(data => {
        const list = Array.isArray(data) ? data : (data.results || []);
        setRegulations(list.filter((r: any) => r && r.code && (r.is_active !== false)));
      })
      .catch(() => setRegulations([]));

    fetchWithAuth('/api/academics/semesters/')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : (data.results || []);
        setSemesters(list.filter((s: any) => s && typeof s.id === 'number' && typeof s.number === 'number'));
      })
      .catch(() => setSemesters([]));
  }, [selectedCollegeId]);

  useEffect(() => {
    if (!form.semester_id && form.semester && semesters.length) {
      const matched = semesters.find((s) => Number(s.number) === Number(form.semester));
      if (matched) {
        setForm((prev: any) => ({ ...prev, semester_id: matched.id }));
      }
    }
  }, [form.semester, form.semester_id, semesters]);

  useEffect(() => {
    if (effectiveId !== 'new' || activeFieldSchemas.length === 0) return;
    setForm((prev: any) => {
      const currentDynamic = { ...(prev.dynamic_data || {}) };
      let changed = false;
      for (const schema of activeFieldSchemas) {
        if (currentDynamic[schema.key] === undefined || currentDynamic[schema.key] === null || currentDynamic[schema.key] === '') {
          currentDynamic[schema.key] = coerceSchemaDefault(schema);
          changed = true;
        }
      }
      return changed ? { ...prev, dynamic_data: currentDynamic } : prev;
    });
  }, [effectiveId, activeFieldSchemas]);

  async function save() {
    setLoading(true);
    try {
      // Validate form data
      if (!form.regulation) throw new Error('Regulation is required');
      if (!form.semester_id && (!form.semester || form.semester <= 0)) throw new Error('Semester is required');
      // course_code is optional now
      if (isFieldActive('course_name') && !form.course_name) throw new Error('Course Name is required');
      if ((form.internal_mark !== '' && form.internal_mark != null && form.internal_mark < 0) || (form.external_mark !== '' && form.external_mark != null && form.external_mark < 0)) throw new Error('Marks cannot be negative');

      // Prepare payload; use selected department ids array
      const payload: any = { ...form };
      payload.dynamic_data = { ...(form.dynamic_data || {}) };
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
      if (form.semester_id) {
        payload.semester_id = Number(form.semester_id);
      }

      if (effectiveId === 'new') {
        const r = await createMaster(payload);
        // After creating a new master, navigate back to the list and pass
        // a small saved message so the list can show feedback and reload.
        navigate(`/colleges/${selectedCollegeId}/curriculum/master`, { state: { savedMessage: 'Saved', newId: r.id } });
      } else {
        // Only call update when we have a valid numeric id
        const numericId = Number(effectiveId);
        if (Number.isNaN(numericId)) throw new Error('Invalid master id');
        await updateMaster(numericId, payload);
        navigate(`/colleges/${selectedCollegeId}/curriculum/master`, { state: { savedMessage: 'Saved', updatedId: numericId } });
      }
    } catch (e: any) {
      await showAlert(`Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <CurriculumLayout>
      <div className="px-2 sm:px-4 pb-4">
        <div className="mb-4 flex items-center justify-between">
          <Link
            to={`/colleges/${selectedCollegeId}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to College Dashboard
          </Link>
          <Link
            to={`/colleges/${selectedCollegeId}/curriculum/master`}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Go to Master List
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{effectiveId === 'new' ? 'New Master' : 'Edit Master'}</h2>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">{effectiveId === 'new' ? 'Create a new master curriculum entry.' : 'Edit the selected master curriculum entry.'}</p>
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
              <select
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                value={form.regulation || ''}
                onChange={e => setForm({ ...form, regulation: e.target.value })}
                required
              >
                <option value="">Select Regulation</option>
                {regulations.map((r) => (
                  <option key={r.id} value={r.code}>
                    {r.code}{r.name ? ` - ${r.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Semester</label>
              <select
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                value={form.semester_id ?? ''}
                onChange={e => {
                  const selectedId = e.target.value ? Number(e.target.value) : null;
                  const selectedSemester = semesters.find((s) => s.id === selectedId);
                  setForm({ ...form, semester_id: selectedId, semester: selectedSemester?.number ?? form.semester });
                }}
                required
              >
                <option value="">Select Semester</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || `SEM${s.number}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Batch</label>
              <select
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                value={form.batch_id ?? form.batch?.id ?? ''}
                onChange={e => setForm({...form, batch_id: e.target.value ? Number(e.target.value) : null})}
              >
                <option value="">— No Batch —</option>
                {batchYears.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
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
            {isFieldActive('course_name') && (
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">Course Name</label>
                <input 
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                  value={form.course_name || ''} 
                  onChange={e => setForm({...form, course_name: e.target.value})} 
                  required 
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {isFieldActive('category') && (
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">CAT</label>
                <input 
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                  value={form.category || ''} 
                  onChange={e => setForm({...form, category: e.target.value})} 
                  placeholder="e.g. CORE" 
                />
              </div>
            )}
            {isFieldActive('class_type') && (
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
            )}
            {isFieldActive('qp_type') && (
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
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {isFieldActive('l') && (
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
            )}
            {isFieldActive('t') && (
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
            )}
            {isFieldActive('p') && (
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
            )}
            {isFieldActive('s') && (
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
            )}
            {isFieldActive('c') && (
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
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isFieldActive('internal_mark') && (
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
            )}
            {isFieldActive('external_mark') && (
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">External Mark</label>
                <input
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  type="number"
                  min={0}
                  value={form.external_mark || ''}
                  onChange={e => setForm({...form, external_mark: e.target.value === '' ? '' : Number(e.target.value)})}
                />
              </div>
            )}
          </div>

          {activeFieldSchemas.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Additional Master Fields</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeFieldSchemas.map(schema => {
                  const currentValue = (form.dynamic_data || {})[schema.key];
                  return (
                    <div key={schema.key}>
                      <label className="block text-xs sm:text-sm font-semibold text-indigo-900 mb-1">{schema.label}</label>
                      {schema.data_type === 'bool' ? (
                        <label className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-300 w-full">
                          <input
                            type="checkbox"
                            checked={Boolean(currentValue)}
                            onChange={e => setForm({
                              ...form,
                              dynamic_data: { ...(form.dynamic_data || {}), [schema.key]: e.target.checked },
                            })}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{schema.default_value ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      ) : schema.data_type === 'select' ? (
                        <select
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                          value={currentValue ?? ''}
                          onChange={e => setForm({
                            ...form,
                            dynamic_data: { ...(form.dynamic_data || {}), [schema.key]: e.target.value },
                          })}
                        >
                          <option value="">Select {schema.label}</option>
                          {(schema.options || []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          type={schema.data_type === 'int' || schema.data_type === 'float' ? 'number' : 'text'}
                          step={schema.data_type === 'float' ? 'any' : schema.data_type === 'int' ? '1' : undefined}
                          value={currentValue ?? ''}
                          onChange={e => setForm({
                            ...form,
                            dynamic_data: {
                              ...(form.dynamic_data || {}),
                              [schema.key]: schema.data_type === 'int'
                                ? (e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
                                : schema.data_type === 'float'
                                ? (e.target.value === '' ? null : Number.parseFloat(e.target.value))
                                : e.target.value,
                            },
                          })}
                          placeholder={schema.label}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
            {isFieldActive('is_elective') && (
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
            )}
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
              onClick={() => navigate(`/colleges/${selectedCollegeId}/curriculum/master`)}
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