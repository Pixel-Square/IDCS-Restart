import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Upload,
  Download,
  Calendar,
  Clock,
  BookOpen,
  Users,
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Shuffle,
  Sparkles,
  Database,
  Layers,
  Check,
  Ban,
  Tag,
  ShieldAlert,
  AlertTriangle
} from 'lucide-react';
import {
  OnlineExamMetaResponse,
  OnlineExamQuestionBank,
  CreateExamPayload,
  createOnlineExam,
  fetchQuestionBanks
} from '../../../services/onlineExam';

interface CreateExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExamCreated: () => void;
  meta: OnlineExamMetaResponse | null;
}

interface ParsedQuestion {
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  co?: number;
  marks?: number;
}

interface InchargeEntry {
  staff_user_id?: number;
  staff_id: string;
  staff_name: string;
  role: string;
}

export default function CreateExamModal({
  isOpen,
  onClose,
  onExamCreated,
  meta
}: CreateExamModalProps) {
  // Wizard steps: 1: Details, 2: Questions Config, 3: Omit & Sort, 4: Course & Sections, 5: Faculty Incharge
  const [step, setStep] = useState<number>(1);

  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successNotice, setSuccessNotice] = useState<string>('');

  // Step 1: Details (Exam Title, Date, Start Mode, Duration)
  const [title, setTitle] = useState<string>('');
  const [examDate, setExamDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [startMode, setStartMode] = useState<'MANUAL' | 'AUTO'>('MANUAL');
  const [autoStartTime, setAutoStartTime] = useState<string>('09:30');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);

  // Step 2: Questions Config & Import
  const [questionBankTitle, setQuestionBankTitle] = useState<string>('');
  const [rawPoolQuestions, setRawPoolQuestions] = useState<ParsedQuestion[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [bankSearch, setBankSearch] = useState<string>('');
  const [fetchedBanks, setFetchedBanks] = useState<OnlineExamQuestionBank[]>([]);

  // Omit Questions State
  const [omittedBankIds, setOmittedBankIds] = useState<number[]>([]);
  const [isOmitModalOpen, setIsOmitModalOpen] = useState<boolean>(false);
  const [omitModalSearch, setOmitModalSearch] = useState<string>('');

  // Sorting / Randomization state
  const [sortCount, setSortCount] = useState<number>(0);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [hasSorted, setHasSorted] = useState<boolean>(false);

  // Step 3: Course & Sections
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('');
  const [selectedCourseName, setSelectedCourseName] = useState<string>('');
  const [courseSearch, setCourseSearch] = useState<string>('');
  const [selectedDeptId, setSelectedDeptId] = useState<number | 'ALL'>('ALL');
  const [selectedBatchId, setSelectedBatchId] = useState<number | 'ALL'>('ALL');
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);

  // Step 5: Malpractices
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(30);
  const [maxViolations, setMaxViolations] = useState<number>(3);

  // Step 6: Faculty Incharge
  const [staffSearch, setStaffSearch] = useState<string>('');
  const [selectedStaffUser, setSelectedStaffUser] = useState<any>(null);
  const [inchargeRole, setInchargeRole] = useState<string>('Chief Superintendent');
  const [incharges, setIncharges] = useState<InchargeEntry[]>([]);

  // Track previous isOpen state so we ONLY reset when modal transitions from closed to open
  const prevIsOpenRef = useRef<boolean>(false);

  // Load question banks on initial open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setStep(1);
      setErrorMsg('');
      setSuccessNotice('');
      setTitle('');
      setQuestionBankTitle('');
      setExamDate(new Date().toISOString().split('T')[0]);
      setStartMode('MANUAL');
      setAutoStartTime('09:30');
      setDurationMinutes(60);
      setCooldownSeconds(30);
      setMaxViolations(3);
      setRawPoolQuestions([]);
      setQuestions([]);
      setSortCount(0);
      setHasSorted(false);
      setImportFileName('');
      setSelectedBankId(null);
      setBankSearch('');
      setOmittedBankIds([]);
      setIsOmitModalOpen(false);
      setOmitModalSearch('');
      setSelectedCourseCode('');
      setSelectedCourseName('');
      setCourseSearch('');
      setSelectedDeptId('ALL');
      setSelectedBatchId('ALL');
      setSelectedSectionIds([]);
      setStaffSearch('');
      setSelectedStaffUser(null);
      setInchargeRole('Chief Superintendent');
      setIncharges([]);

      fetchQuestionBanks()
        .then((banks) => setFetchedBanks(banks || []))
        .catch(() => setFetchedBanks(meta?.question_banks || []));
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Combined list of question banks
  const questionBanksList = fetchedBanks.length > 0 ? fetchedBanks : (meta?.question_banks || []);

  const filteredQuestionBanks = questionBanksList.filter((b) => {
    if (!bankSearch) return true;
    const s = bankSearch.toLowerCase();
    return (
      b.title.toLowerCase().includes(s) ||
      (b.course_code || '').toLowerCase().includes(s) ||
      (b.course_name || '').toLowerCase().includes(s)
    );
  });

  // Omitted banks calculation
  const omittedBanks = useMemo(() => {
    return questionBanksList.filter((b) => omittedBankIds.includes(b.id));
  }, [questionBanksList, omittedBankIds]);

  // Set of normalized question texts in omitted banks
  const omittedQuestionTexts = useMemo(() => {
    const set = new Set<string>();
    omittedBanks.forEach((b) => {
      (b.questions_data || []).forEach((q: any) => {
        const txt = String(q.question_text || q.question || '').trim().toLowerCase();
        if (txt) set.add(txt);
      });
    });
    return set;
  }, [omittedBanks]);

  // Eligible pool questions after filtering out omitted questions
  const eligiblePoolQuestions = useMemo(() => {
    if (omittedQuestionTexts.size === 0) return rawPoolQuestions;
    return rawPoolQuestions.filter((q) => {
      const txt = (q.question_text || '').trim().toLowerCase();
      return !omittedQuestionTexts.has(txt);
    });
  }, [rawPoolQuestions, omittedQuestionTexts]);

  const matchingOmittedCount = rawPoolQuestions.length - eligiblePoolQuestions.length;

  // Auto-sync eligible questions when raw pool or omitted banks change (if not customized yet)
  useEffect(() => {
    if (!hasSorted && eligiblePoolQuestions.length > 0) {
      setQuestions(eligiblePoolQuestions);
      setSortCount(eligiblePoolQuestions.length);
    }
  }, [eligiblePoolQuestions, hasSorted]);

  if (!isOpen) return null;

  // Template download with S.No, CO, Marks, Question, Option A, Option B, Option C, Option D, Correct Answer
  const handleDownloadTemplate = () => {
    const headers = ['S.No', 'CO', 'Marks', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'];
    const sampleRows = [
      [1, 1, 1, 'What is the full form of CPU?', 'Central Processing Unit', 'Central Processor Union', 'Computer Personal Unit', 'Central Performance Utility', 'A'],
      [2, 1, 1, 'Which of the following is NOT an operating system?', 'Linux', 'Windows', 'Oracle', 'macOS', 'C'],
      [3, 2, 2, 'What is the time complexity of binary search in a sorted array?', 'O(n)', 'O(log n)', 'O(n^2)', 'O(1)', 'B'],
      [4, 2, 2, 'Which protocol is primarily used to securely transfer web pages?', 'HTTP', 'FTP', 'SMTP', 'HTTPS', 'D'],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = [
      { wch: 8 },
      { wch: 8 },
      { wch: 10 },
      { wch: 50 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions_Template');
    XLSX.writeFile(wb, 'Online_Exam_Questions_Template.xlsx');
  };

  // Excel / CSV File upload and parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setSelectedBankId(null);
    setErrorMsg('');
    setSuccessNotice('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[];

        if (data.length < 2) {
          setErrorMsg('The uploaded file appears to be empty or has no header.');
          return;
        }

        const headers = (data[0] as any[]).map((h) => String(h || '').trim().toLowerCase());

        const snoIdx = headers.findIndex((h) => h.includes('s.no') || h.includes('sno') || h.includes('sl') || h === 'no');
        const coIdx = headers.findIndex((h) => h === 'co' || h.includes('course outcome'));
        const marksIdx = headers.findIndex((h) => h.includes('mark') || h.includes('weight'));
        const qIdx = headers.findIndex((h) => h.includes('question') || h.includes('problem') || h.includes('qtext'));
        const optAIdx = headers.findIndex((h) => h.includes('option a') || h === 'option a' || h === 'a' || h === 'opt a');
        const optBIdx = headers.findIndex((h) => h.includes('option b') || h === 'option b' || h === 'b' || h === 'opt b');
        const optCIdx = headers.findIndex((h) => h.includes('option c') || h === 'option c' || h === 'c' || h === 'opt c');
        const optDIdx = headers.findIndex((h) => h.includes('option d') || h === 'option d' || h === 'd' || h === 'opt d');
        const ansIdx = headers.findIndex((h) => h.includes('correct') || h.includes('answer') || h === 'ans');

        if (qIdx === -1 || optAIdx === -1 || optBIdx === -1 || optCIdx === -1 || optDIdx === -1) {
          setErrorMsg('Missing required columns. Please use the template format: S.No, CO, Marks, Question, Option A, Option B, Option C, Option D, Correct Answer.');
          return;
        }

        const parsed: ParsedQuestion[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i] as any[];
          if (!row || row.length === 0) continue;

          const qText = String(row[qIdx] || '').trim();
          if (!qText) continue;

          const optA = String(row[optAIdx] ?? '').trim();
          const optB = String(row[optBIdx] ?? '').trim();
          const optC = String(row[optCIdx] ?? '').trim();
          const optD = String(row[optDIdx] ?? '').trim();

          let rawAns = ansIdx !== -1 ? String(row[ansIdx] ?? '').trim().toUpperCase() : 'A';
          let finalAns = 'A';

          if (rawAns === 'A' || rawAns === 'B' || rawAns === 'C' || rawAns === 'D') {
            finalAns = rawAns;
          } else if (rawAns.startsWith('A') || rawAns === optA.toUpperCase()) {
            finalAns = 'A';
          } else if (rawAns.startsWith('B') || rawAns === optB.toUpperCase()) {
            finalAns = 'B';
          } else if (rawAns.startsWith('C') || rawAns === optC.toUpperCase()) {
            finalAns = 'C';
          } else if (rawAns.startsWith('D') || rawAns === optD.toUpperCase()) {
            finalAns = 'D';
          }

          const qNum = snoIdx !== -1 && row[snoIdx] ? parseInt(row[snoIdx], 10) || parsed.length + 1 : parsed.length + 1;
          const qCo = coIdx !== -1 && row[coIdx] ? parseInt(String(row[coIdx]), 10) || 1 : 1;
          const qMarks = marksIdx !== -1 && row[marksIdx] ? parseInt(String(row[marksIdx]), 10) || 1 : 1;

          parsed.push({
            question_number: qNum,
            question_text: qText,
            option_a: optA,
            option_b: optB,
            option_c: optC,
            option_d: optD,
            correct_answer: finalAns,
            co: qCo,
            marks: qMarks,
          });
        }

        if (parsed.length === 0) {
          setErrorMsg('No valid question rows found in the uploaded file.');
        } else {
          setRawPoolQuestions(parsed);
          setQuestions(parsed);
          setSortCount(parsed.length);
          setHasSorted(false);
          setSuccessNotice(`Successfully imported ${parsed.length} questions from ${file.name}.`);
          setErrorMsg('');
        }
      } catch (err: any) {
        setErrorMsg('Failed to read file: ' + (err.message || 'Check file format.'));
      }
    };
    reader.readAsBinaryString(file);
  };

  // Handler to select a previous question bank
  const handleSelectPreviousBank = (bank: OnlineExamQuestionBank) => {
    setSelectedBankId(bank.id);
    setImportFileName('');
    setErrorMsg('');

    const parsed: ParsedQuestion[] = (bank.questions_data || []).map((q: any, idx: number) => ({
      question_number: idx + 1,
      question_text: q.question_text || q.question || '',
      option_a: q.option_a || q.A || '',
      option_b: q.option_b || q.B || '',
      option_c: q.option_c || q.C || '',
      option_d: q.option_d || q.D || '',
      correct_answer: (q.correct_answer || q.answer || 'A').toUpperCase(),
      co: q.co || 1,
      marks: q.marks || 1,
    }));

    if (parsed.length === 0) {
      setErrorMsg('The selected question bank has no questions.');
      return;
    }

    setRawPoolQuestions(parsed);
    setQuestions(parsed);
    setSortCount(parsed.length);
    setHasSorted(false);

    if (!questionBankTitle) {
      setQuestionBankTitle(bank.title);
    }
    if (bank.course_code && !selectedCourseCode) {
      setSelectedCourseCode(bank.course_code);
      setSelectedCourseName(bank.course_name || '');
    }

    setSuccessNotice(`Selected previous bank "${bank.title}" with ${parsed.length} questions.`);
  };

  // Sort & Randomize Questions handler (respecting omitted questions)
  const handleSortRandomize = () => {
    if (eligiblePoolQuestions.length === 0) {
      setErrorMsg('No eligible questions available in pool (all match omitted question banks).');
      return;
    }

    const targetCount = Math.min(
      Math.max(1, Number(sortCount) || eligiblePoolQuestions.length),
      eligiblePoolQuestions.length
    );

    const shuffled = [...eligiblePoolQuestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const selectedSubset = shuffled.slice(0, targetCount).map((q, idx) => ({
      ...q,
      question_number: idx + 1,
    }));

    setQuestions(selectedSubset);
    setHasSorted(true);
    setSuccessNotice(
      `Randomized and selected ${selectedSubset.length} questions from ${eligiblePoolQuestions.length} eligible questions` +
      (matchingOmittedCount > 0 ? ` (${matchingOmittedCount} questions omitted from previous banks).` : '.')
    );
  };

  // Reset to full eligible pool
  const handleResetToFullPool = () => {
    setQuestions(eligiblePoolQuestions);
    setSortCount(eligiblePoolQuestions.length);
    setHasSorted(false);
    setSuccessNotice(`Reset to full eligible pool of ${eligiblePoolQuestions.length} questions.`);
  };

  // Toggle omitted question bank
  const toggleOmitBank = (bankId: number) => {
    setOmittedBankIds((prev) =>
      prev.includes(bankId) ? prev.filter((id) => id !== bankId) : [...prev, bankId]
    );
  };

  // Step 3 Filtering logic
  const filteredCourses = (meta?.courses || []).filter((c) => {
    if (!courseSearch) return true;
    const s = courseSearch.toLowerCase();
    return c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s);
  });

  const filteredSections = (meta?.sections || []).filter((sec) => {
    if (selectedDeptId !== 'ALL' && sec.department_id !== selectedDeptId) return false;
    if (selectedBatchId !== 'ALL' && sec.batch_id !== selectedBatchId) return false;
    return true;
  });

  const toggleSection = (secId: number) => {
    setSelectedSectionIds((prev) =>
      prev.includes(secId) ? prev.filter((id) => id !== secId) : [...prev, secId]
    );
  };

  const selectAllFilteredSections = () => {
    const idsToAdd = filteredSections.map((s) => s.id);
    setSelectedSectionIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const deselectAllFilteredSections = () => {
    const idsToRemove = new Set(filteredSections.map((s) => s.id));
    setSelectedSectionIds((prev) => prev.filter((id) => !idsToRemove.has(id)));
  };

  // Step 4 Staff incharge handlers
  const filteredStaff = (meta?.staff || []).filter((s) => {
    if (!staffSearch) return true;
    const term = staffSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.staff_id.toLowerCase().includes(term) ||
      s.department.toLowerCase().includes(term)
    );
  });

  const handleAddIncharge = () => {
    if (!selectedStaffUser) {
      setErrorMsg('Please select a staff member from the search results.');
      return;
    }

    if (incharges.some((inc) => inc.staff_id === selectedStaffUser.staff_id)) {
      setErrorMsg('This faculty member is already added to the incharge list.');
      return;
    }

    setIncharges((prev) => [
      ...prev,
      {
        staff_user_id: selectedStaffUser.id,
        staff_id: selectedStaffUser.staff_id,
        staff_name: selectedStaffUser.name,
        role: inchargeRole,
      },
    ]);
    setSelectedStaffUser(null);
    setStaffSearch('');
    setErrorMsg('');
  };

  const handleRemoveIncharge = (index: number) => {
    setIncharges((prev) => prev.filter((_, i) => i !== index));
  };

  // Navigation validations
  const handleNext = () => {
    setErrorMsg('');
    setSuccessNotice('');

    if (step === 1) {
      // Step 1: Details
      if (!title.trim()) {
        setErrorMsg('Please enter an exam title.');
        return;
      }
      if (!examDate) {
        setErrorMsg('Please choose an exam date.');
        return;
      }
      if (startMode === 'AUTO' && !autoStartTime) {
        setErrorMsg('Please specify the auto start time (HH:MM).');
        return;
      }
      if (durationMinutes <= 0) {
        setErrorMsg('Duration must be greater than 0 minutes.');
        return;
      }
      if (!questionBankTitle) {
        setQuestionBankTitle(title.trim() + ' Question Bank');
      }
      setStep(2);
    } else if (step === 2) {
      // Step 2: Questions Config
      if (rawPoolQuestions.length === 0 && questions.length === 0) {
        setErrorMsg('Please import questions from Excel or select a question bank to proceed.');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      // Step 3: Omit & Sort
      if (questions.length === 0) {
        setErrorMsg('No questions configured for this exam. Please adjust your omit criteria or randomize count.');
        return;
      }
      setStep(4);
    } else if (step === 4) {
      // Step 4: Course & Sections
      if (!selectedCourseCode) {
        setErrorMsg('Please select a course for this exam.');
        return;
      }
      if (selectedSectionIds.length === 0) {
        setErrorMsg('Please select at least one section whose students will take this exam.');
        return;
      }
      setStep(5);
    } else if (step === 5) {
      // Step 5: Malpractices
      if (cooldownSeconds < 5) {
        setErrorMsg('Warning cooldown time must be at least 5 seconds.');
        return;
      }
      if (maxViolations < 1) {
        setErrorMsg('Number of allowed violations must be at least 1.');
        return;
      }
      setStep(6);
    }
  };

  // Final Submit
  const handleCreateExam = async () => {
    setErrorMsg('');
    setSaving(true);

    try {
      const payload: CreateExamPayload = {
        title: title.trim(),
        question_bank_title: (questionBankTitle || title).trim(),
        exam_date: examDate,
        start_mode: startMode,
        auto_start_time: startMode === 'AUTO' ? autoStartTime : undefined,
        duration_minutes: Number(durationMinutes),
        cooldown_seconds: Number(cooldownSeconds || 30),
        max_violations: Number(maxViolations || 3),
        course_code: selectedCourseCode,
        course_name: selectedCourseName,
        section_ids: selectedSectionIds,
        incharges: incharges.map((inc) => ({
          user_id: inc.staff_user_id,
          staff_id: inc.staff_id,
          staff_name: inc.staff_name,
          role: inc.role,
        })),
        questions: questions.map((q) => ({
          question_number: q.question_number,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_answer: q.correct_answer,
          co: q.co || 1,
          marks: q.marks || 1,
        })),
      };

      await createOnlineExam(payload);
      onExamCreated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create exam');
    } finally {
      setSaving(false);
    }
  };

  const isSortChanged =
    eligiblePoolQuestions.length > 0 &&
    sortCount > 0 &&
    (sortCount !== eligiblePoolQuestions.length || questions.length !== eligiblePoolQuestions.length || hasSorted);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Create Online Exam</h2>
            <p className="text-xs text-blue-100 mt-0.5">
              Configure exam details, questions with CO & marks, section allocation & incharge faculty
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-medium text-slate-600">
          <div className="flex items-center space-x-2">
            {[
              { num: 1, label: 'Details' },
              { num: 2, label: 'Questions Config' },
              { num: 3, label: 'Omit & Sort' },
              { num: 4, label: 'Course & Sections' },
              { num: 5, label: 'Malpractices' },
              { num: 6, label: 'Faculty Incharge' },
            ].map((s, idx) => (
              <React.Fragment key={s.num}>
                {idx > 0 && <ChevronRight className="w-4 h-4 text-slate-400" />}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
                    step === s.num
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : step > s.num
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                      step === s.num
                        ? 'bg-white text-blue-600 font-bold'
                        : step > s.num
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {step > s.num ? '✓' : s.num}
                  </span>
                  <span>{s.label}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
          <span className="text-slate-500 font-medium">Step {step} of 6</span>
        </div>

        {/* Success Notice */}
        {successNotice && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2.5 text-xs animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span className="flex-1 font-medium">{successNotice}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-2.5 text-xs animate-shake">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span className="flex-1 font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 1: DETAILS (Exam Title, Date, Duration, Start Mode) */}
          {/* ───────────────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Exam Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CIA 1 EXAM - Fall 2026"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white font-medium"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    The official name of the examination displayed to students.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                      Exam Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="date"
                        value={examDate}
                        onChange={(e) => setExamDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                      Duration (Minutes) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        min={1}
                        max={360}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 60)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">
                    Exam Start Mode <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div
                      onClick={() => setStartMode('MANUAL')}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                        startMode === 'MANUAL'
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                          startMode === 'MANUAL' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                        }`}
                      >
                        {startMode === 'MANUAL' && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">Manual Start</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Admin manually starts the exam on the scheduled date via password authorization.
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={() => setStartMode('AUTO')}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                        startMode === 'AUTO'
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                          startMode === 'AUTO' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                        }`}
                      >
                        {startMode === 'AUTO' && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">Auto Start</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Exam automatically begins at the configured start time on the exam date.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {startMode === 'AUTO' && (
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 animate-fadeIn">
                    <label className="block text-sm font-semibold text-indigo-900">
                      Auto Start Time (HH:MM) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={autoStartTime}
                      onChange={(e) => setAutoStartTime(e.target.value)}
                      className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white font-medium"
                    />
                    <p className="text-xs text-indigo-700">
                      The examination unlocks automatically for assigned students at this time.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 2: QUESTIONS CONFIG (Bank Title, Import, Omit Banks, Sort) */}
          {/* ───────────────────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Question Bank Title */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2">
                <label className="block text-sm font-semibold text-slate-800">
                  Question Bank Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. CIA 1 - Question Bank"
                  value={questionBankTitle}
                  onChange={(e) => setQuestionBankTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white font-medium"
                />
                <p className="text-[11px] text-slate-500">
                  The title under which this pool of questions will be saved for future re-use.
                </p>
              </div>

              {/* Source Option A: Excel Import with CO & Marks */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span>Import Questions from Excel</span>
                  </div>
                  <button
                    onClick={handleDownloadTemplate}
                    className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    Download Template with CO & Marks (.xlsx)
                  </button>
                </div>

                <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center transition bg-slate-50/50">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <h4 className="text-xs font-bold text-slate-800">Upload Filled Excel / CSV File</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 max-w-md mx-auto">
                    Columns: <strong>S.No, CO, Marks, Question, Option A, Option B, Option C, Option D, Correct Answer</strong>
                  </p>
                  <div className="mt-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition">
                      <span>Select Excel File</span>
                      <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {importFileName && (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Loaded from Excel: {importFileName} ({rawPoolQuestions.length} Questions)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Source Option B: Choose from Previous Question Banks */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Database className="w-4 h-4 text-purple-600" />
                    <span>Or Choose from Saved Question Banks ({questionBanksList.length})</span>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search previous banks..."
                      value={bankSearch}
                      onChange={(e) => setBankSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs bg-white"
                    />
                  </div>
                </div>

                {filteredQuestionBanks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-52 overflow-y-auto pr-1">
                    {filteredQuestionBanks.map((bank) => {
                      const isSelected = selectedBankId === bank.id;
                      return (
                        <div
                          key={bank.id}
                          onClick={() => handleSelectPreviousBank(bank)}
                          className={`p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                            isSelected
                              ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-2 ring-purple-500/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-xs text-slate-900 truncate" title={bank.title}>
                                {bank.title}
                              </span>
                              {isSelected ? (
                                <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center gap-1 flex-shrink-0">
                                  <Check className="w-3 h-3" /> Selected
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex-shrink-0">
                                  {bank.questions_count} Qs
                                </span>
                              )}
                            </div>
                            {bank.course_code && (
                              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                {bank.course_code} {bank.course_name ? `• ${bank.course_name}` : ''}
                              </p>
                            )}
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                            <span>Saved: {bank.created_at}</span>
                            <span className="text-purple-600 font-semibold hover:underline">
                              {isSelected ? 'In Use' : 'Use This Bank →'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No saved question banks found.</p>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 3: OMIT & SORT (QUESTION SELECTION) */}
          {/* ───────────────────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Pool Ingestion Summary Card */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                    <Shuffle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Omit Previous Banks & Randomize Questions</h4>
                    <p className="text-xs text-slate-600">
                      Optionally exclude previously used questions, and configure the number of questions to randomly select.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-800 text-xs font-bold shadow-2xs">
                    Pool: {rawPoolQuestions.length} Questions
                  </span>
                </div>
              </div>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* OMIT QUESTIONS SECTION */}
              {/* ───────────────────────────────────────────────────────────── */}
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Ban className="w-4 h-4 text-amber-600" />
                    <span>Omit Questions from Previous Question Banks</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsOmitModalOpen(true)}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Banks to Omit ({omittedBankIds.length})</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-600">
                  Select previous question banks to automatically exclude duplicate questions from this examination's pool during randomization.
                </p>

                {/* Selected Omitted Banks Display Container */}
                <div className="p-3 bg-white border border-amber-200/60 rounded-xl min-h-[50px] flex flex-wrap items-center gap-2">
                  {omittedBanks.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">
                      No previous question banks selected to omit. Click "+ Add Banks to Omit" to select.
                    </span>
                  ) : (
                    omittedBanks.map((b) => (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100/80 text-amber-900 rounded-lg text-xs font-semibold border border-amber-300/80 shadow-2xs"
                      >
                        <Tag className="w-3 h-3 text-amber-700" />
                        <span className="max-w-[200px] truncate">{b.title}</span>
                        <span className="text-[10px] text-amber-700 font-normal">({b.questions_count} Qs)</span>
                        <button
                          type="button"
                          onClick={() => toggleOmitBank(b.id)}
                          className="hover:text-red-700 text-amber-800 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {matchingOmittedCount > 0 && (
                  <div className="text-xs text-amber-800 font-semibold flex items-center gap-1.5 bg-amber-100/70 p-2.5 rounded-xl border border-amber-200">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>
                      Detected <strong>{matchingOmittedCount} questions</strong> in your current pool that match questions in the omitted banks. They will be automatically excluded!
                    </span>
                  </div>
                )}
              </div>

              {/* Question Pool & Sort Configuration */}
              <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block">
                      Question Pool Summary
                    </span>
                    <div className="text-sm font-bold text-slate-800 flex items-center gap-2 mt-0.5">
                      <BookOpen className="w-4 h-4 text-blue-600" />
                      <span>
                        Total in Pool: <strong className="text-slate-900">{rawPoolQuestions.length}</strong>
                        {matchingOmittedCount > 0 && (
                          <span className="text-amber-700 font-semibold ml-1.5">
                            (-{matchingOmittedCount} Omitted)
                          </span>
                        )}
                        <span className="text-blue-600 font-extrabold ml-1.5">
                          = {eligiblePoolQuestions.length} Eligible
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Currently Selected for Exam:</span>
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                      {questions.length} Questions
                    </span>
                  </div>
                </div>

                {/* Sort / Number of Questions Input Field */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Sort / Select Questions for Exam (Eligible: {eligiblePoolQuestions.length}):
                  </label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="relative w-full sm:w-48">
                      <input
                        type="number"
                        min={1}
                        max={eligiblePoolQuestions.length}
                        value={sortCount || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setSortCount(isNaN(val) ? 0 : val);
                        }}
                        placeholder={String(eligiblePoolQuestions.length || 0)}
                        className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-bold text-slate-900 bg-white"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSortRandomize}
                        className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-500/20 transition flex items-center gap-1.5"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>Sort & Randomize {sortCount || eligiblePoolQuestions.length} Questions</span>
                      </button>

                      {hasSorted && (
                        <button
                          type="button"
                          onClick={handleResetToFullPool}
                          className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition"
                        >
                          Reset Full Eligible Pool
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Clicking <strong>Sort & Randomize</strong> excludes any omitted bank questions and randomly samples the requested rows. Clicking again will re-randomize.
                  </p>
                </div>
              </div>

              {/* Questions Preview Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Configured Questions Preview</span>
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                      {questions.length} Questions
                    </span>
                    {hasSorted && (
                      <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 rounded-full text-[10px] font-bold">
                        Randomized Subset
                      </span>
                    )}
                  </h4>
                  <span className="text-xs text-slate-400">Previewing first 10 rows</span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-x-auto max-h-64 shadow-xs bg-white">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 w-10 text-center">#</th>
                        <th className="px-3 py-2.5 w-14 text-center">CO</th>
                        <th className="px-3 py-2.5 w-16 text-center">Marks</th>
                        <th className="px-3 py-2.5">Question</th>
                        <th className="px-3 py-2.5">Option A</th>
                        <th className="px-3 py-2.5">Option B</th>
                        <th className="px-3 py-2.5">Option C</th>
                        <th className="px-3 py-2.5">Option D</th>
                        <th className="px-3 py-2.5 text-center w-16">Ans</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {questions.slice(0, 10).map((q, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition">
                          <td className="px-3 py-2 text-center font-bold text-slate-500">{q.question_number}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-[10px]">
                              CO {q.co || 1}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[10px]">
                              {q.marks || 1} M
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800 max-w-xs truncate" title={q.question_text}>
                            {q.question_text}
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate" title={q.option_a}>{q.option_a}</td>
                          <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate" title={q.option_b}>{q.option_b}</td>
                          <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate" title={q.option_c}>{q.option_c}</td>
                          <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate" title={q.option_d}>{q.option_d}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              {q.correct_answer}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 4: COURSE & SECTIONS */}
          {/* ───────────────────────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-6">
              {/* Sector 1: Course Selection */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Sector 1: Select Course</span>
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by course code or name..."
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  />
                </div>

                {selectedCourseCode && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-blue-900">{selectedCourseCode}</span> - {selectedCourseName}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCourseCode('');
                        setSelectedCourseName('');
                      }}
                      className="text-blue-700 hover:text-blue-900 font-semibold"
                    >
                      Change
                    </button>
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-white">
                  {filteredCourses.slice(0, 50).map((c) => {
                    const isSelected = selectedCourseCode === c.code;
                    return (
                      <div
                        key={c.code}
                        onClick={() => {
                          setSelectedCourseCode(c.code);
                          setSelectedCourseName(c.name);
                        }}
                        className={`p-2.5 rounded-lg text-xs cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div>
                          <strong className="block">{c.code}</strong>
                          <span className={isSelected ? 'text-blue-100' : 'text-slate-500'}>{c.name}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sector 2: Section Allocation */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Sector 2: Allocate Sections ({selectedSectionIds.length} Selected)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllFilteredSections}
                      className="px-2.5 py-1 text-xs text-blue-600 hover:text-blue-800 font-semibold hover:bg-blue-50 rounded-lg transition"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={deselectAllFilteredSections}
                      className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 font-semibold hover:bg-slate-100 rounded-lg transition"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Filter Department</label>
                    <select
                      value={selectedDeptId}
                      onChange={(e) => setSelectedDeptId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                    >
                      <option value="ALL">All Departments</option>
                      {(meta?.departments || []).map((d) => (
                        <option key={d.id} value={d.id}>{d.label || d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Filter Batch</label>
                    <select
                      value={selectedBatchId}
                      onChange={(e) => setSelectedBatchId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                    >
                      <option value="ALL">All Batches</option>
                      {(meta?.batches || []).map((b) => (
                        <option key={b.id} value={b.id}>{b.label || b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-white">
                  {filteredSections.map((sec) => {
                    const isChecked = selectedSectionIds.includes(sec.id);
                    return (
                      <label
                        key={sec.id}
                        className={`p-2.5 rounded-xl border cursor-pointer transition flex items-start gap-2.5 text-xs ${
                          isChecked
                            ? 'bg-blue-50/70 border-blue-500 text-blue-950 font-semibold'
                            : 'hover:bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSection(sec.id)}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="leading-tight">{sec.label || sec.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 5: MALPRACTICES & PROCTORING */}
          {/* ───────────────────────────────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-6">
              {/* Header card */}
              <div className="bg-gradient-to-r from-red-50 via-amber-50 to-orange-50 border border-red-200/80 rounded-2xl p-5 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold shadow-sm">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Malpractices & Anti-Cheating Configuration
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Configure proctoring violation tolerances, countdown timers, and automatic candidate kicking rules.
                    </p>
                  </div>
                </div>
              </div>

              {/* Configuration Inputs Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Cooldown Time Input */}
                  <div className="space-y-2 p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Warning Cooldown Time</span>
                      </label>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                        Default: 30 Seconds
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min={5}
                        max={300}
                        value={cooldownSeconds}
                        onChange={(e) => setCooldownSeconds(Math.max(5, parseInt(e.target.value, 10) || 0))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-bold text-slate-900 bg-white"
                        placeholder="30"
                      />
                      <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-medium">
                        seconds
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      When a candidate exits fullscreen or minimizes/alt-tabs away from the exam window, this warning countdown will run. If the candidate fails to click <strong>"Continue"</strong> before this timer reaches 0, they are automatically kicked from the exam.
                    </p>
                  </div>

                  {/* Number of Attempts Input */}
                  <div className="space-y-2 p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span>Number of Allowed Attempts</span>
                      </label>
                      <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                        Default: 3 Attempts
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={maxViolations}
                        onChange={(e) => setMaxViolations(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm font-bold text-slate-900 bg-white"
                        placeholder="3"
                      />
                      <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-medium">
                        violations max
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      If a candidate commits security violations reaching this count (e.g. 3 times), they are <strong>immediately kicked</strong> from the exam. In past exams, their record will appear in red as <strong>Kicked</strong>.
                    </p>
                  </div>
                </div>

                {/* Rule Preview Alert Box */}
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 space-y-2">
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Summary of Malpractice Rules Enforced</span>
                  </h4>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-5">
                    <li>
                      Strict fullscreen mode with shortcuts (Alt+Tab, F5, F11, F12, developer tools, copy, paste) blocked.
                    </li>
                    <li>
                      Candidates are permitted a maximum of <strong>{maxViolations} violation attempts</strong>.
                    </li>
                    <li>
                      Each violation gives a <strong>{cooldownSeconds}-second</strong> cooldown timer to resume. If time runs out without continuing, the candidate is considered kicked.
                    </li>
                    <li>
                      Kicked candidates are listed in the <strong>Kicked Candidates</strong> console tab where administrators can review and grant a <strong>Re-Test</strong> if needed.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 6: FACULTY INCHARGE */}
          {/* ───────────────────────────────────────────────────────────── */}
          {step === 6 && (
            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Assign Faculty Incharges ({incharges.length} Added)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-6 relative">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Search Faculty</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search by name or staff ID..."
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                      />
                    </div>

                    {staffSearch && (
                      <div className="absolute z-20 left-0 right-0 mt-1 max-h-44 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100">
                        {filteredStaff.slice(0, 15).map((s) => (
                          <div
                            key={s.id}
                            onClick={() => {
                              setSelectedStaffUser(s);
                              setStaffSearch('');
                            }}
                            className="p-2.5 text-xs hover:bg-blue-50 cursor-pointer"
                          >
                            <div className="font-semibold text-slate-900">{s.name} ({s.staff_id})</div>
                            <div className="text-[10px] text-slate-500">{s.department} • {s.designation}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Incharge Role</label>
                    <select
                      value={inchargeRole}
                      onChange={(e) => setInchargeRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                    >
                      <option value="Chief Superintendent">Chief Superintendent</option>
                      <option value="Hall Superintendent">Hall Superintendent</option>
                      <option value="Invigilator">Invigilator</option>
                      <option value="Squad Member">Squad Member</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddIncharge}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {selectedStaffUser && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      Selected: <strong>{selectedStaffUser.name}</strong> ({selectedStaffUser.staff_id}) - {selectedStaffUser.department}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedStaffUser(null)}
                      className="text-red-600 font-semibold hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Incharges List */}
                <div className="space-y-2 pt-2">
                  {incharges.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No incharge faculty assigned yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                      {incharges.map((inc, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between text-xs">
                          <div>
                            <strong className="text-slate-900">{inc.staff_name}</strong>
                            <span className="text-slate-500 ml-1.5">({inc.staff_id})</span>
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">
                              {inc.role}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveIncharge(idx)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Review Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">Examination Summary Review</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Exam Title</span>
                    <strong className="text-slate-800 truncate block">{title}</strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Course</span>
                    <strong className="text-slate-800 truncate block">{selectedCourseCode}</strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Date & Time</span>
                    <strong className="text-slate-800 block">{examDate} ({startMode === 'AUTO' ? autoStartTime : 'Manual'})</strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Questions</span>
                    <strong className="text-blue-600 block">{questions.length} Questions (Saved to QB)</strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Sections</span>
                    <strong className="text-slate-800 block">{selectedSectionIds.length} Sections</strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Incharges</span>
                    <strong className="text-slate-800 block">{incharges.length} Faculty</strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Malpractices</span>
                    <strong className="text-rose-600 block">{cooldownSeconds}s / {maxViolations} Violations max</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (step > 1) {
                setStep((s) => s - 1);
                setErrorMsg('');
                setSuccessNotice('');
              } else {
                onClose();
              }
            }}
            className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
          >
            {step === 1 ? 'Cancel' : 'Previous Step'}
          </button>

          {step < 6 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-1.5"
            >
              <span>
                {step === 1
                  ? 'Next: Questions Config'
                  : step === 2
                  ? 'Next: Omit & Sort'
                  : step === 3
                  ? 'Next: Course & Sections'
                  : step === 4
                  ? 'Next: Malpractices'
                  : 'Next: Faculty Incharge'}
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateExam}
              disabled={saving}
              className="px-7 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30 flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <span>Create Online Exam & Save Question Bank</span>
            </button>
          )}
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* MULTI-SELECT OMIT QUESTION BANKS MODAL */}
        {/* ───────────────────────────────────────────────────────────── */}
        {isOmitModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-4 flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <Ban className="w-5 h-5 text-amber-600" />
                    <span>Select Question Banks to Omit</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Questions from selected banks will be excluded from this exam.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOmitModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter question banks..."
                  value={omitModalSearch}
                  onChange={(e) => setOmitModalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                />
              </div>

              {/* Banks List */}
              <div className="overflow-y-auto flex-1 space-y-2 pr-1 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                {questionBanksList
                  .filter((b) => {
                    if (!omitModalSearch) return true;
                    const s = omitModalSearch.toLowerCase();
                    return (
                      b.title.toLowerCase().includes(s) ||
                      (b.course_code || '').toLowerCase().includes(s)
                    );
                  })
                  .map((bank) => {
                    const isOmitted = omittedBankIds.includes(bank.id);
                    return (
                      <div
                        key={bank.id}
                        onClick={() => toggleOmitBank(bank.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between text-xs ${
                          isOmitted
                            ? 'bg-amber-50 border-amber-400 text-amber-950 font-semibold shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isOmitted}
                            onChange={() => {}} // handled by div onClick
                            className="rounded text-amber-600 focus:ring-amber-500 pointer-events-none"
                          />
                          <div className="min-w-0">
                            <span className="font-bold truncate block">{bank.title}</span>
                            <span className="text-[11px] text-slate-500">
                              {bank.course_code ? `${bank.course_code} • ` : ''}{bank.questions_count} Questions
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
                          {bank.created_at}
                        </span>
                      </div>
                    );
                  })}
              </div>

              {/* Modal footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">
                  {omittedBankIds.length} Bank{omittedBankIds.length === 1 ? '' : 's'} Selected
                </span>
                <button
                  type="button"
                  onClick={() => setIsOmitModalOpen(false)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
