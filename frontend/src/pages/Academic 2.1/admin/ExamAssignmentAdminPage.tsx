/**
 * Exam Assignment Admin Page
 * Create and manage reusable exam templates with question table customization.
 * Each exam assignment can be picked and assigned a weight in Class Types.
 * Includes a "Mark Manager" compact lab layout mode for CO-level configuration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, FileText, Edit2, X, RefreshCw, Settings2 } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface QuestionRow {
  title: string;
  max_marks: number;
  btl_level: number | null;
  co_number: number | null;
  enabled: boolean;
}

interface ExamPattern {
  titles: string[];
  marks: number[];
  btls: (number | null)[];
  cos: (number | null)[];
  enabled: boolean[];
  mark_manager?: MarkManagerConfig | null;
}

interface MarkManagerCOConfig {
  enabled: boolean;
  num_items: number;
  max_marks: number;
}

interface MarkManagerConfig {
  enabled: boolean;
  mode: 'admin_define' | 'user_define';
  cia_enabled: boolean;
  cia_max_marks: number;
  whole_number: boolean;
  arrow_keys: boolean;
  cos: Record<number, MarkManagerCOConfig>;
}

interface ExamAssignment {
  id: string;
  name: string;
  default_weight: number;
  qp_type: string;
  class_type: string | null;
  class_type_name: string | null;
  cycle?: string | null;
  cycle_name?: string | null;
  pattern: ExamPattern;
  questions: QuestionRow[];
  is_active: boolean;
  updated_at: string;
}

interface Cycle {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

const QP_TYPE_OPTIONS = [
  { value: 'CAT1', label: 'CAT 1' },
  { value: 'CAT2', label: 'CAT 2' },
  { value: 'MODEL', label: 'Model Exam' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'LAB_EXAM', label: 'Lab Exam' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'VIVA', label: 'Viva' },
  { value: 'SSA', label: 'SSA' },
  { value: 'CIA', label: 'CIA' },
  { value: 'FA', label: 'FA' },
];

const BTL_LEVELS = [1, 2, 3, 4, 5, 6];
const CO_NUMBERS = [1, 2, 3, 4, 5, 6];

function patternToRows(pattern: ExamPattern): QuestionRow[] {
  const { titles = [], marks = [], btls = [], cos = [], enabled = [] } = pattern;
  return titles.map((title, i) => ({
    title,
    max_marks: marks[i] ?? 0,
    btl_level: btls[i] ?? null,
    co_number: cos[i] ?? null,
    enabled: enabled[i] ?? true,
  }));
}

function rowsToPattern(rows: QuestionRow[]): ExamPattern {
  return {
    titles: rows.map(r => r.title),
    marks: rows.map(r => r.max_marks),
    btls: rows.map(r => r.btl_level),
    cos: rows.map(r => r.co_number),
    enabled: rows.map(r => r.enabled),
  };
}

/** Generate question rows from Mark Manager CO config */
function markManagerToRows(config: MarkManagerConfig): QuestionRow[] {
  const rows: QuestionRow[] = [];
  // Exam row first (if enabled)
  if (config.cia_enabled && config.cia_max_marks > 0) {
    rows.push({
      title: 'Exam',
      max_marks: config.cia_max_marks,
      btl_level: null,
      co_number: null,
      enabled: true,
    });
  }
  // CO rows
  const coNums = Object.keys(config.cos).map(Number).sort((a, b) => a - b);
  for (const coNum of coNums) {
    const coCfg = config.cos[coNum];
    if (!coCfg.enabled) continue;
    const numItems = coCfg.num_items || 1;
    const perItemMarks = numItems > 0 ? Math.round((coCfg.max_marks / numItems) * 100) / 100 : coCfg.max_marks;
    for (let i = 0; i < numItems; i++) {
      rows.push({
        title: `CO${coNum} - Item ${i + 1}`,
        max_marks: perItemMarks,
        btl_level: null,
        co_number: coNum,
        enabled: true,
      });
    }
  }
  return rows;
}

