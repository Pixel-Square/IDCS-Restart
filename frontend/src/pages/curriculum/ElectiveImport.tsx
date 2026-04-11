import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Save,
  PencilLine,
  X,
  Search,
  Upload,
  Users,
} from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';
import {
  fetchElectives,
  fetchElectiveChoices,
  updateElectiveChoice,
  type ElectiveChoiceItem,
} from '../../services/curriculum';
import { downloadExcel } from '../../utils/downloadFile';

type Department = { id: number; code: string; name: string; short_name: string };

type Elective = {
  id: number;
  course_code: string;
  course_name: string;
  regulation: string;
  semester: number;
  department: Department;
  student_count: number;
  parent?: number | null;
  parent_name?: string | null;
};

type ImportFilters = {
  regulation: string;
  semester: number | '';
  departmentId: number | '';
  parent: string;
  electiveSubjectId: number | '';
  search: string;
};

type StudentFilters = {
  regulation: string;
  semester: number | '';
  departmentId: number | '';
  parentName: string;
  electiveSubjectId: number | '';
  search: string;
};

type ChoiceDraft = {
  elective_subject_id: string;
  is_active: boolean;
};

type PageNotification = {
  type: 'success' | 'error' | 'info';
  message: string;
};

const defaultImportFilters: ImportFilters = {
  regulation: '',
  semester: '',
  departmentId: '',
  parent: '',
  electiveSubjectId: '',
  search: '',
};

const defaultStudentFilters: StudentFilters = {
  regulation: '',
  semester: '',
  departmentId: '',
  parentName: '',
  electiveSubjectId: '',
  search: '',
};

