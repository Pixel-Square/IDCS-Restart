import React, { useState } from 'react';
import { Plus, X, Settings2, GripVertical, Copy, ClipboardPaste, Check, AlertTriangle, Save, Trash2, Edit3 } from 'lucide-react';
import QpCqiEditorPopup from './QpCqiEditorPopup';

const BTL_LEVELS = [1, 2, 3, 4, 5, 6];
const CO_NUMBERS = [1, 2, 3, 4, 5];
const CO_COMBINATIONS: number[][] = (() => {
  const result: number[][] = [];
  const gen = (start: number, len: number, current: number[]) => {
    if (current.length === len) { result.push([...current]); return; }
    for (let i = start; i <= 5; i++) gen(i + 1, len, [...current, i]);
  };
  for (let len = 2; len <= 5; len++) gen(1, len, []);
  return result;
})();
const coToSelectVal = (co: number | number[] | null): string => {
  if (co == null) return '';
  if (Array.isArray(co)) return co.join(',');
  return String(co);
};
const selectValToCo = (val: string): number | number[] | null => {
  if (!val) return null;
  if (val.includes(',')) return val.split(',').map(Number);
  return Number(val);
};
const coLabel = (co: number | number[] | null): string => {
  if (co == null) return '—';
  if (Array.isArray(co)) return co.map(c => `CO${c}`).join(' & ');
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

type CqiIfClause = { token: 'BEFORE_CQI' | 'AFTER_CQI' | 'TOTAL_CQI'; rhs: string };

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

  isEditing: boolean;
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

  // CQI embedding support
  cqiEditorOpen: boolean; // forwarded state (optional)
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
  cycles: CycleOption[];
};

export default function QpExamAssignmentEditorPopup(props: Props) {
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [schemaInputOpen, setSchemaInputOpen] = useState(false);
  const [schemaInputText, setSchemaInputText] = useState('');
  const [schemaInputError, setSchemaInputError] = useState<string | null>(null);
  const [localEditing, setLocalEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!props.open || !props.selectedExamAssignmentItem) return null;

  const exam = props.selectedExamAssignmentItem.exam;
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

          {!isCqi && (
            <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={() => { setSchemaInputText(''); setSchemaInputError(null); setSchemaInputOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium"
                title="Paste a copied schema to replace the current question table"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Input Schema
              </button>
            </div>
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
              <button
                onClick={handleSaveClick}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-green-400 bg-green-50 text-green-700 hover:bg-green-100 font-medium disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
              </button>
              {localEditing && (
                <button
                  onClick={() => setLocalEditing(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              )}
            </>
          )}
          {props.onDelete && (
            <button
              onClick={props.onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-medium"
              title="Delete this QP pattern"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}

          <button onClick={props.onClose} className="p-2 rounded hover:bg-gray-200" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {isCqi ? (
            <QpCqiEditorPopup
              open={true}
              onClose={props.onClose}
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
                              <select
                                value={coToSelectVal(row.co_number)}
                                onChange={e => props.onUpdateRow(idx, 'co_number', selectValToCo(e.target.value))}
                                className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">—</option>
                                <optgroup label="Single CO">
                                  {CO_NUMBERS.map(c => <option key={c} value={String(c)}>CO{c}</option>)}
                                </optgroup>
                                <optgroup label="Combination" style={{ background: '#f3e8ff' }}>
                                  {CO_COMBINATIONS.map(combo => {
                                    const val = combo.join(',');
                                    return (
                                      <option key={val} value={val} style={{ background: '#f3e8ff' }}>
                                        {combo.map(c => `CO${c}`).join(' & ')}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              </select>
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
    </div>
  );
}
