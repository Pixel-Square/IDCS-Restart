/**
 * QP Pattern Editor Admin Page
 * Create and manage question paper patterns with BTL/CO mapping
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, FileText, Edit2, X, RefreshCw, Copy } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface QuestionDef {
  title: string;
  max_marks: number;
  btl_level: number;
  co_number: number;
  enabled: boolean;
}

interface QpPattern {
  id: string;
  name: string;
  qp_type: string;
  description: string;
  total_marks: number;
  questions: QuestionDef[];
  created_at: string;
  updated_at: string;
}

const QP_TYPES = [
  { value: 'CAT1', label: 'CAT 1' },
  { value: 'CAT2', label: 'CAT 2' },
  { value: 'MODEL', label: 'Model Exam' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'LAB', label: 'Lab' },
];

const BTL_LEVELS = [1, 2, 3, 4, 5, 6];
const CO_NUMBERS = [1, 2, 3, 4, 5];

export default function QpPatternEditorPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patterns, setPatterns] = useState<QpPattern[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQpType, setNewQpType] = useState('CAT1');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [localData, setLocalData] = useState<Partial<QpPattern>>({});
  const [isDirty, setIsDirty] = useState(false);

  const selectedPattern = patterns.find(p => p.id === selectedId);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth('/api/academic-v2/qp-patterns/');
      if (!response.ok) throw new Error('Failed to load');
      const data = await response.json();
      setPatterns(Array.isArray(data) ? data : (data.results || []));
    } catch (error) {
      console.error('Failed to load:', error);
      setMessage({ type: 'error', text: 'Failed to load QP patterns' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPattern) {
      setLocalData({
        name: selectedPattern.name,
        qp_type: selectedPattern.qp_type,
        description: selectedPattern.description,
        total_marks: selectedPattern.total_marks,
        questions: [...selectedPattern.questions],
      });
      setIsDirty(false);
    }
  }, [selectedPattern]);

  const handleChange = (field: string, value: unknown) => {
    setLocalData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleQuestionChange = (index: number, field: string, value: unknown) => {
    const questions = [...(localData.questions || [])];
    questions[index] = { ...questions[index], [field]: value };
    handleChange('questions', questions);
  };

  const addQuestion = () => {
    const questions = [...(localData.questions || [])];
    questions.push({
      title: `Q${questions.length + 1}`,
      max_marks: 10,
      btl_level: 2,
      co_number: 1,
      enabled: true,
    });
    handleChange('questions', questions);
  };

  const removeQuestion = (index: number) => {
    const questions = [...(localData.questions || [])];
    questions.splice(index, 1);
    handleChange('questions', questions);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    
    try {
      setSaving(true);
      const response = await fetchWithAuth('/api/academic-v2/qp-patterns/', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          qp_type: newQpType,
          description: '',
          total_marks: 100,
          questions: [],
        }),
      });
      
      if (!response.ok) throw new Error('Create failed');
      
      const newPattern = await response.json();
      setPatterns(prev => [...prev, newPattern]);
      setSelectedId(newPattern.id);
      setIsEditing(true);
      setShowCreateDialog(false);
      setNewName('');
      setNewQpType('CAT1');
      setMessage({ type: 'success', text: 'Pattern created' });
    } catch (error) {
      console.error('Create failed:', error);
      setMessage({ type: 'error', text: 'Failed to create pattern' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    
    try {
      setSaving(true);
      const response = await fetchWithAuth(`/api/academic-v2/qp-patterns/${selectedId}/`, {
        method: 'PUT',
        body: JSON.stringify(localData),
      });
      
      if (!response.ok) throw new Error('Save failed');
      
      setMessage({ type: 'success', text: 'Changes saved' });
      setIsDirty(false);
      setIsEditing(false);
      loadData();
    } catch (error) {
      console.error('Save failed:', error);
      setMessage({ type: 'error', text: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('Are you sure you want to delete this pattern?')) return;
    
    try {
      const response = await fetchWithAuth(`/api/academic-v2/qp-patterns/${selectedId}/`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Delete failed');
      
      setPatterns(prev => prev.filter(p => p.id !== selectedId));
      setSelectedId(null);
      setMessage({ type: 'success', text: 'Pattern deleted' });
    } catch (error) {
      console.error('Delete failed:', error);
      setMessage({ type: 'error', text: 'Failed to delete pattern' });
    }
  };

  const calculateTotalMarks = () => {
    return (localData.questions || [])
      .filter(q => q.enabled)
      .reduce((sum, q) => sum + (q.max_marks || 0), 0);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QP Pattern Editor</h1>
          <p className="text-gray-500 mt-1">Create and manage question paper patterns with BTL/CO mapping</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Pattern
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        {/* Pattern List */}
        <div className="col-span-1">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-3 bg-gray-50 border-b font-medium">QP Patterns</div>
            {patterns.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No patterns</div>
            ) : (
              patterns.map((p) => (
                <div
                  key={p.id}
                  onClick={() => { setSelectedId(p.id); setIsEditing(false); }}
                  className={`p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-50 ${
                    selectedId === p.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                  }`}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-gray-500">
                    {p.qp_type} · {p.questions.length} questions
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor Panel */}
        <div className="col-span-3">
          {selectedPattern ? (
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-500" />
                  {isEditing ? (
                    <input
                      type="text"
                      value={localData.name || ''}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="text-lg font-semibold px-2 py-1 border rounded"
                    />
                  ) : (
                    <h2 className="text-lg font-semibold">{selectedPattern.name}</h2>
                  )}
                  <span className="px-2 py-1 bg-gray-100 rounded text-sm">{selectedPattern.qp_type}</span>
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setLocalData({
                            name: selectedPattern.name,
                            qp_type: selectedPattern.qp_type,
                            description: selectedPattern.description,
                            total_marks: selectedPattern.total_marks,
                            questions: [...selectedPattern.questions],
                          });
                          setIsDirty(false);
                        }}
                        className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                          isDirty && !saving
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <Save className="w-4 h-4" />
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={handleDelete}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-6">
                {/* Stats */}
                <div className="flex items-center gap-8 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm text-gray-500">Total Questions:</span>
                    <span className="ml-2 font-medium">{(localData.questions || []).length}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Total Marks:</span>
                    <span className={`ml-2 font-medium px-2 py-1 rounded ${
                      calculateTotalMarks() === (localData.total_marks || 100)
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {calculateTotalMarks()} / {localData.total_marks || 100}
                    </span>
                  </div>
                </div>

                {/* Questions Table */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">Questions</h3>
                    {isEditing && (
                      <button
                        onClick={addQuestion}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                      >
                        <Plus className="w-4 h-4" />
                        Add Question
                      </button>
                    )}
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max Marks</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">BTL</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">CO</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Enabled</th>
                          {isEditing && <th className="px-4 py-3 w-12"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(localData.questions || []).map((q, index) => (
                          <tr key={index} className={!q.enabled ? 'bg-gray-50 opacity-60' : ''}>
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={q.title}
                                  onChange={(e) => handleQuestionChange(index, 'title', e.target.value)}
                                  className="w-32 px-2 py-1 border rounded"
                                />
                              ) : (
                                q.title
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={q.max_marks}
                                  onChange={(e) => handleQuestionChange(index, 'max_marks', parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 border rounded text-center"
                                />
                              ) : (
                                q.max_marks
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEditing ? (
                                <select
                                  value={q.btl_level}
                                  onChange={(e) => handleQuestionChange(index, 'btl_level', parseInt(e.target.value))}
                                  className="px-2 py-1 border rounded"
                                >
                                  {BTL_LEVELS.map((b) => (
                                    <option key={b} value={b}>BTL {b}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm">BTL {q.btl_level}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEditing ? (
                                <select
                                  value={q.co_number}
                                  onChange={(e) => handleQuestionChange(index, 'co_number', parseInt(e.target.value))}
                                  className="px-2 py-1 border rounded"
                                >
                                  {CO_NUMBERS.map((c) => (
                                    <option key={c} value={c}>CO {c}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">CO {q.co_number}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEditing ? (
                                <input
                                  type="checkbox"
                                  checked={q.enabled}
                                  onChange={(e) => handleQuestionChange(index, 'enabled', e.target.checked)}
                                  className="w-5 h-5 text-blue-600 rounded"
                                />
                              ) : (
                                <span className={`px-2 py-1 rounded text-sm ${q.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {q.enabled ? 'Yes' : 'No'}
                                </span>
                              )}
                            </td>
                            {isEditing && (
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => removeQuestion(index)}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {(localData.questions || []).length === 0 && (
                          <tr>
                            <td colSpan={isEditing ? 6 : 5} className="px-4 py-8 text-center text-gray-500">
                              No questions. {isEditing && 'Click "Add Question" to create one.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border-dashed border-2 p-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Select a pattern to view or edit</p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Create Pattern
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Create New QP Pattern</h2>
              <button onClick={() => setShowCreateDialog(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., CAT Pattern A"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">QP Type</label>
                <select
                  value={newQpType}
                  onChange={(e) => setNewQpType(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {QP_TYPES.map((qt) => (
                    <option key={qt.value} value={qt.value}>{qt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || saving}
                className={`px-4 py-2 rounded-lg ${
                  newName.trim() && !saving
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
