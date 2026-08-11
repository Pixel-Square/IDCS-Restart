import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { Layers, Plus, Pencil, Trash2, Search, X, ArrowLeft } from 'lucide-react';
import ConfirmPasswordDeleteModal from '../../components/ConfirmPasswordDeleteModal';

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

interface CourseOption { id: number; name: string; department_name: string | null; }
interface RegOption { id: number; code: string; name: string; }

interface FormData {
  name: string;
  course: number[];
  start_year: string;
  end_year: string;
  regulation: number | null;
  is_active: boolean;
}

const emptyForm: FormData = { name: '', course: [], start_year: '', end_year: '', regulation: null, is_active: true };

export default function BatchesPage() {
  const navigate = useNavigate();
  const { id: collegeId } = useParams<{ id: string }>();

  useEffect(() => {
    if (collegeId) window.localStorage.setItem('selectedCollegeId', collegeId);
  }, [collegeId]);

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BatchItem | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<string | null>(null);
  
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [regs, setRegs] = useState<RegOption[]>([]);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (collegeId) params.append('college_id', collegeId);
      const res = await fetchWithAuth(`/api/college/batches/?${params.toString()}`);
      if (res.ok) setBatches(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, collegeId]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  useEffect(() => {
    if (!showModal) return;
    (async () => {
      try {
        const q = collegeId ? `?college_id=${collegeId}` : '';
        const [cRes, rRes] = await Promise.all([
          fetchWithAuth(`/api/college/courses/${q}`),
          fetchWithAuth(`/api/college/regulations/${q}`),
        ]);
        if (cRes.ok) setCourses(await cRes.json());
        if (rRes.ok) setRegs(await rRes.json());
      } catch { /* ignore */ }
    })();
  }, [showModal, collegeId]);

  const openCreate = () => { setEditing(null); setEditingGroup(null); setForm(emptyForm); setError(''); setShowModal(true); };
  
  const openEdit = (b: BatchItem) => {
    setEditing(b);
    setEditingGroup(null);
    setForm({
      name: b.name,
      course: b.course ? [b.course] : [],
      start_year: b.start_year?.toString() ?? '',
      end_year: b.end_year?.toString() ?? '',
      regulation: b.regulation,
      is_active: b.is_active,
    });
    setError(''); setShowModal(true);
  };

  const openEditGroup = (name: string, items: BatchItem[]) => {
    setEditing(null);
    setEditingGroup(name);
    // Pre-fill form from the first item in the group
    const first = items[0];
    setForm({
      name: first.name,
      course: [], // Not editable in group mode
      start_year: first.start_year?.toString() ?? '',
      end_year: first.end_year?.toString() ?? '',
      regulation: first.regulation,
      is_active: first.is_active,
    });
    setError(''); setShowModal(true);
  };

  const allSelected = courses.length > 0 && form.course.length === courses.length;

  const toggleSelectAll = () => {
    setForm(f => ({ ...f, course: allSelected ? [] : courses.map(c => c.id) }));
  };

  const handleSave = async () => {
    if (!form.name.trim() && !editingGroup) { setError('Batch Name is required.'); return; }
    if (!editing && !editingGroup && form.course.length === 0) { setError('Please select at least one Course.'); return; }

    const effectiveCollegeId = collegeId ? Number(collegeId) : null;
    if (!effectiveCollegeId) {
      setError('College context is missing. Please reload the page.');
      return;
    }

    setSaving(true); setError('');
    try {
      if (editingGroup) {
        // Group Edit
        const payload: Record<string, unknown> = {
          start_year: form.start_year ? Number(form.start_year) : null,
          end_year: form.end_year ? Number(form.end_year) : null,
          regulation: form.regulation,
          is_active: form.is_active,
          college: effectiveCollegeId,
        };
        const res = await fetchWithAuth(`/api/college/batches/group/${encodeURIComponent(editingGroup)}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.detail || 'Group save failed');
          setSaving(false);
          return;
        }
      } else if (editing) {
        // Single Edit
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          course: form.course[0],
          department: null,
          start_year: form.start_year ? Number(form.start_year) : null,
          end_year: form.end_year ? Number(form.end_year) : null,
          regulation: form.regulation,
          is_active: form.is_active,
          college: effectiveCollegeId,
        };
        const res = await fetchWithAuth(`/api/college/batches/${editing.id}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.detail || 'Save failed');
          setSaving(false);
          return;
        }
      } else {
        // Bulk Create
        const batchItems = form.course.map(courseId => ({
          name: form.name.trim(), // We use the auto-filled name here
          course: courseId,
          department: null,
          start_year: form.start_year ? Number(form.start_year) : null,
          end_year: form.end_year ? Number(form.end_year) : null,
          regulation: form.regulation,
          is_active: form.is_active,
          college: effectiveCollegeId,
        }));

        const res = await fetchWithAuth('/api/college/batches/bulk/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ college: effectiveCollegeId, batches: batchItems }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error('Batch create failed:', res.status, data);
          setError(data.detail || `Failed to create batches (${res.status})`);
          setSaving(false);
          return;
        }
      }
      setShowModal(false);
      fetchBatches();
    } catch (err) {
      console.error('Batch save error:', err);
      setError('Network error — please try again');
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await fetchWithAuth(`/api/college/batches/${id}/`, { method: 'DELETE' });
      setDeleteConfirm(null);
      fetchBatches();
    } catch { /* ignore */ }
  };
  
  const handleDeleteGroup = async (name: string) => {
    try {
      await fetchWithAuth(`/api/college/batches/group/${encodeURIComponent(name)}/?college_id=${collegeId || ''}`, { method: 'DELETE' });
      setDeleteGroupConfirm(null);
      fetchBatches();
    } catch { /* ignore */ }
  };

  const activeCount = batches.filter(b => b.is_active).length;
  const batchCount = !editing && !editingGroup ? Math.max(form.course.length, 1) : 1;

  // Group batches by name
  const groupedBatches = useMemo(() => {
    const groups: Record<string, BatchItem[]> = {};
    for (const b of batches) {
      if (!groups[b.name]) groups[b.name] = [];
      groups[b.name].push(b);
    }
    return Object.entries(groups)
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => b.name.localeCompare(a.name));
  }, [batches]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(collegeId ? `/colleges/${collegeId}` : '/colleges')} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-3 bg-purple-100 rounded-xl">
          <Layers className="w-7 h-7 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batches</h1>
          <p className="text-sm text-gray-500">Manage student batches across all courses</p>
          {collegeId && (
            <p className="text-xs text-gray-500 mt-1">College scope: <strong>{collegeId}</strong></p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Groups</p>
          <p className="text-2xl font-bold text-gray-900">{groupedBatches.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Sub-Batches</p>
          <p className="text-2xl font-bold text-purple-600">{batches.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
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
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Course</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Years</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Regulation</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedBatches.map(group => (
                  <React.Fragment key={group.name}>
                    {/* Group Header Row */}
                    <tr className="bg-purple-50/50 border-b border-purple-100">
                      <td colSpan={5} className="px-5 py-2 text-sm font-bold text-purple-900">
                        Batch: {group.name}
                        <span className="text-purple-600 font-normal ml-2 text-xs">({group.items.length} courses)</span>
                      </td>
                      <td className="px-5 py-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => openEditGroup(group.name, group.items)} className="text-purple-600 text-xs font-medium hover:underline">
                            Edit All
                          </button>
                          <button onClick={() => setDeleteGroupConfirm(group.name)} className="text-red-600 text-xs font-medium hover:underline">
                            Delete All
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Individual Batch Rows */}
                    {group.items.map(b => (
                      <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5 text-sm text-gray-900 pl-8 font-medium">{b.course_name || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{b.department_name || '—'}</td>
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
                            <button onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Edit individually">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteConfirm(b.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete individually">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {editingGroup ? `Edit Batch Group: ${editingGroup}` : editing ? 'Edit Batch' : 'Add Batch'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
            <div className="space-y-4">

              {/* Years */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Year <span className="text-red-500">*</span></label>
                  <input type="number" value={form.start_year} 
                    onChange={e => {
                      const val = e.target.value;
                      setForm(f => ({ 
                        ...f, 
                        start_year: val, 
                        // Auto-fill batch name with start year if creating new
                        name: (!editing && !editingGroup) ? val : f.name 
                      }));
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="2024" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Year</label>
                  <input type="number" value={form.end_year} 
                    onChange={e => setForm(f => ({ ...f, end_year: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="2028" />
                </div>
              </div>

              {/* Batch Name - only show if not group editing. It auto-syncs with start_year initially */}
              {!editingGroup && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Batch Name <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="e.g. 2024" />
                </div>
              )}

              {/* Courses - hide if editing a group */}
              {!editingGroup && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {editing ? 'Course' : 'Courses'} <span className="text-red-500">*</span>
                    </label>
                    {!editing && courses.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-xs font-medium text-purple-600 hover:text-purple-800 hover:underline transition-colors"
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl p-2 bg-white space-y-0.5">
                    {courses.length === 0 && <p className="text-sm text-gray-500 p-2">No courses available</p>}
                    {editing && (
                      <label className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                        <input type="radio" checked={form.course.length === 0} onChange={() => setForm(f => ({ ...f, course: [] }))} className="border-gray-300 text-purple-600 focus:ring-purple-500" />
                        <span className="text-sm text-gray-500 italic">— None —</span>
                      </label>
                    )}
                    {courses.map(c => (
                      <label key={c.id} className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${form.course.includes(c.id) ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                        <input
                          type={editing ? 'radio' : 'checkbox'}
                          checked={form.course.includes(c.id)}
                          onChange={e => {
                            const checked = e.target.checked;
                            if (editing) {
                              setForm(f => ({ ...f, course: [c.id] }));
                            } else {
                              setForm(f => ({ ...f, course: checked ? [...f.course, c.id] : f.course.filter(id => id !== c.id) }));
                            }
                          }}
                          className="border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700">
                          <span className="font-medium">{c.name}</span>
                          {c.department_name && <span className="text-gray-500"> — {c.department_name}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                  {!editing && form.course.length > 0 && (
                    <p className="mt-1 text-xs text-purple-600 font-medium">
                      {form.course.length} course{form.course.length > 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              {/* Regulation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Regulation</label>
                <select value={form.regulation ?? ''} onChange={e => setForm(f => ({ ...f, regulation: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white">
                  <option value="">— None —</option>
                  {regs.map(r => <option key={r.id} value={r.id}>{r.code}{r.name ? ` — ${r.name}` : ''}</option>)}
                </select>
              </div>

              {/* Active */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
              {!editing && !editingGroup && form.course.length > 1 ? (
                <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 font-medium">
                  Will create {form.course.length} batches at once
                </span>
              ) : <span />}
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : editingGroup ? 'Update All' : editing ? 'Update' : batchCount > 1 ? `Create ${batchCount} Batches` : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation - Individual */}
      <ConfirmPasswordDeleteModal
        isOpen={deleteConfirm !== null}
        itemName={batches.find(b => b.id === deleteConfirm)?.name || ''}
        itemType="Batch"
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) handleDelete(deleteConfirm); }}
      />
      
      {/* Delete Confirmation - Group */}
      <ConfirmPasswordDeleteModal
        isOpen={deleteGroupConfirm !== null}
        itemName={deleteGroupConfirm || ''}
        itemType="Batch Group (all associated courses)"
        onClose={() => setDeleteGroupConfirm(null)}
        onConfirm={() => { if (deleteGroupConfirm) handleDeleteGroup(deleteGroupConfirm); }}
      />
    </div>
  );
}
