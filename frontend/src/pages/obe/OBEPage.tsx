import React, { useEffect, useMemo, useState } from 'react';

import CDAPPage from '../lca/CDAPPage';
import ArticulationMatrixPage from '../lca/ArticulationMatrixPage';
import MarkEntryPage from '../MarkEntryPage';
// import LcaInstructionsPage from './LcaInstructionsPage';
import '../../styles/obe-theme.css';

// OBE/marks/COAttainment fetch and types removed
import { getMe } from '../../services/auth';
import {
  fetchMyTeachingAssignments,
  TeachingAssignmentItem,
  fetchPublishedSsa1,
  fetchPublishedSsa2,
  fetchPublishedReview1,
  fetchPublishedReview2,
  fetchPublishedFormative,
  fetchCiaMarks,
  fetchPublishedModelSheet,
  fetchPublishedCiaSheet,
  fetchDraft,
} from '../../services/obe';
import { fetchTeachingAssignmentRoster } from '../../services/roster';

function apiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return String(fromEnv).replace(/\/+$/, '');

  // Default to same-origin so `/api/...` works behind nginx/proxy setups.
  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = String(window.location.hostname || '').trim().toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000';
    return String(window.location.origin).replace(/\/+$/, '');
  }

  return 'https://db.krgi.co.in';
}

const API_BASE = apiBase();
const PRIMARY_API_BASE = API_BASE;
const FALLBACK_API_BASE = 'http://localhost:8000';

async function fetchWithFallback(url, options) {
  try {
    const res = await fetch(`${PRIMARY_API_BASE}${url}`, options);
    if (!res.ok) throw new Error('Primary failed');
    return res;
  } catch (e) {
    // Only attempt the http://localhost fallback when the frontend itself
    // is running on a localhost host. Browsers block requests from secure
    // public origins to loopback/private addresses (Private Network Access),
    // so avoid hitting the fallback when served from https production sites.
    if (typeof window !== 'undefined') {
      const h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1') {
        const res = await fetch(`${FALLBACK_API_BASE}${url}`, options);
        return res;
      }
    }
    throw e;
  }
}

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('access');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Me = {
  id?: number;
  username?: string;
  faculty_id?: string | number;
  staff_id?: string | number;
  employee_id?: string | number;
  roles?: string[];
  permissions?: string[];
};

type ParsedQuestion = {
  question_text: string;
  type?: string | null;
  options?: any[] | null;
  images?: any[] | null;
  correct_answer?: string | null;
  answer_text?: string | null;
  btl?: number | string | null;
  marks?: number | string | null;
  chapter?: string | null;
  course_outcomes?: string | null;
  course_outcomes_numbers?: string | null;
  excel_type?: string | null;
  course_code?: string | null;
  course_name?: string | null;
  semester?: string | null;
  source_file_path?: string | null;
};

type OBEItem = {
  id: number;
  course: string;
  outcome: string;
  assessment: string;
  target: string;
  achieved: string;
};

type TabKey = 'courses' | 'exam' | 'progress';

type ObeProgressExam = {
  assessment: string;
  label?: string | null;
  rows_filled: number;
  total_students: number;
  percentage: number;
  published: boolean;
};

type ObeProgressTeachingAssignment = {
  id: number | null;
  subject_code: string | null;
  subject_name: string | null;
  enabled_assessments: string[];
  exam_progress: ObeProgressExam[];
};

type ObeProgressStaff = {
  id: number;
  name: string;
  user_id: number | null;
  teaching_assignments: ObeProgressTeachingAssignment[];
};

type ObeProgressSection = {
  id: number | null;
  name: string | null;
  batch: { id: number | null; name: string | null };
  course: { id: number | null; name: string | null };
  department: { id: number | null; code: string | null; name: string | null; short_name: string | null };
  staff: ObeProgressStaff[];
};

type ObeProgressResponse = {
  role: 'HOD' | 'ADVISOR' | 'FACULTY' | string;
  academic_year: { id: number | null; name: string | null } | null;
  department: { id: number | null; code: string | null; name: string | null; short_name: string | null } | null;
  sections: ObeProgressSection[];
};

