import React, { useState, useEffect } from 'react';
import {
  Plus,
  Settings2,
  Trash2,
  Edit3,
  CheckCircle2,
  Layers,
  X,
  Tag,
  AlertCircle,
  Check,
  Sparkles,
  Search,
  BookOpen,
  Filter,
  RefreshCw,
  Loader2,
  GitMerge,
  ArrowRight,
  User,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import {
  DisciplineCategory,
  DisciplineApprovalFlow,
  fetchDisciplineCategories,
  createDisciplineCategory,
  updateDisciplineCategory,
  deleteDisciplineCategory,
  fetchDisciplineFlow,
  updateDisciplineFlow,
} from '../../../services/discipline';

const ALL_SEMESTERS = ['SEM 1', 'SEM 2', 'SEM 3', 'SEM 4', 'SEM 5', 'SEM 6', 'SEM 7', 'SEM 8'];

export default function ConfigPage() {
  const [categories, setCategories] = useState<DisciplineCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | string | null>(null);

  // Modal Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSemesters, setSelectedSemesters] = useState<string[]>([]);
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [formError, setFormError] = useState<string | null>(null);

  // ── Approval Flow State ──
  const [isFlowModalOpen, setIsFlowModalOpen] = useState<boolean>(false);
  const [flowRoles, setFlowRoles] = useState<string[]>(['DISCIPLINE_COMMITTEE', 'HOD', 'PRINCIPAL']);
  const [availableRoles, setAvailableRoles] = useState<string[]>([
    'DISCIPLINE_COMMITTEE',
    'DISCIPLINE_COMMITTEE_ADMIN',
    'HOD',
    'AHOD',
    'ADVISOR',
    'MENTOR',
    'STAFF',
    'FACULTY',
    'PRINCIPAL',
    'IQAC',
    'ADMIN',
    'SECURITY',
    'HR',
  ]);
  const [loadingFlow, setLoadingFlow] = useState<boolean>(false);
  const [savingFlow, setSavingFlow] = useState<boolean>(false);
  const [flowSuccessMessage, setFlowSuccessMessage] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [selectedSemFilter, setSelectedSemFilter] = useState('ALL');

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await fetchDisciplineCategories({ semester: selectedSemFilter });
      setCategories(data);
    } catch (e) {
      console.error('Failed to load categories from backend:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadFlow = async () => {
    setLoadingFlow(true);
    try {
      const data = await fetchDisciplineFlow();
      if (data.flow && Array.isArray(data.flow.roles) && data.flow.roles.length > 0) {
        setFlowRoles(data.flow.roles);
      }
      if (data.available_roles && data.available_roles.length > 0) {
        setAvailableRoles(Array.from(new Set([...data.available_roles, ...availableRoles])));
      }
    } catch (e) {
      console.error('Failed to load discipline flow:', e);
    } finally {
      setLoadingFlow(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadFlow();
  }, [selectedSemFilter]);

  const handleOpenFlowModal = () => {
    setFlowSuccessMessage(null);
    setIsFlowModalOpen(true);
  };

  const handleAddIntermediateRole = (index: number) => {
    const updated = [...flowRoles];
    // Default pick a role not currently directly duplicated
    const nextRole = availableRoles.find((r) => !updated.includes(r)) || 'STAFF';
    updated.splice(index + 1, 0, nextRole);
    setFlowRoles(updated);
  };

  const handleRemoveRole = (index: number) => {
    if (flowRoles.length <= 1) {
      alert('The workflow must contain at least one approver role.');
      return;
    }
    const updated = flowRoles.filter((_, idx) => idx !== index);
    setFlowRoles(updated);
  };

  const handleChangeRoleAt = (index: number, newRole: string) => {
    const updated = [...flowRoles];
    updated[index] = newRole;
    setFlowRoles(updated);
  };

  const handleSaveFlow = async () => {
    if (flowRoles.length === 0) {
      alert('Please configure at least one role in the approval path.');
      return;
    }
    setSavingFlow(true);
    try {
      await updateDisciplineFlow({
        roles: flowRoles,
      });
      setFlowSuccessMessage('Approval workflow saved successfully!');
      setTimeout(() => {
        setFlowSuccessMessage(null);
        setIsFlowModalOpen(false);
      }, 1400);
    } catch (err: any) {
      alert(err.message || 'Failed to save approval flow.');
    } finally {
      setSavingFlow(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setSelectedSemesters([...ALL_SEMESTERS]);
    setSeverity('MEDIUM');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: DisciplineCategory) => {
    setEditingId(cat.id);
    setTitle(cat.title);
    setDescription(cat.description || '');
    setSelectedSemesters(cat.semesters || []);
    setSeverity(cat.severity || 'MEDIUM');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleToggleSemester = (sem: string) => {
    setSelectedSemesters((prev) =>
      prev.includes(sem) ? prev.filter((s) => s !== sem) : [...prev, sem]
    );
  };

  const handleSelectAllSemesters = () => {
    if (selectedSemesters.length === ALL_SEMESTERS.length) {
      setSelectedSemesters([]);
    } else {
      setSelectedSemesters([...ALL_SEMESTERS]);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Please enter a Category Title.');
      return;
    }
    if (selectedSemesters.length === 0) {
      setFormError('Please select at least one semester.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingId) {
        // Update in backend DB
        const updated = await updateDisciplineCategory(editingId, {
          title: title.trim(),
          description: description.trim(),
          semesters: selectedSemesters,
          severity,
        });
        setCategories((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        // Create in backend DB
        const created = await createDisciplineCategory({
          title: title.trim(),
          description: description.trim(),
          semesters: selectedSemesters,
          severity,
          is_active: true,
        });
        setCategories((prev) => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving category to database:', err);
      setFormError(err.message || 'Failed to save category to backend.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id: number | string) => {
    if (window.confirm('Are you sure you want to remove this discipline category from the database?')) {
      try {
        await deleteDisciplineCategory(id);
        setCategories((prev) => prev.filter((cat) => cat.id !== id));
      } catch (err) {
        console.error('Failed to delete category:', err);
        alert('Failed to delete category from database.');
      }
    }
  };

  const handleToggleStatus = async (cat: DisciplineCategory) => {
    try {
      const updated = await updateDisciplineCategory(cat.id, {
        is_active: !cat.is_active,
      });
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? updated : c)));
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  // Filtered categories
  const filteredCategories = categories.filter((cat) => {
    const matchesSearch =
      cat.title.toLowerCase().includes(search.toLowerCase()) ||
      (cat.description && cat.description.toLowerCase().includes(search.toLowerCase()));
    return matchesSearch;
  });

  const getSeverityBadge = (sev?: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'HIGH':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'MEDIUM':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'LOW':
      default:
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Settings2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Discipline Category & Workflow Configuration
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Manage incident categories, severity levels, and multi-role approval paths.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* FLOW BUTTON */}
          <button
            onClick={handleOpenFlowModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-200 transition active:scale-[0.98] cursor-pointer"
          >
            <GitMerge className="w-4 h-4 stroke-[2.5]" />
            <span>Flow</span>
          </button>

          <button
            onClick={loadCategories}
            disabled={loading}
            className="p-2.5 text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Reload from Database"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-200 transition active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Category</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Semester:</span>
          </div>
          <select
            value={selectedSemFilter}
            onChange={(e) => setSelectedSemFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Semesters</option>
            {ALL_SEMESTERS.map((sem) => (
              <option key={sem} value={sem}>
                {sem}
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-400 font-medium ml-2">
            Showing <span className="font-semibold text-slate-700">{filteredCategories.length}</span> categories
          </div>
        </div>
      </div>

      {/* Categories List */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">Loading Categories from Database...</h3>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Tag className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">No categories found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
            {search || selectedSemFilter !== 'ALL'
              ? 'Try modifying your search query or semester filter.'
              : 'Click "Add Category" above to configure your first discipline incident category in the database.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              className={`bg-white rounded-2xl border transition-all hover:shadow-md flex flex-col justify-between ${
                cat.is_active ? 'border-slate-200' : 'border-slate-200/60 opacity-60 bg-slate-50/50'
              }`}
            >
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span
                      className={`inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${getSeverityBadge(
                        cat.severity
                      )}`}
                    >
                      {cat.severity || 'MEDIUM'}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-2 leading-snug">
                      {cat.title}
                    </h3>
                  </div>
                  <button
                    onClick={() => handleToggleStatus(cat)}
                    title={cat.is_active ? 'Category is Active (Click to disable)' : 'Category is Inactive (Click to activate)'}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                      cat.is_active
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {cat.is_active ? 'Active' : 'Disabled'}
                  </button>
                </div>

                {cat.description && (
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {cat.description}
                  </p>
                )}

                {/* Applicable Semesters */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Applicable Semesters ({cat.semesters?.length || 0})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(cat.semesters || []).map((sem) => (
                      <span
                        key={sem}
                        className="inline-flex items-center px-2 py-0.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-[11px] font-medium rounded-md transition"
                      >
                        {sem}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex items-center justify-between text-xs text-slate-500">
                <span className="text-[11px]">
                  {cat.created_at ? `Added ${new Date(cat.created_at).toLocaleDateString()}` : 'Configured'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditModal(cat)}
                    className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition"
                    title="Edit category"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-white rounded-lg transition"
                    title="Delete category"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Popup for Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingId ? 'Edit Category' : 'Add Discipline Category'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4">
              {/* Category Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Category Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Dress Code & ID Card Violation"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Description / Guidance
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain standard action or protocol for this incident..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Severity Level
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSeverity(lvl)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                        severity === lvl
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Semester Selections Checkbox */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Applicable Semesters <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllSemesters}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                  >
                    {selectedSemesters.length === ALL_SEMESTERS.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  {ALL_SEMESTERS.map((sem) => {
                    const isChecked = selectedSemesters.includes(sem);
                    return (
                      <label
                        key={sem}
                        className={`flex items-center gap-2 p-2 rounded-lg text-xs font-semibold cursor-pointer select-none transition ${
                          isChecked
                            ? 'bg-white text-indigo-900 shadow-xs border border-indigo-200'
                            : 'text-slate-600 hover:bg-white/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSemester(sem)}
                          className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                        />
                        <span>{sem}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-200 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingId ? 'Update in DB' : 'Save to DB'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── FLOW CONFIGURATION MODAL ── */}
      {isFlowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-tr from-violet-600 to-indigo-600 text-white rounded-2xl shadow-md shadow-indigo-100">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Discipline Incident Approval Workflow
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure the sequential path through which incident records and fine approvals travel.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFlowModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {flowSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{flowSuccessMessage}</span>
              </div>
            )}

            {/* Visual Workflow Path Builder */}
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Approval Flow Sequence
              </label>

              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                {/* 1. START NODE: Student */}
                <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 font-bold" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">START: Student</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">
                        Origin / Incident Logged
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Student record created & notification triggered. Student views fine amount & uploads receipt proof.
                    </p>
                  </div>
                </div>

                {/* Arrow down to first role */}
                <div className="flex items-center justify-center py-0.5">
                  <ChevronRight className="w-4 h-4 text-indigo-400 rotate-90" />
                </div>

                {/* 2. ORDERED APPROVER ROLES (Intermediate and Final) */}
                {flowRoles.map((role, idx) => {
                  const isFinalRole = idx === flowRoles.length - 1;
                  return (
                    <React.Fragment key={idx}>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3.5 rounded-xl border border-indigo-100 shadow-xs hover:border-indigo-300 transition">
                        <div className="flex items-center gap-2.5 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                              isFinalRole
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {isFinalRole ? <ShieldCheck className="w-4 h-4" /> : `#${idx + 1}`}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-700">
                                {isFinalRole ? 'FINAL APPROVER:' : `Step ${idx + 1} Approver:`}
                              </span>
                              {isFinalRole && (
                                <span className="text-[10px] font-bold px-2 py-0.2 bg-emerald-50 text-emerald-700 rounded-md">
                                  Final Approve & Close
                                </span>
                              )}
                            </div>

                            {/* Role Select Dropdown */}
                            <select
                              value={role}
                              onChange={(e) => handleChangeRoleAt(idx, e.target.value)}
                              className="mt-1 w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              {availableRoles.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Step Action Buttons (+ to add intermediate role, Trash to delete) */}
                        <div className="flex items-center justify-end gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          {/* Add Role After Button */}
                          <button
                            type="button"
                            onClick={() => handleAddIntermediateRole(idx)}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                            title="Add intermediate role after this step"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-semibold">Add Step</span>
                          </button>

                          {/* Remove Step (Only if more than 1) */}
                          {flowRoles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRole(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Remove role from workflow"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Arrow down between roles if not last */}
                      {!isFinalRole && (
                        <div className="flex items-center justify-center py-0.5">
                          <ChevronRight className="w-4 h-4 text-indigo-400 rotate-90" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* 3. END NODE: Completed & Resolved */}
                <div className="flex items-center justify-center py-0.5">
                  <ChevronRight className="w-4 h-4 text-emerald-400 rotate-90" />
                </div>
                <div className="flex items-center gap-3 bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200 shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 font-bold" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-950">END: Incident Resolved</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                        Pending Actions Completed
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Student record moves from "Pending Actions" to "Completed Actions".
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFlowRoles(['DISCIPLINE_COMMITTEE', 'HOD', 'PRINCIPAL'])}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Reset to Default Flow
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFlowModalOpen(false)}
                  disabled={savingFlow}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveFlow}
                  disabled={savingFlow}
                  className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-200 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {savingFlow && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Save Workflow Path</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

