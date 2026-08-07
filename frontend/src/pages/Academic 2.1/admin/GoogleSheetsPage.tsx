import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FlaskConical,
  KeyRound,
  Layers,
  Lock,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Shield,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { fetchWithAuth } from '../../../services/fetchAuth';

type TabView = 'connect' | 'links' | 'configure';

type GoogleSheetConfig = {
  serviceAccountEmail: string;
  privateKey: string;
  spreadsheetFolderId: string;
  impersonatedUserEmail: string;
  sharingDomain: string;
};

const initialConfig: GoogleSheetConfig = {
  serviceAccountEmail: '',
  privateKey: '',
  spreadsheetFolderId: '',
  impersonatedUserEmail: '',
  sharingDomain: 'krct.ac.in',
};

const CONFIG_STORAGE_KEY = 'academic-v2-gs-service-account-config';

type StudentRow = {
  name: string;
  registerNo: string;
  [key: string]: string | undefined;
};

type CourseLink = {
  id: string;
  courseCode: string;
  courseName: string;
  semester: string;
  department: string;
  batch: string;
  facultyName: string;
  section: string;
  active: boolean;
  sheetUrl?: string;
  spreadsheetId?: string;
  assignments: string[];
  examAssignments?: ExamAssignmentConfig[];
  students: StudentRow[];
  classType?: string;
};

type SheetMappingConfig = {
  regNoColumn: string;
  nameColumn: string;
  questionColumns: Record<string, string>;
  sheetTab: string;
};

type MarkManagerInfo = {
  enabled: boolean;
  mode: 'admin_defined' | 'user_defined';
  questions: Array<{ id: string; title: string; max_marks: number }>;
};

type ExamAssignmentConfig = {
  id: string;
  sectionId?: string;
  courseCode: string;
  courseName: string;
  section: string;
  assignment: string;
  sheetTab: string;
  classType?: string;
  classTypeName?: string;
  qpType?: string;
  columnMapping?: {
    regNoColumn?: string;
    nameColumn?: string;
    questionColumns?: Record<string, string>;
  };
  markManager?: MarkManagerInfo | null;
};

/** Canonical key used to deduplicate exam assignments across sections in the Configure tab. */
const examAssignmentGroupKey = (ea: ExamAssignmentConfig) =>
  `${String(ea.classType || '').toUpperCase()}::${String(ea.qpType || '').toUpperCase()}::${String(ea.assignment || '').toLowerCase()}`;

type QpPatternRecord = {
  id: string;
  name: string;
  qp_type: string;
  class_type: string | null;
  pattern?: {
    titles?: string[];
    marks?: Array<number | string>;
    enabled?: boolean[];
    cos?: Array<number | null>;
  };
};

type ClassTypeDefinition = {
  id?: string;
  name?: string;
  short_code?: string;
  display_name?: string;
};

type ScriptStatus = 'idle' | 'injecting' | 'success' | 'error';

const STORAGE_KEY = 'academic-v2-google-sheets-page-v2';
const DEFAULT_CLASS_TYPES = ['THEORY', 'LAB', 'PROJECT'];
const DEFAULT_QUESTION_COLUMNS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];

const normalizeSelectionValue = (value?: string | null) => String(value || '').trim().toUpperCase();
const normalizeClassTypeValue = (value?: string | null) => normalizeSelectionValue(value).replace(/\s+/g, '_').replace(/-+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
const normalizeExamNameKey = (value?: string | null) => String(value || '').trim().toLowerCase();

const getClassTypeDefinitionKey = (definition?: ClassTypeDefinition | null) => {
  return [definition?.short_code, definition?.name, definition?.display_name, definition?.id].find((value) => Boolean(value)) || '';
};

const buildClassTypeAliasLookup = (definitions: ClassTypeDefinition[]) => {
  const lookup = new Map<string, string>();
  const addAlias = (alias?: string | null, canonical?: string | null) => {
    const normalizedAlias = normalizeClassTypeValue(alias);
    const normalizedCanonical = normalizeClassTypeValue(canonical);
    if (normalizedAlias && normalizedCanonical) lookup.set(normalizedAlias, normalizedCanonical);
  };
  definitions.forEach((definition) => {
    const canonical = getClassTypeDefinitionKey(definition);
    if (!canonical) return;
    const canonicalKey = normalizeClassTypeValue(canonical);
    [definition.id, definition.short_code, definition.name, definition.display_name, canonical].forEach((alias) => addAlias(alias, canonical));
    addAlias(canonicalKey, canonicalKey);
  });
  return lookup;
};

const resolveClassTypeValue = (value?: string | null, lookup?: Map<string, string>, fallback = 'THEORY') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  const normalizedValue = normalizeClassTypeValue(trimmed);
  if (!normalizedValue) return fallback;
  return lookup?.get(normalizedValue) || normalizedValue || fallback;
};

const groupCourseLinks = (items: CourseLink[]) => {
  const groups = new Map<string, CourseLink[]>();
  items.forEach((item) => {
    const key = `${item.courseCode || item.courseName}::${item.department || ''}`.toLowerCase();
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  });
  return Array.from(groups.entries()).map(([key, courseItems]) => ({
    key,
    courseCode: courseItems[0]?.courseCode || '',
    courseName: courseItems[0]?.courseName || '',
    items: courseItems.sort((a, b) => (a.section || '').localeCompare(b.section || '')),
  }));
};

const createInitialMapping = (examId: string, questionTitles: string[] = []): SheetMappingConfig => ({
  regNoColumn: 'A',
  nameColumn: 'B',
  questionColumns: Object.fromEntries(questionTitles.map((question, index) => [question, String.fromCharCode(67 + index)])),
  sheetTab: examId,
});

