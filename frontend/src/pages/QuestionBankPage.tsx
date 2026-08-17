import React, { useEffect, useMemo, useState, useRef } from 'react';
import { AlertCircle, Lock, CheckCircle2, Download, Upload, ShieldCheck, X, Copy, Zap, TreePine } from 'lucide-react';
import {
  getCoursQuestions,
  createCourseQuestion,
  updateCourseQuestion,
  finalizeCourseQuestions,
  unfinalizeQuestions,
  getQuestionBankLogs,
  CourseQuestion,
  QuestionBankLog,
} from '../services/questionBank';
import { fetchCdapRevision } from '../services/cdapDb';
import { QUESTION_BANK_TEMPLATE } from '../constants/questionBankTemplate';
import MathEquationKeyboard from '../components/MathEquationKeyboard';
import ComponentPalette from '../components/ComponentPalette';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import * as XLSX from 'xlsx';

interface QuestionBankPageProps {
  courseCode: string;
  courseName?: string;
  allowAllColumnsEdit?: boolean;
}

interface ExtendedQuestion extends CourseQuestion {
  question_type: 'D' | 'O';
  college: string;
  dirty?: boolean;
  isPersisted?: boolean;
}

export default function QuestionBankPage({ courseCode, courseName, allowAllColumnsEdit = false }: QuestionBankPageProps): JSX.Element {
  const [questions, setQuestions] = useState<ExtendedQuestion[]>([]);
  const questionsRef = useRef<ExtendedQuestion[]>([]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);
  const [logs, setLogs] = useState<QuestionBankLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'questions' | 'logs'>('questions');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyTimeLimit, setVerifyTimeLimit] = useState<number>(60);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeExpiry, setCodeExpiry] = useState<string | null>(null);
  const [codeTerminated, setCodeTerminated] = useState(false);
  const [verifyTab, setVerifyTab] = useState<'questions' | 'cos'>('questions');
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [questionInput, setQuestionInput] = useState<string>('');
  const [selectedCOs, setSelectedCOs] = useState<Set<string>>(new Set());
  const [cdapRows, setCdapRows] = useState<Array<Record<string, any>>>([]);

  // Special Keyboard States
  const [activeMathField, setActiveMathField] = useState<{ sNo: number; value: string } | null>(null);
  const [activeElectricalPalette, setActiveElectricalPalette] = useState<{ sNo: number } | null>(null);
  const [activeDataStructurePalette, setActiveDataStructurePalette] = useState<{ sNo: number } | null>(null);
  const [activeEditSNo, setActiveEditSNo] = useState<number | null>(null);

  // Auto-save effect: Periodically check for dirty rows and save them "lively"
  useEffect(() => {
    const timer = setInterval(() => {
      // Use ref to avoid stale closures
      const dirtyRows = questionsRef.current.filter(q => q.dirty);
      if (dirtyRows.length > 0) {
        dirtyRows.forEach(row => {
          void handleSaveRow(row);
        });
      }
    }, 5000); // Check every 5 seconds

    // Final "Lively" Safety: Save on page close/refresh
    const handleBeforeUnload = () => {
      const dirtyRows = questionsRef.current.filter(q => q.dirty);
      dirtyRows.forEach(row => void handleSaveRow(row));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const templateCount = QUESTION_BANK_TEMPLATE.length;

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.metaKey || e.ctrlKey)) {
        const focused = document.activeElement as HTMLElement | null;
        if (!focused) return;
        const dataSNo = (focused as HTMLElement).dataset?.sno || '0';
        const isQuestionInput = (focused as HTMLElement).dataset?.questionInput === 'true';
        if (!isQuestionInput) return;

        const sNo = parseInt(dataSNo, 10);
        if (!sNo) return;

        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          const currentValue = (focused as HTMLTextAreaElement).value || '';
          setActiveMathField({ sNo, value: currentValue });
        } else if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          setActiveElectricalPalette({ sNo });
        } else if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          setActiveDataStructurePalette({ sNo });
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (courseCode) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseCode]);

  async function loadData() {
    if (!courseCode) {
      setError('No course code provided');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [questionsData, logsData] = await Promise.all([
        getCoursQuestions(courseCode),
        getQuestionBankLogs(courseCode),
      ]);

      try {
        const cdapRevision = await fetchCdapRevision(courseCode);
        const rows = Array.isArray(cdapRevision?.rows) ? cdapRevision.rows : [];
        setCdapRows(rows);
      } catch {
        setCdapRows([]);
      }

      const existingBySNo = new Map<number, CourseQuestion>();
      for (const q of questionsData) existingBySNo.set(q.s_no, q);

      const templateSNoSet = new Set(QUESTION_BANK_TEMPLATE.map((r) => r.s_no));

      const mergedRows: ExtendedQuestion[] = QUESTION_BANK_TEMPLATE.map((row) => {
        const existing = existingBySNo.get(row.s_no);
        return {
          id: existing?.id || 0,
          course_code: courseCode,
          course_name: courseName || existing?.course_name || '',
          s_no: row.s_no,
          question_text: existing?.question_text || '',
          subtopics: existing?.subtopics || '',
          course_outcome: existing?.course_outcome || row.course_outcome || '',
          part: existing?.part || row.part || '',
          btl: existing?.btl ?? row.btl,
          marks: existing?.marks ?? row.marks,
          is_finalized: existing?.is_finalized || false,
          created_by_name: existing?.created_by_name,
          finalized_by_name: existing?.finalized_by_name,
          created_at: existing?.created_at || '',
          updated_at: existing?.updated_at || '',
          finalized_at: existing?.finalized_at,
          question_type: existing?.question_type || row.question_type,
          college: existing?.college || row.college,
          dirty: false,
          isPersisted: Boolean(existing?.id),
        };
      });

      // Add questions from DB that are NOT in the template
      const extraQuestions = questionsData.filter(q => !templateSNoSet.has(q.s_no));
      for (const q of extraQuestions) {
        mergedRows.push({
          ...q,
          question_type: q.question_type || 'D',
          college: q.college || '',
          dirty: false,
          isPersisted: true,
        });
      }

      // Sort by s_no
      mergedRows.sort((a, b) => a.s_no - b.s_no);

      setQuestions(mergedRows);
      setLogs(logsData);
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  const isFinalized = useMemo(() => questions.some((q) => q.is_finalized), [questions]);

  function extractRowValue(row: Record<string, any>, keys: string[]): string {
    for (const key of keys) {
      if (row[key] != null) return String(row[key]);
      const target = key.toLowerCase();
      for (const rowKey of Object.keys(row)) {
        if (rowKey.toLowerCase() === target) return String(row[rowKey]);
      }
    }
    return '';
  }

  function normalizeCoNumbers(value: string): number[] {
    const nums = String(value || '').match(/\d+/g) || [];
    return nums.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
  }

  function normalizePartValue(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const digits = raw.match(/\d+/g);
    if (digits && digits.length > 0) return String(parseInt(digits[0], 10));

    const upper = raw.toUpperCase();
    if (upper === 'I' || upper === 'PART I') return '1';
    if (upper === 'II' || upper === 'PART II') return '2';

    return raw;
  }

  const subtopicsByCoPart = useMemo(() => {
    const index = new Map<string, string[]>();
    let currentCo = '';
    for (const row of cdapRows) {
      // Mapping: Unit # (cdap) -> Course Outcomes (queston bank)
      // keys: 'unit', 'unit_no' for UNIT, 'co', 'co_mapped' for CO
      const rowCo = extractRowValue(row, ['unit', 'unit_no', 'co', 'co_mapped', 'coMapped']);
      if (rowCo) currentCo = rowCo;

      const part = extractRowValue(row, ['part_no', 'partNo', 'part']);
      const subTopicsRaw = extractRowValue(row, ['sub_topics', 'subTopics', 'sub_topics_to_be_taught']);

      if (!currentCo || !part || !subTopicsRaw) continue;

      const coNums = normalizeCoNumbers(currentCo);
      if (!coNums.length) continue;
      const partValue = normalizePartValue(part);
      if (!partValue) continue;

      // The user wants the full content shown in the dropdown.
      // We'll still trim and filter empty, but avoid splitting by comma/newline if it might break things.
      // Actually, if a row has multiple subtopics separated by something, we might want to split, 
      // but let's stick to the prompt's "all the content... must be shown".
      const options = [subTopicsRaw.trim()].filter(Boolean);
      if (!options.length) continue;

      for (const coNum of coNums) {
        const key = `${coNum}|${partValue}`;
        const existing = index.get(key) || [];
        const merged = existing.concat(options);
        const seen = new Set<string>();
        const unique = merged.filter((opt) => {
          if (seen.has(opt)) return false;
          seen.add(opt);
          return true;
        });
        index.set(key, unique);
      }
    }
    return index;
  }, [cdapRows]);

  function getSubtopicOptions(question: ExtendedQuestion): string[] {
    const coNums = normalizeCoNumbers(String(question.course_outcome || ''));
    const partValue = normalizePartValue(String(question.part || ''));
    const options: string[] = [];

    if (coNums.length && partValue) {
      for (const coNum of coNums) {
        const key = `${coNum}|${partValue}`;
        const fromIndex = subtopicsByCoPart.get(key) || [];
        for (const opt of fromIndex) options.push(opt);
      }
    }

    const seen = new Set<string>();
    const unique = options.filter((opt) => {
      if (seen.has(opt)) return false;
      seen.add(opt);
      return true;
    });

    if (question.subtopics && !seen.has(question.subtopics)) {
      unique.unshift(question.subtopics);
    }

    return unique;
  }

  function renderLogDetails(log: QuestionBankLog): string {
    // Find the question S.No from the questions list
    const question = questions.find((q) => q.id === log.question_bank);
    const qSNo = question?.s_no || log.question_bank;
    
    if (log.action === 'created') {
      return `Question #${qSNo} created`;
    }
    if (log.action === 'finalized') {
      return 'Question bank finalized for all faculties';
    }
    if (log.action === 'unfinalezed') {
      return 'Question bank re-opened for editing by all faculties';
    }
    if (log.action === 'updated') {
      const changes: string[] = [];
      const oldVals = log.old_values || {};
      const newVals = log.new_values || {};
      
      const fieldLabels: Record<string, string> = {
        question_text: 'Question',
        subtopics: 'Subtopics',
        course_outcome: 'CO',
        part: 'Part',
        btl: 'BTL',
        marks: 'Marks',
        question_type: 'Type',
        college: 'College',
      };

      for (const key of Object.keys(fieldLabels)) {
        const oldVal = oldVals[key];
        const newVal = newVals[key];
        if (oldVal !== newVal) {
          const label = fieldLabels[key];
          changes.push(`${label}: ${oldVal !== null && oldVal !== undefined ? oldVal : '-'} → ${newVal !== null && newVal !== undefined ? newVal : '-'}`);
        }
      }
      
      const changesText = changes.length > 0 ? changes.join(', ') : 'Updated';
      return `Q#${qSNo}: ${changesText}`;
    }
    return '';
  }

  type QuestionSegment = { type: 'text' | 'math' | 'mermaid' | 'image'; value: string };

  function parseQuestionContent(text: string): QuestionSegment[] {
    const segments: QuestionSegment[] = [];
    // Support block math ($$...$$), inline math ($...$), mermaid, and images
    const regex = /```mermaid\s+([\s\S]*?)```|\$\$\{?([\s\S]*?)\}?\$\$|\$\{?([\s\S]*?)\}?\$|!\[[^\]]*\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      }

      if (match[1]) {
        segments.push({ type: 'mermaid', value: match[1].trim() });
      } else if (match[2] || match[3]) {
        // match[2] is for $$, match[3] is for $
        segments.push({ type: 'math', value: (match[2] || match[3] || '').trim() });
      } else if (match[4]) {
        segments.push({ type: 'image', value: match[4].trim() });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      segments.push({ type: 'text', value: text.slice(lastIndex) });
    }

    return segments;
  }

  function MermaidDiagram({ code }: { code: string }) {
    const [svg, setSvg] = useState('');

    useEffect(() => {
      let mounted = true;
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
      mermaid.render(id, code).then((result: any) => {
        if (mounted) setSvg(result.svg || '');
      }).catch(() => {
        if (mounted) setSvg(`<pre>${code}</pre>`);
      });
      return () => {
        mounted = false;
      };
    }, [code]);

    if (!svg) return <div style={{ color: '#6b7280', fontSize: '12px' }}>Rendering diagram...</div>;
    return <div dangerouslySetInnerHTML={{ __html: svg }} />;
  }

  function renderQuestionPreview(text: string) {
    const segments = parseQuestionContent(text || '');
    if (segments.length === 0) return <span />;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {segments.map((seg, idx) => {
          if (seg.type === 'math') {
            return (
              <div key={`math-${idx}`}>
                <BlockMath
                  math={seg.value}
                  errorColor="#dc2626"
                  renderError={() => (
                    <span style={{ color: '#dc2626', fontSize: '12px' }}>
                      Invalid equation
                    </span>
                  )}
                />
              </div>
            );
          }
          if (seg.type === 'mermaid') {
            return (
              <div key={`mermaid-${idx}`} style={{ backgroundColor: '#f9fafb', padding: '8px', borderRadius: '6px' }}>
                <MermaidDiagram code={seg.value} />
              </div>
            );
          }
          if (seg.type === 'image') {
            return (
              <div key={`img-${idx}`}>
                <img src={seg.value} alt="question" style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '6px', border: '1px solid #e5e7eb' }} />
              </div>
            );
          }
          return (
            <div key={`text-${idx}`} style={{ whiteSpace: 'pre-wrap' }}>
              {seg.value}
            </div>
          );
        })}
      </div>
    );
  }

  function updateQuestionText(sNo: number, value: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.s_no === sNo
          ? {
              ...q,
              question_text: value,
              dirty: true,
            }
          : q,
      ),
    );
  }

  function updateQuestionField(sNo: number, field: 'question_text' | 'subtopics' | 'course_outcome' | 'part' | 'btl' | 'marks' | 'question_type' | 's_no' | 'college', value: string | number | undefined) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.s_no === sNo
          ? {
              ...q,
              [field]: value,
              dirty: true,
            }
          : q,
      ),
    );
  }

  async function handleSaveRow(row: ExtendedQuestion) {
    if ((isFinalized && !allowAllColumnsEdit) || (!(row.dirty || !row.isPersisted))) return;

    try {
      setError(null);

      const payload: Partial<CourseQuestion> = {
        course_code: courseCode,
        course_name: courseName || '',
        s_no: row.s_no,
        question_text: row.question_text || '',
        subtopics: row.subtopics || '',
        course_outcome: row.course_outcome || '',
        part: row.part || '',
        btl: row.btl,
        marks: row.marks,
        question_type: row.question_type || 'D',
        college: row.college || '',
      };

      const saved = row.id > 0
        ? await updateCourseQuestion(row.id, {
            question_text: payload.question_text,
            subtopics: payload.subtopics,
            course_outcome: payload.course_outcome,
            part: payload.part,
            btl: payload.btl,
            marks: payload.marks,
            s_no: row.s_no,
            question_type: row.question_type || 'D',
            college: row.college || '',
          })
        : await createCourseQuestion(payload);

      setQuestions((prev) =>
        prev.map((q) =>
          q.s_no === row.s_no
            ? {
                ...q,
                id: saved.id,
                question_text: saved.question_text,
                subtopics: saved.subtopics || q.subtopics,
                btl: saved.btl,
                course_outcome: saved.course_outcome || q.course_outcome,
                part: saved.part || q.part,
                marks: saved.marks ?? q.marks,
                question_type: saved.question_type || q.question_type,
                college: saved.college || q.college,
                is_finalized: saved.is_finalized,
                finalized_at: saved.finalized_at,
                finalized_by_name: saved.finalized_by_name,
                dirty: false,
                isPersisted: true,
                updated_at: saved.updated_at,
              }
            : q,
        ),
      );

      const refreshedLogs = await getQuestionBankLogs(courseCode);
      setLogs(refreshedLogs);
    } catch (e: any) {
      setError(e.message || 'Failed to save row');
    }
  }

  async function handleFinalize() {
    if (!window.confirm('This will finalize all questions for all faculties. Proceed?')) return;

    try {
      setSaving(true);
      await finalizeCourseQuestions(courseCode);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to finalize');
    } finally {
      setSaving(false);
    }
  }

  async function handleOpen() {
    if (!window.confirm('This will re-open the question bank for editing by all faculties. Proceed?')) return;

    try {
      setSaving(true);
      await unfinalizeQuestions(courseCode);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to unfinalize');
    } finally {
      setSaving(false);
    }
  }

  function generateAlphanumericCode(length: number = 6): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function handleGenerateCode() {
    if (verifyTimeLimit < 1 || verifyTimeLimit > 1440) {
      setError('Time limit must be between 1 and 1440 minutes');
      return;
    }

    const code = generateAlphanumericCode(6);
    const expiryTime = new Date(Date.now() + verifyTimeLimit * 60 * 1000);
    
    setGeneratedCode(code);
    setCodeExpiry(expiryTime.toLocaleString());
    setShowVerifyModal(false);
    setError(null);
    
    // Reset selections
    setSelectedQuestions(new Set());
    setSelectedCOs(new Set());
    setQuestionInput('');
    setVerifyTab('questions');
  }

  function copyCodeToClipboard() {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      alert('Code copied to clipboard!');
    }
  }

  function clearCode() {
    setGeneratedCode(null);
    setCodeExpiry(null);
    setCodeTerminated(false);
  }

  function terminateCode() {
    if (window.confirm('Are you sure you want to terminate this verification code? It will no longer be valid.')) {
      setCodeTerminated(true);
    }
  }

  function parseQuestionInput(input: string): Set<number> {
    const result = new Set<number>();
    if (!input.trim()) return result;

    const parts = input.split(',').map((p) => p.trim());
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((s) => parseInt(s.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            result.add(i);
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num)) {
          result.add(num);
        }
      }
    }
    return result;
  }

  function getUniqueCOs(): string[] {
    const cos = new Set<string>();
    for (const q of questions) {
      if (q.course_outcome) {
        cos.add(q.course_outcome);
      }
    }
    return Array.from(cos).sort();
  }

  function getFilteredQuestions(): ExtendedQuestion[] {
    if (verifyTab === 'questions') {
      return questions.filter((q) => selectedQuestions.size === 0 || selectedQuestions.has(q.s_no));
    } else {
      return questions.filter((q) => selectedCOs.size === 0 || (q.course_outcome && selectedCOs.has(q.course_outcome)));
    }
  }

  function handleQuestionInputChange(input: string) {
    setQuestionInput(input);
    const parsed = parseQuestionInput(input);
    setSelectedQuestions(parsed);
  }

  function toggleQuestionCheckbox(sNo: number) {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(sNo)) {
      newSelected.delete(sNo);
    } else {
      newSelected.add(sNo);
    }
    setSelectedQuestions(newSelected);
  }

  function toggleCOCheckbox(co: string) {
    const newSelected = new Set(selectedCOs);
    if (newSelected.has(co)) {
      newSelected.delete(co);
    } else {
      newSelected.add(co);
    }
    setSelectedCOs(newSelected);
  }

  function selectAllQuestions() {
    setSelectedQuestions(new Set(questions.map((q) => q.s_no)));
  }

  function clearAllQuestions() {
    setSelectedQuestions(new Set());
    setQuestionInput('');
  }

  function selectAllCOs() {
    setSelectedCOs(new Set(getUniqueCOs()));
  }

  function clearAllCOs() {
    setSelectedCOs(new Set());
  }

  function handleExport() {
    try {
      const collegeNames: Record<string, string> = {
        'KRCT': 'K.Ramakrishnan College of Technology',
        'KRCE': 'K.Ramakrishnan College of Engineering',
        'MKCE': 'M.Kumarasamy College of Engineering'
      };

      const identifiedCollege = questions.find(q => q.college && collegeNames[q.college])?.college || '';
      const collegeHeader = identifiedCollege ? collegeNames[identifiedCollege] : 'Your Institution Name';

      // 1. Refined Helper for "Pixel-Perfect" Math-to-Excel UI
      const renderToExcelHtml = (text: string) => {
        if (!text) return '';
        // Pre-processing
        let tempText = text;
        
        // Handle custom highlighting
        tempText = tempText.replace(/\\colorbox\{([^}]+)\}\{([\s\S]*?)\}/g, 
          '<span style="background-color:$1; padding: 2px 4px; border: 0.5pt solid #ccc;">$2</span>'
        );
        tempText = tempText.replace(/\\highlight\{([^}]+)\}/g, 
          '<span style="background-color: #fef3c7; padding: 2px 4px; font-weight: bold; border: 0.8pt solid #d97706;">$1</span>'
        );

        const segments = parseQuestionContent(tempText);
        
        const segmentsHtml = segments.map(seg => {
          let val = seg.value;
          if (seg.type === 'mermaid') {
            return `<div style="color: #64748b; font-size: 8.5pt; font-style: italic; border: 1pt dashed #cbd5e1; padding: 12px; margin: 6px 0; background: #f8fafc; font-family: 'Segoe UI', sans-serif;">[ Technical Schematic / Diagram ]</div>`;
          }
          if (seg.type === 'image') {
            return `<div style="margin: 10px 0; text-align:center;"><img src="${val}" style="max-height: 180px; border: 1pt solid #e2e8f0;"/></div>`;
          }
          
          if (seg.type === 'math' || seg.type === 'text') {
            // STEP 1: Fractions (Cleanest implementation for Excel - using 1.2pt border for visibility)
            for(let i=0; i<3; i++) {
              val = val.replace(/\\frac\{([\s\S]*?)\}\{([\s\S]*?)\}/g, 
                `<table style="display:inline-table; vertical-align:middle; line-height:1.1; margin:0 4px; border-collapse:collapse;">
                  <tr><td style="border-bottom:1.2pt solid black; text-align:center; padding:1px 8px; font-family: 'Times New Roman', serif; font-size:11.5pt;">$1</td></tr>
                  <tr><td style="text-align:center; padding:1px 8px; font-family: 'Times New Roman', serif; font-size:11.5pt;">$2</td></tr>
                </table>`
              );
            }

            // STEP 2: Complex Symbols (Integral, Summation) with Premium Alignment
            const renderMathSymbol = (sym: string, size: string, low?: string, high?: string) => {
              return `
                <table style="display:inline-table; vertical-align:middle; border-collapse:collapse; margin:2px 6px;">
                  ${high ? `<tr><td style="font-size:10pt; text-align:center; height:14px; vertical-align:bottom; padding-bottom:1px; font-family: 'Times New Roman', serif;">${high}</td></tr>` : ''}
                  <tr><td style="font-size:${size}; text-align:center; font-family:'Times New Roman', serif; font-weight:bold; line-height:0.6; color:#000;">${sym}</td></tr>
                  ${low ? `<tr><td style="font-size:10pt; text-align:center; height:14px; vertical-align:top; padding-top:1px; font-family: 'Times New Roman', serif;">${low}</td></tr>` : ''}
                </table>
              `;
            };

            val = val.replace(/\\int(?:_\{?([^}\s^]+)\}?)?(?:\^\{?([^}\s_]+)\}?)?/g, (_, low, high) => renderMathSymbol('∫', '32pt', low, high));
            val = val.replace(/\\sum(?:_\{?([^}\s^]+)\}?)?(?:\^\{?([^}\s_]+)\}?)?/g, (_, low, high) => renderMathSymbol('Σ', '28pt', low, high));

            // STEP 3: Matrix Engine (Strict Professionalism)
            val = val.replace(/\\begin\{([pbvBV]matrix|cases|array)\}([\s\S]*?)\\end\{\1\}/g, (_, type, content) => {
              const cleanContent = type === 'array' ? content.replace(/^\{[^}]+\}/, '').trim() : content.trim();
              const rows = cleanContent.split(/\\\\/).map(r => r.split('&').map(c => c.trim()));
              
              const isCases = type === 'cases';
              const isPMatrix = type === 'pmatrix';

              const tableRows = rows.map(r => 
                `<tr>${r.map(c => `<td style="padding: 8px 12px; text-align: center; border: none; font-family: 'Times New Roman', serif; font-size: 13pt; color:#000;">${c}</td>`).join('')}</tr>`
              ).join('');

              const borderWeight = "2.2pt solid black";
              if (isPMatrix) {
                return `
                  <table style="display:inline-table; border-collapse:collapse; margin:12px 6px; vertical-align:middle;">
                    <tr>
                      <td style="font-size: 32pt; font-family: 'Times New Roman', serif; font-weight: lighter; color: black; vertical-align: middle; padding: 0 4px;">(</td>
                      <td style="padding:0;"><table style="border-collapse:collapse; border:none;">${tableRows}</table></td>
                      <td style="font-size: 32pt; font-family: 'Times New Roman', serif; font-weight: lighter; color: black; vertical-align: middle; padding: 0 4px;">)</td>
                    </tr>
                  </table>
                `;
              }
              if (isCases) {
                return `
                  <table style="display:inline-table; border-collapse:collapse; margin:12px 6px; vertical-align:middle;">
                    <tr>
                      <td style="font-size: 32pt; font-family: 'Times New Roman', serif; font-weight: lighter; color: black; vertical-align: middle; padding: 0 4px;">{</td>
                      <td style="padding:0;"><table style="border-collapse:collapse; border:none;">${tableRows}</table></td>
                    </tr>
                  </table>
                `;
              }

              return `
                <table style="display:inline-table; border-collapse:collapse; margin:12px 6px; vertical-align:middle;">
                  <tr>
                    <td style="border-left:${borderWeight}; border-top:${borderWeight}; width:8pt;"></td>
                    <td rowspan="2" style="padding:0;"><table style="border-collapse:collapse; border:none;">${tableRows}</table></td>
                    <td style="border-right:${borderWeight}; border-top:${borderWeight}; width:8pt;"></td>
                  </tr>
                  <tr>
                    <td style="border-left:${borderWeight}; border-bottom:${borderWeight}; width:8pt;"></td>
                    <td style="border-right:${borderWeight}; border-bottom:${borderWeight}; width:8pt;"></td>
                  </tr>
                </table>
              `;
            });

            // STEP 4: Standard LaTeX Symbols to Unicode
            const symbols: Record<string, string> = {
              '\\pm': '±', '\\times': '×', '\\div': '÷', '\\neq': '≠', '\\leq': '≤', '\\geq': '≥',
              '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\theta': 'θ', '\\lambda': 'λ', '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω', '\\phi': 'φ',
              '\\Delta': 'Δ', '\\Sigma': 'Σ', '\\infty': '∞', '\\approx': '≈', '\\forall': '∀', '\\exists': '∃', '\\nabla': '∇', '\\partial': '∂', '\\in': '∈', '\\subset': '⊂',
              '\\dots': '...', '\\cdots': '⋯', '\\therefore': '∴', '\\because': '∵', '\\sqrt': '√', '\\langle': '〈', '\\rangle': '〉', '\\emptyset': '∅', '\\angle': '∠'
            };
            Object.entries(symbols).forEach(([tex, uni]) => {
              val = val.replace(new RegExp('\\' + tex, 'g'), uni);
            });

            // Final Polish: Super/Sub-scripts and generic cleanup
            val = val.replace(/\^\{?([^}\s]+)\}?/g, '<sup>$1</sup>')
                     .replace(/_\{?([^}\s]+)\}?/g, '<sub>$1</sub>')
                     .replace(/\$+/g, '') 
                     .replace(/\\mathrm|\\text|\\quad|\\qquad|\\,|\\!/g, ' ')
                     .replace(/\\left[({[.]|\\right[)}\].]|\\left|\\right/g, '')
                     .replace(/\\/g, ''); 

            return `<span>${val.replace(/\n/g, '<br/>')}</span>`;
          }
          return '';
        }).join('');

        return `<div style="font-size: 12.5pt; font-family: 'Times New Roman', serif; line-height:1.6; color:#000;">${segmentsHtml}</div>`;
      };

      // 2. Ultra High-Fidelity Professional Header Structure
      const htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <style>
            .header-info { text-align: center; font-family: 'Segoe UI', system-ui, sans-serif; }
            .college-title { font-size: 22pt; font-weight: bold; color: #1e3a8a; margin: 0; text-decoration: underline; }
            .dept-title { font-size: 14pt; font-weight: 600; color: #334155; margin: 8px 0; }
            .doc-type { font-size: 16pt; font-weight: bold; background-color: #f8fafc; padding: 12px; border: 1.5pt solid #1e3a8a; margin: 15px 0; color: #1e3a8a; }
            
            .metadata { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1pt solid #cbd5e1; }
            .meta-item { padding: 10px; font-family: 'Segoe UI', sans-serif; font-size: 11pt; color: #1e293b; border: 0.5pt solid #cbd5e1; }
            .label { font-weight: bold; background: #f1f5f9; color: #000; width: 18%; }
            
            .data-table { border-collapse: collapse; width: 100%; border: 2.2pt solid #000; }
            .data-table th { background-color: #f1f5f9; border: 1pt solid #000; padding: 14px 10px; font-weight: bold; font-family: 'Segoe UI', sans-serif; font-size: 11pt; text-align: center; color: #000; }
            .data-table td { border: 1pt solid #000; padding: 14px 10px; vertical-align: top; font-family: 'Segoe UI', sans-serif; font-size: 10.5pt; mso-number-format: "\@"; }
            .alt-row { background-color: #fcfdfe; }
            
            .sno-cell { text-align: center; font-weight: bold; font-size: 11pt; }
            .type-badge { font-weight: bold; text-align: center; color: #1e40af; background: #eff6ff; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="header-info">
            <h1 class="college-title">${collegeHeader}</h1>
            <h2 class="dept-title">DEPARTMENT OF TECHNICAL EDUCATION AND QUALITY ASSURANCE</h2>
            <div class="doc-type">OFFICIAL QUESTION BANK REPOSITORY - ${new Date().getFullYear()}</div>
          </div>

          <table class="metadata">
            <tr>
              <td class="meta-item label">Course Code</td>
              <td class="meta-item" style="width:32%">${courseCode}</td>
              <td class="meta-item label">Course Name</td>
              <td class="meta-item">${courseName || 'N/A'}</td>
            </tr>
            <tr>
              <td class="meta-item label">Status</td>
              <td class="meta-item" style="color: ${isFinalized ? '#15803d' : '#b91c1c'}; font-weight: bold;">${isFinalized ? 'VERIFIED & FINALIZED' : 'WORK IN PROGRESS (DRAFT)'}</td>
              <td class="meta-item label">Export Date</td>
              <td class="meta-item">${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
            </tr>
          </table>

          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 45pt;">S.No</th>
                <th style="width: 60pt;">Type</th>
                <th style="width: 550pt;">Question Content</th>
                <th style="width: 200pt;">Subtopics</th>
                <th style="width: 65pt;">BTL</th>
                <th style="width: 65pt;">CO</th>
                <th style="width: 55pt;">Marks</th>
                <th style="width: 55pt;">Part</th>
                <th style="width: 85pt;">College</th>
              </tr>
            </thead>
            <tbody>
              ${questions.map((q, idx) => `
                <tr class="${idx % 2 === 0 ? 'alt-row' : ''}">
                  <td class="sno-cell">${q.s_no}</td>
                  <td class="type-badge">${q.question_type || 'D'}</td>
                  <td style="padding-left:15px; padding-right:15px;">${renderToExcelHtml(q.question_text || '')}</td>
                  <td style="font-size: 10pt; color: #475569;">${q.subtopics || '-'}</td>
                  <td style="text-align: center; font-weight: bold; background:#f8fafc;">${q.btl ?? '-'}</td>
                  <td style="text-align: center; color: #1e40af; font-weight: bold;">${q.course_outcome ? 'CO' + q.course_outcome : '-'}</td>
                  <td style="text-align: center;">${q.marks ?? '-'}</td>
                  <td style="text-align: center; font-weight: bold;">${q.part ?? '-'}</td>
                  <td style="text-align: center; color: #475569; font-size: 9pt;">${q.college || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <br/><br/><br/>
          <table style="width: 100%; margin-top: 80px; font-family: 'Segoe UI', sans-serif;">
            <tr>
              <td style="width: 33%; border-top: 1.5pt solid #000; padding-top: 8px; font-size: 11pt; font-weight: bold; text-align: center;">COURSE INCHARGE</td>
              <td style="width: 33%; text-align: center; padding-top: 8px;"></td>
              <td style="width: 33%; border-top: 1.5pt solid #000; padding-top: 8px; font-size: 11pt; font-weight: bold; text-align: center;">HEAD OF THE DEPARTMENT</td>
            </tr>
            <tr><td colspan="3" style="height: 60px;"></td></tr>
            <tr>
              <td style="width:33%;"></td>
              <td style="width: 33%; border-top: 1.5pt solid #000; text-align: center; padding-top: 8px; font-size: 11pt; font-weight: bold;">PRINCIPAL / IQAC DIRECTOR</td>
              <td style="width:33%;"></td>
            </tr>
            <tr>
              <td colspan="3" style="padding-top: 40px; text-align: center; font-size: 9pt; color: #64748b; font-style: italic;">
                Computer generated document. Valid without physical signature if officially digitally verified.
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      // 3. Trigger Download
      const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `QuestionBank_${courseCode}_${new Date().toISOString().split('T')[0]}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setError(null);
    } catch (e: any) {
      setError('Export failed: ' + (e.message || 'Unknown error'));
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      if (rows.length < 1) {
        setError('The file is empty');
        return;
      }

      // Find the header row (searching for 'S.No' and 'Question')
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if (!row) continue;
        const rowStr = row.map(c => String(c || '').toLowerCase()).join('|');
        if (rowStr.includes('s.no') && rowStr.includes('question')) {
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) {
        setError('Could not find a row with headers like "S.No" and "Question". Please ensure headers are in the first 20 rows.');
        return;
      }

      const headers = rows[headerRowIdx].map(h => String(h || ''));
      const dataRows = rows.slice(headerRowIdx + 1);

      // Map columns to question fields
      const sNoIdx = headers.findIndex((h) => h.toLowerCase().includes('s.no'));
      const typeIdx = headers.findIndex((h) => h.toLowerCase().includes('type'));
      const questionIdx = headers.findIndex((h) => h.toLowerCase().includes('question'));
      const subtopicsIdx = headers.findIndex((h) => h.toLowerCase().includes('subtopic'));
      const btlIdx = headers.findIndex((h) => h.toLowerCase().includes('btl'));
      const coIdx = headers.findIndex((h) => h.toLowerCase().includes('outcome'));
      const marksIdx = headers.findIndex((h) => h.toLowerCase().includes('marks'));
      const partIdx = headers.findIndex((h) => h.toLowerCase().includes('part'));
      const collegeIdx = headers.findIndex((h) => h.toLowerCase().includes('college'));

      if (sNoIdx === -1 || questionIdx === -1) {
        setError('Required columns (S.No, Question) not found');
        return;
      }

      // Process each row
      for (const row of dataRows) {
        if (!row || row.length === 0) continue;

        const sNo = row[sNoIdx] ? Number(row[sNoIdx]) : null;
        if (sNo === null || isNaN(sNo)) continue;

        const existingQuestion = questions.find((q) => q.s_no === sNo);

        const updateData = {
          question_text: questionIdx >= 0 ? String(row[questionIdx] || '').trim() : undefined,
          subtopics: subtopicsIdx >= 0 ? String(row[subtopicsIdx] || '').trim() : undefined,
          question_type: typeIdx >= 0 ? (String(row[typeIdx] || '').trim() as 'D' | 'O') : undefined,
          btl: btlIdx >= 0 ? (row[btlIdx] ? Number(row[btlIdx]) : undefined) : undefined,
          course_outcome: coIdx >= 0 ? String(row[coIdx] || '').trim() : undefined,
          marks: marksIdx >= 0 ? (row[marksIdx] ? Number(row[marksIdx]) : undefined) : undefined,
          part: partIdx >= 0 ? String(row[partIdx] || '').trim() : undefined,
          college: collegeIdx >= 0 ? String(row[collegeIdx] || '').trim() : undefined,
        };

        if (existingQuestion?.id && existingQuestion.id > 0) {
          await updateCourseQuestion(existingQuestion.id, updateData);
        } else {
          const createPayload = {
            course_code: courseCode,
            course_name: courseName || '',
            s_no: sNo,
            ...updateData,
          };
          await createCourseQuestion(createPayload as any);
        }
      }

      // Refresh data
      await loadData();
      setError(null);
    } catch (e: any) {
      setError('Failed to import questions: ' + (e.message || 'Unknown error'));
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  if (!courseCode) {
    return (
      <div style={{ padding: '20px', minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: 'system-ui, -apple-system' }}>
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 16px', color: '#d1d5db' }} />
          <p style={{ fontSize: '16px' }}>No course selected. Please select a course first.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: 'system-ui, -apple-system' }}>
      <div style={{ marginBottom: '24px', backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>Question Bank</h1>
        <p style={{ margin: '0 0 12px 0', color: '#6b7280', fontSize: '14px' }}>
          Course: <span style={{ fontWeight: '600', color: '#374151' }}>{courseCode}</span>
          {courseName && <span style={{ color: '#6b7280' }}> - {courseName}</span>}
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '13px' }}>
          <span style={{ backgroundColor: '#dbeafe', color: '#1e40af', padding: '4px 12px', borderRadius: '16px', fontWeight: '600' }}>
            {templateCount} Default Rows
          </span>
          {isFinalized && (
            <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={14} /> Finalized
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={() => setActiveTab('questions')}
          style={{
            padding: '12px 16px',
            border: 'none',
            backgroundColor: activeTab === 'questions' ? '#fff' : 'transparent',
            borderBottom: activeTab === 'questions' ? '2px solid #3b82f6' : '2px solid transparent',
            fontWeight: activeTab === 'questions' ? '600' : '400',
            color: activeTab === 'questions' ? '#3b82f6' : '#6b7280',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Questions
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '12px 16px',
            border: 'none',
            backgroundColor: activeTab === 'logs' ? '#fff' : 'transparent',
            borderBottom: activeTab === 'logs' ? '2px solid #3b82f6' : '2px solid transparent',
            fontWeight: activeTab === 'logs' ? '600' : '400',
            color: activeTab === 'logs' ? '#3b82f6' : '#6b7280',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Logs
        </button>
      </div>

      {error && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          color: '#991b1b',
        }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {generatedCode && (
        <div style={{
          marginBottom: '16px',
          padding: '16px',
          backgroundColor: codeTerminated ? '#fee2e2' : '#dbeafe',
          border: `2px solid ${codeTerminated ? '#dc2626' : '#0284c7'}`,
          borderRadius: '6px',
          color: codeTerminated ? '#991b1b' : '#0c4a6e',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: '0', fontSize: '16px', fontWeight: '600' }}>
              {codeTerminated ? '❌ Verification Code Terminated' : '✓ Verification Code Generated'}
            </h3>
            <button
              onClick={clearCode}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <X size={20} />
            </button>
          </div>
          
          {!codeTerminated ? (
            <>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  letterSpacing: '4px',
                  backgroundColor: '#fff',
                  padding: '16px 24px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  border: '2px solid #0284c7',
                }}>
                  {generatedCode}
                </div>
                <button
                  onClick={copyCodeToClipboard}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '12px',
                  }}
                >
                  <Copy size={16} /> Copy
                </button>
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px' }}>
                Code expires at: <strong>{codeExpiry}</strong>
              </p>
              <button
                onClick={terminateCode}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '12px',
                }}
              >
                Terminate Code
              </button>
            </>
          ) : (
            <p style={{ margin: '0', fontSize: '13px', fontWeight: '500' }}>
              This verification code has been terminated and is no longer valid.
            </p>
          )}
        </div>
      )}

      {activeTab === 'questions' && (
        <div>
          {isFinalized && !allowAllColumnsEdit && (
            <div style={{
              marginBottom: '16px',
              padding: '20px',
              backgroundColor: '#dcfce7',
              border: '1px solid #86efac',
              borderRadius: '6px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              color: '#166534',
              fontSize: '16px',
              fontWeight: '500',
            }}>
              <CheckCircle2 size={24} />
              <span>This question bank is finalized. No edits are allowed until IQAC opens it for editing.</span>
            </div>
          )}

          {allowAllColumnsEdit && isFinalized && (
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '6px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              color: '#92400e',
            }}>
              <AlertCircle size={20} />
              <span>This question bank is finalized. You are editing it in IQAC mode. Click "Open" to allow all faculties to edit.</span>
            </div>
          )}

          <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {!isFinalized && allowAllColumnsEdit && (
              <button
                onClick={handleFinalize}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                }}
              >
                <Lock size={18} /> Finalize All
              </button>
            )}
            {isFinalized && allowAllColumnsEdit && (
              <button
                onClick={handleOpen}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                }}
              >
                <AlertCircle size={18} /> Open for Editing
              </button>
            )}
            {allowAllColumnsEdit && (
              <button
                onClick={() => setShowVerifyModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                }}
              >
                <ShieldCheck size={18} /> Verify
              </button>
            )}
            {(allowAllColumnsEdit || !isFinalized) && (
              <>
                <button
                  onClick={handleExport}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                  }}
                >
                  <Download size={18} /> Export
                </button>
                <button
                  onClick={handleImportClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: '#8b5cf6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                  }}
                >
                  <Upload size={18} /> Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                />
              </>
            )}
            {!isFinalized && (
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {allowAllColumnsEdit
                  ? 'IQAC can edit Type, Question, BTL, CO, Marks, Part, and College. Add/Delete is disabled by design.'
                  : 'Only Question text is editable for faculty. Add/Delete is disabled by design.'}
              </div>
            )}
          </div>

          {(allowAllColumnsEdit || !isFinalized) && (
            <>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading...</div>
              ) : (
                <div style={{
                  overflowX: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', width: '60px' }}>S.No</th>
                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', width: '70px' }}>Type</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', minWidth: '220px' }}>Question</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151', minWidth: '200px' }}>Subtopics</th>
                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', width: '90px' }}>BTL Level</th>
                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', width: '130px' }}>Course Outcomes</th>
                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', width: '80px' }}>Marks</th>
                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', width: '80px' }}>Part</th>
                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#374151', width: '90px' }}>College</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q, idx) => {
                        return (
                          <tr key={q.id || idx} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                            <td style={{ padding: '12px', fontWeight: '600', color: '#374151' }}>
                              <span>{q.s_no}</span>
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center', color: '#374151', fontWeight: '600' }}>
                              {allowAllColumnsEdit || !isFinalized ? (
                                <select
                                  value={q.question_type || ''}
                                  onChange={(e) => updateQuestionField(q.s_no, 'question_type', e.target.value)}
                                  onBlur={() => {
                                    const latest = questionsRef.current.find((item) => item.s_no === q.s_no);
                                    if (latest) void handleSaveRow(latest);
                                  }}
                                  style={{
                                    width: '60px',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    textAlign: 'center',
                                  }}
                                >
                                  <option value="">-</option>
                                  <option value="D">D</option>
                                  <option value="O">O</option>
                                </select>
                              ) : (
                                <span>{q.question_type}</span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {allowAllColumnsEdit || !isFinalized ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {activeEditSNo === q.s_no ? (
                                    <textarea
                                      data-sno={q.s_no}
                                      data-question-input="true"
                                      value={q.question_text || ''}
                                      onChange={(e) => allowAllColumnsEdit ? updateQuestionField(q.s_no, 'question_text', e.target.value) : updateQuestionText(q.s_no, e.target.value)}
                                      onBlur={() => {
                                        setActiveEditSNo(null);
                                        const latest = questionsRef.current.find((item) => item.s_no === q.s_no);
                                        if (latest) void handleSaveRow(latest);
                                      }}
                                      onPaste={(e) => {
                                        const items = e.clipboardData.items;
                                        for (const item of Array.from(items)) {
                                          if (item.type.indexOf('image') !== -1) {
                                            const file = item.getAsFile();
                                            if (!file) continue;
                                            const reader = new FileReader();
                                            reader.onload = () => {
                                              const dataUrl = String(reader.result || '');
                                              const current = (e.currentTarget as HTMLTextAreaElement).value || '';
                                              const nextValue = `${current}\n![image](${dataUrl})`.trim();
                                              updateQuestionField(q.s_no, 'question_text', nextValue);
                                              
                                              // Immediate save for "lively" experience
                                              const latest = questionsRef.current.find(item => item.s_no === q.s_no);
                                              if (latest) {
                                                handleSaveRow({ ...latest, question_text: nextValue, dirty: true });
                                              }
                                            };
                                            reader.readAsDataURL(file);
                                          }
                                        }
                                      }}
                                      rows={4}
                                      style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        fontSize: '14px',
                                        resize: 'vertical',
                                      }}
                                      placeholder="Type question"
                                    />
                                  ) : (
                                    <div
                                      onClick={() => setActiveEditSNo(q.s_no)}
                                      style={{
                                        minHeight: '38px',
                                        padding: '8px',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '4px',
                                        backgroundColor: '#fff',
                                        cursor: 'text',
                                      }}
                                    >
                                      {renderQuestionPreview(q.question_text || '')}
                                      {!q.question_text && (
                                        <span style={{ color: '#9ca3af', fontSize: '13px' }}>Click to add question</span>
                                      )}
                                    </div>
                                  )}
                                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                    Shortcuts: Ctrl/Cmd+Shift+M (Math), Ctrl/Cmd+Shift+E (Circuit), Ctrl/Cmd+Shift+D (DSA)
                                  </div>
                                </div>
                              ) : (
                                <div style={{ color: '#111827' }}>{renderQuestionPreview(q.question_text || '')}</div>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {allowAllColumnsEdit || !isFinalized ? (
                                <select
                                  value={q.subtopics || ''}
                                  onChange={(e) => updateQuestionField(q.s_no, 'subtopics', e.target.value)}
                                  onBlur={() => {
                                    const latest = questionsRef.current.find((item) => item.s_no === q.s_no);
                                    if (latest) void handleSaveRow(latest);
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                  }}
                                >
                                  <option value="">-</option>
                                  {getSubtopicOptions(q).map((topic) => (
                                    <option key={topic} value={topic}>{topic}</option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ color: '#111827' }}>{q.subtopics || '-'}</span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {allowAllColumnsEdit || !isFinalized ? (
                                <select
                                  value={q.btl ?? ''}
                                  onChange={(e) => updateQuestionField(q.s_no, 'btl', e.target.value ? Number(e.target.value) : undefined)}
                                  onBlur={() => {
                                    const latest = questionsRef.current.find((item) => item.s_no === q.s_no);
                                    if (latest) void handleSaveRow(latest);
                                  }}
                                  style={{
                                    width: '70px',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    textAlign: 'center',
                                  }}
                                >
                                  <option value="">-</option>
                                  {[1, 2, 3, 4, 5, 6].map((level) => (
                                    <option key={level} value={String(level)}>{level}</option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ color: '#374151' }}>{q.btl ?? '-'}</span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {allowAllColumnsEdit || !isFinalized ? (
                                <select
                                  value={q.course_outcome || ''}
                                  onChange={(e) => updateQuestionField(q.s_no, 'course_outcome', e.target.value)}
                                  onBlur={() => {
                                    const latest = questionsRef.current.find((item) => item.s_no === q.s_no);
                                    if (latest) void handleSaveRow(latest);
                                  }}
                                  style={{
                                    width: '90px',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    textAlign: 'center',
                                  }}
                                >
                                  <option value="">-</option>
                                  {[1, 2, 3, 4, 5].map((co) => (
                                    <option key={co} value={String(co)}>CO{co}</option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ color: '#374151' }}>{q.course_outcome || '-'}</span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {allowAllColumnsEdit || !isFinalized ? (
                                <input
                                  type="number"
                                  step="1"
                                  value={q.marks ?? ''}
                                  onChange={(e) => updateQuestionField(q.s_no, 'marks', e.target.value ? Number(e.target.value) : undefined)}
                                  onBlur={() => {
                                    const latest = questionsRef.current.find((item) => item.s_no === q.s_no);
                                    if (latest) void handleSaveRow(latest);
                                  }}
                                  style={{
                                    width: '70px',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    textAlign: 'center',
                                  }}
                                />
                              ) : (
                                <span style={{ color: '#374151' }}>{q.marks ?? '-'}</span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {allowAllColumnsEdit || !isFinalized ? (
                                <select
                                  value={q.part || ''}
                                  onChange={(e) => updateQuestionField(q.s_no, 'part', e.target.value)}
                                  onBlur={() => {
                                    const latest = questionsRef.current.find((item) => item.s_no === q.s_no);
                                    if (latest) void handleSaveRow(latest);
                                  }}
                                  style={{
                                    width: '70px',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    textAlign: 'center',
                                  }}
                                >
                                  <option value="">-</option>
                                  <option value="1">1</option>
                                  <option value="2">2</option>
                                </select>
                              ) : (
                                <span style={{ color: '#374151' }}>{q.part || '-'}</span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {allowAllColumnsEdit || !isFinalized ? (
                                <select
                                  value={q.college || ''}
                                  onChange={(e) => updateQuestionField(q.s_no, 'college', e.target.value)}
                                  onBlur={() => {
                                    const latest = questionsRef.current.find((item) => item.s_no === q.s_no);
                                    if (latest) void handleSaveRow(latest);
                                  }}
                                  style={{
                                    width: '80px',
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    textAlign: 'center',
                                  }}
                                >
                                  <option value="">-</option>
                                  <option value="KRCT">KRCT</option>
                                  <option value="KRCE">KRCE</option>
                                  <option value="MKCE">MKCE</option>
                                </select>
                              ) : (
                                <span style={{ color: '#374151' }}>{q.college || '-'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading...</div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>No activity logs yet.</div>
          ) : (
            <div style={{
              overflowX: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: '#fff',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Action</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Edited By</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Time</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: '600',
                          backgroundColor: log.action === 'finalized' ? '#dcfce7' : log.action === 'unfinalezed' ? '#fed7aa' : log.action === 'created' ? '#dbeafe' : '#fef3c7',
                          color: log.action === 'finalized' ? '#166534' : log.action === 'unfinalezed' ? '#b45309' : log.action === 'created' ? '#1e40af' : '#92400e',
                        }}>
                          {log.action.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>{log.edited_by_name || '-'}</td>
                      <td style={{ padding: '12px', color: '#6b7280' }}>{new Date(log.edited_at).toLocaleString()}</td>
                      <td style={{ padding: '12px', color: '#6b7280', fontSize: '12px' }}>
                        {renderLogDetails(log)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showVerifyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            width: '100%',
            maxWidth: '1000px',
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ margin: '0', fontSize: '22px', fontWeight: '600', color: '#111827' }}>Question Bank Verification Setup</h2>
              <button
                onClick={() => {
                  setShowVerifyModal(false);
                  setSelectedQuestions(new Set());
                  setSelectedCOs(new Set());
                  setQuestionInput('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#6b7280',
                }}
              >
                <X size={28} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', padding: '12px 24px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
              <button
                onClick={() => setVerifyTab('questions')}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  backgroundColor: verifyTab === 'questions' ? '#fff' : 'transparent',
                  borderBottom: verifyTab === 'questions' ? '3px solid #6366f1' : 'none',
                  fontWeight: verifyTab === 'questions' ? '600' : '400',
                  color: verifyTab === 'questions' ? '#6366f1' : '#6b7280',
                  cursor: 'pointer',
                  fontSize: '15px',
                }}
              >
                Questions
              </button>
              <button
                onClick={() => setVerifyTab('cos')}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  backgroundColor: verifyTab === 'cos' ? '#fff' : 'transparent',
                  borderBottom: verifyTab === 'cos' ? '3px solid #6366f1' : 'none',
                  fontWeight: verifyTab === 'cos' ? '600' : '400',
                  color: verifyTab === 'cos' ? '#6366f1' : '#6b7280',
                  cursor: 'pointer',
                  fontSize: '15px',
                }}
              >
                Course Outcomes
              </button>
            </div>

            {/* Content Area */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
              {/* Left Panel - Selection */}
              <div style={{ flex: 1, borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: '24px' }}>
                {verifyTab === 'questions' && (
                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>Select Questions</h3>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                        Enter Question Numbers
                      </label>
                      <input
                        type="text"
                        value={questionInput}
                        onChange={(e) => handleQuestionInputChange(e.target.value)}
                        placeholder="e.g., 1-20,22,23-26"
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          boxSizing: 'border-box',
                          fontFamily: 'monospace',
                        }}
                      />
                      <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                        Use ranges (1-5), single numbers (7,9), or combination (1-5,7,9-12)
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <button
                        onClick={selectAllQuestions}
                        style={{
                          flex: 1,
                          padding: '8px',
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          border: '1px solid #bfdbfe',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          fontSize: '12px',
                        }}
                      >
                        Select All
                      </button>
                      <button
                        onClick={clearAllQuestions}
                        style={{
                          flex: 1,
                          padding: '8px',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          fontSize: '12px',
                        }}
                      >
                        Clear All
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      {questions.map((q) => (
                        <label key={q.s_no} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: '#f9fafb' }}>
                          <input
                            type="checkbox"
                            checked={selectedQuestions.has(q.s_no)}
                            onChange={() => toggleQuestionCheckbox(q.s_no)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          <span style={{ fontSize: '13px', fontWeight: '500' }}>Q {q.s_no}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {verifyTab === 'cos' && (
                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>Select Course Outcomes</h3>
                    
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <button
                        onClick={selectAllCOs}
                        style={{
                          flex: 1,
                          padding: '8px',
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          border: '1px solid #bfdbfe',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          fontSize: '12px',
                        }}
                      >
                        Select All
                      </button>
                      <button
                        onClick={clearAllCOs}
                        style={{
                          flex: 1,
                          padding: '8px',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          fontSize: '12px',
                        }}
                      >
                        Clear All
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                      {getUniqueCOs().map((co) => (
                        <label key={co} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '12px', borderRadius: '4px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                          <input
                            type="checkbox"
                            checked={selectedCOs.has(co)}
                            onChange={() => toggleCOCheckbox(co)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>{co}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Panel - Preview */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e5e7eb', overflowY: 'auto' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#111827' }}>Preview - Visible Questions for Verifier</h3>
                  <p style={{ margin: '0', fontSize: '12px', color: '#6b7280' }}>
                    Total: {getFilteredQuestions().length} question(s) will be visible
                  </p>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                  {getFilteredQuestions().length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 20px' }}>No questions selected</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {getFilteredQuestions().map((q) => (
                        <div
                          key={q.s_no}
                          style={{
                            padding: '12px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '4px',
                            borderLeft: '3px solid #6366f1',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px' }}>
                            <div>
                              <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                                Q {q.s_no}: {q.question_text ? q.question_text.substring(0, 60) + (q.question_text.length > 60 ? '...' : '') : '(No text)'}
                              </p>
                              <p style={{ margin: '0', fontSize: '12px', color: '#6b7280' }}>
                                {q.course_outcome && <span>CO: {q.course_outcome}</span>}
                                {q.course_outcome && q.marks && <span> • </span>}
                                {q.marks && <span>Marks: {q.marks}</span>}
                              </p>
                            </div>
                            <span style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '3px', fontWeight: '500' }}>
                              {q.question_type}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer - Time Limit & Generate */}
            <div style={{ padding: '20px 24px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb', display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '13px', color: '#374151' }}>
                  Code Valid For (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={verifyTimeLimit}
                  onChange={(e) => setVerifyTimeLimit(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    setShowVerifyModal(false);
                    setSelectedQuestions(new Set());
                    setSelectedCOs(new Set());
                    setQuestionInput('');
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateCode}
                  disabled={getFilteredQuestions().length === 0}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: getFilteredQuestions().length === 0 ? '#d1d5db' : '#6366f1',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: getFilteredQuestions().length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                  }}
                >
                  Generate Code
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Specialty Editors & Palettes */}
      <MathEquationKeyboard 
        isOpen={!!activeMathField} 
        onClose={() => setActiveMathField(null)} 
        initialValue={activeMathField?.value || ''}
        onApply={(latex) => {
          if (activeMathField) {
            const latest = questionsRef.current.find((item) => item.s_no === activeMathField.sNo);
            const base = latest?.question_text || activeMathField.value || '';
            const nextValue = (base + ' $$' + latex + '$$').trim();
            updateQuestionField(activeMathField.sNo, 'question_text', nextValue);
            setActiveMathField(null);
            // Re-save immediately with latest data
            if (latest) {
              handleSaveRow({ ...latest, question_text: nextValue, dirty: true });
            }
          }
        }}
      />

      <ComponentPalette 
        isOpen={!!activeElectricalPalette} 
        onClose={() => setActiveElectricalPalette(null)}
        title="Electrical Components"
        icon={<Zap size={18} color="#f59e0b" />}
        items={[
          { label: 'Series R-C', value: 'flowchart LR\nV((V))-->R[Resistor]-->C[Capacitor]-->GND((GND))' },
          { label: 'Series R-L', value: 'flowchart LR\nV((V))-->R[Resistor]-->L[Inductor]-->GND((GND))' },
          { label: 'RLC Loop', value: 'flowchart LR\nV((V))-->R[Resistor]-->L[Inductor]-->C[Capacitor]-->V' },
          { label: 'Diode Circuit', value: 'flowchart LR\nV((V))-->D[Diode]-->R[Resistor]-->GND((GND))' },
          { label: 'Op-Amp Inverting', value: 'flowchart LR\nVIN((Vin))-->R1[Resistor]-->OP[Op-Amp]-->VOUT((Vout))\nOP-->R2[Feedback]-->R1' },
          { label: 'Voltage Divider', value: 'flowchart LR\nV((V))-->R1[Resistor]-->R2[Resistor]-->GND((GND))' },
        ]}
        onSelect={(comp) => {
          if (activeElectricalPalette) {
            const latest = questionsRef.current.find(item => item.s_no === activeElectricalPalette.sNo);
            if (latest) {
              const newVal = (latest.question_text || '') + `\n\`\`\`mermaid\n${comp}\n\`\`\``;
              updateQuestionField(activeElectricalPalette.sNo, 'question_text', newVal);
              handleSaveRow({ ...latest, question_text: newVal, dirty: true });
            }
            setActiveElectricalPalette(null);
          }
        }}
      />

      <ComponentPalette 
        isOpen={!!activeDataStructurePalette} 
        onClose={() => setActiveDataStructurePalette(null)}
        title="Data Structures & Algorithms"
        icon={<TreePine size={18} color="#10b981" />}
        items={[
          { label: 'Binary Tree', value: 'graph TD\nA((A))-->B((B))\nA-->C((C))' },
          { label: 'Linked List', value: 'flowchart LR\nA[A]-->B[B]-->C[C]-->N[NULL]' },
          { label: 'Graph (Directed)', value: 'graph LR\nA-->B\nB-->C\nC-->A' },
          { label: 'Queue', value: 'flowchart LR\nF[Front]-->N1[1]-->N2[2]-->N3[3]-->R[Rear]' },
          { label: 'Stack', value: 'flowchart TB\nTOP((Top))-->N3[3]-->N2[2]-->N1[1]' },
          { label: 'Hash Table', value: 'flowchart TB\nH[Hash Table]\nH-->B0[0: A]\nH-->B1[1: B]\nH-->B2[2: C]' },
          { label: 'Matrix', value: 'flowchart TB\nM[Matrix]\nM-->R1[1 0]\nM-->R2[0 1]' },
        ]}
        onSelect={(comp) => {
          if (activeDataStructurePalette) {
            const latest = questionsRef.current.find(item => item.s_no === activeDataStructurePalette.sNo);
            if (latest) {
              const newVal = (latest.question_text || '') + `\n\`\`\`mermaid\n${comp}\n\`\`\``;
              updateQuestionField(activeDataStructurePalette.sNo, 'question_text', newVal);
              handleSaveRow({ ...latest, question_text: newVal, dirty: true });
            }
            setActiveDataStructurePalette(null);
          }
        }}
      />
    </div>
  );
}
