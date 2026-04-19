/**
 * QP Pattern Editor Admin Page
 * Rebuilt flow:
 * 1) Select Class Type
 * 2) Select/Create QP Type (name + code)
 * 3) Select/Create Exam Assignment
 * 4) Edit questions (title, marks, CO, BTL)
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, FileText, Edit2, X, RefreshCw, GripVertical, Settings2 } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface QuestionDef {
  title: string;
  max_marks: number;
  btl_level: number | null;
  co_number: number | null;
  enabled: boolean;
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

interface QpPattern {
  id: string;
  name: string;
  qp_type: string;
  default_weight: number;
  class_type: string | null;
  class_type_name?: string | null;
  pattern: {
    titles?: string[];
    marks?: number[];
    btls?: Array<number | null>;
    cos?: Array<number | null>;
    enabled?: boolean[];
    mark_manager?: MarkManagerConfig | null;
  };
  questions?: Array<{
    title?: string;
    max?: number;
    max_marks?: number;
    btl?: number | null;
    btl_level?: number | null;
    co?: number | null;
    co_number?: number | null;
    enabled?: boolean;
  }>;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

interface ClassType {
  id: string;
  name: string;
  display_name?: string;
  short_code?: string;
  exam_assignments?: ClassTypeExamAssignmentDef[];
}

interface ClassTypeExamAssignmentDef {
  exam: string;
  exam_display_name?: string;
  qp_type: string;
  weight?: number;
  enabled?: boolean;
}

interface QpType {
  id: string;
  code: string;
  name?: string;
  class_type?: string | null;
  class_type_name?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

const BTL_LEVELS = [1, 2, 3, 4, 5, 6];
const CO_NUMBERS = [1, 2, 3, 4, 5, 6];

/** Generate question rows from Mark Manager CO config */
function markManagerToRows(config: MarkManagerConfig): QuestionDef[] {
  const rows: QuestionDef[] = [];
  if (config.cia_enabled && config.cia_max_marks > 0) {
    rows.push({
      title: 'Exam',
      max_marks: config.cia_max_marks,
      btl_level: null,
      co_number: null,
      enabled: true,
    });
  }

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
  return {
    enabled: false,
    mode: 'admin_define',
    cia_enabled: false,
    cia_max_marks: 30,
    whole_number: false,
    arrow_keys: true,
    cos,
  };
}

function normalizeRows(pattern: QpPattern | null): QuestionDef[] {
  if (!pattern) return [];
  const p = pattern.pattern || {};
  const titles = Array.isArray(p.titles) ? p.titles : [];
  const marks = Array.isArray(p.marks) ? p.marks : [];
  const btls = Array.isArray(p.btls) ? p.btls : [];
  const cos = Array.isArray(p.cos) ? p.cos : [];
  const enabled = Array.isArray(p.enabled) ? p.enabled : [];

  if (titles.length > 0) {
    return titles.map((title, idx) => ({
      title: String(title || `Q${idx + 1}`),
      max_marks: Number(marks[idx] ?? 0) || 0,
      btl_level: btls[idx] == null ? null : Number(btls[idx]),
      co_number: cos[idx] == null ? null : Number(cos[idx]),
      enabled: enabled[idx] ?? true,
    }));
  }

  if (Array.isArray(pattern.questions) && pattern.questions.length > 0) {
    return pattern.questions.map((q, idx) => ({
      title: String(q.title || `Q${idx + 1}`),
      max_marks: Number(q.max_marks ?? q.max ?? 0) || 0,
      btl_level: q.btl_level ?? q.btl ?? null,
      co_number: q.co_number ?? q.co ?? null,
      enabled: q.enabled ?? true,
    }));
  }

  return [];
}

function rowsToPattern(rows: QuestionDef[]) {
  return {
    titles: rows.map((r) => r.title),
    marks: rows.map((r) => Number(r.max_marks) || 0),
    btls: rows.map((r) => (r.btl_level == null ? null : Number(r.btl_level))),
    cos: rows.map((r) => (r.co_number == null ? null : Number(r.co_number))),
    enabled: rows.map((r) => !!r.enabled),
  };
}

function normalizeTypeCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export default function QpPatternEditorPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [qpTypes, setQpTypes] = useState<QpType[]>([]);
  const [patterns, setPatterns] = useState<QpPattern[]>([]);
  const [allExamAssignments, setAllExamAssignments] = useState<any[]>([]);
  const [selectedClassTypeId, setSelectedClassTypeId] = useState<string | null>(null);
  const [selectedQpType, setSelectedQpType] = useState<string>('');
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [selectedExamRef, setSelectedExamRef] = useState<{
    exam: string;
    exam_display_name: string;
    qp_type: string;
    id?: string;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateTypeDialog, setShowCreateTypeDialog] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeCode, setNewTypeCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [localName, setLocalName] = useState('');
  const [localRows, setLocalRows] = useState<QuestionDef[]>([]);
  const [markManager, setMarkManager] = useState<MarkManagerConfig>(getDefaultMarkManager());
  const [isDirty, setIsDirty] = useState(false);
  const [showAddExamModal, setShowAddExamModal] = useState(false);

  const markDirty = () => setIsDirty(true);

  const selectedClassType = classTypes.find((ct) => ct.id === selectedClassTypeId) || null;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [classTypeRes, qpTypeRes, patternRes] = await Promise.all([
        fetchWithAuth('/api/academic-v2/class-types/'),
        fetchWithAuth('/api/academic-v2/qp-types/'),
        fetchWithAuth('/api/academic-v2/qp-patterns/'),
      ]);

      if (!classTypeRes.ok || !patternRes.ok) throw new Error('Failed to load');

      const classTypeData = await classTypeRes.json();
      const qpTypeData = qpTypeRes.ok ? await qpTypeRes.json() : { results: [] };
      const patternData = await patternRes.json();
      
      const classTypeList = Array.isArray(classTypeData) ? classTypeData : (classTypeData.results || []);
      const qpTypeList = Array.isArray(qpTypeData) ? qpTypeData : (qpTypeData.results || []);
      const patternList = Array.isArray(patternData) ? patternData : (patternData.results || []);

      // Exam templates are patterns with class_type = null (created in Exam Assignment Admin)
      const examTemplates = patternList.filter((p: any) => p.class_type === null || p.class_type === undefined);
      
      setClassTypes(classTypeList);
      setQpTypes(qpTypeList);
      setPatterns(patternList);
      setAllExamAssignments(examTemplates);

      if (!selectedClassTypeId && classTypeList.length > 0) {
        setSelectedClassTypeId(classTypeList[0].id);
      }
      
      console.log('✅ Loaded data:', {
        classTypes: classTypeList.length,
        qpTypes: qpTypeList.length,
        patterns: patternList.length,
        exams: examTemplates.length,
      });
    } catch (error) {
      console.error('Failed to load:', error);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const qpTypeList = React.useMemo(() => {
    // Get all active QP types that match the selected class type or are global (class_type = null)
    return qpTypes
      .filter((t) => t.is_active !== false && (t.class_type === selectedClassTypeId || t.class_type == null))
      .map((t) => ({
        code: t.code,
        label: t.name || t.code.replace(/_/g, ' '),
        id: t.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [qpTypes, selectedClassTypeId]);

  useEffect(() => {
    if (!selectedQpType && qpTypeList.length > 0) {
      setSelectedQpType(qpTypeList[0].code);
      return;
    }
    if (selectedQpType && !qpTypeList.find((t) => t.code === selectedQpType)) {
      setSelectedQpType(qpTypeList[0]?.code || '');
    }
  }, [qpTypeList, selectedQpType]);

  const scorePattern = (p: QpPattern) => {
    // Highest priority: class-specific pattern for selected class + selected QP type.
    if (p.class_type === selectedClassTypeId && p.qp_type === selectedQpType) return 3;
    // Next: class-specific regardless of type (future-proof if backend returns expanded rows).
    if (p.class_type === selectedClassTypeId) return 2;
    // Then: global type pattern.
    if (p.class_type == null && p.qp_type === selectedQpType) return 1;
    return 0;
  };

  const addedExamPatterns = React.useMemo(() => {
    if (!selectedClassTypeId || !selectedQpType) return [] as QpPattern[];
    return patterns
      .filter((p) => p.is_active !== false)
      .filter((p) => p.class_type === selectedClassTypeId)
      .filter((p) => String(p.qp_type || '') === selectedQpType)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }, [patterns, selectedClassTypeId, selectedQpType]);

  const availableExamsForCurrent = React.useMemo(() => {
    // Show ALL exam templates (patterns with class_type = null) for selection
    return (Array.isArray(allExamAssignments) ? allExamAssignments : [])
      .map((e) => ({
        id: e.id,
        exam: String(e.name || ''),
        exam_display_name: String(e.name || ''),
        qp_type: String(e.qp_type || ''),
      }))
      .filter((e) => !!e.exam_display_name)
      .sort((a, b) => a.exam_display_name.localeCompare(b.exam_display_name));
  }, [allExamAssignments]);

  useEffect(() => {
    // If nothing is selected, auto-select the first added pattern.
    if (!selectedPatternId && !selectedExamRef && addedExamPatterns.length > 0) {
      const first = addedExamPatterns[0];
      setSelectedPatternId(first.id);
      setSelectedExamRef({ exam: first.name, exam_display_name: first.name, qp_type: selectedQpType });
    }
  }, [addedExamPatterns, selectedPatternId, selectedExamRef, selectedQpType]);

  useEffect(() => {
    if (selectedPatternId && !patterns.find((p) => p.id === selectedPatternId)) {
      setSelectedPatternId(null);
    }
  }, [selectedPatternId, patterns]);

  const resolvedPattern = React.useMemo(() => {
    if (!selectedExamRef) return null;
    const explicit = selectedPatternId ? patterns.find((p) => p.id === selectedPatternId) || null : null;
    if (explicit) return explicit;

    const keyName = String(selectedExamRef.exam_display_name || '').trim().toLowerCase();

    // IMPORTANT: When selecting a NEW exam from the modal we should not auto-pick
    // some other existing pattern for the same class_type + qp_type. Only resolve
    // an existing pattern if its name matches the selected exam.
    const candidates = patterns
      .filter((p) => String(p.qp_type || '') === selectedQpType)
      .filter((p) => p.class_type === selectedClassTypeId || p.class_type == null)
      .filter((p) => String(p.name || '').trim().toLowerCase() === keyName)
      .sort((a, b) => {
        const scoreDiff = scorePattern(b) - scorePattern(a);
        if (scoreDiff !== 0) return scoreDiff;
        return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      });

    return candidates[0] || null;
  }, [selectedExamRef, selectedPatternId, patterns, selectedQpType, selectedClassTypeId]);

  useEffect(() => {
    if (!selectedExamRef) {
      setLocalName('');
      setLocalRows([]);
      setMarkManager(getDefaultMarkManager());
      setIsDirty(false);
      return;
    }

    const defaultName = String(selectedExamRef.exam_display_name || selectedExamRef.exam || '').trim();
    if (resolvedPattern) {
      setLocalName(resolvedPattern.name || defaultName);
      setLocalRows(normalizeRows(resolvedPattern));

      const mm = resolvedPattern.pattern?.mark_manager;
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
          const c = (mm as any).cos?.[i] || (mm as any).cos?.[String(i)];
          loaded.cos[i] = c
            ? { enabled: !!c.enabled, num_items: c.num_items ?? 5, max_marks: c.max_marks ?? 25 }
            : { enabled: false, num_items: 5, max_marks: 25 };
        }
        setMarkManager(loaded);
      } else {
        setMarkManager(getDefaultMarkManager());
      }

      setIsDirty(false);
      return;
    }

    setLocalName(defaultName);
    setLocalRows([]);
    setMarkManager(getDefaultMarkManager());
    setIsDirty(false);
  }, [selectedExamRef, resolvedPattern]);

  const updateRow = (index: number, field: keyof QuestionDef, value: unknown) => {
    setLocalRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    markDirty();
  };

  const addQuestion = () => {
    setLocalRows((prev) => [...prev, {
      title: `Q${prev.length + 1}`,
      max_marks: 10,
      btl_level: 2,
      co_number: 1,
      enabled: true,
    }]);
    markDirty();
  };

  const removeQuestion = (index: number) => {
    setLocalRows((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  };

  const handleCreateType = async () => {
    if (!selectedClassTypeId) return;
    const typeName = newTypeName.trim();
    const typeCode = normalizeTypeCode(newTypeCode || newTypeName);
    if (!typeName || !typeCode) return;

    try {
      setSaving(true);
      const response = await fetchWithAuth('/api/academic-v2/qp-types/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: typeName,
          code: typeCode,
          description: '',
          class_type: selectedClassTypeId,
          is_active: true,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let errorMsg = 'Failed to create QP type';
        
        if (contentType.includes('application/json')) {
          try {
            const error = await response.json();
            errorMsg = error.detail || error.message || error.code?.[0] || errorMsg;
          } catch {
            errorMsg = `Server error (${response.status})`;
          }
        } else {
          errorMsg = `Server error (${response.status}): ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMsg);
      }

      const created = await response.json();
      setQpTypes((prev) => [...prev, created]);
      setSelectedQpType(typeCode);
      setSelectedPatternId(null);
      setSelectedExamRef(null);
      setShowCreateTypeDialog(false);
      setNewTypeName('');
      setNewTypeCode('');
      setMessage({ type: 'success', text: `QP type ${typeCode} created successfully` });
    } catch (error: any) {
      console.error('Create failed:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to create QP type' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedExamRef || !selectedClassTypeId || !selectedQpType) return;

    try {
      setSaving(true);
      const finalRows = markManager.enabled ? markManagerToRows(markManager) : localRows;
      const patternPayload = {
        ...rowsToPattern(finalRows),
        mark_manager: markManager.enabled ? markManager : null,
      };
      let savedPattern: QpPattern | null = null;

      if (
        resolvedPattern &&
        resolvedPattern.class_type === selectedClassTypeId &&
        String(resolvedPattern.qp_type || '') === String(selectedQpType || '')
      ) {
        const updateRes = await fetchWithAuth(`/api/academic-v2/qp-patterns/${resolvedPattern.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: localName,
            qp_type: selectedQpType,
            class_type: selectedClassTypeId,
            pattern: patternPayload,
          }),
        });
        if (!updateRes.ok) throw new Error('Save failed');
        savedPattern = await updateRes.json();
        setPatterns((prev) => prev.map((p) => (p.id === savedPattern!.id ? savedPattern! : p)));
      } else {
        const createRes = await fetchWithAuth('/api/academic-v2/qp-patterns/', {
          method: 'POST',
          body: JSON.stringify({
            name: localName || selectedExamRef.exam_display_name,
            qp_type: selectedQpType,
            class_type: selectedClassTypeId,
            default_weight: 0,
            pattern: patternPayload,
            is_active: true,
          }),
        });
        if (!createRes.ok) throw new Error('Save failed');
        savedPattern = await createRes.json();
        setPatterns((prev) => [...prev, savedPattern!]);
      }

      setSelectedPatternId(savedPattern?.id || null);
      setSelectedExamRef({ exam: savedPattern?.name || selectedExamRef.exam, exam_display_name: savedPattern?.name || selectedExamRef.exam_display_name, qp_type: selectedQpType });

      setMessage({ type: 'success', text: 'Changes saved' });
      setIsDirty(false);
      setIsEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
      setMessage({ type: 'error', text: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!resolvedPattern || !confirm('Are you sure you want to delete this pattern?')) return;

    try {
      const response = await fetchWithAuth(`/api/academic-v2/qp-patterns/${resolvedPattern.id}/`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Delete failed');

      setPatterns((prev) => prev.filter((p) => p.id !== resolvedPattern.id));
      setSelectedPatternId(null);
      setSelectedExamRef(null);
      setMessage({ type: 'success', text: 'Pattern deleted' });
    } catch (error) {
      console.error('Delete failed:', error);
      setMessage({ type: 'error', text: 'Failed to delete pattern' });
    }
  };

  const calculateTotalMarks = () => {
    const effectiveRows = markManager.enabled ? markManagerToRows(markManager) : localRows;
    return effectiveRows.filter((q) => q.enabled).reduce((sum, q) => sum + (q.max_marks || 0), 0);
  };

  const effectiveRows = markManager.enabled ? markManagerToRows(markManager) : localRows;
  const totalMarks = calculateTotalMarks();

  const sourceTag = resolvedPattern
    ? (resolvedPattern.class_type === selectedClassTypeId ? 'Class Type Override (Highest Priority)' : 'Global Fallback')
    : null;

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
          <p className="text-gray-500 mt-1">
            Sidebar flow: Class Type {'->'} QP Type {'->'} Exam Assignment. QP type with class override is always prioritized for question rendering.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Sidebar 1: Class Types */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-3 bg-gray-50 border-b font-medium">Class Types</div>
            {classTypes.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No class types</div>
            ) : (
              classTypes.map((ct) => (
                <div
                  key={ct.id}
                  onClick={() => {
                    setSelectedClassTypeId(ct.id);
                    setSelectedQpType('');
                    setSelectedPatternId(null);
                    setSelectedExamRef(null);
                    setIsEditing(false);
                  }}
                  className={`p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-50 ${
                    selectedClassTypeId === ct.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                  }`}
                >
                  <div className="font-medium">{ct.display_name || ct.name}</div>
                  <div className="text-xs text-gray-500">{ct.short_code || ct.name}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar 2: QP Types */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
              <span className="font-medium">QP Types</span>
              <button
                onClick={() => setShowCreateTypeDialog(true)}
                disabled={!selectedClassTypeId}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                + New Type
              </button>
            </div>
            {qpTypeList.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No QP types available. Create a new one.</div>
            ) : (
              qpTypeList.map((t) => (
                <div
                  key={t.code}
                  onClick={() => {
                    setSelectedQpType(t.code);
                    setSelectedPatternId(null);
                    setSelectedExamRef(null);
                    setIsEditing(false);
                  }}
                  className={`p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-50 ${
                    selectedQpType === t.code ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                  }`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-gray-500">{t.code}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar 3: Exam Assignments */}
        <div className="xl:col-span-3">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
              <div>
                <span className="font-medium block">Exam Assignments</span>
                <span className="text-xs text-gray-500">added for this class + QP type</span>
              </div>
              {selectedClassTypeId && !!selectedQpType && (
                <button
                  onClick={() => setShowAddExamModal(true)}
                  disabled={!selectedClassTypeId || !selectedQpType}
                  className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center gap-1"
                  title="Add exam assignment"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            {!selectedClassTypeId ? (
              <div className="p-4 text-sm text-gray-500">Select a class type first</div>
            ) : !selectedQpType ? (
              <div className="p-4 text-sm text-gray-500">Select a QP type first</div>
            ) : addedExamPatterns.length === 0 ? (
              <div className="p-4 text-center">
                <div className="text-sm text-gray-500">No exams added yet for this QP type</div>
                <div className="text-xs text-gray-400 mt-1">Click Add to pick an exam and start editing</div>
              </div>
            ) : (
              addedExamPatterns.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPatternId(p.id);
                    setSelectedExamRef({ exam: p.name, exam_display_name: p.name, qp_type: selectedQpType });
                    setIsEditing(false);
                  }}
                  className={`p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-50 ${
                    selectedPatternId === p.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                  }`}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">
                    {selectedClassType?.display_name || selectedClassType?.name || 'Class'} · {p.qp_type || 'Type'} · {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : 'Date'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Editor */}
        <div className="xl:col-span-5">
          {selectedExamRef ? (
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-500" />
                  {isEditing ? (
                    <input
                      type="text"
                      value={localName}
                      onChange={(e) => {
                        setLocalName(e.target.value);
                        setIsDirty(true);
                      }}
                      className="text-lg font-semibold px-2 py-1 border rounded"
                    />
                  ) : (
                    <h2 className="text-lg font-semibold">{localName || selectedExamRef.exam_display_name}</h2>
                  )}
                  <span className="px-2 py-1 bg-gray-100 rounded text-sm">{selectedQpType || '-'}</span>
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          const defaultName = String(selectedExamRef.exam_display_name || selectedExamRef.exam || '').trim();
                          if (resolvedPattern) {
                            setLocalName(resolvedPattern.name || defaultName);
                            setLocalRows(normalizeRows(resolvedPattern));
                            const mm = resolvedPattern.pattern?.mark_manager;
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
                                const c = (mm as any).cos?.[i] || (mm as any).cos?.[String(i)];
                                loaded.cos[i] = c
                                  ? { enabled: !!c.enabled, num_items: c.num_items ?? 5, max_marks: c.max_marks ?? 25 }
                                  : { enabled: false, num_items: 5, max_marks: 25 };
                              }
                              setMarkManager(loaded);
                            } else {
                              setMarkManager(getDefaultMarkManager());
                            }
                          } else {
                            setLocalName(defaultName);
                            setLocalRows([]);
                            setMarkManager(getDefaultMarkManager());
                          }
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
                <div className="p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
                  <div className="font-medium">Priority Resolution</div>
                  <div className="mt-1">
                    Order used for showing questions: <strong>Class Type + QP Type</strong> {'->'} Class Type fallback {'->'} Global fallback.
                  </div>
                  {sourceTag && <div className="mt-1">Current source: <strong>{sourceTag}</strong></div>}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-8 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm text-gray-500">Total Questions:</span>
                    <span className="ml-2 font-medium">{effectiveRows.length}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Total Marks:</span>
                    <span className={`ml-2 font-medium px-2 py-1 rounded ${totalMarks > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {totalMarks}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Class Type:</span>
                    <span className="ml-2 font-medium">{selectedClassType?.display_name || selectedClassType?.name || '-'}</span>
                  </div>
                </div>

                {/* Mark Manager Toggle (moved from Exam Assignment page) */}
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

                {/* Question table — shown only when Mark Manager is OFF (moved from Exam Assignment page) */}
                {!markManager.enabled && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">Question Table</h3>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${totalMarks > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        Total: {totalMarks} marks
                      </span>
                      {isEditing && (
                        <button onClick={addQuestion} className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-lg hover:bg-blue-200">
                          <Plus className="w-3.5 h-3.5" /> Add Row
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {isEditing && <th className="w-8 px-2 py-2 text-gray-400">#</th>}
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Enabled</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Question Title</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Max Marks</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">BTL</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">CO</th>
                          {isEditing && <th className="px-2 py-2 w-8"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {localRows.length === 0 ? (
                          <tr>
                            <td colSpan={isEditing ? 7 : 5} className="text-center py-8 text-gray-400">
                              No questions yet. {isEditing && 'Click "Add Row" to create one.'}
                            </td>
                          </tr>
                        ) : (
                          localRows.map((row, idx) => (
                            <tr key={idx} className={`hover:bg-gray-50 ${!row.enabled ? 'opacity-50' : ''}`}>
                              {isEditing && (
                                <td className="px-2 py-2 text-center text-gray-300 cursor-grab">
                                  <GripVertical className="w-4 h-4 inline" />
                                </td>
                              )}
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.enabled}
                                  disabled={!isEditing}
                                  onChange={e => updateRow(idx, 'enabled', e.target.checked)}
                                  className="w-4 h-4 accent-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2">
                                {isEditing ? (
                                  <input
                                    value={row.title}
                                    onChange={e => updateRow(idx, 'title', e.target.value)}
                                    className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-500 text-sm"
                                    placeholder="Q1 (a)"
                                  />
                                ) : (
                                  <span className="font-medium">{row.title}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={row.max_marks}
                                    onChange={e => updateRow(idx, 'max_marks', Number(e.target.value))}
                                    className="w-16 px-2 py-1 border rounded text-center focus:ring-1 focus:ring-blue-500 text-sm"
                                  />
                                ) : (
                                  <span className="font-semibold text-gray-700">{row.max_marks}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {isEditing ? (
                                  <select value={row.btl_level ?? ''} onChange={e => updateRow(idx, 'btl_level', e.target.value ? Number(e.target.value) : null)} className="px-2 py-1 border rounded text-sm focus:ring-1 focus:ring-blue-500">
                                    <option value="">User Selection</option>
                                    {BTL_LEVELS.map(l => <option key={l} value={l}>BT{l}</option>)}
                                  </select>
                                ) : (
                                  row.btl_level ? <span className="bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded">BT{row.btl_level}</span> : <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">User Sel.</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {isEditing ? (
                                  <select value={row.co_number ?? ''} onChange={e => updateRow(idx, 'co_number', e.target.value ? Number(e.target.value) : null)} className="px-2 py-1 border rounded text-sm focus:ring-1 focus:ring-blue-500">
                                    <option value="">—</option>
                                    {CO_NUMBERS.map(c => <option key={c} value={c}>CO{c}</option>)}
                                  </select>
                                ) : (
                                  row.co_number ? <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded">CO{row.co_number}</span> : <span className="text-gray-300">—</span>
                                )}
                              </td>
                              {isEditing && (
                                <td className="px-2 py-2 text-center">
                                  <button onClick={() => removeQuestion(idx)} className="p-1 text-red-400 hover:text-red-600 rounded">
                                    <X className="w-4 h-4" />
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
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border-dashed border-2 p-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Select Class Type and QP Type, then click Add to choose an exam to edit.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create QP Type Dialog */}
      {showCreateTypeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Create New QP Type</h2>
              <button onClick={() => setShowCreateTypeDialog(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type Name</label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g., Continuous Assessment"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type Code</label>
                <input
                  type="text"
                  value={newTypeCode}
                  onChange={(e) => setNewTypeCode(e.target.value)}
                  placeholder="e.g., CIA_MAIN"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Saved code preview: {normalizeTypeCode(newTypeCode || newTypeName) || '-'}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateTypeDialog(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateType}
                disabled={!newTypeName.trim() || saving || !selectedClassTypeId}
                className={`px-4 py-2 rounded-lg ${
                  newTypeName.trim() && !saving && !!selectedClassTypeId
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

      {/* Add Exam Assignment Modal */}
      {showAddExamModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Select Exam Assignment</h2>
              <button onClick={() => setShowAddExamModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {!selectedClassTypeId || !selectedQpType ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <p className="mb-2">Select a Class Type and QP Type first</p>
                </div>
              </div>
            ) : availableExamsForCurrent.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <p className="mb-2">No exams available for selection</p>
                  <p className="text-xs">Create exams in Exam Assignment Admin</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto border rounded-lg mb-4">
                <div className="divide-y">
                  {availableExamsForCurrent.map((exam) => {
                    const existing = addedExamPatterns.find((p) => String(p.name || '').trim().toLowerCase() === String(exam.exam_display_name || '').trim().toLowerCase());
                    return (
                    <div
                      key={`${exam.id}`}
                      onClick={() => {
                        // Map this exam under the selected QP Type in the current Class Type
                        setSelectedExamRef({
                          exam: exam.exam,
                          exam_display_name: exam.exam_display_name,
                          qp_type: selectedQpType,
                          id: exam.id,
                        });
                        setSelectedPatternId(existing?.id || null);
                        setShowAddExamModal(false);
                      }}
                      className="p-3 cursor-pointer hover:bg-blue-50 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-sm">{exam.exam_display_name}</div>
                        {existing && <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">Added</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Type: {exam.qp_type || 'N/A'} → Mapping to {selectedQpType || 'N/A'}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddExamModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
