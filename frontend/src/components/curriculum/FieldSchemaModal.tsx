import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, EyeOff, ShieldAlert } from 'lucide-react';
import { showAlert, showConfirm } from '../../utils/dialog';
import {
  fetchFieldSchemas,
  createFieldSchema,
  updateFieldSchema,
  deleteFieldSchema,
  replicateField,
  CurriculumFieldSchema,
  CreateFieldSchemaPayload,
  FieldDataType,
  FieldScope,
  confirmRemoveFieldForDept,
  restoreFieldForDept,
  hideMasterField,
  restoreMasterField,
} from '../../services/curriculum';
import fetchWithAuth from '../../services/fetchAuth';
import RemoveMasterFieldModal from './RemoveMasterFieldModal';

export default function FieldSchemaModal({ isOpen, onClose, onUpdated, departmentId }: { isOpen: boolean, onClose: () => void, onUpdated: () => void, departmentId?: number }) {
  const [schemas, setSchemas] = useState<CurriculumFieldSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [replicatingId, setReplicatingId] = useState<number | null>(null);

  const [editForm, setEditForm] = useState<CreateFieldSchemaPayload & { is_active: boolean }>({
    key: '',
    label: '',
    data_type: 'text',
    scope: 'both',
    default_value: '',
    options: [],
    sort_order: 100,
    is_active: true,
  });

  const [optionsStr, setOptionsStr] = useState('');
  const [hidingSchema, setHidingSchema] = useState<CurriculumFieldSchema | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSchemas();
    }
  }, [isOpen]);

  const loadSchemas = async () => {
    setLoading(true);
    try {
      // Fetch all schemas including inactive so admins can see/restore hidden ones.
      const res = await fetchWithAuth('/api/curriculum/field-schemas/?include_inactive=1');
      const data = await res.json();
      const allSchemas = Array.isArray(data) ? data : (data.results || []);
      const filteredSchemas = allSchemas.filter((s: CurriculumFieldSchema) => {
        if (departmentId) {
          if (!s.is_active) return false;
          return s.scope === 'both' || s.scope === 'department';
        } else {
          return s.scope === 'both' || s.scope === 'master';
        }
      });
      setSchemas(filteredSchemas);
    } catch (e) {
      console.error(e);
      showAlert('Failed to load schemas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schema: CurriculumFieldSchema) => {
    setEditForm({
      key: schema.key,
      label: schema.label,
      data_type: schema.data_type,
      scope: schema.scope,
      default_value: schema.default_value || '',
      options: schema.options || [],
      sort_order: schema.sort_order,
      is_active: schema.is_active,
    });
    setOptionsStr((schema.options || []).join(', '));
    setEditingId(schema.id);
  };

  const handleNew = () => {
    setEditForm({
      key: '',
      label: '',
      data_type: 'text',
      scope: departmentId ? 'department' : 'both',
      default_value: '',
      options: [],
      sort_order: (schemas.length + 1) * 10,
      is_active: true,
    });
    setOptionsStr('');
    setEditingId('new');
  };

  const handleSave = async () => {
    try {
      const payload: CreateFieldSchemaPayload & { is_active?: boolean } = {
        ...editForm,
      };
      if (payload.data_type === 'select') {
        payload.options = optionsStr.split(',').map(s => s.trim()).filter(Boolean);
        if (payload.options.length === 0) {
          throw new Error('Options are required for Select type.');
        }
      } else {
        payload.options = [];
      }

      if (editingId === 'new') {
        if (!payload.key) throw new Error('Key is required.');
        await createFieldSchema(payload as CreateFieldSchemaPayload);
        showAlert('Field created successfully.', 'success');
      } else {
        await updateFieldSchema(editingId as number, payload);
        showAlert('Field updated successfully.', 'success');
      }

      setEditingId(null);
      await loadSchemas();
      onUpdated();
    } catch (e: any) {
      showAlert(e.message, 'error');
    }
  };

  const handleDelete = async (schema: CurriculumFieldSchema) => {
    if (!await showConfirm(`Are you sure you want to remove the field "${schema.label}"?`)) return;
    try {
      await deleteFieldSchema(schema.id);
      showAlert('Field removed.', 'success');
      await loadSchemas();
      onUpdated();
    } catch (e: any) {
      showAlert(e.message, 'error');
    }
  };

  const handleReplicate = async (id: number) => {
    if (!await showConfirm('This will apply this field to all existing curriculum rows based on its scope. Continue?')) return;
    setReplicatingId(id);
    try {
      const res = await replicateField(id);
      showAlert(`Replication complete. Master rows: ${res.master_rows_processed}, Dept rows: ${res.dept_rows_processed}`, 'success');
    } catch (e: any) {
      showAlert(e.message, 'error');
    } finally {
      setReplicatingId(null);
    }
  };

  const handleHideField = async (password: string) => {
    if (!hidingSchema) return;
    if (departmentId) {
      await confirmRemoveFieldForDept(hidingSchema.id, departmentId, password);
      showAlert('Master field removed from department.', 'success');
    } else {
      await hideMasterField(hidingSchema.id, password);
      showAlert('Field hidden globally.', 'success');
    }
    await loadSchemas();
    onUpdated();
    setHidingSchema(null);
  };

  const handleRestoreField = async (schema: CurriculumFieldSchema) => {
    try {
      if (departmentId) {
        await restoreFieldForDept(schema.id, departmentId);
        showAlert('Master field restored.', 'success');
      } else {
        await restoreMasterField(schema.id);
        showAlert('Field restored globally.', 'success');
      }
      await loadSchemas();
      onUpdated();
    } catch (e: any) {
      showAlert(e.message, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Settings2Icon className="w-5 h-5 text-indigo-600" />
              Manage Curriculum Fields
            </h2>
            <p className="text-sm text-gray-500 mt-1">Add, edit, or hide dynamic data fields across master and department curriculums.</p>
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
              <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">About Curriculum Fields</p>
                    <p><strong>Core fields</strong> are built into the system and can only be hidden with password authorization. <strong>Custom fields</strong> can be created and deleted.</p>
                  </div>
                </div>
                <button
                  onClick={handleNew}
                  disabled={editingId !== null}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Add Custom Field
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Key</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Label</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type & Options</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Scope</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Default</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Order</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {editingId === 'new' && (
                      <tr className="bg-indigo-50/50">
                        <td className="px-4 py-3">
                          <input type="text" className="w-full text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. credits" value={editForm.key} onChange={e => setEditForm({ ...editForm, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+/, '') })} />
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" className="w-full text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Credits (C)" value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} />
                        </td>
                        <td className="px-4 py-3 space-y-2">
                          <select className="w-full text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={editForm.data_type} onChange={e => setEditForm({ ...editForm, data_type: e.target.value as FieldDataType })}>
                            <option value="text">Text</option>
                            <option value="int">Integer</option>
                            <option value="float">Float</option>
                            <option value="bool">Boolean</option>
                            <option value="select">Select (Dropdown)</option>
                          </select>
                          {editForm.data_type === 'select' && (
                            <input type="text" className="w-full text-xs border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Options, comma-separated" value={optionsStr} onChange={e => setOptionsStr(e.target.value)} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select className="w-full text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={editForm.scope} onChange={e => setEditForm({ ...editForm, scope: e.target.value as FieldScope })}>
                            <option value="both">Both (Master & Dept)</option>
                            <option value="master">Master Only</option>
                            <option value="department">Department Only</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" className="w-24 text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Default" value={editForm.default_value} onChange={e => setEditForm({ ...editForm, default_value: e.target.value })} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Active</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="number" className="w-16 text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none text-right" value={editForm.sort_order} onChange={e => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) || 0 })} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={handleSave} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors" title="Save">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors" title="Cancel">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {schemas.map(c => {
                      const isHiddenForDept = departmentId && (c.hidden_for_department_ids || []).includes(departmentId);
                      const isHiddenGlobally = !c.is_active;
                      const isHidden = isHiddenGlobally || isHiddenForDept;

                      return (
                        <tr key={c.id} className={`${isHidden ? 'opacity-60 bg-gray-50' : 'hover:bg-gray-50'}`}>
                          {editingId === c.id ? (
                            <>
                              <td className="px-4 py-3"><input type="text" disabled className="w-full text-sm border-gray-300 rounded p-1.5 bg-gray-100" value={editForm.key} title="Key cannot be edited after creation" /></td>
                              <td className="px-4 py-3"><input type="text" className="w-full text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} /></td>
                              <td className="px-4 py-3 space-y-2">
                                <select className="w-full text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={editForm.data_type} onChange={e => setEditForm({ ...editForm, data_type: e.target.value as FieldDataType })}>
                                  <option value="text">Text</option>
                                  <option value="int">Integer</option>
                                  <option value="float">Float</option>
                                  <option value="bool">Boolean</option>
                                  <option value="select">Select (Dropdown)</option>
                                </select>
                                {editForm.data_type === 'select' && (
                                  <input type="text" className="w-full text-xs border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Options, comma-separated" value={optionsStr} onChange={e => setOptionsStr(e.target.value)} />
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <select className="w-full text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={editForm.scope} onChange={e => setEditForm({ ...editForm, scope: e.target.value as FieldScope })} disabled={!!departmentId}>
                                  <option value="both">Both (Master & Dept)</option>
                                  <option value="master">Master Only</option>
                                  <option value="department">Department Only</option>
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <input type="text" className="w-24 text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={editForm.default_value} onChange={e => setEditForm({ ...editForm, default_value: e.target.value })} />
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isHiddenGlobally ? (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">Hidden Globally</span>
                                ) : isHiddenForDept ? (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">Hidden in Dept</span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Active</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <input type="number" className="w-16 text-sm border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none text-right" value={editForm.sort_order} onChange={e => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) || 0 })} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={handleSave} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"><Check className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono font-medium text-gray-900">{c.key}</span>
                                  {c.is_core && <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Core</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 font-medium">{c.label}</td>
                              <td className="px-4 py-3">
                                <div className="text-sm text-gray-700 capitalize">{c.data_type}</div>
                                {c.data_type === 'select' && c.options && c.options.length > 0 && (
                                  <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[150px]" title={c.options.join(', ')}>
                                    {c.options.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 capitalize">{c.scope}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">{c.default_value || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                {isHiddenGlobally ? (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">Hidden Globally</span>
                                ) : isHiddenForDept ? (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">Hidden in Dept</span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Active</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-500">{c.sort_order}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {!departmentId && (
                                    <button onClick={() => handleReplicate(c.id)} disabled={replicatingId === c.id} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50" title="Apply to existing rows">
                                      <RefreshCw className={`w-4 h-4 ${replicatingId === c.id ? 'animate-spin' : ''}`} />
                                    </button>
                                  )}
                                  {(!departmentId || c.scope === 'department') && (
                                    <button onClick={() => handleEdit(c)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  {isHidden ? (
                                    <button onClick={() => handleRestoreField(c)} className="px-2 py-1 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors" title="Restore Field">
                                      Restore
                                    </button>
                                  ) : (
                                    <button onClick={() => setHidingSchema(c)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={departmentId ? "Remove Master Field from Department" : "Hide Field Globally"}>
                                      <EyeOff className="w-4 h-4" />
                                    </button>
                                  )}
                                  {c.can_delete && (!departmentId || c.scope === 'department') && (
                                    <button onClick={() => handleDelete(c)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete Field">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {schemas.length === 0 && editingId !== 'new' && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                          <div className="flex flex-col items-center justify-center">
                            <Settings2Icon className="w-10 h-10 text-gray-300 mb-3" />
                            <p>No fields defined yet.</p>
                            <button onClick={handleNew} className="mt-3 text-indigo-600 font-medium hover:underline">Add your first custom field</button>
                          </div>
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
      
      <RemoveMasterFieldModal
        isOpen={hidingSchema !== null}
        fieldName={hidingSchema?.label || ''}
        isMaster={!departmentId}
        onClose={() => setHidingSchema(null)}
        onConfirm={handleHideField}
      />
    </div>
  );
}

function Settings2Icon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  )
}
