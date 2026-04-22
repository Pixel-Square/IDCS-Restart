import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchIqacBatchQpPattern,
  fetchAcademicYears,
  fetchIqacCustomExamBatchesByYear,
  fetchIqacQpPattern,
  upsertIqacBatchQpPattern,
  upsertIqacQpPattern,
  fetchSpecialExamConfig,
  addSpecialExam,
  removeSpecialExam,
  type AcademicYearItem,
  type CustomExamBatch,
} from '../../services/obe';
import { fetchAssessmentMasterConfig, saveAssessmentMasterConfig } from '../../services/cdapDb';
import { fetchQpTypes, type QuestionPaperTypeItem } from '../../services/curriculum';

type ClassType = 'THEORY' | 'TCPR' | 'TCPL' | 'LAB' | 'SPECIAL' | 'ENGLISH';

export default function AcademicControllerQPPage(): JSX.Element {
  const [tab, setTab] = useState<'qp' | 'custom'>('qp');
  const [qpTypes, setQpTypes] = useState<QuestionPaperTypeItem[]>([]);
  const [qpTypesLoading, setQpTypesLoading] = useState(false);

  // Class type and QP type selection
  const [selectedClassType, setSelectedClassType] = useState<ClassType>('THEORY');
  const [selectedQpType, setSelectedQpType] = useState<string | null>(null);

  // Fetch QP types from database on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setQpTypesLoading(true);
      try {
        const types = await fetchQpTypes();
        if (cancelled) return;
        const activeTypes = types.filter((t) => t.is_active !== false);
        setQpTypes(activeTypes);
        // Set default QP type for Theory
        if (activeTypes.length > 0) {
          setSelectedQpType(activeTypes[0].code);
        }
      } catch (e) {
        console.error('Failed to load QP types:', e);
        if (!cancelled) setQpTypes([]);
      } finally {
        if (!cancelled) setQpTypesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-select appropriate QP type when class type changes
  useEffect(() => {
    if (qpTypes.length === 0) return;
    if (selectedClassType === 'SPECIAL') {
      // For SPECIAL, auto-select CSD
      const csd = qpTypes.find((qp) => qp.code === 'CSD');
      setSelectedQpType(csd ? csd.code : null);
    } else if (selectedClassType === 'ENGLISH') {
      // For ENGLISH, auto-select ELECTIVE1 if available
      const e1 = qpTypes.find((qp) => qp.code === 'ELECTIVE1');
      setSelectedQpType(e1 ? e1.code : 'ELECTIVE1');
    } else if (selectedClassType === 'THEORY') {
      // For THEORY, select first non-CSD type
      const nonCsd = qpTypes.filter((qp) => qp.code !== 'CSD');
      if (nonCsd.length > 0 && (!selectedQpType || selectedQpType === 'CSD')) {
        setSelectedQpType(nonCsd[0].code);
      }
    } else {
      setSelectedQpType(null);
    }
  }, [selectedClassType, qpTypes]);

  const classTypeOptions: Array<{ key: ClassType; label: string }> = useMemo(
    () => [
      { key: 'THEORY', label: 'Theory' },
      { key: 'TCPR', label: 'TCPR' },
      { key: 'TCPL', label: 'TCPL' },
      { key: 'LAB', label: 'LAB' },
      { key: 'SPECIAL', label: 'Special' },
      { key: 'ENGLISH', label: 'English' },
    ],
    []
  );

  const [selectedExam, setSelectedExam] = useState<'SSA1' | 'SSA2' | 'FORMATIVE1' | 'FORMATIVE2' | 'CIA1' | 'CIA2' | 'MODEL'>('SSA1');

  // ── SPECIAL: dynamic exam config ──
  const [specialExams, setSpecialExams] = useState<string[]>([]);
  const [specialExamsLoading, setSpecialExamsLoading] = useState(false);
  const [specialExamMsg, setSpecialExamMsg] = useState<string | null>(null);

  const isSpecialClassType = selectedClassType === 'SPECIAL';

  // Cycle definitions for the Add buttons
  const examGroups = useMemo(() => [
    { group: 'SSA', label: 'SSA', cycle: ['SSA1', 'SSA2'] },
    { group: 'CIA', label: 'CIA', cycle: ['CIA1', 'CIA2'] },
    { group: 'FA', label: 'FA', cycle: ['FORMATIVE1', 'FORMATIVE2'] },
    { group: 'MODEL', label: 'MODEL', cycle: ['MODEL'] },
  ], []);

  // Which groups still have capacity to add
  const canAddGroup = useMemo(() => {
    const set = new Set(specialExams);
    const result: Record<string, boolean> = {};
    for (const g of examGroups) {
      result[g.group] = g.cycle.some((ex) => !set.has(ex));
    }
    return result;
  }, [specialExams, examGroups]);

  // Which groups have any exams to remove
  const canRemoveGroup = useMemo(() => {
    const set = new Set(specialExams);
    const result: Record<string, boolean> = {};
    for (const g of examGroups) {
      result[g.group] = g.cycle.some((ex) => set.has(ex));
    }
    return result;
  }, [specialExams, examGroups]);

  // Load special exam config when SPECIAL is selected
  useEffect(() => {
    if (!isSpecialClassType) {
      setSpecialExams([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSpecialExamsLoading(true);
      try {
        const exams = await fetchSpecialExamConfig(selectedQpType || undefined);
        if (!cancelled) setSpecialExams(exams);
      } catch (e) {
        console.error('Failed to load special exam config:', e);
        if (!cancelled) setSpecialExams([]);
      } finally {
        if (!cancelled) setSpecialExamsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isSpecialClassType, selectedQpType]);

  // When specialExams loads and selectedExam is not in the list, auto-select the first one
  useEffect(() => {
    if (!isSpecialClassType || specialExams.length === 0) return;
    if (!specialExams.includes(selectedExam)) {
      setSelectedExam(specialExams[0] as typeof selectedExam);
    }
  }, [isSpecialClassType, specialExams, selectedExam]);

  const handleAddExam = useCallback(async (group: string) => {
    setSpecialExamMsg(null);
    try {
      const result = await addSpecialExam(group, selectedQpType || undefined);
      setSpecialExams(result.exams);
      if (result.added) {
        setSelectedExam(result.added as typeof selectedExam);
        setSpecialExamMsg(`Added ${result.added}`);
      }
    } catch (e: any) {
      setSpecialExamMsg(e?.message || 'Failed to add exam');
    }
  }, [selectedQpType]);

  const handleRemoveExam = useCallback(async (group: string) => {
    setSpecialExamMsg(null);
    try {
      const result = await removeSpecialExam(group, selectedQpType || undefined);
      setSpecialExams(result.exams);
      if (result.removed) {
        setSpecialExamMsg(`Removed ${result.removed}`);
        // If we removed the currently selected exam, switch to first available
        if (result.removed === selectedExam && result.exams.length > 0) {
          setSelectedExam(result.exams[0] as typeof selectedExam);
        }
      }
    } catch (e: any) {
      setSpecialExamMsg(e?.message || 'Failed to remove exam');
    }
  }, [selectedQpType, selectedExam]);

  // Exam label helper
  const examLabel = (k: string): string => {
    switch (k) {
      case 'SSA1': return 'SSA 1';
      case 'SSA2': return 'SSA 2';
      case 'FORMATIVE1': return 'FA 1';
      case 'FORMATIVE2': return 'FA 2';
      case 'CIA1': return 'CIA 1';
      case 'CIA2': return 'CIA 2';
      case 'MODEL': return 'MODEL';
      default: return k;
    }
  };

  const isReviewCfgClass = selectedClassType === 'TCPR' || selectedClassType === 'TCPL';
  const [selectedReviewExam, setSelectedReviewExam] = useState<'review1' | 'review2'>('review1');

  type ReviewCfg = {
    cia_max?: number;
    split_enabled?: boolean;
  };

  type ReviewConfigRoot = {
    TCPR?: { review1?: ReviewCfg; review2?: ReviewCfg };
    TCPL?: { review1?: ReviewCfg; review2?: ReviewCfg };
  };

  const [reviewConfig, setReviewConfig] = useState<ReviewConfigRoot>({});
  const [reviewCfgLoading, setReviewCfgLoading] = useState(false);
  const [reviewCfgSaving, setReviewCfgSaving] = useState(false);
  const [reviewCfgMsg, setReviewCfgMsg] = useState<string | null>(null);
  const [reviewCfgErr, setReviewCfgErr] = useState<string | null>(null);

  // Question-wise pattern for CIA/MODEL
  type PatternRow = { marks: string; co: string };
  
  // CO-wise pattern for SSA/FA
  type CoWisePatternRow = { 
    description: string; 
    co1?: string; 
    co2?: string; 
    co3?: string; 
    co4?: string; 
    co5?: string; 
  };

  const [patternRows, setPatternRows] = useState<PatternRow[]>([]);
  const [coWiseRows, setCoWiseRows] = useState<CoWisePatternRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Customizable Exam (batch override)
  const [academicYears, setAcademicYears] = useState<AcademicYearItem[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [batches, setBatches] = useState<CustomExamBatch[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const selectedBatch = useMemo(() => batches.find((b) => b.id === selectedBatchId) || null, [batches, selectedBatchId]);

  const customExamKeys = useMemo(
    () => [
      { key: 'SSA1', label: 'SSA 1' },
      { key: 'SSA2', label: 'SSA 2' },
      { key: 'FORMATIVE1', label: 'FA 1' },
      { key: 'FORMATIVE2', label: 'FA 2' },
      { key: 'CIA1', label: 'CIA 1' },
      { key: 'CIA2', label: 'CIA 2' },
      { key: 'MODEL', label: 'MODEL' },
    ],
    []
  );
  const [selectedCustomExam, setSelectedCustomExam] = useState<string>('SSA1');
  const [customIsOverride, setCustomIsOverride] = useState<boolean>(false);

  // All exam types (SSA, FA, CIA, MODEL) use the same question-wise (Marks + CO) pattern format.
  // Previously SSA/FA used a CO-column grid, but that didn't allow flexible CO mapping per QP type.
  const isCoWisePattern = false;

  // Which CO columns to show/store for the current CO-wise exam + QP type
  const visibleCosForExam = useMemo((): number[] => {
    const exam = tab === 'custom' ? selectedCustomExam : selectedExam;
    if (!isCoWisePattern) return [1, 2, 3, 4, 5];
    const qpCode = (selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL')
      ? (selectedQpType || '').toUpperCase().replace(/\s+/g, '')
      : '';
    const isQp1Final = qpCode === 'QP1FINAL' || qpCode === 'QP1FINALYEAR';
    if (exam === 'SSA1' || exam === 'FORMATIVE1') return [1, 2];
    if (exam === 'SSA2' || exam === 'FORMATIVE2') return isQp1Final ? [2, 3] : [3, 4];
    return [1, 2, 3, 4, 5];
  }, [tab, selectedExam, selectedCustomExam, isCoWisePattern, selectedClassType, selectedQpType]);

  const backendKey = useMemo(() => {
    const class_type = selectedClassType;
    const question_paper_type = (selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL') ? selectedQpType : null;
    return {
      class_type,
      question_paper_type,
      exam: selectedExam,
    };
  }, [selectedClassType, selectedQpType, selectedExam]);

  const customBackendKey = useMemo(() => {
    const class_type = selectedClassType;
    const question_paper_type = (selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL') ? selectedQpType : null;
    return {
      batch_id: selectedBatchId,
      class_type,
      question_paper_type,
      exam: selectedCustomExam,
    };
  }, [selectedClassType, selectedQpType, selectedBatchId, selectedCustomExam]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (tab !== 'qp') return;
      setMessage(null);
      setError(null);
      setIsLoading(true);
      setLastSavedAt(null);
      try {
        const data = await fetchIqacQpPattern(backendKey);
        if (cancelled) return;
        const marks = Array.isArray((data as any)?.pattern?.marks) ? (data as any).pattern.marks : [];
        const cos = Array.isArray((data as any)?.pattern?.cos) ? (data as any).pattern.cos : [];

        if (isCoWisePattern) {
          // For SSA/FA: Convert from backend format to CO-wise rows
          // Uses stored cos[] array to map marks to correct CO fields
          const row: CoWisePatternRow = { description: 'Assessment Component', co1: '', co2: '', co3: '', co4: '', co5: '' };
          if (marks.length > 0 && cos.length > 0) {
            for (let i = 0; i < marks.length && i < cos.length; i++) {
              const coNum = Number(cos[i]);
              if (coNum >= 1 && coNum <= 5) {
                (row as any)[`co${coNum}`] = marks[i] != null ? String(marks[i]) : '';
              }
            }
          } else if (marks.length > 0) {
            // Legacy fallback: marks[0]=CO1, marks[1]=CO2, etc.
            for (let i = 0; i < marks.length && i < 5; i++) {
              (row as any)[`co${i + 1}`] = marks[i] != null ? String(marks[i]) : '';
            }
          }
          setCoWiseRows([row]);
          setPatternRows([]);
        } else {
          // For CIA/MODEL: Question-wise pattern
          const storedCoToUi = (stored: any): string => {
            const s = String(stored ?? '').trim();
            if (!s) return '';
            const n = Number(s);
            if (Number.isFinite(n)) {
              if (n === 12) return '1&2';
              if (n === 34) return '3&4';
              return String(Math.trunc(n));
            }
            const upper = s.toUpperCase();
            if (upper === 'BOTH') {
              return backendKey.exam === 'CIA2' ? '3&4' : '1&2';
            }
            if (upper === '1&2' || upper === '3&4' || upper === '1&2&3&4&5') return upper;
            return s;
          };

          const normalized: PatternRow[] = marks.map((m: any, idx: number) => ({
            marks: String(m),
            co: cos[idx] == null ? '' : storedCoToUi(cos[idx]),
          }));
          setPatternRows(normalized);
          setCoWiseRows([]);
        }
        setLastSavedAt(data?.updated_at ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || 'Failed to load pattern.'));
        setPatternRows([]);
        setCoWiseRows([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [backendKey, tab, isCoWisePattern]);

  useEffect(() => {
    let cancelled = false;
    if (tab !== 'custom') return;
    (async () => {
      setBatchLoading(true);
      try {
        const years = await fetchAcademicYears();
        if (cancelled) return;
        setAcademicYears(years);

        const active = years.find((y) => y.is_active) || years[0] || null;
        const ayId = selectedAcademicYearId ?? (active ? Number(active.id) : null);
        setSelectedAcademicYearId(ayId);
        if (!ayId) {
          setBatches([]);
          setSelectedBatchId(null);
          return;
        }

        const list = await fetchIqacCustomExamBatchesByYear(ayId);
        if (cancelled) return;
        setBatches(list);
        if (!selectedBatchId && list.length) setSelectedBatchId(list[0].id);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || 'Failed to load batches.'));
      } finally {
        if (!cancelled) setBatchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    if (tab !== 'custom') return;
    if (!selectedAcademicYearId) return;
    (async () => {
      setBatchLoading(true);
      setError(null);
      try {
        const list = await fetchIqacCustomExamBatchesByYear(selectedAcademicYearId);
        if (cancelled) return;
        setBatches(list);
        // Reset batch if current batch is not in list.
        if (selectedBatchId && !list.some((b) => b.id === selectedBatchId)) {
          setSelectedBatchId(list[0]?.id ?? null);
        }
        if (!selectedBatchId && list.length) setSelectedBatchId(list[0].id);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || 'Failed to load batches.'));
        setBatches([]);
      } finally {
        if (!cancelled) setBatchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAcademicYearId, tab]);

  useEffect(() => {
    let cancelled = false;
    async function loadCustom() {
      if (tab !== 'custom') return;
      if (!customBackendKey.batch_id) return;
      setMessage(null);
      setError(null);
      setIsLoading(true);
      setLastSavedAt(null);
      setCustomIsOverride(false);
      try {
        const data = await fetchIqacBatchQpPattern({
          batch_id: customBackendKey.batch_id,
          class_type: customBackendKey.class_type,
          question_paper_type: customBackendKey.question_paper_type,
          exam: customBackendKey.exam,
        });
        if (cancelled) return;
        const marks = Array.isArray((data as any)?.pattern?.marks) ? (data as any).pattern.marks : [];
        const cos = Array.isArray((data as any)?.pattern?.cos) ? (data as any).pattern.cos : [];

        if (isCoWisePattern) {
          // For SSA/FA: Convert from backend format to CO-wise rows
          const row: CoWisePatternRow = { description: 'Assessment Component', co1: '', co2: '', co3: '', co4: '', co5: '' };
          if (marks.length > 0 && cos.length > 0) {
            for (let i = 0; i < marks.length && i < cos.length; i++) {
              const coNum = Number(cos[i]);
              if (coNum >= 1 && coNum <= 5) {
                (row as any)[`co${coNum}`] = marks[i] != null ? String(marks[i]) : '';
              }
            }
          } else if (marks.length > 0) {
            for (let i = 0; i < marks.length && i < 5; i++) {
              (row as any)[`co${i + 1}`] = marks[i] != null ? String(marks[i]) : '';
            }
          }
          setCoWiseRows([row]);
          setPatternRows([]);
        } else {
          // For CIA/MODEL: Question-wise pattern
          const storedCoToUi = (stored: any): string => {
            const s = String(stored ?? '').trim();
            if (!s) return '';
            const n = Number(s);
            if (Number.isFinite(n)) {
              if (n === 12) return '1&2';
              if (n === 34) return '3&4';
              return String(Math.trunc(n));
            }
            const upper = s.toUpperCase();
            if (upper === 'BOTH') return 'both';
            if (upper === '1&2' || upper === '3&4' || upper === 'BOTH' || upper === '1&2&3&4&5') return upper;
            return s;
          };

          const normalized: PatternRow[] = marks.map((m: any, idx: number) => ({
            marks: String(m),
            co: cos[idx] == null ? '' : storedCoToUi(cos[idx]),
          }));
          setPatternRows(normalized);
          setCoWiseRows([]);
        }
        setLastSavedAt((data as any)?.updated_at ?? null);
        setCustomIsOverride(Boolean((data as any)?.is_override));
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message || e || 'Failed to load pattern.'));
        setPatternRows([]);
        setCoWiseRows([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadCustom();
    return () => {
      cancelled = true;
    };
  }, [customBackendKey, tab, isCoWisePattern]);

  useEffect(() => {
    let cancelled = false;
    if (!isReviewCfgClass) return;
    (async () => {
      setReviewCfgLoading(true);
      setReviewCfgMsg(null);
      setReviewCfgErr(null);
      try {
        const cfg = await fetchAssessmentMasterConfig();
        if (cancelled) return;
        const root = (cfg as any)?.review_config;
        if (root && typeof root === 'object') setReviewConfig(root as ReviewConfigRoot);
        else setReviewConfig({});
      } catch (e: any) {
        if (cancelled) return;
        setReviewCfgErr(String(e?.message || e || 'Failed to load review config.'));
      } finally {
        if (!cancelled) setReviewCfgLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReviewCfgClass, selectedClassType]);

  const currentReviewCfg = useMemo(() => {
    const ct = selectedClassType;
    const root = reviewConfig || {};
    const byCt: any = (ct && (root as any)[ct]) || {};
    return (byCt && byCt[selectedReviewExam]) || {};
  }, [reviewConfig, selectedClassType, selectedReviewExam]);

  const updateReviewCiaMax = (value: string) => {
    const ct = selectedClassType;
    if (!ct) return;
    const next = value === '' ? undefined : Number(value);
    setReviewConfig((prev) => {
      const out: any = { ...(prev || {}) };
      const ctBlock: any = { ...(out[ct] || {}) };
      const examBlock: any = { ...(ctBlock[selectedReviewExam] || {}) };
      examBlock.cia_max = Number.isFinite(next as any) ? Math.max(0, Math.trunc(next as any)) : undefined;
      ctBlock[selectedReviewExam] = examBlock;
      out[ct] = ctBlock;
      return out;
    });
  };

  const updateReviewSplitEnabled = (enabled: boolean) => {
    const ct = selectedClassType;
    if (!ct) return;
    setReviewConfig((prev) => {
      const out: any = { ...(prev || {}) };
      const ctBlock: any = { ...(out[ct] || {}) };
      const examBlock: any = { ...(ctBlock[selectedReviewExam] || {}) };
      examBlock.split_enabled = enabled;
      ctBlock[selectedReviewExam] = examBlock;
      out[ct] = ctBlock;
      return out;
    });
  };

  const saveReviewConfig = async () => {
    setReviewCfgMsg(null);
    setReviewCfgErr(null);
    try {
      setReviewCfgSaving(true);
      const existing = await fetchAssessmentMasterConfig();
      const merged = { ...(existing || {}), review_config: reviewConfig || {} };
      await saveAssessmentMasterConfig(merged);
      setReviewCfgMsg('Review config saved.');
    } catch (e: any) {
      setReviewCfgErr(String(e?.message || e || 'Save failed.'));
    } finally {
      setReviewCfgSaving(false);
    }
  };

  const addRow = () => {
    if (isCoWisePattern) {
      setCoWiseRows((prev) => [...prev, { description: '', co1: '', co2: '', co3: '', co4: '', co5: '' }]);
    } else {
      const examKey = tab === 'custom' ? String(selectedCustomExam || '') : String(selectedExam || '');
      const defaultCo = examKey === 'CIA2' || examKey === 'SSA2' || examKey === 'FORMATIVE2' ? '3' : '1';
      setPatternRows((prev) => [...prev, { marks: '', co: defaultCo }]);
    }
  };

  const deleteRow = (idx: number) => {
    if (isCoWisePattern) {
      setCoWiseRows((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setPatternRows((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const updateMarks = (idx: number, value: string) => {
    setPatternRows((prev) => {
      const copy = [...prev];
      const existing = copy[idx] || { marks: '', co: '' };
      copy[idx] = { ...existing, marks: value };
      return copy;
    });
  };

  const updateCo = (idx: number, value: string) => {
    setPatternRows((prev) => {
      const copy = [...prev];
      const existing = copy[idx] || { marks: '', co: '' };
      copy[idx] = { ...existing, co: value };
      return copy;
    });
  };

  // CO-wise row update functions
  const updateCoWiseDescription = (idx: number, value: string) => {
    setCoWiseRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], description: value };
      return copy;
    });
  };

  const updateCoWiseMarks = (idx: number, coField: 'co1' | 'co2' | 'co3' | 'co4' | 'co5', value: string) => {
    setCoWiseRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [coField]: value };
      return copy;
    });
  };

  const savePattern = async () => {
    setMessage(null);
    setError(null);
    try {
      let marks: number[] = [];
      let cos: (number | string)[] = [];

      if (isCoWisePattern) {
        // For SSA/FA: Only store marks for the visible/relevant COs
        if (coWiseRows.length === 0) {
          setError('Add at least one row.');
          return;
        }

        const row = coWiseRows[0];
        const extractedMarks: number[] = [];
        const extractedCos: number[] = [];
        for (const coNum of visibleCosForExam) {
          const val = Number(String((row as any)[`co${coNum}`] || '0').trim());
          if (!Number.isFinite(val) || val < 0) {
            setError(`CO${coNum} marks must be a non-negative number.`);
            return;
          }
          extractedMarks.push(val);
          extractedCos.push(coNum);
        }

        marks = extractedMarks;
        cos = extractedCos;
      } else {
        // For CIA/MODEL: Question-wise format
        const cleaned = patternRows.map((r) => ({ marks: String(r.marks ?? '').trim(), co: String((r as any)?.co ?? '').trim() }));
        if (cleaned.length && cleaned.some((r) => !r.marks || !r.co)) {
          setError('Enter marks and CO for all rows (or delete empty rows).');
          return;
        }
        
        for (const r of cleaned) {
          const n = Number(r.marks);
          if (!Number.isFinite(n) || n < 0) {
            setError('Marks must be a non-negative number.');
            return;
          }
        }

        const coToStored = (raw: string): number | string => {
          const s = String(raw || '').trim();
          if (!s) return '';
          if (s === 'both') return 'both';
          if (s === '1&2') return 12;
          if (s === '3&4') return 34;
          if (s === '1&2&3&4&5') return '1&2&3&4&5';
          const n = Number(s);
          if (!Number.isFinite(n)) return '';
          return Math.trunc(n);
        };

        marks = cleaned.map((r) => Number(r.marks));
        cos = cleaned.map((r) => coToStored(r.co));
        if (cos.some((v) => v === '')) {
          setError('CO values must be valid for all rows.');
          return;
        }
      }

      setIsSaving(true);
      if (tab === 'custom') {
        if (!customBackendKey.batch_id) {
          setError('Select a batch.');
          return;
        }
        const saved = await upsertIqacBatchQpPattern({
          batch_id: customBackendKey.batch_id,
          class_type: customBackendKey.class_type,
          question_paper_type: customBackendKey.question_paper_type,
          exam: customBackendKey.exam,
          pattern: { marks, cos },
        });
        setLastSavedAt(saved?.updated_at ?? null);
        setCustomIsOverride(Boolean(saved?.is_override));
        setMessage('Saved override.');
      } else {
        const saved = await upsertIqacQpPattern({
          class_type: backendKey.class_type,
          question_paper_type: backendKey.question_paper_type,
          exam: backendKey.exam,
          pattern: { marks, cos },
        });
        setLastSavedAt(saved?.updated_at ?? null);
        setMessage('Saved.');

        // Best-effort broadcast so already-open CIA pages can refresh patterns without a full reload.
        try {
          window.dispatchEvent(new CustomEvent('obe:qp-pattern-updated', { detail: { ...backendKey } }));
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>QP</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>Select the QP/class type option.</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {([
          { key: 'qp', label: 'QP Pattern' },
          { key: 'custom', label: 'Customizable Exam' },
        ] as const).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
              type="button"
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 800, marginRight: 8, display: 'flex', alignItems: 'center' }}>Class Type:</div>
        {classTypeOptions.map((ct) => {
          const active = ct.key === selectedClassType;
          return (
            <button
              key={ct.key}
              onClick={() => setSelectedClassType(ct.key)}
              className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
              type="button"
            >
              {ct.label}
            </button>
          );
        })}
      </div>

      {(selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL') && (() => {
        // For SPECIAL: show only CSD; for THEORY: show all except CSD
        const filteredQpTypes = selectedClassType === 'SPECIAL'
          ? qpTypes.filter((qp) => qp.code === 'CSD')
          : qpTypes.filter((qp) => qp.code !== 'CSD');
        return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 800, marginRight: 8 }}>Question Paper Type:</div>
          {qpTypesLoading ? (
            <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>Loading...</div>
          ) : filteredQpTypes.length === 0 ? (
            <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>No QP types available</div>
          ) : (
            filteredQpTypes.map((qp) => {
              const active = qp.code === selectedQpType;
              return (
                <button
                  key={qp.code}
                  onClick={() => setSelectedQpType(qp.code)}
                  className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
                  type="button"
                >
                  {qp.label}
                </button>
              );
            })
          )}
        </div>
        );
      })()}

      {tab === 'qp' ? (
        isSpecialClassType ? (
          /* ── SPECIAL: dynamic exam tabs with add/remove ── */
          <div style={{ marginBottom: 12 }}>
            {specialExamsLoading ? (
              <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>Loading exam configuration…</div>
            ) : (
              <>
                {/* Current exam tabs */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                  {specialExams.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#6b7280' }}>No exams configured yet. Use the buttons below to add assessments.</div>
                  ) : (
                    specialExams.map((k) => {
                      const active = selectedExam === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setSelectedExam(k as typeof selectedExam)}
                          className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
                          type="button"
                        >
                          {examLabel(k)}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Add / Remove exam group buttons */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, marginRight: 4 }}>Add:</span>
                  {examGroups.map((g) => (
                    <button
                      key={`add-${g.group}`}
                      type="button"
                      disabled={!canAddGroup[g.group]}
                      onClick={() => handleAddExam(g.group)}
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: canAddGroup[g.group] ? '#ecfdf5' : '#f3f4f6',
                        color: canAddGroup[g.group] ? '#065f46' : '#9ca3af',
                        cursor: canAddGroup[g.group] ? 'pointer' : 'not-allowed',
                        fontWeight: 600,
                      }}
                    >
                      + {g.label}
                    </button>
                  ))}

                  <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, marginLeft: 12, marginRight: 4 }}>Remove:</span>
                  {examGroups.map((g) => (
                    <button
                      key={`rm-${g.group}`}
                      type="button"
                      disabled={!canRemoveGroup[g.group]}
                      onClick={() => handleRemoveExam(g.group)}
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: canRemoveGroup[g.group] ? '#fef2f2' : '#f3f4f6',
                        color: canRemoveGroup[g.group] ? '#991b1b' : '#9ca3af',
                        cursor: canRemoveGroup[g.group] ? 'pointer' : 'not-allowed',
                        fontWeight: 600,
                      }}
                    >
                      − {g.label}
                    </button>
                  ))}
                </div>

                {specialExamMsg && (
                  <div style={{
                    marginTop: 8,
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: specialExamMsg.startsWith('Failed') || specialExamMsg.startsWith('All ') ? '#fef2f2' : '#ecfdf5',
                    color: specialExamMsg.startsWith('Failed') || specialExamMsg.startsWith('All ') ? '#991b1b' : '#065f46',
                    border: `1px solid ${specialExamMsg.startsWith('Failed') || specialExamMsg.startsWith('All ') ? '#ef444433' : '#10b98133'}`,
                  }}>
                    {specialExamMsg}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* ── Non-SPECIAL: static exam tabs ── */
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {(['SSA1', 'SSA2', 'FORMATIVE1', 'FORMATIVE2', 'CIA1', 'CIA2', 'MODEL'] as const).map((k) => {
              const active = selectedExam === k;
              return (
                <button
                  key={k}
                  onClick={() => setSelectedExam(k)}
                  className={active ? 'obe-btn obe-btn-primary' : 'obe-btn obe-btn-secondary'}
                  type="button"
                >
                  {examLabel(k)}
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="obe-card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Academic year</div>
              <select
                className="obe-input"
                value={selectedAcademicYearId == null ? '' : String(selectedAcademicYearId)}
                onChange={(e) => setSelectedAcademicYearId(e.target.value ? Number(e.target.value) : null)}
                style={{ minWidth: 220 }}
                disabled={batchLoading}
              >
                <option value="">Select</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={String(y.id)}>
                    {y.name}{y.parity ? ` (${y.parity})` : ''}{y.is_active ? ' • Active' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Batch</div>
              <select
                className="obe-input"
                value={selectedBatchId == null ? '' : String(selectedBatchId)}
                onChange={(e) => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
                style={{ minWidth: 260 }}
                disabled={batchLoading}
              >
                <option value="">Select batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {String((b as any)?.label ?? (b as any)?.name ?? b.id)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Exam</div>
              <select className="obe-input" value={selectedCustomExam} onChange={(e) => setSelectedCustomExam(e.target.value)} style={{ minWidth: 180 }}>
                {customExamKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {selectedBatch ? (
                <div>
                  <div style={{ fontWeight: 800, color: '#111827' }}>{String((selectedBatch as any)?.label ?? (selectedBatch as any)?.name ?? selectedBatch.id)}</div>
                  <div>
                    {customIsOverride ? 'Using batch override' : 'No override (fallback where available)'}
                  </div>
                </div>
              ) : (
                <div>{batchLoading ? 'Loading batches…' : 'Select a batch to edit overrides.'}</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="obe-card" style={{ padding: 12 }}>
        <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Selected</div>
        <div style={{ fontWeight: 900, color: '#111827' }}>
          {classTypeOptions.find((ct) => ct.key === selectedClassType)?.label || selectedClassType}
          {(selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL') && selectedQpType ? ` - ${qpTypes.find((qp) => qp.code === selectedQpType)?.label || selectedQpType}` : ''}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#374151' }}>
          Class type: <strong>{selectedClassType}</strong>
          {(selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL') && selectedQpType ? (
            <>
              {' '}• QP: <strong>{selectedQpType}</strong>
            </>
          ) : null}
          {tab === 'qp' && (
            <>
              {' '}• Exam: <strong>{examLabel(selectedExam)}</strong>
            </>
          )}
        </div>
        {isLoading ? (
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Loading saved pattern…</div>
        ) : lastSavedAt ? (
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Last saved: {new Date(lastSavedAt).toLocaleString()}</div>
        ) : null}
      </div>

      {/* CIA / MODEL pattern table — hide when SPECIAL has no exams */}
      {(!isSpecialClassType || specialExams.includes(selectedExam)) && (
      <div className="obe-card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 900, color: '#111827' }}>QP Pattern</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {tab === 'qp'
              ? `${examLabel(selectedExam)} • ${selectedClassType}${(selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL') && selectedQpType ? ` ${selectedQpType}` : ''}`
              : `${customExamKeys.find((k) => k.key === selectedCustomExam)?.label || selectedCustomExam} • ${selectedClassType}${(selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL') && selectedQpType ? ` ${selectedQpType}` : ''}${selectedBatch ? ` • ${selectedBatch.name}` : ''}`}
          </div>
        </div>

        {error ? (
          <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 10 }}>
            {error}
          </div>
        ) : null}
        {message ? (
          <div style={{ background: '#ecfdf5', border: '1px solid #10b98133', color: '#065f46', padding: 10, borderRadius: 10, marginBottom: 10 }}>
            {message}
          </div>
        ) : null}

        <div style={{ overflowX: 'auto' }}>
          {isCoWisePattern ? (
            // CO-wise pattern table for SSA/FA
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '8px 6px', borderBottom: '1px solid #e5e7eb', fontWeight: 800 }}>Component</th>
                  {visibleCosForExam.map((coNum) => (
                    <th key={coNum} style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', padding: '8px 6px', borderBottom: '1px solid #e5e7eb', fontWeight: 800 }}>CO{coNum}<br/>Marks</th>
                  ))}
                  <th style={{ width: 120, borderBottom: '1px solid #e5e7eb' }} />
                </tr>
              </thead>
              <tbody>
                {coWiseRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCosForExam.length + 2} style={{ padding: 10, color: '#6b7280', textAlign: 'center' }}>No components yet. Click + to add.</td>
                  </tr>
                ) : (
                  coWiseRows.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                        <input
                          className="obe-input"
                          type="text"
                          value={r.description}
                          onChange={(e) => updateCoWiseDescription(idx, e.target.value)}
                          placeholder="Component name"
                          style={{ minWidth: 150 }}
                        />
                      </td>
                      {visibleCosForExam.map((coNum) => {
                        const field = `co${coNum}` as 'co1' | 'co2' | 'co3' | 'co4' | 'co5';
                        return (
                          <td key={coNum} style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                            <input
                              className="obe-input"
                              type="number"
                              min={0}
                              step="0.5"
                              value={r[field] || ''}
                              onChange={(e) => updateCoWiseMarks(idx, field, e.target.value)}
                              placeholder="0"
                              style={{ maxWidth: 80, textAlign: 'center' }}
                            />
                          </td>
                        );
                      })}
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                        <button type="button" className="obe-btn obe-btn-danger" onClick={() => deleteRow(idx)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            // Question-wise pattern table for CIA/MODEL
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '8px 6px', borderBottom: '1px solid #e5e7eb', fontWeight: 800 }}>Q.No</th>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '8px 6px', borderBottom: '1px solid #e5e7eb', fontWeight: 800 }}>Marks</th>
                  <th style={{ textAlign: 'left', fontSize: 12, color: '#6b7280', padding: '8px 6px', borderBottom: '1px solid #e5e7eb', fontWeight: 800 }}>CO</th>
                  <th style={{ width: 120, borderBottom: '1px solid #e5e7eb' }} />
                </tr>
              </thead>
              <tbody>
                {patternRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 10, color: '#6b7280' }}>No questions yet. Click + to add.</td>
                  </tr>
                ) : (
                  patternRows.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6', fontWeight: 800 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                        <input
                          className="obe-input"
                          type="number"
                          min={0}
                          step="0.5"
                          value={r.marks}
                          onChange={(e) => updateMarks(idx, e.target.value)}
                          placeholder="Marks"
                          style={{ maxWidth: 160 }}
                        />
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                        <select
                          className="obe-input"
                          value={String((r as any)?.co ?? '')}
                          onChange={(e) => updateCo(idx, e.target.value)}
                          style={{ maxWidth: 160 }}
                        >
                          <option value="">Select</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="1&2">1&2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="3&4">3&4</option>
                          <option value="5">5</option>
                          {(selectedClassType === 'THEORY' || selectedClassType === 'SPECIAL') && selectedQpType === 'QP2' && (
                            <option value="1&2&3&4&5">All (1-5)</option>
                          )}
                        </select>
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #f3f4f6' }}>
                        <button type="button" className="obe-btn obe-btn-danger" onClick={() => deleteRow(idx)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" className="obe-btn obe-btn-secondary" onClick={addRow}>
            +
          </button>
          <button type="button" className="obe-btn obe-btn-primary" onClick={savePattern} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      )}

      {/* TCPR/TCPL Review configuration */}
      {isReviewCfgClass ? (
        <div className="obe-card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontWeight: 900, color: '#111827' }}>Review Config</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{selectedClassType} • {selectedReviewExam === 'review1' ? 'Review 1' : 'Review 2'}</div>
          </div>

          {reviewCfgErr ? (
            <div style={{ background: '#fef2f2', border: '1px solid #ef444433', color: '#991b1b', padding: 10, borderRadius: 10, marginBottom: 10 }}>
              {reviewCfgErr}
            </div>
          ) : null}
          {reviewCfgMsg ? (
            <div style={{ background: '#ecfdf5', border: '1px solid #10b98133', color: '#065f46', padding: 10, borderRadius: 10, marginBottom: 10 }}>
              {reviewCfgMsg}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>Exam type</div>
              <select className="obe-input" value={selectedReviewExam} onChange={(e) => setSelectedReviewExam(e.target.value as any)} style={{ minWidth: 160 }}>
                <option value="review1">Review 1</option>
                <option value="review2">Review 2</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, marginBottom: 6 }}>CIA exam max marks</div>
              <input
                className="obe-input"
                type="number"
                min={0}
                step={1}
                value={String((currentReviewCfg as any)?.cia_max ?? '')}
                onChange={(e) => updateReviewCiaMax(e.target.value)}
                placeholder="e.g. 40"
                style={{ maxWidth: 160 }}
                disabled={reviewCfgLoading}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38, paddingBottom: 2 }}>
              <input
                type="checkbox"
                checked={Boolean((currentReviewCfg as any)?.split_enabled)}
                onChange={(e) => updateReviewSplitEnabled(e.target.checked)}
                disabled={reviewCfgLoading}
              />
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800 }}>Enable mark splitup</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Show + / - split controls for faculty in this review sheet.</div>
              </div>
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="obe-btn obe-btn-secondary" onClick={() => {
                setReviewCfgMsg(null);
                setReviewCfgErr(null);
              }} disabled={reviewCfgSaving}>
                Clear message
              </button>
              <button type="button" className="obe-btn obe-btn-primary" onClick={saveReviewConfig} disabled={reviewCfgSaving || reviewCfgLoading}>
                {reviewCfgSaving ? 'Saving…' : 'Save Review Config'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}