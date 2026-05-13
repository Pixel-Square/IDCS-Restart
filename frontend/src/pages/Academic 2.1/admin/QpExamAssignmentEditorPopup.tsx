import React from 'react';
import { Plus, X, Settings2, GripVertical } from 'lucide-react';
import QpCqiEditorPopup from './QpCqiEditorPopup';

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

  // Exam identity
  selectedExamAssignmentItem: { exam: ExamAssignment; idx: number } | null;
  selectedQpType: string;

  // Question table state (for Mark Manager OFF case)
  localRows: QuestionDef[];
  onAddQuestion: () => void;
  onRemoveQuestion: (idx: number) => void;
  onUpdateRow: (idx: number, field: keyof QuestionDef, value: unknown) => void;
  onOpenQuestionSettings: (idx: number) => void;

  // CQI embedding support
  cqiEditorOpen: boolean; // forwarded state (optional)
  cqiVariables: CqiVar[];
  tokenMeta: (code: string) => { badge: string; badgeClass: string; rowClass: string; tokenClass: string };
  updateCqi: (updater: (prev: NonNullable<ExamAssignment['cqi']>) => NonNullable<ExamAssignment['cqi']>) => void;
  parseIfClauses: (raw: string) => CqiIfClause[];
  buildIfFromClauses: (clauses: CqiIfClause[]) => string;
  appendToken: (current: string, token: string) => string;

  openTokenPicker: (insert: (token: string) => void) => void;

  selectedClassTypeDefaultCoCount: number;
  cycles: CycleOption[];
};

export default function QpExamAssignmentEditorPopup(props: Props) {
  if (!props.open || !props.selectedExamAssignmentItem) return null;

  const exam = props.selectedExamAssignmentItem.exam;
  const isCqi = String(exam.exam || exam.exam_display_name || '').toUpperCase().startsWith('CQI') || exam.kind === 'cqi';

  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4 flex items-start justify-center overflow-auto">
      <div className="w-full max-w-[1200px] bg-white rounded-lg shadow-xl border overflow-hidden mt-10">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Exam Assignment Editor</div>
            <div className="text-xs text-gray-500 truncate">
              {(exam.exam_display_name || exam.exam) ?? exam.exam} · QP Type: {props.selectedQpType}
            </div>
          </div>
          <button onClick={props.onClose} className="p-2 rounded hover:bg-gray-100" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Horizontal layout */}
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
              isEditing={props.isEditing}
              localRows={props.localRows}
              onUpdateRow={props.onUpdateRow}
              onRemoveQuestion={props.onRemoveQuestion}
              onAddQuestion={props.onAddQuestion}
              onOpenQuestionSettings={props.onOpenQuestionSettings}
              cqiVariables={props.cqiVariables}
              tokenMeta={props.tokenMeta as any}
              tokenInsertRequested={false}
              onRequestTokenPicker={(insert) => props.openTokenPicker(insert)}
              updateCqi={props.updateCqi}
              parseIfClauses={props.parseIfClauses as any}
              buildIfFromClauses={props.buildIfFromClauses as any}
              appendToken={props.appendToken}
              selectedClassTypeDefaultCoCount={props.selectedClassTypeDefaultCoCount}
              cycles={props.cycles}
            />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Left: Question Table */}
              <div className="xl:col-span-5">
                <div className="border rounded-lg overflow-hidden bg-white">
                  <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Question Table</div>
                      <div className="text-xs text-gray-500">Edit title/max/BTL/CO</div>
                    </div>
                    {props.isEditing && (
                      <button
                        onClick={props.onAddQuestion}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                      >
                        <Plus className="w-4 h-4" /> Add Row
                      </button>
                    )}
                  </div>

                  <div className="overflow-auto max-h-[560px]">
                    <table className="w-full text-sm table-fixed">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {props.isEditing && <th className="w-8 px-2 py-2 text-gray-400 text-xs font-semibold">#</th>}
                          <th className="w-20 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Enabled</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Question Title</th>
                          <th className="w-24 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Max</th>
                          <th className="w-24 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">BTL</th>
                          <th className="w-56 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">CO</th>
                          <th className="w-14 px-2 py-2" />
                          {props.isEditing && <th className="px-2 py-2 w-8" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {props.localRows.length === 0 ? (
                          <tr>
                            <td className="text-center py-10 text-gray-400" colSpan={8}>
                              No questions yet.
                            </td>
                          </tr>
                        ) : (
                          props.localRows.map((row, idx) => (
                            <tr key={idx} className={`hover:bg-gray-50 ${!row.enabled ? 'opacity-60' : ''}`}>
                              {props.isEditing && (
                                <td className="px-2 py-2 text-center text-gray-300 cursor-grab">
                                  <GripVertical className="w-4 h-4 inline" />
                                </td>
                              )}
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.enabled}
                                  disabled={!props.isEditing}
                                  onChange={(e) => props.onUpdateRow(idx, 'enabled', e.target.checked)}
                                  className="w-4 h-4 accent-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2">
                                {props.isEditing ? (
                                  <input
                                    value={row.title}
                                    onChange={(e) => props.onUpdateRow(idx, 'title', e.target.value)}
                                    className="w-full px-2 py-2 border rounded focus:ring-1 focus:ring-blue-500 text-sm"
                                  />
                                ) : (
                                  <span className="font-medium truncate">{row.title}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {props.isEditing ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={row.max_marks}
                                    onChange={(e) => props.onUpdateRow(idx, 'max_marks', Number(e.target.value))}
                                    className="w-20 px-2 py-2 border rounded text-center focus:ring-1 focus:ring-blue-500 text-sm"
                                  />
                                ) : (
                                  <span className="font-semibold text-gray-700">{row.max_marks}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {/* simplified view; full CO/BTL select will remain as-is in the main file */}
                                {props.isEditing ? (
                                  <input
                                    value={row.btl_level ?? ''}
                                    onChange={(e) => props.onUpdateRow(idx, 'btl_level', e.target.value ? Number(e.target.value) : null)}
                                    className="w-20 px-2 py-2 border rounded text-center focus:ring-1 focus:ring-blue-500 text-sm"
                                  />
                                ) : (
                                  <span className="text-xs text-gray-700">{row.btl_level ? `BT${row.btl_level}` : '—'}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className="text-xs text-gray-700">{Array.isArray(row.co_number) ? row.co_number.map((c) => `CO${c}`).join(', ') : row.co_number ? `CO${row.co_number}` : '—'}</span>
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => props.onOpenQuestionSettings(idx)}
                                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
                                  disabled={!props.isEditing}
                                >
                                  <Settings2 className="w-4 h-4" />
                                </button>
                              </td>
                              {props.isEditing && (
                                <td className="px-2 py-2 text-center">
                                  <button onClick={() => props.onRemoveQuestion(idx)} className="p-1 text-red-500 hover:text-red-700">
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
              </div>

              {/* Right placeholder for weight/mark-manager summary (next step) */}
              <div className="xl:col-span-7">
                <div className="border rounded-lg p-4 bg-white">
                  <div className="text-sm font-semibold text-gray-800 mb-2">Weightage / Settings</div>
                  <div className="text-xs text-gray-500">
                    Next: wire exam weights + mark manager toggles into this popup (your current requirement).
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
