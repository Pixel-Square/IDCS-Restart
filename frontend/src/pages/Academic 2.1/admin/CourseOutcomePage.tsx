import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, Save, X } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface CourseOutcome {
  id: string;
  number: number;
  name: string;
  display_order: number;
  is_active: boolean;
}

export default function CourseOutcomePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<CourseOutcome[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newNumber, setNewNumber] = useState<number>(1);
  const [newName, setNewName] = useState('');

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.display_order - b.display_order) || (a.number - b.number)),
    [items],
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/academic-v2/course-outcomes/');
      if (!res.ok) throw new Error('Failed to load course outcomes');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results || []);
      setItems(list);
      const maxNumber = list.reduce((max: number, item: CourseOutcome) => Math.max(max, Number(item.number) || 0), 0);
      setNewNumber(maxNumber + 1 || 1);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load course outcomes' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreate = async () => {
    if (!newNumber || newNumber <= 0) return;
    try {
      setSaving(true);
      const response = await fetchWithAuth('/api/academic-v2/course-outcomes/', {
        method: 'POST',
        body: JSON.stringify({
          number: Number(newNumber),
          name: newName.trim(),
          display_order: Number(newNumber),
          is_active: true,
        }),
      });
      if (!response.ok) throw new Error('Create failed');
      const created = await response.json();
      setItems((prev) => [...prev, created]);
      setShowCreate(false);
      setNewName('');
      setNewNumber(Number(newNumber) + 1);
      setMessage({ type: 'success', text: 'Course outcome created' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to create course outcome' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this course outcome?')) return;
    try {
      const res = await fetchWithAuth(`/api/academic-v2/course-outcomes/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setItems((prev) => prev.filter((row) => row.id !== id));
      setMessage({ type: 'success', text: 'Course outcome deleted' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete course outcome' });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Outcome</h1>
          <p className="text-gray-500 mt-1">Manage CO values used in QP pattern CO dropdowns.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add CO
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">Configured COs</div>
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No course outcomes configured</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white border-b">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Number</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Display</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-semibold text-gray-700">{row.number}</td>
                  <td className="px-4 py-2">{row.name || '-'}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">CO{row.number}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => handleDelete(row.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Add Course Outcome</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">CO Number</label>
                <input
                  type="number"
                  min={1}
                  value={newNumber}
                  onChange={(e) => setNewNumber(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name (optional)</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Problem Solving"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={saving || !newNumber || newNumber <= 0}
                className={`px-4 py-2 rounded-lg font-medium ${!saving && newNumber > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
              >
                <Save className="inline w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