export default function OBEPage(): JSX.Element {
  const [data, setData] = useState<OBEItem[]>([]);

  // OBE/marks/COAttainment UI removed
  const [activeTab, setActiveTab] = useState<TabKey>('courses');

  const [me, setMe] = useState<Me | null>(null);

  const cachedRoles = useMemo((): string[] => {
    try {
      const raw = window.localStorage.getItem('roles');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((r) => String(r)) : [];
    } catch {
      return [];
    }
  }, []);

  const effectiveRoles = useMemo((): string[] => {
    const fromMe = (me as any)?.roles;
    if (Array.isArray(fromMe)) return fromMe.map((r) => String(r));
    return cachedRoles;
  }, [me, cachedRoles]);

  const canViewProgress = useMemo(() => {
    const rolesUpper = new Set(effectiveRoles.map((r) => String(r || '').trim().toUpperCase()));
    return rolesUpper.has('HOD') || rolesUpper.has('AHOD') || rolesUpper.has('ADVISOR');
  }, [effectiveRoles]);

  const [assignments, setAssignments] = useState<TeachingAssignmentItem[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Import wizard state (Exam Management)
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scannedQuestions, setScannedQuestions] = useState<ParsedQuestion[]>([]);
  const [uploadedDocxPath, setUploadedDocxPath] = useState<string | null>(null);

  const [examName, setExamName] = useState('');
  // examAssessment: CIA1/CIA2/MODEL/ESE
  const [examAssessment, setExamAssessment] = useState('');
  // examType: QP1/QP2 (named by UI as 'Exam Type')
  const [examType, setExamType] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examSections, setExamSections] = useState('');

  const [importingToBank, setImportingToBank] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; failed?: Array<{ index: number; error: string }> } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [recentImports, setRecentImports] = useState<Array<any>>([]);
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [selectedRecentIndex, setSelectedRecentIndex] = useState<number>(0);
  const [uploadedFiles, setUploadedFiles] = useState<Array<any>>([]);
  const [previewUpload, setPreviewUpload] = useState<any | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[] | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Progress overview state
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<ObeProgressResponse | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  // Progress chip modal state
  type ProgressModalMeta = {
    taId: number | null;
    subjectCode: string;
    subjectName: string;
    assessment: string;
    label: string;
    staffName: string;
    sectionName: string;
    published: boolean;
  };
  type ProgressModalRow = { student_id: string; reg_no: string; name: string; values: (string | null)[] };
  // CIA / Model-style per-question sheet
  type CiaQDef = { key: string; label: string; max: number; co: any; btl: number };
  type CiaSheetRow = { studentId: string; reg_no: string; name: string; absent: boolean; q: Record<string, number | ''> };
  type CiaSheetForModal = {
    termLabel: string;
    batchLabel: string;
    assessmentLabel: string;
    questions: CiaQDef[];
    questionBtl: Record<string, number | ''>;
    rows: CiaSheetRow[];
    coPair: { a: number; b: number };
    maxTotal: number;
    coMax: { a: number; b: number };
    btlMax: Record<number, number>;
    visibleBtls: number[];
  };
  const [progressModal, setProgressModal] = useState<ProgressModalMeta | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMarkCols, setModalMarkCols] = useState<string[]>([]);
  const [modalRows, setModalRows] = useState<ProgressModalRow[] | null>(null);
  const [modalCiaSheet, setModalCiaSheet] = useState<CiaSheetForModal | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  function normalizeImageSrc(img: any): string | null {
    try {
      if (typeof img === 'string') {
        let src = img;
        // plain base64 without data: prefix (heuristic)
        if (!src.startsWith('data:') && /^[A-Za-z0-9+/=\n\r]+$/.test(src) && src.length > 100) {
          src = `data:image/png;base64,${src.replace(/\s+/g, '')}`;
        }
        return src;
      }
      if (img && typeof img === 'object') {
        if (typeof img.url === 'string' && img.url) return img.url;
        if (typeof img.base64 === 'string' && img.base64) {
          return img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`;
        }
        if (img.binary && img.binary instanceof Uint8Array) {
          const blob = new Blob([img.binary], { type: 'image/png' });
          return URL.createObjectURL(blob);
        }
      }
      if (img instanceof Uint8Array) {
        const blob = new Blob([img as any], { type: 'image/png' });
        return URL.createObjectURL(blob);
      }
      return null;
    } catch {
      return null;
    }
  }

  // OBE/marks/COAttainment effect removed

  useEffect(() => {
    // Fetch current user for Faculty ID display
    getMe()
      .then((u) => setMe(u as Me))
      .catch(() => setMe(null));

    // load teaching assignments (non-blocking; 401 treated as empty)
    (async () => {
      try {
        setLoadingAssignments(true);
        const r = await fetchMyTeachingAssignments();
        if (Array.isArray(r)) setAssignments(r);
      } catch (e) {
        // ignore errors here to avoid blocking UI
        console.warn('Failed to load teaching assignments', e);
        setAssignments([]);
      } finally {
        setLoadingAssignments(false);
      }
    })();

    // load uploaded files list for the uploads folder (used when no recents)
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/obe/list-uploads`, { headers: { ...authHeaders() } });
        if (!res.ok) return;
        const js = await res.json();
        if (Array.isArray(js?.files)) setUploadedFiles(js.files || []);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // Guard: Progress is only for HOD / Advisor.
  useEffect(() => {
    if (activeTab === 'progress' && !canViewProgress) {
      setActiveTab('courses');
    }
  }, [activeTab, canViewProgress]);

  const facultyId = useMemo(() => {
    if (!me) return null;
    return me.faculty_id ?? me.staff_id ?? me.employee_id ?? me.id ?? null;
  }, [me]);


  // OBE/marks/COAttainment course selection removed
  const selectedCourse = null;

  // Helper: CO weights for a question in CIA table
  const _ciaCoWeights = (co: any, pair: {a: number; b: number}): {a: number; b: number} => {
    const s = String(co ?? '1').trim();
    if (s === 'both' || s === '1&2' || s === '3&4') return { a: 0.5, b: 0.5 };
    const n = Number(s);
    if (n === pair.a || (pair.a === 3 && n === 1)) return { a: 1, b: 0 };
    if (n === pair.b || (pair.b === 4 && n === 2)) return { a: 0, b: 1 };
    return { a: 0, b: 0 };
  };

  // Parse a CIA/Model published sheet data object into CiaSheetForModal
  const _parseCiaSheetData = (
    data: any,
    assessmentKey: string,
    studentMap: Map<string, {id: number; reg_no: string; name: string}>,
    rosterStudents: Array<{id: number; reg_no: string; name: string}>,
  ): any => {
    if (!data || typeof data !== 'object') return null;

    // Questions may be stored directly or under a legacy key
    const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
    const DEFAULT_Q_KEYS = ['q1','q2','q3','q4','q5','q6','q7','q8','q9'];
    const questions = rawQuestions.length > 0
      ? rawQuestions.map((q: any) => ({
          key: String(q.key || ''),
          label: String(q.label || q.key || ''),
          max: Number(q.max || 0),
          co: q.co ?? 1,
          btl: Number(q.btl || 1),
        }))
      : DEFAULT_Q_KEYS.map((k, i) => ({ key: k, label: k.toUpperCase(), max: i < 6 ? 2 : 16, co: i < 3 ? 1 : i < 6 ? 2 : (i === 8 ? '1&2' : i < 8 ? (i < 7 ? 1 : 2) : 1), btl: [1,3,4,1,1,2,2,3,5][i] ?? 1 }));

    const questionBtl: Record<string, number | ''> = typeof data.questionBtl === 'object' && data.questionBtl ? data.questionBtl : {};

    // rowsByStudentId is the primary data source
    const rowsByStudentId: Record<string, any> = typeof data.rowsByStudentId === 'object' && data.rowsByStudentId ? data.rowsByStudentId : {};

    // Model sheet uses theorySheet (main theory student marks)
    const theorySheet: Record<string, any> = typeof data.theorySheet === 'object' && data.theorySheet ? data.theorySheet : {};
    const theoryQBtl = typeof data.theoryQuestionBtl === 'object' && data.theoryQuestionBtl ? data.theoryQuestionBtl : {};
    const effectiveQBtl = Object.keys(questionBtl).length > 0 ? questionBtl : theoryQBtl;
    const effectiveRows = Object.keys(rowsByStudentId).length > 0 ? rowsByStudentId : theorySheet;

    const isModel = assessmentKey === 'model';
    const aval = assessmentKey === 'cia2' ? 'cia2' : 'cia1';
    const coPair = aval === 'cia2' ? { a: 3, b: 4 } : { a: 1, b: 2 };

    let coMaxA = 0, coMaxB = 0;
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      // Legacy fallback: last question is split if no other split question exists
      const hasAnySplit = questions.some((x: any) => { const s = String(x.co??''); return s==='both'||s==='1&2'||s==='3&4'; });
      const isLast = qi === questions.length - 1;
      let w = _ciaCoWeights(q.co, coPair);
      if (!hasAnySplit && isLast && (String(q.key||'').toLowerCase()==='q9'||String(q.label||'').toLowerCase().includes('q9'))) {
        w = {a: 0.5, b: 0.5};
      }
      coMaxA += q.max * w.a;
      coMaxB += q.max * w.b;
    }

    const btlMaxMap: Record<number, number> = {};
    for (const q of questions) {
      const btlVal = Number((effectiveQBtl as any)[q.key] ?? q.btl);
      if (btlVal >= 1 && btlVal <= 6) btlMaxMap[btlVal] = (btlMaxMap[btlVal] || 0) + q.max;
    }
    const visibleBtls = [1,2,3,4,5,6].filter(n => (btlMaxMap[n] || 0) > 0);
    const maxTotal = questions.reduce((sum: number, q: any) => sum + (q.max || 0), 0);

    const sheetRows: any[] = Object.entries(effectiveRows).map(([sid, row]: [string, any]) => {
      const stu = studentMap.get(sid);
      const rosterStu = rosterStudents.find(s => String(s.id) === sid);
      const regNo = String(row.reg_no || row.registerNo || stu?.reg_no || rosterStu?.reg_no || `(${sid})`);
      const name = stu?.name || rosterStu?.name || String(row.name || '—');
      // theorySheet rows use row.q, model rows may also use row.q; lab total under row.lab
      const qData = row.q || {};
      return { studentId: sid, reg_no: regNo, name, absent: Boolean(row.absent), q: qData };
    });
    sheetRows.sort((a: any, b: any) => a.reg_no.localeCompare(b.reg_no));

    return {
      termLabel: data.termLabel || '',
      batchLabel: data.batchLabel || '',
      assessmentLabel: isModel ? 'MODEL' : (aval === 'cia2' ? 'CIA 2' : 'CIA 1'),
      questions,
      questionBtl: effectiveQBtl,
      rows: sheetRows,
      coPair,
      maxTotal,
      coMax: { a: coMaxA, b: coMaxB },
      btlMax: btlMaxMap,
      visibleBtls,
    };
  };

  // Handler: open the read-only marks modal when a chip is clicked
  const handleChipClick = async (
    ta: ObeProgressTeachingAssignment,
    ex: ObeProgressExam,
    staffName: string,
    sectionName: string,
  ) => {
    if (!ta.subject_code) return;
    const label = (ex.label ? String(ex.label) : String(ex.assessment)).trim().toUpperCase();
    setProgressModal({
      taId: ta.id,
      subjectCode: ta.subject_code,
      subjectName: ta.subject_name || ta.subject_code,
      assessment: ex.assessment,
      label,
      staffName,
      sectionName,
      published: ex.published,
    });
    setModalLoading(true);
    setModalRows(null);
    setModalCiaSheet(null);
    setModalError(null);
    setModalMarkCols([]);

    try {
      const taId = typeof ta.id === 'number' ? ta.id : undefined;
      const code = ta.subject_code;
      const akey = ex.assessment.toLowerCase();

      // Fetch roster to get student names/reg_nos (best effort)
      let rosterStudents: Array<{ id: number; reg_no: string; name: string }> = [];
      if (taId) {
        try {
          const r = await fetchTeachingAssignmentRoster(taId);
          rosterStudents = r.students || [];
        } catch {
          // non-fatal
        }
      }
      const studentMap = new Map(rosterStudents.map((s) => [String(s.id), s]));

      // Helper to build rows from a flat marks record (studentId → value string)
      const buildFlatRows = (marks: Record<string, string | null>, colName: string) => {
        const cols = [colName];
        const rows = Object.entries(marks).map(([sid, val]) => {
          const stu = studentMap.get(sid);
          return { student_id: sid, reg_no: stu?.reg_no ?? `(${sid})`, name: stu?.name ?? '—', values: [val ?? '—'] as (string|null)[] };
        });
        rows.sort((a, b) => a.reg_no.localeCompare(b.reg_no));
        return { cols, rows };
      };

      if (akey === 'cia1' || akey === 'cia2') {
        const aval: 'cia1' | 'cia2' = akey as 'cia1' | 'cia2';
        // Try published sheet first for full per-question view
        let sheetData: any = null;
        try {
          const resp = await fetchPublishedCiaSheet(aval, code, taId);
          sheetData = resp?.data;
        } catch {
          // not published yet → try draft
        }
        if (!sheetData) {
          try {
            const dr = await fetchDraft<any>(aval, code, taId);
            sheetData = dr?.draft;
          } catch { /* ignore */ }
        }
        const parsed = _parseCiaSheetData(sheetData, aval, studentMap, rosterStudents);
        if (parsed && parsed.questions.length > 0) {
          setModalCiaSheet(parsed);
          setModalRows(null);
        } else {
          // absolute fallback: simple total marks
          const resp = await fetchCiaMarks(aval, code, taId);
          const rows = (resp.students || []).map((s) => ({
            student_id: String(s.id), reg_no: s.reg_no || `(${s.id})`, name: s.name || '—',
            values: [resp.marks[String(s.id)] ?? '—'] as (string|null)[],
          }));
          rows.sort((a, b) => a.reg_no.localeCompare(b.reg_no));
          setModalMarkCols([akey === 'cia2' ? 'CIA 2 Total' : 'CIA 1 Total']);
          setModalRows(rows);
          setModalCiaSheet(null);
        }
      } else if (akey === 'model') {
        let sheetData: any = null;
        try {
          const resp = await fetchPublishedModelSheet(code, taId);
          sheetData = resp?.data;
        } catch { /* ignore */ }
        if (!sheetData) {
          try {
            const dr = await fetchDraft<any>('model', code, taId);
            sheetData = dr?.draft;
          } catch { /* ignore */ }
        }
        const parsed = _parseCiaSheetData(sheetData, 'model', studentMap, rosterStudents);
        if (parsed && parsed.questions.length > 0) {
          setModalCiaSheet(parsed);
          setModalRows(null);
        } else {
          const rows = rosterStudents.map((s) => ({ student_id: String(s.id), reg_no: s.reg_no, name: s.name, values: ['—'] as (string|null)[] }));
          rows.sort((a, b) => a.reg_no.localeCompare(b.reg_no));
          setModalMarkCols(['Model Mark']);
          setModalRows(rows);
          setModalCiaSheet(null);
        }
      } else if (akey === 'ssa1') {
        const resp = await fetchPublishedSsa1(code, taId);
        const { cols, rows } = buildFlatRows(resp.marks, 'SSA1 Mark');
        setModalMarkCols(cols);
        setModalRows(rows);
      } else if (akey === 'ssa2') {
        const resp = await fetchPublishedSsa2(code, taId);
        const { cols, rows } = buildFlatRows(resp.marks, 'SSA2 Mark');
        setModalMarkCols(cols);
        setModalRows(rows);
      } else if (akey === 'review1') {
        const resp = await fetchPublishedReview1(code);
        const { cols, rows } = buildFlatRows(resp.marks, 'Review 1');
        setModalMarkCols(cols);
        setModalRows(rows);
      } else if (akey === 'review2') {
        const resp = await fetchPublishedReview2(code);
        const { cols, rows } = buildFlatRows(resp.marks, 'Review 2');
        setModalMarkCols(cols);
        setModalRows(rows);
      } else if (akey === 'formative1' || akey === 'formative2') {
        const aval: 'formative1' | 'formative2' = akey as 'formative1' | 'formative2';
        const resp = await fetchPublishedFormative(aval, code, taId);
        const cols = ['Skill 1', 'Skill 2', 'Att 1', 'Att 2', 'Total'];
        const rows = Object.entries(resp.marks).map(([sid, m]) => {
          const stu = studentMap.get(sid);
          return {
            student_id: sid,
            reg_no: stu?.reg_no ?? `(${sid})`,
            name: stu?.name ?? '—',
            values: [m?.skill1 ?? '—', m?.skill2 ?? '—', m?.att1 ?? '—', m?.att2 ?? '—', m?.total ?? '—'] as (string|null)[],
          };
        });
        rows.sort((a, b) => a.reg_no.localeCompare(b.reg_no));
        setModalMarkCols(cols);
        setModalRows(rows);
      } else {
        // Generic fallback: show roster with no marks
        const rows = rosterStudents.map((s) => ({
          student_id: String(s.id), reg_no: s.reg_no, name: s.name, values: ['—'] as (string|null)[],
        }));
        rows.sort((a, b) => a.reg_no.localeCompare(b.reg_no));
        setModalMarkCols(['Mark']);
        setModalRows(rows);
      }
    } catch (err: any) {
      setModalError(String(err?.message || 'Failed to load marks data'));
      setModalRows([]);
      setModalCiaSheet(null);
    } finally {
      setModalLoading(false);
    }
  };

  const parsePercent = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const navigateToCourse = (code: string) => {
    // navigate to a course-specific OBE page; adjust path if your router differs
    const path = `/obe/course/${encodeURIComponent(code)}`;
    window.location.href = path;
  };

  const visibleQuestions = useMemo(() => {
    return (scannedQuestions || []).filter((q) => {
      const marks = String((q as any)?.marks ?? '').trim().toUpperCase();
      const btl = String((q as any)?.btl ?? '').trim().toUpperCase();
      const co = String((q as any)?.course_outcomes ?? '').trim().toUpperCase();
      return !(marks === '(OR)' && btl === '(OR)' && co === '(OR)');
    });
  }, [scannedQuestions]);

  const [examUploadStatus, setExamUploadStatus] = useState<'idle'|'uploading'|'success'|'error'>('idle');
  const [examUploadMessage, setExamUploadMessage] = useState<string | null>(null);

  // Fetch progress when switching to Progress tab (lazy-load)
  useEffect(() => {
    if (activeTab !== 'progress') return;
    if (!canViewProgress) return;
    if (progressLoading || progressData) return;

    (async () => {
      try {
        setProgressLoading(true);
        setProgressError(null);
        const res = await fetchWithFallback('/api/obe/progress', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `Failed to load progress (${res.status})`);
        }
        const js = (await res.json()) as ObeProgressResponse;
        setProgressData(js);
        // Default selected section: first section (if any)
        if (js.sections && js.sections.length > 0) {
          const first = js.sections[0];
          if (first && first.id != null) setSelectedSectionId(first.id);
        }
      } catch (e: any) {
        setProgressError(e?.message || 'Failed to load progress');
      } finally {
        setProgressLoading(false);
      }
    })();
  }, [activeTab, progressLoading, progressData]);

  async function handleExamUploadFile(f: File) {
    setExamUploadStatus('uploading');
    setExamUploadMessage(null);
    setScanStatus('idle');
    setScanMessage(null);
    setImportResult(null);
    setImportError(null);
    const fd = new FormData();
    fd.append('file', f);
    try {
      // 1) Upload docx (store it)
      const res = await fetch(`${API_BASE}/api/obe/upload-docx`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
        },
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        setExamUploadStatus('error');
        setExamUploadMessage(txt || `Upload failed (${res.status})`);
        return;
      }
      const json = await res.json();
      setExamUploadStatus('success');

      const savedPath = (json?.file_url || json?.saved_path || '') as string;
      setUploadedDocxPath(savedPath || null);
      setExamUploadMessage(`Uploaded: ${savedPath}`);

      // Open wizard immediately (scan continues in background)
      setImportWizardOpen(true);
      setWizardStep(1);
      setScannedQuestions([]);

      // 2) Scan docx into questions and open wizard
      setScanStatus('scanning');
      setScanMessage('Scanning DOCX…');

      const scanFd = new FormData();
      scanFd.append('file', f);

      const scanRes = await fetch(`${API_BASE}/api/template/scan-docx`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
        },
        body: scanFd,
      });

      if (!scanRes.ok) {
        const txt = await scanRes.text();
        setScanStatus('error');
        setScanMessage(txt || `Scan failed (${scanRes.status})`);
        setScannedQuestions([]);
        return;
      }

      const scanJson = await scanRes.json();
      const qs = Array.isArray(scanJson?.questions) ? (scanJson.questions as ParsedQuestion[]) : [];

      // attach source file path on each question for traceability
      const withSource = qs.map((q) => ({ ...q, source_file_path: savedPath || q.source_file_path || null }));
      setScannedQuestions(withSource);
      setScanStatus('success');
      setScanMessage(`Scanned ${withSource.length} question(s).`);

      // Prefill exam name from filename if empty
      if (!examName.trim()) {
        const name = f.name.replace(/\.docx$/i, '');
        setExamName(name);
      }

    } catch (e: any) {
      setExamUploadStatus('error');
      setExamUploadMessage(e?.message || 'Upload failed');
      setScanStatus('error');
      setScanMessage(e?.message || 'Scan failed');
    }
  }

  function closeWizard() {
    setImportWizardOpen(false);
    setWizardStep(1);
  }

  async function handleConfirmImport() {
    if (!examName.trim()) {
      setImportError('Exam name is required.');
      setWizardStep(2);
      return;
    }
    if (!examType.trim()) {
      setImportError('Exam type is required.');
      setWizardStep(2);
      return;
    }
    if (!examDate.trim()) {
      setImportError('Exam date is required.');
      setWizardStep(2);
      return;
    }

    setImportingToBank(true);
    setImportError(null);
    setImportResult(null);

    try {
      const sectionsList = examSections
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      // Put exam meta on each question (non-breaking for backend)
      const payloadQuestions = visibleQuestions.map((q) => ({
        ...q,
        excel_type: q.excel_type || examType,
        source_file_path: q.source_file_path || uploadedDocxPath || null,
      }));

      const res = await fetch(`${API_BASE}/api/import/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          title: examName.trim(),
          status: 'pending',
          exam_type: examType.trim(),
          exam_date: examDate.trim(),
          sections: sectionsList,
          faculty_id: facultyId,
          questions: payloadQuestions,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        setImportError(txt || `Import failed (${res.status})`);
        return;
      }

      const json = await res.json();
      setImportResult(json);
      // add to local recents and show popup
      const newItem = {
        title: examName.trim(),
        inserted: json.inserted || 0,
        failed: Array.isArray(json.failed) ? json.failed.length : 0,
        source_file_path: uploadedDocxPath || null,
        title_id: json.title_id || null,
        exam_date: examDate || null,
        exam_type: examType || null,
        faculty_id: facultyId || null,
        created_at: new Date().toISOString(),
      };
      setRecentImports((r) => [newItem, ...r]);
      setShowImportPopup(true);
      setTimeout(() => setShowImportPopup(false), 4000);
      // close the wizard after successful import
      setTimeout(() => closeWizard(), 600);
    } catch (e: any) {
      setImportError(e?.message || 'Import failed');
    } finally {
      setImportingToBank(false);
    }
  }

  const totalItems = data.length;
  const averageAchievement = totalItems
    ? (data.reduce((sum, it) => sum + parsePercent(it.achieved), 0) / totalItems).toFixed(1) + '%'
    : 'N/A';

      return (
        <main className="obe-page" style={{ padding: '32px 48px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
          <header style={{ marginBottom: 32, background: '#fff', padding: '28px 32px', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
              <div style={{ textAlign: 'left' }}>
                <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  Outcome Based Education (OBE)
                </h1>
                {/* OBE/marks/COAttainment course header removed */}
                <div style={{ marginTop: 8, color: '#64748b', fontSize: 16, fontWeight: 400 }}>
                  Select a course, then work through CDAP, Articulation Matrix and Mark Entry.
                </div>
              </div>
            </div>
          </header>
              {/* Tabs header */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: '#fff', padding: '8px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <button
                  onClick={() => setActiveTab('courses')}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeTab === 'courses' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                    color: activeTab === 'courses' ? '#fff' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: activeTab === 'courses' ? 600 : 500,
                    fontSize: 15,
                    transition: 'all 0.2s ease',
                    boxShadow: activeTab === 'courses' ? '0 2px 8px rgba(37,99,235,0.2)' : 'none'
                  }}
                >
                  📚 Courses
                </button>
                <button
                  onClick={() => setActiveTab('exam')}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeTab === 'exam' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                    color: activeTab === 'exam' ? '#fff' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: activeTab === 'exam' ? 600 : 500,
                    fontSize: 15,
                    transition: 'all 0.2s ease',
                    boxShadow: activeTab === 'exam' ? '0 2px 8px rgba(37,99,235,0.2)' : 'none'
                  }}
                >
                  📝 Exam Management
                </button>
                {canViewProgress && (
                  <button
                    onClick={() => setActiveTab('progress')}
                    style={{
                      padding: '10px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: activeTab === 'progress' ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'transparent',
                      color: activeTab === 'progress' ? '#fff' : '#64748b',
                      cursor: 'pointer',
                      fontWeight: activeTab === 'progress' ? 600 : 500,
                      fontSize: 15,
                      transition: 'all 0.2s ease',
                      boxShadow: activeTab === 'progress' ? '0 2px 8px rgba(22,163,74,0.25)' : 'none'
                    }}
                  >
                    📈 Progress
                  </button>
                )}
              </div>

              {/* Courses tab content */}
              {activeTab === 'courses' && (
                <section
                  aria-label="Course selector"
                  style={{ marginBottom: 32 }}
                >
                  <div style={{ fontSize: 14, color: '#475569', marginBottom: 20, fontWeight: 500 }}>Select a course to work on:</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      gap: 24,
                      marginBottom: 32,
                    }}
                  >
                    {/* Course list: show assignments when available (safe fetch) */}
                    {loadingAssignments ? (
                      <div style={{ gridColumn: '1/-1', color: '#64748b', fontSize: 16, textAlign: 'center', padding: 60, background: '#fff', borderRadius: 12 }}>⏳ Loading courses…</div>
                    ) : assignments.length === 0 ? (
                      <div style={{ gridColumn: '1/-1', color: '#94a3b8', fontSize: 18, textAlign: 'center', padding: 60, background: '#fff', borderRadius: 12, border: '2px dashed #e2e8f0' }}>
                        📭 No courses found. You have no teaching assignments.<br />
                        <span style={{ fontSize: 14, marginTop: 12, display: 'block' }}>(If you expect to see courses here, please check with your backend/API or contact admin.)</span>
                      </div>
                    ) : (
                      assignments
                        .reduce((acc: TeachingAssignmentItem[], it) => {
                          if (!acc.some(a => a.subject_code === it.subject_code)) acc.push(it);
                          return acc;
                        }, [] as TeachingAssignmentItem[])
                        .map((it) => (
                          <div
                            key={it.subject_code}
                            onClick={() => navigateToCourse(it.subject_code)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') navigateToCourse(it.subject_code); }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                            style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: 12,
                              padding: 24,
                              background: '#fff',
                              boxShadow: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              minHeight: 140,
                              position: 'relative',
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 6, color: '#0f172a', lineHeight: 1.3 }}>{it.subject_name}</div>
                            <div style={{ fontSize: 14, color: '#3b82f6', marginBottom: 16, fontWeight: 600, background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>{it.subject_code}</div>
                            <div style={{ marginTop: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigateToCourse(it.subject_code); }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'; e.currentTarget.style.transform = 'scale(1)'; }}
                                style={{
                                  padding: '8px 18px',
                                  borderRadius: 8,
                                  border: 'none',
                                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                  color: '#fff',
                                  fontWeight: 600,
                                  fontSize: 14,
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                Open Course
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation(); window.location.href = `/obe/course/${encodeURIComponent(it.subject_code)}/lca`; }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                style={{
                                  padding: '8px 14px',
                                  borderRadius: 8,
                                  border: '1px solid #e2e8f0',
                                  background: '#fff',
                                  color: '#475569',
                                  fontWeight: 600,
                                  fontSize: 13,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                LCA
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation(); window.location.href = `/obe/course/${encodeURIComponent(it.subject_code)}/co_attainment`; }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                style={{
                                  padding: '8px 14px',
                                  borderRadius: 8,
                                  border: '1px solid #e2e8f0',
                                  background: '#fff',
                                  color: '#475569',
                                  fontWeight: 600,
                                  fontSize: 13,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                CO
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>

                  {/* OBE/marks/COAttainment error display removed */}
                </section>
              )}

              {/* Exam Management tab (placeholder) */}
              {activeTab === 'exam' && (
                <section aria-label="Exam management" style={{ background: '#fff', padding: 28, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Upload area */}
                    <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '2px dashed #cbd5e1' }}>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <input
                          id="exam-upload-input"
                          type="file"
                          accept=".docx"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files && e.target.files[0];
                            if (f) {
                              handleExamUploadFile(f);
                            }
                            // allow re-uploading the same file
                            e.currentTarget.value = '';
                          }}
                        />
                        <label htmlFor="exam-upload-input" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 15, boxShadow: '0 2px 8px rgba(37,99,235,0.25)', transition: 'all 0.2s ease' }}>
                          {examUploadStatus === 'uploading' ? '⏳ Uploading...' : '📤 Upload .docx'}
                        </label>

                        <div style={{ color: '#64748b', fontSize: 14 }}>
                          Upload exam spreadsheets or related files here.
                        </div>
                      </div>
                    </div>

                    {/* Search bar */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <input
                        type="search"
                        placeholder="🔍 Search exams, courses, entries..."
                        style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 15, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                        onChange={() => { /* TODO: wire search */ }}
                      />
                      <button style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#475569', transition: 'all 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Search</button>
                    </div>

                    {/* Recent uploads */}
                    <div style={{ marginTop: 8 }}>
                      <h3 style={{ margin: '12px 0 16px 0', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>📋 Recent</h3>
                      {recentImports.length === 0 ? (
                        <div style={{ color: '#666' }}>
                          {/* No recents: show all uploaded DOCX files for this faculty */}
                          <div style={{ marginBottom: 8, fontSize: 13 }}>Uploaded DOCX files</div>
                          {uploadedFiles.length === 0 ? (
                            <div style={{ color: '#666' }}>No uploaded DOCX files found.</div>
                          ) : (
                            <div style={{ display: 'grid', gap: 8 }}>
                              {uploadedFiles.map((f, i) => (
                                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontWeight: 700 }}>{f.name}</div>
                                      <div style={{ fontSize: 12, color: '#6b7280' }}>{f.path}</div>
                                    </div>
                                    <div>
                                      <button onClick={() => setPreviewUpload(f)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 6 }}>Open</button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {recentImports.slice(0, 12).map((it, idx) => {
                              const selected = idx === selectedRecentIndex;
                              return (
                                <div key={idx} onClick={() => setSelectedRecentIndex(idx)} role="button" tabIndex={0}
                                  style={{ border: selected ? '2px solid #2563eb' : '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                                        <path d="M6 2h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="#e6f0ff" stroke="#2563eb" strokeWidth="0.5" />
                                        <path d="M13 2v6h6" fill="#fff" />
                                        <rect x="7" y="11" width="10" height="2.2" rx="0.6" fill="#2563eb" />
                                        <rect x="7" y="14" width="6" height="2.2" rx="0.6" fill="#2563eb" />
                                        <text x="7" y="18.8" fontSize="2.8" fill="#2563eb" fontFamily="Arial, Helvetica, sans-serif">DOCX</text>
                                      </svg>
                                      <div style={{ fontWeight: 700 }}>{it.title}</div>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>{it.exam_type || '—'} • {it.exam_date || '—'}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 800, color: '#16a34a' }}>{it.inserted}</div>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>questions</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div>
                            {/* Preview pane: show Step 3 style confirmation for selected recent */}
                            {recentImports[selectedRecentIndex] && (
                              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
                                  <div>
                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <div style={{ width: 64, height: 64, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6b7280' }}>
                                          {me?.username ? String(me.username).slice(0,1).toUpperCase() : 'U'}
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{me?.username || '—'}</div>
                                          <div style={{ fontSize: 13, color: '#6b7280' }}>Faculty</div>
                                          <div style={{ fontSize: 13, color: '#6b7280' }}>—</div>
                                        </div>
                                      </div>
                                      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Faculty ID: <strong style={{ color: '#111827' }}>{facultyId ?? '—'}</strong></div>
                                    </div>

                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Course details</div>
                                      <div style={{ fontWeight: 700 }}>—</div>
                                      <div style={{ fontSize: 13, color: '#6b7280' }}>—</div>
                                      <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>Assignments: <strong style={{ color: '#111827' }}>—</strong></div>
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                        <div>
                                          <div style={{ fontSize: 12, color: '#6b7280' }}>Questions imported</div>
                                          <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>{recentImports[selectedRecentIndex].inserted}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                          <div style={{ fontSize: 12, color: '#6b7280' }}>Title</div>
                                          <div style={{ fontWeight: 700 }}>{recentImports[selectedRecentIndex].title || '—'}</div>
                                          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Assessment</div>
                                          <div style={{ fontWeight: 700 }}>{recentImports[selectedRecentIndex].exam_type || '—'}</div>
                                        </div>
                                      </div>

                                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam Type</span><div style={{ fontWeight: 700 }}>{recentImports[selectedRecentIndex].exam_type || '—'}</div></div>
                                        <div><span style={{ color: '#6b7280', fontSize: 12 }}>Exam date</span><div style={{ fontWeight: 700 }}>{recentImports[selectedRecentIndex].exam_date || '—'}</div></div>
                                        <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#6b7280', fontSize: 12 }}>Uploaded file</span><div style={{ fontWeight: 700, whiteSpace: 'pre-wrap' }}>{recentImports[selectedRecentIndex].source_file_path || '—'}</div></div>
                                      </div>
                                    </div>

                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div style={{ fontSize: 13, color: '#6b7280' }}>Questions preview</div>
                                        <div>
                                          <button
                                            onClick={async () => {
                                              setPreviewQuestions(null);
                                              try {
                                                // try title_id first
                                                const tid = recentImports[selectedRecentIndex]?.title_id;
                                                let url = '';
                                                if (tid) url = `${API_BASE}/api/import/questions/list?title_id=${tid}`;
                                                else url = `${API_BASE}/api/import/questions/list?title=${encodeURIComponent(recentImports[selectedRecentIndex]?.title || '')}`;
                                                const resp = await fetch(url, { headers: { ...authHeaders() } });
                                                if (!resp.ok) {
                                                  setPreviewQuestions([]);
                                                  return;
                                                }
                                                const js = await resp.json();
                                                setPreviewQuestions(Array.isArray(js?.questions) ? js.questions : []);
                                              } catch (e) {
                                                setPreviewQuestions([]);
                                              }
                                            }}
                                            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
                                          >
                                            Load questions
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ maxHeight: 220, overflow: 'auto' }}>
                                        {previewQuestions === null ? (
                                          <div style={{ color: '#6b7280' }}>Click "Load questions" to fetch saved questions for this import.</div>
                                        ) : previewQuestions.length === 0 ? (
                                          <div style={{ color: '#6b7280' }}>No saved questions found for this title.</div>
                                        ) : (
                                          previewQuestions.slice(0, 20).map((q, i) => (
                                            <div key={i} style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                                              <div style={{ fontWeight: 700, color: '#111827' }}>{i+1}.</div>
                                              <div style={{ color: '#111827' }}>{String(q.question_text).slice(0, 300)}</div>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {examUploadMessage && (
                      <div style={{ marginTop: 12, fontSize: 14, color: examUploadStatus === 'error' ? '#dc2626' : '#16a34a', background: examUploadStatus === 'error' ? '#fef2f2' : '#f0fdf4', padding: '12px 16px', borderRadius: 10, border: `1px solid ${examUploadStatus === 'error' ? '#fecaca' : '#bbf7d0'}` }}>{examUploadMessage}</div>
                    )}
                  </div>
                </section>
              )}

              {/* Progress overview tab */}
              {activeTab === 'progress' && canViewProgress && (
                <section aria-label="OBE progress overview" style={{ background: '#f8fafc', padding: 0, borderRadius: 16 }}>
                  {/* ── Header bar ── */}
                  <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '16px 16px 0 0', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.3px' }}>
                        📊 Section-wise Exam Progress
                      </div>
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                        {progressData?.role === 'HOD' && progressData.department
                          ? `HOD view • ${progressData.department.short_name || progressData.department.code || progressData.department.name || ''}`
                          : progressData?.role === 'ADVISOR'
                            ? 'Advisor view • Your advised sections'
                            : 'Faculty view • Your sections'}
                      </div>
                    </div>
                    {progressData?.academic_year?.name && (
                      <span style={{ padding: '4px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(8px)' }}>
                        AY {progressData.academic_year.name}
                      </span>
                    )}
                  </div>

                  <div style={{ padding: '20px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {progressLoading && (
                      <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 15 }}>
                        <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                        Loading progress data…
                      </div>
                    )}

                    {progressError && !progressLoading && (
                      <div style={{ padding: 16, borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>❌</span> {progressError}
                      </div>
                    )}

                    {!progressLoading && !progressError && progressData && (
                      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>

                        {/* ── Left: section picker ── */}
                        <div style={{ position: 'sticky', top: 16 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, paddingLeft: 4 }}>
                            Sections ({progressData.sections?.length ?? 0})
                          </div>
                          {(!progressData.sections || progressData.sections.length === 0) && (
                            <div style={{ padding: 20, borderRadius: 12, border: '1px dashed #e2e8f0', background: '#fff', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
                              No sections found
                            </div>
                          )}
                          {progressData.sections && progressData.sections.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {progressData.sections.map((sec) => {
                                const sid = sec.id ?? -1;
                                const selected = selectedSectionId === sid;
                                const secLabel = `${sec.batch?.name ?? ''} ${sec.name ?? ''}`.trim() || sec.name || 'Unnamed section';
                                const totalTAs = sec.staff.reduce((a, s) => a + s.teaching_assignments.length, 0);
                                const totalPublished = sec.staff.reduce((a, s) =>
                                  a + s.teaching_assignments.reduce((b, ta) =>
                                    b + ta.exam_progress.filter((e) => e.published).length, 0), 0);
                                const totalExams = sec.staff.reduce((a, s) =>
                                  a + s.teaching_assignments.reduce((b, ta) =>
                                    b + ta.exam_progress.length, 0), 0);
                                return (
                                  <button
                                    key={sid}
                                    onClick={() => setSelectedSectionId(sid)}
                                    style={{
                                      textAlign: 'left',
                                      padding: '12px 14px',
                                      borderRadius: 12,
                                      border: selected ? '2px solid #22c55e' : '1px solid #e2e8f0',
                                      background: selected ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#fff',
                                      cursor: 'pointer',
                                      fontSize: 13,
                                      color: '#0f172a',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 4,
                                      boxShadow: selected ? '0 0 0 3px rgba(34,197,94,0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                                      <span style={{ fontWeight: 700, lineHeight: 1.3 }}>{secLabel}</span>
                                      {selected && <span style={{ fontSize: 14, flexShrink: 0 }}>✓</span>}
                                    </div>
                                    {sec.course?.name && (
                                      <span style={{ fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>{sec.course.name}</span>
                                    )}
                                    {totalExams > 0 && (
                                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ flex: 1, height: 4, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                                          <div style={{ height: '100%', width: `${totalExams > 0 ? (totalPublished / totalExams) * 100 : 0}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: 999, transition: 'width 0.4s ease' }} />
                                        </div>
                                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                          {totalPublished}/{totalExams}
                                        </span>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* ── Right: section detail ── */}
                        <div>
                          {(() => {
                            const current = progressData.sections.find((s) => (s.id ?? -1) === (selectedSectionId ?? -1));
                            if (!current) {
                              return (
                                <div style={{ padding: 32, borderRadius: 16, border: '2px dashed #e2e8f0', background: '#fff', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
                                  <div style={{ fontSize: 32, marginBottom: 10 }}>←</div>
                                  Select a section to view staff-wise exam progress
                                </div>
                              );
                            }

                            const secLabel = `${current.batch?.name ?? ''} ${current.name ?? ''}`.trim() || current.name || 'Section';
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {/* Section header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 14, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                  <div>
                                    <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{secLabel}</div>
                                    {current.course?.name && (
                                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{current.course.name}</div>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {(current.department?.short_name || current.department?.code) && (
                                      <span style={{ padding: '3px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 600 }}>
                                        {current.department.short_name || current.department.code}
                                      </span>
                                    )}
                                    <span style={{ padding: '3px 10px', borderRadius: 999, background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 600 }}>
                                      {current.staff.length} staff
                                    </span>
                                  </div>
                                </div>

                                {current.staff.length === 0 && (
                                  <div style={{ padding: 20, borderRadius: 12, border: '1px dashed #e2e8f0', background: '#fff', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
                                    No teaching assignments found for this section.
                                  </div>
                                )}

                                {/* Staff cards */}
                                {current.staff.map((st) => {
                                  const staffInitial = st.name ? String(st.name).charAt(0).toUpperCase() : 'S';
                                  const allExams = st.teaching_assignments.flatMap((ta) => ta.exam_progress);
                                  const publishedCount = allExams.filter((e) => e.published).length;
                                  const totalCount = allExams.length;
                                  const staffColors = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6'];
                                  const staffColor = staffColors[Math.abs(st.id % staffColors.length)];

                                  return (
                                    <div key={st.id} style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                                      {/* Staff card header */}
                                      <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                          <div style={{ width: 38, height: 38, borderRadius: '50%', background: staffColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0, boxShadow: `0 2px 8px ${staffColor}40` }}>
                                            {staffInitial}
                                          </div>
                                          <div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{st.name}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{st.teaching_assignments.length} course{st.teaching_assignments.length !== 1 ? 's' : ''}</div>
                                          </div>
                                        </div>
                                        {totalCount > 0 && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 80, height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                                              <div style={{ height: '100%', width: `${(publishedCount / totalCount) * 100}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: 999 }} />
                                            </div>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: publishedCount === totalCount ? '#16a34a' : '#64748b' }}>
                                              {publishedCount}/{totalCount}
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Teaching assignments */}
                                      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {st.teaching_assignments.map((ta, idxTa) => (
                                          <div key={`${ta.id ?? idxTa}`} style={{ borderRadius: 12, border: '1px solid #f1f5f9', padding: '10px 14px', background: '#fafbff', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {/* Course header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                              <div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>{ta.subject_name || 'Course'}</div>
                                                {ta.subject_code && (
                                                  <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginTop: 1 }}>{ta.subject_code}</div>
                                                )}
                                              </div>
                                              {ta.exam_progress.length > 0 && (
                                                <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                  <span style={{ fontWeight: 700, color: '#22c55e' }}>
                                                    {ta.exam_progress.filter((e) => e.published).length}
                                                  </span>
                                                  /{ta.exam_progress.length} published
                                                </div>
                                              )}
                                            </div>

                                            {ta.exam_progress.length === 0 && (
                                              <div style={{ fontSize: 11, color: '#cbd5e1' }}>No assessments configured.</div>
                                            )}

                                            {/* Exam chips — clickable */}
                                            {ta.exam_progress.length > 0 && (
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                                {ta.exam_progress.map((ex) => {
                                                  const chipLabel = (ex.label ? String(ex.label) : String(ex.assessment)).trim().toUpperCase();
                                                  const pct = ex.total_students > 0 ? (ex.rows_filled / ex.total_students) * 100 : 0;
                                                  const isPublished = ex.published;
                                                  return (
                                                    <button
                                                      key={ex.assessment}
                                                      title={`Click to view ${chipLabel} marks table`}
                                                      onClick={() => handleChipClick(ta, ex, st.name, secLabel)}
                                                      style={{
                                                        display: 'inline-flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'stretch',
                                                        minWidth: 90,
                                                        padding: '7px 10px',
                                                        borderRadius: 10,
                                                        border: `1.5px solid ${isPublished ? '#4ade80' : '#bfdbfe'}`,
                                                        background: isPublished ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                                        transition: 'all 0.15s ease',
                                                        textAlign: 'left',
                                                      }}
                                                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'; }}
                                                      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
                                                    >
                                                      {/* Assessment name */}
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 800, color: isPublished ? '#15803d' : '#1d4ed8', letterSpacing: '0.03em' }}>
                                                          {chipLabel}
                                                        </span>
                                                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 999, background: isPublished ? '#22c55e' : '#93c5fd', color: isPublished ? '#fff' : '#1e3a8a', fontWeight: 700 }}>
                                                          {isPublished ? '✓ Published' : 'Draft'}
                                                        </span>
                                                      </div>
                                                      {/* Progress bar */}
                                                      <div style={{ width: '100%', height: 4, borderRadius: 999, background: isPublished ? '#bbf7d0' : '#bfdbfe', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: isPublished ? 'linear-gradient(90deg,#22c55e,#16a34a)' : 'linear-gradient(90deg,#60a5fa,#3b82f6)', borderRadius: 999 }} />
                                                      </div>
                                                      {/* Count */}
                                                      <div style={{ marginTop: 4, fontSize: 10, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>{ex.rows_filled}/{ex.total_students} students</span>
                                                        <span style={{ fontWeight: 700, color: isPublished ? '#16a34a' : '#2563eb' }}>{pct.toFixed(0)}%</span>
                                                      </div>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── Progress: Read-only Marks Table Modal ── */}
              {progressModal && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${progressModal.label} marks for ${progressModal.subjectName}`}
                  onClick={() => setProgressModal(null)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px 16px' }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 'min(780px,100%)', maxHeight: '90vh', background: '#fff', borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.32)', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0' }}
                  >
                    {/* Modal header */}
                    <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{progressModal.label}</span>
                          <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: progressModal.published ? '#22c55e' : '#60a5fa', color: progressModal.published ? '#fff' : '#1e3a8a' }}>
                            {progressModal.published ? '✓ Published' : 'Draft'}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>
                          <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{progressModal.subjectName}</span>
                          {progressModal.subjectCode !== progressModal.subjectName && (
                            <span style={{ color: '#64748b' }}> ({progressModal.subjectCode})</span>
                          )}
                          {' · '}
                          <span>{progressModal.staffName}</span>
                          {' · '}
                          <span>{progressModal.sectionName}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setProgressModal(null)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#334155'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                        style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#94a3b8', cursor: 'pointer', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Modal body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                      {modalLoading && (
                        <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                          <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                          Loading marks…
                        </div>
                      )}

                      {!modalLoading && modalError && (
                        <div style={{ margin: 24, padding: 16, borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
                          <strong>Error:</strong> {modalError}
                        </div>
                      )}

                      {/* CIA1 / CIA2 / Model — full per-question table with CO & BTL columns */}
                      {!modalLoading && !modalError && modalCiaSheet !== null && (() => {
                        const cs = modalCiaSheet;
                        const thStyle: React.CSSProperties = { padding: '6px 8px', border: '1px solid #cbd5e1', background: '#1e293b', color: '#f1f5f9', fontWeight: 700, fontSize: 11, textAlign: 'center', whiteSpace: 'nowrap' };
                        const tdStyle: React.CSSProperties = { padding: '5px 8px', border: '1px solid #e2e8f0', fontSize: 12, textAlign: 'center', color: '#0f172a' };
                        const totalCols = 4 + cs.questions.length + 1 + 4 + cs.visibleBtls.length * 2;
                        return (
                          <div style={{ overflowX: 'auto', padding: 16 }}>
                            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: 'max-content', minWidth: '100%' }}>
                              <thead>
                                {/* Row 1: title */}
                                <tr>
                                  <th colSpan={totalCols} style={{ ...thStyle, background: '#0f172a', fontSize: 13, padding: '8px 12px', textAlign: 'center' }}>
                                    {cs.termLabel} &nbsp;|&nbsp; {cs.batchLabel} &nbsp;|&nbsp; {cs.assessmentLabel}
                                  </th>
                                </tr>
                                {/* Row 2: group headers */}
                                <tr>
                                  <th rowSpan={3} style={thStyle}>S.No</th>
                                  <th rowSpan={3} style={thStyle}>R.No</th>
                                  <th rowSpan={3} style={{ ...thStyle, minWidth: 130 }}>Name of Students</th>
                                  <th rowSpan={3} style={thStyle}>AB</th>
                                  <th colSpan={cs.questions.length} style={{ ...thStyle, background: '#1d4ed8' }}>QUESTIONS</th>
                                  <th rowSpan={3} style={thStyle}>Total</th>
                                  <th colSpan={4} style={{ ...thStyle, background: '#065f46' }}>CO ATTAINMENT</th>
                                  {cs.visibleBtls.length > 0 && (
                                    <th colSpan={cs.visibleBtls.length * 2} style={{ ...thStyle, background: '#7c2d12' }}>BTL ATTAINMENT</th>
                                  )}
                                </tr>
                                {/* Row 3: Q labels + CO-a/CO-b labels + BTL-n labels */}
                                <tr>
                                  {cs.questions.map(q => (
                                    <th key={q.key} style={{ ...thStyle, background: '#1e40af' }}>{q.label}</th>
                                  ))}
                                  <th colSpan={2} style={{ ...thStyle, background: '#047857' }}>CO-{cs.coPair.a}</th>
                                  <th colSpan={2} style={{ ...thStyle, background: '#047857' }}>CO-{cs.coPair.b}</th>
                                  {cs.visibleBtls.map(n => (
                                    <th key={n} colSpan={2} style={{ ...thStyle, background: '#9a3412' }}>BTL-{n}</th>
                                  ))}
                                </tr>
                                {/* Row 4: max marks */}
                                <tr>
                                  {cs.questions.map(q => (
                                    <th key={q.key} style={{ ...thStyle, background: '#334155', color: '#fbbf24' }}>{q.max}</th>
                                  ))}
                                  <th style={{ ...thStyle, background: '#334155', color: '#fbbf24' }}>{cs.coMax.a}</th>
                                  <th style={{ ...thStyle, background: '#334155', color: '#94a3b8' }}>%</th>
                                  <th style={{ ...thStyle, background: '#334155', color: '#fbbf24' }}>{cs.coMax.b}</th>
                                  <th style={{ ...thStyle, background: '#334155', color: '#94a3b8' }}>%</th>
                                  {cs.visibleBtls.map(n => (
                                    <React.Fragment key={n}>
                                      <th style={{ ...thStyle, background: '#334155', color: '#fbbf24' }}>{cs.btlMax[n] ?? 0}</th>
                                      <th style={{ ...thStyle, background: '#334155', color: '#94a3b8' }}>%</th>
                                    </React.Fragment>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {/* BTL row */}
                                <tr style={{ background: '#fef9c3' }}>
                                  <td colSpan={3} style={{ ...tdStyle, background: '#fef9c3' }} />
                                  <td style={{ ...tdStyle, fontWeight: 700, background: '#fef9c3', color: '#92400e' }}>BTL</td>
                                  {cs.questions.map(q => (
                                    <td key={q.key} style={{ ...tdStyle, fontWeight: 700, background: '#fef9c3', color: '#b45309' }}>
                                      {cs.questionBtl[q.key] ?? q.btl}
                                    </td>
                                  ))}
                                  <td colSpan={1 + 4 + cs.visibleBtls.length * 2} style={{ ...tdStyle, background: '#fef9c3' }} />
                                </tr>
                                {/* Student rows */}
                                {cs.rows.map((row, idx) => {
                                  let total = 0, coA = 0, coB = 0;
                                  const btlTotals: Record<number, number> = {};
                                  cs.questions.forEach(q => {
                                    const mark = row.absent ? 0 : Number(row.q[q.key] || 0);
                                    total += mark;
                                    const w = _ciaCoWeights(q.co, cs.coPair);
                                    coA += mark * w.a;
                                    coB += mark * w.b;
                                    const bv = Number(cs.questionBtl[q.key] ?? q.btl);
                                    btlTotals[bv] = (btlTotals[bv] || 0) + mark;
                                  });
                                  const rowBg = idx % 2 === 0 ? '#fff' : '#f8fafc';
                                  return (
                                    <tr key={row.studentId} style={{ background: rowBg }}>
                                      <td style={{ ...tdStyle, background: rowBg, color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                                      <td style={{ ...tdStyle, background: rowBg, color: '#3b82f6', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.reg_no}</td>
                                      <td style={{ ...tdStyle, background: rowBg, textAlign: 'left' }}>{row.name}</td>
                                      <td style={{ ...tdStyle, background: rowBg, color: '#dc2626', fontWeight: 700 }}>{row.absent ? '✗' : ''}</td>
                                      {cs.questions.map(q => (
                                        <td key={q.key} style={{ ...tdStyle, background: rowBg, color: row.absent ? '#94a3b8' : '#0f172a' }}>
                                          {row.absent ? '—' : (row.q[q.key] !== '' && row.q[q.key] != null ? row.q[q.key] : '—')}
                                        </td>
                                      ))}
                                      <td style={{ ...tdStyle, background: rowBg, fontWeight: 700, color: '#0f172a' }}>
                                        {row.absent ? 0 : total}
                                      </td>
                                      <td style={{ ...tdStyle, background: rowBg }}>{Math.round(coA)}</td>
                                      <td style={{ ...tdStyle, background: rowBg, color: '#047857' }}>
                                        {cs.coMax.a > 0 ? `${((coA / cs.coMax.a) * 100).toFixed(0)}%` : '—'}
                                      </td>
                                      <td style={{ ...tdStyle, background: rowBg }}>{Math.round(coB)}</td>
                                      <td style={{ ...tdStyle, background: rowBg, color: '#047857' }}>
                                        {cs.coMax.b > 0 ? `${((coB / cs.coMax.b) * 100).toFixed(0)}%` : '—'}
                                      </td>
                                      {cs.visibleBtls.map(n => (
                                        <React.Fragment key={n}>
                                          <td style={{ ...tdStyle, background: rowBg }}>{btlTotals[n] || 0}</td>
                                          <td style={{ ...tdStyle, background: rowBg, color: '#9a3412' }}>
                                            {(cs.btlMax[n] ?? 0) > 0 ? `${(((btlTotals[n] || 0) / cs.btlMax[n]) * 100).toFixed(0)}%` : '—'}
                                          </td>
                                        </React.Fragment>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}

                      {/* Flat marks table for SSA / Formative / Review etc. */}
                      {!modalLoading && !modalError && modalCiaSheet === null && modalRows !== null && (
                        <>
                          {modalRows.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                              No mark data found for this assessment.
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', width: 44 }}>S.No</th>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Reg No</th>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Student Name</th>
                                    {modalMarkCols.map((col) => (
                                      <th key={col} style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{col}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {modalRows.map((row, idx) => (
                                    <tr
                                      key={row.student_id}
                                      style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafbff' }}
                                    >
                                      <td style={{ padding: '9px 16px', color: '#94a3b8', fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                                      <td style={{ padding: '9px 16px', color: '#3b82f6', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.reg_no}</td>
                                      <td style={{ padding: '9px 16px', color: '#0f172a' }}>{row.name}</td>
                                      {row.values.map((v, vi) => (
                                        <td key={vi} style={{ padding: '9px 16px', textAlign: 'center', fontWeight: 600, color: v === '—' || v == null ? '#cbd5e1' : '#0f172a' }}>
                                          {v ?? '—'}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {modalCiaSheet !== null
                          ? `${modalCiaSheet.rows.length} student${modalCiaSheet.rows.length !== 1 ? 's' : ''}`
                          : modalRows !== null
                            ? `${modalRows.length} student${modalRows.length !== 1 ? 's' : ''}`
                            : ''}
                        &nbsp;•&nbsp; Read-only view
                      </span>
                      <button
                        onClick={() => setProgressModal(null)}
                        style={{ padding: '7px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#334155' }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Question Import Wizard Modal */}
              {importWizardOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  onClick={closeWizard}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 50,
                    padding: 20,
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 'min(1000px, 100%)',
                      background: '#fff',
                      borderRadius: 16,
                      boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                      overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 20, color: '#0f172a' }}>📥 Question Import</div>
                        <div style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
                          Step {wizardStep} of 3 • {scanStatus === 'scanning' ? 'Scanning…' : scanStatus === 'error' ? 'Scan failed' : 'Ready'}
                        </div>
                      </div>
                      <button
                        onClick={closeWizard}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                        style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#64748b', transition: 'all 0.2s ease' }}
                      >
                        ✕ Close
                      </button>
                    </div>

                    {/* sliding pages */}
                    <div style={{ overflow: 'hidden', background: '#fafbfc' }}>
                      <div
                        style={{
                          display: 'flex',
                          width: '300%',
                          transform: `translateX(-${(wizardStep - 1) * 33.3333333}%)`,
                          transition: 'transform 360ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        {/* Step 1: Preview */}
                        <div style={{ width: '33.3333333%', padding: 24 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 18, color: '#0f172a' }}>🔍 Preview</div>
                              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                                {uploadedDocxPath ? `Source: ${uploadedDocxPath}` : 'Source: (not available)'}
                              </div>
                            </div>
                            <div style={{ fontSize: 14, color: '#0f172a', background: '#eff6ff', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
                              Questions: <b style={{ color: '#3b82f6' }}>{visibleQuestions.length}</b>
                            </div>
                          </div>

                          {scanMessage && (
                            <div style={{ marginBottom: 12, fontSize: 14, color: scanStatus === 'error' ? '#dc2626' : '#16a34a', background: scanStatus === 'error' ? '#fef2f2' : '#f0fdf4', padding: '12px 16px', borderRadius: 10, border: `1px solid ${scanStatus === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
                              {scanMessage}
                            </div>
                          )}

                          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, maxHeight: 420, overflow: 'auto', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                            {scanStatus === 'scanning' && (
                              <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>⏳ Scanning your DOCX…</div>
                            )}
                            {scanStatus !== 'scanning' && visibleQuestions.length === 0 && (
                              <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>📄 No questions to preview yet.</div>
                            )}
                            {visibleQuestions.map((q, idx) => (
                              <div key={idx} style={{ padding: '14px 12px', borderBottom: idx < visibleQuestions.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                                  <div style={{ fontWeight: 700, color: '#3b82f6', fontSize: 15, background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>Q{idx + 1}</div>
                                  <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', padding: '4px 10px', borderRadius: 6 }}>
                                    Marks: {String((q as any)?.marks ?? '-')}{' '}
                                    • BTL: {String((q as any)?.btl ?? '-')}{' '}
                                    • CO: {String((q as any)?.course_outcomes ?? '-')}
                                  </div>
                                </div>
                                <div style={{ marginTop: 8, color: '#1e293b', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>
                                  {String((q as any)?.question_text ?? '').slice(0, 500)}
                                  {String((q as any)?.question_text ?? '').length > 500 ? '…' : ''}
                                </div>

                                {Array.isArray((q as any)?.images) && (q as any).images.length ? (
                                  <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {(q as any).images.slice(0, 4).map((img: any, i: number) => {
                                      const src = normalizeImageSrc(img);
                                      if (!src) return null;
                                      return (
                                        <img
                                          key={i}
                                          src={src}
                                          alt={`q${idx + 1}-img${i + 1}`}
                                          onClick={() => setLightboxSrc(src)}
                                          style={{ maxHeight: 140, borderRadius: 10, border: '2px solid #e2e8f0', cursor: 'pointer', objectFit: 'contain', background: '#fff', transition: 'all 0.2s ease', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}
                                        />
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Step 2: Exam details */}
                        <div style={{ width: '33.3333333%', padding: 24 }}>
                          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 18, color: '#0f172a' }}>📋 Save details</div>
                          {importError && (
                            <div style={{ marginBottom: 12, fontSize: 14, color: '#dc2626', background: '#fef2f2', padding: '12px 16px', borderRadius: 10, border: '1px solid #fecaca' }}>{importError}</div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam name</label>
                              <input
                                value={examName}
                                onChange={(e) => setExamName(e.target.value)}
                                placeholder="e.g., Unit 1 - Introduction"
                                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e6eef8', boxShadow: 'inset 0 1px 2px #00000008' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam (CIA / Model / ESE)</label>
                              <select
                                value={examAssessment}
                                onChange={(e) => setExamAssessment(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e6eef8', background: '#fff' }}
                              >
                                <option value="">Select assessment</option>
                                <option value="CIA1">CIA1</option>
                                <option value="CIA2">CIA2</option>
                                <option value="MODEL">MODEL</option>
                                <option value="ESE">ESE</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam Type</label>
                              <select
                                value={examType}
                                onChange={(e) => setExamType(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e6eef8', background: '#fff' }}
                              >
                                <option value="">Select paper</option>
                                <option value="QP1">QP1</option>
                                <option value="QP2">QP2</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Exam date</label>
                              <input
                                type="date"
                                value={examDate}
                                onChange={(e) => setExamDate(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e6eef8' }}
                              />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Sections</label>
                              <textarea
                                value={examSections}
                                onChange={(e) => setExamSections(e.target.value)}
                                placeholder="e.g., Part A\nPart B\nSection 1"
                                rows={3}
                                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e6eef8', resize: 'vertical' }}
                              />
                            </div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                            This metadata is shown for confirmation. (Currently, only the exam name is used as the imported “title”.)
                          </div>
                        </div>

                        {/* Step 3: Confirmation */}
                        <div style={{ width: '33.3333333%', padding: 24 }}>
                          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 18, color: '#0f172a' }}>✔️ Confirmation</div>

                          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
                            {/* Left column: Profile card and Course details */}
                            <div>
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                  <div style={{ width: 64, height: 64, borderRadius: 10, background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#3b82f6', fontSize: 24 }}>
                                    {me?.username ? String(me.username).slice(0,1).toUpperCase() : '👤'}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{me?.username || '—'}</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Faculty</div>
                                  </div>
                                </div>
                                <div style={{ marginTop: 12, fontSize: 13, color: '#475569', background: '#f8fafc', padding: '8px 12px', borderRadius: 8 }}>Faculty ID: <strong style={{ color: '#0f172a' }}>{facultyId ?? '—'}</strong></div>
                              </div>

                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10, fontWeight: 600 }}>📚 Course details</div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>—</div>
                                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>—</div>
                                <div style={{ marginTop: 12, fontSize: 13, color: '#475569' }}>Assignments: <strong style={{ color: '#0f172a' }}>—</strong></div>
                              </div>
                            </div>

                            {/* Right column: Exam info + Questions preview */}
                            <div>
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                  <div>
                                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Questions to import</div>
                                    <div style={{ fontSize: 28, fontWeight: 900, color: '#3b82f6', marginTop: 4 }}>{visibleQuestions.length}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Exam name</div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 16, marginTop: 2 }}>{examName || '—'}</div>
                                    <div style={{ marginTop: 8, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Assessment</div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{examAssessment || '—'}</div>
                                  </div>
                                </div>

                                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                                  <div><span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Exam Type</span><div style={{ fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{examType || '—'}</div></div>
                                  <div><span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Exam date</span><div style={{ fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{examDate || '—'}</div></div>
                                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Sections</span><div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'pre-wrap', marginTop: 4 }}>{examSections || '—'}</div></div>
                                </div>
                              </div>

                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 10, fontWeight: 600 }}>📝 Questions preview</div>
                                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                                  {visibleQuestions.slice(0, 10).map((q, i) => (
                                    <div key={i} style={{ padding: '10px 8px', borderBottom: i < Math.min(visibleQuestions.length, 10) - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                      <div style={{ fontWeight: 700, color: '#3b82f6', minWidth: 40, background: '#eff6ff', padding: '4px 8px', borderRadius: 6, textAlign: 'center' }}>{i+1}</div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ color: '#1e293b', fontSize: 14, lineHeight: 1.5 }}>{String(q.question_text).slice(0, 260)}</div>
                                        {Array.isArray(q.images) && q.images.length ? (
                                          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                                            {q.images.slice(0,2).map((im: any, j: number) => {
                                              const src = normalizeImageSrc(im);
                                              if (!src) return null;
                                              return <img key={j} src={src} style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 8, border: '2px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s ease' }} onClick={() => setLightboxSrc(src)} />
                                            })}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {importError && (
                            <div style={{ marginTop: 16, fontSize: 14, color: '#dc2626', background: '#fef2f2', padding: '12px 16px', borderRadius: 10, border: '1px solid #fecaca' }}>❌ {importError}</div>
                          )}
                          {importResult && (
                            <div style={{ marginTop: 16, fontSize: 14, color: '#16a34a', background: '#f0fdf4', padding: '12px 16px', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                              ✅ Imported {importResult.inserted} question(s)
                              {importResult.failed?.length ? `, failed ${importResult.failed.length}.` : '.'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* footer */}
                    <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fafbfc' }}>
                      <button
                        onClick={() => setWizardStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)))}
                        disabled={wizardStep === 1}
                        onMouseEnter={(e) => { if (wizardStep !== 1) e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { if (wizardStep !== 1) e.currentTarget.style.background = '#fff'; }}
                        style={{
                          padding: '10px 18px',
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          background: wizardStep === 1 ? '#f1f5f9' : '#fff',
                          cursor: wizardStep === 1 ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          fontSize: 14,
                          color: wizardStep === 1 ? '#94a3b8' : '#475569',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        ← Back
                      </button>

                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {wizardStep < 3 ? (
                          <button
                            onClick={() => {
                              setImportError(null);
                              if (wizardStep === 2) {
                                if (!examName.trim()) {
                                  setImportError('Exam name is required.');
                                  return;
                                }
                                if (!examType.trim()) {
                                  setImportError('Exam type is required.');
                                  return;
                                }
                                if (!examDate.trim()) {
                                  setImportError('Exam date is required.');
                                  return;
                                }
                              }
                              setWizardStep((s) => ((s + 1) as 1 | 2 | 3));
                            }}
                            disabled={wizardStep === 1 && scanStatus === 'scanning'}
                            onMouseEnter={(e) => { if (!(wizardStep === 1 && scanStatus === 'scanning')) e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'; }}
                            onMouseLeave={(e) => { if (!(wizardStep === 1 && scanStatus === 'scanning')) e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'; }}
                            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15, boxShadow: '0 2px 8px rgba(37,99,235,0.25)', transition: 'all 0.2s ease' }}
                          >
                            Next →
                          </button>
                        ) : (
                          <button
                            onClick={handleConfirmImport}
                            disabled={importingToBank || scanStatus === 'scanning' || visibleQuestions.length === 0}
                            onMouseEnter={(e) => { if (!importingToBank && scanStatus !== 'scanning' && visibleQuestions.length > 0) e.currentTarget.style.background = 'linear-gradient(135deg, #15803d 0%, #166534 100%)'; }}
                            onMouseLeave={(e) => { if (!importingToBank && scanStatus !== 'scanning' && visibleQuestions.length > 0) e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'; }}
                            style={{
                              padding: '10px 24px',
                              borderRadius: 10,
                              border: 'none',
                              background: importingToBank ? '#cbd5e1' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: 15,
                              cursor: importingToBank ? 'not-allowed' : 'pointer',
                              boxShadow: importingToBank ? 'none' : '0 2px 8px rgba(22,163,74,0.25)',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {importingToBank ? '⏳ Importing…' : '✔️ Confirm & Import'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lightbox modal for image preview */}
              {lightboxSrc && (
                <div
                  role="dialog"
                  onClick={() => { setLightboxSrc(null); }}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}
                >
                  <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95%', maxHeight: '95%', padding: 16, background: '#fff', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                    <img src={lightboxSrc} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} />
                  </div>
                </div>
              )}
              {/* Preview modal for uploaded DOCX (Step 3 style) */}
              {previewUpload && (
                <div
                  role="dialog"
                  onClick={() => { setPreviewUpload(null); }}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16 }}
                >
                  <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(900px, 100%)', background: '#fff', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>Uploaded file preview</div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>Preview of uploaded DOCX • {previewUpload.name}</div>
                      </div>
                      <button
                        onClick={() => setPreviewUpload(null)}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
                      >
                        Close
                      </button>
                    </div>

                    <div style={{ padding: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>
                        <div>
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                              <div style={{ width: 64, height: 64, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6b7280' }}>
                                {me?.username ? String(me.username).slice(0,1).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{me?.username || '—'}</div>
                                <div style={{ fontSize: 13, color: '#6b7280' }}>Faculty</div>
                                <div style={{ fontSize: 13, color: '#6b7280' }}>—</div>
                              </div>
                            </div>
                            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Faculty ID: <strong style={{ color: '#111827' }}>{facultyId ?? '—'}</strong></div>
                          </div>

                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>File details</div>
                            <div style={{ fontWeight: 700 }}>{previewUpload.name}</div>
                            <div style={{ fontSize: 13, color: '#6b7280' }}>{previewUpload.path}</div>
                            <div style={{ marginTop: 8 }}>
                              <a href={previewUpload.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Download file</a>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>Uploaded file</div>
                                <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>{previewUpload.name}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>Uploaded path</div>
                                <div style={{ fontWeight: 700 }}>{previewUpload.path}</div>
                              </div>
                            </div>
                            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                              <div><span style={{ color: '#6b7280', fontSize: 12 }}>Notes</span><div style={{ fontWeight: 700 }}>{'This preview shows file metadata. Open the file to view full content or import to parse questions.'}</div></div>
                            </div>
                          </div>

                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
                            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Importer preview</div>
                            <div style={{ maxHeight: 260, overflow: 'auto' }}>
                              <div style={{ color: '#6b7280' }}>To see a full questions preview, upload and scan this DOCX using the importer — then the Step 3 confirmation contains the parsed question list.</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* transient import success popup */}
              {showImportPopup && (
                <div style={{ position: 'fixed', left: 24, bottom: 24, zIndex: 120, animation: 'slideIn 0.3s ease' }}>
                  <div style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', color: '#065f46', border: '1px solid #6ee7b7', padding: '16px 20px', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>✅ Imported</div>
                    <div style={{ fontSize: 14, color: '#047857' }}>{importResult?.inserted ?? 0} question(s) imported successfully.</div>
                  </div>
                </div>
              )}
        </main>
  );
}
