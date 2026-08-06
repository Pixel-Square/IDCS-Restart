import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { BookOpen, Plus, Pencil, Trash2, Search, X, ArrowLeft, Check, Filter } from 'lucide-react';

interface CurrItem {
  id: number; regulation: string; semester: number; semester_label: string;
  course_code: string; course_name: string; class_type: string; category: string;
  is_elective: boolean; l: number; t: number; p: number; s: number; c: number;
  internal_mark: number | null; external_mark: number | null; total_mark: number | null;
  for_all_departments: boolean; departments: { id: number; code: string; name: string }[];
  editable: boolean; qp_type: string; created_at: string | null;
}
interface RegOption { id: number; code: string; name: string; }
interface DeptOption { id: number; code: string; name: string; }
interface SemOption { id: number; number: number; label: string; }

const CLASS_TYPES = [
  'THEORY','THEORY_PMBL','LAB','PURE_LAB','TCPL','TCPR','PRACTICAL','PRBL','PROJECT','AUDIT','SPECIAL'
];

interface FormData {
  course_code: string; course_name: string; regulation: string; semester: number | null;
  class_type: string; category: string; is_elective: boolean;
  l: number; t: number; p: number; s: number; c: number;
  internal_mark: string; external_mark: string;
  for_all_departments: boolean; department_ids: number[];
  editable: boolean; qp_type: string;
}

const emptyForm: FormData = {
  course_code: '', course_name: '', regulation: '', semester: null,
  class_type: 'THEORY', category: '', is_elective: false,
  l: 0, t: 0, p: 0, s: 0, c: 0, internal_mark: '', external_mark: '',
  for_all_departments: true, department_ids: [], editable: false, qp_type: 'QP1',
};

