import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Settings2, GripVertical, Copy, ClipboardPaste, Check, AlertTriangle, Save, Trash2, Edit3 } from 'lucide-react';
import QpCqiEditorPopup from './QpCqiEditorPopup';

const BTL_LEVELS = [1, 2, 3, 4, 5, 6];

const toCoArray = (co: number | number[] | null): number[] => {
  if (co == null) return [];
  if (Array.isArray(co)) return co.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  const value = Number(co);
  return Number.isFinite(value) && value > 0 ? [value] : [];
};
const coLabel = (co: number | number[] | null): string => {
  if (co == null) return '—';
  if (Array.isArray(co)) return co.join(',');
  return `CO${co}`;
};

interface QuestionDef {
  title: string;
  max_marks: number;
  btl_level: number | null;
  co_number: number | number[] | null;
  enabled: boolean;
  special_split?: boolean;
  special_split_sources?: number[];
}

// token is now any string to support DB-backed token registry
type CqiIfClause = { token: string; operator?: string; rhs: string };

// Admin-defined CO-wise derived variable (name may contain COx as runtime placeholder)
type CqiDerivedVariable = { name: string; formula: string };

interface ExamAssignment {
  exam: string;
  exam_display_name?: string;
  qp_type: string;
  weight: number;
  co_weights: Record<string, number>;
  kind?: 'exam' | 'cqi';
  cqi?: {
    name: string;
    code: string;
    cos: number[];
    exams?: string[];
    custom_vars?: Array<{ code: string; label?: string; expr: string }>;
    co_value_expr?: string;
    formula: string;
    conditions: Array<{ if: string; then: string; color?: string; if_clauses?: CqiIfClause[] }>;
    else_formula: string;
    derived_variables?: CqiDerivedVariable[];
  };
  mark_manager_enabled?: boolean;
  mm_exam_weight?: number;
  mm_co_weights_with_exam?: Record<string, number>;
  mm_co_weights_without_exam?: Record<string, number>;
  default_cos: number[];
  customize_questions: boolean;
  enabled?: boolean;
  pass_mark?: number | null;
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
  cia_label?: string;
  item_name?: string;
  whole_number: boolean;
  arrow_keys: boolean;
  cos: Record<number, MarkManagerCOConfig>;
}

type CqiVar = { code: string; label: string; token: string; kind?: 'base' | 'custom' };

type CycleOption = {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onDiscardChanges?: () => void;

  onSave?: () => Promise<void>;
  onDelete?: () => void;

  // Exam identity
  selectedExamAssignmentItem: { exam: ExamAssignment; idx: number } | null;
  selectedQpType: string;

  // Question table state (for Mark Manager OFF case)
  localRows: QuestionDef[];
  onAddQuestion: () => void;
  onRemoveQuestion: (idx: number) => void;
  onUpdateRow: (idx: number, field: keyof QuestionDef, value: unknown) => void;
  onOpenQuestionSettings: (idx: number) => void;
  onReplaceRows: (rows: QuestionDef[]) => void;
  markManager: MarkManagerConfig;
  onMarkManagerChange: (mm: MarkManagerConfig) => void;

  // CQI embedding support
  cqiVariables: CqiVar[];
  groupedCqiVariables: Array<{
    key: string;
    meta: { title: string; description: string; headerClass: string; panelClass: string };
    items: CqiVar[];
  }>;
  tokenMeta: (code: string) => { badge: string; badgeClass: string; rowClass: string; tokenClass: string };
  updateCqi: (updater: (prev: NonNullable<ExamAssignment['cqi']>) => NonNullable<ExamAssignment['cqi']>) => void;
  availableExamAssignments: ExamAssignment[];
  sharedCustomVars: Array<{ code: string; label?: string; expr: string }>;
  updateSharedCustomVars: (updater: (prev: Array<{ code: string; label?: string; expr: string }>) => Array<{ code: string; label?: string; expr: string }>) => void;
  onSaveSharedCustomVars: () => Promise<void> | void;
  savingSharedCustomVars?: boolean;
  parseIfClauses: (raw: string) => CqiIfClause[];
  buildIfFromClauses: (clauses: CqiIfClause[]) => string;
  appendToken: (current: string, token: string) => string;

  openTokenPicker: (insert: (token: string) => void) => void;

  selectedClassTypeDefaultCoCount: number;
  courseOutcomeNumbers?: number[];
  cycles: CycleOption[];
};

