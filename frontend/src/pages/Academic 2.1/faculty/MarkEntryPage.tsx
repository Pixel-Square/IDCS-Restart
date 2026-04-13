/**
 * Mark Entry Page
 * Enter marks for a specific exam with CO mapping
 * Toolbar: Load/Refresh, Reset Marks, Show Absentees, Export CSV, Export Excel,
 *          Import Excel, Download PDF, Save Draft, Publish
 * Info bar: Course, Batch, Last Saved, Published status
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, Eye, FileSpreadsheet, Upload, Download, Save, Send, Search, Settings2, CheckCircle, X, AlertTriangle, Edit3 } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface Question {
  id: string;
  question_number: string;
  max_marks: number;
  btl_level: number | null;
  co_number: number;
}

interface Student {
  id: string;
  roll_number: string;
  name: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Arrow key cell navigation handler (when arrow_keys inc/dec is OFF)
  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  useEffect(() => { loadData(); }, [examId]);

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

  /* ────── Mark helpers ────── */
  const updateMark = (studentId: string, value: string) => {
    const numValue = value === '' ? null : (wholeNumber ? parseInt(value, 10) : parseFloat(value));
    if (numValue !== null && (isNaN(numValue) || (examInfo && numValue > examInfo.max_marks))) return;
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, mark: numValue, saved: false } : s
    ));
    setHasChanges(true);
  };

  const updateQuestionMark = (studentId: string, qId: string, value: string) => {
    const numValue = value === '' ? 0 : (wholeNumber ? parseInt(value, 10) : parseFloat(value));
    if (isNaN(numValue)) return;
    const q = questions.find(x => x.id === qId);
    if (!q || numValue > q.max_marks) return;
    setStudents(prev => prev.map(s => {
      if (s.id !== studentId) return s;
      const co_marks = { ...s.co_marks, [qId]: numValue };
      const total = Object.values(co_marks).reduce((sum, m) => sum + (m || 0), 0);
      return { ...s, co_marks, mark: total, saved: false };
    }));
    setHasChanges(true);
  };

  const toggleAbsent = (studentId: string) => {
    setStudents(prev => prev.map(s =>
      s.id === studentId
        ? { ...s, is_absent: !s.is_absent, mark: !s.is_absent ? null : s.mark, saved: false }
        : s
    ));
    setHasChanges(true);
  };

  /* ────── Actions ────── */
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
      if (!response.ok) throw new Error('Save failed');
      setStudents(prev => prev.map(s => ({ ...s, saved: true })));
      setHasChanges(false);
      const now = new Date().toLocaleString();
      setLastSaved(now);
      setMessage({ type: 'success', text: publish ? 'Marks published successfully' : 'Draft saved successfully' });
      if (publish) loadData(); // refresh locked status
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save marks' });
    } finally {
      setSaving(false);
      setPublishing(false);
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

  const confirmImport = () => {
    if (!importPreview) return;
    // Apply imported data to students state
    const importMap = new Map(importPreview.students.map(s => [s.student_id, s]));
    setStudents(prev => prev.map(student => {
      const imported = importMap.get(student.id);
      if (!imported) return student;
      return {
        ...student,
        mark: imported.mark,
        co_marks: imported.co_marks,
        is_absent: imported.is_absent,
        saved: false,
      };
    }));
    setHasChanges(true);
    setImportPhase('success');
    setTimeout(() => {
      setImportPhase('idle');
      setImportPreview(null);
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

  /* ────── Filtered students ────── */
  const filteredStudents = students.filter(s => {
    if (showAbsentOnly && !s.is_absent) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.roll_number.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

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

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {examInfo.course_code} — {examInfo.name}
          </h1>
          <p className="text-sm text-gray-500 truncate">
            {examInfo.course_name} &middot; {examInfo.class_name} &middot; Sec {examInfo.section}
          </p>
        </div>
        {examInfo.is_locked && (
          <span className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium">Locked</span>
        )}
      </div>

      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* ───── Toolbar + Table (hidden during Mark Manager setup) ───── */}
      {!(needsMarkManagerSetup && mmSetup) && (<>
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {/* Left group */}
          <button onClick={loadData} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Load/Refresh Roster
          </button>
          {!examInfo.is_locked && (
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

          <div className="w-px h-6 bg-gray-200 mx-1" />

          <button onClick={exportCSV} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={exportExcel} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </button>
          {!examInfo.is_locked && (
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
          {!examInfo.is_locked && examInfo.mark_manager?.enabled && examInfo.mark_manager?.mode === 'user_define' && examInfo.mark_manager?.confirmed && (
            <button onClick={editMarkManager} className="px-3 py-1.5 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5" /> Mark Manager
            </button>
          )}

          {/* Right group — pushed to end */}
          <div className="flex-1" />
          {!examInfo.is_locked && (
            <>
              <button
                onClick={() => saveMarks(false)}
                disabled={!hasChanges || saving}
                className="px-4 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Draft
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Publish marks? This will lock the entry.')) saveMarks(true);
                }}
                disabled={publishing}
                className="px-4 py-1.5 text-sm rounded-lg font-medium flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {publishing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Publish
              </button>
            </>
          )}
        </div>

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
            <span className="font-semibold">{examInfo.is_locked ? 'Yes' : '—'}</span>
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
      <div className="flex items-center gap-3">
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
            <button
              onClick={() => setHasChanges(prev => { /* keep */ return prev; }) || undefined}
              className="sr-only"
            />
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
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase w-12">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Roll No</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                {hasQ && questions.map(q => (
                  <th key={q.id} className="px-2 py-2.5 text-center text-xs font-medium text-gray-500 uppercase min-w-[70px]">
                    <div>{q.question_number}</div>
                    <div className="text-[10px] text-gray-400 font-normal">Max: {q.max_marks}</div>
                    {q.co_number > 0 && (
                      <div className="text-[10px] text-blue-500 font-normal">CO{q.co_number}</div>
                    )}
                    {q.btl_level !== null ? (
                      <div className="text-[10px] text-indigo-500 font-normal">BT{q.btl_level}</div>
                    ) : (
                      <select
                        value={questionBtls[q.id] ?? ''}
                        onChange={e => setQuestionBtls(prev => ({ ...prev, [q.id]: e.target.value ? Number(e.target.value) : null }))}
                        className="mt-0.5 text-[10px] border rounded px-1 py-0.5 w-full"
                      >
                        <option value="">BTL?</option>
                        {[1,2,3,4,5,6].map(l => <option key={l} value={l}>BT{l}</option>)}
                      </select>
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
                  <td colSpan={4 + questions.length + 1} className="px-4 py-8 text-center text-gray-400">
                    {students.length === 0 ? 'No students loaded. Click "Load/Refresh Roster" above.' : 'No matching students.'}
                  </td>
                </tr>
              ) : filteredStudents.map((student, index) => (
                <tr key={student.id} className={`${student.is_absent ? 'bg-yellow-50/40' : ''} ${!student.saved && (student.mark !== null || student.is_absent) ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-3 py-1.5 text-gray-400">{index + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{student.roll_number}</td>
                  <td className="px-3 py-1.5">{student.name}</td>
                  {hasQ && questions.map(q => (
                    <td key={q.id} className="px-1 py-1">
                      <input
                        type="number"
                        value={student.co_marks[q.id] ?? ''}
                        onChange={e => updateQuestionMark(student.id, q.id, e.target.value)}
                        onKeyDown={handleCellKeyDown}
                        disabled={examInfo.is_locked || student.is_absent}
                        min="0"
                        max={q.max_marks}
                        step={wholeNumber ? '1' : '0.5'}
                        className="w-full px-1.5 py-1 border rounded text-center text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      value={student.mark ?? ''}
                      onChange={e => updateMark(student.id, e.target.value)}
                      onKeyDown={handleCellKeyDown}
                      disabled={examInfo.is_locked || student.is_absent || hasQ}
                      min="0"
                      max={examInfo.max_marks}
                      step={wholeNumber ? '1' : '0.5'}
                      className={`w-full px-1.5 py-1 border rounded text-center text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 ${hasQ ? 'font-semibold bg-gray-50' : ''}`}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={student.is_absent}
                      onChange={() => toggleAbsent(student.id)}
                      disabled={examInfo.is_locked}
                      className="w-4 h-4 text-red-500 rounded border-gray-300 focus:ring-red-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Confirm Import
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
