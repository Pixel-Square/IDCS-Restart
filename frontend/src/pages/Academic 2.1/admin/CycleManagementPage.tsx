/**
 * Cycle Management Admin Page
 * Manage academic cycles with name and code creation
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Edit2, X, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface Cycle {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function CycleManagementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newCycleName, setNewCycleName] = useState('');
  const [newCycleCode, setNewCycleCode] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const selectedCycle = cycles.find(c => c.id === selectedId);
  const [localData, setLocalData] = useState<Partial<Cycle>>({});

  const normalizeCode = (name: string): string => {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20);
  };

  useEffect(() => {
    loadCycles();
  }, []);

  const loadCycles = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth('/api/academic-v2/cycles/');
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let errorMsg = 'Failed to load cycles';
        
        if (response.status === 404) {
          errorMsg = 'Cycle API endpoint not found. This feature may not be available yet.';
        } else if (contentType.includes('application/json')) {
          try {
            const error = await response.json();
            errorMsg = error.detail || error.message || errorMsg;
          } catch {
            errorMsg = `Server error (${response.status})`;
          }
        } else {
          errorMsg = `Server error (${response.status}): ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      setCycles(Array.isArray(data) ? data : (data.results || []));
      setMessage(null);
    } catch (error) {
      console.error('Failed to load cycles:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load cycles' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newCycleName.trim() || !newCycleCode.trim()) {
      setMessage({ type: 'error', text: 'Cycle name and code are required' });
      return;
    }

    try {
      setSaving(true);
      const response = await fetchWithAuth('/api/academic-v2/cycles/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCycleName.trim(),
          code: newCycleCode.trim(),
          is_active: true,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let errorMsg = 'Failed to create cycle';
        
        if (contentType.includes('application/json')) {
          try {
            const error = await response.json();
            errorMsg = error.detail || error.message || errorMsg;
          } catch {
            errorMsg = `Server error (${response.status})`;
          }
        } else {
          errorMsg = `Server error (${response.status}): ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMsg);
      }

      const newCycle = await response.json();
      setCycles([...cycles, newCycle]);
      setNewCycleName('');
      setNewCycleCode('');
      setShowCreateDialog(false);
      setMessage({ type: 'success', text: 'Cycle created successfully' });
    } catch (error: any) {
      console.error('Error creating cycle:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to create cycle' });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectCycle = (cycle: Cycle) => {
    setSelectedId(cycle.id);
    setLocalData(JSON.parse(JSON.stringify(cycle)));
    setIsEditing(false);
    setIsDirty(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleUpdateField = (field: string, value: any) => {
    setLocalData({ ...localData, [field]: value });
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!localData.name?.trim() || !localData.code?.trim()) {
      setMessage({ type: 'error', text: 'Cycle name and code are required' });
      return;
    }

    try {
      setSaving(true);
      const response = await fetchWithAuth(`/api/academic-v2/cycles/${selectedId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: localData.name.trim(),
          code: localData.code.trim(),
          is_active: localData.is_active ?? true,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let errorMsg = 'Failed to save cycle';
        
        if (contentType.includes('application/json')) {
          try {
            const error = await response.json();
            errorMsg = error.detail || error.message || errorMsg;
          } catch {
            errorMsg = `Server error (${response.status})`;
          }
        } else {
          errorMsg = `Server error (${response.status}): ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMsg);
      }

      const updated = await response.json();
      setCycles(cycles.map(c => (c.id === selectedId ? updated : c)));
      setLocalData(updated);
      setIsEditing(false);
      setIsDirty(false);
      setMessage({ type: 'success', text: 'Cycle updated successfully' });
    } catch (error: any) {
      console.error('Error saving cycle:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save cycle' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm('Are you sure you want to delete this cycle?')) return;

    try {
      setSaving(true);
      const response = await fetchWithAuth(`/api/academic-v2/cycles/${selectedId}/`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let errorMsg = 'Failed to delete cycle';
        
        if (contentType.includes('application/json')) {
          try {
            const error = await response.json();
            errorMsg = error.detail || error.message || errorMsg;
          } catch {
            errorMsg = `Server error (${response.status})`;
          }
        } else {
          errorMsg = `Server error (${response.status}): ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMsg);
      }

      setCycles(cycles.filter(c => c.id !== selectedId));
      setSelectedId(null);
      setLocalData({});
      setIsEditing(false);
      setMessage({ type: 'success', text: 'Cycle deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting cycle:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to delete cycle' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedCycle) {
      setLocalData(JSON.parse(JSON.stringify(selectedCycle)));
    }
    setIsEditing(false);
    setIsDirty(false);
  };

  return (
    <div className="flex h-full bg-gray-50">
      {/* Sidebar - Cycles List */}
      <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Cycles</h2>
          <p className="text-xs text-gray-500 mt-1">Manage academic cycles</p>
        </div>

        {/* Create Button */}
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={18} />
            New Cycle
          </button>
        </div>

        {/* Cycles List */}
        <div className="divide-y">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : cycles.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No cycles yet</div>
          ) : (
            cycles.map((cycle) => (
              <button
                key={cycle.id}
                onClick={() => handleSelectCycle(cycle)}
                className={`w-full text-left p-4 hover:bg-gray-50 transition ${
                  selectedId === cycle.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{cycle.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">{cycle.code}</p>
                    {cycle.is_active && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle size={12} />
                        Active
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {message && (
          <div
            className={`mx-6 mt-4 p-3 rounded-lg flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            {message.text}
          </div>
        )}

        {!selectedId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">📚</div>
              <h3 className="text-xl font-semibold text-gray-900">No Cycle Selected</h3>
              <p className="text-gray-600 mt-2">Select a cycle from the left panel or create a new one</p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {isEditing ? 'Edit Cycle' : 'Cycle Details'}
                  </h3>
                  {!isEditing && (
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    >
                      <Edit2 size={18} />
                      Edit
                    </button>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cycle Name *
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={localData.name || ''}
                      onChange={(e) => handleUpdateField('name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCycle?.name}</p>
                  )}
                </div>

                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cycle Code *
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={localData.code || ''}
                      onChange={(e) => handleUpdateField('code', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                  ) : (
                    <p className="text-gray-900 font-mono text-sm">{selectedCycle?.code}</p>
                  )}
                </div>

                {/* Active Status */}
                <div>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={localData.is_active ?? true}
                      onChange={(e) => handleUpdateField('is_active', e.target.checked)}
                      disabled={!isEditing}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Active</span>
                  </label>
                </div>

                {/* Metadata */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Created</p>
                      <p className="text-gray-900 font-medium">
                        {new Date(selectedCycle?.created_at || '').toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Last Updated</p>
                      <p className="text-gray-900 font-medium">
                        {new Date(selectedCycle?.updated_at || '').toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !isDirty}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      <Save size={18} />
                      Save Changes
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    <Trash2 size={18} />
                    Delete Cycle
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create New Cycle</h3>
              <button
                onClick={() => setShowCreateDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cycle Name *
                </label>
                <input
                  type="text"
                  value={newCycleName}
                  onChange={(e) => {
                    setNewCycleName(e.target.value);
                    setNewCycleCode(normalizeCode(e.target.value));
                  }}
                  placeholder="e.g., Cycle 2024-2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cycle Code *
                </label>
                <input
                  type="text"
                  value={newCycleCode}
                  onChange={(e) => setNewCycleCode(e.target.value)}
                  placeholder="e.g., CYCLE_2024_2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Auto-generated from name, can be edited</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newCycleName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? 'Creating...' : 'Create Cycle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
