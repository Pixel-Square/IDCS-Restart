import React, { useEffect, useState } from 'react';
import { X, Plus, Save, Trash2 } from 'lucide-react';
import {
  QuestionBankType,
  QuestionBankTypeTemplate,
  getQuestionBankTypes,
  saveQuestionBankType,
  deleteQuestionBankType,
} from '../../services/questionBank';

const AVAILABLE_COLUMNS = [
  { id: 'question_type', label: 'Question Type (D/O)' },
  { id: 'subtopics', label: 'Subtopics' },
  { id: 'course_outcome', label: 'Course Outcome' },
  { id: 'part', label: 'Part' },
  { id: 'btl', label: 'BTL Level' },
  { id: 'marks', label: 'Marks' },
  { id: 'college', label: 'College' },
];

export default function QuestionBankTypesModal({ onClose }: { onClose: () => void }) {
  const [types, setTypes] = useState<QuestionBankType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [formData, setFormData] = useState<Partial<QuestionBankType>>({
    code: '',
    label: '',
    active_columns: [],
    is_active: true,
    templates: [],
  });

  useEffect(() => {
    loadTypes();
  }, []);

  async function loadTypes() {
    try {
      setLoading(true);
      const data = await getQuestionBankTypes();
      setTypes(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load types');
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(t: QuestionBankType) {
    setEditingId(t.id);
    setFormData({ ...t, templates: t.templates || [] });
  }

  function handleNew() {
    setEditingId('new');
    setFormData({ code: '', label: '', active_columns: [], is_active: true, templates: [] });
  }

  function toggleColumn(colId: string) {
    setFormData(prev => {
      const current = prev.active_columns || [];
      if (current.includes(colId)) {
        return { ...prev, active_columns: current.filter(c => c !== colId) };
      } else {
        return { ...prev, active_columns: [...current, colId] };
      }
    });
  }

  function addTemplate() {
    setFormData(prev => ({
      ...prev,
      templates: [...(prev.templates || []), { s_no: (prev.templates?.length || 0) + 1, question_type: 'D' } as QuestionBankTypeTemplate]
    }));
  }

  function updateTemplate(index: number, field: keyof QuestionBankTypeTemplate, value: any) {
    setFormData(prev => {
      const newTemplates = [...(prev.templates || [])];
      newTemplates[index] = { ...newTemplates[index], [field]: value };
      return { ...prev, templates: newTemplates };
    });
  }

  function removeTemplate(index: number) {
    setFormData(prev => {
      const newTemplates = [...(prev.templates || [])];
      newTemplates.splice(index, 1);
      return { ...prev, templates: newTemplates };
    });
  }

  async function handleSave() {
    if (!formData.code || !formData.label) {
      alert('Code and Label are required');
      return;
    }
    try {
      setError(null);
      await saveQuestionBankType(formData);
      setEditingId(null);
      await loadTypes();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Are you sure you want to delete this type?')) return;
    try {
      await deleteQuestionBankType(id);
      await loadTypes();
    } catch (e: any) {
      alert(e.message || 'Failed to delete');
    }
  }

  function renderEditor() {
    return (
      <tr style={{ backgroundColor: '#f0fdf4' }}>
        <td colSpan={5} style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Code</label>
              <input value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. THEORY" style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Label</label>
              <input value={formData.label || ''} onChange={e => setFormData({ ...formData, label: e.target.value })} placeholder="e.g. Theory Question Bank" style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Active Columns</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {AVAILABLE_COLUMNS.map(col => (
                <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                  <input type="checkbox" checked={formData.active_columns?.includes(col.id)} onChange={() => toggleColumn(col.id)} />
                  {col.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Template Questions (Rows)</label>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', backgroundColor: 'white', border: '1px solid #e5e7eb' }}>
              <thead style={{ backgroundColor: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>S.No</th>
                  {formData.active_columns?.includes('part') && <th style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Part</th>}
                  {formData.active_columns?.includes('question_type') && <th style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Type</th>}
                  {formData.active_columns?.includes('marks') && <th style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Marks</th>}
                  {formData.active_columns?.includes('btl') && <th style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>BTL</th>}
                  {formData.active_columns?.includes('college') && <th style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>College</th>}
                  {formData.active_columns?.includes('course_outcome') && <th style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>CO</th>}
                  <th style={{ padding: '6px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {(!formData.templates || formData.templates.length === 0) && (
                  <tr><td colSpan={10} style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>No template questions added.</td></tr>
                )}
                {(formData.templates || []).map((tpl, i) => (
                  <tr key={i}>
                    <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                      <input type="number" value={tpl.s_no} onChange={e => updateTemplate(i, 's_no', parseInt(e.target.value) || 0)} style={{ width: '60px', padding: '4px' }}/>
                    </td>
                    {formData.active_columns?.includes('part') && <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                      <input value={tpl.part || ''} onChange={e => updateTemplate(i, 'part', e.target.value)} style={{ width: '60px', padding: '4px' }}/>
                    </td>}
                    {formData.active_columns?.includes('question_type') && <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                      <select value={tpl.question_type || 'D'} onChange={e => updateTemplate(i, 'question_type', e.target.value)} style={{ padding: '4px' }}>
                        <option value="D">D</option><option value="O">O</option>
                      </select>
                    </td>}
                    {formData.active_columns?.includes('marks') && <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                      <input type="number" value={tpl.marks || ''} onChange={e => updateTemplate(i, 'marks', e.target.value === '' ? null : parseFloat(e.target.value))} style={{ width: '60px', padding: '4px' }}/>
                    </td>}
                    {formData.active_columns?.includes('btl') && <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                      <input type="number" value={tpl.btl || ''} onChange={e => updateTemplate(i, 'btl', e.target.value === '' ? null : parseInt(e.target.value))} style={{ width: '60px', padding: '4px' }}/>
                    </td>}
                    {formData.active_columns?.includes('college') && <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                      <input value={tpl.college || ''} onChange={e => updateTemplate(i, 'college', e.target.value)} style={{ width: '80px', padding: '4px' }}/>
                    </td>}
                    {formData.active_columns?.includes('course_outcome') && <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                      <input value={tpl.course_outcome || ''} onChange={e => updateTemplate(i, 'course_outcome', e.target.value)} style={{ width: '80px', padding: '4px' }}/>
                    </td>}
                    <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                      <button onClick={() => removeTemplate(i)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addTemplate} style={{ marginTop: '8px', padding: '6px 12px', fontSize: '13px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={14} /> Add Row
            </button>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => setEditingId(null)} style={{ padding: '8px 16px', backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} style={{ padding: '8px 16px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={16} /> Save Type
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Customise Question Bank Types</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {error && <div style={{ color: 'red', marginBottom: '16px' }}>{error}</div>}
          
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleNew}
              disabled={editingId !== null}
              style={{ padding: '8px 16px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: editingId !== null ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} /> Add Type
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb' }}>
            <thead style={{ backgroundColor: '#f9fafb' }}>
              <tr>
                <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Code</th>
                <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Label</th>
                <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Active Columns</th>
                <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>Templates</th>
                <th style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', width: '100px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && types.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center' }}>Loading...</td></tr>
              )}
              {types.length === 0 && !loading && editingId !== 'new' && (
                <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>No types defined.</td></tr>
              )}

              {editingId === 'new' && renderEditor()}

              {types.map(t => (
                <React.Fragment key={t.id}>
                  {editingId === t.id ? renderEditor() : (
                    <tr>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>{t.code}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>{t.label}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', fontSize: '13px' }}>
                        {t.active_columns.map(c => AVAILABLE_COLUMNS.find(ac => ac.id === c)?.label || c).join(', ') || 'None'}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', fontSize: '13px' }}>
                        {t.templates?.length || 0} rows
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                        <button onClick={() => handleEdit(t)} disabled={editingId !== null} style={{ border: 'none', background: 'none', color: editingId !== null ? '#9ca3af' : '#3b82f6', cursor: editingId !== null ? 'not-allowed' : 'pointer', marginRight: '8px' }}>Edit</button>
                        <button onClick={() => handleDelete(t.id)} disabled={editingId !== null} style={{ border: 'none', background: 'none', color: editingId !== null ? '#9ca3af' : '#ef4444', cursor: editingId !== null ? 'not-allowed' : 'pointer' }}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
