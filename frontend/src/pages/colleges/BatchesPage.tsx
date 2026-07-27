import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { Layers, Plus, Pencil, Trash2, Search, X, ArrowLeft, Check } from 'lucide-react';

interface BatchItem {
  id: number;
  name: string;
  course: number | null;
  course_name: string | null;
  department: number | null;
  department_name: string | null;
  start_year: number | null;
  end_year: number | null;
  regulation: number | null;
  regulation_code: string | null;
  is_active: boolean;
}

interface CourseOption { id: number; name: string; department: number | null; department_name: string | null; }
interface DeptOption { id: number; code: string; name: string; }
interface RegOption { id: number; code: string; name: string; }

interface FormData {
  name: string;
  course: number | null;
  department: number | null;
  start_year: string;
  end_year: string;
  regulation: number | null;
  is_active: boolean;
}

const emptyForm: FormData = { name: '', course: null, department: null, start_year: '', end_year: '', regulation: null, is_active: true };

export default function BatchesPage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BatchItem | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [depts, setDepts] = useState<DeptOption[]>([]);
  const [regs, setRegs] = useState<RegOption[]>([]);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/college/batches/?search=${encodeURIComponent(search)}`);
      if (res.ok) setBatches(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  // Load dropdowns when modal opens
  useEffect(() => {
    if (!showModal) return;
    (async () => {
      try {
        const [cRes, dRes, rRes] = await Promise.all([
          fetchWithAuth('/api/college/courses/'),
          fetchWithAuth('/api/college/departments/'),
          fetchWithAuth('/api/college/regulations/'),
        ]);
        if (cRes.ok) setCourses(await cRes.json());
        if (dRes.ok) setDepts(await dRes.json());
        if (rRes.ok) setRegs(await rRes.json());
      } catch { /* ignore */ }
    })();
  }, [showModal]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setShowModal(true); };
  const openEdit = (b: BatchItem) => {
    setEditing(b);
    setForm({
      name: b.name, course: b.course, department: b.department,
      start_year: b.start_year?.toString() ?? '', end_year: b.end_year?.toString() ?? '',
      regulation: b.regulation, is_active: b.is_active,
    });
    setError(''); setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const url = editing ? `/api/college/batches/${editing.id}/` : '/api/college/batches/';
      const method = editing ? 'PUT' : 'POST';
      const payload = {
        ...form,
        start_year: form.start_year ? Number(form.start_year) : null,
        end_year: form.end_year ? Number(form.end_year) : null,
      };
      const res = await fetchWithAuth(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Save failed'); setSaving(false); return; }
      setShowModal(false);
      fetchBatches();
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await fetchWithAuth(`/api/college/batches/${id}/`, { method: 'DELETE' });
      setDeleteConfirm(null);
      fetchBatches();
    } catch { /* ignore */ }
  };

  const activeCount = batches.filter(b => b.is_active).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-3 bg-purple-100 rounded-xl">
          <Layers className="w-7 h-7 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batches</h1>
          <p className="text-sm text-gray-500">Manage student batches across all departments</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{batches.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Inactive</p>
          <p className="text-2xl font-bold text-gray-400">{batches.length - activeCount}</p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batches..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Batch
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" /></div>
        ) : batches.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No batches found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Course / Dept</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Years</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Regulation</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-purple-50/30 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{b.name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      {b.course_name || b.department_name || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">
                      {b.start_year && b.end_year ? `${b.start_year}–${b.end_year}` : b.start_year || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{b.regulation_code || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {deleteConfirm === b.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(b.id)} className="p-1.5 text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors" title="Confirm"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setDeleteConfirm(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(b.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Batch' : 'Add Batch'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="2023" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course</label>
                <select value={form.course ?? ''} onChange={e => setForm(f => ({ ...f, course: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                  <option value="">— None —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.department_name || '?'})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department (if no Course)</label>
                <select value={form.department ?? ''} onChange={e => setForm(f => ({ ...f, department: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                  <option value="">— None —</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Year</label>
                  <input type="number" value={form.start_year} onChange={e => setForm(f => ({ ...f, start_year: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="2023" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Year</label>
                  <input type="number" value={form.end_year} onChange={e => setForm(f => ({ ...f, end_year: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="2027" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Regulation</label>
                <select value={form.regulation ?? ''} onChange={e => setForm(f => ({ ...f, regulation: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                  <option value="">— None —</option>
                  {regs.map(r => <option key={r.id} value={r.id}>{r.code}{r.name ? ` — ${r.name}` : ''}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