export default function CurriculumMasterPage() {
  const navigate = useNavigate();
  const { collegeId } = useParams();
  const [items, setItems] = useState<CurrItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CurrItem | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [regs, setRegs] = useState<RegOption[]>([]);
  const [depts, setDepts] = useState<DeptOption[]>([]);
  const [sems, setSems] = useState<SemOption[]>([]);

  // Filters
  const [fReg, setFReg] = useState('');
  const [fSem, setFSem] = useState('');
  const [fType, setFType] = useState('');
  const [fDept, setFDept] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (fReg) params.set('regulation', fReg);
      if (fSem) params.set('semester', fSem);
      if (fType) params.set('class_type', fType);
      if (fDept) params.set('department', fDept);
      const res = await fetchWithAuth(`/api/college/colleges/${collegeId}/curriculum/master/?${params.toString()}`);
      if (res.ok) setItems(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, collegeId, fReg, fSem, fType, fDept]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Load dropdowns once
  useEffect(() => {
    (async () => {
      try {
        const [rRes, dRes, sRes] = await Promise.all([
          fetchWithAuth(`/api/college/colleges/${collegeId}/regulations/`),
          fetchWithAuth(`/api/college/colleges/${collegeId}/departments/`),
          fetchWithAuth(`/api/college/colleges/${collegeId}/semesters/`),
        ]);
        if (rRes.ok) setRegs(await rRes.json());
        if (dRes.ok) setDepts(await dRes.json());
        if (sRes.ok) setSems(await sRes.json());
      } catch { /* ignore */ }
    })();
  }, [collegeId]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setShowModal(true); };
  const openEdit = (item: CurrItem) => {
    setEditing(item);
    setForm({
      course_code: item.course_code || '', course_name: item.course_name || '',
      regulation: item.regulation, semester: item.semester,
      class_type: item.class_type, category: item.category || '',
      is_elective: item.is_elective,
      l: item.l || 0, t: item.t || 0, p: item.p || 0, s: item.s || 0, c: item.c || 0,
      internal_mark: item.internal_mark?.toString() ?? '',
      external_mark: item.external_mark?.toString() ?? '',
      for_all_departments: item.for_all_departments,
      department_ids: item.departments.map(d => d.id),
      editable: item.editable, qp_type: item.qp_type || 'QP1',
    });
    setError(''); setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const url = editing
        ? `/api/college/colleges/${collegeId}/curriculum/master/${editing.id}/`
        : `/api/college/colleges/${collegeId}/curriculum/master/`;
      const method = editing ? 'PUT' : 'POST';
      const payload = {
        ...form,
        internal_mark: form.internal_mark ? Number(form.internal_mark) : null,
        external_mark: form.external_mark ? Number(form.external_mark) : null,
      };
      const res = await fetchWithAuth(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Save failed'); setSaving(false); return; }
      setShowModal(false); fetchItems();
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await fetchWithAuth(`/api/college/colleges/${collegeId}/curriculum/master/${id}/`, { method: 'DELETE' });
      setDeleteConfirm(null); fetchItems();
    } catch { /* ignore */ }
  };

  const clearFilters = () => { setFReg(''); setFSem(''); setFType(''); setFDept(''); };
  const hasFilters = fReg || fSem || fType || fDept;

  const selCls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const inpCls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(`/colleges/${collegeId}`)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-3 bg-emerald-100 rounded-xl">
          <BookOpen className="w-7 h-7 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master Curriculum</h1>
          <p className="text-sm text-gray-500">Manage course catalog for this college</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Courses</p>
          <p className="text-2xl font-bold text-gray-900">{items.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Theory</p>
          <p className="text-2xl font-bold text-blue-600">{items.filter(i => i.class_type === 'THEORY').length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Lab / Practical</p>
          <p className="text-2xl font-bold text-purple-600">{items.filter(i => ['LAB','PURE_LAB','PRACTICAL'].includes(i.class_type)).length}</p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by code or name..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${hasFilters ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Filter className="w-4 h-4" /> Filters {hasFilters && <span className="bg-emerald-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">!</span>}
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Add Course
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={fReg} onChange={e => setFReg(e.target.value)} className={selCls}>
            <option value="">All Regulations</option>
            {regs.map(r => <option key={r.id} value={r.code}>{r.code}</option>)}
          </select>
          <select value={fSem} onChange={e => setFSem(e.target.value)} className={selCls}>
            <option value="">All Semesters</option>
            {sems.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={fType} onChange={e => setFType(e.target.value)} className={selCls}>
            <option value="">All Types</option>
            {CLASS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <select value={fDept} onChange={e => setFDept(e.target.value)} className={selCls}>
              <option value="">All Departments</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
            {hasFilters && <button onClick={clearFilters} className="p-2 text-gray-400 hover:text-red-500 rounded-lg" title="Clear"><X className="w-4 h-4" /></button>}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No courses found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Course Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reg</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sem</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">L-T-P-S-C</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Marks</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.course_code}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">{item.course_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.regulation}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.semester_label || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.class_type === 'THEORY' ? 'bg-blue-100 text-blue-700' :
                        item.class_type === 'LAB' || item.class_type === 'PURE_LAB' ? 'bg-purple-100 text-purple-700' :
                        item.class_type === 'PROJECT' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{item.class_type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-center font-mono">{item.l}-{item.t}-{item.p}-{item.s}-{item.c}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-center">
                      {item.internal_mark != null || item.external_mark != null
                        ? `${item.internal_mark ?? 0}+${item.external_mark ?? 0}=${item.total_mark ?? 0}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {deleteConfirm === item.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(item.id)} className="p-1.5 text-white bg-red-500 hover:bg-red-600 rounded-lg" title="Confirm"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setDeleteConfirm(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Course' : 'Add Course'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Course Code *</label>
                  <input value={form.course_code} onChange={e => setForm(f => ({ ...f, course_code: e.target.value }))}
                    className={inpCls} placeholder="CS3351" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
                  <input value={form.course_name} onChange={e => setForm(f => ({ ...f, course_name: e.target.value }))}
                    className={inpCls} placeholder="Data Structures" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Regulation *</label>
                  <select value={form.regulation} onChange={e => setForm(f => ({ ...f, regulation: e.target.value }))} className={selCls}>
                    <option value="">— Select —</option>
                    {regs.map(r => <option key={r.id} value={r.code}>{r.code}{r.name ? ` — ${r.name}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Semester *</label>
                  <select value={form.semester ?? ''} onChange={e => setForm(f => ({ ...f, semester: e.target.value ? Number(e.target.value) : null }))} className={selCls}>
                    <option value="">— Select —</option>
                    {sems.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class Type</label>
                  <select value={form.class_type} onChange={e => setForm(f => ({ ...f, class_type: e.target.value }))} className={selCls}>
                    {CLASS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {/* L-T-P-S-C */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credits (L-T-P-S-C)</label>
                <div className="grid grid-cols-5 gap-2">
                  {(['l','t','p','s','c'] as const).map(k => (
                    <div key={k}>
                      <label className="block text-xs text-gray-400 mb-0.5 text-center">{k.toUpperCase()}</label>
                      <input type="number" min={0} value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: Number(e.target.value) || 0 }))}
                        className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Marks */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Internal Marks</label>
                  <input type="number" value={form.internal_mark} onChange={e => setForm(f => ({ ...f, internal_mark: e.target.value }))}
                    className={inpCls} placeholder="40" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">External Marks</label>
                  <input type="number" value={form.external_mark} onChange={e => setForm(f => ({ ...f, external_mark: e.target.value }))}
                    className={inpCls} placeholder="60" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className={inpCls} placeholder="e.g. Program Core" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">QP Type</label>
                  <input value={form.qp_type} onChange={e => setForm(f => ({ ...f, qp_type: e.target.value }))}
                    className={inpCls} placeholder="QP1" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_elective} onChange={e => setForm(f => ({ ...f, is_elective: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Elective</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.for_all_departments} onChange={e => setForm(f => ({ ...f, for_all_departments: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">For All Departments</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.editable} onChange={e => setForm(f => ({ ...f, editable: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Editable by Dept</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
