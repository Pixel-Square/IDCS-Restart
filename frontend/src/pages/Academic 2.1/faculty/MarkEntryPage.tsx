/**
 * Mark Entry Page
 * Enter marks for a specific exam with CO mapping
 * Toolbar: Load/Refresh, Reset Marks, Show Absentees, Export CSV, Export Excel,
 *          Import Excel, Download PDF, Save Draft, Publish
 * Info bar: Course, Batch, Last Saved, Published status
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, Eye, FileSpreadsheet, Upload, Download, Save, Send, Search, Settings2, CheckCircle, X, AlertTriangle, Edit3, Clock, Edit2 } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import { getApiBase } from '../../../services/apiBase';
import krlogo from '../../../assets/krlogo.png';

const initialsFromName = (name: string) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('') || 'U';

const coLabel = (co: number | number[] | null): string => {
  if (co == null) return '';
  if (Array.isArray(co)) return co.map(c => `CO${c}`).join(' & ');
  return `CO${co}`;
};

interface Question {
  id: string;
  question_number: string;
  max_marks: number;
  btl_level: number | null;
  co_number: number | number[] | null;
}

interface Student {
  id: string;
  roll_number: string;
  name: string;
  department?: string;
  mark: number | null;
  co_marks: Record<string, number>;
  is_absent: boolean;
  saved: boolean;
}

interface ExamInfo {
  id: string;
  name: string;
  max_marks: number;
  course_code: string;
  course_name: string;
  class_name: string;
  section: string;
  department: string;
  due_date: string | null;
  is_locked: boolean;
  status?: string;
  qp_type?: string | null;
  has_pending_edit_request?: boolean;
  publish_control?: {
    is_editable?: boolean;
    is_locked?: boolean;
    publish_control_enabled?: boolean;
    due_at?: string | null;
    open_from?: string | null;
    is_open?: boolean;
    open_remaining_seconds?: number | null;
    due_remaining_seconds?: number | null;
    is_past_due?: boolean;
    has_pending_request?: boolean;
    edit_window_until?: string | null;
    edit_window_until_publish?: boolean;
    status?: string;
    seal_animation_enabled?: boolean;
    seal_watermark_enabled?: boolean;
    seal_image?: string | null;
    approval_workflow_roles?: string[];
    approval_workflow_assignees?: Array<{ role: string; user_id: string | null; user_name: string | null }>;
    pending_request?: {
      id: string;
      status: string;
      current_stage: number;
      requested_at: string | null;
      expires_at: string | null;
      expires_remaining_seconds: number | null;
      reason: string;
      approval_history: Array<any>;
      requested_by_name?: string | null;
      requested_by_username?: string | null;
      requested_by_staff_id?: string | null;
      requested_by_profile_image?: string | null;
      required_role?: string | null;
      next_approver?: { role: string | null; user_id: string | null; user_name: string | null } | null;
    } | null;
  };
  qp_pattern: { id: string; name: string; questions: Question[] } | null;
  question_btls: Record<string, number | null>;
  mark_manager?: MarkManagerData | null;
}

interface MarkManagerCOConfig {
  enabled: boolean;
  num_items: number;
  max_marks: number;
  weight: number;  // Per-CO weight
}

interface MarkManagerData {
  enabled: boolean;
  mode: 'admin_define' | 'user_define';
  confirmed?: boolean;
  cia_enabled: boolean;
  cia_max_marks: number;
  whole_number?: boolean;
  arrow_keys?: boolean;
  cos: Record<string, MarkManagerCOConfig>;
}

export default function MarkEntryPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [questionBtls, setQuestionBtls] = useState<Record<string, number | null>>({});
  const [showAbsentOnly, setShowAbsentOnly] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sort/Filter state
  const [sortFilterOpen, setSortFilterOpen] = useState(false);
  const [sortOption, setSortOption] = useState<'register' | 'name' | 'department'>('register');
  const [showDepartmentColumn, setShowDepartmentColumn] = useState(false);
  const [filterRegisterRange, setFilterRegisterRange] = useState({ start: '', end: '' });
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());

  // Keep the raw string for the currently edited cell so decimals like "12." don't get lost.
  const [editingCell, setEditingCell] = useState<{ key: string; value: string } | null>(null);

  // Cell labels/warnings state: tracks which cells have import/edit warnings
  const [importedCells, setImportedCells] = useState<Set<string>>(new Set()); // Set of "studentId:questionId" or "studentId:mark"
  const [concurrentEditCells, setConcurrentEditCells] = useState<Set<string>>(new Set()); // Future: tracks concurrent edits

  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Request Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalView, setEditModalView] = useState<'reason' | 'sending' | 'track'>('reason');
  const [editReason, setEditReason] = useState('');
  const [editModalError, setEditModalError] = useState<string | null>(null);

  // Timer tick (for countdown banners)
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => (t + 1) % 1000000), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (sealHideTimeoutRef.current) clearTimeout(sealHideTimeoutRef.current);
    };
  }, []);

  // Publish Confirmation states
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishStatus, setPublishStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [sealImageUrl, setSealImageUrl] = useState<string | null>(null);
  const [showSealStamp, setShowSealStamp] = useState(true);
  const [sealAnimationEnabled, setSealAnimationEnabled] = useState(false);
  const [sealWatermarkEnabled, setSealWatermarkEnabled] = useState(false);
  const [publishCountdown, setPublishCountdown] = useState<number | null>(null);
  const sealHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const resolveMediaUrl = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const v = String(value);
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    if (v.startsWith('/')) return `${getApiBase()}${v}`;
    return v;
  };

  // Mark Manager (user_define) state
  const [mmSetup, setMmSetup] = useState<{
    cos: Record<number, MarkManagerCOConfig>;
    cia_enabled: boolean;
    cia_max_marks: number;
    cia_weight: number;
  } | null>(null);
  const [mmConfirming, setMmConfirming] = useState(false);

  // Import flow states
  const [importPhase, setImportPhase] = useState<'idle' | 'loading' | 'confirm' | 'success'>('idle');
  const [importPreview, setImportPreview] = useState<{
    matched: number; skipped: number; total_in_file: number; total_in_class: number;
    unfilled_count?: number;
    unfilled_rows?: Array<{ roll_number: string; name: string; row_number: number }>;
    students: Array<{ student_id: string; roll_number: string; name: string; mark: number | null; co_marks: Record<string, number>; is_absent: boolean }>;
  } | null>(null);

  // Check if we need to show mark manager setup
  const needsMarkManagerSetup = examInfo
    && examInfo.mark_manager
    && examInfo.mark_manager.enabled
    && examInfo.mark_manager.mode === 'user_define'
    && !examInfo.mark_manager.confirmed
    && (!examInfo.qp_pattern || examInfo.qp_pattern.questions.length === 0);

  const questions: Question[] =
    examInfo?.qp_pattern && 'questions' in examInfo.qp_pattern
      ? examInfo.qp_pattern.questions ?? []
      : [];

  // Mark Manager entry settings
  const wholeNumber = !!examInfo?.mark_manager?.whole_number;
  const arrowKeysIncDec = examInfo?.mark_manager?.arrow_keys !== false && !!examInfo?.mark_manager?.arrow_keys;
  type SheetCellPos = { row: number; col: number };
  const [sheetSelection, setSheetSelection] = useState<null | { anchor: SheetCellPos; focus: SheetCellPos; dragging: boolean }>(null);
  
  const getCellPos = (opts: { studentId: string; fieldType: 'question' | 'mark'; qId?: string }): SheetCellPos | null => {
    const row = filteredStudentIndexById.get(opts.studentId);
    if (row == null) return null;
    let col = 0;
    if (opts.fieldType === 'question') {
      if (!opts.qId) return null;
      const qi = questionIndexById.get(opts.qId);
      if (qi == null) return null;
      col = qi;
    } else {
      col = questions.length > 0 ? questions.length : 0;
    }
    if (col < 0 || col >= markColCount) return null;
    return { row, col };
  };
  
  const getSelectionRange = () => {
    if (!sheetSelection) return null;
    const r1 = Math.min(sheetSelection.anchor.row, sheetSelection.focus.row);
    const r2 = Math.max(sheetSelection.anchor.row, sheetSelection.focus.row);
    const c1 = Math.min(sheetSelection.anchor.col, sheetSelection.focus.col);
    const c2 = Math.max(sheetSelection.anchor.col, sheetSelection.focus.col);
    return { r1, r2, c1, c2 };
  };
  
  const isCellInSelection = (row: number, col: number) => {
    const range = getSelectionRange();
    if (!range) return false;
    return row >= range.r1 && row <= range.r2 && col >= range.c1 && col <= range.c2;
  };
  
  const getCellValueString = (row: number, col: number) => {
    const student = filteredStudents[row];
    if (!student) return '';
    if (questions.length > 0 && col < questions.length) {
      const q = questions[col];
      if (!q) return '';
      const key = `${student.id}:question:${q.id}`;
      if (editingCell?.key === key) return String(editingCell.value ?? '');
      const v = (student.co_marks as any)?.[q.id];
      return v == null ? '' : String(v);
    }
    const key = `${student.id}:mark`;
    if (editingCell?.key === key) return String(editingCell.value ?? '');
    const v = (student as any)?.mark;
    return v == null ? '' : String(v);
  };
  
  const startSelection = (pos: SheetCellPos, extend: boolean) => {
    setSheetSelection(prev => {
      if (extend && prev) return { ...prev, focus: pos, dragging: true };
      return { anchor: pos, focus: pos, dragging: true };
    });
  };
  
  const extendSelection = (pos: SheetCellPos) => {
    setSheetSelection(prev => (prev ? { ...prev, focus: pos } : { anchor: pos, focus: pos, dragging: true }));
  };
  
  useEffect(() => {
    const onUp = () => setSheetSelection(prev => (prev ? { ...prev, dragging: false } : prev));
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);
  
  const copySelectionToClipboard = async () => {
    const range = getSelectionRange();
    if (!range) return;
    const lines: string[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) {
        row.push(getCellValueString(r, c));
      }
      lines.push(row.join('\t'));
    }
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  };
  
  const clearSelectionValues = () => {
    const range = getSelectionRange();
    if (!range) return;
  
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
      setAutoSaveStatus('idle');
    }
  
    setStudents(prev => {
      const updatesByStudentId = new Map<string, { nextCoMarks?: Record<string, number | null>; nextMark?: number | null }>();
  
      for (let r = range.r1; r <= range.r2; r++) {
        const student = filteredStudents[r];
        if (!student) continue;
        if (student.is_absent) continue;
  
        if (questions.length > 0) {
          const cur = (prev.find(s => s.id === student.id)?.co_marks) || student.co_marks || {};
          const nextCoMarks: Record<string, number | null> = { ...(cur as any) };
  
          for (let c = range.c1; c <= range.c2; c++) {
            if (c >= questions.length) continue;
            const q = questions[c];
            if (!q) continue;
            delete nextCoMarks[q.id];
          }
  
          updatesByStudentId.set(student.id, { nextCoMarks });
          continue;
        }
  
        if (range.c1 <= 0 && range.c2 >= 0) {
          updatesByStudentId.set(student.id, { nextMark: null });
        }
      }
  
      if (updatesByStudentId.size === 0) return prev;
  
      return prev.map(s => {
        const u = updatesByStudentId.get(s.id);
        if (!u) return s;
        if (u.nextCoMarks) {
          const total = Object.values(u.nextCoMarks).reduce((sum, m) => sum + (typeof m === 'number' ? m : 0), 0);
          return { ...s, co_marks: u.nextCoMarks as any, mark: total, saved: false };
        }
        return { ...s, mark: u.nextMark ?? null, saved: false };
      });
    });
  
    setEditingCell(null);
    setHasChanges(true);
    triggerAutoSave();
  };

  // Arrow key cell navigation handler (when arrow_keys inc/dec is OFF)
  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (sheetSelection) {
      const isCopy = (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C');
      if (isCopy) {
        e.preventDefault();
        copySelectionToClipboard();
        return;
      }
  
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (!canImport) return;
        clearSelectionValues();
        return;
      }
    }
  
    if (arrowKeysIncDec) return; // default browser behavior: inc/dec
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const input = e.currentTarget;
      const td = input.closest('td');
      const tr = td?.closest('tr');
      const table = tr?.closest('table');
      if (!td || !tr || !table) return;
      const cellIndex = Array.from(tr.children).indexOf(td);
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const rowIndex = rows.indexOf(tr);
      const targetRow = e.key === 'ArrowUp' ? rows[rowIndex - 1] : rows[rowIndex + 1];
      if (targetRow) {
        const targetInput = targetRow.children[cellIndex]?.querySelector('input');
        if (targetInput && targetInput instanceof HTMLInputElement) {
          targetInput.focus();
          targetInput.select();
        }
      }
    }
  };

  const handleCellMouseDown = (
    e: React.MouseEvent<HTMLInputElement>,
    opts: { studentId: string; fieldType: 'question' | 'mark'; qId?: string; disabled: boolean },
  ) => {
    if (opts.disabled) return;
    const pos = getCellPos(opts);
    if (!pos) return;
    startSelection(pos, e.shiftKey);
  };

  const handleCellMouseEnter = (
    e: React.MouseEvent<HTMLInputElement>,
    opts: { studentId: string; fieldType: 'question' | 'mark'; qId?: string; disabled: boolean },
  ) => {
    if (opts.disabled) return;
    if (!(sheetSelection?.dragging)) return;
    if ((e.buttons & 1) !== 1) return;
    const pos = getCellPos(opts);
    if (!pos) return;
    extendSelection(pos);
  };

  useEffect(() => { loadData(); }, [examId]);

  // Keep latest loadData in a ref so focus/visibility handlers can call it safely
  const loadDataRef = useRef<null | (() => Promise<void>)>(null);
  useEffect(() => {
    loadDataRef.current = loadData;
  });

  // If user navigates away/back (or tab loses focus) after publish popup,
  // refresh safely when returning (only when there are no local unsaved changes).
  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (hasChanges) return;
      if (!examId) return;
      loadDataRef.current?.().catch(() => undefined);
    };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [examId, hasChanges]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [examRes, marksRes] = await Promise.all([
        fetchWithAuth(`/api/academic-v2/exams/${examId}/`),
        fetchWithAuth(`/api/academic-v2/exams/${examId}/marks/`),
      ]);
      if (!examRes.ok) throw new Error('Failed to load exam');
      const examData = await examRes.json();
      // Normalise qp_pattern: if empty object or missing questions, set null
      if (examData.qp_pattern && (!examData.qp_pattern.questions || examData.qp_pattern.questions.length === 0)) {
        examData.qp_pattern = null;
      }
      setExamInfo(examData);
      setQuestionBtls(examData.question_btls || {});

      // Seal settings come from publish_control (server already resolves semester config)
      const pc = (examData as any)?.publish_control || {};
      setSealImageUrl(resolveMediaUrl(pc?.seal_image));
      setSealAnimationEnabled(Boolean(pc?.seal_animation_enabled));
      setSealWatermarkEnabled(Boolean(pc?.seal_watermark_enabled));

      // Init Mark Manager setup if needed
      if (examData.mark_manager?.enabled && examData.mark_manager?.mode === 'user_define' && !examData.mark_manager?.confirmed) {
        const cos: Record<number, MarkManagerCOConfig> = {};
        for (let i = 1; i <= 5; i++) {
          cos[i] = { enabled: false, num_items: 5, max_marks: 25, weight: 0 };
        }
        setMmSetup({ cos, cia_enabled: false, cia_max_marks: 30, cia_weight: 0 });
      }

      if (marksRes.ok) {
        const marksData = await marksRes.json();
        setStudents(marksData.students || []);
      }
    } catch (error) {
      console.error('Failed to load:', error);
      setMessage({ type: 'error', text: 'Failed to load exam data' });
    } finally {
      setLoading(false);
    }
  };

  const confirmMarkManager = async () => {
    if (!mmSetup || !examId) return;
    try {
      setMmConfirming(true);
      const payload = {
        mark_manager: {
          enabled: true,
          mode: 'user_define',
          cia_enabled: mmSetup.cia_enabled,
          cia_max_marks: mmSetup.cia_max_marks,
          cia_weight: mmSetup.cia_weight,
          cos: mmSetup.cos,
        },
      };
      const res = await fetchWithAuth(`/api/academic-v2/exams/${examId}/confirm-mark-manager/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to confirm');
      }
      setMessage({ type: 'success', text: 'Mark Manager configured. Loading questions...' });
      setMmSetup(null);
      await loadData();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to confirm Mark Manager' });
    } finally {
      setMmConfirming(false);
    }
  };

  /* ────── Auto-save helper ────── */
  const triggerAutoSave = async () => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    
    // Set timeout to auto-save after 2 seconds
    autoSaveTimeoutRef.current = setTimeout(async () => {
      setAutoSaveStatus('saving');
      try {
        const marksData = students.map(s => ({
          student_id: s.id,
          mark: s.mark,
          co_marks: s.co_marks,
          is_absent: s.is_absent,
        }));
        const response = await fetchWithAuth(`/api/academic-v2/exams/${examId}/marks/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marks: marksData, question_btls: questionBtls, publish: false }),
        });
        if (!response.ok) throw new Error('Auto-save failed');
        
        setStudents(prev => prev.map(s => ({ ...s, saved: true })));
        setHasChanges(false);
        const now = new Date().toLocaleString();
        setLastSaved(now);
        
        // Show saved state for 2 seconds then revert to idle
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Auto-save error:', error);
        setAutoSaveStatus('idle');
      }
    }, 2000);
  };

  /* ────── Mark helpers ────── */
  const updateMark = (studentId: string, value: string) => {
    const numValue = value === '' ? null : (wholeNumber ? parseInt(value, 10) : parseFloat(value));
    if (numValue !== null && (isNaN(numValue) || (examInfo && numValue > examInfo.max_marks))) return;
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, mark: numValue, saved: false } : s
    ));
    setHasChanges(true);
    triggerAutoSave();
  };

  const updateQuestionMark = (studentId: string, qId: string, value: string) => {
    const q = questions.find(x => x.id === qId);
    if (!q) return;

    // Allow clearing to blank
    if (value === '') {
      setStudents(prev => prev.map(s => {
        if (s.id !== studentId) return s;
        const co_marks = { ...s.co_marks };
        delete co_marks[qId];
        const total = Object.values(co_marks).reduce((sum, m) => sum + (typeof m === 'number' ? m : 0), 0);
        return { ...s, co_marks, mark: total, saved: false };
      }));
      setHasChanges(true);
      triggerAutoSave();
      return;
    }

    const numValue = wholeNumber ? parseInt(value, 10) : parseFloat(value);
    if (isNaN(numValue)) return;
    if (numValue > q.max_marks) return;

    setStudents(prev => prev.map(s => {
      if (s.id !== studentId) return s;
      const co_marks = { ...s.co_marks, [qId]: numValue };
      const total = Object.values(co_marks).reduce((sum, m) => sum + (typeof m === 'number' ? m : 0), 0);
      return { ...s, co_marks, mark: total, saved: false };
    }));
    setHasChanges(true);
    triggerAutoSave();
  };

  const parseClipboardGrid = (text: string): string[][] => {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = normalized.split('\n');
    // Keep internal empty cells, but drop trailing completely empty rows
    while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
    return rows.map(r => r.split('\t'));
  };

  const applyPasteGrid = (opts: { startStudentId: string; fieldType: 'question' | 'mark'; startQId?: string; text: string }) => {
    const grid = parseClipboardGrid(opts.text);
    if (!grid.length) return;

    // Find starting row based on the currently visible list
    const startRow = filteredStudents.findIndex(s => s.id === opts.startStudentId);
    if (startRow < 0) return;

    // Determine starting column
    const startCol = opts.fieldType === 'question'
      ? Math.max(0, questions.findIndex(q => q.id === opts.startQId))
      : 0;
    if (opts.fieldType === 'question' && startCol < 0) return;

    // Cancel pending autosave to avoid multiple races
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
      setAutoSaveStatus('idle');
    }

    setStudents(prev => {
      const updatesByStudentId = new Map<string, { nextCoMarks?: Record<string, number | null>; nextMark?: number | null }>();

      for (let r = 0; r < grid.length; r++) {
        const student = filteredStudents[startRow + r];
        if (!student) break;
        if (student.is_absent) continue;

        if (opts.fieldType === 'mark') {
          const raw = (grid[r]?.[0] ?? '').trim();
          const numValue = raw === '' ? null : (wholeNumber ? parseInt(raw, 10) : parseFloat(raw));
          if (numValue !== null && (isNaN(numValue) || (examInfo && numValue > examInfo.max_marks))) continue;
          updatesByStudentId.set(student.id, { nextMark: numValue });
          continue;
        }

        // Question grid paste
        const currentCoMarks = (prev.find(s => s.id === student.id)?.co_marks) || student.co_marks || {};
        const nextCoMarks: Record<string, number | null> = { ...currentCoMarks };

        for (let c = 0; c < grid[r].length; c++) {
          const q = questions[startCol + c];
          if (!q) break;
          const raw = (grid[r]?.[c] ?? '').trim();
          if (raw === '') {
            delete nextCoMarks[q.id];
            continue;
          }
          const numValue = wholeNumber ? parseInt(raw, 10) : parseFloat(raw);
          if (isNaN(numValue)) continue;
          if (numValue > q.max_marks) continue;
          nextCoMarks[q.id] = numValue;
        }

        updatesByStudentId.set(student.id, { nextCoMarks });
      }

      if (updatesByStudentId.size === 0) return prev;

      return prev.map(s => {
        const u = updatesByStudentId.get(s.id);
        if (!u) return s;
        if (u.nextCoMarks) {
          const total = Object.values(u.nextCoMarks).reduce((sum, m) => sum + (typeof m === 'number' ? m : 0), 0);
          return { ...s, co_marks: u.nextCoMarks as any, mark: total, saved: false };
        }
        return { ...s, mark: u.nextMark ?? null, saved: false };
      });
    });

    setHasChanges(true);
    triggerAutoSave();
  };

  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    opts: { studentId: string; fieldType: 'question' | 'mark'; qId?: string },
  ) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text) return;

    // Only intercept grid-like paste (tabs/newlines). Let normal paste work otherwise.
    if (!text.includes('\t') && !text.includes('\n') && !text.includes('\r')) return;

    e.preventDefault();
    applyPasteGrid({
      startStudentId: opts.studentId,
      fieldType: opts.fieldType,
      startQId: opts.qId,
      text,
    });
  };

  // Commit the currently focused cell value to state immediately.
  // Fixes: last-edited cell missing when user clicks Publish (blur/click batching).
  const commitActiveCellValue = () => {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement)) return;
    const studentId = el.dataset.studentId;
    const fieldType = el.dataset.fieldType as 'question' | 'mark' | undefined;
    if (!studentId || !fieldType) return;

    // Stop pending autosave from racing with publish/save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
      setAutoSaveStatus('idle');
    }

    const rawValue = el.value;
    if (fieldType === 'question') {
      const qId = el.dataset.qid;
      if (!qId) return;
      const q = questions.find(x => x.id === qId);
      if (!q) return;
      const numValue = rawValue === '' ? 0 : (wholeNumber ? parseInt(rawValue, 10) : parseFloat(rawValue));
      if (isNaN(numValue)) return;
      if (numValue > q.max_marks) return;
      flushSync(() => {
        setStudents(prev => prev.map(s => {
          if (s.id !== studentId) return s;
          const co_marks = { ...s.co_marks, [qId]: numValue };
          const total = Object.values(co_marks).reduce((sum, m) => sum + (m || 0), 0);
          return { ...s, co_marks, mark: total, saved: false };
        }));
      });
      setHasChanges(true);
      return;
    }

    // Total mark cell
    const numValue = rawValue === '' ? null : (wholeNumber ? parseInt(rawValue, 10) : parseFloat(rawValue));
    if (numValue !== null && (isNaN(numValue) || (examInfo && numValue > examInfo.max_marks))) return;
    flushSync(() => {
      setStudents(prev => prev.map(s => (
        s.id === studentId ? { ...s, mark: numValue, saved: false } : s
      )));
    });
    setHasChanges(true);
  };

  const toggleAbsent = (studentId: string) => {
    setStudents(prev => prev.map(s =>
      s.id === studentId
        ? { ...s, is_absent: !s.is_absent, mark: !s.is_absent ? null : s.mark, saved: false }
        : s
    ));
    setHasChanges(true);
    triggerAutoSave();
  };

  const handlePublishClick = () => {
    setShowPublishConfirm(true);
    setPublishStatus('idle');
  };

  const closePublishModal = async (refreshAfterClose: boolean) => {
    setShowPublishConfirm(false);
    setPublishStatus('idle');
    setPublishCountdown(null);
    setShowSealStamp(true);
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (refreshAfterClose) {
      await loadData();
    }
  };

  const confirmPublish = async () => {
    setPublishStatus('loading');
    setPublishing(true);
    try {
      // Ensure the currently focused input is committed before saving/publishing.
      commitActiveCellValue();

      // Cancel any pending autosave to avoid request races.
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
        setAutoSaveStatus('idle');
      }

      // Always do a final save before publish (even if hasChanges was auto-reset).
      await saveMarks(false);
      
      const res = await fetchWithAuth(`/api/academic-v2/exams/${examId}/publish/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Publish failed');
      }
      
      // Add minimum 2 seconds of loading animation as requested before success
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setPublishStatus('success');
      
      // Wait 1 second, then show seal stamp and start screen shake
      await new Promise(resolve => setTimeout(resolve, 1000));
      setShowSealStamp(Boolean(sealAnimationEnabled));
      
      // Start 10-second countdown
      setPublishCountdown(10);
      if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = window.setInterval(() => {
        setPublishCountdown(prev => {
          if (prev === null || prev <= 1) {
            if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Auto-close after 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
      await closePublishModal(true);
    } catch (e) {
      setPublishStatus('idle');
      setShowPublishConfirm(false);
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to publish' });
      setPublishCountdown(null);
      if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
    } finally {
      setPublishing(false);
    }
  };

  /* ────── Actions ────── */
  const publishExam = async () => {
    if (!examId) return;
    try {
      setPublishing(true);
      const res = await fetchWithAuth(`/api/academic-v2/exams/${examId}/publish/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Publish failed');
      }
      setMessage({ type: 'success', text: 'Marks published successfully' });
      await loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to publish' });
      setShowPublishConfirm(false);
      setPublishStatus('idle');
    } finally {
      setPublishing(false);
    }
  };

  const openRequestEditModal = () => {
    setEditModalError(null);
    setEditModalView('reason');
    setEditReason('');
    setEditModalOpen(true);
  };

  const openTrackModal = async () => {
    setEditModalError(null);
    // Refresh ONLY exam info to get latest publish_control without clearing student marks
    try {
      const examRes = await fetchWithAuth(`/api/academic-v2/exams/${examId}/`);
      if (examRes.ok) {
        const examData = await examRes.json();
        if (examData.qp_pattern && (!examData.qp_pattern.questions || examData.qp_pattern.questions.length === 0)) {
          examData.qp_pattern = null;
        }
        setExamInfo(examData);
        const pc = (examData as any)?.publish_control || {};
        setSealImageUrl(resolveMediaUrl(pc?.seal_image));
        setSealAnimationEnabled(Boolean(pc?.seal_animation_enabled));
        setSealWatermarkEnabled(Boolean(pc?.seal_watermark_enabled));
      }
    } catch (error) {
      console.error('Failed to refresh exam info:', error);
    }
    setEditModalView('track');
    // show the latest reason if available
    const pr = examInfo?.publish_control?.pending_request;
    if (pr?.reason) setEditReason(String(pr.reason || ''));
    setEditModalOpen(true);
  };

  const cancelEditRequest = async () => {
    const pr = examInfo?.publish_control?.pending_request;
    if (!pr?.id) return;
    if (!window.confirm('Are you sure you want to cancel this edit request?')) return;
    try {
      setProcessingAction('cancel_edit');
      const res = await fetchWithAuth(`/api/academic-v2/edit-requests/${pr.id}/cancel/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const err = await res.json().catch(() => ({}));
          const anyErr: any = err;
          throw new Error(anyErr.detail || anyErr.error || anyErr.message || 'Failed to cancel request');
        }
        const text = await res.text().catch(() => '');
        throw new Error(text?.trim() || 'Failed to cancel request');
      }

      await loadData();
      // Bring user back to the Request Edit state immediately
      setEditModalError(null);
      setEditReason('');
      setEditModalView('reason');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error canceling request');
    } finally {
      setProcessingAction(null);
    }
  };

  const submitEditRequest = async () => {
    if (!examId) return;
    const reason = String(editReason || '').trim();
    if (!reason) {
      setEditModalError('Reason is required.');
      return;
    }
    try {
      setEditModalError(null);
      setEditModalView('sending');
      setProcessingAction('request_edit');
      const res = await fetchWithAuth(`/api/academic-v2/exams/${examId}/request-edit/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        if (errJson && typeof errJson === 'object') {
          const anyErr: any = errJson;
          throw new Error(anyErr.detail || anyErr.error || 'Request failed');
        }
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Request failed');
      }
      await loadData();
      setEditModalView('track');
    } catch (e) {
      setEditModalView('reason');
      setEditModalError(e instanceof Error ? e.message : 'Failed to request edit');
    } finally {
      setProcessingAction(null);
    }
  };

  const saveMarks = async (publish = false) => {
    try {
      publish ? setPublishing(true) : setSaving(true);
      const marksData = students.map(s => ({
        student_id: s.id,
        mark: s.mark,
        co_marks: s.co_marks,
        is_absent: s.is_absent,
      }));
      const response = await fetchWithAuth(`/api/academic-v2/exams/${examId}/marks/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks: marksData, question_btls: questionBtls, publish }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const err = await response.json().catch(() => ({}));
          const anyErr: any = err;
          throw new Error(anyErr.detail || anyErr.error || anyErr.message || 'Save failed');
        }
        const text = await response.text().catch(() => '');
        throw new Error(text?.trim() || 'Save failed');
      }
      setStudents(prev => prev.map(s => ({ ...s, saved: true })));
      setHasChanges(false);
      const now = new Date().toLocaleString();
      setLastSaved(now);
      setMessage({ type: 'success', text: publish ? 'Draft saved. Publishing...' : 'Draft saved successfully' });
      if (publish) {
        await publishExam();
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save marks' });
    } finally {
      if (publish) setPublishing(false);
      else setSaving(false);
    }
  };

  const resetMarks = () => {
    if (!window.confirm('Reset all marks to empty? This cannot be undone.')) return;
    setStudents(prev => prev.map(s => ({ ...s, mark: null, co_marks: {}, is_absent: false, saved: false })));
    setHasChanges(true);
  };

  const exportCSV = () => {
    if (!examInfo) return;
    const hasQ = questions.length > 0;
    const headers = ['Sl No', 'Roll No', 'Name',
      ...(hasQ ? questions.map(q => q.question_number) : []),
      'Total', 'Absent',
    ];
    const rows = students.map((s, i) => [
      i + 1, s.roll_number, s.name,
      ...(hasQ ? questions.map(q => s.co_marks[q.id] ?? '') : []),
      s.mark ?? '', s.is_absent ? 'Yes' : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${examInfo.course_code}_${examInfo.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = async () => {
    try {
      const response = await fetchWithAuth(`/api/academic-v2/exams/${examId}/export-template/`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${examInfo?.course_code}_${examInfo?.name}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ type: 'error', text: 'Failed to export Excel' });
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Phase 1: Show loading preloader for 3 seconds while uploading
    setImportPhase('loading');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const [response] = await Promise.all([
        fetchWithAuth(`/api/academic-v2/exams/${examId}/import-marks/`, {
          method: 'POST',
          body: formData,
        }),
        new Promise(resolve => setTimeout(resolve, 3000)), // minimum 3s loader
      ]);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Import failed');
      }
      const data = await response.json();
      setImportPreview(data);
      setImportPhase('confirm');
    } catch (err) {
      setImportPhase('idle');
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to import Excel' });
    }
  };

  // Helper: Generate cell label info (warnings, indicators like "Max Exceeded", "Imported (Empty)", "Editing...")
  const getCellLabel = (studentId: string, fieldType: 'mark' | 'question', fieldId?: string): { type: string; label: string; color: string } | null => {
    const cellKey = fieldType === 'mark' ? `${studentId}:mark` : `${studentId}:${fieldId}`;
    const student = students.find(s => s.id === studentId);
    if (!student) return null;

    // 1. Check if cell was imported but is empty (HIGHEST PRIORITY - show not filled warning)
    if (importedCells.has(cellKey)) {
      if (fieldType === 'mark' && student.mark === null) {
        return { type: 'not_filled', label: 'Not filled in Excel', color: 'gray' };
      }
      if (fieldType === 'question' && fieldId && (student.co_marks[fieldId] === null || student.co_marks[fieldId] === undefined)) {
        return { type: 'not_filled', label: 'Not filled in Excel', color: 'gray' };
      }
    }

    // 2. Check if mark exceeds max (HIGH PRIORITY - shows even if imported)
    if (fieldType === 'mark' && examInfo && student.mark !== null && student.mark > examInfo.max_marks) {
      return { type: 'max_exceeded', label: 'Max Exceeded', color: 'red' };
    }
    if (fieldType === 'question' && fieldId) {
      const q = questions.find(qu => qu.id === fieldId);
      if (q && student.co_marks[fieldId] !== null && student.co_marks[fieldId] !== undefined && student.co_marks[fieldId] > q.max_marks) {
        return { type: 'max_exceeded', label: 'Max Exceeded', color: 'red' };
      }
    }

    // 3. Check if cell was imported with valid value
    if (importedCells.has(cellKey)) {
      if (fieldType === 'mark' && student.mark !== null) {
        return { type: 'imported', label: 'Imported', color: 'blue' };
      }
      if (fieldType === 'question' && fieldId && student.co_marks[fieldId] !== null && student.co_marks[fieldId] !== undefined) {
        return { type: 'imported', label: 'Imported', color: 'blue' };
      }
    }

    // 4. Check for concurrent edits (future feature)
    if (concurrentEditCells.has(cellKey)) {
      return { type: 'concurrent_edit', label: 'Editing...', color: 'blue' };
    }

    return null;
  };

  const confirmImport = () => {
    if (!importPreview) return;
    // Apply imported data to students state
    const importMap = new Map(importPreview.students.map(s => [s.student_id, s]));
    const newImportedCells = new Set<string>();
    
    setStudents(prev => prev.map(student => {
      const imported = importMap.get(student.id);
      if (!imported) return student;
      
      // Track ALL cells that were imported (including empty ones)
      // Mark field
      if (imported.mark !== undefined) {
        newImportedCells.add(`${student.id}:mark`);
      }
      // Question fields
      if (imported.co_marks) {
        Object.keys(imported.co_marks).forEach(qId => {
          if (imported.co_marks[qId] !== undefined) {
            newImportedCells.add(`${student.id}:${qId}`);
          }
        });
      }
      
      return {
        ...student,
        mark: imported.mark,
        co_marks: imported.co_marks,
        is_absent: imported.is_absent,
        saved: false,
      };
    }));
    
    setImportedCells(newImportedCells);
    setHasChanges(true);
    setImportPhase('success');
    setTimeout(() => {
      setImportPhase('idle');
      setImportPreview(null);
      // DO NOT call loadData() here - marks are only in frontend state until user clicks Save Draft
      // If we refresh now, it will overwrite imported marks with empty DB data
    }, 2500);
  };

  const cancelImport = () => {
    setImportPhase('idle');
    setImportPreview(null);
  };

  // Mark Manager edit: reopen setup
  const editMarkManager = () => {
    if (!examInfo?.mark_manager) return;
    const mm = examInfo.mark_manager;
    const cos: Record<number, MarkManagerCOConfig> = {};
    for (let i = 1; i <= 5; i++) {
      const c = mm.cos[String(i)];
      cos[i] = c ? { enabled: c.enabled, num_items: c.num_items, max_marks: c.max_marks, weight: (c as any).weight || 0 } : { enabled: false, num_items: 5, max_marks: 25, weight: 0 };
    }
    setMmSetup({ cos, cia_enabled: mm.cia_enabled, cia_max_marks: mm.cia_max_marks, cia_weight: (mm as any).cia_weight || 0 });
  };

  /* ────── Get unique departments ────── */
  const uniqueDepartments = Array.from(
    new Set(students.map(s => s.department || 'N/A').filter(Boolean))
  ).sort();

  /* ────── Filtered and sorted students ────── */
  const filteredStudents = students
    .filter(s => {
      // Absent filter
      if (showAbsentOnly && !s.is_absent) return false;
      // Search query filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!s.roll_number.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      }
      // Register number range filter
      if (filterRegisterRange.start || filterRegisterRange.end) {
        const regNum = s.roll_number.toLowerCase();
        if (filterRegisterRange.start && regNum < filterRegisterRange.start.toLowerCase()) return false;
        if (filterRegisterRange.end && regNum > filterRegisterRange.end.toLowerCase()) return false;
      }
      // Department filter
      if (selectedDepartments.size > 0 && !selectedDepartments.has(s.department || 'N/A')) return false;
      // Student selection filter
      if (selectedStudents.size > 0 && !selectedStudents.has(s.id)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortOption === 'department') {
        const deptA = a.department || 'N/A';
        const deptB = b.department || 'N/A';
        if (deptA !== deptB) return deptA.localeCompare(deptB);
        return a.roll_number.localeCompare(b.roll_number);
      }
      // Default: register number
      return a.roll_number.localeCompare(b.roll_number);
    });

  const filteredStudentIndexById = useMemo(() => {
    const m = new Map<string, number>();
    filteredStudents.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [filteredStudents]);

  const questionIndexById = useMemo(() => {
    const m = new Map<string, number>();
    questions.forEach((q, i) => m.set(q.id, i));
    return m;
  }, [questions]);

  const markColCount = questions.length > 0 ? questions.length + 1 : 1;

  /* ────── Render ────── */
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!examInfo) {
    return (
      <div className="p-6 text-center text-red-600">
        Failed to load exam information
      </div>
    );
  }

  const stats = {
    total: students.length,
    entered: students.filter(s => s.mark !== null || s.is_absent).length,
    absent: students.filter(s => s.is_absent).length,
  };
  const hasQ = questions.length > 0;

  const pc = examInfo.publish_control;
  const publishControlEnabled = !!pc?.publish_control_enabled;
  const isEditable = pc?.is_editable ?? !examInfo.is_locked;
  const isLocked = pc?.is_locked ?? examInfo.is_locked;
  const hasPending = !!(examInfo.has_pending_edit_request || pc?.has_pending_request);

  const nowMs = Date.now();

  const editWindowUntilMs = pc?.edit_window_until ? Date.parse(pc.edit_window_until) : NaN;
  const editWindowRemainingSec = Number.isFinite(editWindowUntilMs) && editWindowUntilMs > nowMs
    ? Math.ceil((editWindowUntilMs - nowMs) / 1000)
    : null;

  // Can import if editable OR if we have an active edit window
  const canImport = isEditable || (editWindowRemainingSec !== null && editWindowRemainingSec > 0);

  const formatRemaining = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const openFromMs = pc?.open_from ? Date.parse(pc.open_from) : NaN;
  const dueAtMs = pc?.due_at ? Date.parse(pc.due_at) : NaN;
  const openRemainingSec = Number.isFinite(openFromMs) && openFromMs > nowMs ? Math.ceil((openFromMs - nowMs) / 1000) : 0;
  const dueRemainingSec = Number.isFinite(dueAtMs) ? Math.ceil((dueAtMs - nowMs) / 1000) : null;

  const isDueOver = publishControlEnabled && dueRemainingSec !== null && dueRemainingSec <= 0;
  const isLockedByPublished = isLocked && (examInfo.status === 'PUBLISHED' || examInfo.status === 'LOCKED');

  return (
    <div className="p-2 w-full max-w-none h-screen flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {examInfo.course_code} — {examInfo.name}
          </h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <p className="text-sm text-gray-500">
              {examInfo.course_name} &middot; {examInfo.class_name} &middot; Sec {examInfo.section}
            </p>
            {examInfo.qp_type && (
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">QP: {examInfo.qp_type}</span>
            )}
          </div>
        </div>
        {isLocked && (isLockedByPublished || editWindowRemainingSec === null) && (
          isLockedByPublished ? (
            <span className="relative inline-flex items-center">
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium">Locked by Published</span>
              {isDueOver && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[11px] font-semibold border border-amber-200 shadow-sm">
                  Due date over
                </span>
              )}
            </span>
          ) : (
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium">Locked</span>
          )
        )}
      </div>

      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm shrink-0 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* ───── Toolbar + Table (hidden during Mark Manager setup) ───── */}
      {!(needsMarkManagerSetup && mmSetup) && (<>
      <div className="bg-white rounded-xl shadow-sm border shrink-0">

        {/* Publish control timers (above the table) */}
        {(openRemainingSec > 0 || (publishControlEnabled && dueRemainingSec !== null) || (pc?.edit_window_until_publish || (editWindowRemainingSec !== null && editWindowRemainingSec > 0))) && (
          <div className="px-4 py-2 border-b bg-blue-50/40 text-sm flex flex-wrap items-center gap-4">
            {openRemainingSec > 0 && (
              <span className="inline-flex items-center gap-1.5 text-blue-700">
                <AlertTriangle className="w-4 h-4" />
                Opens in <strong>{formatRemaining(openRemainingSec)}</strong>
              </span>
            )}
            {publishControlEnabled && dueRemainingSec !== null && (
              <span className={`inline-flex items-center gap-1.5 ${dueRemainingSec <= 0 ? 'text-red-700' : 'text-gray-700'}`}>
                <Clock className="w-4 h-4" />
                {dueRemainingSec <= 0 ? 'Due time passed' : <>Due in <strong>{formatRemaining(dueRemainingSec)}</strong></>}
              </span>
            )}

            {(pc?.edit_window_until_publish || (editWindowRemainingSec !== null && editWindowRemainingSec > 0)) && (
              <span className="inline-flex items-center gap-1.5 text-teal-700">
                <Edit2 className="w-4 h-4" />
                {pc?.edit_window_until_publish
                  ? <>Edit window: <strong>until Publish</strong></>
                  : <>Edit window ends in <strong>{formatRemaining(editWindowRemainingSec || 0)}</strong></>
                }
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {/* Left group */}
          <button onClick={loadData} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Load/Refresh Roster
          </button>
          {canImport && (
            <button onClick={resetMarks} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Reset Marks
            </button>
          )}
          <button
            onClick={() => setShowAbsentOnly(p => !p)}
            className={`px-3 py-1.5 text-sm border rounded-lg flex items-center gap-1.5 ${showAbsentOnly ? 'bg-yellow-50 border-yellow-400 text-yellow-700' : 'hover:bg-gray-50'}`}
          >
            <Eye className="w-3.5 h-3.5" /> {showAbsentOnly ? 'Show All' : 'Show Absentees'}
          </button>

          <button
            onClick={() => setSortFilterOpen(!sortFilterOpen)}
            className={`px-3 py-1.5 text-sm border rounded-lg flex items-center gap-1.5 ${
              sortFilterOpen ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Sort/Filter
          </button>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          <button onClick={exportCSV} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={exportExcel} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </button>
          {canImport && (
            <>
              <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Import Excel
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportExcel} className="hidden" />
            </>
          )}
          <button onClick={exportCSV} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Download
          </button>

          {/* Mark Manager edit (user_define mode, already confirmed) */}
          {canImport && examInfo.mark_manager?.enabled && examInfo.mark_manager?.mode === 'user_define' && examInfo.mark_manager?.confirmed && (
            <button onClick={editMarkManager} className="px-3 py-1.5 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5" /> Mark Manager
            </button>
          )}

          {/* Right group — pushed to end */}
          <div className="flex-1" />
          {canImport && (
            <>
              <style>{`
                @keyframes slideInCheck {
                  0% { transform: scale(0.5) rotate(-90deg); opacity: 0; }
                  100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
                @keyframes slideOutSave {
                  0% { transform: scale(1) rotate(0deg); opacity: 1; }
                  100% { transform: scale(0.5) rotate(90deg); opacity: 0; }
                }
                .auto-save-check {
                  animation: slideInCheck 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                .auto-save-save {
                  animation: slideOutSave 0.3s cubic-bezier(0.4, 0, 0.6, 1);
                }
              `}</style>
              <button
                onClick={() => saveMarks(false)}
                disabled={autoSaveStatus === 'saving' || autoSaveStatus === 'saved' || saving}
                className={`px-4 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 text-white transition-all duration-300 ${
                  autoSaveStatus === 'saved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-green-600 hover:bg-green-700'
                } disabled:opacity-75`}
              >
                {autoSaveStatus === 'saving' && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                {autoSaveStatus === 'saved' && (
                  <CheckCircle className="w-3.5 h-3.5 auto-save-check" />
                )}
                {autoSaveStatus === 'idle' && (
                  <Save className="w-3.5 h-3.5" />
                )}
                {autoSaveStatus === 'saving' && 'Saving...'}
                {autoSaveStatus === 'saved' && 'Saved Draft'}
                {autoSaveStatus === 'idle' && 'Save Draft'}
              </button>
              <button
                onClick={handlePublishClick}
                disabled={publishing}
                className="px-4 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {publishing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Publish
              </button>
            </>
          )}

          {!isEditable && isLocked && (
            hasPending ? (
              <button
                onClick={openTrackModal}
                className="px-4 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 bg-red-600 text-white hover:bg-red-700"
              >
                <Clock className="w-3.5 h-3.5" />
                Track
              </button>
            ) : (
              <button
                onClick={openRequestEditModal}
                disabled={processingAction === 'request_edit'}
                className="px-4 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50"
              >
                {processingAction === 'request_edit' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Edit2 className="w-3.5 h-3.5" />}
                Request Edit
              </button>
            )
          )}

          {/* Request Generate — when locked under publish control and Mark Manager is confirmed */}
          {!canImport && isLocked && publishControlEnabled &&
            examInfo.mark_manager?.enabled &&
            examInfo.mark_manager?.confirmed && !hasPending && (
            <button
              onClick={() => {
                setEditReason('Mark Manager generation required');
                openRequestEditModal();
              }}
              disabled={processingAction === 'request_edit'}
              className="px-4 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {processingAction === 'request_edit' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Settings2 className="w-3.5 h-3.5" />}
              Request Generate
            </button>
          )}
        </div>

      {/* Publish Confirmation Modal */}
      {showPublishConfirm && (
        <div className="fixed inset-0 z-[60] bg-slate-950/55 flex items-center justify-center p-4 backdrop-blur-[2px] transition-opacity duration-500">
          <div className={`w-full max-w-xl bg-white/95 rounded-3xl shadow-[0_24px_80px_-20px_rgba(15,23,42,0.55)] border border-slate-200/80 transform transition-all duration-500 animate-in zoom-in-95 overflow-hidden ${publishStatus === 'success' ? 'scale-[1.01]' : ''} ${showSealStamp && publishStatus === 'success' ? 'modal-screen-shake' : ''}`}>
            {publishStatus === 'idle' && (
              <>
                <div className="h-1.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500"></div>
                <div className="p-8 md:p-10 space-y-7">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 shadow-sm">
                      <Send className="w-7 h-7 text-emerald-700" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-bold tracking-[0.2em] text-slate-500 uppercase">Final Action</p>
                      <h3 className="text-3xl font-extrabold text-slate-900 leading-tight">Confirm Mark Publication</h3>
                    </div>
                  </div>

                  <p className="text-base text-slate-600 leading-relaxed">
                    Publishing will finalize this mark entry. After this step, edits can only be made through the formal edit-request workflow.
                  </p>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-700">What happens next</p>
                    <p className="text-sm text-slate-600">. Marks are submitted to the approved record.</p>
                    <p className="text-sm text-slate-600">. Editing is locked immediately after publication.</p>
                    {hasChanges && <p className="text-sm font-semibold text-amber-700">. Unsaved entries will be saved automatically before publish.</p>}
                  </div>
                </div>

                <div className="px-8 py-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
                  <button 
                    onClick={() => closePublishModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmPublish}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-700 to-emerald-600 rounded-xl hover:from-emerald-800 hover:to-emerald-700 transition-colors shadow-[0_10px_25px_-10px_rgba(5,150,105,0.9)]"
                  >
                    Confirm Publish
                  </button>
                </div>
              </>
            )}
            
            {publishStatus === 'loading' && (
              <div className="p-10 md:p-12 text-center space-y-8 flex flex-col items-center justify-center py-16 animate-in fade-in duration-500">
                <div className="relative w-24 h-24">
                  <div className="absolute inset-0 border-[6px] border-emerald-100 rounded-full"></div>
                  <div className="absolute inset-0 border-[6px] border-emerald-700 rounded-full border-t-transparent animate-[spin_1.15s_linear_infinite]"></div>
                  <div className="absolute inset-5 rounded-full bg-emerald-700/10 flex items-center justify-center">
                    <Send className="w-6 h-6 text-emerald-700" />
                  </div>
                </div>

                <div className="space-y-3 max-w-md">
                  <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Publishing In Progress</h3>
                  <p className="text-sm font-medium text-slate-600">Validating entries, syncing records, and applying final lock controls.</p>
                </div>

                <div className="w-full max-w-md h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full w-2/3 bg-gradient-to-r from-emerald-700 via-emerald-500 to-teal-500 animate-[pulse_1.2s_ease-in-out_infinite]"></div>
                </div>
              </div>
            )}
            
            {publishStatus === 'success' && (
              <div className="relative p-8 md:p-10 flex flex-col md:flex-row items-stretch justify-between bg-gradient-to-br from-slate-50 to-white gap-7 md:gap-10">
                <style>{`
                  @keyframes checkmarkDraw {
                    0% { 
                      stroke-dasharray: 52;
                      stroke-dashoffset: 52;
                    }
                    100% { 
                      stroke-dasharray: 52;
                      stroke-dashoffset: 0;
                    }
                  }
                  @keyframes circleFill {
                    0% { 
                      r: 0;
                      opacity: 0;
                    }
                    30% { opacity: 1; }
                    100% { 
                      r: 48;
                      opacity: 1;
                    }
                  }
                  @keyframes titleSlideIn {
                    0% {
                      opacity: 0;
                      transform: translateX(12px);
                    }
                    100% {
                      opacity: 1;
                      transform: translateX(0);
                    }
                  }
                  @keyframes subtitleFadeIn {
                    0% { opacity: 0; }
                    100% { opacity: 1; }
                  }
                  /* SEAL ANIMATIONS */
                  @keyframes sealSpinDropStick {
                    0% {
                      opacity: 0;
                      transform: translate(-50%, -50%) rotate(0deg) scale(0.3);
                    }
                    50% {
                      opacity: 1;
                      transform: translate(-50%, -50%) rotate(720deg) scale(1.2);
                    }
                    85% {
                      transform: translate(-50%, -50%) rotate(780deg) scale(1.15);
                    }
                    100% {
                      opacity: 1;
                      transform: translate(-50%, -50%) rotate(810deg) scale(1);
                    }
                  }
                  @keyframes sealSwingStamp {
                    0% {
                      opacity: 0;
                      transform: translate(-50%, -50%) rotate(-35deg) translateY(-25px) scale(0.4);
                      filter: drop-shadow(0 0 0px rgba(239, 68, 68, 0));
                    }
                    25% {
                      opacity: 1;
                      transform: translate(-50%, -50%) rotate(-20deg) translateY(-15px) scale(0.7);
                      filter: drop-shadow(0 2px 8px rgba(239, 68, 68, 0.3));
                    }
                    50% {
                      opacity: 1;
                      transform: translate(-50%, -50%) rotate(0deg) translateY(8px) scale(1.08);
                      filter: drop-shadow(0 8px 16px rgba(239, 68, 68, 0.5));
                    }
                    65% {
                      transform: translate(-50%, -50%) rotate(2deg) translateY(0px) scale(1.01);
                      filter: drop-shadow(0 4px 12px rgba(239, 68, 68, 0.4));
                    }
                    80% {
                      transform: translate(-50%, -50%) rotate(-1deg) translateY(1px) scale(0.99);
                      filter: drop-shadow(0 3px 10px rgba(239, 68, 68, 0.35));
                    }
                    100% {
                      opacity: 1;
                      transform: translate(-50%, -50%) rotate(0deg) translateY(0px) scale(1);
                      filter: drop-shadow(0 4px 12px rgba(239, 68, 68, 0.3));
                    }
                  }
                  @keyframes sealGlowPulse {
                    0% {
                      opacity: 0;
                      transform: translate(-50%, -50%) scale(0.8);
                      filter: drop-shadow(0 0 0px rgba(239, 68, 68, 0.6));
                    }
                    30% {
                      opacity: 1;
                      transform: translate(-50%, -50%) scale(1);
                      filter: drop-shadow(0 0 15px rgba(239, 68, 68, 0.8));
                    }
                    60% {
                      filter: drop-shadow(0 0 25px rgba(239, 68, 68, 0.6));
                    }
                    100% {
                      opacity: 1;
                      transform: translate(-50%, -50%) scale(1);
                      filter: drop-shadow(0 8px 20px rgba(239, 68, 68, 0.3));
                    }
                  }
                  @keyframes sealBouncePress {
                    0% {
                      opacity: 0;
                      transform: translate(-50%, -50%) translateY(-30px) scale(0.4);
                    }
                    50% {
                      opacity: 1;
                      transform: translate(-50%, -50%) translateY(5px) scale(1.05);
                    }
                    70% {
                      transform: translate(-50%, -50%) translateY(-2px) scale(0.98);
                    }
                    100% {
                      opacity: 1;
                      transform: translate(-50%, -50%) translateY(0px) scale(1);
                    }
                  }
                  @keyframes screenShake {
                    0%, 100% {
                      transform: translate(0, 0) rotate(0deg);
                    }
                    5% {
                      transform: translate(-5px, -4px) rotate(-0.5deg);
                    }
                    10% {
                      transform: translate(4px, 5px) rotate(0.4deg);
                    }
                    15% {
                      transform: translate(-4px, -5px) rotate(-0.4deg);
                    }
                    20% {
                      transform: translate(5px, 3px) rotate(0.5deg);
                    }
                    25% {
                      transform: translate(-5px, 4px) rotate(-0.45deg);
                    }
                    30% {
                      transform: translate(3px, -5px) rotate(0.45deg);
                    }
                    35% {
                      transform: translate(-3px, 4px) rotate(-0.35deg);
                    }
                    40% {
                      transform: translate(4px, -3px) rotate(0.35deg);
                    }
                    45% {
                      transform: translate(-4px, 3px) rotate(-0.3deg);
                    }
                    50% {
                      transform: translate(3px, -4px) rotate(0.3deg);
                    }
                    55% {
                      transform: translate(-3px, 3px) rotate(-0.25deg);
                    }
                    60% {
                      transform: translate(2px, -3px) rotate(0.25deg);
                    }
                    65% {
                      transform: translate(-2px, 3px) rotate(-0.2deg);
                    }
                    70% {
                      transform: translate(3px, -2px) rotate(0.2deg);
                    }
                    75% {
                      transform: translate(-2px, 2px) rotate(-0.15deg);
                    }
                    80% {
                      transform: translate(2px, -2px) rotate(0.15deg);
                    }
                    85% {
                      transform: translate(-1px, 1px) rotate(-0.1deg);
                    }
                    90% {
                      transform: translate(1px, -1px) rotate(0.1deg);
                    }
                    95% {
                      transform: translate(-0.5px, 0.5px) rotate(-0.05deg);
                    }
                  }
                  .modal-screen-shake {
                    animation: screenShake 0.6s ease-in-out;
                  }
                  .seal-animation-spin {
                    animation: sealSpinDropStick 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s forwards;
                  }
                  .seal-animation-swing {
                    animation: sealSwingStamp 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0s forwards;
                  }
                  .seal-animation-glow {
                    animation: sealGlowPulse 1.5s ease-out 0.2s forwards;
                  }
                  .seal-animation-bounce {
                    animation: sealBouncePress 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s forwards;
                  }
                  .success-checkmark {
                    animation: checkmarkDraw 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.4s forwards;
                    stroke-dasharray: 52;
                    stroke-dashoffset: 52;
                  }
                  .success-circle {
                    animation: circleFill 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                  }
                  .success-title {
                    animation: titleSlideIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.3s forwards;
                    opacity: 0;
                  }
                  .success-subtitle {
                    animation: subtitleFadeIn 0.5s ease-out 0.5s forwards;
                    opacity: 0;
                  }
                `}</style>

                {/* LEFT COLUMN - Instructions */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <h2 className="success-title text-2xl md:text-3xl font-bold text-slate-900 tracking-tight mb-4">
                      Marks Published
                    </h2>
                    <p className="success-subtitle text-sm text-slate-600 leading-relaxed mb-6">
                      Your marks have been successfully submitted and official records are now locked.
                    </p>
                  </div>

                  {/* Info cards - left column */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-100/50">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2.5 flex-shrink-0"></div>
                      <p className="text-sm text-slate-600">Records submitted to official database</p>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-100/50">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2.5 flex-shrink-0"></div>
                      <p className="text-sm text-slate-600">Editing locked — request edit if changes needed</p>
                    </div>
                  </div>

                  {/* Action Section - Button and Timer */}
                  <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col gap-4">
                    <button 
                      onClick={() => closePublishModal(true)}
                      className="w-full px-6 py-2.5 text-sm font-semibold text-blue-700 bg-white border-2 border-blue-300 rounded-xl hover:bg-blue-50 transition-colors"
                    >
                      Back to Mark Entry
                    </button>
                    
                    {/* Countdown Timer - below button */}
                    {publishCountdown !== null && publishCountdown > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-slate-500 mb-1">Auto-closing in</p>
                        <div className="text-2xl font-bold text-emerald-600">
                          {publishCountdown}s
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN - Checkmark + Seal */}
                <div className="flex-1 flex flex-col items-center justify-center relative min-w-0">
                  {/* SEAL STAMP - positioned in top-right, extends beyond popup */}
                  {showSealStamp && (
                    <div className="absolute top-4 right-4 seal-animation-swing w-28 h-28 md:w-32 md:h-32 pointer-events-none" style={{ filter: 'drop-shadow(0 12px 24px rgba(0, 0, 0, 0.22))' }}>
                      {sealImageUrl ? (
                        <img 
                          src={sealImageUrl} 
                          alt="Official Seal" 
                          className="w-full h-full object-contain drop-shadow-lg"
                        />
                      ) : (
                        <svg viewBox="0 0 200 200" className="w-full h-full">
                          {/* Outer circle ring */}
                          <circle cx="100" cy="100" r="95" fill="none" stroke="#ef4444" strokeWidth="3" opacity="0.8" />
                          
                          {/* Inner decorative circle */}
                          <circle cx="100" cy="100" r="85" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.5" />
                          
                          {/* Center seal badge */}
                          <circle cx="100" cy="100" r="60" fill="#ef4444" opacity="0.95" />
                          
                          {/* Checkmark inside badge */}
                          <polyline points="80,100 95,115 125,75" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
                          
                          {/* Decorative text around circle - OFFICIAL SEAL */}
                          <defs>
                            <path id="sealCircle" d="M 100, 100 m -70, 0 a 70,70 0 1,1 140,0 a 70,70 0 1,1 -140,0" fill="none" />
                          </defs>
                          <text fontSize="16" fontWeight="bold" fill="#ef4444" opacity="0.7" letterSpacing="2">
                            <textPath href="#sealCircle" startOffset="0%" textAnchor="start">
                              OFFICIAL SEAL • PUBLISHED • LOCKED
                            </textPath>
                          </text>
                        </svg>
                      )}
                    </div>
                  )}

                  {/* SVG Checkmark Icon - Green Circle + White Checkmark */}
                  <div className="relative w-28 h-28">
                    <svg
                      viewBox="0 0 100 100"
                      className="w-full h-full"
                      style={{ filter: 'drop-shadow(0 4px 12px rgba(16, 185, 129, 0.25))' }}
                    >
                      {/* Filled green circle background - animates in first */}
                      <circle
                        cx="50"
                        cy="50"
                        r="0"
                        fill="#10b981"
                        className="success-circle"
                      />
                      
                      {/* White checkmark - draws on top after circle fills */}
                      <polyline
                        points="32,50 46,62 68,38"
                        fill="none"
                        stroke="white"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="success-checkmark"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Request Edit / Track Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-3">
              <img src={krlogo} alt="IDCS" className="w-8 h-8 rounded" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">AC 2.1</div>
                <div className="text-lg font-semibold text-gray-900">{editModalView === 'track' ? 'Track Edit Request' : 'Request Edit'}</div>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {editModalView === 'reason' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                    <textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter reason for requesting edit access..."
                    />
                    <div className="text-xs text-gray-500 mt-1">This reason will be visible to approvers.</div>
                  </div>
                  {editModalError && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {editModalError}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditModalOpen(false)}
                      className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitEditRequest}
                      disabled={processingAction === 'request_edit'}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                </>
              )}

              {editModalView === 'sending' && (
                <div className="py-10 text-center space-y-3">
                  <div className="text-lg font-semibold text-gray-900">Sending request…</div>
                  <div className="text-sm text-gray-500">Please wait while we submit your request.</div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '240ms' }} />
                  </div>
                </div>
              )}

              {editModalView === 'track' && (
                (() => {
                  const pr = examInfo?.publish_control?.pending_request;
                  const wf = examInfo?.publish_control?.approval_workflow_roles || [];
                  const wfAssignees = examInfo?.publish_control?.approval_workflow_assignees || [];
                  const status = String(pr?.status || '').toUpperCase();
                  const history = Array.isArray(pr?.approval_history) ? pr?.approval_history : [];
                  const currentStage = Math.max(1, Number(pr?.current_stage || 1));

                  const assigneeByRole = new Map(
                    wfAssignees
                      .filter((a) => a && a.role)
                      .map((a) => [String(a.role).toUpperCase(), a] as const)
                  );

                  const liveExpiresSec = (() => {
                    const expiresAt = pr?.expires_at;
                    if (!expiresAt) return null;
                    const ms = Date.parse(expiresAt);
                    if (!Number.isFinite(ms)) return null;
                    return Math.max(0, Math.ceil((ms - Date.now()) / 1000));
                  })();

                  const steps = [
                    { key: 'FACULTY', label: 'Faculty' },
                    ...wf.map((r) => {
                      const role = String(r).toUpperCase();
                      const a = assigneeByRole.get(role);
                      return { key: role, label: role, sublabel: a?.user_name || '' };
                    }),
                    { key: 'APPROVED', label: 'Approved' },
                  ];

                  const approvedRoles = new Set(
                    history
                      .filter((h: any) => String(h?.action || '').toUpperCase() === 'APPROVED')
                      .map((h: any) => String(h?.role || '').toUpperCase())
                      .filter(Boolean)
                  );

                  const expiresSec = liveExpiresSec !== null
                    ? liveExpiresSec
                    : (typeof pr?.expires_remaining_seconds === 'number' ? pr.expires_remaining_seconds : null);

                  const requiredRole = (() => {
                    const rr = pr?.required_role ? String(pr.required_role).toUpperCase() : '';
                    if (rr) return rr;
                    const idx = Math.max(0, currentStage - 1);
                    const wfRole = wf[idx] ? String(wf[idx]).toUpperCase() : '';
                    if (wfRole) return wfRole;
                    if (status === 'HOD_PENDING') return 'HOD';
                    if (status === 'IQAC_PENDING') return 'IQAC';
                    return '';
                  })();

                  const stageDoneRoles = new Set(
                    wf
                      .slice(0, Math.max(0, currentStage - 1))
                      .map((r) => String(r || '').toUpperCase())
                      .filter(Boolean)
                  );

                  const pendingStatuses = new Set(['PENDING', 'HOD_PENDING', 'IQAC_PENDING']);

                  const currentKey = (() => {
                    if (status === 'APPROVED') return 'APPROVED';
                    if (status === 'REJECTED') return requiredRole || (wf[0] ? String(wf[0]).toUpperCase() : 'FACULTY');
                    if (pendingStatuses.has(status)) return requiredRole || (wf[Math.max(0, currentStage - 1)] ? String(wf[Math.max(0, currentStage - 1)]).toUpperCase() : (wf[0] ? String(wf[0]).toUpperCase() : 'FACULTY'));
                    return 'FACULTY';
                  })();

                  const isDone = (key: string) => {
                    if (key === 'FACULTY') return true;
                    if (key === 'APPROVED') return status === 'APPROVED';
                    if (status === 'APPROVED') return true;
                    if (approvedRoles.has(key)) return true;
                    if (stageDoneRoles.has(key)) return true;
                    return false;
                  };

                  const nextApprover = (() => {
                    const na = pr?.next_approver;
                    if (na && (na.user_name || na.role)) return na;
                    if (!requiredRole) return null;
                    const a = assigneeByRole.get(requiredRole);
                    if (!a) return { role: requiredRole, user_id: null, user_name: null };
                    return { role: requiredRole, user_id: a.user_id ?? null, user_name: a.user_name ?? null };
                  })();

                  return (
                    <>
                      {!pr ? (
                        <div className="text-sm text-gray-600">No pending request found.</div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">Status: <span className="font-semibold">{status || 'PENDING'}</span></div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                              {expiresSec !== null && (
                                <span>Request expires in <span className="font-semibold text-gray-700">{formatRemaining(expiresSec)}</span></span>
                              )}
                              {nextApprover && (nextApprover.role || nextApprover.user_name) && (
                                <span>
                                  Next approver: <span className="font-semibold text-gray-700">{nextApprover.user_name || '—'}</span>
                                  {nextApprover.role ? <span className="text-gray-600"> ({String(nextApprover.role).toUpperCase()})</span> : null}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3">
                            {pr.requested_by_profile_image ? (
                              <img
                                src={pr.requested_by_profile_image}
                                alt={pr.requested_by_name || pr.requested_by_username || 'User'}
                                className="w-12 h-12 rounded-full object-cover border border-gray-200 bg-white"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                                {initialsFromName(String(pr.requested_by_name || pr.requested_by_username || 'User'))}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {pr.requested_by_name || pr.requested_by_username || '—'}
                              </div>
                              <div className="text-xs text-gray-600 truncate">
                                {pr.requested_by_staff_id || pr.requested_by_username || '—'}
                              </div>
                            </div>
                          </div>

                          <div className="pt-6 pb-4">
                            <div className="relative flex items-start justify-between gap-2">
                              {/* Background Line */}
                              <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0" style={{ left: '12%', right: '12%', width: '76%' }}>
                                <div
                                  className="h-full bg-blue-600 transition-all duration-500"
                                  style={{
                                    width: `${Math.round((Math.max(0, steps.filter(s => isDone(s.key)).length - 1) / Math.max(1, steps.length - 1)) * 100)}%`
                                  }}
                                />
                              </div>
                              {steps.map((s, idx) => {
                                const done = isDone(s.key);
                                const active = s.key === currentKey && status !== 'APPROVED';
                                const circleClass = done
                                  ? 'bg-blue-600 text-white'
                                  : active
                                    ? 'bg-white text-yellow-500 border-2 border-yellow-400'
                                    : 'bg-white text-gray-400 border-2 border-gray-200';
                                
                                return (
                                  <div key={s.key} className="relative z-10 flex flex-col items-center w-24">
                                    <div
                                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${circleClass}`}
                                      title={s.label}
                                    >
                                      {done ? (idx === 0 ? '1' : '✓') : (active ? <Clock className="w-4 h-4 text-yellow-500" /> : <Clock className="w-4 h-4 text-gray-300" />)}
                                    </div>
                                    <div className="mt-2 text-[10px] font-bold text-gray-700 uppercase tracking-widest text-center">
                                      {s.label}
                                    </div>
                                    <div className="mt-1 flex justify-center w-full">
                                      {done ? (
                                        <div className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200 shadow-sm">
                                          {idx === 0 ? 'Submitted' : 'Approved'}
                                        </div>
                                      ) : active ? (
                                        <div className="px-2 py-0.5 border border-yellow-400 text-yellow-600 text-[10px] font-bold rounded-full bg-yellow-50 shadow-sm">
                                          {status === 'REJECTED' ? 'Rejected' : 'Pending'}
                                        </div>
                                      ) : (
                                        <div className="px-2 py-0.5 border border-gray-200 text-gray-400 text-[10px] font-bold rounded-full bg-gray-50 shadow-sm">
                                          Pending
                                        </div>
                                      )}
                                    </div>
                                    {('sublabel' in s && (s as any).sublabel) ? (
                                      <div className="mt-2 text-[11px] font-semibold text-gray-900 text-center truncate max-w-full px-1" title={(s as any).sublabel}>
                                        {(s as any).sublabel}
                                      </div>
                                    ) : idx === 0 && (
                                      <div className="mt-2 text-[11px] font-semibold text-gray-900 text-center truncate max-w-full px-1">
                                        Faculty
                                      </div>
                                    )}
                                    {(!done && !active) && (
                                      <div className="mt-0.5 text-[9px] text-gray-400 italic text-center">
                                        Awaiting
                                      </div>
                                    )}
                                    {(active) && (
                                      <div className="mt-0.5 text-[9px] text-yellow-600 italic text-center">
                                        Awaiting
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {wfAssignees.length > 0 && (
                            <div className="border rounded-lg p-3 bg-white">
                              <div className="text-xs font-semibold text-gray-700 mb-2">Approval stages</div>
                              <div className="space-y-2">
                                {wfAssignees.map((a) => (
                                  <div key={String(a.role)} className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-gray-800">{String(a.role || '').toUpperCase()}</div>
                                    <div className="text-sm text-gray-600 truncate" title={a.user_name || ''}>
                                      {a.user_name || '—'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="border rounded-lg p-3 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-700 mb-1">Reason</div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap">{pr.reason || '—'}</div>
                          </div>
                        </>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1 border-t mt-4">
                        {pr && ['PENDING', 'HOD_PENDING', 'IQAC_PENDING'].includes(status) ? (
                          <button
                            onClick={cancelEditRequest}
                            disabled={processingAction === 'cancel_edit'}
                            className="px-4 py-2 mt-2 rounded-lg border border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-50 text-sm"
                          >
                            {processingAction === 'cancel_edit' ? 'Canceling...' : 'Cancel Request'}
                          </button>
                        ) : (
                          <div />
                        )}
                        <button
                          onClick={() => setEditModalOpen(false)}
                          className="px-4 py-2 mt-2 rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 text-sm"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

        {/* Info chips row */}
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t bg-gray-50/60 rounded-b-xl text-sm">
          <div className="border rounded-lg px-3 py-1.5 bg-white">
            <span className="text-[11px] text-gray-400 block leading-tight">Course</span>
            <span className="font-semibold">{examInfo.course_code}</span>
          </div>
          <div className="border rounded-lg px-3 py-1.5 bg-white">
            <span className="text-[11px] text-gray-400 block leading-tight">Class / Section</span>
            <span className="font-semibold">{examInfo.class_name} / {examInfo.section}</span>
          </div>
          <div className="border rounded-lg px-3 py-1.5 bg-white">
            <span className="text-[11px] text-gray-400 block leading-tight">Max Marks</span>
            <span className="font-semibold">{examInfo.max_marks}</span>
          </div>
          <div className="border rounded-lg px-3 py-1.5 bg-white">
            <span className="text-[11px] text-gray-400 block leading-tight">Progress</span>
            <span className="font-semibold">{stats.entered}/{stats.total}</span>
            {stats.absent > 0 && <span className="text-xs text-yellow-600 ml-1">({stats.absent} absent)</span>}
          </div>
          <div className="border rounded-lg px-3 py-1.5 bg-white">
            <span className="text-[11px] text-gray-400 block leading-tight">Saved</span>
            <span className="font-semibold">{lastSaved || '—'}</span>
          </div>
          <div className="border rounded-lg px-3 py-1.5 bg-white">
            <span className="text-[11px] text-gray-400 block leading-tight">Published</span>
            <span className="font-semibold">{isLocked ? 'Yes' : '—'}</span>
          </div>
          {examInfo.due_date && (
            <div className="border rounded-lg px-3 py-1.5 bg-white">
              <span className="text-[11px] text-gray-400 block leading-tight">Due Date</span>
              <span className="font-semibold">{new Date(examInfo.due_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Search + mode toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by roll number or name..."
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {hasQ && (
          <div className="flex items-center border rounded-lg overflow-hidden text-sm">
            <button type="button" className="sr-only" aria-hidden="true" />
            <button
              onClick={() => {/* no-op, always show CO columns */}}
              className="px-3 py-2 bg-blue-600 text-white text-xs font-medium"
            >
              CO-wise Entry
            </button>
          </div>
        )}
      </div>

      </>)}

      {/* ───── Mark Manager Setup (user_define mode — first time or edit) ───── */}
      {mmSetup && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Settings2 className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-bold text-gray-900">Mark Manager</h2>
            <span className="text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">
              {needsMarkManagerSetup ? 'Setup Required' : 'Editing'}
            </span>
            {!needsMarkManagerSetup && (
              <button onClick={() => setMmSetup(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Select the COs covered by this exam and configure the number of items and max marks per item. Click <strong>Confirm</strong> to generate the question table.
          </p>

          {/* CO checkboxes */}
          <div className="flex flex-wrap items-center gap-3">
            {[1, 2, 3, 4, 5].map(co => (
              <label key={co} className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg cursor-pointer select-none transition-colors ${mmSetup.cos[co]?.enabled ? 'bg-teal-50 border-teal-400 ring-1 ring-teal-400' : 'hover:bg-gray-50'}`}>
                <input
                  type="checkbox"
                  checked={mmSetup.cos[co]?.enabled || false}
                  onChange={e => setMmSetup(prev => prev ? ({
                    ...prev,
                    cos: { ...prev.cos, [co]: { ...prev.cos[co], enabled: e.target.checked } },
                  }) : prev)}
                  className="w-4 h-4 accent-teal-600"
                />
                <span className="text-sm font-medium">CO-{co}</span>
              </label>
            ))}
            <label className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg cursor-pointer select-none transition-colors ${mmSetup.cia_enabled ? 'bg-teal-50 border-teal-400 ring-1 ring-teal-400' : 'hover:bg-gray-50'}`}>
              <input
                type="checkbox"
                checked={mmSetup.cia_enabled}
                onChange={e => setMmSetup(prev => prev ? ({ ...prev, cia_enabled: e.target.checked }) : prev)}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-sm font-medium">Exam</span>
            </label>
          </div>

          {/* Config cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {mmSetup.cia_enabled && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="text-sm font-bold text-gray-800 mb-2">Exam</h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max marks</label>
                    <input
                      type="number" min={0}
                      value={mmSetup.cia_max_marks}
                      onChange={e => setMmSetup(prev => prev ? ({ ...prev, cia_max_marks: Number(e.target.value) || 0 }) : prev)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-teal-600 mb-0.5">Weight</label>
                    <input
                      type="number" step="any" min={0}
                      value={mmSetup.cia_weight}
                      onChange={e => setMmSetup(prev => prev ? ({ ...prev, cia_weight: Number(e.target.value) || 0 }) : prev)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>
            )}
            {[1, 2, 3, 4, 5].filter(co => mmSetup.cos[co]?.enabled).map(co => (
              <div key={co} className="border rounded-lg p-4 bg-gray-50">
                <h4 className="text-sm font-bold text-gray-800 mb-2">CO-{co}</h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-teal-600 mb-0.5">No. of experiments</label>
                    <input
                      type="number" min={1} max={20}
                      value={mmSetup.cos[co].num_items}
                      onChange={e => setMmSetup(prev => prev ? ({
                        ...prev,
                        cos: { ...prev.cos, [co]: { ...prev.cos[co], num_items: Number(e.target.value) || 1 } },
                      }) : prev)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-teal-600 mb-0.5">Max marks per item</label>
                    <input
                      type="number" min={0}
                      value={mmSetup.cos[co].max_marks}
                      onChange={e => setMmSetup(prev => prev ? ({
                        ...prev,
                        cos: { ...prev.cos, [co]: { ...prev.cos[co], max_marks: Number(e.target.value) || 0 } },
                      }) : prev)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-teal-600 mb-0.5">Weight</label>
                    <input
                      type="number" step="any" min={0}
                      value={mmSetup.cos[co].weight}
                      onChange={e => setMmSetup(prev => prev ? ({
                        ...prev,
                        cos: { ...prev.cos, [co]: { ...prev.cos[co], weight: Number(e.target.value) || 0 } },
                      }) : prev)}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total + Confirm */}
          {(Object.values(mmSetup.cos).some(c => c.enabled) || mmSetup.cia_enabled) && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm">
                <span className="font-medium px-2 py-0.5 bg-green-100 text-green-700 rounded">
                  Total: {(mmSetup.cia_enabled ? mmSetup.cia_max_marks : 0) + Object.values(mmSetup.cos).filter(c => c.enabled).reduce((s, c) => s + c.max_marks * c.num_items, 0)} marks
                </span>
                <span className="font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded ml-2">
                  Weights: {((mmSetup.cia_enabled ? mmSetup.cia_weight : 0) + Object.values(mmSetup.cos).filter(c => c.enabled).reduce((s, c) => s + c.weight, 0)).toFixed(2)}
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  {Object.values(mmSetup.cos).filter(c => c.enabled).reduce((s, c) => s + c.num_items, 0)} items across {Object.values(mmSetup.cos).filter(c => c.enabled).length} COs
                  {mmSetup.cia_enabled ? ' + Exam' : ''}
                </span>
              </div>
              <button
                onClick={confirmMarkManager}
                disabled={mmConfirming || (!Object.values(mmSetup.cos).some(c => c.enabled) && !mmSetup.cia_enabled)}
                className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {mmConfirming ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {mmConfirming ? 'Confirming...' : 'Confirm & Generate Table'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ───── Marks Table ───── */}
      {!(needsMarkManagerSetup && mmSetup) && (
      <div className="bg-white rounded-xl shadow-sm border flex-1 min-h-0 overflow-hidden flex flex-col relative">
        <style>{`
          .marks-table-scroll::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          .marks-table-scroll::-webkit-scrollbar-track {
            background: #f9fafb;
            border-radius: 4px;
          }
          .marks-table-scroll::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 4px;
          }
          .marks-table-scroll::-webkit-scrollbar-thumb:hover {
            background: #9ca3af;
          }
        `}</style>
        <div className="marks-table-scroll flex-1 min-h-0 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase w-12">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Roll No</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                {hasQ && questions.map(q => (
                  <th key={q.id} className="px-2 py-2.5 text-center text-xs font-medium text-gray-500 uppercase min-w-[70px]">
                    <div>{q.question_number}</div>
                    <div className="text-[10px] text-gray-400 font-normal">Max: {q.max_marks}</div>
                    {Array.isArray(q.co_number) && q.co_number.length > 0 ? (
                      <div className="text-[10px] text-purple-600 font-normal">{coLabel(q.co_number)}</div>
                    ) : (
                      (typeof q.co_number === 'number' && q.co_number > 0) && (
                        <div className="text-[10px] text-blue-500 font-normal">{coLabel(q.co_number)}</div>
                      )
                    )}
                    {(!q.co_number || (typeof q.co_number === 'number' && q.co_number === 0))
                      && typeof q.question_number === 'string'
                      && q.question_number.trim().toLowerCase() === 'exam'
                      && examInfo?.mark_manager?.cia_enabled && (
                      <div className="text-[10px] text-blue-500 font-normal">split</div>
                    )}
                    {q.btl_level !== null ? (
                      <div className="text-[10px] text-indigo-500 font-normal">BT{q.btl_level}</div>
                    ) : (
                      <div className="relative">
                        {!questionBtls[q.id] && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        )}
                        <select
                          value={questionBtls[q.id] ?? ''}
                          onChange={e => setQuestionBtls(prev => ({ ...prev, [q.id]: e.target.value ? Number(e.target.value) : null }))}
                          className={`mt-0.5 text-[10px] border rounded px-1 py-0.5 w-full transition-colors ${
                            !questionBtls[q.id]
                              ? 'border-amber-400 bg-amber-50 text-amber-700 font-semibold animate-pulse'
                              : 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          }`}
                          title={!questionBtls[q.id] ? 'Select BTL level to enable mark entry for this column' : undefined}
                        >
                          <option value="">BTL?</option>
                          {[1,2,3,4,5,6].map(l => <option key={l} value={l}>BT{l}</option>)}
                        </select>
                      </div>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase min-w-[80px]">
                  Total ({examInfo.max_marks})
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase w-20">Absent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={4 + questions.length + 1 + (showDepartmentColumn ? 1 : 0)} className="px-4 py-8 text-center text-gray-400">
                    {students.length === 0 ? 'No students loaded. Click "Load/Refresh Roster" above.' : 'No matching students.'}
                  </td>
                </tr>
              ) : filteredStudents.map((student, index) => (
                <tr key={student.id} className={`${student.is_absent ? 'bg-yellow-50/40' : ''} ${!student.saved && (student.mark !== null || student.is_absent) ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-3 py-1.5 text-gray-400">{index + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{student.roll_number}</td>
                  <td className="px-3 py-1.5">{student.name}</td>
                  {showDepartmentColumn && (
                    <td className="px-3 py-1.5 text-sm text-gray-600">{student.department || 'N/A'}</td>
                  )}
                  {hasQ && questions.map((q, qIdx) => {
                    const cellLabel = getCellLabel(student.id, 'question', q.id);
                    const labelColors = {
                      red: 'bg-red-100 text-red-700 border-red-200',
                      gray: 'bg-gray-100 text-gray-600 border-gray-200',
                      blue: 'bg-blue-100 text-blue-700 border-blue-200',
                    };
                    const cellKey = `${student.id}:question:${q.id}`;
                    const displayValue = editingCell?.key === cellKey ? editingCell.value : (student.co_marks[q.id] ?? '');
                    const selected = isCellInSelection(index, qIdx);
                    const btlNotSelected = q.btl_level === null && !questionBtls[q.id];
                    return (
                      <td key={q.id} className={`px-1 py-1 relative ${selected ? 'bg-blue-50' : ''} ${btlNotSelected ? 'bg-amber-50/40' : ''}`}>
                        <div className="relative group w-full">
                          <input
                            type="number"
                            data-student-id={student.id}
                            data-field-type="question"
                            data-qid={q.id}
                            value={displayValue}
                            onMouseDown={e => handleCellMouseDown(e, { studentId: student.id, fieldType: 'question', qId: q.id, disabled: !canImport || student.is_absent || btlNotSelected })}
                            onMouseEnter={e => handleCellMouseEnter(e, { studentId: student.id, fieldType: 'question', qId: q.id, disabled: !canImport || student.is_absent || btlNotSelected })}
                            onFocus={e => {
                              setEditingCell({ key: cellKey, value: e.currentTarget.value ?? '' });
                            }}
                            onChange={e => {
                              const v = e.target.value;
                              setEditingCell({ key: cellKey, value: v });
                              // Update numeric state whenever parseable
                              updateQuestionMark(student.id, q.id, v);
                            }}
                            onBlur={e => {
                              const v = e.currentTarget.value;
                              // Finalize and clear editing buffer
                              updateQuestionMark(student.id, q.id, v);
                              setEditingCell(prev => (prev?.key === cellKey ? null : prev));
                            }}
                            onPaste={e => handleCellPaste(e, { studentId: student.id, fieldType: 'question', qId: q.id })}
                            onKeyDown={handleCellKeyDown}
                            disabled={!canImport || student.is_absent || btlNotSelected}
                            min="0"
                            max={q.max_marks}
                            step={wholeNumber ? '1' : '0.01'}
                            className={`w-full px-1.5 py-1 border rounded text-center text-sm focus:ring-2 focus:ring-blue-500 disabled:text-gray-400 ${
                              btlNotSelected
                                ? 'disabled:bg-amber-50 border-amber-200 cursor-not-allowed'
                                : 'disabled:bg-gray-100'
                            } ${selected ? 'ring-2 ring-blue-400' : ''}`}
                            title={btlNotSelected ? 'Select BTL level in the column header first' : undefined}
                          />
                          {btlNotSelected && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-[9px] text-amber-500 font-bold opacity-60">BTL?</span>
                            </div>
                          )}
                          {cellLabel && (
                            <div className={`absolute top-1 right-1 px-2 py-1 text-[10px] font-bold rounded-full border-2 shadow-md whitespace-nowrap z-20 ${labelColors[cellLabel.color as keyof typeof labelColors]}`}>
                              {cellLabel.label}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 relative">
                    <div className="relative group w-full">
                      {(() => {
                        const cellLabel = getCellLabel(student.id, 'mark');
                        const labelColors = {
                          red: 'bg-red-100 text-red-700 border-red-200',
                          gray: 'bg-gray-100 text-gray-600 border-gray-200',
                          blue: 'bg-blue-100 text-blue-700 border-blue-200',
                        };
                        const totalCol = questions.length > 0 ? questions.length : 0;
                        const selected = isCellInSelection(index, totalCol);
                        return (
                          <>
                            <input
                              type="number"
                              data-student-id={student.id}
                              data-field-type="mark"
                              value={(() => {
                                const key = `${student.id}:mark`;
                                return editingCell?.key === key ? editingCell.value : (student.mark ?? '');
                              })()}
                              onMouseDown={e => handleCellMouseDown(e, { studentId: student.id, fieldType: 'mark', disabled: !canImport || student.is_absent || hasQ })}
                              onMouseEnter={e => handleCellMouseEnter(e, { studentId: student.id, fieldType: 'mark', disabled: !canImport || student.is_absent || hasQ })}
                              onFocus={e => {
                                const key = `${student.id}:mark`;
                                setEditingCell({ key, value: e.currentTarget.value ?? '' });
                              }}
                              onChange={e => {
                                const key = `${student.id}:mark`;
                                const v = e.target.value;
                                setEditingCell({ key, value: v });
                                updateMark(student.id, v);
                              }}
                              onBlur={e => {
                                const key = `${student.id}:mark`;
                                const v = e.currentTarget.value;
                                updateMark(student.id, v);
                                setEditingCell(prev => (prev?.key === key ? null : prev));
                              }}
                              onPaste={e => handleCellPaste(e, { studentId: student.id, fieldType: 'mark' })}
                              onKeyDown={handleCellKeyDown}
                              disabled={!canImport || student.is_absent || hasQ}
                              min="0"
                              max={examInfo.max_marks}
                              step={wholeNumber ? '1' : '0.01'}
                              className={`w-full px-1.5 py-1 border rounded text-center text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 ${hasQ ? 'font-semibold bg-gray-50' : ''} ${selected ? 'ring-2 ring-blue-400' : ''}`}
                            />
                            {cellLabel && (
                              <div className={`absolute top-1 right-1 px-2 py-1 text-[10px] font-bold rounded-full border-2 shadow-md whitespace-nowrap z-20 ${labelColors[cellLabel.color as keyof typeof labelColors]}`}>
                                {cellLabel.label}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={student.is_absent}
                      onChange={() => toggleAbsent(student.id)}
                      disabled={!canImport}
                      className="w-4 h-4 text-red-500 rounded border-gray-300 focus:ring-red-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Watermark overlay - professional zigzag slanted seal images on published exams */}
        {examInfo?.status === 'PUBLISHED' && sealWatermarkEnabled && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Professional zigzag watermark pattern with staggered rows extending below table */}
            {[...Array(40)].map((_, idx) => {
              const row = Math.floor(idx / 6);
              const col = idx % 6;
              // Zigzag: odd rows are offset by half a column width
              const isOddRow = row % 2 === 1;
              const offsetX = isOddRow ? 8.33 : 0; // Offset by half column (50%)
              const xPercent = col * 16.67 + offsetX;
              const yPercent = row * 14.3; // Tighter spacing for more rows below table
              
              // Vary opacity slightly for depth (0.08-0.15)
              const baseOpacity = 0.08 + (idx % 3) * 0.035;
              
              return (
                <div
                  key={idx}
                  className="absolute"
                  style={{
                    left: `${xPercent}%`,
                    top: `${yPercent}%`,
                    transform: 'translate(-50%, -50%) rotate(-45deg)',
                    width: '100px',
                    height: '100px',
                    opacity: baseOpacity,
                  }}
                >
                  {sealImageUrl ? (
                    <img 
                      src={sealImageUrl} 
                      alt="Watermark" 
                      className="w-full h-full object-contain"
                      style={{ filter: 'grayscale(20%)' }}
                    />
                  ) : (
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      <circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.8" />
                      <circle cx="100" cy="100" r="60" fill="currentColor" opacity="0.95" />
                      <polyline points="80,100 95,115 125,75" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ───── Sort/Filter Modal ───── */}
      {sortFilterOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSortFilterOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto space-y-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Sort & Filter</h2>
              <button onClick={() => setSortFilterOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Sorting Section */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-600" /> Sorting
              </h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="sort"
                    value="register"
                    checked={sortOption === 'register'}
                    onChange={e => setSortOption(e.target.value as 'register' | 'name' | 'department')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">By Register Number</span>
                </label>
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="sort"
                    value="name"
                    checked={sortOption === 'name'}
                    onChange={e => setSortOption(e.target.value as 'register' | 'name' | 'department')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">By Name</span>
                </label>
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="sort"
                    value="department"
                    checked={sortOption === 'department'}
                    onChange={e => setSortOption(e.target.value as 'register' | 'name' | 'department')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">By Department</span>
                  <span className="text-xs text-gray-500">(shows Department column)</span>
                </label>
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50 border-t pt-2 mt-2">
                  <input
                    type="checkbox"
                    checked={showDepartmentColumn}
                    onChange={e => setShowDepartmentColumn(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-700 font-medium">Show Department Column in Table</span>
                </label>
              </div>
            </div>

            {/* Filtering Section */}
            <div className="space-y-3 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Search className="w-5 h-5 text-teal-600" /> Filtering
              </h3>

              {/* Register Number Range Filter */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <label className="block text-sm font-medium text-gray-700">Register Number Range</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Start (e.g., 001)"
                      value={filterRegisterRange.start}
                      onChange={e => setFilterRegisterRange(p => ({ ...p, start: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="End (e.g., 050)"
                      value={filterRegisterRange.end}
                      onChange={e => setFilterRegisterRange(p => ({ ...p, end: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Department Filter */}
              {uniqueDepartments.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Departments</label>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {uniqueDepartments.map(dept => (
                      <label key={dept} className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-white">
                        <input
                          type="checkbox"
                          checked={selectedDepartments.has(dept)}
                          onChange={e => {
                            const newSet = new Set(selectedDepartments);
                            if (e.target.checked) {
                              newSet.add(dept);
                            } else {
                              newSet.delete(dept);
                            }
                            setSelectedDepartments(newSet);
                          }}
                          className="w-4 h-4 text-teal-600 rounded"
                        />
                        <span className="text-gray-700">{dept}</span>
                        <span className="ml-auto text-xs text-gray-500">
                          ({students.filter(s => (s.department || 'N/A') === dept).length})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Student Selection Filter */}
              {students.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">Students</label>
                    <div className="text-xs text-gray-500">
                      {selectedStudents.size}/{students.length} selected
                    </div>
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {students.map(student => (
                      <label key={student.id} className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-white text-sm">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(student.id)}
                          onChange={e => {
                            const newSet = new Set(selectedStudents);
                            if (e.target.checked) {
                              newSet.add(student.id);
                            } else {
                              newSet.delete(student.id);
                            }
                            setSelectedStudents(newSet);
                          }}
                          className="w-4 h-4 text-teal-600 rounded flex-shrink-0"
                        />
                        <span className="font-mono text-xs text-gray-600 w-16 flex-shrink-0">{student.roll_number}</span>
                        <span className="text-gray-700 truncate flex-1">{student.name}</span>
                        {student.department && (
                          <span className="text-xs text-gray-500 flex-shrink-0">{student.department}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 border-t pt-6">
              <button
                onClick={() => {
                  setSortOption('register');
                  setShowDepartmentColumn(false);
                  setFilterRegisterRange({ start: '', end: '' });
                  setSelectedDepartments(new Set());
                  setSelectedStudents(new Set());
                }}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                Reset All
              </button>
              <button
                onClick={() => setSortFilterOpen(false)}
                className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Import Overlay: Loading ───── */}
      {importPhase === 'loading' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-4 min-w-[320px]">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Processing Excel</h3>
            <p className="text-sm text-gray-500">Matching students by register number...</p>
            <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* ───── Import Overlay: Confirm ───── */}
      {importPhase === 'confirm' && importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Confirm Import</h3>
                <p className="text-sm text-gray-500">Review the import summary below</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{importPreview.matched}</div>
                <div className="text-xs text-green-600">Students Matched</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-700">{importPreview.total_in_class}</div>
                <div className="text-xs text-gray-500">Total in Class</div>
              </div>
              {importPreview.skipped > 0 && (
                <div className="col-span-2 bg-yellow-50 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                  <span className="text-xs text-yellow-700">
                    {importPreview.skipped} row(s) skipped — register number not found in class roster
                  </span>
                </div>
              )}

              {(importPreview.unfilled_count || 0) > 0 && (
                <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-red-700 font-medium">
                      {importPreview.unfilled_count} matched row(s) have empty marks. They will remain blank after import.
                    </span>
                  </div>
                  {(importPreview.unfilled_rows || []).length > 0 && (
                    <div className="text-[11px] text-red-700 max-h-24 overflow-auto space-y-0.5 pl-6">
                      {(importPreview.unfilled_rows || []).slice(0, 5).map((r) => (
                        <div key={`${r.roll_number}-${r.row_number}`}>Row {r.row_number}: {r.roll_number} {r.name ? `- ${r.name}` : ''}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelImport}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${(importPreview.unfilled_count || 0) > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                <CheckCircle className="w-4 h-4" /> Sure, Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Import Overlay: Success ───── */}
      {importPhase === 'success' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-4 min-w-[320px]" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            {/* Animated green tick */}
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#22c55e" strokeWidth="4"
                  strokeDasharray="226" strokeDashoffset="226"
                  style={{ animation: 'circleIn 0.5s ease-out forwards' }} />
                <path d="M24 42 L34 52 L56 30" fill="none" stroke="#22c55e" strokeWidth="4"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="50" strokeDashoffset="50"
                  style={{ animation: 'checkIn 0.3s 0.5s ease-out forwards' }} />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-green-700">Imported Successfully!</h3>
            <p className="text-sm text-gray-500">Marks loaded into table. Review and click Save Draft.</p>
          </div>
        </div>
      )}
    </div>
  );
}