export default function GoogleSheetsPage() {
  const [view, setView] = useState<TabView>('connect');
  const [links, setLinks] = useState<CourseLink[]>([]);
  const [selectedClassType, setSelectedClassType] = useState<string>(DEFAULT_CLASS_TYPES[0]);
  const [selectedQpType, setSelectedQpType] = useState<string>('');
  const [selectedQpPatternId, setSelectedQpPatternId] = useState<string>('');
  const [selectedExamAssignment, setSelectedExamAssignment] = useState<string>('');
  const [qpPatterns, setQpPatterns] = useState<QpPatternRecord[]>([]);
  const [classTypeDefinitions, setClassTypeDefinitions] = useState<ClassTypeDefinition[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, SheetMappingConfig>>({});
  const [filters, setFilters] = useState({ semester: 'all', department: 'all', batch: 'all', search: '' });
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [sheetPickerLink, setSheetPickerLink] = useState<CourseLink | null>(null);
  const [sheetPickerUrl, setSheetPickerUrl] = useState<string>('');
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [savedState, setSavedState] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [scriptStatusMap, setScriptStatusMap] = useState<Record<string, { status: ScriptStatus; message?: string }>>({});
  // Connect tab state
  const [oauthStatus, setOauthStatus] = useState<{ authorized: boolean; userEmail: string | null; hasScriptScope: boolean }>({ authorized: false, userEmail: null, hasScriptScope: false });
  const [oauthLoading, setOauthLoading] = useState(false);
  const [serviceConfig, setServiceConfig] = useState<GoogleSheetConfig>(initialConfig);;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.mapping) setColumnMapping(parsed.mapping);
      }
      const cfgRaw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (cfgRaw) {
        const parsed = JSON.parse(cfgRaw);
        if (parsed) setServiceConfig({ ...initialConfig, ...parsed });
      }
    } catch { /* ignore */ }
  }, []);

  const fetchEndpoint = async (path: string, init?: RequestInit) => {
    let response = await fetchWithAuth(`/api/academic-v2${path}`, init);
    if (!response.ok && response.status === 404) {
      response = await fetchWithAuth(`/api/accounts/academic-v2${path}`, init);
    }
    return response;
  };

  const refreshOauthStatus = async () => {
    try {
      const resp = await fetchEndpoint('/google-sheets/oauth/status/');
      if (!resp.ok) return;
      const payload = await resp.json().catch(() => null);
      if (payload) {
        setOauthStatus({
          authorized: Boolean(payload.authorized),
          userEmail: payload.userEmail || null,
          hasScriptScope: Boolean(payload.hasScriptScope),
        });
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let cancelled = false;
    const loadLinks = async () => {
      setIsLoadingLinks(true);
      setLinksError(null);
      try {
        const response = await fetchEndpoint('/google-sheets/links/');
        if (!response.ok) throw new Error(`Unable to load course sheet links. (${response.status})`);
        const payload = await response.json().catch(() => null);
        if (!cancelled) setLinks(Array.isArray(payload) ? payload : []);
      } catch (error) {
        if (!cancelled) {
          setLinks([]);
          setLinksError(error instanceof Error ? error.message : 'Unable to load course sheet links.');
        }
      } finally {
        if (!cancelled) setIsLoadingLinks(false);
      }
    };

    const loadQpPatterns = async () => {
      try {
        const response = await fetchEndpoint('/qp-patterns/');
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        if (!cancelled) {
          if (Array.isArray(payload)) setQpPatterns(payload);
          else if (payload && Array.isArray((payload as { results?: unknown[] }).results)) setQpPatterns((payload as { results: QpPatternRecord[] }).results);
          else setQpPatterns([]);
        }
      } catch { if (!cancelled) setQpPatterns([]); }
    };

    const loadClassTypes = async () => {
      try {
        const response = await fetchEndpoint('/class-types/');
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        if (!cancelled) {
          if (Array.isArray(payload)) setClassTypeDefinitions(payload);
          else if (payload && Array.isArray((payload as { results?: unknown[] }).results)) setClassTypeDefinitions((payload as { results: ClassTypeDefinition[] }).results);
          else setClassTypeDefinitions([]);
        }
      } catch { if (!cancelled) setClassTypeDefinitions([]); }
    };

    loadLinks();
    loadQpPatterns();
    loadClassTypes();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mapping: columnMapping }));
    } catch { /* ignore */ }
  }, [columnMapping]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(serviceConfig));
    } catch { /* ignore */ }
  }, [serviceConfig]);

  // Load OAuth status and listen for the popup callback
  useEffect(() => {
    refreshOauthStatus();
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google-oauth-success') refreshOauthStatus();
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleAuthorizeGoogle = async () => {
    setOauthLoading(true);
    try {
      const response = await fetchEndpoint('/google-sheets/oauth/start/');
      if (!response.ok) {
        const p = await response.json().catch(() => null);
        throw new Error(p?.detail || 'Unable to start Google authorization.');
      }
      const p = await response.json().catch(() => null);
      if (!p?.authUrl) throw new Error('Authorization URL was not returned by the backend.');
      const popup = window.open(p.authUrl, 'google-oauth', 'width=700,height=800,left=120,top=80');
      if (!popup) throw new Error('Allow pop-ups for this page so the Google authorization window can open.');
      setSavedState({ message: 'Google authorization window opened. Complete sign-in and return.', type: 'success' });
    } catch (error) {
      setSavedState({ message: error instanceof Error ? error.message : 'Unable to start Google authorization.', type: 'error' });
    } finally {
      setOauthLoading(false);
    }
  };

  // ─── derived data ───────────────────────────────────────────────────────────


  const activeExamSelections = useMemo((): ExamAssignmentConfig[] => {
    return links.flatMap((item) => {
      if (Array.isArray(item.examAssignments) && item.examAssignments.length) {
        return item.examAssignments.map((assignment): ExamAssignmentConfig => ({
          ...assignment,
          id: assignment.id || `${item.id}::${assignment.assignment}`,
          sectionId: assignment.sectionId || item.id,
          courseCode: item.courseCode,
          courseName: item.courseName,
          section: item.section,
          sheetTab: assignment.sheetTab || assignment.assignment,
          classType: assignment.classType || item.classType || 'THEORY',
          classTypeName: (assignment as any).classTypeName || assignment.classType || item.classType || 'Theory',
          qpType: assignment.qpType,
          columnMapping: assignment.columnMapping,
          markManager: (assignment as any).markManager || null,
        }));
      }
      return item.assignments.map((assignment): ExamAssignmentConfig => ({
        id: `${item.id}::${assignment}`,
        sectionId: item.id,
        courseCode: item.courseCode,
        courseName: item.courseName,
        section: item.section,
        assignment,
        sheetTab: assignment,
        classType: item.classType || 'THEORY',
        classTypeName: item.classType || 'Theory',
        qpType: undefined,
        columnMapping: undefined,
        markManager: null,
      }));
    });
  }, [links]);

  const classTypeAliasLookup = useMemo(() => buildClassTypeAliasLookup(classTypeDefinitions), [classTypeDefinitions]);

  const classTypeOptions = useMemo(() => {
    const values = new Set<string>();
    const addClassTypeValue = (value?: string | null) => {
      const resolved = resolveClassTypeValue(value, classTypeAliasLookup);
      if (resolved) values.add(resolved);
    };
    links.forEach((item) => addClassTypeValue(item.classType));
    qpPatterns.forEach((pattern) => addClassTypeValue(pattern.class_type));
    classTypeDefinitions.forEach((definition) => addClassTypeValue(getClassTypeDefinitionKey(definition)));
    if (!values.size) DEFAULT_CLASS_TYPES.forEach((value) => values.add(value));
    return Array.from(values).sort();
  }, [classTypeAliasLookup, classTypeDefinitions, links, qpPatterns]);

  const classTypeQpPatterns = useMemo(() => {
    const normalizedSelected = resolveClassTypeValue(selectedClassType, classTypeAliasLookup);
    return qpPatterns.filter((pattern) => resolveClassTypeValue(pattern.class_type, classTypeAliasLookup) === normalizedSelected);
  }, [classTypeAliasLookup, qpPatterns, selectedClassType]);

  const qpTypeOptions = useMemo(() => {
    return Array.from(new Set(classTypeQpPatterns.map((pattern) => normalizeSelectionValue(pattern.qp_type)).filter(Boolean))).sort();
  }, [classTypeQpPatterns]);

  const selectedQpTypePatterns = useMemo(() => {
    if (!selectedQpType) return [];
    const normalizedQpType = normalizeSelectionValue(selectedQpType);
    return classTypeQpPatterns.filter((pattern) => normalizeSelectionValue(pattern.qp_type) === normalizedQpType);
  }, [classTypeQpPatterns, selectedQpType]);

  const classTypeExamSelections = useMemo(() => {
    const normalizedSelected = resolveClassTypeValue(selectedClassType, classTypeAliasLookup);
    return activeExamSelections.filter((item) => resolveClassTypeValue(item.classType || 'THEORY', classTypeAliasLookup) === normalizedSelected);
  }, [activeExamSelections, classTypeAliasLookup, selectedClassType]);

  const selectedQpPattern = useMemo(() => {
    if (!selectedQpPatternId) return null;
    return qpPatterns.find((pattern) => pattern.id === selectedQpPatternId) || null;
  }, [qpPatterns, selectedQpPatternId]);

  const selectedQpTypeExamSelections = useMemo(() => {
    if (!selectedQpType) return [];
    const normalizedQpType = normalizeSelectionValue(selectedQpType);
    return classTypeExamSelections.filter((exam) => normalizeSelectionValue(exam.qpType) === normalizedQpType);
  }, [classTypeExamSelections, selectedQpType]);

  const selectedQpPatternExamSelections = useMemo(() => {
    if (!selectedQpType) return [];
    const normalizedPatternQpType = normalizeSelectionValue(selectedQpPattern?.qp_type || selectedQpType);
    const scopedExamSelections = classTypeExamSelections.filter((exam) => normalizeSelectionValue(exam.qpType) === normalizedPatternQpType);
    return scopedExamSelections.length ? scopedExamSelections : selectedQpTypeExamSelections;
  }, [classTypeExamSelections, selectedQpPattern, selectedQpType, selectedQpTypeExamSelections]);

  useEffect(() => {
    const resolvedSelected = resolveClassTypeValue(selectedClassType, classTypeAliasLookup);
    if (!classTypeOptions.includes(resolvedSelected)) setSelectedClassType(classTypeOptions[0] || DEFAULT_CLASS_TYPES[0]);
  }, [classTypeAliasLookup, classTypeOptions, selectedClassType]);

  useEffect(() => {
    if (!qpTypeOptions.length) { setSelectedQpType(''); setSelectedQpPatternId(''); setSelectedExamAssignment(''); return; }
    const normalizedSelectedQpType = normalizeSelectionValue(selectedQpType);
    if (!selectedQpType || !qpTypeOptions.some((option) => normalizeSelectionValue(option) === normalizedSelectedQpType)) {
      setSelectedQpType(qpTypeOptions[0]); setSelectedQpPatternId(''); setSelectedExamAssignment('');
    }
  }, [qpTypeOptions, selectedQpType]);

  useEffect(() => {
    if (!selectedQpType) { setSelectedQpPatternId(''); setSelectedExamAssignment(''); return; }
    if (!selectedQpPatternId && selectedQpTypePatterns[0]) setSelectedQpPatternId(selectedQpTypePatterns[0].id);
    if (selectedQpPatternId && !selectedQpTypePatterns.some((pattern) => pattern.id === selectedQpPatternId)) setSelectedQpPatternId(selectedQpTypePatterns[0]?.id || '');
  }, [selectedQpType, selectedQpTypePatterns, selectedQpPatternId]);

  useEffect(() => {
    if (!selectedExamAssignment && selectedQpPatternExamSelections[0]) setSelectedExamAssignment(selectedQpPatternExamSelections[0].id);
    if (selectedExamAssignment && !selectedQpPatternExamSelections.some((exam) => exam.id === selectedExamAssignment)) setSelectedExamAssignment(selectedQpPatternExamSelections[0]?.id || '');
  }, [selectedQpPatternExamSelections, selectedExamAssignment]);

  const filteredLinks = useMemo(() => {
    return links.filter((item) => {
      const matchesSemester = filters.semester === 'all' || item.semester === filters.semester;
      const matchesDepartment = filters.department === 'all' || item.department === filters.department;
      const matchesBatch = filters.batch === 'all' || item.batch === filters.batch;
      const q = filters.search.toLowerCase();
      const matchesSearch = !q || item.courseName.toLowerCase().includes(q) || item.courseCode.toLowerCase().includes(q) || item.section.toLowerCase().includes(q) || item.facultyName.toLowerCase().includes(q);
      return matchesSemester && matchesDepartment && matchesBatch && matchesSearch;
    });
  }, [filters, links]);

  const groupedLinks = useMemo(() => groupCourseLinks(filteredLinks), [filteredLinks]);

  const semesterOptions = useMemo(() => Array.from(new Set(links.map((item) => item.semester))).sort(), [links]);
  const departmentOptions = useMemo(() => Array.from(new Set(links.map((item) => item.department))).sort(), [links]);
  const batchOptions = useMemo(() => Array.from(new Set(links.map((item) => item.batch))).sort(), [links]);

  const primaryExamSelection = useMemo(
    () => activeExamSelections.find((item) => item.id === selectedExamAssignment) || activeExamSelections[0] || null,
    [activeExamSelections, selectedExamAssignment]
  );

  const selectedExamConfig = useMemo(
    () => selectedQpPatternExamSelections.find((item) => item.id === selectedExamAssignment) || primaryExamSelection,
    [primaryExamSelection, selectedExamAssignment, selectedQpPatternExamSelections]
  );

  const selectedExamPattern = useMemo(() => {
    if (!selectedExamConfig) return null;
    const selectedClassTypeValue = resolveClassTypeValue(selectedClassType, classTypeAliasLookup);
    const selectedQpTypeValue = normalizeSelectionValue(selectedExamConfig.qpType || selectedQpType);
    const selectedExamNameKey = normalizeExamNameKey(selectedExamConfig.assignment);
    const exactCandidates = qpPatterns.filter((pattern) => {
      const patternClassType = resolveClassTypeValue(pattern.class_type, classTypeAliasLookup);
      if (patternClassType !== selectedClassTypeValue) return false;
      if (normalizeSelectionValue(pattern.qp_type) !== selectedQpTypeValue) return false;
      if (!selectedExamNameKey) return false;
      return normalizeExamNameKey(pattern.name) === selectedExamNameKey;
    });
    if (exactCandidates.length) return exactCandidates[0];
    return qpPatterns.find((pattern) => {
      const patternClassType = resolveClassTypeValue(pattern.class_type, classTypeAliasLookup);
      return patternClassType === selectedClassTypeValue && normalizeSelectionValue(pattern.qp_type) === selectedQpTypeValue;
    }) || null;
  }, [classTypeAliasLookup, qpPatterns, selectedClassType, selectedExamConfig, selectedQpType]);

  const derivePatternQuestionTitles = (pattern: QpPatternRecord | null | undefined): string[] => {
    const titles = pattern?.pattern?.titles;
    if (Array.isArray(titles) && titles.length) return titles.map((title, index) => (title && String(title).trim()) || `Q${index + 1}`);
    return [];
  };

  const selectedPatternQuestionTitles = useMemo(() => derivePatternQuestionTitles(selectedExamPattern), [selectedExamPattern]);
  const activeExamId = selectedExamAssignment || selectedExamConfig?.id || '';
  const backendMapping: SheetMappingConfig | null = selectedExamConfig
    ? {
        regNoColumn: selectedExamConfig.columnMapping?.regNoColumn || 'A',
        nameColumn: selectedExamConfig.columnMapping?.nameColumn || 'B',
        questionColumns: selectedExamConfig.columnMapping?.questionColumns || {},
        sheetTab: selectedExamConfig.sheetTab || selectedExamConfig.assignment || '',
      }
    : null;
  const activeMapping = columnMapping[activeExamId] || backendMapping || createInitialMapping(activeExamId, selectedPatternQuestionTitles);

  const questionFields = useMemo(() => {
    const configuredQuestions = Object.keys(activeMapping.questionColumns || {});
    if (selectedPatternQuestionTitles.length) return Array.from(new Set([...selectedPatternQuestionTitles, ...configuredQuestions]));
    if (configuredQuestions.length) return configuredQuestions;
    return DEFAULT_QUESTION_COLUMNS;
  }, [activeMapping, selectedPatternQuestionTitles]);

  // ─── handlers ────────────────────────────────────────────────────────────────

  const handleCopyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setCopiedLink(url);
    setTimeout(() => setCopiedLink(null), 1500);
  };

  const openSheetPicker = (item: CourseLink) => {
    setSheetPickerLink(item);
    setSheetPickerUrl(item.sheetUrl || '');
    setSavedState(null);
  };

  /** Save the URL, then auto-inject the Apps Script. */
  const connectSheetSelection = async () => {
    if (!sheetPickerLink) return;
    const linkUrl = sheetPickerUrl.trim();
    if (!linkUrl) {
      setSavedState({ message: 'Paste a valid Google Sheet URL.', type: 'error' });
      return;
    }
    // basic URL validation
    if (!linkUrl.includes('docs.google.com/spreadsheets')) {
      setSavedState({ message: 'URL must be a Google Sheets link (docs.google.com/spreadsheets/…).', type: 'error' });
      return;
    }

    setIsSavingLink(true);
    setSavedState(null);

    const sectionId = sheetPickerLink.id;

    try {
      // 1 – Save the sheet URL to the backend
      const saveResp = await fetchEndpoint('/google-sheets/links/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId, sheetUrl: linkUrl }),
      });
      const savePayload = await saveResp.json().catch(() => null);
      if (!saveResp.ok) throw new Error(savePayload?.detail || 'Unable to save Google Sheet link.');

      // Update local state so the card turns green immediately
      setLinks((current) =>
        current.map((item) =>
          item.id === sectionId ? { ...item, sheetUrl: savePayload?.sheetUrl || linkUrl, active: true } : item
        )
      );

      setSheetPickerLink(null);
      setSheetPickerUrl('');
      setIsSavingLink(false);

      // 2 – Auto-inject Apps Script
      setScriptStatusMap((prev) => ({ ...prev, [sectionId]: { status: 'injecting' } }));

      const injectResp = await fetchEndpoint('/google-sheets/inject-script/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId }),
      });
      const injectPayload = await injectResp.json().catch(() => null);

      if (!injectResp.ok) {
        setScriptStatusMap((prev) => ({
          ...prev,
          [sectionId]: { status: 'error', message: injectPayload?.detail || 'Apps Script injection failed.' },
        }));
        setSavedState({
          message: `Sheet linked. ⚠️ Apps Script injection failed: ${injectPayload?.detail || 'Unknown error'}. You can retry via "Re-inject Script".`,
          type: 'warning',
        });
      } else {
        setScriptStatusMap((prev) => ({
          ...prev,
          [sectionId]: { status: 'success', message: injectPayload?.message || 'Apps Script injected.' },
        }));
        setSavedState({
          message: `✅ Sheet linked & Apps Script injected for ${sheetPickerLink.courseCode} §${sheetPickerLink.section}. Open the sheet → Extensions → Apps Script → run setupTriggers() once.`,
          type: 'success',
        });
      }
    } catch (error) {
      setIsSavingLink(false);
      setSavedState({ message: error instanceof Error ? error.message : 'Unable to link Google Sheet.', type: 'error' });
    }
  };

  /** Re-inject (or inject for the first time) without re-entering the URL. */
  const reInjectScript = async (item: CourseLink) => {
    const sectionId = item.id;
    setScriptStatusMap((prev) => ({ ...prev, [sectionId]: { status: 'injecting' } }));
    setSavedState(null);
    try {
      const resp = await fetchEndpoint('/google-sheets/inject-script/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId }),
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.detail || 'Injection failed.');
      setScriptStatusMap((prev) => ({
        ...prev,
        [sectionId]: { status: 'success', message: payload?.message || 'Apps Script injected.' },
      }));
      setSavedState({ message: `Apps Script re-injected for ${item.courseCode} §${item.section}.`, type: 'success' });
    } catch (error) {
      setScriptStatusMap((prev) => ({
        ...prev,
        [sectionId]: { status: 'error', message: error instanceof Error ? error.message : 'Injection failed.' },
      }));
      setSavedState({ message: error instanceof Error ? error.message : 'Apps Script injection failed.', type: 'error' });
    }
  };

  const updateMappingField = (examId: string, field: keyof SheetMappingConfig, value: string) => {
    setColumnMapping((current) => {
      const existing = current[examId] || createInitialMapping(examId, selectedPatternQuestionTitles);
      return { ...current, [examId]: { ...existing, [field]: value } };
    });
  };

  const updateQuestionColumn = (examId: string, question: string, value: string) => {
    setColumnMapping((current) => {
      const existing = current[examId] || createInitialMapping(examId, selectedPatternQuestionTitles);
      return { ...current, [examId]: { ...existing, questionColumns: { ...existing.questionColumns, [question]: value } } };
    });
  };

  const saveColumnMapping = () => {
    const activeExam = selectedExamConfig;
    if (!activeExam?.sectionId) { setSavedState({ message: 'Select a valid exam assignment before saving mapping.', type: 'error' }); return; }
    const sectionLink = links.find((item) => item.id === activeExam.sectionId);
    if (!sectionLink?.sheetUrl) { setSavedState({ message: 'Paste and save the section Google Sheet link in Links tab first.', type: 'error' }); return; }

    fetchEndpoint('/google-sheets/links/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectionId: activeExam.sectionId,
        sheetUrl: sectionLink.sheetUrl,
        examAssignmentId: activeExam.id,
        sheetTab: activeMapping.sheetTab || activeExam.assignment,
        mapping: {
          regNoColumn: activeMapping.regNoColumn,
          nameColumn: activeMapping.nameColumn,
          questionColumns: activeMapping.questionColumns,
        },
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.detail || 'Unable to save mapping.');
        setSavedState({ message: 'Mapping saved. Live pull will use this tab and column config.', type: 'success' });
      })
      .catch((error) => {
        setSavedState({ message: error instanceof Error ? error.message : 'Unable to save mapping.', type: 'error' });
      });
  };

  const pullLiveDataForSelectedExam = async () => {
    const activeExam = selectedExamConfig;
    if (!activeExam?.id) { setSavedState({ message: 'Select an exam assignment first.', type: 'error' }); return; }
    try {
      const response = await fetchEndpoint('/google-sheets/pull-live/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examAssignmentId: activeExam.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail || 'Unable to pull live data.');
      setSavedState({ message: `Live pull done. Synced ${Number(payload?.updatedRows ?? 0)} student rows.`, type: 'success' });
    } catch (error) {
      setSavedState({ message: error instanceof Error ? error.message : 'Unable to pull live data.', type: 'error' });
    }
  };

  // ─── render helpers ──────────────────────────────────────────────────────────

  const renderScriptBadge = (item: CourseLink) => {
    const s = scriptStatusMap[item.id];
    if (!s) return null;
    if (s.status === 'injecting') return (
      <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
        <RefreshCw className="h-3 w-3 animate-spin" /> Injecting…
      </span>
    );
    if (s.status === 'success') return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700" title={s.message}>
        <CheckCircle2 className="h-3 w-3" /> Script Active
      </span>
    );
    if (s.status === 'error') return (
      <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700" title={s.message}>
        <X className="h-3 w-3" /> Script Failed
      </span>
    );
    return null;
  };

  const renderCourseCard = (item: CourseLink) => {
    const isLinked = Boolean(item.sheetUrl);
    const scriptS = scriptStatusMap[item.id];
    const isInjecting = scriptS?.status === 'injecting';

    return (
      <div key={item.id} className={`rounded-2xl border p-4 transition-all ${isLinked ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">{item.courseName}</h3>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isLinked ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {isLinked ? 'Linked' : 'Not Linked'}
              </span>
              {renderScriptBadge(item)}
            </div>
            <p className="mt-1 text-xs text-slate-500">{item.courseCode} • {item.department} • Sem {item.semester} • {item.batch}</p>
            <p className="mt-0.5 text-xs text-slate-500">Faculty: {item.facultyName} | Section: {item.section || 'Default'}</p>
            {isLinked && item.sheetUrl && (
              <p className="mt-1 truncate text-[11px] text-emerald-600">{item.sheetUrl}</p>
            )}
          </div>
        </div>

        {/* Exam assignments pills */}
        {item.assignments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.assignments.map((a) => (
              <span key={a} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">{a}</span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openSheetPicker(item)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {isLinked ? 'Update URL' : 'Link Google Sheet'}
          </button>

          {isLinked && (
            <>
              <button
                type="button"
                onClick={() => handleCopyLink(item.sheetUrl || '')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedLink === item.sheetUrl ? 'Copied!' : 'Copy URL'}
              </button>
              <button
                type="button"
                onClick={() => reInjectScript(item)}
                disabled={isInjecting}
                className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 active:scale-95 transition-all"
              >
                {isInjecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Code2 className="h-3.5 w-3.5" />}
                {isInjecting ? 'Injecting…' : 'Re-inject Script'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // ─── sheet picker modal ───────────────────────────────────────────────────────

  const renderSheetPickerModal = () => {
    if (!sheetPickerLink) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Link Google Sheet to {sheetPickerLink.courseCode}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Section: <span className="font-medium text-slate-700">{sheetPickerLink.section || 'Default'}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setSheetPickerLink(null); setSheetPickerUrl(''); setSavedState(null); }}
              className="shrink-0 rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {/* How it works */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-semibold">How it works</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-blue-700">
                <li>Paste the URL of the already-created Google Sheet for this section.</li>
                <li>We'll automatically inject a Google Apps Script into that sheet.</li>
                <li>Open the sheet → <strong>Extensions → Apps Script</strong> → run <code className="font-mono">setupTriggers()</code> once.</li>
                <li>After that, every edit in the sheet pushes marks to the ERP in real time.</li>
              </ol>
            </div>

            <label className="block space-y-2 text-sm text-slate-700">
              <span className="font-medium">Google Sheet URL</span>
              <input
                type="url"
                value={sheetPickerUrl}
                onChange={(e) => setSheetPickerUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <p className="text-xs text-slate-400">
              The Apps Script will read each exam assignment's tab, match students by register number (column A), and push marks to the ERP automatically.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={connectSheetSelection}
              disabled={isSavingLink}
              className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 active:scale-95 transition-all"
            >
              {isSavingLink ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {isSavingLink ? 'Saving & Injecting…' : 'Link & Inject Script'}
            </button>
            <button
              type="button"
              onClick={() => { setSheetPickerLink(null); setSheetPickerUrl(''); setSavedState(null); }}
              className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── connect tab ──────────────────────────────────────────────────────────────

  const renderConnectTab = () => {
    const isAuthorized = oauthStatus.authorized;
    const hasScope = oauthStatus.hasScriptScope;
    const needsReauth = isAuthorized && !hasScope;

    return (
      <div className="space-y-6">
        {/* OAuth Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Google Account Authorization</h2>
              <p className="text-xs text-slate-500 mt-0.5">Required for Apps Script injection. Uses your personal Google account.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {/* Status Banner */}
            {isAuthorized && hasScope && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <div className="text-sm">
                  <span className="font-semibold text-emerald-800">Authorized</span>
                  {oauthStatus.userEmail && <span className="ml-2 text-emerald-600">{oauthStatus.userEmail}</span>}
                  <span className="ml-2 rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800">script.projects ✓</span>
                </div>
              </div>
            )}
            {needsReauth && (
              <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <div className="text-sm">
                  <span className="font-semibold text-amber-800">Authorized but missing Apps Script scope.</span>
                  <span className="ml-2 text-amber-700">Click Re-authorize below to grant the updated permissions.</span>
                </div>
              </div>
            )}
            {!isAuthorized && (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <KeyRound className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-sm text-slate-600">Not authorized. Click below to sign in with Google.</span>
              </div>
            )}

            {/* Scope explanation */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
              <p className="font-semibold text-blue-800 mb-1">Why this is needed</p>
              <p>The Apps Script API requires a real Google user OAuth token — service account keys are rejected with 401. Authorizing here grants access to:</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li><code className="font-mono">drive</code> — create/read spreadsheets</li>
                <li><code className="font-mono">spreadsheets</code> — read/write sheet data</li>
                <li><code className="font-mono">script.projects</code> — inject the Apps Script code</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleAuthorizeGoogle}
              disabled={oauthLoading}
              className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 active:scale-95 transition-all"
            >
              {oauthLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              {oauthLoading ? 'Authorizing…' : needsReauth ? 'Re-authorize Google' : isAuthorized ? 'Re-authorize Google' : 'Authorize Google'}
            </button>
          </div>
        </div>

        {/* Service Account Card (for Sheets read/write, not Apps Script) */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Service Account Config</h2>
              <p className="text-xs text-slate-500 mt-0.5">Used for reading Sheet data and pulling marks. Not used for Apps Script injection.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Service account email</span>
              <input
                value={serviceConfig.serviceAccountEmail}
                onChange={(e) => setServiceConfig({ ...serviceConfig, serviceAccountEmail: e.target.value })}
                placeholder="google-sheets@project.iam.gserviceaccount.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Google Drive folder ID</span>
              <input
                value={serviceConfig.spreadsheetFolderId}
                onChange={(e) => setServiceConfig({ ...serviceConfig, spreadsheetFolderId: e.target.value })}
                placeholder="1ABC123XYZ"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Impersonated user email (optional)</span>
              <input
                value={serviceConfig.impersonatedUserEmail}
                onChange={(e) => setServiceConfig({ ...serviceConfig, impersonatedUserEmail: e.target.value })}
                placeholder="admin@krct.ac.in"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1.5 text-sm text-slate-700">
              <span>Sharing domain</span>
              <input
                value={serviceConfig.sharingDomain}
                onChange={(e) => setServiceConfig({ ...serviceConfig, sharingDomain: e.target.value })}
                placeholder="krct.ac.in"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              />
            </label>
            <label className="space-y-1.5 text-sm text-slate-700 md:col-span-2">
              <span>Private key (PEM format)</span>
              <textarea
                value={serviceConfig.privateKey}
                onChange={(e) => setServiceConfig({ ...serviceConfig, privateKey: e.target.value })}
                placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-400 focus:outline-none"
              />
            </label>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Config is saved locally in your browser. It's used when pulling mark data from the sheet into the ERP.</p>
        </div>
      </div>
    );
  };

  // ─── configure tab ────────────────────────────────────────────────────────────

  /**
   * Unique class type options derived from exam assignments.
   * Each entry: { classType: 'THEORY', classTypeName: 'Theory' }
   * Uses classTypeName (display title) for the button label.
   */
  const configClassTypeOptions = useMemo(() => {
    const seen = new Map<string, string>(); // classType (code) → classTypeName (title)
    for (const ea of activeExamSelections) {
      const code = String(ea.classType || 'THEORY').toUpperCase();
      if (!seen.has(code)) {
        // Prefer the display name from the backend; fall back to classTypeDefinitions lookup
        const backendTitle = (ea as any).classTypeName as string | undefined;
        const defTitle = classTypeDefinitions.find(
          (d) => normalizeClassTypeValue(d.short_code || d.name) === normalizeClassTypeValue(code)
        );
        const title = backendTitle || defTitle?.name || defTitle?.display_name || code;
        seen.set(code, title);
      }
    }
    // Also include class types from definitions even if no exam yet
    for (const d of classTypeDefinitions) {
      const code = normalizeClassTypeValue(d.short_code || d.name || '');
      if (code && !seen.has(code)) seen.set(code, d.name || d.display_name || code);
    }
    return Array.from(seen.entries()).map(([code, title]) => ({ code, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [activeExamSelections, classTypeDefinitions]);

  /**
   * Selected class type code (kept in selectedClassType state).
   * Default to first available.
   */
  const configSelectedClassCode = selectedClassType || configClassTypeOptions[0]?.code || '';

  /** QP types for the selected class type */
  const configQpTypeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const ea of activeExamSelections) {
      if (String(ea.classType || 'THEORY').toUpperCase() === configSelectedClassCode && ea.qpType) {
        types.add(String(ea.qpType).toUpperCase());
      }
    }
    return Array.from(types).sort();
  }, [activeExamSelections, configSelectedClassCode]);

  const configSelectedQpType = selectedQpType || configQpTypeOptions[0] || '';

  /**
   * Deduplicated exam assignments for the selected class type + qp type.
   * Each entry represents a unique (classType, qpType, assignment) combination —
   * NOT per section. The first matching section's exam assignment is used as the
   * reference for column mapping (they are configured identically for all sections).
   */
  const configExamOptions = useMemo(() => {
    const seen = new Map<string, ExamAssignmentConfig>(); // groupKey → representative EA
    for (const ea of activeExamSelections) {
      if (String(ea.classType || 'THEORY').toUpperCase() !== configSelectedClassCode) continue;
      if (configSelectedQpType && String(ea.qpType || '').toUpperCase() !== configSelectedQpType) continue;
      const key = examAssignmentGroupKey(ea);
      if (!seen.has(key)) seen.set(key, ea);
    }
    return Array.from(seen.values()).sort((a, b) => a.assignment.localeCompare(b.assignment));
  }, [activeExamSelections, configSelectedClassCode, configSelectedQpType]);

  /** All section-level exam assignment IDs that belong to the selected config exam option */
  const configSelectedExamGroup = useMemo(() => {
    if (!selectedExamAssignment) return [];
    const rep = configExamOptions.find((e) => e.id === selectedExamAssignment);
    if (!rep) return [];
    const key = examAssignmentGroupKey(rep);
    return activeExamSelections.filter((ea) => examAssignmentGroupKey(ea) === key);
  }, [activeExamSelections, configExamOptions, selectedExamAssignment]);

  const configActiveExam = configExamOptions.find((e) => e.id === selectedExamAssignment) || configExamOptions[0] || null;

  // Mapping for the active config exam (uses selectedExamAssignment as key)
  const configActiveMapping = useMemo((): SheetMappingConfig => {
    const id = configActiveExam?.id || '';
    if (columnMapping[id]) return columnMapping[id];
    return {
      regNoColumn: configActiveExam?.columnMapping?.regNoColumn || 'A',
      nameColumn: configActiveExam?.columnMapping?.nameColumn || 'B',
      questionColumns: configActiveExam?.columnMapping?.questionColumns || {},
      sheetTab: configActiveExam?.sheetTab || configActiveExam?.assignment || '',
    };
  }, [columnMapping, configActiveExam]);

  /** Question columns to show: from mark_manager questions (admin_defined) or pattern titles */
  const configQuestionFields = useMemo(() => {
    const mm = configActiveExam?.markManager;
    if (mm?.enabled && mm.mode === 'admin_defined' && mm.questions.length) {
      return mm.questions.map((q) => q.title);
    }
    // Fallback to selectedPatternQuestionTitles or DEFAULT
    if (selectedPatternQuestionTitles.length) return selectedPatternQuestionTitles;
    const fromMapping = Object.keys(configActiveMapping.questionColumns || {});
    if (fromMapping.length) return fromMapping;
    return DEFAULT_QUESTION_COLUMNS;
  }, [configActiveExam, configActiveMapping, selectedPatternQuestionTitles]);

  const saveConfigMapping = () => {
    if (!configActiveExam?.sectionId) {
      setSavedState({ message: 'Select a valid exam assignment before saving mapping.', type: 'error' });
      return;
    }
    // Save mapping for every section that shares this exam assignment group
    const groupExams = configSelectedExamGroup.length ? configSelectedExamGroup : [configActiveExam];
    Promise.all(
      groupExams.map((ea) => {
        const sl = links.find((l) => l.id === ea.sectionId);
        return fetchEndpoint('/google-sheets/links/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId: ea.sectionId,
            sheetUrl: sl?.sheetUrl || '',
            examAssignmentId: ea.id,
            sheetTab: configActiveMapping.sheetTab || ea.assignment,
            mapping: {
              regNoColumn: configActiveMapping.regNoColumn,
              nameColumn: configActiveMapping.nameColumn,
              questionColumns: configActiveMapping.questionColumns,
            },
          }),
        }).catch(() => null);
      })
    ).then(() => {
      setSavedState({ message: `Mapping saved for all ${groupExams.length} section(s) sharing this exam type.`, type: 'success' });
    }).catch(() => {
      setSavedState({ message: 'Unable to save mapping for some sections.', type: 'error' });
    });
  };

  const pullConfigLiveData = async () => {
    if (!configActiveExam?.id) { setSavedState({ message: 'Select an exam assignment first.', type: 'error' }); return; }
    try {
      const response = await fetchEndpoint('/google-sheets/pull-live/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examAssignmentId: configActiveExam.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail || 'Unable to pull live data.');
      setSavedState({ message: `Live pull done. Synced ${Number(payload?.updatedRows ?? 0)} student rows.`, type: 'success' });
    } catch (error) {
      setSavedState({ message: error instanceof Error ? error.message : 'Unable to pull live data.', type: 'error' });
    }
  };

  const renderConfigureTab = () => {
    const mm = configActiveExam?.markManager;
    const isUserDefined = mm?.enabled && mm.mode === 'user_defined';
    const isAdminDefined = mm?.enabled && mm.mode === 'admin_defined';
    const hasMarkManager = Boolean(mm?.enabled);

    const selectedClassEntry = configClassTypeOptions.find((c) => c.code === configSelectedClassCode);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Settings2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Column Mapping Configuration</h2>
              <p className="text-xs text-slate-500 mt-0.5">Map sheet columns to question marks. Applied globally for all sections sharing the same exam type.</p>
            </div>
          </div>
        </div>

        {/* Step 1 — Class Type */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">1</span>
            <p className="text-sm font-semibold text-slate-800">Select Class Type</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {configClassTypeOptions.map(({ code, title }) => (
              <button
                key={code}
                type="button"
                onClick={() => { setSelectedClassType(code); setSelectedQpType(''); setSelectedExamAssignment(''); }}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                  configSelectedClassCode === code
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                {code === 'LAB' ? <FlaskConical className="h-3.5 w-3.5" /> : code === 'THEORY' ? <Layers className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {title}
              </button>
            ))}
            {configClassTypeOptions.length === 0 && (
              <p className="text-sm text-slate-400">No class types found. Link sections first.</p>
            )}
          </div>
        </div>

        {/* Step 2 — QP Type */}
        {configClassTypeOptions.length > 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">2</span>
              <p className="text-sm font-semibold text-slate-800">Select QP Type</p>
              {selectedClassEntry && <span className="text-xs text-slate-400">for {selectedClassEntry.title}</span>}
            </div>
            {configQpTypeOptions.length ? (
              <div className="flex flex-wrap gap-2">
                {configQpTypeOptions.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => { setSelectedQpType(qp); setSelectedExamAssignment(''); }}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                      configSelectedQpType === qp
                        ? 'border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50'
                    }`}
                  >
                    {qp}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No QP types found for <span className="font-medium text-slate-600">{selectedClassEntry?.title}</span>. Ensure sections are linked.</p>
            )}
          </div>
        )}

        {/* Step 3 — Exam Assignment (deduplicated, not per section) */}
        {configQpTypeOptions.length > 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">3</span>
              <p className="text-sm font-semibold text-slate-800">Select Exam Assignment</p>
              <span className="text-xs text-slate-400">— {selectedClassEntry?.title} / {configSelectedQpType}</span>
            </div>
            {configExamOptions.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {configExamOptions.map((exam) => {
                  const isSelected = selectedExamAssignment === exam.id;
                  const emm = exam.markManager;
                  const hasEM = Boolean(emm?.enabled);
                  const isUD = hasEM && emm?.mode === 'user_defined';
                  const isAD = hasEM && emm?.mode === 'admin_defined';
                  return (
                    <button
                      key={exam.id}
                      type="button"
                      onClick={() => setSelectedExamAssignment(exam.id)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300'
                          : 'border-slate-200 bg-slate-50 hover:border-indigo-200 hover:bg-indigo-50/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{exam.assignment}</p>
                        {hasEM && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isUD ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {isUD ? 'User Defined' : 'Mark Manager'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{exam.classTypeName || exam.classType} · {exam.qpType}</p>
                      {isAD && emm?.questions?.length ? (
                        <p className="mt-1 text-[10px] text-emerald-600">{emm.questions.length} questions configured</p>
                      ) : isUD ? (
                        <p className="mt-1 text-[10px] text-amber-600">Faculty defines — no sheet mapping needed</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No exam assignments found for this combination.</p>
            )}
          </div>
        )}

        {/* Step 4 — Column Mapping */}
        {configActiveExam && (
          <div className={`rounded-3xl border p-6 shadow-sm space-y-5 ${
            isUserDefined ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'
          }`}>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">4</span>
              <p className="text-sm font-semibold text-slate-800">Column Mapping</p>
              {hasMarkManager && (
                <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 ${
                  isUserDefined ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {isUserDefined ? <Lock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {isUserDefined ? 'User Defined (Mark Manager)' : 'Mark Manager — Admin Defined'}
                </span>
              )}
            </div>

            {isUserDefined ? (
              /* ── Blocked: user_defined mark manager ── */
              <div className="rounded-2xl border border-amber-300 bg-amber-100/70 p-5 flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-700">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">No Sheet Mapping Required</p>
                  <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                    This exam uses <strong>User Defined Mark Manager</strong>. Faculty members configure the question structure themselves directly in the ERP — not via a Google Sheet column mapping.
                    Sheet data will not be pulled for this exam type.
                  </p>
                </div>
              </div>
            ) : (
              /* ── Normal mapping (or admin_defined mark manager) ── */
              <>
                {isAdminDefined && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                    <p>This exam uses <strong>Admin Defined Mark Manager</strong>. The question columns below correspond to the pre-configured question structure. Map each question to its sheet column.</p>
                  </div>
                )}

                <p className="text-xs text-slate-500">
                  These settings apply to all sections sharing this exam type ({configSelectedExamGroup.length || 1} section{(configSelectedExamGroup.length || 1) !== 1 ? 's' : ''}).
                  Column letters: A, B, C …
                </p>

                {/* Base columns */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="space-y-1.5 text-sm text-slate-700">
                    <span className="font-medium">Sheet Tab Name</span>
                    <input
                      value={configActiveMapping.sheetTab}
                      onChange={(e) => updateMappingField(configActiveExam.id, 'sheetTab', e.target.value)}
                      placeholder={configActiveExam.assignment}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <p className="text-[10px] text-slate-400">Tab name inside the Google Sheet</p>
                  </label>
                  <label className="space-y-1.5 text-sm text-slate-700">
                    <span className="font-medium">Register No. Column</span>
                    <input
                      value={configActiveMapping.regNoColumn}
                      onChange={(e) => updateMappingField(configActiveExam.id, 'regNoColumn', e.target.value)}
                      placeholder="A"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm text-slate-700">
                    <span className="font-medium">Name Column</span>
                    <input
                      value={configActiveMapping.nameColumn}
                      onChange={(e) => updateMappingField(configActiveExam.id, 'nameColumn', e.target.value)}
                      placeholder="B"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <p className="text-[10px] text-slate-400">Optional</p>
                  </label>
                </div>

                {/* Question columns */}
                {configQuestionFields.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-3">Question Column Mapping</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {configQuestionFields.map((question) => (
                        <label key={question} className="space-y-1 text-sm text-slate-700">
                          <span className="text-xs font-medium text-slate-600">{question}</span>
                          <input
                            value={configActiveMapping.questionColumns[question] || ''}
                            onChange={(e) => updateQuestionColumn(configActiveExam.id, question, e.target.value)}
                            placeholder="C"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={saveConfigMapping}
                    className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-md shadow-indigo-200"
                  >
                    <Save className="h-4 w-4" /> Save Mapping
                  </button>
                  <button
                    type="button"
                    onClick={pullConfigLiveData}
                    className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    <RefreshCw className="h-4 w-4" /> Pull Live Data Now
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── main render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Google Sheets Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Paste an existing Google Sheet URL per section → script is injected automatically → live marks sync starts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['connect', 'links', 'configure'] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => setView(tab)}
              className={`relative rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors ${view === tab ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {tab === 'connect' && !oauthStatus.authorized && (
                <span className="absolute -right-1 -top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
                </span>
              )}
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {savedState && (
        <div className={`flex items-start justify-between gap-3 rounded-2xl px-4 py-3 text-sm ${savedState.type === 'success' ? 'bg-emerald-50 text-emerald-800' : savedState.type === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'}`}>
          <span>{savedState.message}</span>
          <button type="button" onClick={() => setSavedState(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* CONNECT TAB */}
      {view === 'connect' && renderConnectTab()}

      {/* LINKS TAB */}
      {view === 'links' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search courses, sections…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              />
            </div>
            {[
              { label: 'Semester', key: 'semester' as const, options: semesterOptions },
              { label: 'Department', key: 'department' as const, options: departmentOptions },
              { label: 'Batch', key: 'batch' as const, options: batchOptions },
            ].map(({ label, key, options }) => (
              <select key={key} value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none">
                <option value="all">All {label}s</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
          </div>

          {isLoadingLinks ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Loading course links…</div>
          ) : linksError ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{linksError}</div>
          ) : (
            <div className="space-y-4">
              {/* Legend */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                <span className="mr-4"><span className="font-semibold text-emerald-700">Linked</span> = sheet URL saved + Apps Script injected</span>
                <span><span className="font-semibold text-slate-600">Not Linked</span> = click "Link Google Sheet" to paste URL</span>
              </div>

              {groupedLinks.length ? groupedLinks.map((group) => (
                <div key={group.key} className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-semibold text-slate-900">{group.courseName}</h3>
                    <p className="mt-0.5 text-xs text-slate-400">{group.courseCode} · {group.items.length} section{group.items.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="space-y-3">
                    {group.items.map((item) => renderCourseCard(item))}
                  </div>
                </div>
              )) : (
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  No sections found for the selected filters.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONFIGURE TAB */}
      {view === 'configure' && renderConfigureTab()}

      {/* MODAL */}
      {renderSheetPickerModal()}
    </div>
  );
}
