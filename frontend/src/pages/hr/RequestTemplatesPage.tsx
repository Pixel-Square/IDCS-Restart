import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, Save } from 'lucide-react';
import { getTemplates, deleteTemplate, patchTemplate, searchStaffForBalanceEdit, getBalancesByUser, setBalanceForUser } from '../../services/staffRequests';
import type { RequestTemplate } from '../../types/staffRequests';
import TemplateEditorModal from './TemplateEditorModal';

export default function TemplateManagementPage() {
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RequestTemplate | null>(null);
  const [staffQuery, setStaffQuery] = useState('');
  const [staffResults, setStaffResults] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
  const [selectedStaffBalances, setSelectedStaffBalances] = useState<any[]>([]);
  const [balanceEdits, setBalanceEdits] = useState<Record<string, string>>({});
  const [searchingStaff, setSearchingStaff] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [savingBalanceKey, setSavingBalanceKey] = useState<string | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleCreate = () => {
    setEditingTemplate(null);
    setShowEditor(true);
  };

  const handleEdit = (template: RequestTemplate) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await deleteTemplate(id);
      setTemplates(templates.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete template');
    }
  };

  const handleToggleActive = async (template: RequestTemplate) => {
    try {
      const updated = await patchTemplate(template.id!, { is_active: !template.is_active });
      setTemplates(templates.map(t => t.id === updated.id ? updated : t));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update template');
    }
  };

  const handleSaved = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    loadTemplates();
  };

  const handleSearchStaff = async () => {
    try {
      setSearchingStaff(true);
      const data = await searchStaffForBalanceEdit(staffQuery);
      setStaffResults(data?.results || []);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to search staff');
    } finally {
      setSearchingStaff(false);
    }
  };

  const handleSelectStaff = async (staff: any) => {
    try {
      setSelectedStaff(staff);
      setLoadingBalances(true);
      const data = await getBalancesByUser(staff.id);
      const balances = data?.balances || [];
      setSelectedStaffBalances(balances);

      const nextEdits: Record<string, string> = {};
      balances.forEach((b: any) => {
        nextEdits[b.leave_type] = String(b.balance ?? 0);
      });
      setBalanceEdits(nextEdits);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to load balances');
    } finally {
      setLoadingBalances(false);
    }
  };

  const handleSaveBalance = async (leaveType: string) => {
    if (!selectedStaff) return;
    const key = `${selectedStaff.id}:${leaveType}`;
    const raw = balanceEdits[leaveType];
    const value = Number(raw);
    if (Number.isNaN(value)) {
      alert('Please enter a valid number');
      return;
    }

    try {
      setSavingBalanceKey(key);
      await setBalanceForUser(selectedStaff.id, leaveType, value);
      const refreshed = await getBalancesByUser(selectedStaff.id);
      const balances = refreshed?.balances || [];
      setSelectedStaffBalances(balances);
      const nextEdits: Record<string, string> = {};
      balances.forEach((b: any) => {
        nextEdits[b.leave_type] = String(b.balance ?? 0);
      });
      setBalanceEdits(nextEdits);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update balance');
    } finally {
      setSavingBalanceKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Request Templates</h2>
              <p className="text-sm text-gray-600 mt-1">
                Create and manage dynamic forms for staff requests (Leaves, ODs, Permissions)
              </p>
            </div>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Create Template
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Templates List */}
        <div className="p-6">
          {templates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-4">No templates created yet.</p>
              <button
                onClick={handleCreate}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Create your first template
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {template.name}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            template.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {template.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        {template.description || 'No description'}
                      </p>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                        <div>
                          <span className="font-medium">Form Fields:</span> {template.form_schema?.length || 0}
                        </div>
                        <div>
                          <span className="font-medium">Approval Steps:</span> {template.total_steps || 0}
                        </div>
                        <div>
                          <span className="font-medium">Allowed Roles:</span>{' '}
                          {template.allowed_roles?.length > 0
                            ? template.allowed_roles.join(', ')
                            : 'All'}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleToggleActive(template)}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                        title={template.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {template.is_active ? (
                          <ToggleRight size={20} className="text-green-600" />
                        ) : (
                          <ToggleLeft size={20} />
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(template)}
                        className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id!)}
                        className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-xl font-bold text-gray-900">Staff Leave Balance Editor</h3>
          <p className="text-sm text-gray-600 mt-1">
            HR can search staff and edit balances directly (CL, OD, COL, LOP, Others, etc.)
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <input
              value={staffQuery}
              onChange={(e) => setStaffQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearchStaff();
              }}
              placeholder="Search by name, username, or staff ID"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <button
              type="button"
              onClick={handleSearchStaff}
              disabled={searchingStaff}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Search size={16} />
              {searchingStaff ? 'Searching...' : 'Search'}
            </button>
          </div>

          {staffResults.length > 0 && (
            <div className="border rounded-md max-h-56 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Staff</th>
                    <th className="px-3 py-2 text-left">Username</th>
                    <th className="px-3 py-2 text-left">Staff ID</th>
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {staffResults.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">{s.full_name || s.username}</td>
                      <td className="px-3 py-2">{s.username}</td>
                      <td className="px-3 py-2">{s.staff_id || '-'}</td>
                      <td className="px-3 py-2">{s.department?.code || '-'}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleSelectStaff(s)}
                          className="px-2 py-1 text-xs rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          Edit Balances
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedStaff && (
            <div className="border rounded-md p-4 bg-gray-50">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                Editing balances for {selectedStaff.full_name || selectedStaff.username} ({selectedStaff.username})
              </p>

              {loadingBalances ? (
                <p className="text-sm text-gray-500">Loading balances...</p>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm bg-white border rounded-md">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Leave Type</th>
                        <th className="px-3 py-2 text-left">Current</th>
                        <th className="px-3 py-2 text-left">New Value</th>
                        <th className="px-3 py-2 text-left">Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStaffBalances.map((b) => {
                        const saveKey = `${selectedStaff.id}:${b.leave_type}`;
                        return (
                          <tr key={b.leave_type} className="border-t">
                            <td className="px-3 py-2 font-medium">{b.leave_type}</td>
                            <td className="px-3 py-2">{b.balance}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.5"
                                value={balanceEdits[b.leave_type] ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setBalanceEdits((prev) => ({ ...prev, [b.leave_type]: v }));
                                }}
                                className="w-32 px-2 py-1 border border-gray-300 rounded-md"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => handleSaveBalance(b.leave_type)}
                                disabled={savingBalanceKey === saveKey}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                              >
                                <Save size={14} />
                                {savingBalanceKey === saveKey ? 'Saving...' : 'Save'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Template Editor Modal */}
      {showEditor && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => {
            setShowEditor(false);
            setEditingTemplate(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
