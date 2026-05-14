/**
 * QP Pattern Editor Admin Page
 * Rebuilt flow:
 * 1) Select Class Type
 * 2) Select/Create QP Type (name + code)
 * 3) Select/Create Exam Assignment
 * 4) Edit questions (title, marks, CO, BTL)
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, FileText, Edit2, X, RefreshCw, Settings2, Search, ExternalLink, GripVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import fetchWithAuth from '../../../services/fetchAuth';
import QpCqiEditorPopup from './QpCqiEditorPopup';
import QpExamAssignmentEditorPopup from './QpExamAssignmentEditorPopup';

interface QuestionDef {
  title: string;
  max_marks: number;
  btl_level: number | null;
  co_number: number | number[] | null;  // single CO or combination e.g. [1,2]
  enabled: boolean;
  // Settings (extensible)
  special_split?: boolean;
  // Indices (0-based) of source questions included in the formula.
  special_split_sources?: number[];
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
  order?: number;
  pattern: {
    titles?: string[];
    marks?: number[];
    btls?: Array<number | null>;
    cos?: Array<number | null>;
    enabled?: boolean[];
    mark_manager?: MarkManagerConfig | null;
    // Per-question settings (optional; stored alongside titles/marks)
    special_split?: boolean[];
    special_split_sources?: number[][];
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
  total_internal_marks?: number;
  default_co_count?: number;
  exam_assignments?: ExamAssignment[];
  cqi_global_custom_vars?: Array<{ code: string; label?: string; expr: string }>;
  allow_customize_questions?: boolean;
}

interface ExamAssignment {
  exam: string;
  exam_display_name?: string;
  qp_type: string;
  weight: number;  // Legacy - sum of co_weights
  co_weights: Record<string, number>;  // Per-CO weights: { "1": 2.5, "2": 2.5 }
  kind?: 'exam' | 'cqi';
  cqi?: {
    name: string;
    code: string;
    cycle_id?: string;
    cos: number[];
    exams?: string[]; // Selected exam assignment codes to consider; empty/undefined = all
    custom_vars?: Array<{ code: string; label?: string; expr: string }>; // Custom variable tokens
    co_value_expr?: string; // Expression to compute per-CO CQI value for Internal Marks (uses [CQI])
    formula: string;
    conditions: Array<{
      if: string;
      then: string;
      color?: string;
      // UI-only helper to edit AND clauses. Saved alongside without breaking older readers.
      if_clauses?: Array<{ token: 'BEFORE_CQI' | 'AFTER_CQI' | 'TOTAL_CQI'; rhs: string }>;
    }>;
    else_formula: string;
  };
  mark_manager_enabled?: boolean;
  mm_exam_weight?: number; // Used only when Mark Manager "Exam" is checked by faculty
  mm_co_weights_with_exam?: Record<string, number>; // CO weights when faculty uses Mark Manager with Exam
  mm_co_weights_without_exam?: Record<string, number>; // CO weights when faculty uses Mark Manager without Exam
  default_cos: number[];
  customize_questions: boolean;
  enabled?: boolean;
  pass_mark?: number | null; // Optional whole-number pass mark for this exam within its QP type
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

interface CycleOption {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
}

const BTL_LEVELS = [1, 2, 3, 4, 5, 6];
const CO_NUMBERS = [1, 2, 3, 4, 5];

/** All CO combination sets (pairs, triples, quads, all-five) */
const CO_COMBINATIONS: number[][] = (() => {
  const result: number[][] = [];
  const gen = (start: number, len: number, current: number[]) => {
    if (current.length === len) { result.push([...current]); return; }
    for (let i = start; i <= 5; i++) { current.push(i); gen(i + 1, len, current); current.pop(); }
  };
  for (let len = 2; len <= 5; len++) gen(1, len, []);
  return result;
})();

/** Convert a co_number value (single or array) to select option string */
const coToSelectVal = (co: number | number[] | null): string => {
  if (co == null) return '';
  if (Array.isArray(co)) return co.join(',');
  return String(co);
};

/** Parse select option string back to co_number */
const selectValToCo = (val: string): number | number[] | null => {
  if (!val) return null;
  if (val.includes(',')) return val.split(',').map(Number);
  return Number(val);
};

/** Display label for a co_number (single or combination) */
const coLabel = (co: number | number[] | null): string => {
  if (co == null) return '—';
  if (Array.isArray(co)) return co.map(c => `CO${c}`).join(' & ');
  return `CO${co}`;
};

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
  const specialSplit = Array.isArray(p.special_split) ? p.special_split : [];
  const specialSplitSources = Array.isArray(p.special_split_sources) ? p.special_split_sources : [];

  if (titles.length > 0) {
    return titles.map((title, idx) => ({
      title: String(title || `Q${idx + 1}`),
      max_marks: Number(marks[idx] ?? 0) || 0,
      btl_level: btls[idx] == null ? null : Number(btls[idx]),
      co_number: Array.isArray(cos[idx])
        ? (cos[idx] as unknown as number[])
        : (cos[idx] == null ? null : Number(cos[idx])),
      enabled: enabled[idx] ?? true,
      special_split: !!specialSplit[idx],
      special_split_sources: Array.isArray(specialSplitSources[idx])
        ? (specialSplitSources[idx] as unknown as number[]).map((n) => Number(n)).filter((n) => Number.isFinite(n))
        : [],
    }));
  }

  if (Array.isArray(pattern.questions) && pattern.questions.length > 0) {
    return pattern.questions.map((q, idx) => ({
      title: String(q.title || `Q${idx + 1}`),
      max_marks: Number(q.max_marks ?? q.max ?? 0) || 0,
      btl_level: q.btl_level ?? q.btl ?? null,
      co_number: Array.isArray(q.co_number ?? q.co)
        ? (q.co_number ?? q.co) as unknown as number[]
        : ((q.co_number ?? q.co) == null ? null : Number(q.co_number ?? q.co)),
      enabled: q.enabled ?? true,
      // Old shape doesn't store settings; default them off.
      special_split: false,
      special_split_sources: [],
    }));
  }

  return [];
}

function rowsToPattern(rows: QuestionDef[]) {
  return {
    titles: rows.map((r) => r.title),
    marks: rows.map((r) => Number(r.max_marks) || 0),
    btls: rows.map((r) => (r.btl_level == null ? null : Number(r.btl_level))),
    // Preserve arrays for combination COs; single number for single COs
    cos: rows.map((r) => Array.isArray(r.co_number) ? r.co_number : (r.co_number == null ? null : Number(r.co_number))),
    enabled: rows.map((r) => !!r.enabled),
    special_split: rows.map((r) => !!r.special_split),
    special_split_sources: rows.map((r) => Array.isArray(r.special_split_sources) ? r.special_split_sources : []),
  };
}

function toCoSet(co: QuestionDef['co_number']): number[] {
  if (co == null) return [];
  if (Array.isArray(co)) return co.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  const n = Number(co);
  return Number.isFinite(n) ? [n] : [];
}

function uniq(nums: number[]): number[] {
  return Array.from(new Set(nums));
}

function normalizeTypeCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeImplicitTokenSums(input: string) {
  return String(input || '').replace(/\]\s+\[/g, '] + [');
}

function isCqiAssignment(exam: ExamAssignment | null | undefined): boolean {
  if (!exam) return false;
  if (exam.kind === 'cqi') return true;
  const code = String(exam.exam || '').trim().toUpperCase();
  return code === 'CQI' || code.startsWith('CQI');
}

type CqiVar = { code: string; label: string; token: string; kind?: 'base' | 'custom' };

const CQI_TOKEN_SECTION_ORDER = ['custom', 'cqi', 'co_raw', 'co_weight', 'mm_avg', 'exam'] as const;
type CqiTokenSectionKey = typeof CQI_TOKEN_SECTION_ORDER[number];

const CQI_TOKEN_SECTION_META: Record<CqiTokenSectionKey, {
  title: string;
  description: string;
  headerClass: string;
  panelClass: string;
}> = {
  custom: {
    title: 'Custom Variables',
    description: 'Shared reusable formulas available across all QP types in this class type.',
    headerClass: 'bg-indigo-100 text-indigo-700',
    panelClass: 'border-indigo-200 bg-indigo-50/50',
  },
  cqi: {
    title: 'CQI Core',
    description: 'Base CQI inputs and derived CQI totals.',
    headerClass: 'bg-fuchsia-100 text-fuchsia-700',
    panelClass: 'border-fuchsia-200 bg-fuchsia-50/50',
  },
  co_raw: {
    title: 'CO(x) Raw Marks',
    description: 'Per-exam CO raw marks for the currently processed CO.',
    headerClass: 'bg-sky-100 text-sky-700',
    panelClass: 'border-sky-200 bg-sky-50/50',
  },
  co_weight: {
    title: 'CO(x) Weights',
    description: 'Per-exam weighted marks for the currently processed CO.',
    headerClass: 'bg-emerald-100 text-emerald-700',
    panelClass: 'border-emerald-200 bg-emerald-50/50',
  },
  mm_avg: {
    title: 'Mark Manager Averages',
    description: 'Average per enabled Mark Manager item for the current CO.',
    headerClass: 'bg-amber-100 text-amber-800',
    panelClass: 'border-amber-200 bg-amber-50/50',
  },
  exam: {
    title: 'Exam Component',
    description: 'Exam raw mark and configured exam weight when Mark Manager Exam is enabled.',
    headerClass: 'bg-rose-100 text-rose-700',
    panelClass: 'border-rose-200 bg-rose-50/50',
  },
};

function generateCqiVariables(exams: ExamAssignment[], maxCo: number): CqiVar[] {
  const vars: CqiVar[] = [];
  const push = (code: string, label: string, kind: CqiVar['kind'] = 'base') => {
    vars.push({ code, label, token: `[${code}]`, kind });
  };

  // CQI itself (entered/attained value in CQI entry page)
  push('CQI', 'CQI (entered/attained value)');
  push('X', 'Alias for CQI (entered value)');

  // CQI Entry columns
  push('BEFORE_CQI', 'Before CQI (CQI Entry column, raw total)');
  push('AFTER_CQI', 'After CQI (CQI Entry column, raw total)');
  push('TOTAL_CQI', 'Total (CQI Entry column, %)');

  // Current-CO aliases (evaluated for the CO column being processed)
  push('CO-RAW', 'Current CO total (raw)');
  push('CO-WEIGHT', 'Current CO total (weighted %)');
  push('CO-MAX', 'Current CO max (raw)');
  push('CO-TOTAL-RAW', 'Alias for CO-RAW');
  push('CO-TOTAL-WEIGHT', 'Alias for CO-WEIGHT');

  // Overall / per-CO totals
  push('TOTAL-RAW', 'Overall total (raw)');
  push('TOTAL-WEIGHT', 'Overall total (weighted)');

  // COx placeholders (do not generate numbered CO tokens in picker)
  push('COX-TOTAL-RAW', 'CO(x) total (raw) — placeholder for current CO');
  push('COX-TOTAL-WEIGHT', 'CO(x) total (weighted %) — placeholder for current CO');

  // Per-exam variables (CO→EXAM format only: [COX-EXAMCODE-OBT])
  for (const ex of exams) {
    const examCode = normalizeTypeCode(ex.exam_display_name || ex.exam || 'EXAM');
    if (!examCode) continue;
    push(`${examCode}-TOTAL`, `${ex.exam_display_name || ex.exam} CO(x) max (current column)`);
    push(`${examCode}-OBT`, `${ex.exam_display_name || ex.exam} CO(x) obtained (raw, current column)`);
    push(`${examCode}-WEIGHT`, `${ex.exam_display_name || ex.exam} CO(x) weighted mark (current column)`);
    // CO→EXAM format only (removed duplicate EXAM→CO format)
    push(`COX-${examCode}-OBT`, `CO(x) ${ex.exam_display_name || ex.exam} obtained (raw, current column)`);
    push(`COX-${examCode}-WEIGHT`, `CO(x) ${ex.exam_display_name || ex.exam} weighted mark (current column)`);
    // If exam has a Mark Manager, also expose the Mark Manager Exam column as a token
    if (ex.mark_manager_enabled) {
      push(`COX-${examCode}-AVG`, `CO(x) ${ex.exam_display_name || ex.exam} average per Mark Manager item`);
      push(`${examCode}-EXAM-OBT`, `${ex.exam_display_name || ex.exam} Exam (Mark Manager) obtained`);
      push(`${examCode}-EXAM-WEIGHT`, `${ex.exam_display_name || ex.exam} Exam (Mark Manager) weight`);
    }
  }

  return vars;
}

