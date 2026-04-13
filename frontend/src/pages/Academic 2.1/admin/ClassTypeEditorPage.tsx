/**
 * Class Type Editor Admin Page
 * Create and manage class types with exam assignments and weights.
 * Exam assignments are picked from pre-created QP Patterns (Exam Assignment Admin page).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, BookOpen, Edit2, X, RefreshCw, ExternalLink, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import fetchWithAuth from '../../../services/fetchAuth';

interface ExamAssignment {
  exam: string;
  exam_display_name: string;
  qp_type: string;
  weight: number;  // Legacy - sum of co_weights
  co_weights: Record<string, number>;  // Per-CO weights: { "1": 2.5, "2": 2.5 }
  default_cos: number[];
  customize_questions: boolean;
}

interface ClassType {
  id: string;
  name: string;
  short_code: string;
  display_name: string;
  total_internal_marks: number;
  exam_assignments: ExamAssignment[];
  allow_customize_questions: boolean;
  created_at: string;
  updated_at: string;
}

interface ExamTemplate {
  id: string;
  name: string;
  qp_type: string;
  default_weight: number;
  pattern?: { cos?: number[]; marks?: number[]; enabled?: boolean[] };
}

export default function ClassTypeEditorPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [examTemplates, setExamTemplates] = useState<ExamTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showExamPicker, setShowExamPicker] = useState(false);
  const [examPickerSearch, setExamPickerSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newShortCode, setNewShortCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [localData, setLocalData] = useState<Partial<ClassType>>({});
  const [isDirty, setIsDirty] = useState(false);

  const selectedClassType = classTypes.find(ct => ct.id === selectedId);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ctRes, tplRes] = await Promise.all([
        fetchWithAuth('/api/academic-v2/class-types/'),
        fetchWithAuth('/api/academic-v2/qp-patterns/'),
      ]);
      if (!ctRes.ok) throw new Error('Failed to load class types');
      const ctData = await ctRes.json();
      setClassTypes(Array.isArray(ctData) ? ctData : (ctData.results || []));

      if (tplRes.ok) {
        const tplData = await tplRes.json();
        setExamTemplates(Array.isArray(tplData) ? tplData : (tplData.results || []));
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load class types' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedClassType) {
      setLocalData({
        name: selectedClassType.name,
        short_code: selectedClassType.short_code,
        display_name: selectedClassType.display_name,
        total_internal_marks: selectedClassType.total_internal_marks,
        exam_assignments: [...selectedClassType.exam_assignments],
        allow_customize_questions: selectedClassType.allow_customize_questions,
      });
      setIsDirty(false);
    }
  }, [selectedClassType]);

  const handleChange = (field: string, value: unknown) => {
    setLocalData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleExamChange = (index: number, field: string, value: unknown) => {
    const exams = [...(localData.exam_assignments || [])];
    exams[index] = { ...exams[index], [field]: value };
    handleChange('exam_assignments', exams);
  };

  const pickExamTemplate = (tpl: ExamTemplate) => {
    const exams = [...(localData.exam_assignments || [])];
    // Derive actual COs from QP pattern instead of hardcoding [1..5]
    let derivedCos: number[] = [1, 2, 3, 4, 5];
    if (tpl.pattern && Array.isArray(tpl.pattern.cos)) {
      const enabled = tpl.pattern.enabled || tpl.pattern.cos.map(() => true);
      const uniqueCos = new Set<number>();
      tpl.pattern.cos.forEach((co, i) => {
        if (co != null && typeof co === 'number' && (i < enabled.length ? enabled[i] : true)) {
          uniqueCos.add(co);
        }
      });
      if (uniqueCos.size > 0) derivedCos = [...uniqueCos].sort((a, b) => a - b);
    }
    // Initialize co_weights with equal distribution of default_weight across COs
    const defaultWeight = Number(tpl.default_weight) || 0;
    const coWeights: Record<string, number> = {};
    if (derivedCos.length > 0 && defaultWeight > 0) {
      const perCo = Math.round((defaultWeight / derivedCos.length) * 100) / 100;
      derivedCos.forEach(co => { coWeights[String(co)] = perCo; });
    } else {
      derivedCos.forEach(co => { coWeights[String(co)] = 0; });
    }
    exams.push({
      exam: tpl.qp_type,
      exam_display_name: tpl.name,
      qp_type: tpl.qp_type,
      weight: defaultWeight,  // Legacy
      co_weights: coWeights,
      default_cos: derivedCos,
      customize_questions: false,
    });
    handleChange('exam_assignments', exams);
    setShowExamPicker(false);
    setExamPickerSearch('');
  };

  const removeExamAssignment = (index: number) => {
    const exams = [...(localData.exam_assignments || [])];
    exams.splice(index, 1);
    handleChange('exam_assignments', exams);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newShortCode.trim()) return;
    try {
      setSaving(true);
      const response = await fetchWithAuth('/api/academic-v2/class-types/', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim().toUpperCase(),
          short_code: newShortCode.trim().toUpperCase(),
          display_name: newName.trim(),
          total_internal_marks: 40,
          exam_assignments: [],
          allow_customize_questions: true,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('Create failed:', errText);
        throw new Error('Create failed');
      }
      const newClassType = await response.json();
      setClassTypes(prev => [...prev, newClassType]);
      setSelectedId(newClassType.id);
      setIsEditing(true);
      setShowCreateDialog(false);
      setNewName('');
      setNewShortCode('');
      setMessage({ type: 'success', text: 'Class type created' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to create class type' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      const response = await fetchWithAuth(`/api/academic-v2/class-types/${selectedId}/`, {
        method: 'PUT',
        body: JSON.stringify(localData),
      });
      if (!response.ok) throw new Error('Save failed');
      setMessage({ type: 'success', text: 'Changes saved' });
      setIsDirty(false);
      setIsEditing(false);
      loadData();
    } catch {
      setMessage({ type: 'error', text: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('Are you sure you want to delete this class type?')) return;
    try {
      const response = await fetchWithAuth(`/api/academic-v2/class-types/${selectedId}/`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      setClassTypes(prev => prev.filter(ct => ct.id !== selectedId));
      setSelectedId(null);
      setMessage({ type: 'success', text: 'Class type deleted' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete class type' });
    }
  };

  // Compute total weight from all co_weights across all exams
  const totalWeight = (localData.exam_assignments || []).reduce((sum, exam) => {
    const coWeights = exam.co_weights || {};
    const examTotal = Object.values(coWeights).reduce((s, w) => s + (w || 0), 0);
    return sum + (examTotal || exam.weight || 0);
  }, 0);

  const filteredTemplates = examTemplates.filter(t =>
    t.name.toLowerCase().includes(examPickerSearch.toLowerCase()) ||
    t.qp_type.toLowerCase().includes(examPickerSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Class Type Editor</h1>
          <p className="text-gray-500 mt-1">
            Configure class types and assign exam templates.{' '}
            <Link to="/academic-v2/admin/exam-assignments" className="text-blue-600 hover:underline inline-flex items-center gap-1">
              Manage Exam Assignments <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> New Class Type
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-4 gap-5">
        {/* Class Type List */}
        <div className="col-span-1 bg-white rounded-lg shadow overflow-hidden self-start">
          <div className="p-3 bg-gray-50 border-b text-sm font-semibold text-gray-700">Class Types</div>
          {classTypes.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">No class types</div>
          ) : (
            classTypes.map((ct) => (
              <div
                key={ct.id}
                onClick={() => { setSelectedId(ct.id); setIsEditing(false); }}
                className={`px-3 py-2.5 cursor-pointer border-b last:border-none hover:bg-gray-50 transition-colors ${selectedId === ct.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
              >
                <div className="font-medium text-sm text-gray-900">{ct.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {ct.exam_assignments.length} exams · {ct.total_internal_marks} marks
                </div>
              </div>
            ))
          )}
        </div>

        {/* Editor Panel */}
        <div className="col-span-3">
          {selectedClassType ? (
            <div className="bg-white rounded-lg shadow">
              {/* Panel header */}
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-gray-500" />
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={localData.name || ''}
                        onChange={(e) => handleChange('name', e.target.value)}
                        className="text-base font-semibold px-2 py-1 border rounded w-32"
                        placeholder="Name"
                      />
                      <input
                        type="text"
                        value={(localData as { short_code?: string }).short_code || ''}
                        onChange={(e) => handleChange('short_code', e.target.value.substring(0, 10))}
                        className="text-sm px-2 py-1 border rounded w-20"
                        placeholder="Code"
                        maxLength={10}
                      />
                    </div>
                  ) : (
                    <div>
                      <h2 className="font-semibold text-gray-900">{selectedClassType.name}</h2>
                      <span className="text-xs text-gray-400">{selectedClassType.short_code}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          if (selectedClassType) {
                            setLocalData({
                              name: selectedClassType.name,
                              short_code: selectedClassType.short_code,
                              display_name: selectedClassType.display_name,
                              total_internal_marks: selectedClassType.total_internal_marks,
                              exam_assignments: [...selectedClassType.exam_assignments],
                              allow_customize_questions: selectedClassType.allow_customize_questions,
                            });
                          }
                          setIsDirty(false);
                        }}
                        className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${isDirty && !saving ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                      >
                        <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
                        <Edit2 className="w-4 h-4" /> Edit
                      </button>
                      <button onClick={handleDelete} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* Settings row */}
                <div className="flex items-center gap-8 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Total Internal Marks:</span>
                    {isEditing ? (
                      <input
                        type="number"
                        value={localData.total_internal_marks ?? 40}
                        onChange={(e) => handleChange('total_internal_marks', parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    ) : (
                      <span className="font-semibold text-gray-800">{selectedClassType.total_internal_marks}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Total Weight:</span>
                    <span className="font-semibold text-sm px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                      {totalWeight}
                    </span>
                  </div>
                </div>

                {/* Exam Assignments */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">Exam Assignments</h3>
                    {isEditing && (
                      <div className="flex items-center gap-2">
                        <Link to="/academic-v2/admin/exam-assignments" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> Manage Templates
                        </Link>
                        <button
                          onClick={() => { setShowExamPicker(true); setExamPickerSearch(''); }}
                          className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-lg hover:bg-blue-200"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Exam
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Code</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Display Name</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">QP Type</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">CO Weights</th>
                          {isEditing && <th className="px-2 py-2 w-10"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(localData.exam_assignments || []).length === 0 ? (
                          <tr>
                            <td colSpan={isEditing ? 5 : 4} className="px-4 py-8 text-center text-gray-400">
                              No exam assignments.{' '}
                              {isEditing ? (
                                <button onClick={() => setShowExamPicker(true)} className="text-blue-600 hover:underline">
                                  Add one from exam templates
                                </button>
                              ) : 'Click Edit to add exams.'}
                            </td>
                          </tr>
                        ) : (
                          (localData.exam_assignments || []).map((exam, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={exam.exam}
                                    onChange={(e) => handleExamChange(index, 'exam', e.target.value)}
                                    placeholder="CAT1"
                                    className="w-24 px-2 py-1 border rounded text-sm"
                                  />
                                ) : (
                                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{exam.exam}</code>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={exam.exam_display_name}
                                    onChange={(e) => handleExamChange(index, 'exam_display_name', e.target.value)}
                                    placeholder="CAT 1"
                                    className="w-36 px-2 py-1 border rounded text-sm"
                                  />
                                ) : (
                                  <span className="font-medium">{exam.exam_display_name}</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{exam.qp_type}</span>
                              </td>
                              <td className="px-3 py-2">
                                {/* Per-CO weight inputs */}
                                <div className="flex flex-wrap gap-1.5">
                                  {(exam.default_cos || []).map((co) => {
                                    const coKey = String(co);
                                    const coWeight = (exam.co_weights || {})[coKey] ?? 0;
                                    return (
                                      <div key={co} className="flex items-center gap-0.5 bg-blue-50 rounded px-1 py-0.5">
                                        <span className="text-[10px] text-blue-600 font-medium">CO{co}</span>
                                        {isEditing ? (
                                          <input
                                            type="number"
                                            step="any"
                                            value={coWeight}
                                            onChange={(e) => {
                                              const newCoWeights = { ...(exam.co_weights || {}) };
                                              newCoWeights[coKey] = parseFloat(e.target.value) || 0;
                                              // Also update legacy weight as sum
                                              const newTotal = Object.values(newCoWeights).reduce((s, w) => s + (w || 0), 0);
                                              const exams = [...(localData.exam_assignments || [])];
                                              exams[index] = { ...exams[index], co_weights: newCoWeights, weight: newTotal };
                                              handleChange('exam_assignments', exams);
                                            }}
                                            className="w-12 px-1 py-0.5 border rounded text-center text-xs"
                                          />
                                        ) : (
                                          <span className="text-xs font-semibold text-blue-700 ml-0.5">{coWeight}</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {/* Show total weight */}
                                  <div className="flex items-center gap-0.5 bg-gray-100 rounded px-1.5 py-0.5 ml-1">
                                    <span className="text-[10px] text-gray-500">Σ</span>
                                    <span className="text-xs font-semibold text-gray-700">
                                      {Object.values(exam.co_weights || {}).reduce((s, w) => s + (w || 0), 0) || exam.weight || 0}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              {isEditing && (
                                <td className="px-2 py-2 text-center">
                                  <button onClick={() => removeExamAssignment(index)} className="p-1 text-red-400 hover:text-red-600 rounded">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border-dashed border-2 p-16 text-center">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Select a class type to view or edit</p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto"
              >
                <Plus className="w-4 h-4" /> Create Class Type
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Exam Picker Modal */}
      {showExamPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Pick Exam Assignment</h2>
              <button onClick={() => setShowExamPicker(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                value={examPickerSearch}
                onChange={e => setExamPickerSearch(e.target.value)}
                placeholder="Search exam assignments…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            {filteredTemplates.length === 0 ? (
              <div className="py-10 text-center text-gray-400">
                {examTemplates.length === 0 ? (
                  <div>
                    <p className="mb-3">No exam assignments found.</p>
                    <Link to="/academic-v2/admin/exam-assignments" className="text-blue-600 hover:underline text-sm">
                      Go create exam assignments first →
                    </Link>
                  </div>
                ) : 'No match found.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {filteredTemplates.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => pickExamTemplate(tpl)}
                    className="w-full text-left flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{tpl.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded">{tpl.qp_type}</span>
                        <span>Default: {Number(tpl.default_weight)}</span>
                        {tpl.pattern?.cos && (
                          <span className="text-gray-400">
                            COs: {[...new Set(tpl.pattern.cos.filter((c): c is number => c != null && typeof c === 'number'))].sort((a, b) => a - b).map(c => `CO${c}`).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-blue-600 text-sm font-medium">Pick →</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <Link to="/academic-v2/admin/exam-assignments" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Create new exam template
              </Link>
              <button onClick={() => setShowExamPicker(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Class Type Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Create New Class Type</h2>
              <button onClick={() => setShowCreateDialog(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., THEORY, LAB, TCPR"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Short Code <span className="text-red-500">*</span> <span className="text-xs text-gray-400">(max 10 chars)</span></label>
                <input
                  type="text"
                  value={newShortCode}
                  onChange={(e) => setNewShortCode(e.target.value.substring(0, 10))}
                  placeholder="e.g., TH, LB, TC"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  maxLength={10}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowCreateDialog(false); setNewName(''); setNewShortCode(''); }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !newShortCode.trim() || saving}
                className={`px-4 py-2 rounded-lg font-medium ${newName.trim() && newShortCode.trim() && !saving ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
              >
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
