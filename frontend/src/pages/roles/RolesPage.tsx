import React, { useEffect, useState } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { Shield, Plus, Edit2, Trash2, X, Check, Key, ChevronDown } from 'lucide-react';
import ConfirmPasswordDeleteModal from '../../components/ConfirmPasswordDeleteModal';

interface RoleItem {
  id: number;
  name: string;
  description: string;
  permissions: string[];
}

interface FeatureItem {
  code: string;
  name: string;
  description: string;
  category: string;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFeatures, setFormFeatures] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [expandedRole, setExpandedRole] = useState<number | null>(null);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/accounts/roles/manage/');
      if (res.ok) setRoles(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchFeatures = async () => {
    try {
      const res = await fetchWithAuth('/api/accounts/features/');
      if (res.ok) setFeatures(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchRoles(); fetchFeatures(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setFormName('');
    setFormDesc('');
    setFormFeatures([]);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (role: RoleItem) => {
    setEditTarget(role);
    setFormName(role.name);
    setFormDesc(role.description);
    // @ts-ignore
    setFormFeatures([...(role.features || [])]);
    setFormError(null);
    setShowModal(true);
  };

  const toggleFeature = (code: string) => {
    if (editTarget) return; // Disallow toggling in edit mode
    setFormFeatures(prev => prev.includes(code) ? prev.filter(p => p !== code) : [...prev, code]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const url = editTarget ? `/api/accounts/roles/manage/${editTarget.id}/` : '/api/accounts/roles/manage/';
      const method = editTarget ? 'PUT' : 'POST';
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, description: formDesc, features: formFeatures }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err.detail || 'Save failed');
        return;
      }
      setShowModal(false);
      fetchRoles();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetchWithAuth(`/api/accounts/roles/manage/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setDeleteConfirm(null);
      fetchRoles();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 rounded-xl">
            <Shield className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Roles & Permissions</h1>
            <p className="text-sm text-gray-500">{roles.length} role{roles.length !== 1 ? 's' : ''} defined</p>
          </div>
        </div>
        <button
          id="add-role-btn"
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-md hover:shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5" /> Add Role
        </button>
      </div>

      {/* Roles Grid */}
      {loading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <Shield className="w-16 h-16 opacity-30" />
          <p className="text-lg font-medium">No roles defined</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map(role => (
            <div key={role.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                      <Shield className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{role.name}</h3>
                      {role.description && <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(role)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirm(role.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Features count */}
                <button
                  onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors mt-2"
                >
                  <Key className="w-3.5 h-3.5" />
                  {/* @ts-ignore */}
                  {role.features?.length || 0} feature{(role.features?.length || 0) !== 1 ? 's' : ''} assigned
                  <ChevronDown className={`w-3 h-3 transition-transform ${expandedRole === role.id ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded features */}
                {expandedRole === role.id && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {/* @ts-ignore */}
                    {!role.features || role.features.length === 0 ? (
                      <span className="text-xs text-gray-400 italic">No features assigned</span>
                    ) : (
                      // @ts-ignore
                      role.features.map((f: string) => (
                        <span key={f} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-mono">{f}</span>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Shield className="w-5 h-5 text-indigo-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">{editTarget ? 'Edit Role' : 'Create Role'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{formError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="role-form-name"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  disabled={!!editTarget}
                  placeholder="e.g. HOD"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:bg-gray-50 disabled:text-gray-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <input
                  id="role-form-desc"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="Brief description of this role"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {/* Features picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Features ({formFeatures.length} selected)
                </label>
                
                {editTarget ? (
                  <div className="mb-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
                    <span className="mt-0.5">⚠️</span>
                    <div>
                      <p className="font-semibold">Features cannot be altered</p>
                      <p className="opacity-90">To change the features associated with this role, you must create a new role or modify it via the Django admin portal.</p>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
                    <span className="mt-0.5">ℹ️</span>
                    <div>
                      <p className="font-semibold">Important: Permanent Selection</p>
                      <p className="opacity-90">Please carefully select the features necessary for this role. <strong>There is no second chance to alter this selection later.</strong></p>
                    </div>
                  </div>
                )}

                {features.length === 0 ? (
                  <p className="text-xs text-gray-400 italic bg-gray-50 rounded-xl p-4 text-center">
                    No features available in the system yet.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-xl max-h-72 overflow-y-auto divide-y divide-gray-50">
                    {features.map(f => (
                      <label
                        key={f.code}
                        className={`flex items-start gap-3 px-4 py-3 ${
                          editTarget ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-indigo-50/50 transition-colors'
                        } ${
                          formFeatures.includes(f.code) ? 'bg-indigo-50/30' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formFeatures.includes(f.code)}
                          onChange={() => toggleFeature(f.code)}
                          disabled={!!editTarget}
                          className="mt-1 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-800">{f.name}</span>
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{f.category}</span>
                          </div>
                          <div className="text-xs font-mono text-gray-500 mt-0.5">{f.code}</div>
                          {f.description && <div className="text-xs text-gray-600 mt-1">{f.description}</div>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  id="role-form-submit"
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60 shadow-md"
                >
                  {saving ? 'Saving...' : <><Check className="w-4 h-4" /> {editTarget ? 'Update Role' : 'Create Role'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Double Password Confirmation Modal */}
      <ConfirmPasswordDeleteModal
        isOpen={deleteConfirm !== null}
        itemName={roles.find(r => r.id === deleteConfirm)?.name || ''}
        itemType="Role"
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) handleDelete(deleteConfirm);
        }}
      />
    </div>
  );
}
