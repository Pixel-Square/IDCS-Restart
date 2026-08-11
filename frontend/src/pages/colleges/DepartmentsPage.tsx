import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { Building2, Plus, Pencil, Trash2, Search, X, ArrowLeft, Check } from 'lucide-react';
import ConfirmPasswordDeleteModal from '../../components/ConfirmPasswordDeleteModal';

interface Dept {
  id: number;
  code: string;
  name: string;
  short_name: string;
  is_teaching: boolean;
  parent: number | null;
  parent_name: string | null;
  is_sh_main: boolean;
}

interface FormData {
  code: string;
  name: string;
  short_name: string;
  is_teaching: boolean;
  parent: number | null;
  is_sh_main: boolean;
}

const emptyForm: FormData = { code: '', name: '', short_name: '', is_teaching: true, parent: null, is_sh_main: false };

export default function DepartmentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const collegeId = searchParams.get('college_id');

  // Sync college context so X-College-Id header follows this page
  useEffect(() => {
    if (collegeId) {
      window.localStorage.setItem('selectedCollegeId', collegeId);
    }
  }, [collegeId]);

  const [departments, setDepartments] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (collegeId) params.append('college_id', collegeId);
      const res = await fetchWithAuth(`/api/college/departments/?${params.toString()}`);
      if (res.ok) setDepartments(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, collegeId]);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(''); setShowModal(true); };
  const openEdit = (d: Dept) => {
    setEditing(d);
    setForm({ code: d.code, name: d.name, short_name: d.short_name, is_teaching: d.is_teaching, parent: d.parent, is_sh_main: d.is_sh_main });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const url = editing ? `/api/college/departments/${editing.id}/` : '/api/college/departments/';
      const method = editing ? 'PUT' : 'POST';
      const payload = { ...form } as any;
      if (collegeId) payload.college = Number(collegeId);
      const res = await fetchWithAuth(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Save failed'); setSaving(false); return; }
      setShowModal(false);
      fetchDepartments();
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await fetchWithAuth(`/api/college/departments/${id}/`, { method: 'DELETE' });
      setDeleteConfirm(null);
      fetchDepartments();
    } catch { /* ignore */ }
  };

  const teachingCount = departments.filter(d => d.is_teaching).length;
  const nonTeachingCount = departments.filter(d => !d.is_teaching).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(collegeId ? `/colleges/${collegeId}` : '/colleges')} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-3 bg-blue-100 rounded-xl">
          <Building2 className="w-7 h-7 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500">Manage all departments in the system</p>
          {collegeId && (
            <p className="text-xs text-gray-500 mt-1">College scope: <strong>{collegeId}</strong></p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{departments.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Teaching</p>
          <p className="text-2xl font-bold text-green-600">{teachingCount}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Non-Teaching</p>
          <p className="text-2xl font-bold text-orange-600">{nonTeachingCount}</p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search departments..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : departments.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No departments found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Short Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Parent</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(d => (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-mono font-medium text-gray-900">{d.code}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-700">{d.name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{d.short_name || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${d.is_teaching ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {d.is_teaching ? 'Teaching' : 'Non-Teaching'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{d.parent_name || '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(d)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm(d.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
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
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Department' : 'Add Department'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="CSE" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Short Name</label>
                  <input value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="CSE" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Computer Science and Engineering" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Department</label>
                <select value={form.parent ?? ''} onChange={e => setForm(f => ({ ...f, parent: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                  <option value="">None</option>
                  {departments.filter(dd => dd.id !== editing?.id).map(dd => (
                    <option key={dd.id} value={dd.id}>{dd.code} — {dd.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_teaching} onChange={e => setForm(f => ({ ...f, is_teaching: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Teaching Department</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_sh_main} onChange={e => setForm(f => ({ ...f, is_sh_main: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">S&H Main</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Double Password Confirmation Modal for Deletion */}
      <ConfirmPasswordDeleteModal
        isOpen={deleteConfirm !== null}
        itemName={departments.find(d => d.id === deleteConfirm)?.name || ''}
        itemType="Department"
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) handleDelete(deleteConfirm);
        }}
      />
    </div>
  );
}
