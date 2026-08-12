import React, { useState, useEffect } from 'react';
import fetchWithAuth from '../../services/fetchAuth';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { showAlert } from '../../utils/dialog';

type ColumnConfig = {
  id?: number;
  key: string;
  label: string;
  data_type: string;
  sort_order: number;
  is_active: boolean;
};

export default function ColumnConfigModal({ isOpen, onClose, onUpdated }: { isOpen: boolean, onClose: () => void, onUpdated: () => void }) {
  const [configs, setConfigs] = useState<ColumnConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  
  const [editForm, setEditForm] = useState<ColumnConfig>({
    key: '',
    label: '',
    data_type: 'string',
    is_active: true,
    sort_order: 0,
  });

  useEffect(() => {
    if (isOpen) {
      fetchColumns();
    }
  }, [isOpen]);

  const fetchColumns = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/curriculum/column-configs/');
      if (res.ok) {
        const data = await res.json();
        setConfigs(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (config: ColumnConfig) => {
    setEditForm(config);
    setEditingId(config.id || null);
  };

  const handleNew = () => {
    setEditForm({
      key: '',
      label: '',
      data_type: 'string',
      is_active: true,
      sort_order: configs.length,
    });
    setEditingId('new');
  };

  const saveConfig = async () => {
    try {
      const url = editingId === 'new' 
        ? '/api/curriculum/column-configs/' 
        : `/api/curriculum/column-configs/${editingId}/`;
        
      const res = await fetchWithAuth(url, {
        method: editingId === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify(editForm)
      });
      
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      
      setEditingId(null);
      await fetchColumns();
      onUpdated();
    } catch (e: any) {
      showAlert(e.message, 'error');
    }
  };

  const deleteConfig = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this column configuration? Data might be lost.')) return;
    try {
      const res = await fetchWithAuth(`/api/curriculum/column-configs/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      await fetchColumns();
      onUpdated();
    } catch (e: any) {
      showAlert(e.message, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Configure Dynamic Columns</h2>
            <p className="text-sm text-gray-500 mt-1">Define custom columns that apply to both master and department curriculum</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button 
                  onClick={handleNew} 
                  disabled={editingId !== null}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Add Column
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Label</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {editingId === 'new' && (
                      <tr className="bg-indigo-50/50">
                        <td className="px-4 py-3"><input type="text" className="w-full text-sm border-gray-300 rounded p-1" placeholder="e.g. credits" value={editForm.key} onChange={e => setEditForm({...editForm, key: e.target.value})} /></td>
                        <td className="px-4 py-3"><input type="text" className="w-full text-sm border-gray-300 rounded p-1" placeholder="e.g. Credits" value={editForm.label} onChange={e => setEditForm({...editForm, label: e.target.value})} /></td>
                        <td className="px-4 py-3">
                          <select className="w-full text-sm border-gray-300 rounded p-1" value={editForm.data_type} onChange={e => setEditForm({...editForm, data_type: e.target.value})}>
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                          </select>
                        </td>
                        <td className="px-4 py-3"><input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({...editForm, is_active: e.target.checked})} /></td>
                        <td className="px-4 py-3"><input type="number" className="w-16 text-sm border-gray-300 rounded p-1" value={editForm.sort_order} onChange={e => setEditForm({...editForm, sort_order: parseInt(e.target.value) || 0})} /></td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={saveConfig} className="p-1 text-green-600 hover:bg-green-50 rounded mr-2"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    )}
                    {configs.map(c => (
                      <tr key={c.id}>
                        {editingId === c.id ? (
                          <>
                            <td className="px-4 py-3"><input type="text" className="w-full text-sm border-gray-300 rounded p-1" value={editForm.key} onChange={e => setEditForm({...editForm, key: e.target.value})} /></td>
                            <td className="px-4 py-3"><input type="text" className="w-full text-sm border-gray-300 rounded p-1" value={editForm.label} onChange={e => setEditForm({...editForm, label: e.target.value})} /></td>
                            <td className="px-4 py-3">
                              <select className="w-full text-sm border-gray-300 rounded p-1" value={editForm.data_type} onChange={e => setEditForm({...editForm, data_type: e.target.value})}>
                                <option value="string">String</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean</option>
                              </select>
                            </td>
                            <td className="px-4 py-3"><input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({...editForm, is_active: e.target.checked})} /></td>
                            <td className="px-4 py-3"><input type="number" className="w-16 text-sm border-gray-300 rounded p-1" value={editForm.sort_order} onChange={e => setEditForm({...editForm, sort_order: parseInt(e.target.value) || 0})} /></td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={saveConfig} className="p-1 text-green-600 hover:bg-green-50 rounded mr-2"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-900 font-mono">{c.key}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{c.label}</td>
                            <td className="px-4 py-3 text-sm text-gray-500 capitalize">{c.data_type}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${c.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                {c.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{c.sort_order}</td>
                            <td className="px-4 py-3 text-right flex items-center justify-end">
                              <button onClick={() => handleEdit(c)} className="p-1 text-blue-600 hover:bg-blue-50 rounded mr-2"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => c.id && deleteConfig(c.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {configs.length === 0 && editingId !== 'new' && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                          No dynamic columns defined yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