function getDefaultMarkManager(): MarkManagerConfig {
  const cos: Record<number, MarkManagerCOConfig> = {};
  for (let i = 1; i <= 5; i++) {
    cos[i] = { enabled: false, num_items: 5, max_marks: 25 };
  }
  return { enabled: false, mode: 'admin_define', cia_enabled: false, cia_max_marks: 30, whole_number: false, arrow_keys: true, cos };
}

export default function ExamAssignmentAdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exams, setExams] = useState<ExamAssignment[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form state for selected exam
  const [formName, setFormName] = useState('');
  const [formWeight, setFormWeight] = useState<number>(0);
  const [formCycle, setFormCycle] = useState<string | null>(null);
  const [formRows, setFormRows] = useState<QuestionRow[]>([]);
  const [markManager, setMarkManager] = useState<MarkManagerConfig>(getDefaultMarkManager());
  const [isDirty, setIsDirty] = useState(false);

  // Create dialog state
  const [newName, setNewName] = useState('');
  const [newWeight, setNewWeight] = useState<number>(0);
  const [newCycle, setNewCycle] = useState<string | null>(null);

  const selectedExam = exams.find(e => e.id === selectedId);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [pRes, cRes] = await Promise.all([
        fetchWithAuth('/api/academic-v2/qp-patterns/'),
        fetchWithAuth('/api/academic-v2/cycles/').catch(() => null),
      ]);
      
      if (!pRes.ok) throw new Error('Failed to load');
      const data = await pRes.json();
      const allPatterns = Array.isArray(data) ? data : (data.results || []);
      // Only show global exam templates (class_type=null) in this admin page
      // Class-type-specific patterns are managed in QP Pattern Editor
      setExams(allPatterns.filter((p: any) => p.class_type === null || p.class_type === undefined));

      // Load cycles if available
      if (cRes && cRes.ok) {
        const cycleData = await cRes.json();
        setCycles(Array.isArray(cycleData) ? cycleData : (cycleData.results || []));
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load exam assignments' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedExam) {
      setFormName(selectedExam.name || '');
      setFormWeight(Number(selectedExam.default_weight) || 0);
      setFormCycle(selectedExam.cycle || null);
      setFormRows(patternToRows(selectedExam.pattern));
      // Load mark manager config from pattern
      const mm = selectedExam.pattern?.mark_manager;
      if (mm && typeof mm === 'object') {
        const loaded: MarkManagerConfig = {
          enabled: !!mm.enabled,
          mode: mm.mode === 'user_define' ? 'user_define' : 'admin_define',
          cia_enabled: !!mm.cia_enabled,
          cia_max_marks: mm.cia_max_marks ?? 30,
          whole_number: !!mm.whole_number,
          arrow_keys: mm.arrow_keys !== false,
          cos: {},
        };
        for (let i = 1; i <= 5; i++) {
          const c = mm.cos?.[i] || mm.cos?.[String(i)];
          loaded.cos[i] = c
            ? { enabled: !!c.enabled, num_items: c.num_items ?? 5, max_marks: c.max_marks ?? 25 }
            : { enabled: false, num_items: 5, max_marks: 25 };
        }
        setMarkManager(loaded);
      } else {
        setMarkManager(getDefaultMarkManager());
      }
      setIsDirty(false);
    }
  }, [selectedExam]);

  const markDirty = () => setIsDirty(true);

  const addRow = () => {
    setFormRows(prev => [...prev, {
      title: `Q${prev.length + 1}`,
      max_marks: 10,
      btl_level: 2,
      co_number: 1,
      enabled: true,
    }]);
    markDirty();
  };

  const removeRow = (idx: number) => {
    setFormRows(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const updateRow = (idx: number, field: keyof QuestionRow, value: unknown) => {
    setFormRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    markDirty();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      setSaving(true);
      const res = await fetchWithAuth('/api/academic-v2/qp-patterns/', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          qp_type: newName.trim().toUpperCase().replace(/\s+/g, '_'),
          default_weight: newWeight,
          ...(newCycle ? { cycle: newCycle } : {}),
          pattern: {},
          is_active: true,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('Create error:', err);
        throw new Error('Create failed');
      }
      const created = await res.json();
      await loadData();
      setSelectedId(created.id);
      setIsEditing(true);
      setShowCreateDialog(false);
      setNewName('');
      setNewWeight(0);
      setNewCycle(null);
      setMessage({ type: 'success', text: 'Exam assignment created' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to create exam assignment' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      const qpType = formName.trim().toUpperCase().replace(/\s+/g, '_') || 'CUSTOM';
      // If mark manager is enabled, generate rows from it
      const finalRows = markManager.enabled ? markManagerToRows(markManager) : formRows;
      const pattern = {
        ...rowsToPattern(finalRows),
        mark_manager: markManager.enabled ? markManager : null,
      };
      const payload: Record<string, any> = {
        name: formName,
        qp_type: qpType,
        default_weight: formWeight,
        pattern,
      };
      
      // Add cycle if selected
      if (formCycle) {
        payload.cycle = formCycle;
      }

      const res = await fetchWithAuth(`/api/academic-v2/qp-patterns/${selectedId}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Save error:', errText);
        let msg = 'Failed to save';
        try { msg = JSON.parse(errText).detail || JSON.stringify(JSON.parse(errText)); } catch {}
        throw new Error(msg);
      }
      await loadData();
      setIsDirty(false);
      setIsEditing(false);
      setMessage({ type: 'success', text: 'Exam assignment saved' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeletePassword('');
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const executeSecureDelete = async () => {
    if (!selectedId) return;
    if (!deletePassword.trim()) {
      setDeleteError('Password is required');
      return;
    }
    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      const res = await fetchWithAuth('/api/academic-v2/admin/secure-delete/', {
        method: 'POST',
        body: JSON.stringify({ object_type: 'qp_pattern', id: selectedId, password: deletePassword }),
      });
      if (!res.ok) {
        let msg = 'Failed to delete';
        try {
          const data = await res.json();
          msg = data?.detail || data?.error || msg;
        } catch {
          try {
            msg = (await res.text()) || msg;
          } catch {
            // ignore
          }
        }
        setDeleteError(msg);
        return;
      }
      setDeleteModalOpen(false);
      setDeletePassword('');
      setExams(prev => prev.filter(e => e.id !== selectedId));
      setSelectedId(null);
      setMessage({ type: 'success', text: 'Deleted' });
    } catch (e: any) {
      setDeleteError(e?.message || 'Failed to delete');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const totalMarks = markManager.enabled
    ? (markManager.cia_enabled ? markManager.cia_max_marks : 0) +
      Object.values(markManager.cos).filter(c => c.enabled).reduce((s, c) => s + c.max_marks, 0)
    : formRows.filter(r => r.enabled).reduce((s, r) => s + r.max_marks, 0);

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exam Assignments</h1>
          <p className="text-gray-500 mt-1">Create reusable exam templates and customize their question tables. Assign them to Class Types with a weight.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> New Exam
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-4 gap-5">
        {/* Sidebar list */}
        <div className="col-span-1 bg-white rounded-lg shadow overflow-hidden self-start">
          <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700">Exam Assignments</div>
          {exams.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-sm">No exam assignments yet</div>
          ) : (
            exams.map(exam => (
              <div
                key={exam.id}
                onClick={() => { setSelectedId(exam.id); setIsEditing(false); }}
                className={`px-3 py-2.5 border-b last:border-none cursor-pointer hover:bg-gray-50 transition-colors ${selectedId === exam.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
              >
                <div className="font-medium text-sm text-gray-900 truncate">{exam.name || exam.qp_type}</div>
                <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <span>{Number(exam.default_weight)}</span>
                  <span>·</span>
                  <span>{(exam.pattern?.titles?.length || 0)} Qs</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Editor panel */}
        <div className="col-span-3">
          {selectedExam ? (
            <div className="bg-white rounded-lg shadow">
              {/* Panel header */}
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <h2 className="font-semibold text-gray-900">{selectedExam.name || selectedExam.qp_type}</h2>
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button onClick={() => { setIsEditing(false); setIsDirty(false); if (selectedExam) { setFormName(selectedExam.name); setFormWeight(Number(selectedExam.default_weight)); setFormCycle(selectedExam.cycle || null); setFormRows(patternToRows(selectedExam.pattern)); const mm = selectedExam.pattern?.mark_manager; if (mm && typeof mm === 'object') { const loaded: MarkManagerConfig = { enabled: !!mm.enabled, mode: mm.mode === 'user_define' ? 'user_define' : 'admin_define', cia_enabled: !!mm.cia_enabled, cia_max_marks: mm.cia_max_marks ?? 30, whole_number: !!mm.whole_number, arrow_keys: mm.arrow_keys !== false, cos: {} }; for (let i = 1; i <= 5; i++) { const c = mm.cos?.[i] || mm.cos?.[String(i)]; loaded.cos[i] = c ? { enabled: !!c.enabled, num_items: c.num_items ?? 5, max_marks: c.max_marks ?? 25 } : { enabled: false, num_items: 5, max_marks: 25 }; } setMarkManager(loaded); } else { setMarkManager(getDefaultMarkManager()); } } }} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                      <button onClick={handleSave} disabled={!isDirty || saving} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${isDirty && !saving ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
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
                {/* Metadata row */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Name</label>
                    {isEditing ? (
                      <input value={formName} onChange={e => { setFormName(e.target.value); markDirty(); }} className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. CAT 1, SSA 1, Model Exam" />
                    ) : (
                      <div className="text-sm font-medium text-gray-900">{selectedExam.name || '—'}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Default Weight</label>
                    {isEditing ? (
                      <input type="number" min={0} step="any" value={formWeight} onChange={e => { setFormWeight(Number(e.target.value)); markDirty(); }} className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    ) : (
                      <div className="text-sm font-semibold text-blue-700">{Number(selectedExam.default_weight)}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Cycle</label>
                    {isEditing ? (
                      <select value={formCycle || ''} onChange={e => { setFormCycle(e.target.value || null); markDirty(); }} className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                        <option value="">Select Cycle...</option>
                        {cycles.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm font-medium text-gray-900">
                        {formCycle && cycles.find(c => c.id === formCycle)?.name || '—'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mark Manager Toggle */}
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={markManager.enabled}
                        disabled={!isEditing}
                        onChange={e => { setMarkManager(prev => ({ ...prev, enabled: e.target.checked })); markDirty(); }}
                        className="w-4 h-4 accent-teal-600"
                      />
                      <Settings2 className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-700">Mark Manager</span>
                    </label>
                    {markManager.enabled && (
                      <span className="text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">Compact Lab Layout</span>
                    )}
                  </div>

                  {markManager.enabled && (
                    <div className="space-y-4">
                      {/* Mode selection */}
                      <div className="flex items-center gap-4">
                        <label className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer select-none transition-colors ${markManager.mode === 'admin_define' ? 'bg-teal-50 border-teal-400 ring-1 ring-teal-400' : 'hover:bg-gray-50'}`}>
                          <input
                            type="radio"
                            name="mm_mode"
                            checked={markManager.mode === 'admin_define'}
                            disabled={!isEditing}
                            onChange={() => { setMarkManager(prev => ({ ...prev, mode: 'admin_define' })); markDirty(); }}
                            className="accent-teal-600"
                          />
                          <div>
                            <span className="text-sm font-semibold text-gray-800">Admin Define</span>
                            <p className="text-[11px] text-gray-500">Admin configures COs, items & marks here</p>
                          </div>
                        </label>
                        <label className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer select-none transition-colors ${markManager.mode === 'user_define' ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'hover:bg-gray-50'}`}>
                          <input
                            type="radio"
                            name="mm_mode"
                            checked={markManager.mode === 'user_define'}
                            disabled={!isEditing}
                            onChange={() => { setMarkManager(prev => ({ ...prev, mode: 'user_define' })); markDirty(); }}
                            className="accent-blue-600"
                          />
                          <div>
                            <span className="text-sm font-semibold text-gray-800">User Define</span>
                            <p className="text-[11px] text-gray-500">Faculty configures before mark entry</p>
                          </div>
                        </label>
                      </div>

                      {/* Entry settings */}
                      <div className="flex flex-wrap items-center gap-4">
                        <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer select-none transition-colors ${markManager.whole_number ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300' : 'hover:bg-gray-50'}`}>
                          <input
                            type="checkbox"
                            checked={markManager.whole_number}
                            disabled={!isEditing}
                            onChange={e => { setMarkManager(prev => ({ ...prev, whole_number: e.target.checked })); markDirty(); }}
                            className="w-4 h-4 accent-amber-600"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-800">Whole Number</span>
                            <p className="text-[10px] text-gray-500">No decimals allowed in mark entry</p>
                          </div>
                        </label>
                        <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer select-none transition-colors ${markManager.arrow_keys ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300' : 'hover:bg-gray-50'}`}>
                          <input
                            type="checkbox"
                            checked={markManager.arrow_keys}
                            disabled={!isEditing}
                            onChange={e => { setMarkManager(prev => ({ ...prev, arrow_keys: e.target.checked })); markDirty(); }}
                            className="w-4 h-4 accent-indigo-600"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-800">Arrow Keys Inc/Dec</span>
                            <p className="text-[10px] text-gray-500">Up/Down arrows change value; unchecked = navigate cells</p>
                          </div>
                        </label>
                      </div>

                      {markManager.mode === 'user_define' && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                          Faculty will see the Mark Manager setup when they open this exam for mark entry. They can select COs, set number of items and max marks, then confirm to generate the question table.
                        </div>
                      )}

                      {markManager.mode === 'admin_define' && (
                      <>
                      {/* CO checkboxes row */}
                      <div className="flex flex-wrap items-center gap-3">
                        {[1, 2, 3, 4, 5].map(co => (
                          <label key={co} className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg cursor-pointer select-none transition-colors ${markManager.cos[co]?.enabled ? 'bg-teal-50 border-teal-300' : 'hover:bg-gray-50'}`}>
                            <input
                              type="checkbox"
                              checked={markManager.cos[co]?.enabled || false}
                              disabled={!isEditing}
                              onChange={e => {
                                setMarkManager(prev => ({
                                  ...prev,
                                  cos: { ...prev.cos, [co]: { ...prev.cos[co], enabled: e.target.checked } },
                                }));
                                markDirty();
                              }}
                              className="w-4 h-4 accent-teal-600"
                            />
                            <span className="text-sm font-medium">CO-{co}</span>
                          </label>
                        ))}
                        <label className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg cursor-pointer select-none transition-colors ${markManager.cia_enabled ? 'bg-teal-50 border-teal-300' : 'hover:bg-gray-50'}`}>
                          <input
                            type="checkbox"
                            checked={markManager.cia_enabled}
                            disabled={!isEditing}
                            onChange={e => { setMarkManager(prev => ({ ...prev, cia_enabled: e.target.checked })); markDirty(); }}
                            className="w-4 h-4 accent-teal-600"
                          />
                          <span className="text-sm font-medium">Exam</span>
                        </label>
                      </div>

                      {/* Config cards */}
                      <div className="grid grid-cols-3 gap-4">
                        {markManager.cia_enabled && (
                          <div className="border rounded-lg p-4 bg-gray-50">
                            <h4 className="text-sm font-bold text-gray-800 mb-1">Exam</h4>
                            <label className="block text-xs text-gray-500 mb-1">Max marks</label>
                            {isEditing ? (
                              <input
                                type="number" min={0}
                                value={markManager.cia_max_marks}
                                onChange={e => { setMarkManager(prev => ({ ...prev, cia_max_marks: Number(e.target.value) || 0 })); markDirty(); }}
                                className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                              />
                            ) : (
                              <div className="text-sm font-semibold text-gray-900">{markManager.cia_max_marks}</div>
                            )}
                          </div>
                        )}
                        {[1, 2, 3, 4, 5].filter(co => markManager.cos[co]?.enabled).map(co => (
                          <div key={co} className="border rounded-lg p-4 bg-gray-50">
                            <h4 className="text-sm font-bold text-gray-800 mb-2">CO-{co}</h4>
                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs text-teal-600 mb-0.5">No. of experiments</label>
                                {isEditing ? (
                                  <input
                                    type="number" min={1} max={20}
                                    value={markManager.cos[co].num_items}
                                    onChange={e => {
                                      setMarkManager(prev => ({
                                        ...prev,
                                        cos: { ...prev.cos, [co]: { ...prev.cos[co], num_items: Number(e.target.value) || 1 } },
                                      }));
                                      markDirty();
                                    }}
                                    className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                  />
                                ) : (
                                  <div className="text-sm font-semibold text-gray-900">{markManager.cos[co].num_items}</div>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs text-teal-600 mb-0.5">Max marks</label>
                                {isEditing ? (
                                  <input
                                    type="number" min={0}
                                    value={markManager.cos[co].max_marks}
                                    onChange={e => {
                                      setMarkManager(prev => ({
                                        ...prev,
                                        cos: { ...prev.cos, [co]: { ...prev.cos[co], max_marks: Number(e.target.value) || 0 } },
                                      }));
                                      markDirty();
                                    }}
                                    className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                  />
                                ) : (
                                  <div className="text-sm font-semibold text-gray-900">{markManager.cos[co].max_marks}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Preview total */}
                      <div className="flex items-center gap-4 text-sm">
                        <span className={`font-medium px-2 py-0.5 rounded ${totalMarks > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          Total: {totalMarks} marks
                        </span>
                        <span className="text-xs text-gray-400">
                          {Object.values(markManager.cos).filter(c => c.enabled).reduce((s, c) => s + c.num_items, 0)} items across {Object.values(markManager.cos).filter(c => c.enabled).length} COs
                          {markManager.cia_enabled ? ' + Exam' : ''}
                        </span>
                      </div>
                      </>
                      )}
                    </div>
                  )}
                </div>

                {/* Question Table moved to QP Pattern Editor page (Class Type -> QP Type -> Exam) */}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border-dashed border-2 p-16 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Select an exam assignment to edit, or create a new one</p>
              <button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto">
                <Plus className="w-4 h-4" /> New Exam Assignment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Password Confirm Delete Modal */}
      {deleteModalOpen && selectedExam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Delete</h3>
              <p className="text-sm text-gray-600 mt-1">
                Deleting <span className="font-medium">{selectedExam.name || selectedExam.qp_type}</span> requires your password.
              </p>
            </div>

            <div className="px-6 py-4 space-y-3">
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!deleteSubmitting) executeSecureDelete();
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter password"
                autoFocus
              />
              {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (deleteSubmitting) return;
                  setDeleteModalOpen(false);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={executeSecureDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Create Exam Assignment</h2>
              <button onClick={() => setShowCreateDialog(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. CAT 1, Model Exam, SSA 1"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Default Weight</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={newWeight}
                  onChange={e => setNewWeight(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">This weight will be pre-filled when assigned to a Class Type</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Cycle</label>
                <select
                  value={newCycle || ''}
                  onChange={e => setNewCycle(e.target.value || null)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Cycle (optional)</option>
                  {cycles.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateDialog(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || saving}
                className={`px-4 py-2 rounded-lg font-medium ${newName.trim() && !saving ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
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