function normalizeCustomVarCode(input: string) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  // Uppercase and allow letters/numbers/underscore/dash. Keep simple single-letter codes working.
  const upper = raw.toUpperCase();
  const cleaned = upper.replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned;
}

function normalizeCustomVarList(values: any): Array<{ code: string; label?: string; expr: string }> {
  if (!Array.isArray(values)) return [];
  return values
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      code: normalizeCustomVarCode(item.code),
      label: item.label == null ? '' : String(item.label || ''),
      expr: String(item.expr || ''),
    }))
    .filter((item) => item.code || item.label || item.expr);
}

function getCqiTokenSection(variable: CqiVar): CqiTokenSectionKey {
  const code = String(variable.code || '').toUpperCase();
  if (variable.kind === 'custom') return 'custom';
  if (code === 'CQI' || code === 'X' || code === 'BEFORE_CQI' || code === 'AFTER_CQI' || code === 'TOTAL_CQI') return 'cqi';
  if (/-EXAM-(OBT|WEIGHT)$/.test(code)) return 'exam';
  if (/-AVG$/.test(code)) return 'mm_avg';
  if (/(^|-)WEIGHT$/.test(code) || /-WEIGHT$/.test(code)) return 'co_weight';
  return 'co_raw';
}

export default function QpPatternEditorPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [qpTypes, setQpTypes] = useState<QpType[]>([]);
  const [patterns, setPatterns] = useState<QpPattern[]>([]);
  const [allExamAssignments, setAllExamAssignments] = useState<QpPattern[]>([]);
  const [cycles, setCycles] = useState<CycleOption[]>([]);
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

  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [tokenPickerSearch, setTokenPickerSearch] = useState('');
  const tokenInsertRef = React.useRef<null | { insert: (token: string) => void }>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { object_type: 'qp_type' | 'qp_pattern'; id: string; label: string }
    | null
  >(null);

  const [localName, setLocalName] = useState('');
  const [localRows, setLocalRows] = useState<QuestionDef[]>([]);
  const [markManager, setMarkManager] = useState<MarkManagerConfig>(getDefaultMarkManager());
  const [isDirty, setIsDirty] = useState(false);
  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [addExamSearch, setAddExamSearch] = useState('');

  // Horizontal editor popup (for exam assignment click/open)
  const [examEditorModalOpen, setExamEditorModalOpen] = useState(false);

  // Horizontal CQI editor popup (dedicated UI, includes question table, hides Mark Manager)
  const [cqiEditorModalOpen, setCqiEditorModalOpen] = useState(false);

  // Question settings popup
  const [questionSettingsOpen, setQuestionSettingsOpen] = useState(false);
  const [settingsQuestionIndex, setSettingsQuestionIndex] = useState<number | null>(null);

  // Exam assignments (weights) live on ClassType config
  const [localExamAssignments, setLocalExamAssignments] = useState<ExamAssignment[]>([]);
  const [examAssignmentsDirty, setExamAssignmentsDirty] = useState(false);
  const [globalCqiCustomVars, setGlobalCqiCustomVars] = useState<Array<{ code: string; label?: string; expr: string }>>([]);
  const [savingGlobalCqiCustomVars, setSavingGlobalCqiCustomVars] = useState(false);

  const cqiConfigRef = React.useRef<HTMLDivElement | null>(null);

  const markDirty = () => setIsDirty(true);
  const markExamDirty = () => setExamAssignmentsDirty(true);

  const selectedClassType = classTypes.find((ct) => ct.id === selectedClassTypeId) || null;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [classTypeRes, qpTypeRes, patternRes, cycleRes] = await Promise.all([
        fetchWithAuth('/api/academic-v2/class-types/'),
        fetchWithAuth('/api/academic-v2/qp-types/'),
        fetchWithAuth('/api/academic-v2/qp-patterns/'),
        fetchWithAuth('/api/academic-v2/cycles/'),
      ]);

      if (!classTypeRes.ok || !patternRes.ok) throw new Error('Failed to load');

      const classTypeData = await classTypeRes.json();
      const qpTypeData = qpTypeRes.ok ? await qpTypeRes.json() : { results: [] };
      const patternData = await patternRes.json();
      const cycleData = cycleRes.ok ? await cycleRes.json() : { results: [] };
      
      const classTypeList = Array.isArray(classTypeData) ? classTypeData : (classTypeData.results || []);
      const qpTypeList = Array.isArray(qpTypeData) ? qpTypeData : (qpTypeData.results || []);
      const patternList = Array.isArray(patternData) ? patternData : (patternData.results || []);
      const cycleList = Array.isArray(cycleData) ? cycleData : (cycleData.results || []);

      // Exam templates are patterns with class_type = null (created in Exam Assignment Admin)
      const examTemplates = patternList.filter((p: any) => p.class_type === null || p.class_type === undefined);
      
      setClassTypes(classTypeList);
      setQpTypes(qpTypeList);
      setPatterns(patternList);
      setAllExamAssignments(examTemplates);
      setCycles(cycleList);

      if (!selectedClassTypeId && classTypeList.length > 0) {
        setSelectedClassTypeId(classTypeList[0].id);
      }
      
      console.log('✅ Loaded data:', {
        classTypes: classTypeList.length,
        qpTypes: qpTypeList.length,
        patterns: patternList.length,
        exams: examTemplates.length,
        cycles: cycleList.length,
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
    // Show exam templates (patterns with class_type = null) for selection
    // IMPORTANT: exam templates store their own `qp_type` as an exam-code (CAT1/CIA_1/etc),
    // which is NOT the same as the selected QP Type (WD/SS/etc). So do NOT filter by selectedQpType.
    return (Array.isArray(allExamAssignments) ? allExamAssignments : [])
      .map((e) => ({
        id: e.id,
        exam: String(e.qp_type || ''),
        exam_display_name: String(e.name || ''),
        qp_type: String(e.qp_type || ''),
        pattern: e.pattern,
        default_weight: Number((e as any).default_weight ?? 0) || 0,
      }))
      .filter((e) => !!e.exam_display_name)
      .sort((a, b) => a.exam_display_name.localeCompare(b.exam_display_name));
  }, [allExamAssignments]);

  const openDeleteModal = (payload: { object_type: 'qp_type' | 'qp_pattern'; id: string; label: string }) => {
    setPendingDelete(payload);
    setDeletePassword('');
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const executeSecureDelete = async () => {
    if (!pendingDelete) return;
    if (!deletePassword.trim()) {
      setDeleteError('Password is required');
      return;
    }
    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      const res = await fetchWithAuth('/api/academic-v2/admin/secure-delete/', {
        method: 'POST',
        body: JSON.stringify({
          object_type: pendingDelete.object_type,
          id: pendingDelete.id,
          password: deletePassword,
        }),
      });

      if (!res.ok) {
        let msg = 'Delete failed';
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

      // Capture before setPendingDelete clears the ref
      const deletedType = pendingDelete.object_type;
      const deletedLabel = pendingDelete.label;
      setPendingDelete(null);

      // For qp_pattern: FIRST remove exam assignment from ClassType JSON,
      // THEN reload — so the useEffect doesn't re-insert the stale entry.
      if (deletedType === 'qp_pattern' && selectedClassTypeId) {
        const patternKey = normalizeExamDisplayKey(deletedLabel);
        const nextAssignments = localExamAssignments.filter(e =>
          normalizeExamDisplayKey(e.exam_display_name || e.exam || '') !== patternKey
        );
        await fetchWithAuth(`/api/academic-v2/class-types/${selectedClassTypeId}/`, {
          method: 'PATCH',
          body: JSON.stringify({ exam_assignments: nextAssignments }),
        });
      }

      await loadData();

      if (deletedType === 'qp_pattern') {
        setSelectedPatternId(null);
        setSelectedExamRef(null);
      }
      if (deletedType === 'qp_type') {
        setSelectedQpType('');
        setSelectedPatternId(null);
        setSelectedExamRef(null);
      }

      setMessage({ type: 'success', text: 'Deleted successfully' });
    } catch (e: any) {
      setDeleteError(e?.message || 'Delete failed');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const normalizeExamDisplayKey = (s: string) => String(s || '').trim().toLowerCase();

  const selectedExamTemplate = React.useMemo(() => {
    if (!selectedExamRef?.id) return null;
    const tpl = (Array.isArray(allExamAssignments) ? allExamAssignments : []).find((p) => String(p.id) === String(selectedExamRef.id));
    return tpl || null;
  }, [selectedExamRef, allExamAssignments]);

  const deriveCosFromTemplate = (tpl: { pattern?: any } | null | undefined) => {
    let derivedCos: number[] = [1, 2, 3, 4, 5];
    const p = tpl?.pattern;
    if (p && Array.isArray(p.cos)) {
      const enabled = Array.isArray(p.enabled) ? p.enabled : p.cos.map(() => true);
      const uniqueCos = new Set<number>();
      p.cos.forEach((co: any, i: number) => {
        if (co != null && typeof co === 'number' && (i < enabled.length ? enabled[i] : true)) {
          uniqueCos.add(co);
        }
      });
      if (uniqueCos.size > 0) derivedCos = [...uniqueCos].sort((a, b) => a - b);
    }
    return derivedCos;
  };

  const normalizeExamAssignmentsForEditing = React.useCallback((raw: any[], templates: QpPattern[]) => {
    const safeList = Array.isArray(raw) ? raw : [];
    const normalized = safeList.map((ex) => {
      const exam = String(ex.exam ?? ex.qp_type ?? '').trim();
      const qpType = String(ex.qp_type ?? exam).trim();
      const examDisplayName = String(ex.exam_display_name ?? ex.exam_title ?? exam).trim();

      const kind: 'exam' | 'cqi' = (String(ex.kind || '').toLowerCase() === 'cqi' || String(exam || '').trim().toUpperCase().startsWith('CQI'))
        ? 'cqi'
        : 'exam';

      const tpl = templates.find(t => {
        const nm = normalizeExamDisplayKey(String((t as any).name || ''));
        return nm && (nm === normalizeExamDisplayKey(examDisplayName) || nm === normalizeExamDisplayKey(exam));
      }) || null;
      const detectedMm = !!tpl?.pattern?.mark_manager?.enabled;
      const isMm = kind === 'exam' && (ex.mark_manager_enabled ?? detectedMm) === true;

      const derivedCos = Array.isArray(ex.default_cos) && ex.default_cos.length > 0
        ? ex.default_cos.map((c: any) => Number(c)).filter((n: number) => !Number.isNaN(n))
        : deriveCosFromTemplate(tpl);

      const defaultWeight = Number(ex.weight ?? 0) || 0;

      const baseCoWeights: Record<string, number> = { ...(ex.co_weights || {}) };
      derivedCos.forEach(co => {
        const k = String(co);
        if (baseCoWeights[k] == null) baseCoWeights[k] = 0;
      });

      // Always initialize Mark Manager fields for all exams (even if not enabled)
      const base = baseCoWeights;
      const mmWith = { ...(ex.mm_co_weights_with_exam || {}) };
      const mmWithout = { ...(ex.mm_co_weights_without_exam || {}) };
      derivedCos.forEach(co => {
        const k = String(co);
        if (mmWith[k] == null) mmWith[k] = base[k] ?? 0;
        if (mmWithout[k] == null) mmWithout[k] = base[k] ?? 0;
      });
      const mmExamWeight = Number(ex.mm_exam_weight) || 0;
      const mmWithSum = Object.values(mmWith).reduce((s: number, w: any) => s + (Number(w) || 0), 0);
      const withTotal = (mmWithSum as number) + mmExamWeight;
      const coSum = Object.values(base).reduce((s: number, w: any) => s + (Number(w) || 0), 0) as number;

      const rawCqi = ex.cqi && typeof ex.cqi === 'object' ? ex.cqi : null;
      const cqi = rawCqi
        ? {
            name: String(rawCqi.name || ''),
            code: String(rawCqi.code || ''),
            cos: Array.isArray(rawCqi.cos) ? rawCqi.cos.map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n)) : [],
            exams: Array.isArray(rawCqi.exams) ? rawCqi.exams.map((x: any) => String(x || '')).filter(Boolean) : [],
            custom_vars: Array.isArray(rawCqi.custom_vars)
              ? rawCqi.custom_vars
                  .filter((v: any) => v && typeof v === 'object')
                  .map((v: any) => ({
                    code: String(v.code || ''),
                    label: v.label == null ? '' : String(v.label || ''),
                    expr: String(v.expr || ''),
                  }))
              : [],
            co_value_expr: String(rawCqi.co_value_expr || ''),
            formula: String(rawCqi.formula || ''),
            conditions: Array.isArray(rawCqi.conditions)
              ? rawCqi.conditions
                  .filter((c: any) => c && typeof c === 'object')
                  .map((c: any) => {
                    const parsedClauses = Array.isArray(c.if_clauses)
                      ? c.if_clauses
                          .filter((cl: any) => cl && typeof cl === 'object')
                          .map((cl: any) => ({
                            token: String(cl.token || '').toUpperCase() as CqiIfClause['token'],
                            rhs: String(cl.rhs || ''),
                          }))
                          .filter((cl: any) => CQI_CLAUSE_TOKENS.includes(cl.token))
                      : parseIfClauses(String(c.if || ''));
                    return {
                      if: String(c.if || ''),
                      then: String(c.then || ''),
                      color: c.color == null ? undefined : String(c.color || ''),
                      if_clauses: parsedClauses,
                    };
                  })
              : [],
            else_formula: String(rawCqi.else_formula || ''),
          }
        : undefined;
      return {
        exam,
        exam_display_name: examDisplayName,
        qp_type: qpType,
        kind,
        cqi,
        weight: kind === 'cqi' ? 0 : (isMm ? (withTotal || defaultWeight) : (coSum || defaultWeight)),
        co_weights: kind === 'cqi' ? {} : base,
        mark_manager_enabled: kind === 'cqi' ? false : isMm,
        mm_exam_weight: mmExamWeight,
        mm_co_weights_with_exam: mmWith,
        mm_co_weights_without_exam: mmWithout,
        default_cos: kind === 'cqi' && cqi?.cos?.length ? cqi.cos : derivedCos,
        customize_questions: !!ex.customize_questions,
        enabled: ex.enabled !== false,
        pass_mark: ex.pass_mark != null ? Number(ex.pass_mark) : null,
      } satisfies ExamAssignment;
    });
    // Deduplicate: keep only the first occurrence of each qp_type + exam_display_name pair
    const seen = new Set<string>();
    return normalized.filter(e => {
      const key = `${String(e.qp_type || '').trim()}:${normalizeExamDisplayKey(e.exam_display_name || e.exam || '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  // Load + normalise selected class type exam assignments
  useEffect(() => {
    if (!selectedClassType) {
      setLocalExamAssignments([]);
      setGlobalCqiCustomVars([]);
      setExamAssignmentsDirty(false);
      return;
    }
    const normalized = normalizeExamAssignmentsForEditing(
      (selectedClassType.exam_assignments as any[]) || [],
      patterns.filter(p => p.class_type == null)
    );
    setLocalExamAssignments(normalized);
    setGlobalCqiCustomVars(normalizeCustomVarList(selectedClassType.cqi_global_custom_vars));
    setExamAssignmentsDirty(false);
  }, [selectedClassType, patterns]);

  const visibleExamAssignmentItems = React.useMemo(() => {
    const target = String(selectedQpType || '').trim();
    if (!target) return [] as Array<{ idx: number; exam: ExamAssignment }>;
    return (localExamAssignments || [])
      .map((exam, idx) => ({ exam, idx }))
      .filter(({ exam }) => String(exam.qp_type || '').trim() === target);
  }, [localExamAssignments, selectedQpType]);

  const selectedExamAssignmentItem = React.useMemo(() => {
    if (!selectedExamRef) return null as null | { idx: number; exam: ExamAssignment };
    const key = normalizeExamDisplayKey(String(selectedExamRef.exam_display_name || selectedExamRef.exam || ''));
    if (!key) return null;
    return (
      (visibleExamAssignmentItems || []).find(({ exam }) => {
        const examKey = normalizeExamDisplayKey(String(exam.exam_display_name || exam.exam || ''));
        return examKey === key;
      }) || null
    );
  }, [selectedExamRef, visibleExamAssignmentItems]);

  const selectedIsCqi = React.useMemo(() => {
    return !!selectedExamAssignmentItem?.exam && isCqiAssignment(selectedExamAssignmentItem.exam);
  }, [selectedExamAssignmentItem]);

  const orderedExamSidebarItems = React.useMemo(() => {
    if (!selectedClassTypeId || !selectedQpType) {
      return [] as Array<{ exam: ExamAssignment; pattern: QpPattern | null; visibleIndex: number }>;
    }

    const classPatterns = patterns
      .filter((p) => p.is_active !== false)
      .filter((p) => p.class_type === selectedClassTypeId)
      .filter((p) => String(p.qp_type || '') === selectedQpType);

    return visibleExamAssignmentItems.map(({ exam }, visibleIndex) => {
      const examKey = normalizeExamDisplayKey(exam.exam_display_name || exam.exam || '');
      const matchedPattern = classPatterns
        .filter((p) => normalizeExamDisplayKey(String(p.name || '')) === examKey)
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0] || null;

      return { exam, pattern: matchedPattern, visibleIndex };
    });
  }, [selectedClassTypeId, selectedQpType, patterns, visibleExamAssignmentItems]);

  const visibleExamAssignments = React.useMemo(() => {
    return visibleExamAssignmentItems.map((x) => x.exam);
  }, [visibleExamAssignmentItems]);

  const totalWeight = React.useMemo(() => {
    return (visibleExamAssignments || []).reduce((sum, exam) => {
      if (isCqiAssignment(exam)) return sum;
      if (exam.mark_manager_enabled) {
        const withCo = exam.mm_co_weights_with_exam || {};
        const withTotal = Object.values(withCo).reduce((s, w) => s + (Number(w) || 0), 0) + (Number(exam.mm_exam_weight) || 0);
        return sum + (withTotal || exam.weight || 0);
      }
      const coWeights = exam.co_weights || {};
      const examTotal = Object.values(coWeights).reduce((s, w) => s + (Number(w) || 0), 0);
      return sum + (examTotal || exam.weight || 0);
    }, 0);
  }, [visibleExamAssignments]);

  const addNewCqiAssignment = () => {
    const targetQpType = String(selectedQpType || '').trim();
    if (!targetQpType) return;

    const maxCo = Number(selectedClassType?.default_co_count ?? 5) || 5;
    const defaultCos = Array.from({ length: maxCo }, (_, i) => i + 1);

    const nextNumber = (visibleExamAssignmentItems || []).filter((x) => isCqiAssignment(x.exam)).length + 1;
    const examCode = `CQI${nextNumber}`;
    const examDisplayName = `CQI ${nextNumber}`;

    setLocalExamAssignments((prev) => {
      return [
        ...prev,
        {
          exam: examCode,
          exam_display_name: examDisplayName,
          qp_type: targetQpType,
          kind: 'cqi',
          weight: 0,
          co_weights: {},
          mark_manager_enabled: false,
          mm_exam_weight: 0,
          mm_co_weights_with_exam: {},
          mm_co_weights_without_exam: {},
          default_cos: defaultCos,
          customize_questions: false,
          enabled: true,
          cqi: {
            name: '',
            code: '',
            cycle_id: '',
            cos: defaultCos,
            formula: '',
            conditions: [],
            else_formula: '',
          },
        },
      ];
    });
    markExamDirty();
    setTimeout(() => {
      cqiConfigRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    setSelectedPatternId(null);
    setSelectedExamRef({ exam: examCode, exam_display_name: examDisplayName, qp_type: targetQpType, id: null });
  };

  const cqiVariables = React.useMemo(() => {
    const maxCo = Number(selectedClassType?.default_co_count ?? 5) || 5;
    const baseExams = (visibleExamAssignments || []).filter((e) => !isCqiAssignment(e));
    const baseVars = generateCqiVariables(baseExams, maxCo);
    const sharedCustom = normalizeCustomVarList(globalCqiCustomVars)
      .filter((v) => v && typeof v === 'object')
      .map((v: any) => {
        const code = normalizeCustomVarCode(v.code);
        if (!code) return null;
        const label = String(v.label || '').trim() || code;
        return { code, token: `[${code}]`, label: `Custom variable — ${label}`, kind: 'custom' as const };
      })
      .filter(Boolean) as CqiVar[];
    const legacyCustom = (selectedExamAssignmentItem?.exam?.cqi?.custom_vars || [])
      .filter((v) => v && typeof v === 'object')
      .map((v: any) => {
        const code = normalizeCustomVarCode(v.code);
        if (!code) return null;
        const label = String(v.label || '').trim() || code;
        return { code, token: `[${code}]`, label: `Legacy custom variable — ${label}`, kind: 'custom' as const };
      })
      .filter((v) => !!v && !sharedCustom.some((s) => s.code === v.code)) as CqiVar[];
    return [...sharedCustom, ...legacyCustom, ...baseVars];
  }, [visibleExamAssignments, selectedClassType, selectedExamAssignmentItem?.exam?.cqi?.custom_vars, globalCqiCustomVars]);

  const groupedCqiVariables = React.useMemo(() => {
    return CQI_TOKEN_SECTION_ORDER.map((sectionKey) => ({
      key: sectionKey,
      meta: CQI_TOKEN_SECTION_META[sectionKey],
      items: cqiVariables.filter((variable) => getCqiTokenSection(variable) === sectionKey),
    })).filter((section) => section.items.length > 0);
  }, [cqiVariables]);

  const updateCqi = (updater: (prev: NonNullable<ExamAssignment['cqi']>) => NonNullable<ExamAssignment['cqi']>) => {
    if (!selectedExamAssignmentItem || !selectedIsCqi) return;
    const originalIndex = selectedExamAssignmentItem.idx;
    setLocalExamAssignments((prev) => {
      const next = [...prev];
      const cur = next[originalIndex];
      const baseCqi: NonNullable<ExamAssignment['cqi']> = cur.cqi || {
        name: '',
        code: '',
        cycle_id: '',
        cos: [],
        formula: '',
        conditions: [],
        else_formula: '',
      };
      const updated = updater(baseCqi);
      next[originalIndex] = {
        ...cur,
        kind: 'cqi',
        cqi: updated,
        default_cos: updated.cos,
      };
      return next;
    });
    markExamDirty();
  };

  const updateGlobalCqiCustomVars = (updater: (prev: Array<{ code: string; label?: string; expr: string }>) => Array<{ code: string; label?: string; expr: string }>) => {
    setGlobalCqiCustomVars((prev) => normalizeCustomVarList(updater(prev)));
  };

  const saveGlobalCqiCustomVars = async () => {
    if (!selectedClassTypeId) return;
    setSavingGlobalCqiCustomVars(true);
    try {
      const normalized = normalizeCustomVarList(globalCqiCustomVars);
      const res = await fetchWithAuth(`/api/academic-v2/class-types/${selectedClassTypeId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ cqi_global_custom_vars: normalized }),
      });
      if (!res.ok) throw new Error('Failed to save shared custom variables');
      const updated = await res.json();
      setClassTypes((prev) => prev.map((ct) => (ct.id === selectedClassTypeId ? { ...ct, ...updated } : ct)));
      setGlobalCqiCustomVars(normalizeCustomVarList((updated as any)?.cqi_global_custom_vars || normalized));
      setMessage({ type: 'success', text: 'Shared CQI custom variables saved' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to save shared CQI custom variables' });
    } finally {
      setSavingGlobalCqiCustomVars(false);
    }
  };

  const tokenMeta = React.useCallback((code: string) => {
    const c = String(code || '').toUpperCase();

    // CQI / X
    if (c === 'CQI' || c === 'X' || c === 'BEFORE_CQI' || c === 'AFTER_CQI' || c === 'TOTAL_CQI') {
      return {
        group: 'CQI',
        badge: c,
        badgeClass: 'bg-purple-100 text-purple-700',
        rowClass: 'bg-purple-50',
        tokenClass: 'text-purple-700 font-semibold',
      };
    }

    // Current-CO aliases
    if (c === 'CO-RAW' || c === 'CO-WEIGHT' || c === 'CO-MAX' || c === 'CO-TOTAL-RAW' || c === 'CO-TOTAL-WEIGHT') {
      return {
        group: 'CO',
        badge: 'CO',
        badgeClass: 'bg-blue-100 text-blue-700',
        rowClass: 'bg-blue-50',
        tokenClass: 'text-blue-800',
      };
    }

    // Overall totals
    if (c === 'TOTAL-RAW' || c === 'TOTAL-WEIGHT') {
      return {
        group: 'TOTAL',
        badge: 'TOTAL',
        badgeClass: 'bg-gray-100 text-gray-700',
        rowClass: '',
        tokenClass: 'text-gray-800',
      };
    }

    if (/-EXAM-(OBT|WEIGHT)$/.test(c)) {
      return {
        group: 'EXAM PART',
        badge: 'EXAM',
        badgeClass: 'bg-rose-100 text-rose-700',
        rowClass: 'bg-rose-50',
        tokenClass: 'text-rose-800',
      };
    }

    if (/-AVG$/.test(c)) {
      return {
        group: 'MM AVG',
        badge: 'MM AVG',
        badgeClass: 'bg-amber-100 text-amber-800',
        rowClass: 'bg-amber-50',
        tokenClass: 'text-amber-900',
      };
    }

    // CO-first alias: CO1-SSA1-RAW / COx-SSA1-OBT / etc.
    if (/^CO(\d+|X)-.*-(RAW|WEIGHT|TOTAL|OBT|DIFF)$/.test(c)) {
      return {
        group: 'CO→EXAM',
        badge: c.endsWith('-WEIGHT') ? 'CO WT' : 'CO RAW',
        badgeClass: c.endsWith('-WEIGHT') ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700',
        rowClass: c.endsWith('-WEIGHT') ? 'bg-emerald-50' : 'bg-sky-50',
        tokenClass: c.endsWith('-WEIGHT') ? 'text-emerald-800' : 'text-sky-800',
      };
    }

    // Exam-first: SSA1-CO1-RAW / SSA1-COx-OBT / SSA1-TOTAL / SSA1-OBT / SSA1-WEIGHT
    if (/-CO(\d+|X)-(RAW|WEIGHT|TOTAL|OBT|DIFF)$/.test(c) || /-(TOTAL|OBT|WEIGHT|DIFF)$/.test(c)) {
      return {
        group: 'EXAM',
        badge: c.endsWith('-WEIGHT') ? 'CO WT' : 'CO RAW',
        badgeClass: c.endsWith('-WEIGHT') ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700',
        rowClass: c.endsWith('-WEIGHT') ? 'bg-emerald-50' : 'bg-sky-50',
        tokenClass: c.endsWith('-WEIGHT') ? 'text-emerald-800' : 'text-sky-800',
      };
    }

    // Per-CO totals: CO1-TOTAL-RAW / CO1-TOTAL-WEIGHT
    if (/^CO\d+-TOTAL-(RAW|WEIGHT)$/.test(c)) {
      return {
        group: 'CO TOTAL',
        badge: 'CO',
        badgeClass: 'bg-blue-100 text-blue-700',
        rowClass: '',
        tokenClass: 'text-gray-800',
      };
    }

    return {
      group: 'VAR',
      badge: 'VAR',
      badgeClass: 'bg-gray-100 text-gray-600',
      rowClass: '',
      tokenClass: 'text-gray-800',
    };
  }, []);

  const openTokenPicker = (insert: (token: string) => void) => {
    tokenInsertRef.current = { insert };
    setTokenPickerSearch('');
    setTokenPickerOpen(true);
  };

  const appendToken = (current: string, token: string) => {
    const base = String(current || '');
    if (!base.trim()) return token;
    if (token.startsWith(' ')) return `${base}${token}`;
    // In CQI formulas, consecutive inserted tokens usually mean addition.
    if (/\][\s]*$/.test(base) && /^\[/.test(token)) return `${base} + ${token}`;
    if (base.endsWith(' ')) return `${base}${token}`;
    return `${base} ${token}`;
  };

  const validateExpression = (
    expr: string,
    opts?: { label?: string; requireComparator?: boolean; allowedTokens?: Set<string> }
  ): string | null => {
    const text = String(expr || '').trim();
    const label = opts?.label || 'Expression';
    if (!text) return null;

    // Basic character allow-list (numbers, identifiers, tokens, math + comparisons)
    const invalidChar = text.match(/[^0-9A-Za-z_\-\[\]\(\)\s\+\*\/%\.<>=!;,|&]/);
    if (invalidChar) return `${label}: invalid character "${invalidChar[0]}"`;

    // Bracket/parenthesis balance checks
    const stack: string[] = [];
    for (const ch of text) {
      if (ch === '(' || ch === '[') stack.push(ch);
      if (ch === ')') {
        const top = stack.pop();
        if (top !== '(') return `${label}: mismatched parentheses`;
      }
      if (ch === ']') {
        const top = stack.pop();
        if (top !== '[') return `${label}: mismatched token brackets`;
      }
    }
    if (stack.length) return `${label}: unclosed "${stack[stack.length - 1]}"`;

    if (opts?.requireComparator) {
      const hasComp = /(>=|<=|==|!=|>|<|=)/.test(text);
      if (!hasComp) return `${label}: must include a comparator (=, >, <, >=, <=, ==, !=)`;
    }

    const tokens = text.match(/\[[^\]]+\]/g) || [];
    if (opts?.allowedTokens) {
      const isKnownDynamicToken = (wrapped: string) => {
        const key = String(wrapped || '').slice(1, -1).trim().toUpperCase();
        if (!key) return false;
        // Allow legacy numbered CO tokens even if hidden from picker.
        if (/^CO\d+-TOTAL-(RAW|WEIGHT)$/.test(key)) return true;
        if (/^CO\d+-[A-Z0-9_]+-(RAW|WEIGHT|TOTAL|OBT|DIFF)$/.test(key)) return true;
        if (/^[A-Z0-9_]+-CO\d+-(RAW|WEIGHT|TOTAL|OBT|DIFF)$/.test(key)) return true;
        return false;
      };
      for (const token of tokens) {
        if (!opts.allowedTokens.has(token) && !isKnownDynamicToken(token)) return `${label}: unknown token ${token}`;
      }
    }

    return null;
  };

  const appendAnd = (current: string) => {
    const base = String(current || '');
    if (!base.trim()) return '';
    if (base.trim().endsWith('&&') || base.trim().endsWith('||')) return base;
    if (base.endsWith(' ')) return `${base}&& `;
    return `${base} && `;
  };

  type CqiIfClause = { token: 'BEFORE_CQI' | 'AFTER_CQI' | 'TOTAL_CQI'; rhs: string };
  const CQI_CLAUSE_TOKENS: Array<CqiIfClause['token']> = ['BEFORE_CQI', 'AFTER_CQI', 'TOTAL_CQI'];

  const parseIfClauses = (raw: string): CqiIfClause[] => {
    const s = String(raw || '').trim();
    if (!s) return [{ token: 'BEFORE_CQI', rhs: '' }];
    const parts = s.split(/\s*(?:&&|\bAND\b)\s*/i).map((p) => String(p || '').trim()).filter(Boolean);
    const clauses: CqiIfClause[] = [];
    for (const p of parts) {
      const m = p.match(/^\(?\s*\[([A-Za-z0-9_-]+)\]\s*(.*)\)?$/);
      if (m) {
        const tok = String(m[1] || '').toUpperCase();
        const rhs = String(m[2] || '').trim();
        if (tok === 'BEFORE_CQI' || tok === 'AFTER_CQI' || tok === 'TOTAL_CQI') {
          clauses.push({ token: tok as CqiIfClause['token'], rhs });
          continue;
        }
      }
      clauses.push({ token: 'BEFORE_CQI', rhs: p });
    }
    if (!clauses.length || clauses[0].token !== 'BEFORE_CQI') clauses.unshift({ token: 'BEFORE_CQI', rhs: '' });
    return clauses;
  };

  const buildIfFromClauses = (clauses: CqiIfClause[]): string => {
    const list = (Array.isArray(clauses) ? clauses : []).filter((c) => c && c.token);
    if (!list.length) return '';
    return list
      .map((c, idx) => {
        const rhs = normalizeImplicitTokenSums(String(c.rhs || '').trim());
        if (!rhs) return '';
        if (idx === 0 && c.token === 'BEFORE_CQI') {
          const isComparatorOnly = /^(<=|>=|==|!=|=|<|>)/.test(rhs);
          return isComparatorOnly ? `([${c.token}] ${rhs})` : `(${rhs})`;
        }
        return `([${c.token}] ${rhs})`;
      })
      .filter(Boolean)
      .join(' && ');
  };

  const hasAssignmentTask = (text: string) => {
    const s = String(text || '');
    // Must contain an '=' that is not part of a comparator (==, !=, <=, >=)
    return /(^|[^!<>=])=([^=]|$)/.test(s);
  };

  const validateAllCqiBeforeSave = (): string | null => {
    const baseAllowedTokens = new Set((cqiVariables || []).filter((v) => v.kind !== 'custom').map((v) => v.token));
    const targetQpType = String(selectedQpType || '').trim();
    const cqis = (localExamAssignments || []).filter((e) => isCqiAssignment(e) && String(e.qp_type || '').trim() === targetQpType);
    for (const exam of cqis) {
      const title = exam.cqi?.name || exam.exam_display_name || exam.exam || 'CQI';

      const base = exam.cqi;
      if (!base) continue;

      // Custom variables
      const sharedCustomList = normalizeCustomVarList(globalCqiCustomVars);
      const customList = Array.isArray(base.custom_vars) ? base.custom_vars : [];
      const seenCodes = new Set<string>();
      const sharedSeenCodes = new Set<string>();

      for (let i = 0; i < sharedCustomList.length; i++) {
        const cv = sharedCustomList[i] as any;
        const code = normalizeCustomVarCode(cv?.code);
        const label = String(cv?.label || '').trim();
        const expr = String(cv?.expr || '').trim();
        if (!code && !label && !expr) continue;
        if (!code) return `Shared custom variable ${i + 1}: token code is required`;
        if (sharedSeenCodes.has(code)) return `Shared custom variable ${i + 1}: duplicate token code [${code}]`;
        if (baseAllowedTokens.has(`[${code}]`)) return `Shared custom variable ${i + 1}: token code [${code}] conflicts with an existing token`;
        const allowedForExpr = new Set<string>([
          ...Array.from(baseAllowedTokens),
          ...Array.from(sharedSeenCodes).map((c) => `[${c}]`),
        ]);
        if (!expr) return `Shared custom variable ${i + 1} ([${code}]): expression is required`;
        const errExpr = validateExpression(expr, {
          label: `Shared custom variable ${i + 1} ([${code}])`,
          allowedTokens: allowedForExpr,
        });
        if (errExpr) return errExpr;
        sharedSeenCodes.add(code);
      }

      // For IF/THEN/ELSE we allow base tokens + all custom tokens.
      const allCustomTokens: string[] = [];
      for (const code of Array.from(sharedSeenCodes)) allCustomTokens.push(`[${code}]`);
      for (let i = 0; i < customList.length; i++) {
        const cv = customList[i] as any;
        const code = normalizeCustomVarCode(cv?.code);
        if (!code) continue;
        allCustomTokens.push(`[${code}]`);
      }
      const allowedTokens = new Set<string>([...Array.from(baseAllowedTokens), ...allCustomTokens]);

      // Validate each custom var; allow referencing previous custom vars only.
      for (let i = 0; i < customList.length; i++) {
        const cv = customList[i] as any;
        const code = normalizeCustomVarCode(cv?.code);
        const label = String(cv?.label || '').trim();
        const expr = String(cv?.expr || '').trim();
        if (!code && !label && !expr) continue;
        if (!code) return `${title} · Custom variable ${i + 1}: token code is required`;
        if (seenCodes.has(code) || sharedSeenCodes.has(code)) return `${title} · Custom variable ${i + 1}: duplicate token code [${code}]`;
        if (baseAllowedTokens.has(`[${code}]`)) return `${title} · Custom variable ${i + 1}: token code [${code}] conflicts with an existing token`;
        seenCodes.add(code);
        if (!expr) return `${title} · Custom variable ${i + 1} ([${code}]): expression is required`;
        const prevCustomTokens = [
          ...Array.from(sharedSeenCodes).map((c) => `[${c}]`),
          ...Array.from(seenCodes).filter((c) => c !== code).map((c) => `[${c}]`),
        ];
        const allowedForExpr = new Set<string>([...Array.from(baseAllowedTokens), ...prevCustomTokens]);
        const errExpr = validateExpression(expr, {
          label: `${title} · Custom variable ${i + 1} ([${code}])`,
          allowedTokens: allowedForExpr,
        });
        if (errExpr) return errExpr;
      }

      const conds = Array.isArray(base.conditions) ? base.conditions : [];
      for (let i = 0; i < conds.length; i++) {
        const cond = conds[i];
        const errIf = validateExpression(cond?.if || '', {
          label: `${title} · Condition ${i + 1} (IF)`,
          allowedTokens,
        });
        if (errIf) return errIf;
        const errThen = validateExpression(cond?.then || '', {
          label: `${title} · Condition ${i + 1} (THEN)`,
          allowedTokens,
        });
        if (errThen) return errThen;
      }

      const errElse = validateExpression(base.else_formula || '', {
        label: `${title} · Else Formula`,
        allowedTokens,
      });
      if (errElse) return errElse;
    }
    return null;
  };

  const addExamAssignmentFromTemplate = (tpl: { id: string; exam: string; exam_display_name: string; pattern?: any }) => {
    const targetQpType = String(selectedQpType || '').trim();
    if (!targetQpType) return;

    const examCode = String(tpl.exam || '').trim();
    const examDisplayName = String(tpl.exam_display_name || tpl.exam || '').trim();
    if (!examDisplayName) return;

    const examKey = normalizeExamDisplayKey(examDisplayName);
    setLocalExamAssignments((prev) => {
      const already = (prev || []).find((e) => {
        if (String(e.qp_type || '').trim() !== targetQpType) return false;
        const k = normalizeExamDisplayKey(String(e.exam_display_name || e.exam || ''));
        return !!examKey && k === examKey;
      });
      if (already) return prev;

      const derivedCos = deriveCosFromTemplate({ pattern: tpl.pattern } as any);
      const baseCoWeights: Record<string, number> = {};
      derivedCos.forEach((co) => { baseCoWeights[String(co)] = 0; });

      const next: ExamAssignment = {
        exam: examCode || normalizeTypeCode(examDisplayName),
        exam_display_name: examDisplayName,
        qp_type: targetQpType,
        kind: 'exam',
        weight: 0,
        co_weights: baseCoWeights,
        mark_manager_enabled: !!tpl?.pattern?.mark_manager?.enabled,
        mm_exam_weight: 0,
        mm_co_weights_with_exam: { ...baseCoWeights },
        mm_co_weights_without_exam: { ...baseCoWeights },
        default_cos: derivedCos,
        customize_questions: false,
        enabled: true,
      };
      return [...prev, next];
    });
    markExamDirty();

    setSelectedPatternId(null);
    setSelectedExamRef({
      exam: examCode || normalizeTypeCode(examDisplayName),
      exam_display_name: examDisplayName,
      qp_type: targetQpType,
      id: tpl.id,
    });
  };

  const handleExamAssignmentsSave = async () => {
    if (!selectedClassTypeId) return;
    const examAssignmentsPayload = (localExamAssignments || []).map((exam) => {
      if (!isCqiAssignment(exam) || !exam.cqi) return exam;
      const nextConditions = Array.isArray(exam.cqi.conditions)
        ? exam.cqi.conditions.map((cond) => {
            const clauses = Array.isArray(cond.if_clauses) ? cond.if_clauses : parseIfClauses(String(cond.if || ''));
            return {
              ...cond,
              if_clauses: clauses,
              if: buildIfFromClauses(clauses),
            };
          })
        : [];
      return {
        ...exam,
        cqi: {
          ...exam.cqi,
          conditions: nextConditions,
        },
      };
    });
    const res = await fetchWithAuth(`/api/academic-v2/class-types/${selectedClassTypeId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        exam_assignments: examAssignmentsPayload,
        cqi_global_custom_vars: normalizeCustomVarList(globalCqiCustomVars),
      }),
    });
    if (!res.ok) throw new Error('Failed to save exam assignments');
    const updated = await res.json();
    setClassTypes(prev => prev.map(ct => (ct.id === selectedClassTypeId ? { ...ct, ...updated } : ct)));
    setLocalExamAssignments(normalizeExamAssignmentsForEditing((updated as any)?.exam_assignments || examAssignmentsPayload, patterns.filter(p => p.class_type == null)));
    setGlobalCqiCustomVars(normalizeCustomVarList((updated as any)?.cqi_global_custom_vars || globalCqiCustomVars));
    setExamAssignmentsDirty(false);
  };

  const moveExamAssignmentWithinSelectedType = (fromVisible: number, toVisible: number) => {
    const indices = visibleExamAssignmentItems.map((x) => x.idx);
    const from = indices[fromVisible];
    const to = indices[toVisible];
    if (from == null || to == null || from === to) return;

    setLocalExamAssignments((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      const adjustedTo = from < to ? to - 1 : to;
      next.splice(adjustedTo, 0, item);
      return next;
    });
    markExamDirty();
  };

  useEffect(() => {
    // If nothing is selected, auto-select the first configured exam for this QP type.
    if (!selectedPatternId && !selectedExamRef && orderedExamSidebarItems.length > 0) {
      const first = orderedExamSidebarItems[0];
      setSelectedPatternId(first.pattern?.id || null);
      setSelectedExamRef({
        exam: first.exam.exam || first.exam.exam_display_name || '',
        exam_display_name: first.exam.exam_display_name || first.exam.exam || '',
        qp_type: selectedQpType,
        id: first.pattern?.id,
      });
    }
  }, [orderedExamSidebarItems, selectedPatternId, selectedExamRef, selectedQpType]);

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

    // New mapping: seed the editor from the selected global exam template (if present)
    // so each QP Type can start with a base question table and then diverge.
    setLocalName(defaultName);
    if (selectedExamTemplate) {
      setLocalRows(normalizeRows(selectedExamTemplate as any));

      const mm = (selectedExamTemplate as any)?.pattern?.mark_manager;
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
      setLocalRows([]);
      setMarkManager(getDefaultMarkManager());
    }
    setIsDirty(false);
  }, [selectedExamRef, resolvedPattern, selectedExamTemplate]);

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
      special_split: false,
      special_split_sources: [],
    }]);
    markDirty();
  };

  const openQuestionSettings = (idx: number) => {
    setSettingsQuestionIndex(idx);
    setQuestionSettingsOpen(true);
  };

  const closeQuestionSettings = () => {
    setQuestionSettingsOpen(false);
    setSettingsQuestionIndex(null);
  };

  const settingsRow = (settingsQuestionIndex != null && settingsQuestionIndex >= 0 && settingsQuestionIndex < localRows.length)
    ? localRows[settingsQuestionIndex]
    : null;
  const settingsSpecialEnabled = !!settingsRow?.special_split;

  const getSpecialSplitPreview = (idx: number) => {
    const r = localRows[idx];
    if (!r || !r.special_split) {
      return { sumMarks: 0, specialMarks: 0, coSet: [] as number[], coCount: 0, result: 0 };
    }
    const sources = Array.isArray(r.special_split_sources) ? r.special_split_sources : [];
    const coSet = uniq(
      sources
        .filter((sIdx) => Number.isFinite(sIdx) && sIdx >= 0 && sIdx < localRows.length)
        .filter((sIdx) => sIdx !== idx)
        .flatMap((sIdx) => toCoSet(localRows[sIdx]?.co_number))
    );
    const coCount = coSet.length;
    const sumMarks = sources
      .filter((sIdx) => Number.isFinite(sIdx) && sIdx >= 0 && sIdx < localRows.length)
      .filter((sIdx) => sIdx !== idx)
      .reduce((sum, sIdx) => sum + (Number(localRows[sIdx]?.max_marks) || 0), 0);
    const specialMarks = Number(r.max_marks) || 0;
    const denom = Math.max(coCount, 1);
    const result = Math.round((sumMarks + (specialMarks / denom)) * 100) / 100;
    return { sumMarks, specialMarks, coSet, coCount, result };
  };

  const toggleSpecialSplitSource = (specialIdx: number, sourceIdx: number, checked: boolean) => {
    const current = localRows[specialIdx];
    if (!current) return;
    const prev = Array.isArray(current.special_split_sources) ? current.special_split_sources : [];
    const base = prev.filter((n) => Number.isFinite(n) && n >= 0);
    const next = checked
      ? uniq([...base, sourceIdx]).filter((n) => n !== specialIdx)
      : base.filter((n) => n !== sourceIdx);
    updateRow(specialIdx, 'special_split_sources', next);
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
    if (!selectedClassTypeId || !selectedQpType) return;
    if (!selectedExamRef && !examAssignmentsDirty) return;

    // Validate CQI math/formulas/conditions before saving class-type exam assignments.
    if (examAssignmentsDirty) {
      const err = validateAllCqiBeforeSave();
      if (err) {
        setMessage({ type: 'error', text: err });
        return;
      }
    }

    try {
      setSaving(true);
      let savedPattern: QpPattern | null = null;
      let createdNewPattern = false;

      if (selectedExamRef && isDirty) {
        const finalRows = markManager.enabled ? markManagerToRows(markManager) : localRows;
        const patternPayload = {
          ...rowsToPattern(finalRows),
          mark_manager: markManager.enabled ? markManager : null,
        };

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
          createdNewPattern = true;
          setPatterns((prev) => [...prev, savedPattern!]);
        }

        setSelectedPatternId(savedPattern?.id || null);
        setSelectedExamRef({ exam: savedPattern?.name || selectedExamRef.exam, exam_display_name: savedPattern?.name || selectedExamRef.exam_display_name, qp_type: selectedQpType });
        setIsDirty(false);
      }

      // When a new exam is mapped under a QP Type, ensure it appears in Weightage/DB
      // by creating a per-QP-type weight entry keyed by (qp_type, exam).
      if (createdNewPattern && savedPattern) {
        const tpl = selectedExamTemplate;
        const derivedCos = deriveCosFromTemplate(tpl as any);
        const defaultWeight = Number((tpl as any)?.default_weight) || 0;
        const coWeights: Record<string, number> = {};
        if (derivedCos.length > 0 && defaultWeight > 0) {
          const perCo = Math.round((defaultWeight / derivedCos.length) * 100) / 100;
          derivedCos.forEach(co => { coWeights[String(co)] = perCo; });
        } else {
          derivedCos.forEach(co => { coWeights[String(co)] = 0; });
        }
        const isMarkManager = !!(tpl as any)?.pattern?.mark_manager?.enabled;
        const mmCoWeightsWith: Record<string, number> = { ...coWeights };
        const mmCoWeightsWithout: Record<string, number> = { ...coWeights };

        const nextAssignments = (() => {
          const prev = Array.isArray(localExamAssignments) ? localExamAssignments : [];
          const targetQpType = String(selectedQpType || '').trim();
          const examName = String(savedPattern?.name || selectedExamRef.exam_display_name || '').trim();
          const exists = prev.some(e =>
            String(e.qp_type || '').trim() === targetQpType &&
            (
              normalizeExamDisplayKey(e.exam_display_name || '') === normalizeExamDisplayKey(examName) ||
              normalizeExamDisplayKey(e.exam || '') === normalizeExamDisplayKey(examName)
            )
          );
          if (exists) return null;
          return [
            ...prev,
            {
              exam: examName,
              exam_display_name: examName,
              qp_type: targetQpType,
              weight: defaultWeight,
              co_weights: coWeights,
              mark_manager_enabled: isMarkManager,
              mm_exam_weight: 0,
              mm_co_weights_with_exam: mmCoWeightsWith,
              mm_co_weights_without_exam: mmCoWeightsWithout,
              default_cos: derivedCos,
              customize_questions: false,
              enabled: true,
            } as any,
          ];
        })();

        if (nextAssignments) {
          // Persist immediately so Weightage page + Weigthts mirror reflects mapping.
          setLocalExamAssignments(nextAssignments as any);
          setExamAssignmentsDirty(true);
          const res = await fetchWithAuth(`/api/academic-v2/class-types/${selectedClassTypeId}/`, {
            method: 'PATCH',
            body: JSON.stringify({ exam_assignments: nextAssignments }),
          });
          if (res.ok) {
            const updated = await res.json();
            setClassTypes(prev => prev.map(ct => (ct.id === selectedClassTypeId ? { ...ct, ...updated } : ct)));
            setExamAssignmentsDirty(false);
          } else {
            // Non-blocking: pattern save succeeded; weight save can be adjusted later.
            setMessage({ type: 'error', text: 'Pattern saved, but failed to save weight entry' });
          }
        }
      }

      if (examAssignmentsDirty) {
        await handleExamAssignmentsSave();
      }

      setMessage({ type: 'success', text: 'Changes saved' });
      setIsEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
      setMessage({ type: 'error', text: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!resolvedPattern) return;
    openDeleteModal({ object_type: 'qp_pattern', id: resolvedPattern.id, label: resolvedPattern.name || 'QP Pattern' });
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
                  className={`p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-50 flex items-start justify-between gap-2 ${
                    selectedQpType === t.code ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                  }`}
                >
                  <div>
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs text-gray-500">{t.code}</div>
                  </div>
                  {!!t.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteModal({ object_type: 'qp_type', id: t.id, label: t.label || t.code });
                      }}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Delete QP Type"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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
                  onClick={() => {
                    setAddExamSearch('');
                    setShowAddExamModal(true);
                  }}
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
            ) : orderedExamSidebarItems.length === 0 ? (
              <div className="p-4 text-center">
                <div className="text-sm text-gray-500">No exams added yet for this QP type</div>
                <div className="text-xs text-gray-400 mt-1">Click Add to pick an exam and start editing</div>
              </div>
            ) : (
              orderedExamSidebarItems.map(({ exam, pattern, visibleIndex }) => (
                <div
                  key={`${exam.exam || exam.exam_display_name}-${visibleIndex}`}
                  onClick={() => {
                    setSelectedPatternId(pattern?.id || null);
                    setSelectedExamRef({
                      exam: exam.exam || exam.exam_display_name || '',
                      exam_display_name: exam.exam_display_name || exam.exam || '',
                      qp_type: selectedQpType,
                      id: pattern?.id,
                    });
                    setIsEditing(false);
                    setExamEditorModalOpen(true);
                  }}
                  className={`p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-50 ${
                    (() => {
                      const selectedKey = normalizeExamDisplayKey(String(selectedExamRef?.exam_display_name || selectedExamRef?.exam || ''));
                      const examKey = normalizeExamDisplayKey(String(exam.exam_display_name || exam.exam || ''));
                      const isSelected = !!selectedKey && selectedKey === examKey;
                      const isPatternSelected = !!pattern && selectedPatternId === pattern.id;
                      return (isSelected || isPatternSelected) ? 'bg-blue-50 border-l-2 border-l-blue-600' : '';
                    })()
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{exam.exam_display_name || exam.exam}</div>
                      <div className="text-xs text-gray-500">
                        {selectedClassType?.display_name || selectedClassType?.name || 'Class'} · {selectedQpType || 'Type'}
                      </div>
                      <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                        <label className="text-xs text-gray-500">Pass Mark:</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="—"
                          value={exam.pass_mark ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            const val = raw === '' ? null : Math.max(0, Math.floor(Number(raw)));
                            const globalIdx = visibleExamAssignmentItems[visibleIndex]?.idx;
                            if (globalIdx == null) return;
                            setLocalExamAssignments((prev) => {
                              const next = [...prev];
                              next[globalIdx] = { ...next[globalIdx], pass_mark: val };
                              return next;
                            });
                            markExamDirty();
                          }}
                          className="w-16 text-xs border rounded px-1 py-0.5 text-center"
                          title="Optional whole-number pass mark for this exam"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditing(true);
                          moveExamAssignmentWithinSelectedType(visibleIndex, visibleIndex - 1);
                        }}
                        disabled={visibleIndex === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 rounded"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditing(true);
                          moveExamAssignmentWithinSelectedType(visibleIndex, visibleIndex + 1);
                        }}
                        disabled={visibleIndex === orderedExamSidebarItems.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 rounded"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
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
                          // Revert exam assignment weight edits as well
                          if (selectedClassType) {
                            const normalized = normalizeExamAssignmentsForEditing(
                              (selectedClassType.exam_assignments as any[]) || [],
                              patterns.filter(p => p.class_type == null)
                            );
                            setLocalExamAssignments(normalized);
                          }
                          setExamAssignmentsDirty(false);
                          setIsDirty(false);
                        }}
                        className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={(!isDirty && !examAssignmentsDirty) || saving}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                          (isDirty || examAssignmentsDirty) && !saving
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
                    <table className="w-full text-sm table-fixed">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {isEditing && <th className="w-8 px-2 py-2 text-gray-400">#</th>}
                          <th className="w-20 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Enabled</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Question Title</th>
                          <th className="w-24 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Max</th>
                          <th className="w-24 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">BTL</th>
                          <th className="w-56 px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">CO</th>
                          <th className="w-14 px-2 py-2"></th>
                          {isEditing && <th className="px-2 py-2 w-8"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {localRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={
                                (isEditing ? 1 : 0)
                                + 1 /* enabled */
                                + 1 /* title */
                                + 1 /* max */
                                + 1 /* btl */
                                + 1 /* co */
                                + 1 /* settings */
                                + (isEditing ? 1 : 0) /* delete */
                              }
                              className="text-center py-8 text-gray-400"
                            >
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
                                  <span className="font-medium truncate inline-block max-w-full align-middle">{row.title}</span>
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
                                  <select
                                    value={coToSelectVal(row.co_number)}
                                    onChange={e => { updateRow(idx, 'co_number', selectValToCo(e.target.value)); markDirty(); }}
                                    className="w-full max-w-[14rem] px-2 py-1 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="">—</option>
                                    <optgroup label="Single CO">
                                      {CO_NUMBERS.map(c => <option key={c} value={String(c)}>CO{c}</option>)}
                                    </optgroup>
                                    <optgroup label="Combination COs (mark split equally)" style={{ background: '#f3e8ff' }}>
                                      {CO_COMBINATIONS.map(combo => {
                                        const val = combo.join(',');
                                        const label = combo.map(c => `CO${c}`).join(' & ');
                                        return (
                                          <option key={val} value={val} style={{ background: '#f3e8ff' }}>
                                            {label}
                                          </option>
                                        );
                                      })}
                                    </optgroup>
                                  </select>
                                ) : (
                                  row.co_number != null
                                    ? Array.isArray(row.co_number)
                                      ? <span className="bg-violet-100 text-violet-700 text-xs px-1.5 py-0.5 rounded font-medium inline-block max-w-[14rem] truncate align-middle">{coLabel(row.co_number)}</span>
                                      : <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded inline-block max-w-[14rem] truncate align-middle">{coLabel(row.co_number)}</span>
                                    : <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => openQuestionSettings(idx)}
                                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
                                  title="Question settings"
                                >
                                  <Settings2 className="w-4 h-4" />
                                </button>
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

                {/* Question Settings Modal */}
                {questionSettingsOpen && settingsQuestionIndex != null && settingsRow && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-xl bg-white rounded-lg shadow-lg border overflow-hidden">
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Question Settings</div>
                          <div className="text-xs text-gray-400">Q{settingsQuestionIndex + 1}: {settingsRow.title || `Q${settingsQuestionIndex + 1}`}</div>
                        </div>
                        <button onClick={closeQuestionSettings} className="p-2 rounded hover:bg-gray-100" title="Close">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4 space-y-4">
                        <div className="text-xs text-gray-500">
                          This popup is designed to hold more per-question options later.
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-violet-600"
                            disabled={!isEditing}
                            checked={!!settingsRow.special_split}
                            onChange={(e) => {
                              updateRow(settingsQuestionIndex, 'special_split', e.target.checked);
                              if (!e.target.checked) {
                                updateRow(settingsQuestionIndex, 'special_split_sources', []);
                              }
                            }}
                          />
                          <span className="font-medium text-gray-800">special_split</span>
                        </label>

                        {settingsSpecialEnabled && (
                          <div className="border rounded-lg p-3 bg-violet-50/40">
                            {(() => {
                              const p = getSpecialSplitPreview(settingsQuestionIndex);
                              return (
                                <div className="space-y-2">
                                  <div className="text-xs text-gray-600">
                                    Formula (preview): <span className="font-semibold">sum(checked max marks) + (special max marks / unique CO count)</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="bg-white rounded border p-2">
                                      <div className="text-xs text-gray-500">Checked sum</div>
                                      <div className="font-semibold">{p.sumMarks}</div>
                                    </div>
                                    <div className="bg-white rounded border p-2">
                                      <div className="text-xs text-gray-500">Special max</div>
                                      <div className="font-semibold">{p.specialMarks}</div>
                                    </div>
                                    <div className="bg-white rounded border p-2">
                                      <div className="text-xs text-gray-500">Unique COs</div>
                                      <div className="font-semibold">{p.coCount || 0}{p.coSet.length ? ` (${p.coSet.map((c) => `CO${c}`).join(', ')})` : ''}</div>
                                    </div>
                                    <div className="bg-white rounded border p-2">
                                      <div className="text-xs text-gray-500">Result</div>
                                      <div className="font-semibold text-violet-700">{p.result}</div>
                                    </div>
                                  </div>
                                  <div className="text-xs text-gray-600 mt-3 font-medium">Select source questions</div>
                                  <div className="max-h-48 overflow-auto bg-white rounded border">
                                    {localRows
                                      .map((r, i) => ({ r, i }))
                                      .filter(({ i }) => i !== settingsQuestionIndex)
                                      .map(({ r, i }) => {
                                        const selected = Array.isArray(settingsRow.special_split_sources)
                                          ? (settingsRow.special_split_sources as number[]).includes(i)
                                          : false;
                                        const disabled = !isEditing || !r.enabled;
                                        return (
                                          <label
                                            key={i}
                                            className={`flex items-center justify-between gap-3 px-3 py-2 text-sm border-b last:border-b-0 ${disabled ? 'opacity-60' : 'hover:bg-gray-50'}`}
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-violet-600"
                                                disabled={disabled}
                                                checked={selected}
                                                onChange={(e) => toggleSpecialSplitSource(settingsQuestionIndex, i, e.target.checked)}
                                              />
                                              <div className="min-w-0">
                                                <div className="font-medium truncate">Q{i + 1}: {r.title || `Q${i + 1}`}</div>
                                                <div className="text-xs text-gray-500 truncate">Max {Number(r.max_marks) || 0} · {coLabel(r.co_number)}</div>
                                              </div>
                                            </div>
                                            {!r.enabled && (
                                              <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">Disabled</span>
                                            )}
                                          </label>
                                        );
                                      })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      <div className="px-4 py-3 border-t flex justify-end gap-2">
                        <button
                          onClick={closeQuestionSettings}
                          className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!cqiEditorModalOpen && selectedIsCqi && selectedExamAssignmentItem && (
                  <div ref={cqiConfigRef} className="border-t pt-5 mt-5">
                    <div className="border rounded-lg p-4 bg-white">
                        <div className="mb-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-800">CQI Configuration</h4>
                              <div className="text-xs text-gray-400">Saved inside Class Type exam assignments (selected CQI)</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCqiEditorModalOpen(true)}
                              disabled={!isEditing}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                              title={!isEditing ? 'Enable Edit mode to modify CQI' : 'Open horizontal CQI editor'}
                            >
                              Edit CQI
                            </button>
                          </div>
                        </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">CQI Name</label>
                          <input
                            value={selectedExamAssignmentItem.exam.cqi?.name || ''}
                            onChange={(e) => updateCqi((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="CQI"
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            disabled={!isEditing}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">CQI Code</label>
                          <input
                            value={selectedExamAssignmentItem.exam.cqi?.code || ''}
                            onChange={(e) => updateCqi((prev) => ({ ...prev, code: normalizeTypeCode(e.target.value) }))}
                            placeholder="CQI"
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            disabled={!isEditing}
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 mb-2">CO Selection</div>
                        <div className="flex flex-wrap gap-3">
                          {Array.from({ length: Number(selectedClassType?.default_co_count ?? 5) || 5 }, (_, i) => i + 1).map((co) => {
                            const selected = (selectedExamAssignmentItem.exam.cqi?.cos || []).includes(co);
                            return (
                              <label key={co} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={!isEditing}
                                  onChange={(e) => {
                                    updateCqi((prev) => {
                                      const set = new Set(prev.cos || []);
                                      if (e.target.checked) set.add(co);
                                      else set.delete(co);
                                      return { ...prev, cos: Array.from(set).sort((a, b) => a - b) };
                                    });
                                  }}
                                  className="w-4 h-4"
                                />
                                <span className="text-gray-700">CO{co}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs text-gray-500 mb-2">Exam Assignments Considered</div>
                        <div className="text-[11px] text-gray-400 mb-2">
                          If none selected, all exam assignments are considered.
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {(() => {
                            const baseExams = (visibleExamAssignments || []).filter((e) => !isCqiAssignment(e));
                            const allCodes = baseExams
                              .map((e) => normalizeTypeCode(e.exam_display_name || e.exam || ''))
                              .filter(Boolean);
                            const rawSelected = selectedExamAssignmentItem.exam.cqi?.exams || [];
                            const selectedSet = new Set(
                              (Array.isArray(rawSelected) && rawSelected.length > 0 ? rawSelected : allCodes)
                                .map((x) => normalizeTypeCode(String(x || '')))
                                .filter(Boolean)
                            );
                            return baseExams.map((ex) => {
                              const code = normalizeTypeCode(ex.exam_display_name || ex.exam || '');
                              const label = String(ex.exam_display_name || ex.exam || code);
                              const checked = code ? selectedSet.has(code) : false;
                              return (
                                <label key={code || label} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!isEditing || !code}
                                    onChange={(e) => {
                                      if (!code) return;
                                      updateCqi((prev) => {
                                        const nextAll = allCodes;
                                        const init = new Set(
                                          (Array.isArray(prev.exams) && prev.exams.length > 0 ? prev.exams : nextAll)
                                            .map((x) => normalizeTypeCode(String(x || '')))
                                            .filter(Boolean)
                                        );
                                        if (e.target.checked) init.add(code);
                                        else init.delete(code);
                                        return { ...prev, exams: Array.from(init).sort((a, b) => a.localeCompare(b)) };
                                      });
                                    }}
                                    className="w-4 h-4"
                                  />
                                  <span className="text-gray-700">{label}</span>
                                </label>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      <div className="mt-5 border-t pt-4">
                        <div className="text-sm font-semibold text-gray-700 mb-1">Custom Variable (Token) Creator</div>
                        <div className="text-xs text-gray-400 mb-2">Create reusable tokens like C = [COX-SSA_1-OBT] + [FORMATIVE_1-OBT]. Use them in IF/THEN/ELSE.</div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs text-gray-500">Custom Variables</label>
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCqi((prev) => ({
                                      ...prev,
                                      custom_vars: [...(prev.custom_vars || []), { code: '', label: '', expr: '' }],
                                    }))
                                  }
                                  className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                >
                                  + Add Custom Variable
                                </button>
                              )}
                            </div>

                            <div className="space-y-2">
                              {(selectedExamAssignmentItem.exam.cqi?.custom_vars || []).length === 0 ? (
                                <div className="text-xs text-gray-400">No custom variables created</div>
                              ) : (
                                (selectedExamAssignmentItem.exam.cqi?.custom_vars || []).map((cv, idx) => (
                                  <div key={idx} className="border rounded-lg p-2 bg-gray-50">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <label className="text-[11px] text-gray-500">Token Code</label>
                                          {isEditing && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateCqi((prev) => {
                                                  const next = [...(prev.custom_vars || [])];
                                                  next.splice(idx, 1);
                                                  return { ...prev, custom_vars: next };
                                                })
                                              }
                                              className="text-[11px] text-red-600 hover:underline"
                                            >
                                              Remove
                                            </button>
                                          )}
                                        </div>
                                        <input
                                          value={cv?.code || ''}
                                          disabled={!isEditing}
                                          onChange={(e) =>
                                            updateCqi((prev) => {
                                              const next = [...(prev.custom_vars || [])];
                                              next[idx] = { ...(next[idx] as any), code: normalizeCustomVarCode(e.target.value) };
                                              return { ...prev, custom_vars: next };
                                            })
                                          }
                                          placeholder="C"
                                          className="w-full px-2 py-2 border rounded text-sm font-mono"
                                        />
                                        <div className="text-[10px] text-gray-400 mt-1">Will be used as <code className="font-mono">[{normalizeCustomVarCode(cv?.code || '') || 'CODE'}]</code></div>
                                      </div>

                                      <div>
                                        <label className="text-[11px] text-gray-500">Label (optional)</label>
                                        <input
                                          value={cv?.label || ''}
                                          disabled={!isEditing}
                                          onChange={(e) =>
                                            updateCqi((prev) => {
                                              const next = [...(prev.custom_vars || [])];
                                              next[idx] = { ...(next[idx] as any), label: e.target.value };
                                              return { ...prev, custom_vars: next };
                                            })
                                          }
                                          placeholder="Custom variable"
                                          className="w-full px-2 py-2 border rounded text-sm"
                                        />
                                      </div>

                                      <div>
                                        <div className="flex items-center justify-between">
                                          <label className="text-[11px] text-gray-500">Expression</label>
                                          {isEditing && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                openTokenPicker((token) =>
                                                  updateCqi((prev) => {
                                                    const next = [...(prev.custom_vars || [])];
                                                    const prevExpr = String((next[idx] as any)?.expr || '');
                                                    next[idx] = { ...(next[idx] as any), expr: appendToken(prevExpr, token) };
                                                    return { ...prev, custom_vars: next };
                                                  })
                                                )
                                              }
                                              className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                            >
                                              + Token
                                            </button>
                                          )}
                                        </div>
                                        <input
                                          value={cv?.expr || ''}
                                          disabled={!isEditing}
                                          onChange={(e) =>
                                            updateCqi((prev) => {
                                              const next = [...(prev.custom_vars || [])];
                                              next[idx] = { ...(next[idx] as any), expr: e.target.value };
                                              return { ...prev, custom_vars: next };
                                            })
                                          }
                                          placeholder="Example: ([COX-SSA_1-OBT] / 10) * 1.5"
                                          className="w-full px-2 py-2 border rounded text-sm font-mono"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Variable Tokens</label>
                            <div className="border rounded-lg p-2 max-h-[120px] overflow-auto bg-gray-50">
                              {cqiVariables.length === 0 ? (
                                <div className="text-xs text-gray-400">No variables available</div>
                              ) : (
                                <div className="space-y-1">
                                  {cqiVariables.slice(0, 40).map((v) => (
                                    <button
                                      key={v.code}
                                      type="button"
                                      disabled={!isEditing}
                                      onClick={() => { /* tokens inserted via +Token buttons */ }}
                                      className={`w-full text-left flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed ${v.kind === 'custom' ? 'bg-indigo-50' : tokenMeta(v.code).rowClass}`}
                                      title={isEditing ? 'Use + Token buttons to insert' : ''}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${v.kind === 'custom' ? 'bg-indigo-100 text-indigo-700' : tokenMeta(v.code).badgeClass}`}>{v.kind === 'custom' ? 'CUSTOM' : tokenMeta(v.code).badge}</span>
                                        <code className={`text-[11px] ${v.kind === 'custom' ? 'text-indigo-700 font-semibold' : tokenMeta(v.code).tokenClass}`}>{v.token}</code>
                                      </div>
                                      <span className="text-[11px] text-gray-400 truncate">{v.label}</span>
                                    </button>
                                  ))}
                                  {cqiVariables.length > 40 && (
                                    <div className="text-[11px] text-gray-400">…and {cqiVariables.length - 40} more</div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 border-t pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="text-sm font-semibold text-gray-700">CQI Operation (Conditions)</div>
                            <div className="text-xs text-gray-400">Condition ladder: IF → THEN; last Else used as default</div>
                          </div>
                          {isEditing && (
                            <button
                              onClick={() => updateCqi((prev) => ({ ...prev, conditions: [...(prev.conditions || []), { if: '', then: '', color: '#FEE2E2', if_clauses: [{ token: 'BEFORE_CQI', rhs: '' }] }] }))}
                              className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add Condition
                            </button>
                          )}
                        </div>

                        <div className="space-y-3">
                          {(selectedExamAssignmentItem.exam.cqi?.conditions || []).map((cond, idx) => (
                            <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs text-gray-500">Condition (IF)</label>
                                    {isEditing && (
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateCqi((prev) => {
                                              const next = [...(prev.conditions || [])];
                                              const existing = next[idx] as any;
                                              const clauses: CqiIfClause[] = Array.isArray(existing?.if_clauses)
                                                ? existing.if_clauses
                                                : parseIfClauses(existing?.if || '');
                                              clauses.push({ token: 'TOTAL_CQI', rhs: '' });
                                              next[idx] = { ...next[idx], if_clauses: clauses, if: buildIfFromClauses(clauses) };
                                              return { ...prev, conditions: next };
                                            })
                                          }
                                          className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                          title="Add AND condition"
                                        >
                                          + AND
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openTokenPicker((token) =>
                                              updateCqi((prev) => {
                                                const next = [...(prev.conditions || [])];
                                                const existing = next[idx] as any;
                                                const clauses: CqiIfClause[] = Array.isArray(existing?.if_clauses)
                                                  ? existing.if_clauses
                                                  : parseIfClauses(existing?.if || '');
                                                const lastIdx = Math.max(0, clauses.length - 1);
                                                clauses[lastIdx] = { ...clauses[lastIdx], rhs: appendToken(clauses[lastIdx]?.rhs || '', token) };
                                                next[idx] = { ...next[idx], if_clauses: clauses, if: buildIfFromClauses(clauses) };
                                                return { ...prev, conditions: next };
                                              })
                                            )
                                          }
                                          className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        >
                                          + Token
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {(() => {
                                    const cAny = cond as any;
                                    const clauses: CqiIfClause[] = Array.isArray(cAny?.if_clauses)
                                      ? cAny.if_clauses
                                      : parseIfClauses(cAny?.if || '');

                                    const writeClauses = (nextClauses: CqiIfClause[]) =>
                                      updateCqi((prev) => {
                                        const next = [...(prev.conditions || [])];
                                        next[idx] = { ...(next[idx] as any), if_clauses: nextClauses, if: buildIfFromClauses(nextClauses) };
                                        return { ...prev, conditions: next };
                                      });

                                    return (
                                      <div className="space-y-2">
                                        {clauses.map((cl, ci) => (
                                          <div key={ci} className="flex items-center gap-2">
                                            {ci === 0 ? (
                                              <div className="px-2 py-2 border rounded-lg text-sm font-mono bg-gray-100 text-gray-600 whitespace-nowrap">
                                                Before_CQI =
                                              </div>
                                            ) : (
                                              <select
                                                disabled={!isEditing}
                                                value={cl.token}
                                                onChange={(e) => {
                                                  const t = String(e.target.value || '').toUpperCase() as any;
                                                  if (!CQI_CLAUSE_TOKENS.includes(t)) return;
                                                  const nextClauses = clauses.map((x, j) => (j === ci ? { ...x, token: t } : x));
                                                  writeClauses(nextClauses);
                                                }}
                                                className="px-2 py-2 border rounded-lg text-sm font-mono bg-white text-gray-700"
                                                title="Token"
                                              >
                                                {CQI_CLAUSE_TOKENS.map((t) => (
                                                  <option key={t} value={t}>{t} =</option>
                                                ))}
                                              </select>
                                            )}

                                            <input
                                              value={cl.rhs || ''}
                                              disabled={!isEditing}
                                              onChange={(e) => {
                                                const nextClauses = clauses.map((x, j) => (j === ci ? { ...x, rhs: e.target.value } : x));
                                                writeClauses(nextClauses);
                                              }}
                                              placeholder={ci === 0 ? 'Example: < 58' : 'Example: >= 58'}
                                              className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div>
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs text-gray-500">Internal Mark Value (THEN)</label>
                                    {isEditing && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openTokenPicker((token) =>
                                            updateCqi((prev) => {
                                              const next = [...(prev.conditions || [])];
                                              next[idx] = { ...next[idx], then: appendToken(next[idx]?.then || '', token) };
                                              return { ...prev, conditions: next };
                                            })
                                          )
                                        }
                                        className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                      >
                                        + Token
                                      </button>
                                    )}
                                  </div>
                                  <input
                                    value={cond.then || ''}
                                    disabled={!isEditing}
                                    onChange={(e) =>
                                      updateCqi((prev) => {
                                        const next = [...(prev.conditions || [])];
                                        next[idx] = { ...next[idx], then: e.target.value };
                                        return { ...prev, conditions: next };
                                      })
                                    }
                                    placeholder="Example: [CQI] * 1.5"
                                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500">Cell Color</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={String((cond as any).color || '#FEE2E2')}
                                      disabled={!isEditing}
                                      onChange={(e) =>
                                        updateCqi((prev) => {
                                          const next = [...(prev.conditions || [])];
                                          next[idx] = { ...next[idx], color: e.target.value };
                                          return { ...prev, conditions: next };
                                        })
                                      }
                                      className="h-9 w-12 p-0 border rounded bg-white"
                                      title="Pick background color for matched cells"
                                    />
                                    <input
                                      value={String((cond as any).color || '')}
                                      disabled={!isEditing}
                                      onChange={(e) =>
                                        updateCqi((prev) => {
                                          const next = [...(prev.conditions || [])];
                                          next[idx] = { ...next[idx], color: e.target.value };
                                          return { ...prev, conditions: next };
                                        })
                                      }
                                      placeholder="#FEE2E2"
                                      className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono"
                                    />
                                  </div>
                                </div>
                              </div>
                              {isEditing && (
                                <div className="mt-2 flex justify-end">
                                  <button
                                    onClick={() =>
                                      updateCqi((prev) => {
                                        const next = [...(prev.conditions || [])];
                                        next.splice(idx, 1);
                                        return { ...prev, conditions: next };
                                      })
                                    }
                                    className="text-xs text-red-600 hover:underline"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}

                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-gray-500">Else Formula (default)</label>
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openTokenPicker((token) =>
                                      updateCqi((prev) => ({ ...prev, else_formula: appendToken(prev.else_formula || '', token) }))
                                    )
                                  }
                                  className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                >
                                  + Token
                                </button>
                              )}
                            </div>
                            <input
                              value={selectedExamAssignmentItem.exam.cqi?.else_formula || ''}
                              onChange={(e) => updateCqi((prev) => ({ ...prev, else_formula: e.target.value }))}
                              placeholder="Example: [CQI] * 1.5"
                              className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                              disabled={!isEditing}
                            />
                          </div>
                        </div>
                      </div>
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
              <h2 className="text-lg font-semibold">Add Exam Assignment</h2>
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
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="overflow-hidden flex flex-col gap-2">
                  <div className="text-xs font-medium text-gray-600">Exam Templates</div>
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={addExamSearch}
                      onChange={(e) => setAddExamSearch(e.target.value)}
                      placeholder="Search exams…"
                      className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="border rounded-lg overflow-auto max-h-[220px]">
                    <div className="divide-y">
                      {(availableExamsForCurrent || [])
                        .filter((tpl) => {
                          const q = addExamSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            String(tpl.exam_display_name || '').toLowerCase().includes(q) ||
                            String(tpl.exam || '').toLowerCase().includes(q)
                          );
                        })
                        .map((tpl) => {
                          const tplKey = normalizeExamDisplayKey(String(tpl.exam_display_name || tpl.exam || ''));
                          const already = (visibleExamAssignments || []).some((e) => {
                            if (isCqiAssignment(e)) return false;
                            return normalizeExamDisplayKey(String(e.exam_display_name || e.exam || '')) === tplKey;
                          });
                          return (
                            <button
                              key={tpl.id}
                              type="button"
                              disabled={already}
                              onClick={() => {
                                addExamAssignmentFromTemplate(tpl as any);
                                setIsEditing(true);
                                setShowAddExamModal(false);
                              }}
                              className="w-full text-left p-3 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-medium text-sm text-gray-900 truncate">{tpl.exam_display_name}</div>
                                {already ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">Added</span>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Add</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">Code: {tpl.exam}</div>
                            </button>
                          );
                        })}
                      {(availableExamsForCurrent || []).length === 0 && (
                        <div className="p-4 text-center text-sm text-gray-400">No exam templates found</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3 overflow-hidden flex flex-col gap-3">
                  <button
                    onClick={() => {
                      addNewCqiAssignment();
                      setIsEditing(true);
                      setShowAddExamModal(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
                  >
                    <Plus className="w-4 h-4" /> Create New CQI
                  </button>

                  <div className="text-xs text-gray-500">Existing CQIs for this QP Type</div>
                  <div className="flex-1 overflow-y-auto border rounded-lg">
                    <div className="divide-y">
                      {(visibleExamAssignmentItems || []).filter((x) => isCqiAssignment(x.exam)).length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-400">No CQIs added yet</div>
                      ) : (
                        (visibleExamAssignmentItems || [])
                          .filter((x) => isCqiAssignment(x.exam))
                          .map(({ exam }) => {
                            const title = exam.cqi?.name || exam.exam_display_name || exam.exam || 'CQI';
                            const subtitle = exam.exam_display_name || exam.exam || 'CQI';
                            const cosLabel = (exam.cqi?.cos || []).length ? (exam.cqi?.cos || []).map((c) => `CO${c}`).join(', ') : '—';
                            return (
                              <div
                                key={normalizeExamDisplayKey(String(exam.exam_display_name || exam.exam || ''))}
                                onClick={() => {
                                  setSelectedPatternId(null);
                                  setSelectedExamRef({
                                    exam: exam.exam || exam.exam_display_name || '',
                                    exam_display_name: exam.exam_display_name || exam.exam || '',
                                    qp_type: selectedQpType,
                                    id: null,
                                  });
                                  setIsEditing(false);
                                  setShowAddExamModal(false);
                                }}
                                className="p-3 cursor-pointer hover:bg-purple-50 transition"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="font-medium text-sm text-gray-900">{title}</div>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700">CQI</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
                                <div className="text-xs text-gray-400 mt-1">COs: {cosLabel}</div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
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

      {/* CQI Editor Popup (horizontal) */}
      {cqiEditorModalOpen && selectedIsCqi && selectedExamAssignmentItem && (
        <QpCqiEditorPopup
          open={cqiEditorModalOpen}
          onClose={() => setCqiEditorModalOpen(false)}
          selectedExamAssignment={
            selectedExamAssignmentItem
              ? {
                  exam: selectedExamAssignmentItem.exam.exam,
                  exam_display_name: selectedExamAssignmentItem.exam.exam_display_name || selectedExamAssignmentItem.exam.exam,
                  qp_type: selectedQpType,
                }
              : null
          }
          selectedExamAssignmentItem={selectedExamAssignmentItem}
          isEditing={isEditing}
          localRows={localRows}
          onUpdateRow={updateRow}
          onRemoveQuestion={removeQuestion}
          onAddQuestion={addQuestion}
          onOpenQuestionSettings={openQuestionSettings}
          cqiVariables={cqiVariables}
          groupedCqiVariables={groupedCqiVariables}
          tokenMeta={tokenMeta}
          tokenInsertRequested={tokenPickerOpen}
          onRequestTokenPicker={(insert) => openTokenPicker(insert)}
          updateCqi={updateCqi}
          availableExamAssignments={visibleExamAssignments.filter((exam) => !isCqiAssignment(exam))}
          sharedCustomVars={globalCqiCustomVars}
          updateSharedCustomVars={updateGlobalCqiCustomVars}
          onSaveSharedCustomVars={saveGlobalCqiCustomVars}
          savingSharedCustomVars={savingGlobalCqiCustomVars}
          onEnableEditing={() => setIsEditing(true)}
          parseIfClauses={parseIfClauses}
          buildIfFromClauses={buildIfFromClauses}
          appendToken={appendToken}
          selectedClassTypeDefaultCoCount={Number(selectedClassType?.default_co_count ?? 5) || 5}
          cycles={cycles}
        />
      )}

      {/* Exam Assignment Editor Popup (horizontal) */}
      {examEditorModalOpen && selectedExamAssignmentItem && (
        <QpExamAssignmentEditorPopup
          open={examEditorModalOpen}
          onClose={() => setExamEditorModalOpen(false)}
          isEditing={isEditing}
          onSave={async () => { await handleSave(); }}
          onDelete={resolvedPattern ? handleDelete : undefined}
          selectedExamAssignmentItem={selectedExamAssignmentItem}
          selectedQpType={selectedQpType}
          localRows={localRows}
          onAddQuestion={addQuestion}
          onRemoveQuestion={removeQuestion}
          onUpdateRow={updateRow}
          onOpenQuestionSettings={openQuestionSettings}
          onReplaceRows={(rows) => { setLocalRows(rows); markDirty(); }}
          cqiEditorOpen={cqiEditorModalOpen}
          cqiVariables={cqiVariables}
          groupedCqiVariables={groupedCqiVariables}
          tokenMeta={tokenMeta as any}
          updateCqi={updateCqi}
          availableExamAssignments={visibleExamAssignments.filter((exam) => !isCqiAssignment(exam))}
          sharedCustomVars={globalCqiCustomVars}
          updateSharedCustomVars={updateGlobalCqiCustomVars}
          onSaveSharedCustomVars={saveGlobalCqiCustomVars}
          savingSharedCustomVars={savingGlobalCqiCustomVars}
          parseIfClauses={parseIfClauses as any}
          buildIfFromClauses={buildIfFromClauses as any}
          appendToken={appendToken}
          openTokenPicker={openTokenPicker}
          selectedClassTypeDefaultCoCount={Number(selectedClassType?.default_co_count ?? 5) || 5}
          cycles={cycles}
        />
      )}

      {/* Token Picker Modal */}
      {tokenPickerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Insert Variable Token</h2>
              <button
                onClick={() => {
                  setTokenPickerOpen(false);
                  tokenInsertRef.current = null;
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-3">
              <input
                value={tokenPickerSearch}
                onChange={(e) => setTokenPickerSearch(e.target.value)}
                placeholder="Search tokens…"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                autoFocus
              />
              <div className="text-[11px] text-gray-400 mt-1">Click a token to insert it into the field.</div>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg">
              <div className="space-y-3 p-3">
                {groupedCqiVariables
                  .map((section) => ({
                    ...section,
                    items: section.items.filter((v) => {
                      const q = tokenPickerSearch.trim().toLowerCase();
                      if (!q) return true;
                      return v.token.toLowerCase().includes(q) || v.label.toLowerCase().includes(q) || v.code.toLowerCase().includes(q);
                    }),
                  }))
                  .filter((section) => section.items.length > 0)
                  .map((section) => (
                    <div key={section.key} className={`rounded-xl border ${section.meta.panelClass}`}>
                      <div className="px-3 py-2 border-b border-black/5 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{section.meta.title}</div>
                          <div className="text-[11px] text-gray-500">{section.meta.description}</div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${section.meta.headerClass}`}>{section.items.length}</span>
                      </div>
                      <div className="divide-y divide-black/5">
                        {section.items.map((v) => (
                          <button
                            key={v.code}
                            type="button"
                            onClick={() => {
                              tokenInsertRef.current?.insert(v.token);
                              setTokenPickerOpen(false);
                              tokenInsertRef.current = null;
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-white/70 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[10px] px-2 py-0.5 rounded ${v.kind === 'custom' ? 'bg-indigo-100 text-indigo-700' : tokenMeta(v.code).badgeClass}`}>{v.kind === 'custom' ? 'CUSTOM' : tokenMeta(v.code).badge}</span>
                              <code className={`text-sm font-mono ${v.kind === 'custom' ? 'text-indigo-700 font-semibold' : tokenMeta(v.code).tokenClass}`}>{v.token}</code>
                            </div>
                            <span className="text-sm text-gray-700 truncate">{v.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                {cqiVariables.length === 0 && (
                  <div className="p-4 text-sm text-gray-400 text-center">No variables available</div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setTokenPickerOpen(false);
                  tokenInsertRef.current = null;
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Confirm Delete Modal */}
      {deleteModalOpen && pendingDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Delete</h3>
              <p className="text-sm text-gray-600 mt-1">
                Deleting <span className="font-medium">{pendingDelete.label}</span> requires your password.
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
                  setPendingDelete(null);
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

    </div>
  );
}
