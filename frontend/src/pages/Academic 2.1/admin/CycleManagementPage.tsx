/**
 * Cycle Management Admin Page
 * Manage academic cycles with overall and semester-wise activation
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, Edit2, X, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface Cycle {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  inactive_semester_ids: string[];
  created_at: string;
  updated_at: string;
}

interface Semester {
  id: string | number;
  name: string;
  year: number;
  term: number;
  status: string;
}

export default function CycleManagementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newCycleName, setNewCycleName] = useState('');
  const [newCycleCode, setNewCycleCode] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const selectedCycle = cycles.find((cycle) => cycle.id === selectedId);
  const [localData, setLocalData] = useState<Partial<Cycle>>({});

  const inactiveSemesterSet = useMemo(
    () => new Set((localData.inactive_semester_ids || []).map((item) => String(item))),
    [localData.inactive_semester_ids],
  );
  const activeSemesters = useMemo(
    () => semesters.filter((semester) => !inactiveSemesterSet.has(String(semester.id))),
    [inactiveSemesterSet, semesters],
  );
  const inactiveSemesters = useMemo(
    () => semesters.filter((semester) => inactiveSemesterSet.has(String(semester.id))),
    [inactiveSemesterSet, semesters],
  );

  const normalizeCode = (name: string): string => {
    return name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadCycles(), loadSemesters()]);
  };

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
      const list = Array.isArray(data) ? data : (data.results || []);
      setCycles(list.map((cycle: Cycle) => ({
        ...cycle,
        inactive_semester_ids: Array.isArray(cycle.inactive_semester_ids)
          ? cycle.inactive_semester_ids.map((item) => String(item))
          : [],
      })));
      setMessage(null);
    } catch (error) {
      console.error('Failed to load cycles:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load cycles' });
    } finally {
      setLoading(false);
    }
  };

  const loadSemesters = async () => {
    try {
      const response = await fetchWithAuth('/api/academics/semesters/');
      if (!response.ok) throw new Error('Failed to load semesters');
      const data = await response.json();
      setSemesters(Array.isArray(data) ? data : (data.results || []));
    } catch (error) {
      console.error('Failed to load semesters:', error);
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
          inactive_semester_ids: [],
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
      setCycles([...cycles, { ...newCycle, inactive_semester_ids: [] }]);
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

  const handleUpdateField = (field: string, value: unknown) => {
    setLocalData({ ...localData, [field]: value });
    setIsDirty(true);
  };

  const toggleSemesterState = (semesterId: string | number, shouldBeActive: boolean) => {
    const next = new Set((localData.inactive_semester_ids || []).map((item) => String(item)));
    const key = String(semesterId);
    if (shouldBeActive) next.delete(key);
    else next.add(key);
    handleUpdateField('inactive_semester_ids', Array.from(next));
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
          inactive_semester_ids: (localData.inactive_semester_ids || []).map((item) => String(item)),
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
      const normalized = {
        ...updated,
        inactive_semester_ids: Array.isArray(updated.inactive_semester_ids)
          ? updated.inactive_semester_ids.map((item: string) => String(item))
          : [],
      };
      setCycles(cycles.map((cycle) => (cycle.id === selectedId ? normalized : cycle)));
      setLocalData(normalized);
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

      setCycles(cycles.filter((cycle) => cycle.id !== selectedId));
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

  const renderSemesterChip = (semester: Semester, isActiveBucket: boolean) => {
    const palette = isActiveBucket
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-red-300 bg-red-50 text-red-700';

    return (
      <button
        key={semester.id}
        type="button"
        disabled={!isEditing}
        onClick={() => toggleSemesterState(semester.id, !isActiveBucket)}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${palette} ${isEditing ? 'hover:shadow-sm' : 'cursor-default opacity-90'}`}
      >
        {semester.name || `SEM ${semester.term}`}
      </button>
    );
  };

  return (
    <div className="flex h-full bg-gray-50">
      <div className="w-80 overflow-y-auto border-r border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cycles</h2>
            <p className="mt-1 text-xs text-gray-500">Manage academic cycles</p>
          </div>
          <button
            onClick={loadData}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="border-b border-gray-200 p-4">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
          >
            <Plus size={18} />
            New Cycle
          </button>
        </div>

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
                className={`w-full p-4 text-left transition hover:bg-gray-50 ${selectedId === cycle.id ? 'border-l-4 border-blue-600 bg-blue-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-gray-900">{cycle.name}</h3>
                    <p className="mt-1 text-xs text-gray-500">{cycle.code}</p>
                    <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${cycle.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <CheckCircle size={12} />
                      {cycle.is_active ? 'Overall Active' : 'Overall Locked'}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {message && (
          <div className={`mx-6 mt-4 flex items-center gap-2 rounded-lg border p-3 ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            {message.text}
          </div>
        )}

        {!selectedId ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-4 text-6xl">📚</div>
              <h3 className="text-xl font-semibold text-gray-900">No Cycle Selected</h3>
              <p className="mt-2 text-gray-600">Select a cycle from the left panel or create a new one</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl p-6">
            <div className="rounded-lg bg-white shadow">
              <div className="border-b border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {isEditing ? 'Edit Cycle' : 'Cycle Details'}
                  </h3>
                  {!isEditing && (
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-2 rounded-lg px-4 py-2 text-blue-600 transition hover:bg-blue-50"
                    >
                      <Edit2 size={18} />
                      Edit
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-6 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Cycle Name *</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={localData.name || ''}
                      onChange={(e) => handleUpdateField('name', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCycle?.name}</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Cycle Code *</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={localData.code || ''}
                      onChange={(e) => handleUpdateField('code', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="font-mono text-sm text-gray-900">{selectedCycle?.code}</p>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={localData.is_active ?? true}
                      onChange={(e) => handleUpdateField('is_active', e.target.checked)}
                      disabled={!isEditing}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Overall Active</span>
                      <p className="text-xs text-gray-500">When off, every linked exam assignment stays locked for all semesters.</p>
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900">Configurations</h4>
                    <p className="mt-1 text-xs text-gray-500">Click a semester to move it between active and deactive. Deactive semesters lock only that semester.</p>
                  </div>

                  {semesters.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500">
                      No semesters available.
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-amber-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <h5 className="text-sm font-semibold text-amber-800">Semester Actives</h5>
                            <p className="text-xs text-amber-700/80">Gold semesters are open for this cycle.</p>
                          </div>
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{activeSemesters.length}</span>
                        </div>
                        <div className="flex min-h-[64px] flex-wrap gap-2">
                          {activeSemesters.length > 0 ? activeSemesters.map((semester) => renderSemesterChip(semester, true)) : <div className="text-xs text-gray-400">No active semesters.</div>}
                        </div>
                      </div>

                      <div className="rounded-xl border border-red-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <h5 className="text-sm font-semibold text-red-700">Semester Deactives</h5>
                            <p className="text-xs text-red-700/80">Red semesters stay locked for this cycle.</p>
                          </div>
                          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">{inactiveSemesters.length}</span>
                        </div>
                        <div className="flex min-h-[64px] flex-wrap gap-2">
                          {inactiveSemesters.length > 0 ? inactiveSemesters.map((semester) => renderSemesterChip(semester, false)) : <div className="text-xs text-gray-400">No deactive semesters.</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Created</p>
                      <p className="font-medium text-gray-900">{new Date(selectedCycle?.created_at || '').toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Last Updated</p>
                      <p className="font-medium text-gray-900">{new Date(selectedCycle?.updated_at || '').toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !isDirty}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save size={18} />
                      Save Changes
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition hover:bg-red-700 disabled:opacity-50"
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

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
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
                <label className="mb-2 block text-sm font-medium text-gray-700">Cycle Name *</label>
                <input
                  type="text"
                  value={newCycleName}
                  onChange={(e) => {
                    setNewCycleName(e.target.value);
                    setNewCycleCode(normalizeCode(e.target.value));
                  }}
                  placeholder="e.g., Cycle 2024-2025"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Cycle Code *</label>
                <input
                  type="text"
                  value={newCycleCode}
                  onChange={(e) => setNewCycleCode(e.target.value)}
                  placeholder="e.g., CYCLE_2024_2025"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Auto-generated from name, can be edited</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newCycleName.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
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