export default function QpExamAssignmentEditorPopup(props: Props) {
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [schemaInputOpen, setSchemaInputOpen] = useState(false);
  const [schemaInputText, setSchemaInputText] = useState('');
  const [schemaInputError, setSchemaInputError] = useState<string | null>(null);
  const [localEditing, setLocalEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeCoPickerRow, setActiveCoPickerRow] = useState<number | null>(null);
  const [coPickerPos, setCoPickerPos] = useState<{ top: number; left: number } | null>(null);
  const coPickerRef = useRef<HTMLDivElement | null>(null);

  if (!props.open || !props.selectedExamAssignmentItem) return null;

  const exam = props.selectedExamAssignmentItem.exam;
  const markManager = props.markManager;
  const coNumbers = Array.from(
    new Set((props.courseOutcomeNumbers || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)),
  ).sort((a, b) => a - b);

  const applyCheckedCos = (rowIndex: number, checkedValues: number[]) => {
    const normalized = Array.from(new Set(checkedValues.filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);
    if (normalized.length === 0) {
      props.onUpdateRow(rowIndex, 'co_number', null);
      return;
    }
    if (normalized.length === 1) {
      props.onUpdateRow(rowIndex, 'co_number', normalized[0]);
      return;
    }
    props.onUpdateRow(rowIndex, 'co_number', normalized);
  };

  const closeCoPicker = () => {
    setActiveCoPickerRow(null);
    setCoPickerPos(null);
  };

  const openCoPicker = (rowIndex: number, el: HTMLButtonElement) => {
    const rect = el.getBoundingClientRect();
    const pickerWidth = 208;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - viewportPadding),
    );
    const top = Math.min(rect.bottom + 6, window.innerHeight - 280);
    setActiveCoPickerRow(rowIndex);
    setCoPickerPos({ top, left });
  };

  useEffect(() => {
    if (activeCoPickerRow == null) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const clickedPicker = coPickerRef.current?.contains(target);
      const clickedButton = target.closest('[data-co-picker-btn="true"]');
      if (!clickedPicker && !clickedButton) {
        closeCoPicker();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCoPicker();
    };
    const onViewportChange = () => closeCoPicker();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [activeCoPickerRow]);

  const updateMarkManager = (updater: (prev: MarkManagerConfig) => MarkManagerConfig) => {
    const next = updater(markManager);
    props.onMarkManagerChange(next);
    setLocalEditing(true);
  };

  // Generate rows from mark manager config (simple generator similar to admin page)
  const markManagerToRows = (cfg: MarkManagerConfig): QuestionDef[] => {
    const rows: QuestionDef[] = [];
    const examTitle = String(cfg.cia_label || '').trim() || 'Exam';
    const commonItemName = String(cfg.item_name || '').trim() || 'Item';
    if (cfg.cia_enabled && cfg.cia_max_marks > 0) {
      rows.push({ title: examTitle, max_marks: cfg.cia_max_marks, btl_level: null, co_number: null, enabled: true, special_split: false, special_split_sources: [] });
    }
    const coNums = Object.keys(cfg.cos).map(Number).sort((a, b) => a - b);
    for (const coNum of coNums) {
      const coCfg = cfg.cos[coNum];
      if (!coCfg.enabled) continue;
      const numItems = coCfg.num_items || 1;
      const perItem = numItems > 0 ? Math.round((coCfg.max_marks / numItems) * 100) / 100 : coCfg.max_marks;
      for (let i = 0; i < numItems; i++) {
        rows.push({ title: `CO${coNum} - ${commonItemName} ${i + 1}`, max_marks: perItem, btl_level: null, co_number: coNum, enabled: true, special_split: false, special_split_sources: [] });
      }
    }
    return rows;
  };

  // When mark manager is toggled on in admin_define mode, replace rows
  useEffect(() => {
    if (markManager.enabled && markManager.mode === 'admin_define') {
      const rows = markManagerToRows(markManager);
      props.onReplaceRows(rows);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markManager]);
  const isCurrentlyEditing = localEditing;
  const isCqi = String(exam.exam || exam.exam_display_name || '').toUpperCase().startsWith('CQI') || exam.kind === 'cqi';
  const totalMarks = props.localRows.filter(r => r.enabled).reduce((s, r) => s + (Number(r.max_marks) || 0), 0);

  const handleSaveClick = async () => {
    if (!props.onSave) return;
    setSaving(true);
    try {
      await props.onSave();
      setLocalEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardClick = () => {
    props.onDiscardChanges?.();
    setLocalEditing(false);
  };

  const handleClose = () => {
    if (localEditing) {
      handleDiscardClick();
    }
    props.onClose();
  };

  const handleCopySchema = () => {
    const schema = props.localRows.map(r => ({
      title: r.title,
      max_marks: r.max_marks,
      btl_level: r.btl_level,
      co_number: r.co_number,
      enabled: r.enabled,
    }));
    navigator.clipboard.writeText(JSON.stringify(schema, null, 2)).then(() => {
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2500);
    }).catch(() => {
      setSchemaInputText(JSON.stringify(schema, null, 2));
      setSchemaInputOpen(true);
    });
  };

  const handleApplySchema = () => {
    try {
      const parsed = JSON.parse(schemaInputText);
      if (!Array.isArray(parsed)) throw new Error('Schema must be a JSON array');
      if (parsed.length === 0) throw new Error('Schema array is empty');
      const rows: QuestionDef[] = parsed.map((r: any, idx: number) => ({
        title: String(r.title ?? `Q${idx + 1}`),
        max_marks: Number(r.max_marks ?? r.max ?? 0) || 0,
        btl_level: r.btl_level != null ? Number(r.btl_level) : null,
        co_number: Array.isArray(r.co_number)
          ? r.co_number.map(Number)
          : r.co_number != null ? Number(r.co_number) : null,
        enabled: r.enabled !== false,
        special_split: false,
        special_split_sources: [],
      }));
      props.onReplaceRows(rows);
      setSchemaInputOpen(false);
      setSchemaInputText('');
      setSchemaInputError(null);
    } catch (e: any) {
      setSchemaInputError(`Invalid schema: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-auto py-6 px-4">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl border overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900">{exam.exam_display_name || exam.exam}</div>
            <div className="text-xs text-gray-500">QP Type: {props.selectedQpType}</div>
          </div>

          {!isCqi && !isCurrentlyEditing && (
            <button
              type="button"
              onClick={handleCopySchema}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                schemaCopied ? 'bg-green-50 border-green-400 text-green-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="Copy question schema to clipboard (title, CO, BTL, max, enabled)"
            >
              {schemaCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {schemaCopied ? 'Copied!' : 'Copy Schema'}
            </button>
          )}

          {/* Edit / Save / Delete / Cancel buttons */}
          {props.onSave && !isCurrentlyEditing && (
            <button
              onClick={() => setLocalEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {isCurrentlyEditing && props.onSave && (
            <>
              {!isCqi && (
                <button
                  type="button"
                  onClick={() => { setSchemaInputText(''); setSchemaInputError(null); setSchemaInputOpen(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium"
                  title="Paste a copied schema to replace the current question table"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Input Schema
                </button>
              )}
              <button
                onClick={handleSaveClick}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-green-400 bg-green-50 text-green-700 hover:bg-green-100 font-medium disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
              </button>
              {localEditing && (
                <button
                  onClick={handleDiscardClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              )}
            </>
          )}
          {props.onDelete && !isCurrentlyEditing && (
            <button
              onClick={props.onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-medium"
              title="Delete this QP pattern"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}

          <button onClick={handleClose} className="p-2 rounded hover:bg-gray-200" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {isCqi ? (
            <QpCqiEditorPopup
              open={true}
              onClose={handleClose}
              onSave={props.onSave ? async () => { await handleSaveClick(); } : undefined}
              selectedExamAssignment={{
                exam: exam.exam,
                exam_display_name: exam.exam_display_name || exam.exam,
                qp_type: exam.qp_type,
              }}
              selectedExamAssignmentItem={props.selectedExamAssignmentItem as any}
              isEditing={isCurrentlyEditing}
              localRows={props.localRows}
              onUpdateRow={props.onUpdateRow}
              onRemoveQuestion={props.onRemoveQuestion}
              onAddQuestion={props.onAddQuestion}
              onOpenQuestionSettings={props.onOpenQuestionSettings}
              cqiVariables={props.cqiVariables}
              groupedCqiVariables={props.groupedCqiVariables}
              tokenMeta={props.tokenMeta as any}
              tokenInsertRequested={false}
              onRequestTokenPicker={(insert) => props.openTokenPicker(insert)}
              updateCqi={props.updateCqi}
              availableExamAssignments={props.availableExamAssignments}
              sharedCustomVars={props.sharedCustomVars}
              updateSharedCustomVars={props.updateSharedCustomVars}
              onSaveSharedCustomVars={props.onSaveSharedCustomVars}
              savingSharedCustomVars={props.savingSharedCustomVars}
              onEnableEditing={() => setLocalEditing(true)}
              parseIfClauses={props.parseIfClauses as any}
              buildIfFromClauses={props.buildIfFromClauses as any}
              appendToken={props.appendToken}
              selectedClassTypeDefaultCoCount={props.selectedClassTypeDefaultCoCount}
              courseOutcomeNumbers={props.courseOutcomeNumbers}
              cycles={props.cycles}
            />
          ) : (
            <div className="border rounded-lg overflow-hidden bg-white">
              {/* Toolbar */}
              <div className="p-3 border-b bg-gray-50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-800">Question Table</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${totalMarks > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    Total: {totalMarks} marks
                  </span>
                  <span className="text-xs text-gray-400">
                    {props.localRows.filter(r => r.enabled).length} enabled / {props.localRows.length} rows
                  </span>
                </div>
                {isCurrentlyEditing && (
                  <button
                    onClick={props.onAddQuestion}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                )}
              </div>

              {/* Mark Manager Toggle */}
              <div className="p-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={markManager.enabled}
                        disabled={!isCurrentlyEditing}
                        onChange={e => updateMarkManager(prev => ({ ...prev, enabled: e.target.checked }))}
                        className="w-4 h-4 accent-teal-600"
                      />
                      <Settings2 className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-700">Mark Manager</span>
                    </label>
                    {markManager.enabled && (
                      <span className="text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">Compact Lab Layout</span>
                    )}
                  </div>
                </div>

                {markManager.enabled && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer select-none ${markManager.mode === 'admin_define' ? 'bg-teal-50 border-teal-300' : 'hover:bg-gray-50'}`}>
                        <input type="radio" name="mm_mode_popup" checked={markManager.mode === 'admin_define'} disabled={!isCurrentlyEditing} onChange={() => updateMarkManager(prev => ({ ...prev, mode: 'admin_define' }))} className="accent-teal-600" />
                        <div><span className="text-sm font-semibold">Admin Define</span><div className="text-xs text-gray-500">Admin configures COs, items & marks here</div></div>
                      </label>
                      <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer select-none ${markManager.mode === 'user_define' ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}>
                        <input type="radio" name="mm_mode_popup" checked={markManager.mode === 'user_define'} disabled={!isCurrentlyEditing} onChange={() => updateMarkManager(prev => ({ ...prev, mode: 'user_define' }))} className="accent-blue-600" />
                        <div><span className="text-sm font-semibold">User Define</span><div className="text-xs text-gray-500">Faculty configures before mark entry</div></div>
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 px-3 py-2 border rounded-lg">
                        <input type="checkbox" checked={markManager.whole_number} disabled={!isCurrentlyEditing} onChange={e => updateMarkManager(prev => ({ ...prev, whole_number: e.target.checked }))} className="w-4 h-4 accent-amber-600" />
                        <div><span className="text-sm font-medium">Whole Number</span><div className="text-xs text-gray-500">No decimals allowed in mark entry</div></div>
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 border rounded-lg">
                        <input type="checkbox" checked={markManager.arrow_keys} disabled={!isCurrentlyEditing} onChange={e => updateMarkManager(prev => ({ ...prev, arrow_keys: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                        <div><span className="text-sm font-medium">Arrow Keys Inc/Dec</span><div className="text-xs text-gray-500">Up/Down arrows change value; unchecked = navigate cells</div></div>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="border rounded-lg p-3 bg-gray-50">
                        <label className="block text-xs text-gray-500 mb-1">Exam name</label>
                        <input
                          type="text"
                          value={markManager.cia_label || ''}
                          disabled={!isCurrentlyEditing}
                          onChange={e => updateMarkManager(prev => ({ ...prev, cia_label: e.target.value }))}
                          className="w-full px-2 py-1.5 border rounded text-sm"
                          placeholder="Exam"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Used as the generated title for the Exam row.</p>
                      </div>
                      <div className="border rounded-lg p-3 bg-gray-50">
                        <label className="block text-xs text-gray-500 mb-1">Common item name</label>
                        <input
                          type="text"
                          value={markManager.item_name || ''}
                          disabled={!isCurrentlyEditing}
                          onChange={e => updateMarkManager(prev => ({ ...prev, item_name: e.target.value }))}
                          className="w-full px-2 py-1.5 border rounded text-sm"
                          placeholder="Item"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Example: "Experiment" gives titles like CO1 - Experiment 1.</p>
                      </div>
                    </div>

                    {markManager.mode === 'user_define' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">Faculty will see the Mark Manager setup when they open this exam for mark entry. They can select COs, set number of items and max marks, then confirm to generate the question table.</div>
                    )}

                    {markManager.mode === 'admin_define' && (
                      <div className="mt-2">
                        {coNumbers.length === 0 && (
                          <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                            No Course Outcomes found. Please add Course Outcomes in Exam Management, Course Outcome tab.
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          {coNumbers.map(co => (
                            <label key={co} className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg cursor-pointer ${markManager.cos[co]?.enabled ? 'bg-teal-50 border-teal-300' : 'hover:bg-gray-50'}`}>
                              <input type="checkbox" checked={markManager.cos[co]?.enabled || false} disabled={!isCurrentlyEditing} onChange={e => updateMarkManager(prev => ({ ...prev, cos: { ...prev.cos, [co]: { ...prev.cos[co], enabled: e.target.checked } } }))} className="w-4 h-4 accent-teal-600" />
                              <span className="text-sm font-medium">CO-{co}</span>
                            </label>
                          ))}
                          <label className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg cursor-pointer ${markManager.cia_enabled ? 'bg-teal-50 border-teal-300' : 'hover:bg-gray-50'}`}>
                            <input type="checkbox" checked={markManager.cia_enabled} disabled={!isCurrentlyEditing} onChange={e => updateMarkManager(prev => ({ ...prev, cia_enabled: e.target.checked }))} className="w-4 h-4 accent-teal-600" />
                            <span className="text-sm font-medium">Exam</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          {markManager.cia_enabled && (
                            <div className="border rounded-lg p-3 bg-gray-50">
                              <label className="block text-xs text-gray-500 mb-1">Exam Max marks</label>
                              <input type="number" min={0} value={markManager.cia_max_marks} disabled={!isCurrentlyEditing} onChange={e => updateMarkManager(prev => ({ ...prev, cia_max_marks: Number(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                            </div>
                          )}
                          {coNumbers.filter(co => markManager.cos[co]?.enabled).map(co => (
                            <div key={co} className="border rounded-lg p-3 bg-gray-50">
                              <div className="text-sm font-semibold mb-2">CO-{co}</div>
                              <label className="block text-xs text-gray-500">No. of items</label>
                              <input type="number" min={1} value={markManager.cos[co].num_items} disabled={!isCurrentlyEditing} onChange={e => updateMarkManager(prev => ({ ...prev, cos: { ...prev.cos, [co]: { ...prev.cos[co], num_items: Number(e.target.value) || 1 } } }))} className="w-full px-2 py-1.5 border rounded text-sm mb-2" />
                              <label className="block text-xs text-gray-500">Max marks</label>
                              <input type="number" min={0} value={markManager.cos[co].max_marks} disabled={!isCurrentlyEditing} onChange={e => updateMarkManager(prev => ({ ...prev, cos: { ...prev.cos, [co]: { ...prev.cos[co], max_marks: Number(e.target.value) || 0 } } }))} className="w-full px-2 py-1.5 border rounded text-sm" />
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex items-center gap-4 text-sm">
                          <span className={`font-medium px-2 py-0.5 rounded ${totalMarks > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>Total: {markManager.cia_enabled ? markManager.cia_max_marks + Object.values(markManager.cos).filter(c => c.enabled).reduce((s, c) => s + c.max_marks, 0) : Object.values(markManager.cos).filter(c => c.enabled).reduce((s, c) => s + c.max_marks, 0)} marks</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      {isCurrentlyEditing && <th className="w-8 px-2 py-2.5 text-gray-400" />}
                      <th className="w-14 px-2 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">On</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Title</th>
                      <th className="w-20 px-2 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Max</th>
                      <th className="w-28 px-2 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">BTL</th>
                      <th className="w-52 px-2 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">CO</th>
                      <th className="w-10 px-2 py-2.5" />
                      {isCurrentlyEditing && <th className="w-10 px-2 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {props.localRows.length === 0 ? (
                      <tr>
                        <td className="text-center py-12 text-gray-400 text-sm" colSpan={isCurrentlyEditing ? 8 : 7}>
                          No questions yet.{isCurrentlyEditing && ' Click "Add Row" to create one.'}
                        </td>
                      </tr>
                    ) : (
                      props.localRows.map((row, idx) => (
                        <tr key={idx} className={`hover:bg-gray-50 ${!row.enabled ? 'opacity-50' : ''}`}>
                          {isCurrentlyEditing && (
                            <td className="px-2 py-2 text-center text-gray-300 cursor-grab">
                              <GripVertical className="w-4 h-4 inline" />
                            </td>
                          )}
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              disabled={!isCurrentlyEditing}
                              onChange={e => props.onUpdateRow(idx, 'enabled', e.target.checked)}
                              className="w-4 h-4 accent-blue-600"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            {isCurrentlyEditing ? (
                              <input
                                value={row.title}
                                onChange={e => props.onUpdateRow(idx, 'title', e.target.value)}
                                className="w-full px-2 py-1.5 border rounded focus:ring-1 focus:ring-blue-500 text-sm"
                                placeholder={`Q${idx + 1}`}
                              />
                            ) : (
                              <span className="font-medium">{row.title}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {isCurrentlyEditing ? (
                              <input
                                type="number"
                                min={0}
                                value={row.max_marks}
                                onChange={e => props.onUpdateRow(idx, 'max_marks', Number(e.target.value))}
                                className="w-16 px-2 py-1.5 border rounded text-center focus:ring-1 focus:ring-blue-500 text-sm"
                              />
                            ) : (
                              <span className="font-semibold text-gray-700">{row.max_marks}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {isCurrentlyEditing ? (
                              <select
                                value={row.btl_level ?? ''}
                                onChange={e => props.onUpdateRow(idx, 'btl_level', e.target.value ? Number(e.target.value) : null)}
                                className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">User Sel.</option>
                                {BTL_LEVELS.map(l => <option key={l} value={l}>BT{l}</option>)}
                              </select>
                            ) : (
                              row.btl_level
                                ? <span className="bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded">BT{row.btl_level}</span>
                                : <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">User Sel.</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {isCurrentlyEditing ? (
                              <button
                                type="button"
                                data-co-picker-btn="true"
                                onClick={(e) => {
                                  if (coNumbers.length === 0) return;
                                  if (activeCoPickerRow === idx) {
                                    closeCoPicker();
                                    return;
                                  }
                                  openCoPicker(idx, e.currentTarget);
                                }}
                                disabled={coNumbers.length === 0}
                                className="w-full px-2 py-1.5 border rounded text-sm text-left bg-white hover:bg-gray-50 focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {coNumbers.length === 0 ? 'No COs' : (row.co_number == null ? 'CO' : coLabel(row.co_number))}
                              </button>
                            ) : (
                              row.co_number != null ? (
                                Array.isArray(row.co_number)
                                  ? <span className="bg-violet-100 text-violet-700 text-xs px-1.5 py-0.5 rounded font-medium">{coLabel(row.co_number)}</span>
                                  : <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded">{coLabel(row.co_number)}</span>
                              ) : <span className="text-gray-300 text-xs">—</span>
                            )}

                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => props.onOpenQuestionSettings(idx)}
                              disabled={!isCurrentlyEditing}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40"
                              title="Question settings"
                            >
                              <Settings2 className="w-4 h-4" />
                            </button>
                          </td>
                          {isCurrentlyEditing && (
                            <td className="px-2 py-1.5 text-center">
                              <button
                                onClick={() => props.onRemoveQuestion(idx)}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                              >
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

      {/* Schema Input Modal */}
      {schemaInputOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Input Schema</div>
                <div className="text-xs text-gray-500">Paste a copied schema JSON to replace the question table</div>
              </div>
              <button onClick={() => { setSchemaInputOpen(false); setSchemaInputError(null); }} className="p-2 rounded hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                Paste the JSON array copied from another exam's <strong>Copy Schema</strong> button.<br />
                Format: <code className="font-mono">[{'{'}title, max_marks, btl_level, co_number, enabled{'}'}]</code>
              </div>
              <textarea
                value={schemaInputText}
                onChange={e => { setSchemaInputText(e.target.value); setSchemaInputError(null); }}
                rows={10}
                placeholder={'[\n  {"title": "Q1", "max_marks": 10, "btl_level": 2, "co_number": 1, "enabled": true},\n  ...\n]'}
                className="w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 resize-none"
                autoFocus
              />
              {schemaInputError && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {schemaInputError}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
              <button
                onClick={() => { setSchemaInputOpen(false); setSchemaInputError(null); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySchema}
                disabled={!schemaInputText.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Apply Schema
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CO Picker Portal */}
      {isCurrentlyEditing && activeCoPickerRow != null && coPickerPos && createPortal(
        <div
          ref={coPickerRef}
          className="fixed z-[80] w-52 rounded-lg border bg-white shadow-lg p-2 text-left"
          style={{ top: `${coPickerPos.top}px`, left: `${coPickerPos.left}px` }}
        >
          <div className="text-[11px] text-gray-500 px-1 pb-1">Select COs</div>
          <div className="max-h-44 overflow-auto space-y-1">
            {coNumbers.map((coNum) => {
              const row = props.localRows[activeCoPickerRow];
              const checked = row ? toCoArray(row.co_number).includes(coNum) : false;
              return (
                <label key={coNum} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const currentRow = props.localRows[activeCoPickerRow];
                      if (!currentRow) return;
                      const current = toCoArray(currentRow.co_number);
                      const next = e.target.checked
                        ? [...current, coNum]
                        : current.filter((n) => n !== coNum);
                      applyCheckedCos(activeCoPickerRow, next);
                      setLocalEditing(true);
                    }}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>CO{coNum}</span>
                </label>
              );
            })}
          </div>
          <div className="pt-2 mt-2 border-t flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                applyCheckedCos(activeCoPickerRow, []);
                setLocalEditing(true);
              }}
              className="text-xs text-red-600 hover:underline"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={closeCoPicker}
              className="text-xs text-blue-600 hover:underline"
            >
              Done
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