export default function ElectiveImport() {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [electives, setElectives] = useState<Elective[]>([]);
  const [choices, setChoices] = useState<ElectiveChoiceItem[]>([]);

  const [loadingElectives, setLoadingElectives] = useState(false);
  const [loadingChoices, setLoadingChoices] = useState(false);
  const [savingChoiceId, setSavingChoiceId] = useState<number | null>(null);
  const [pageNotification, setPageNotification] = useState<PageNotification | null>(null);

  const [importFilters, setImportFilters] = useState<ImportFilters>(defaultImportFilters);
  const [studentFilters, setStudentFilters] = useState<StudentFilters>(defaultStudentFilters);
  const [debouncedStudentFilters, setDebouncedStudentFilters] = useState<StudentFilters>(defaultStudentFilters);
  const [choiceDrafts, setChoiceDrafts] = useState<Record<number, ChoiceDraft>>({});
  const [activeSection, setActiveSection] = useState<'import' | 'students'>('import');
  const [choicesLoaded, setChoicesLoaded] = useState(false);
  const [studentPage, setStudentPage] = useState(1);
  const [studentTotalCount, setStudentTotalCount] = useState(0);
  const [studentTotalPages, setStudentTotalPages] = useState(1);
  const studentPageSize = 10;
  const [importPage, setImportPage] = useState(1);
  const importPageSize = 10;
  const [editingChoiceId, setEditingChoiceId] = useState<number | null>(null);
  const choicesRequestIdRef = useRef(0);

  const deferredImportSearch = useDeferredValue(importFilters.search);

  const showPageNotification = (type: PageNotification['type'], message: string) => {
    setPageNotification({ type, message });
  };

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    setImportPage(1);
  }, [importFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedStudentFilters(studentFilters);
      setStudentPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [studentFilters]);

  useEffect(() => {
    if (activeSection !== 'students') return;
    void loadChoicesData(debouncedStudentFilters, studentPage);
  }, [activeSection, debouncedStudentFilters, studentPage]);

  useEffect(() => {
    if (!pageNotification) return;
    const timer = window.setTimeout(() => {
      setPageNotification(null);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [pageNotification]);

  const loadBaseData = async () => {
    setLoadingElectives(true);
    try {
      const [electivesData, departmentsRes] = await Promise.all([
        fetchElectives(),
        fetchWithAuth('/api/curriculum/departments/'),
      ]);

      setElectives(Array.isArray(electivesData) ? electivesData : []);

      const deptJson = await departmentsRes.json();
      const deptList = Array.isArray(deptJson?.results) ? deptJson.results : Array.isArray(deptJson) ? deptJson : [];
      setDepartments(
        (deptList as Department[]).slice().sort((a, b) => (a.code || '').localeCompare(b.code || '')),
      );

    } catch (error) {
      console.error('Failed to load elective data:', error);
      setElectives([]);
    } finally {
      setLoadingElectives(false);
    }
  };

  const loadChoicesData = async (filters: StudentFilters, page: number) => {
    const requestId = ++choicesRequestIdRef.current;
    setLoadingChoices(true);
    try {
      const resp = await fetchElectiveChoices({
        include_inactive: true,
        regulation: filters.regulation || undefined,
        semester: filters.semester || undefined,
        department_id: filters.departmentId || undefined,
        parent_name: filters.parentName || undefined,
        elective_subject_id: filters.electiveSubjectId || undefined,
        search: filters.search?.trim() || undefined,
        page,
        page_size: studentPageSize,
      } as any);
      if (requestId !== choicesRequestIdRef.current) return;

      const choiceList = Array.isArray(resp.results) ? resp.results : [];
      setChoices(choiceList);
      setStudentTotalCount(Number(resp.count || 0));
      setStudentTotalPages(Math.max(1, Number(resp.total_pages || 1)));
      setEditingChoiceId(null);
      if (Number(resp.page || page) !== page) {
        setStudentPage(Number(resp.page || page));
      }

      const nextDrafts: Record<number, ChoiceDraft> = {};
      for (const choice of choiceList) {
        nextDrafts[choice.id] = {
          elective_subject_id: String(choice.elective_subject_id ?? ''),
          is_active: Boolean(choice.is_active),
        };
      }
      setChoiceDrafts(nextDrafts);
      setChoicesLoaded(true);
    } catch (error) {
      if (requestId !== choicesRequestIdRef.current) return;
      console.error('Failed to load student choices:', error);
      setChoices([]);
      setStudentTotalCount(0);
      setStudentTotalPages(1);
      setChoicesLoaded(false);
    } finally {
      if (requestId === choicesRequestIdRef.current) {
        setLoadingChoices(false);
      }
    }
  };

  const loadTemplate = async () => {
    try {
      await downloadExcel(
        '/api/curriculum/elective-choices/template/',
        'elective_choices_template.xlsx',
        fetchWithAuth,
      );
    } catch (error) {
      console.error('Download error:', error);
      showPageNotification('error', 'Failed to download template');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExtension) {
      showPageNotification('error', 'Please select a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }

    setSelectedFile(file);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showPageNotification('error', 'Please select a file first');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('csv_file', selectedFile);

      const response = await fetchWithAuth('/api/curriculum/elective-choices/import/', {
        method: 'POST',
        body: formData,
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok) {
        setResult(data);
        showPageNotification('success', 'Elective choices imported successfully');
        setSelectedFile(null);
        const fileInput = document.getElementById('elective-file-input') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
        await loadBaseData();
        if (choicesLoaded || activeSection === 'students') {
          void loadChoicesData(debouncedStudentFilters, studentPage);
        }
      } else {
        const errorMsg = data?.error || data?.detail || data?.message || 'Import failed';
        showPageNotification('error', typeof errorMsg === 'string' ? errorMsg : 'Import failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showPageNotification('error', 'Failed to upload file. Please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const uniqueRegulations = useMemo(
    () => Array.from(new Set(electives.map((elective) => elective.regulation).filter(Boolean))).sort(),
    [electives],
  );

  const uniqueSemesters = useMemo(
    () =>
      Array.from(new Set(electives.map((elective) => elective.semester).filter(Boolean))).sort((a, b) => a - b),
    [electives],
  );

  const uniqueParents = useMemo(
    () => Array.from(new Set(electives.map((elective) => elective.parent_name).filter(Boolean))).sort(),
    [electives],
  );

  const filteredElectives = useMemo(() => {
    return electives.filter((elective) => {
      if (importFilters.regulation && elective.regulation !== importFilters.regulation) return false;
      if (importFilters.semester && elective.semester !== importFilters.semester) return false;
      if (importFilters.departmentId && elective.department?.id !== importFilters.departmentId) return false;
      if (importFilters.parent && elective.parent_name !== importFilters.parent) return false;
      if (importFilters.electiveSubjectId && elective.id !== Number(importFilters.electiveSubjectId)) return false;
      if (deferredImportSearch) {
        const haystack = [
          elective.course_code,
          elective.course_name,
          elective.parent_name,
          elective.department?.code,
          elective.department?.short_name,
          elective.department?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(deferredImportSearch.toLowerCase())) return false;
      }
      return true;
    });
  }, [electives, importFilters.departmentId, importFilters.parent, importFilters.regulation, importFilters.semester, importFilters.electiveSubjectId, deferredImportSearch]);

  const studentElectiveOptions = useMemo(() => {
    return electives.filter((elective) => {
      if (studentFilters.regulation && elective.regulation !== studentFilters.regulation) return false;
      if (studentFilters.semester && elective.semester !== studentFilters.semester) return false;
      if (studentFilters.departmentId && elective.department?.id !== studentFilters.departmentId) return false;
      if (studentFilters.parentName && elective.parent_name !== studentFilters.parentName) return false;
      if (studentFilters.electiveSubjectId && elective.id !== Number(studentFilters.electiveSubjectId)) return false;
      return true;
    });
  }, [electives, studentFilters.departmentId, studentFilters.electiveSubjectId, studentFilters.parentName, studentFilters.regulation, studentFilters.semester]);

  const normalizeElectiveGroupName = (value?: string | null) => String(value || '').trim().toLowerCase();

  const isOpenElectiveGroup = (value?: string | null) => {
    const normalized = normalizeElectiveGroupName(value);
    return normalized.includes('open elective') || /^oe(\b|\s|-|$)/i.test(normalized) || normalized.endsWith(' oe');
  };

  const isEePeDepartment = (value?: string | null) => {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'EE' || normalized === 'PE';
  };

  const getEditableElectiveOptions = (choice: ElectiveChoiceItem) => {
    if (isOpenElectiveGroup(choice.parent_name)) {
      const targetGroup = normalizeElectiveGroupName(choice.parent_name);
      return electives.filter((elective) => normalizeElectiveGroupName(elective.parent_name) === targetGroup);
    }

    if (isEePeDepartment(choice.department_code)) {
      return electives.filter((elective) => isEePeDepartment(elective.department?.code));
    }

    return studentElectiveOptions;
  };

  const importElectiveSubjectOptions = useMemo(() => {
    // Show subject options only if both parent and department are selected
    if (!importFilters.parent || !importFilters.departmentId) return [];
    
    return electives.filter((elective) => {
      if (elective.parent_name !== importFilters.parent) return false;
      if (elective.department?.id !== importFilters.departmentId) return false;
      return true;
    });
  }, [electives, importFilters.parent, importFilters.departmentId]);

  const filteredChoices = choices;

  const filteredElectivesForPage = useMemo(() => {
    const start = (importPage - 1) * importPageSize;
    const end = start + importPageSize;
    return filteredElectives.slice(start, end);
  }, [filteredElectives, importPage]);

  const importTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredElectives.length / importPageSize));
  }, [filteredElectives]);

  const visibleImportPageNumbers = useMemo(() => {
    const maxPagesToShow = 5;
    let start = Math.max(1, importPage - Math.floor(maxPagesToShow / 2));
    let end = Math.min(importTotalPages, start + maxPagesToShow - 1);
    if (end - start + 1 < maxPagesToShow) {
      start = Math.max(1, end - maxPagesToShow + 1);
    }
    const nums: number[] = [];
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [importPage, importTotalPages]);

  const visiblePageNumbers = useMemo(() => {
    const maxPagesToShow = 5;
    let start = Math.max(1, studentPage - Math.floor(maxPagesToShow / 2));
    let end = Math.min(studentTotalPages, start + maxPagesToShow - 1);
    if (end - start + 1 < maxPagesToShow) {
      start = Math.max(1, end - maxPagesToShow + 1);
    }
    const nums: number[] = [];
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [studentPage, studentTotalPages]);

  const saveChoice = async (choice: ElectiveChoiceItem) => {
    const draft = choiceDrafts[choice.id];
    if (!draft) return;

    const electiveSubjectId = draft.elective_subject_id ? Number(draft.elective_subject_id) : null;
    if (!electiveSubjectId) {
      showPageNotification('error', 'Select an elective subject before saving');
      return;
    }

    setSavingChoiceId(choice.id);
    try {
      const updated = await updateElectiveChoice({
        choice_id: choice.id,
        elective_subject_id: electiveSubjectId,
        is_active: draft.is_active,
      });

      setChoices((prev) => prev.map((item) => (item.id === choice.id ? updated : item)));
      setChoiceDrafts((prev) => ({
        ...prev,
        [choice.id]: {
          elective_subject_id: String(updated.elective_subject_id ?? ''),
          is_active: Boolean(updated.is_active),
        },
      }));
      setEditingChoiceId(null);
      showPageNotification('success', 'Elective choice updated successfully');
    } catch (error) {
      console.error('Failed to update elective choice:', error);
      showPageNotification('error', error instanceof Error ? error.message : 'Failed to update elective choice');
    } finally {
      setSavingChoiceId(null);
    }
  };

  const startEditingChoice = (choice: ElectiveChoiceItem) => {
    setChoiceDrafts((prev) => ({
      ...prev,
      [choice.id]: {
        elective_subject_id: String(choice.elective_subject_id ?? ''),
        is_active: Boolean(choice.is_active),
      },
    }));
    setEditingChoiceId(choice.id);
  };

  const cancelEditingChoice = (choice: ElectiveChoiceItem) => {
    setChoiceDrafts((prev) => ({
      ...prev,
      [choice.id]: {
        elective_subject_id: String(choice.elective_subject_id ?? ''),
        is_active: Boolean(choice.is_active),
      },
    }));
    setEditingChoiceId(null);
  };

  const resetImportFilters = () => setImportFilters(defaultImportFilters);
  const resetStudentFilters = () => setStudentFilters(defaultStudentFilters);

  const importStats = {
    total: filteredElectives.length,
    students: filteredElectives.reduce((sum, elective) => sum + Number(elective.student_count || 0), 0),
  };

  const studentStats = {
    total: studentTotalCount,
    active: choices.filter((choice) => choice.is_active).length,
  };

  const showingFrom = studentTotalCount === 0 ? 0 : (studentPage - 1) * studentPageSize + 1;
  const showingTo = Math.min(studentTotalCount, studentPage * studentPageSize);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-6">
      {pageNotification && (
        <div className="fixed right-4 top-4 z-50 w-full max-w-md">
          <div
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
              pageNotification.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : pageNotification.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-slate-200 bg-white text-slate-900'
            }`}
            role="alert"
          >
            {pageNotification.type === 'success' ? (
              <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            )}
            <div className="flex-1 text-sm font-medium">{pageNotification.message}</div>
            <button
              onClick={() => setPageNotification(null)}
              className="rounded-md p-1 text-current/70 transition hover:bg-black/5 hover:text-current"
              aria-label="Close notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="w-full space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
                <FileSpreadsheet className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-1">Elective Import</h1>
                <p className="text-slate-600 text-sm">Manage elective imports and edit student elective mappings from one place.</p>
              </div>
            </div>
            <button
              onClick={loadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>
          </div>
        </div>

        <div className="border-b border-gray-200">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveSection('import')}
              className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                activeSection === 'import'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Import Elective
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('students')}
              className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                activeSection === 'students'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Student Lists
            </button>
          </div>
        </div>

        <section
          id="import-elective-section"
          className={`${activeSection === 'import' ? '' : 'hidden'}`}
        >
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-indigo-50 p-2.5 text-indigo-600">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">1. Elective Import</h2>
                <p className="text-sm text-slate-600">Upload CSV or Excel files for student elective mappings.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_1.4fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-slate-900">
                <Upload className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold">Upload File</h3>
              </div>
              <div className="mt-4 space-y-4">
                <label
                  htmlFor="elective-file-input"
                  className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  <Upload className="mb-2 h-8 w-8 text-slate-400" />
                  <div className="text-sm text-slate-700">
                    {selectedFile ? (
                      <span className="font-semibold text-indigo-700">{selectedFile.name}</span>
                    ) : (
                      <>
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">CSV or Excel files (.csv, .xlsx, .xls)</p>
                  <input id="elective-file-input" type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
                </label>

                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition-colors ${
                    !selectedFile || uploading
                      ? 'cursor-not-allowed bg-slate-300 text-slate-500'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  <Upload className="h-5 w-5" />
                  {uploading ? 'Uploading...' : 'Upload and Import'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Import Filters</h3>
                  <p className="text-sm text-slate-600">Narrow the elective subject list shown below.</p>
                </div>
                <button
                  onClick={resetImportFilters}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Search</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={importFilters.search}
                      onChange={(e) => setImportFilters((prev) => ({ ...prev, search: e.target.value }))}
                      placeholder="Code, name, parent..."
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Regulation</label>
                  <select
                    value={importFilters.regulation}
                    onChange={(e) => setImportFilters((prev) => ({ ...prev, regulation: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">All Regulations</option>
                    {uniqueRegulations.map((reg) => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Semester</label>
                  <select
                    value={importFilters.semester}
                    onChange={(e) => setImportFilters((prev) => ({ ...prev, semester: e.target.value ? Number(e.target.value) : '' }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">All Semesters</option>
                    {uniqueSemesters.map((sem) => (
                      <option key={sem} value={sem}>{sem}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Department</label>
                  <select
                    value={importFilters.departmentId}
                    onChange={(e) => setImportFilters((prev) => ({ ...prev, departmentId: e.target.value ? Number(e.target.value) : '' }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">All Departments</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.code} - {department.short_name || department.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Parent Elective</label>
                  <select
                    value={importFilters.parent}
                    onChange={(e) => setImportFilters((prev) => ({ ...prev, parent: e.target.value, electiveSubjectId: '' }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">All Parents</option>
                    {uniqueParents.map((parent) => (
                      <option key={parent} value={parent}>{parent}</option>
                    ))}
                  </select>
                </div>

                {importFilters.parent && importFilters.departmentId && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Elective Subject</label>
                    <select
                      value={importFilters.electiveSubjectId}
                      onChange={(e) => setImportFilters((prev) => ({ ...prev, electiveSubjectId: e.target.value ? Number(e.target.value) : '' }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="">All Subjects</option>
                      {importElectiveSubjectOptions.map((elective) => (
                        <option key={elective.id} value={elective.id}>
                          {elective.course_code} - {elective.course_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="inline-flex items-center gap-2 font-medium text-slate-900"><Users className="h-4 w-4 text-indigo-600" /> {importStats.total} electives</span>
                <span className="text-slate-400">·</span>
                <span>{importStats.students} student mappings</span>
              </div>
            </div>
          </div>

          {result && (
            <div className={`mx-6 mb-6 rounded-2xl border p-4 ${result.errors && result.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-start gap-3">
                {result.errors && result.errors.length > 0 ? (
                  <AlertCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-emerald-600" />
                )}
                <div className="flex-1">
                  <h3 className={`text-lg font-semibold ${result.errors && result.errors.length > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
                    {result.message}
                  </h3>
                  <div className={`mt-2 space-y-1 text-sm ${result.errors && result.errors.length > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                    <p><strong>Created:</strong> {result.created} entries</p>
                    <p><strong>Updated:</strong> {result.updated} entries</p>
                    {result.errors && result.errors.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-2 font-semibold text-red-700">Errors ({result.errors.length}):</p>
                        <ul className="max-h-40 space-y-1 overflow-y-auto list-disc list-inside text-xs text-red-600">
                          {result.errors.map((error: string, idx: number) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="px-6 pb-6">
            {loadingElectives ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 py-10 text-center text-slate-600">Loading electives...</div>
            ) : filteredElectives.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 py-10 text-center text-slate-500">No electives found</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Course Code</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Course Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Parent Elective</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Regulation</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Semester</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Department</th>
                      <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Students</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredElectivesForPage.map((elective) => (
                      <tr key={elective.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{elective.course_code}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{elective.course_name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{elective.parent_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{elective.regulation || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{elective.semester || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{elective.department?.code ? `${elective.department.code} - ${elective.department.short_name || elective.department.name}` : '-'}</td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-indigo-700">{elective.student_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-600">Showing {Math.min((importPage - 1) * importPageSize + 1, filteredElectives.length)} to {Math.min(importPage * importPageSize, filteredElectives.length)} of {filteredElectives.length} electives</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setImportPage((prev) => Math.max(1, prev - 1))}
                      disabled={importPage <= 1}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {'<'}
                    </button>
                    {visibleImportPageNumbers.map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setImportPage(pageNum)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                          importPage === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                    <button
                      onClick={() => setImportPage((prev) => Math.min(importTotalPages, prev + 1))}
                      disabled={importPage >= importTotalPages}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {'>'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          id="student-lists-section"
          className={`${activeSection === 'students' ? '' : 'hidden'}`}
        >
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-violet-50 p-2.5 text-violet-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">2. Student List with Elective Subject and Code</h2>
                  <p className="text-sm text-slate-600">Filter and edit student elective mappings inline.</p>
                </div>
              </div>
              <button
                onClick={resetStudentFilters}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Reset Filters
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1 min-w-[260px] flex-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Search</label>
                  <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={studentFilters.search}
                    onChange={(e) => setStudentFilters((prev) => ({ ...prev, search: e.target.value }))}
                    placeholder="Student, code, section, year..."
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Regulation</label>
                <select
                  value={studentFilters.regulation}
                  onChange={(e) => setStudentFilters((prev) => ({ ...prev, regulation: e.target.value }))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[120px]"
                >
                  <option value="">All</option>
                  {uniqueRegulations.map((reg) => (
                    <option key={reg} value={reg}>{reg}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Semester</label>
                <select
                  value={studentFilters.semester}
                  onChange={(e) => setStudentFilters((prev) => ({ ...prev, semester: e.target.value ? Number(e.target.value) : '' }))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[110px]"
                >
                  <option value="">All</option>
                  {uniqueSemesters.map((sem) => (
                    <option key={sem} value={sem}>{sem}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Department</label>
                <select
                  value={studentFilters.departmentId}
                  onChange={(e) => setStudentFilters((prev) => ({ ...prev, departmentId: e.target.value ? Number(e.target.value) : '' }))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[180px]"
                >
                  <option value="">All</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} - {department.short_name || department.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Parent Elective</label>
                <select
                  value={studentFilters.parentName}
                  onChange={(e) => setStudentFilters((prev) => ({ ...prev, parentName: e.target.value }))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[180px]"
                >
                  <option value="">All</option>
                  {uniqueParents.map((parent) => (
                    <option key={parent} value={parent}>{parent}</option>
                  ))}
                </select>
              </div>

              {studentFilters.parentName && studentFilters.departmentId && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Elective Subject</label>
                  <select
                    value={studentFilters.electiveSubjectId}
                    onChange={(e) => setStudentFilters((prev) => ({ ...prev, electiveSubjectId: e.target.value ? Number(e.target.value) : '' }))}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[220px]"
                  >
                    <option value="">All</option>
                    {studentElectiveOptions.map((elective) => (
                      <option key={elective.id} value={elective.id}>
                        {elective.course_code} - {elective.course_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-end">
                <button
                  onClick={resetStudentFilters}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset
                </button>
              </div>
            </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span className="inline-flex items-center gap-2 font-medium text-slate-900"><Users className="h-4 w-4 text-violet-600" /> {studentStats.total} choices</span>
              <span className="text-slate-400">·</span>
              <span>{studentStats.active} active</span>
              <span className="text-slate-400">·</span>
              <span>{loadingChoices ? 'Refreshing...' : 'Loaded from elective choice records'}</span>
            </div>

            <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {loadingChoices ? (
                <div className="bg-slate-50 py-12 text-center text-slate-600">Loading student elective choices...</div>
              ) : filteredChoices.length === 0 ? (
                <div className="bg-slate-50 py-12 text-center text-slate-500">No student elective choices found</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Section</th>
                          <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Elective Subject</th>
                          <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Code</th>
                          <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Academic Year</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Edit</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredChoices.map((choice) => {
                          const draft = choiceDrafts[choice.id] || {
                            elective_subject_id: String(choice.elective_subject_id ?? ''),
                            is_active: Boolean(choice.is_active),
                          };
                          const isEditing = editingChoiceId === choice.id;
                          const hasChanges =
                            draft.elective_subject_id !== String(choice.elective_subject_id ?? '') ||
                            draft.is_active !== Boolean(choice.is_active);
                          const currentElectiveId = isEditing ? Number(draft.elective_subject_id) : Number(choice.elective_subject_id);
                          const selectedElective = electives.find((elective) => elective.id === currentElectiveId);
                          const editableElectiveOptions = getEditableElectiveOptions(choice);

                          return (
                            <tr key={choice.id} className="transition-colors hover:bg-slate-50">
                              <td className="px-4 py-3">
                                <div className="text-sm font-semibold text-slate-900">{choice.student_name || choice.student_username || 'Unknown'}</div>
                                <div className="text-xs text-slate-500">{choice.student_reg_no || '-'}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600">{choice.section_name || '-'}</td>
                              <td className="px-4 py-3">
                                {isEditing ? (
                                  <select
                                    value={draft.elective_subject_id}
                                    onChange={(e) => setChoiceDrafts((prev) => ({
                                      ...prev,
                                      [choice.id]: {
                                        ...draft,
                                        elective_subject_id: e.target.value,
                                      },
                                    }))}
                                    className="w-full min-w-[220px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                                  >
                                    <option value="">Select elective subject</option>
                                    {editableElectiveOptions.map((elective) => (
                                      <option key={elective.id} value={elective.id}>
                                        {elective.course_code} - {elective.course_name}
                                      </option>
                                    ))}
                                    {selectedElective == null && choice.elective_subject_id && (
                                      <option value={choice.elective_subject_id}>{choice.elective_subject_code} - {choice.elective_subject_name}</option>
                                    )}
                                  </select>
                                ) : (
                                  <div className="min-w-[220px] text-sm text-slate-700">
                                    <div className="font-medium text-slate-900">{selectedElective?.course_name || choice.elective_subject_name || '-'}</div>
                                    <div className="text-xs text-slate-500">{selectedElective?.course_code || choice.elective_subject_code || '-'}</div>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-indigo-700">{selectedElective?.course_code || choice.elective_subject_code || '-'}</td>
                              <td className="px-4 py-3 text-sm text-slate-600">{choice.academic_year_name || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => startEditingChoice(choice)}
                                  className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                                    isEditing
                                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700'
                                  }`}
                                  title="Edit elective subject"
                                  aria-label="Edit elective subject"
                                >
                                  <PencilLine className="h-4 w-4" />
                                </button>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => saveChoice(choice)}
                                    disabled={!hasChanges || savingChoiceId === choice.id}
                                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                                      !hasChanges || savingChoiceId === choice.id
                                        ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                        : 'bg-violet-600 text-white hover:bg-violet-700'
                                    }`}
                                  >
                                    {savingChoiceId === choice.id ? (
                                      <>
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Saving...
                                      </>
                                    ) : (
                                      <>
                                        <Save className="h-4 w-4" />
                                        Save
                                      </>
                                    )}
                                  </button>
                                  {isEditing && (
                                    <button
                                      onClick={() => cancelEditingChoice(choice)}
                                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                                    >
                                      <X className="h-4 w-4" />
                                      Cancel
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-sm text-slate-600">Showing {showingFrom} to {showingTo} of {studentTotalCount} students</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStudentPage((prev) => Math.max(1, prev - 1))}
                        disabled={studentPage <= 1}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {'<'}
                      </button>
                      {visiblePageNumbers.map((pageNum) => (
                        <button
                          key={pageNum}
                          onClick={() => setStudentPage(pageNum)}
                          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                            studentPage === pageNum
                              ? 'bg-indigo-600 text-white'
                              : 'border border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          {pageNum}
                        </button>
                      ))}
                      <button
                        onClick={() => setStudentPage((prev) => Math.min(studentTotalPages, prev + 1))}
                        disabled={studentPage >= studentTotalPages}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {'>'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
