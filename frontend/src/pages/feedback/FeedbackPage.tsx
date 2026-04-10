import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, PlusCircle, FileText, Users, Loader2, AlertCircle, X, Trash2, Star, Send, CheckCircle, ChevronDown, ChevronLeft, Pencil, Download, CircleDot, BarChart3 } from 'lucide-react';
import { getCachedMe } from '../../services/auth';
import fetchWithAuth from '../../services/fetchAuth';

type User = {
  id: number;
  username: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  profile_type?: string | null;
  profile?: any | null;
};

type Question = {
  id?: number;
  question_id?: number;
  ui_id?: string;
  question: string;
  question_text?: string;
  answer_type?: 'STAR' | 'TEXT' | 'BOTH';  // Legacy field for backward compatibility
  question_type?: 'rating' | 'text' | 'radio' | 'rating_radio_comment';
  options?: { id?: number; ui_id?: string; option_text: string }[];
  allow_rating: boolean;
  allow_comment: boolean;
  is_mandatory?: boolean;
  rating_scale?: string | null;
  comment_required?: boolean;
  order: number;
};

const buildDefaultQuestions = (): Question[] => {
  const seed = Date.now();
  return [
    {
      ui_id: `default-${seed}-1`,
      question: 'How clearly did the faculty explain the subject concepts?',
      answer_type: 'BOTH',
      allow_rating: true,
      allow_comment: false,
      order: 1,
    },
    {
      ui_id: `default-${seed}-2`,
      question: 'How effectively did the faculty answer students\' questions?',
      answer_type: 'BOTH',
      allow_rating: true,
      allow_comment: false,
      order: 2,
    },
    {
      ui_id: `default-${seed}-3`,
      question: 'Was the pace of teaching comfortable for you?',
      answer_type: 'BOTH',
      allow_rating: true,
      allow_comment: false,
      order: 3,
    },
  ];
};

const buildIqacStudentDefaultQuestions = (): Question[] => {
  const seed = Date.now();
  return [
    {
      ui_id: `iqac-student-${seed}-1`,
      question: 'QUALITY OF ASSESSMENTS (SUMMATIVE AND FORMATIVE)\nTeacher is very effective in creating challenging, innovative and interesting assessments in summative, formative and laboratory components.',
      allow_rating: true,
      allow_comment: false,
      order: 1,
    },
    {
      ui_id: `iqac-student-${seed}-2`,
      question: 'QUALITY OF TEACHING\nTeacher effectively transfers expertise through classroom and laboratory engagement, nurturing knowledge, skills and attitude of learners and encouraging project-based and co-curricular learning.',
      allow_rating: true,
      allow_comment: false,
      order: 2,
    },
    {
      ui_id: `iqac-student-${seed}-3`,
      question: 'TECHNICAL EXPERTISE IN THE COURSE\nTeacher demonstrates thorough in-depth knowledge and strong technical expertise in the course.',
      allow_rating: true,
      allow_comment: false,
      order: 3,
    },
    {
      ui_id: `iqac-student-${seed}-4`,
      question: 'ENGLISH COMMUNICATION SKILLS\nTeacher teaches effectively in English and encourages students to communicate in English.',
      allow_rating: true,
      allow_comment: false,
      order: 4,
    },
    {
      ui_id: `iqac-student-${seed}-5`,
      question: 'GOAL SETTING FOR THE COURSE\nTeacher sets clear module-wise objectives and ensures learning outcomes are achieved through structured course delivery and assessment planning.',
      allow_rating: true,
      allow_comment: false,
      order: 5,
    },
  ];
};

const getInitialFormData = (): FeedbackFormData => ({
  target_type: '',
  type: '',
  department: null,
  status: 'DRAFT',
  questions: buildDefaultQuestions(),
  year: null,
  semester: null,
  section: null,
  regulation: null,
  years: [],
  semesters: [],
  sections: [],
  common_comment_enabled: true,
  allow_hod_view: false,
  anonymous: false,
  form_name: '',
});

type FeedbackFormData = {
  target_type: 'STAFF' | 'STUDENT' | '';
  type: 'SUBJECT_FEEDBACK' | 'OPEN_FEEDBACK' | '';
  department: number | null;
  status: 'DRAFT' | 'ACTIVE';
  questions: Question[];
  year: number | null;
  semester: number | null;
  section: number | null;
  regulation: number | null;
  years: number[];
  semesters: number[];
  sections: number[];
  common_comment_enabled: boolean;
  allow_hod_view: boolean;
  anonymous: boolean;
  form_name: string;
};

type FeedbackForm = {
  id: number;
  department: number;
  target_type: string;
  type: string;
  status: string;
  created_at: string;
  created_by: number;
  created_by_name: string;
  questions: Question[];
  year: number | null;
  years?: number[];
  semesters?: number[];
  sections?: number[];
  semester_number: number | null;
  section_name: string | null;
  regulation_name: string | null;
  target_display: string;
  context_display?: string;
  class_context_display?: string[];
  active: boolean;
  is_submitted?: boolean;
  submission_status?: string;
  common_comment_enabled?: boolean;
  allow_hod_view?: boolean;
  anonymous?: boolean;
  form_name?: string;
};

type ResponseStatistics = {
  feedback_form_id: number;
  response_count: number;
  expected_count: number;
  percentage: number;
};

type ResponseDetail = {
  user_id: number;
  user_name: string;
  register_number: string | null;
  submitted_at: string;
  answers: {
    question_id: number;
    question_text: string;
    answer_type: string;
    question_type?: string;
    answer_star: number | null;
    question_comment?: string | null;
    answer_text: string | null;
    common_comment?: string | null;
    selected_option?: string | null;
    selected_option_text?: string | null;
    teaching_assignment?: {
      teaching_assignment_id: number;
      subject_name: string | null;
      subject_code: string | null;
      staff_name: string | null;
    } | null;
  }[];
};

type ResponseListData = {
  feedback_form_id: number;
  form_name?: string;
  target_type?: string;
  target_display?: string;
  context_display?: string;
  class_context_display?: string[];
  responded: ResponseDetail[];
  non_responders: {
    user_id: number;
    user_name: string;
    register_number: string | null;
  }[];
  total_students: number;
  total_responded: number;
  total_non_responded: number;
};

type FeedbackResponse = {
  question: number;
  answer_star?: number;
  answer_text?: string;
  selected_option?: number;
  teaching_assignment_id?: number;  // For subject feedback
};

type StudentSubject = {
  teaching_assignment_id: number;
  subject_name: string;
  subject_code: string;
  staff_name: string;
  staff_id: number;
  is_completed: boolean;
};

type StudentSubjectsResponse = {
  feedback_form_id: number;
  subjects: StudentSubject[];
  total_subjects: number;
  completed_subjects: number;
  all_completed: boolean;
  is_first_year?: boolean;
  detail?: string;
  form_status?: string;
};

type Department = {
  id: number;
  name: string;
  code: string;
};

type DepartmentResponse = {
  success: boolean;
  has_multiple_departments: boolean;
  departments: Department[];
  active_department: Department;
};

type ClassOption = {
  value: number;
  label: string;
  display_name?: string;
  name?: string;
  department_id?: number;
  department_label?: string;
  number?: number;
  year?: number;
};

type ClassOptions = {
  years: ClassOption[];
  semesters: ClassOption[];
  sections: ClassOption[];
  year_sections?: Record<number, ClassOption[]>;
};

type PrincipalDashboardItem = {
  id: number;
  feedback_type: 'PRINCIPAL';
  target_audience: 'STUDENT' | 'STAFF' | 'HOD';
  is_anonymous: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  created_at: string;
  response_count: number;
  expected_count: number;
  percentage: number;
  questions_count: number;
};

type PrincipalAnalyticsQuestion = {
  id: number;
  question_text: string;
  question_type: 'rating' | 'text' | 'radio' | 'rating_radio_comment';
  is_mandatory: boolean;
  responses_count: number;
  options: Array<{ id: number; option_text: string }>;
};

type PrincipalAnalyticsData = {
  feedback_form_id: number;
  feedback_type: string;
  target_audience: 'STUDENT' | 'STAFF' | 'HOD';
  is_anonymous: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  created_at: string;
  response_count: number;
  expected_count: number;
  percentage: number;
  questions: PrincipalAnalyticsQuestion[];
};

type PrincipalCreateQuestion = {
  id: string;
  question_text: string;
  allow_rating: boolean;
  allow_comment: boolean;
  allow_own_type: boolean;
  is_mandatory: boolean;
  options: string[];
};

const buildPrincipalCreateDefaultQuestions = (): PrincipalCreateQuestion[] => {
  const seed = Date.now();
  return [
    {
      id: `principal-q-${seed}-1`,
      question_text: 'Share your overall feedback about institutional facilities and support.',
      allow_rating: true,
      allow_comment: true,
      allow_own_type: false,
      is_mandatory: true,
      options: ['Option 1', 'Option 2'],
    },
  ];
};

const extractApiErrorMessage = (data: any): string => {
  if (!data) return 'An unexpected error occurred.';
  if (typeof data === 'string') return data;
  if (data.detail && typeof data.detail === 'string') return data.detail;
  if (data.error && typeof data.error === 'string') return data.error;

  const flattenDict = (obj: any): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (Array.isArray(value) && value.length > 0) {
        return `${key}: ${String(value[0])}`;
      }
      if (typeof value === 'string') {
        return `${key}: ${value}`;
      }
      if (typeof value === 'object') {
        const nested = flattenDict(value);
        if (nested) return nested;
      }
    }
    return null;
  };

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    const nested = flattenDict(first?.errors || first);
    if (nested) return nested;
  }

  if (data.errors && typeof data.errors === 'object') {
    const nested = flattenDict(data.errors);
    if (nested) return nested;
  }

  return 'Request failed. Please check the form fields and try again.';
};

const getClassContextLines = (item: {
  class_context_display?: string[];
  context_display?: string;
  target_display?: string;
}): string[] => {
  if (item.class_context_display && item.class_context_display.length > 0) {
    return item.class_context_display;
  }
  if (item.context_display) {
    return [item.context_display];
  }
  return [item.target_display || 'Feedback'];
};

export default function FeedbackPage() {
  const navigate = useNavigate();

  const resizeTextarea = (textarea: HTMLTextAreaElement) => {
    const MAX_HEIGHT = 240;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  };

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    resizeTextarea(e.currentTarget);
  };

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<FeedbackFormData>(getInitialFormData());
  const [editingFormId, setEditingFormId] = useState<number | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [allowRating, setAllowRating] = useState(true);
  const [allowComment, setAllowComment] = useState(false);
  const [allowOwnType, setAllowOwnType] = useState(false);
  const [questionResponseTypeErrors, setQuestionResponseTypeErrors] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // HOD department state - supports multiple departments
  const [departmentData, setDepartmentData] = useState<DepartmentResponse | null>(null);
  const [activeDepartment, setActiveDepartment] = useState<Department | null>(null);
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([]); // For multi-select during form creation
  const [allDepartmentsSelected, setAllDepartmentsSelected] = useState(false);
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [departmentLoading, setDepartmentLoading] = useState(true);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  
  // IQAC department state - for IQAC users to select from all departments
  const [iqacAllDepartments, setIqacAllDepartments] = useState<Department[]>([]);
  const [iqacSelectedDepartmentIds, setIqacSelectedDepartmentIds] = useState<number[]>([]);
  const [iqacDepartmentDropdownOpen, setIqacDepartmentDropdownOpen] = useState(false);

  // Class options state
  const [classOptions, setClassOptions] = useState<ClassOptions>({
    years: [],
    semesters: [],
    sections: [],
    year_sections: {}
  });
  const [loadingClassOptions, setLoadingClassOptions] = useState(false);
  const [classOptionsError, setClassOptionsError] = useState<string | null>(null);
  const [sectionOptions, setSectionOptions] = useState<ClassOption[]>([]);
  const [sectionOptionsLoading, setSectionOptionsLoading] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [sectionDropdownOpen, setSectionDropdownOpen] = useState(false);

  // Staff/Student view states
  const [feedbackForms, setFeedbackForms] = useState<FeedbackForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [selectedForm, setSelectedForm] = useState<FeedbackForm | null>(null);
  const [responses, setResponses] = useState<Record<number, FeedbackResponse>>({});
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [responseSuccess, setResponseSuccess] = useState(false);

  // Student subject feedback states
  const [studentSubjects, setStudentSubjects] = useState<StudentSubjectsResponse | null>(null);
  const [loadingStudentSubjects, setLoadingStudentSubjects] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<StudentSubject | null>(null);
  const [currentSubjectResponses, setCurrentSubjectResponses] = useState<Record<number, FeedbackResponse>>({});
  const [currentSubjectCommonComment, setCurrentSubjectCommonComment] = useState('');
  const [currentSubjectCommonCommentError, setCurrentSubjectCommonCommentError] = useState(false);
  const [commentValidationErrors, setCommentValidationErrors] = useState<Record<number, boolean>>({});
  const [ratingValidationErrors, setRatingValidationErrors] = useState<Record<number, boolean>>({});
  const [optionValidationErrors, setOptionValidationErrors] = useState<Record<number, boolean>>({});

  // HOD response view states
  const [responseStats, setResponseStats] = useState<Record<number, ResponseStatistics>>({});
  const [selectedResponseView, setSelectedResponseView] = useState<ResponseListData | null>(null);
  const [loadingResponseView, setLoadingResponseView] = useState(false);
  const [responseViewError, setResponseViewError] = useState<string | null>(null);
  const [exportingFormId, setExportingFormId] = useState<number | null>(null);
  const [exportingSubjectWiseReport, setExportingSubjectWiseReport] = useState(false);
  const [deactivatingAllForms, setDeactivatingAllForms] = useState(false);
  const [activatingAllForms, setActivatingAllForms] = useState(false);
  const [publishingAllForms, setPublishingAllForms] = useState(false);
  const [showPublishAllConfirm, setShowPublishAllConfirm] = useState(false);
  const [deletingAllDeactivated, setDeletingAllDeactivated] = useState(false);
  const [showDeleteAllDeactivatedConfirm, setShowDeleteAllDeactivatedConfirm] = useState(false);

  const [commonExportOpen, setCommonExportOpen] = useState(false);
  const [commonExportMode, setCommonExportMode] = useState<'EXPORT' | 'DEACTIVATE' | 'ACTIVATE' | 'NON_RESPONDERS'>('EXPORT');
  const [commonExportLoading, setCommonExportLoading] = useState(false);
  const [commonExportDownloading, setCommonExportDownloading] = useState(false);
  const [commonExportError, setCommonExportError] = useState<string | null>(null);
  const [commonExportOptions, setCommonExportOptions] = useState<{
    departments: { id: number; code: string; short_name: string; name: string }[];
  } | null>(null);
  const [commonExportAllDepartments, setCommonExportAllDepartments] = useState(true);
  const [commonExportSelectedDepartmentIds, setCommonExportSelectedDepartmentIds] = useState<number[]>([]);
  const [commonExportAllYears, setCommonExportAllYears] = useState(true);
  const [commonExportSelectedYears, setCommonExportSelectedYears] = useState<number[]>([]);
  const [commonExportYears, setCommonExportYears] = useState<number[]>([]);
  const [commonExportYearsLoading, setCommonExportYearsLoading] = useState(false);
  const [commonExportYearsLoaded, setCommonExportYearsLoaded] = useState(false);

  const [commonExportDeptDropdownOpen, setCommonExportDeptDropdownOpen] = useState(false);
  const [commonExportYearDropdownOpen, setCommonExportYearDropdownOpen] = useState(false);
  
  // Subject Wise Report modal state
  const [subjectWiseReportOpen, setSubjectWiseReportOpen] = useState(false);
  const [subjectWiseReportLoading, setSubjectWiseReportLoading] = useState(false);
  const [subjectWiseReportDownloading, setSubjectWiseReportDownloading] = useState(false);
  const [subjectWiseReportError, setSubjectWiseReportError] = useState<string | null>(null);
  const [subjectWiseReportOptions, setSubjectWiseReportOptions] = useState<{
    departments: { id: number; code: string; short_name: string; name: string }[];
  } | null>(null);
  const [subjectWiseReportAllDepartments, setSubjectWiseReportAllDepartments] = useState(true);
  const [subjectWiseReportSelectedDepartmentIds, setSubjectWiseReportSelectedDepartmentIds] = useState<number[]>([]);
  const [subjectWiseReportAllYears, setSubjectWiseReportAllYears] = useState(true);
  const [subjectWiseReportSelectedYears, setSubjectWiseReportSelectedYears] = useState<number[]>([]);
  const [subjectWiseReportYears, setSubjectWiseReportYears] = useState<number[]>([1, 2, 3, 4]);
  const [subjectWiseReportDeptDropdownOpen, setSubjectWiseReportDeptDropdownOpen] = useState(false);
  const [subjectWiseReportYearDropdownOpen, setSubjectWiseReportYearDropdownOpen] = useState(false);
  
  // Deactivated forms accordion state
  const [showDeactivatedForms, setShowDeactivatedForms] = useState(false);

  // Ref for dropdowns
  const departmentDropdownRef = useRef<HTMLDivElement>(null);
  const iqacDepartmentDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const sectionDropdownRef = useRef<HTMLDivElement>(null);

  const commonExportDeptDropdownRef = useRef<HTMLDivElement>(null);
  const commonExportYearDropdownRef = useRef<HTMLDivElement>(null);

  const subjectWiseReportDeptDropdownRef = useRef<HTMLDivElement>(null);
  const subjectWiseReportYearDropdownRef = useRef<HTMLDivElement>(null);

  // Subjects by year state (for HOD form creation)
  const [subjectsByYear, setSubjectsByYear] = useState<{
    subjects: {
      subject_name: string;
      subject_code: string;
      staff_names: string;
      sections: string;
      years: number[];  // Years this subject appears in
      assignment_count: number;
      is_elective?: boolean;
      elective_category?: string;
    }[];
    regular_subjects?: {
      subject_name: string;
      subject_code: string;
      staff_names: string;
      sections: string;
      years: number[];
      assignment_count: number;
    }[];
    elective_subjects?: {
      subject_name: string;
      subject_code: string;
      staff_names: string;
      sections: string;
      years: number[];
      assignment_count: number;
      elective_category?: string;
    }[];
    elective_categories?: {
      category: string;
      count: number;
      years: number[];
      display_name: string;
    }[];
    elective_groups?: {
      category: string;
      subjects: {
        subject_name: string;
        subject_code: string;
        staff_names: string;
        sections: string;
        years: number[];
        assignment_count: number;
      }[];
      count: number;
    }[];
    total_subjects: number;
    has_electives?: boolean;
  } | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  
  // Expanded elective categories state (for expand/collapse behavior)

  // Check permissions
  const permissions = (user?.permissions || []).map(p => p.toLowerCase());
  const canCreateFeedback = permissions.includes('feedback.create');
  const canReplyFeedback = permissions.includes('feedback.reply');
  const canAllDepartmentsAccess = permissions.includes('feedback.all_departments_access');
  const canOwnDepartmentAccess = permissions.includes('feedback.own_department_access');
  const canPrincipalAllDepartmentsAccess = permissions.includes('feedback.principal_all_departments_access');
  const canPrincipalFeedbackPage = permissions.includes('feedback.principal_feedback_page');
  const canDepartmentScopedCreate = canCreateFeedback && (canAllDepartmentsAccess || canOwnDepartmentAccess) && !canPrincipalFeedbackPage;
  const canPrincipalCreate = permissions.includes('feedback.principal_create');
  const canPrincipalAnalytics = permissions.includes('feedback.principal_analytics');
  const showPrincipalSection = canPrincipalFeedbackPage && canPrincipalAllDepartmentsAccess && (canPrincipalCreate || canPrincipalAnalytics);
  const isIQACUser = canAllDepartmentsAccess && !canPrincipalFeedbackPage;
  const isStudentUser = String(user?.profile_type || '').toUpperCase() === 'STUDENT';

  const [principalDashboardLoading, setPrincipalDashboardLoading] = useState(false);
  const [principalDashboardError, setPrincipalDashboardError] = useState<string | null>(null);
  const [principalDashboardItems, setPrincipalDashboardItems] = useState<PrincipalDashboardItem[]>([]);
  const [principalDashboardReloadKey, setPrincipalDashboardReloadKey] = useState(0);
  const [selectedPrincipalFormId, setSelectedPrincipalFormId] = useState<number | null>(null);
  const [principalAnalyticsLoading, setPrincipalAnalyticsLoading] = useState(false);
  const [principalAnalyticsError, setPrincipalAnalyticsError] = useState<string | null>(null);
  const [principalAnalyticsData, setPrincipalAnalyticsData] = useState<PrincipalAnalyticsData | null>(null);
  const [principalCreateOpen, setPrincipalCreateOpen] = useState(false);
  const [principalSubmitError, setPrincipalSubmitError] = useState<string | null>(null);
  const [principalSubmitSuccess, setPrincipalSubmitSuccess] = useState<string | null>(null);
  const [principalSubmitting, setPrincipalSubmitting] = useState(false);
  const [principalTargetAudience, setPrincipalTargetAudience] = useState<Array<'STUDENT' | 'STAFF'>>(['STUDENT', 'STAFF']);
  const [principalIsAnonymous, setPrincipalIsAnonymous] = useState(false);
  const [principalQuestions, setPrincipalQuestions] = useState<PrincipalCreateQuestion[]>(buildPrincipalCreateDefaultQuestions());

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const getQuestionKey = (q: Question, index: number) => String(q.ui_id || q.id || index);

  const questionAllowCommentSnapshotRef = useRef<Record<string, boolean>>({});

  const isOwnTypeEnabled = (q: Question) => q.question_type === 'radio' || q.question_type === 'rating_radio_comment';

  const deriveNonOwnTypeQuestionType = (q: Question): Question['question_type'] => {
    if (q.allow_rating) return 'rating';
    if (q.allow_comment) return 'text';
    return 'rating';
  };

  // Track latest per-question comment selections while Common Comment is OFF.
  // This lets us restore exact manual choices when toggling Common Comment OFF again.
  useEffect(() => {
    if (formData.common_comment_enabled) return;
    const next: Record<string, boolean> = {};
    (formData.questions || []).forEach((q, idx) => {
      next[getQuestionKey(q, idx)] = Boolean(q.allow_comment);
    });
    questionAllowCommentSnapshotRef.current = next;
  }, [formData.common_comment_enabled, formData.questions]);

  const openFeedbackForm = (form: FeedbackForm) => {
    const submissionStatus = String(form.submission_status || '').toUpperCase();
    if (form.is_submitted || submissionStatus === 'SUBMITTED') {
      if (isStudentUser) {
        showToast('Feedback already submitted');
        navigate('/student/feedback');
      }
      return;
    }

    setSelectedForm(form);
    setCommentValidationErrors({});
  };

  useEffect(() => {
    if (!isStudentUser) return;
    if (!selectedForm) return;
    const submissionStatus = String(selectedForm.submission_status || '').toUpperCase();
    if (!selectedForm.is_submitted && submissionStatus !== 'SUBMITTED') return;

    showToast('Feedback already submitted');
    setSelectedForm(null);
    setResponses({});
    setResponseError(null);
    setStudentSubjects(null);
    setSelectedSubject(null);
    setCurrentSubjectResponses({});
    setCommentValidationErrors({});
    setRatingValidationErrors({});
    setOptionValidationErrors({});
    navigate('/student/feedback');
  }, [isStudentUser, selectedForm, navigate]);

  // Helper function to get available sections based on selected years
  const getAvailableSections = (): ClassOption[] => {
    if (sectionOptions.length > 0) {
      return [...sectionOptions].sort((a, b) => (a.display_name || a.label).localeCompare(b.display_name || b.label));
    }

    if (isIQACUser) {
      return (classOptions.sections || []).sort((a, b) => (a.display_name || a.label).localeCompare(b.display_name || b.label));
    }

    if (formData.years.length === 0) {
      return classOptions.sections || [];
    }
    
    const availableSections: ClassOption[] = [];
    const seenIds = new Set<number>();
    
    for (const year of formData.years) {
      const yearSections = classOptions.year_sections?.[year] || [];
      for (const section of yearSections) {
        if (!seenIds.has(section.value)) {
          seenIds.add(section.value);
          availableSections.push(section);
        }
      }
    }
    
    return availableSections.sort((a, b) => (a.display_name || a.label).localeCompare(b.display_name || b.label));
  };

  // Note: Semester selection removed - backend will automatically determine
  // the current semester based on the active academic year parity

  const hasDepartmentSelectionForSections = (() => {
    if (isIQACUser) {
      return iqacSelectedDepartmentIds.length > 0;
    }
    if (departmentData && departmentData.has_multiple_departments) {
      if (allDepartmentsSelected) return true;
      return selectedDepartments.length > 0;
    }
    return !!activeDepartment;
  })();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (departmentDropdownRef.current && !departmentDropdownRef.current.contains(event.target as Node)) {
        setDepartmentDropdownOpen(false);
      }
      if (iqacDepartmentDropdownRef.current && !iqacDepartmentDropdownRef.current.contains(event.target as Node)) {
        setIqacDepartmentDropdownOpen(false);
      }
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target as Node)) {
        setYearDropdownOpen(false);
      }
      if (sectionDropdownRef.current && !sectionDropdownRef.current.contains(event.target as Node)) {
        setSectionDropdownOpen(false);
      }

      if (commonExportDeptDropdownRef.current && !commonExportDeptDropdownRef.current.contains(event.target as Node)) {
        setCommonExportDeptDropdownOpen(false);
      }
      if (commonExportYearDropdownRef.current && !commonExportYearDropdownRef.current.contains(event.target as Node)) {
        setCommonExportYearDropdownOpen(false);
      }

      if (subjectWiseReportDeptDropdownRef.current && !subjectWiseReportDeptDropdownRef.current.contains(event.target as Node)) {
        setSubjectWiseReportDeptDropdownOpen(false);
      }
      if (subjectWiseReportYearDropdownRef.current && !subjectWiseReportYearDropdownRef.current.contains(event.target as Node)) {
        setSubjectWiseReportYearDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debug logging
  useEffect(() => {
    if (user) {
      console.log('User permissions:', permissions);
      console.log('Can create feedback:', canCreateFeedback);
      console.log('Can reply feedback:', canReplyFeedback);
    }
  }, [user, permissions, canCreateFeedback, canReplyFeedback]);

  useEffect(() => {
    // Use cached user data
    const cachedUser = getCachedMe();
    setUser(cachedUser);
    setLoading(false);
  }, []);

  useEffect(() => {
    const loadPrincipalDashboard = async () => {
      if (!showPrincipalSection || !canPrincipalAnalytics) {
        setPrincipalDashboardItems([]);
        setPrincipalDashboardError(null);
        setSelectedPrincipalFormId(null);
        setPrincipalAnalyticsData(null);
        return;
      }

      try {
        setPrincipalDashboardLoading(true);
        setPrincipalDashboardError(null);
        const response = await fetchWithAuth('/api/feedback/principal/analytics-dashboard/');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.detail || 'Failed to load principal feedback dashboard.');
        }

        const items = Array.isArray(payload?.items) ? payload.items : [];
        setPrincipalDashboardItems(items);
      } catch (error: any) {
        setPrincipalDashboardError(error?.message || 'Failed to load principal feedback dashboard.');
      } finally {
        setPrincipalDashboardLoading(false);
      }
    };

    loadPrincipalDashboard();
  }, [showPrincipalSection, canPrincipalAnalytics, principalDashboardReloadKey]);

  useEffect(() => {
    const loadPrincipalAnalytics = async () => {
      if (!showPrincipalSection || !canPrincipalAnalytics || !selectedPrincipalFormId) {
        setPrincipalAnalyticsData(null);
        setPrincipalAnalyticsError(null);
        return;
      }

      try {
        setPrincipalAnalyticsLoading(true);
        setPrincipalAnalyticsError(null);
        const response = await fetchWithAuth(`/api/feedback/principal/${selectedPrincipalFormId}/analytics/`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.detail || 'Failed to load principal feedback analytics.');
        }
        setPrincipalAnalyticsData(payload as PrincipalAnalyticsData);
      } catch (error: any) {
        setPrincipalAnalyticsError(error?.message || 'Failed to load principal feedback analytics.');
      } finally {
        setPrincipalAnalyticsLoading(false);
      }
    };

    loadPrincipalAnalytics();
  }, [showPrincipalSection, canPrincipalAnalytics, selectedPrincipalFormId]);

  const addPrincipalQuestion = () => {
    const seed = Date.now();
    setPrincipalQuestions(prev => ([
      ...prev,
      {
        id: `principal-q-${seed}-${prev.length + 1}`,
        question_text: '',
        allow_rating: true,
        allow_comment: true,
        allow_own_type: false,
        is_mandatory: true,
        options: ['Option 1', 'Option 2'],
      },
    ]));
  };

  const removePrincipalQuestion = (id: string) => {
    setPrincipalQuestions(prev => prev.filter(q => q.id !== id));
  };

  const updatePrincipalQuestion = (id: string, updater: (q: PrincipalCreateQuestion) => PrincipalCreateQuestion) => {
    setPrincipalQuestions(prev => prev.map(q => (q.id === id ? updater(q) : q)));
  };

  const handleTogglePrincipalAudience = (audience: 'STUDENT' | 'STAFF') => {
    setPrincipalTargetAudience(prev => {
      const exists = prev.includes(audience);
      if (exists) {
        const next = prev.filter(v => v !== audience);
        if (!next.includes('STUDENT')) {
          setPrincipalIsAnonymous(false);
        }
        return next;
      }
      return [...prev, audience];
    });
  };

  const validatePrincipalCreateForm = (): string | null => {
    if (principalTargetAudience.length === 0) {
      return 'Please select at least one target audience.';
    }
    if (principalQuestions.length === 0) {
      return 'Please add at least one question.';
    }

    for (let i = 0; i < principalQuestions.length; i += 1) {
      const q = principalQuestions[i];
      if (!q.question_text.trim()) {
        return `Question ${i + 1}: question text is required.`;
      }
      if (!q.allow_rating && !q.allow_comment && !q.allow_own_type) {
        return `Question ${i + 1}: enable at least one answer method.`;
      }
      if (q.allow_own_type) {
        const optionsCount = q.options.map(opt => opt.trim()).filter(Boolean).length;
        if (optionsCount < 2) {
          return `Question ${i + 1}: own type needs at least 2 options.`;
        }
      }
    }

    return null;
  };

  const handlePrincipalCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPrincipalSubmitError(null);
    setPrincipalSubmitSuccess(null);

    const validationError = validatePrincipalCreateForm();
    if (validationError) {
      setPrincipalSubmitError(validationError);
      return;
    }

    try {
      setPrincipalSubmitting(true);
      const payload = {
        target_audience: principalTargetAudience,
        is_anonymous: principalTargetAudience.includes('STUDENT') ? principalIsAnonymous : false,
        questions: principalQuestions.map(q => {
          // Don't set a special question_type for Own Type
          // Backend will determine it based on allow_own_type flag
          let questionType: 'rating' | 'text' = 'rating';
          if (q.allow_comment && !q.allow_rating) {
            questionType = 'text';
          }

          return {
            question_text: q.question_text.trim(),
            question_type: questionType,
            allow_rating: q.allow_rating,
            allow_comment: q.allow_comment,
            allow_own_type: q.allow_own_type,
            is_mandatory: q.is_mandatory,
            options: q.allow_own_type ? [] : (q.options.map(opt => opt.trim()).filter(Boolean) || []),
          };
        }),
      };

      const response = await fetchWithAuth('/api/feedback/principal/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || 'Failed to create principal feedback forms.');
      }

      const createdId = Number(data?.feedback_form_id || data?.created_forms?.[0]?.id || 0);
      setPrincipalSubmitSuccess(data?.detail || 'Principal feedback created successfully.');
      setPrincipalDashboardReloadKey(prev => prev + 1);
      if (createdId > 0) {
        setSelectedPrincipalFormId(createdId);
      }
      setPrincipalCreateOpen(false);
      setPrincipalQuestions(buildPrincipalCreateDefaultQuestions());
    } catch (error: any) {
      setPrincipalSubmitError(error?.message || 'Failed to create principal feedback forms.');
    } finally {
      setPrincipalSubmitting(false);
    }
  };

  // Fetch HOD department(s) on mount
  useEffect(() => {
    const fetchHODDepartments = async () => {
      if (canDepartmentScopedCreate) {
        try {
          setDepartmentLoading(true);
          const response = await fetchWithAuth('/api/feedback/department/');
          
          // Log the response for debugging
          console.log('Department API response status:', response.status);
          
          if (response.ok) {
            const data: DepartmentResponse = await response.json();
            console.log('Department API data:', data);
            if (data.success && data.active_department) {
              setDepartmentData(data);
              setActiveDepartment(data.active_department);
              setDepartmentError(null);
            } else {
              // Department not found - don't show error banner, just prevent form creation
              setDepartmentData(null);
              setActiveDepartment(null);
              setDepartmentError(null); // Clear error - we'll show a message only when trying to create
            }
          } else {
            // Handle specific error statuses
            if (response.status === 401) {
              // Authentication issue - likely being handled by fetchWithAuth, don't show error
              console.warn('Authentication required for department API');
              setDepartmentData(null);
              setActiveDepartment(null);
              setDepartmentError(null); // Don't show error - auth redirect will handle it
            } else if (response.status === 403) {
              // Permission denied - but don't show error banner, just disable form creation
              console.warn('Permission denied for department API');
              setDepartmentData(null);
              setActiveDepartment(null);
              setDepartmentError(null);
            } else {
              // Other API errors (500, etc.)
              const errorData = await response.json().catch(() => ({}));
              console.error('Department API error:', response.status, errorData);
              setDepartmentError(errorData.error || errorData.message || 'Failed to fetch department information');
            }
          }
        } catch (error) {
          console.error('Error fetching HOD departments:', error);
          setDepartmentError('Error loading department information. Please check your connection.');
        } finally {
          setDepartmentLoading(false);
        }
      } else {
        setDepartmentLoading(false);
      }
    };

    if (user) {
      fetchHODDepartments();
    }
  }, [user, canDepartmentScopedCreate]);

  // Fetch IQAC departments on mount
  useEffect(() => {
    const fetchIQACDepartments = async () => {
      if (canAllDepartmentsAccess && canCreateFeedback) {
        try {
          const response = await fetchWithAuth('/api/feedback/common-export/options/');
          if (response.ok) {
            const data = await response.json();
            if (data.departments && Array.isArray(data.departments)) {
              const departments = data.departments.map((dept: any) => ({
                id: dept.id,
                name: dept.name,
                code: dept.code,
                short_name: dept.short_name
              }));
              setIqacAllDepartments(departments);
              console.log('IQAC departments loaded:', departments);
            }
          } else {
            console.warn('Failed to fetch IQAC departments');
          }
        } catch (error) {
          console.error('Error fetching IQAC departments:', error);
        }
      }
    };

    if (user) {
      fetchIQACDepartments();
    }
  }, [user, canAllDepartmentsAccess, canCreateFeedback]);

  // Initialize selectedDepartments when form is opened
  useEffect(() => {
    if (showCreateForm) {
      if (editingFormId) {
        // Editing form
        if (isIQACUser) {
          // IQAC editing - use IQAC selected departments
          if (formData.department) {
            setIqacSelectedDepartmentIds([formData.department]);
          }
        } else {
          // HOD editing
          if (formData.department) {
            setSelectedDepartments([formData.department]);
          }
        }
        if (formData.department) {
          fetchClassOptions([formData.department], formData.years);
        }
        return;
      }

      // New form
      if (isIQACUser) {
        // IQAC: Initialize with empty selection (user must select)
        setIqacSelectedDepartmentIds([]);
        return;
      }

      // HOD
      if (departmentData) {
        if (departmentData.has_multiple_departments) {
          // For multi-department HODs, default to all departments selected
          const allDeptIds = departmentData.departments.map(d => d.id);
          setSelectedDepartments(allDeptIds);
          setAllDepartmentsSelected(false);
          // Fetch class options for all departments
          fetchClassOptions(allDeptIds);
        } else {
          // Single department - set to that department
          setSelectedDepartments(activeDepartment ? [activeDepartment.id] : []);
          setAllDepartmentsSelected(false);
        }
      }
    } else if (!showCreateForm) {
      // Reset when form is closed
      setSelectedDepartments([]);
      setAllDepartmentsSelected(false);
    }
  }, [showCreateForm, departmentData, editingFormId, formData.department, isIQACUser]);

  // Fetch class options function (extracted for reuse)
  const fetchClassOptions = async (deptIds?: number[], selectedYears?: number[]) => {
    if (canCreateFeedback) {
      try {
        setLoadingClassOptions(true);
        
        // Build URL with department/year filters when provided
        let url = '/api/feedback/class-options/';
        const params = new URLSearchParams();
        if (deptIds && deptIds.length > 0) {
          deptIds.forEach(id => params.append('departments[]', id.toString()));
        }
        if (selectedYears && selectedYears.length > 0) {
          selectedYears.forEach(year => params.append('years[]', year.toString()));
        }
        if (params.toString()) {
          url += `?${params.toString()}`;
        }
        
        const response = await fetchWithAuth(url);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setClassOptions({
              years: data.years || [],
              semesters: data.semesters || [],
              sections: data.sections || [],
              year_sections: data.year_sections || {}
            });
            setClassOptionsError(null);
          } else {
            setClassOptionsError(data.error || 'Failed to load class options');
          }
        } else {
          setClassOptionsError('Failed to fetch class options');
        }
      } catch (error) {
        console.error('Error fetching class options:', error);
        setClassOptionsError('Error loading class options');
      } finally {
        setLoadingClassOptions(false);
      }
    }
  };

  // Fetch class options (years, semesters, sections) on mount
  useEffect(() => {
    if (user) {
      fetchClassOptions();
    }
  }, [user, canCreateFeedback]);

  // Load sections dynamically when department or years change during form creation
  useEffect(() => {
    if (!showCreateForm || !canCreateFeedback || formData.target_type !== 'STUDENT') {
      return;
    }

    let deptIds: number[] = [];

    if (isIQACUser) {
      if (iqacSelectedDepartmentIds.length === 0) {
        setSectionOptions([]);
        setFormData(prev => ({ ...prev, sections: [] }));
        return;
      }
      deptIds = iqacSelectedDepartmentIds;
    } else if (departmentData && departmentData.has_multiple_departments) {
      if (!allDepartmentsSelected && selectedDepartments.length === 0) {
        setSectionOptions([]);
        setFormData(prev => ({ ...prev, sections: [] }));
        return;
      }
      if (allDepartmentsSelected) {
        deptIds = departmentData.departments.map(d => d.id);
      } else if (selectedDepartments.length > 0) {
        deptIds = selectedDepartments;
      } else if (activeDepartment) {
        deptIds = [activeDepartment.id];
      }
    } else if (activeDepartment) {
      deptIds = [activeDepartment.id];
    } else {
      setSectionOptions([]);
      setFormData(prev => ({ ...prev, sections: [] }));
      return;
    }

    if (deptIds.length === 0 || formData.years.length === 0) {
      setSectionOptions([]);
      setFormData(prev => ({ ...prev, sections: [] }));
      return;
    }

    const loadSections = async () => {
      try {
        setSectionOptionsLoading(true);
        const params = new URLSearchParams();
        params.set('dept_ids', deptIds.join(','));
        params.set('years', formData.years.join(','));

        const response = await fetchWithAuth(`/api/sections/by-dept-year/?${params.toString()}`);
        const data = await response.json().catch(() => []);

        if (!response.ok || !Array.isArray(data)) {
          setSectionOptions([]);
          setFormData(prev => ({ ...prev, sections: [] }));
          return;
        }

        const nextSections: ClassOption[] = data.map((s: any) => ({
          value: s.id,
          label: s.label || String(s.id),
          display_name: s.label || String(s.id),
          year: typeof s.year === 'number' ? s.year : undefined,
          department_label: s.department_short_name || undefined,
        }));

        setSectionOptions(nextSections);
        setFormData(prev => ({
          ...prev,
          sections: prev.sections.filter(secId => nextSections.some(opt => opt.value === secId)),
        }));
      } catch (error) {
        console.error('Error loading sections by dept/year:', error);
        setSectionOptions([]);
        setFormData(prev => ({ ...prev, sections: [] }));
      } finally {
        setSectionOptionsLoading(false);
      }
    };

    loadSections();
  }, [
    showCreateForm,
    canCreateFeedback,
    formData.target_type,
    formData.years,
    isIQACUser,
    allDepartmentsSelected,
    selectedDepartments,
    iqacSelectedDepartmentIds,
    activeDepartment,
    departmentData,
  ]);

  // Fetch subjects by year when creating Subject Feedback
  useEffect(() => {
    const fetchSubjectsByYear = async () => {
      const iqacSingleDepartmentSelected = isIQACUser && !allDepartmentsSelected && selectedDepartments.length === 1;
      const iqacYears = formData.years;

      if (
        canCreateFeedback && 
        formData.type === 'SUBJECT_FEEDBACK' && 
        ((isIQACUser && iqacSingleDepartmentSelected && iqacYears.length > 0) || (!isIQACUser && formData.years.length > 0 && activeDepartment))
      ) {
        try {
          setLoadingSubjects(true);
          
          // Fetch subjects for ALL selected years (comma-separated)
          const yearsParam = isIQACUser ? iqacYears.join(',') : formData.years.join(',');
          const previewDepartmentId = isIQACUser ? selectedDepartments[0] : activeDepartment?.id;
          const queryParams = new URLSearchParams({
            years: yearsParam,
            department_id: String(previewDepartmentId),
            preview_only: '1',
            include_electives: '1'
          });
          
          // Add sections filter if sections are selected
          if (formData.sections.length > 0) {
            queryParams.append('sections', formData.sections.join(','));
          }
          
          console.log('[SubjectFetch] Calling API:', `/api/feedback/subjects-by-year/?${queryParams}`);
          const response = await fetchWithAuth(`/api/feedback/subjects-by-year/?${queryParams}`);
          console.log('[SubjectFetch] Response status:', response.status, response.ok);
          
          if (response.ok) {
            const data = await response.json();
            console.log('[SubjectFetch] Data received:', data);
            setSubjectsByYear(data);
          } else {
            const errorText = await response.text();
            console.error('[SubjectFetch] Failed to fetch subjects:', response.status, errorText);
            setSubjectsByYear(null);
          }
        } catch (error) {
          console.error('[SubjectFetch] Error fetching subjects:', error);
          setSubjectsByYear(null);
        } finally {
          setLoadingSubjects(false);
        }
      } else {
        // Reset subjects if conditions not met
        console.log('[SubjectFetch] Conditions not met, resetting subjects');
        console.log('  canCreateFeedback:', canCreateFeedback);
        console.log('  formData.type:', formData.type);
        console.log('  formData.years.length:', formData.years.length);
        console.log('  activeDepartment:', activeDepartment);
        console.log('  isIQACUser:', isIQACUser);
        console.log('  selectedDepartments:', selectedDepartments);
        console.log('  allDepartmentsSelected:', allDepartmentsSelected);
        setSubjectsByYear(null);
      }
    };

    fetchSubjectsByYear();
  }, [canCreateFeedback, formData.type, formData.years, formData.sections, activeDepartment, isIQACUser, selectedDepartments, allDepartmentsSelected, classOptions.sections, classOptions.year_sections]);

  // Fetch feedback forms for HOD, staff, and students
  useEffect(() => {
    if (user && (canCreateFeedback || canReplyFeedback)) {
      fetchFeedbackForms();
    }
  }, [user, canCreateFeedback, canReplyFeedback]);

  const fetchFeedbackForms = async () => {
    setLoadingForms(true);
    try {
      const response = await fetchWithAuth('/api/feedback/forms/');
      if (response.ok) {
        const data = await response.json();
        const normalizeQuestions = (questions: any[] = []): Question[] => {
          return questions.map((q: any, idx: number) => ({
            id: q.id ?? q.question_id,
            question_id: q.question_id,
            question: q.question ?? q.question_text ?? '',
            question_text: q.question_text,
            answer_type: q.answer_type,
            question_type: q.question_type || 'rating',
            options: Array.isArray(q.options)
              ? q.options.map((opt: any) => ({
                  id: opt.id,
                  ui_id: `opt-${opt.id || Math.random().toString(16).slice(2)}-${Date.now()}`,
                  option_text: opt.option_text || '',
                }))
              : [],
            allow_rating: typeof q.allow_rating === 'boolean' ? q.allow_rating : Boolean(q.rating_scale),
            allow_comment: typeof q.allow_comment === 'boolean' ? q.allow_comment : Boolean(q.comment_required),
            is_mandatory: typeof q.is_mandatory === 'boolean' ? q.is_mandatory : false,
            rating_scale: q.rating_scale ?? null,
            comment_required: q.comment_required,
            order: q.order ?? idx + 1,
          }));
        };

        const normalizedForms = (data || []).map((form: any) => ({
          ...form,
          common_comment_enabled: Boolean(form.common_comment_enabled),
          allow_hod_view: Boolean(form.allow_hod_view),
          questions: normalizeQuestions(form.questions || []),
        }));

        setFeedbackForms(normalizedForms);
        
        // If HOD, fetch response statistics for each form
        if (canCreateFeedback) {
          fetchAllResponseStatistics(normalizedForms);
        }
      }
    } catch (error) {
      console.error('Error fetching feedback forms:', error);
    } finally {
      setLoadingForms(false);
    }
  };

  // Fetch response statistics for all forms (HOD only)
  const fetchAllResponseStatistics = async (forms: FeedbackForm[]) => {
    const stats: Record<number, ResponseStatistics> = {};
    
    for (const form of forms) {
      try {
        const response = await fetchWithAuth(`/api/feedback/${form.id}/statistics/`);
        if (response.ok) {
          const data = await response.json();
          stats[form.id] = data;
        }
      } catch (error) {
        console.error(`Error fetching statistics for form ${form.id}:`, error);
      }
    }
    
    setResponseStats(stats);
  };

  // Toggle active status of a feedback form (HOD only)
  const handleToggleActive = async (formId: number) => {
    try {
      const response = await fetchWithAuth(`/api/feedback/${formId}/toggle-active/`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        // Re-fetch forms to get proper sorting and updated data
        await fetchFeedbackForms();
        // Show success message
        console.log(`Form ${data.active ? 'activated' : 'deactivated'} successfully`);
      } else {
        console.error('Error toggling form active status');
        alert('Failed to update form status');
      }
    } catch (error) {
      console.error('Error toggling form active status:', error);
      alert('An error occurred while updating form status');
    }
  };

  const handleToggleAllowHODView = async (formId: number) => {
    try {
      const response = await fetchWithAuth(`/api/feedback/${formId}/toggle-allow-hod-view/`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update local state to reflect the change immediately
        setFeedbackForms((prevForms) =>
          prevForms.map((form) =>
            form.id === formId
              ? { ...form, allow_hod_view: data.allow_hod_view }
              : form
          )
        );
        // Show success message
        console.log(`Allow HOD view ${data.allow_hod_view ? 'enabled' : 'disabled'} successfully`);
      } else {
        console.error('Error toggling allow HOD view');
        alert('Failed to update allow HOD view setting');
      }
    } catch (error) {
      console.error('Error toggling allow HOD view:', error);
      alert('An error occurred while updating the setting');
    }
  };

  // Delete a deactivated feedback form (HOD only)
  const handleDeleteFeedback = async (formId: number) => {
    // Confirm deletion
    if (!confirm('Are you sure you want to permanently delete this feedback form? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetchWithAuth(`/api/feedback/${formId}/delete/`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Re-fetch forms to update the list
        await fetchFeedbackForms();
        console.log('Feedback form deleted successfully');
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.detail || 'Failed to delete feedback form');
      }
    } catch (error) {
      console.error('Error deleting feedback form:', error);
      alert('An error occurred while deleting the feedback form');
    }
  };

  // Publish a draft feedback form (HOD only)
  const handlePublishForm = async (formId: number) => {
    try {
      const response = await fetchWithAuth(`/api/feedback/${formId}/publish/`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update local state - change status to ACTIVE
        setFeedbackForms(prev => 
          prev.map(form => 
            form.id === formId ? { ...form, status: 'ACTIVE' } : form
          )
        );
        // Reload forms to get fresh data
        await fetchFeedbackForms();
      } else {
        const errorData = await response.json();
        console.error('Error publishing form:', errorData);
        alert(errorData.detail || 'Failed to publish form');
      }
    } catch (error) {
      console.error('Error publishing form:', error);
      alert('An error occurred while publishing the form');
    }
  };

  // View response details for a form (HOD only)
  const handleViewResponses = async (formId: number) => {
    setLoadingResponseView(true);
    setResponseViewError(null);
    try {
      console.log(`[Feedback] Fetching responses for form ID: ${formId}`);
      const response = await fetchWithAuth(`/api/feedback/${formId}/responses/`);
      console.log(`[Feedback] Response status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Feedback] Response data received:', data);
        console.log('[Feedback] Responded users:', data.responded);
        console.log('[Feedback] Non-responders:', data.non_responders);
        setSelectedResponseView(data);
      } else {
        let errorMessage = 'Failed to load responses';
        try {
          const errorData = await response.json();
          console.error('[Feedback] Error data from backend:', errorData);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (parseError) {
          console.error('[Feedback] Failed to parse error response:', parseError);
          errorMessage = `Server error (${response.status}): ${response.statusText}`;
        }
        setResponseViewError(errorMessage);
        console.error(`[Feedback] Error response: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('[Feedback] Error fetching response details:', error);
      setResponseViewError(`Network error: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setLoadingResponseView(false);
    }
  };

  const handleExportResponsesExcel = async (formId: number) => {
    setExportingFormId(formId);
    try {
      const response = await fetchWithAuth(`/api/feedback/${formId}/export-excel/`);

      if (!response.ok) {
        let errorMessage = 'Failed to export feedback responses';
        try {
          const errorData = await response.json();
          errorMessage = errorData?.detail || errorMessage;
        } catch {
          // Keep fallback error message.
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || `Feedback_${formId}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('[Feedback] Export Excel failed:', error);
      alert(error?.message || 'Failed to export feedback responses');
    } finally {
      setExportingFormId(null);
    }
  };

  const handleSubjectWiseReport = async (formId?: number) => {
    setExportingSubjectWiseReport(true);
    try {
      const params = new URLSearchParams();
      if (formId) params.append('form_id', formId.toString());
      
      const response = await fetchWithAuth(`/api/feedback/subject-wise-report/?${params}`);

      if (!response.ok) {
        let errorMessage = 'Failed to export subject wise report';
        try {
          const errorData = await response.json();
          errorMessage = errorData?.detail || errorMessage;
        } catch {
          // Keep fallback error message.
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || `Subject_Wise_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('[Feedback] Subject Wise Report export failed:', error);
      alert(error?.message || 'Failed to export subject wise report');
    } finally {
      setExportingSubjectWiseReport(false);
    }
  };

  const openBulkFilterModal = async (mode: 'EXPORT' | 'DEACTIVATE' | 'ACTIVATE' | 'NON_RESPONDERS') => {
    setCommonExportMode(mode);
    setCommonExportOpen(true);
    setCommonExportError(null);

    if (commonExportOptions) return;
    setCommonExportLoading(true);
    try {
      const res = await fetchWithAuth('/api/feedback/common-export/options/');
      if (!res.ok) {
        let msg = 'Failed to load options';
        try {
          const data = await res.json();
          msg = data?.detail || msg;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      const data = await res.json();
      setCommonExportOptions(data);
    } catch (e: any) {
      setCommonExportError(e?.message || 'Failed to load options');
    } finally {
      setCommonExportLoading(false);
    }
  };

  const handleDeactivateAllForms = async () => {
    await openBulkFilterModal('DEACTIVATE');
  };

  const handleActivateAllForms = async () => {
    if (!canDepartmentScopedCreate) return;
    await openBulkFilterModal('ACTIVATE');
  };

  const handlePublishAllForms = async () => {
    if (!canDepartmentScopedCreate) return;
    setShowPublishAllConfirm(true);
  };

  const closePublishAllConfirm = () => {
    setShowPublishAllConfirm(false);
  };

  const handlePublishAllConfirm = async () => {
    if (!canDepartmentScopedCreate) return;
    setPublishingAllForms(true);
    try {
      const response = await fetchWithAuth('/api/feedback/publish-all/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to publish feedback forms';
        try {
          const data = await response.json();
          errorMessage = data?.detail || errorMessage;
        } catch {
          // Keep fallback message.
        }
        throw new Error(errorMessage);
      }

      const data = await response.json().catch(() => ({}));
      await fetchFeedbackForms();
      if (typeof data?.count === 'number') {
        showToast(`All Draft Forms Published Successfully - ${data.count} form${data.count === 1 ? '' : 's'} published`);
      } else {
        showToast('All Draft Forms Published Successfully');
      }
      closePublishAllConfirm();
    } catch (error: any) {
      console.error('[Feedback] Publish all failed:', error);
      showToast(error?.message || 'Failed to publish feedback forms');
    } finally {
      setPublishingAllForms(false);
    }
  };

  const handleDeleteAllDeactivated = async () => {
    if (!canDepartmentScopedCreate) return;
    setShowDeleteAllDeactivatedConfirm(true);
  };

  const closeDeleteAllDeactivatedConfirm = () => {
    setShowDeleteAllDeactivatedConfirm(false);
  };

  const handleDeleteAllDeactivatedConfirm = async () => {
    if (!canDepartmentScopedCreate) return;
    setDeletingAllDeactivated(true);
    try {
      const response = await fetchWithAuth('/api/feedback/delete-all-deactivated/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete feedback forms';
        try {
          const data = await response.json();
          errorMessage = data?.detail || errorMessage;
        } catch {
          // Keep fallback message.
        }
        throw new Error(errorMessage);
      }

      const data = await response.json().catch(() => ({}));
      await fetchFeedbackForms();
      if (typeof data?.count === 'number') {
        showToast(`All Deactivated Forms Deleted Successfully - ${data.count} form${data.count === 1 ? '' : 's'} deleted`);
      } else {
        showToast('All Deactivated Forms Deleted Successfully');
      }
      closeDeleteAllDeactivatedConfirm();
    } catch (error: any) {
      console.error('[Feedback] Delete all deactivated failed:', error);
      showToast(error?.message || 'Failed to delete feedback forms');
    } finally {
      setDeletingAllDeactivated(false);
    }
  };

  const openCommonExport = async () => {
    if (!canDepartmentScopedCreate) return;
    await openBulkFilterModal('EXPORT');
  };

  const openNonRespondersExport = async () => {
    if (!canDepartmentScopedCreate) return;
    await openBulkFilterModal('NON_RESPONDERS');
  };

  const closeCommonExport = () => {
    setCommonExportOpen(false);
    setCommonExportError(null);
    setCommonExportAllDepartments(true);
    setCommonExportAllYears(true);
    setCommonExportSelectedYears([]);
    setCommonExportDeptDropdownOpen(false);
    setCommonExportYearDropdownOpen(false);
  };

  useEffect(() => {
    if (!commonExportOpen) return;
    if (!canDepartmentScopedCreate && !(permissions || []).includes('feedback.analytics_view')) return;
    if (commonExportYearsLoaded || commonExportYearsLoading) return;

    // Always load years institution-wide (year filtering must work even for All Departments).
    const controller = new AbortController();

    const loadYears = async () => {
      setCommonExportYearsLoading(true);
      try {
        const res = await fetchWithAuth('/api/feedback/export-years/', { signal: controller.signal } as any);
        if (!res.ok) {
          let msg = 'Failed to load years';
          try {
            const data = await res.json();
            msg = data?.detail || msg;
          } catch {
            // ignore
          }
          throw new Error(msg);
        }
        const data = await res.json();
        const years = Array.isArray(data?.years) ? data.years : [];
        setCommonExportYears(years);
        setCommonExportYearsLoaded(true);
      } catch (e: any) {
        if (String(e?.name || '') === 'AbortError') return;
        setCommonExportError(e?.message || 'Failed to load years');
      } finally {
        setCommonExportYearsLoading(false);
      }
    };

    loadYears();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commonExportOpen, commonExportYearsLoaded]);

  useEffect(() => {
    if (!commonExportOpen) return;
    if (!commonExportAllDepartments) return;
    const allIds = (commonExportOptions?.departments || []).map((d) => d.id);
    setCommonExportSelectedDepartmentIds(allIds);
  }, [commonExportOpen, commonExportAllDepartments, commonExportOptions]);

  useEffect(() => {
    if (!commonExportOpen) return;
    if (!commonExportAllYears) return;
    setCommonExportSelectedYears(commonExportYears);
  }, [commonExportOpen, commonExportAllYears, commonExportYears]);

  const toggleCommonExportDepartmentId = (deptId: number) => {
    const allIds = (commonExportOptions?.departments || []).map((d) => d.id);
    if (commonExportAllDepartments) {
      setCommonExportAllDepartments(false);
      setCommonExportSelectedDepartmentIds(allIds.filter((id) => id !== deptId));
      return;
    }

    setCommonExportSelectedDepartmentIds((prev) => {
      if (prev.includes(deptId)) {
        return prev.filter((id) => id !== deptId);
      }
      return [...prev, deptId];
    });
  };

  const toggleCommonExportYearValue = (yearValue: number) => {
    if (commonExportAllYears) {
      setCommonExportAllYears(false);
      setCommonExportSelectedYears(commonExportYears.filter((y) => y !== yearValue));
      return;
    }

    const newSelectedYears = commonExportSelectedYears.includes(yearValue)
      ? commonExportSelectedYears.filter((y) => y !== yearValue)
      : [...commonExportSelectedYears, yearValue].sort((a, b) => a - b);
    
    setCommonExportSelectedYears(newSelectedYears);
    
    // Auto-select "All Years" if all individual years are now selected
    if (newSelectedYears.length === commonExportYears.length && commonExportYears.length > 0) {
      setCommonExportAllYears(true);
    }
  };

  const getCommonExportDepartmentSummary = () => {
    if (commonExportAllDepartments) return 'All Departments Selected';
    const count = commonExportSelectedDepartmentIds.length;
    if (count === 0) return 'Select Departments';
    return `${count} Departments Selected`;
  };

  const getCommonExportYearSummary = () => {
    if (commonExportAllYears) return 'All Years Selected';
    const selected = [...commonExportSelectedYears].sort((a, b) => a - b);
    if (selected.length === 0) return 'Select Years';
    return selected.map((y) => 'Year ' + String(y)).join(', ');
  };

  const handleDownloadCommonExport = async () => {
    if (!canDepartmentScopedCreate) return;
    setCommonExportError(null);

    if (!commonExportAllDepartments && commonExportSelectedDepartmentIds.length === 0) {
      setCommonExportError('Select at least one department or choose All Departments.');
      return;
    }

    if (!commonExportAllYears && commonExportSelectedYears.length === 0) {
      setCommonExportError('Select at least one year or choose All Years.');
      return;
    }

    const payload = {
      all_departments: commonExportAllDepartments,
      department_ids: commonExportAllDepartments ? [] : commonExportSelectedDepartmentIds,
      years: commonExportAllYears ? [] : commonExportSelectedYears,
    };

    setCommonExportDownloading(true);
    try {
      const res = await fetchWithAuth('/api/feedback/common-export/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = 'Failed to export feedback';
        try {
          const data = await res.json();
          msg = data?.detail || msg;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || `Feedback_Export_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      closeCommonExport();
    } catch (e: any) {
      setCommonExportError(e?.message || 'Failed to export feedback');
    } finally {
      setCommonExportDownloading(false);
    }
  };

  const handleDownloadNonRespondersExport = async () => {
    if (!canDepartmentScopedCreate) return;
    setCommonExportError(null);

    if (!commonExportAllDepartments && commonExportSelectedDepartmentIds.length === 0) {
      setCommonExportError('Select at least one department or choose All Departments.');
      return;
    }

    if (!commonExportAllYears && commonExportSelectedYears.length === 0) {
      setCommonExportError('Select at least one year or choose All Years.');
      return;
    }

    const payload = {
      all_departments: commonExportAllDepartments,
      department_ids: commonExportAllDepartments ? [] : commonExportSelectedDepartmentIds,
      years: commonExportAllYears ? [] : commonExportSelectedYears,
    };

    setCommonExportDownloading(true);
    try {
      const res = await fetchWithAuth('/api/feedback/non-responders-export/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = 'Failed to export non-responders';
        try {
          const data = await res.json();
          msg = data?.detail || msg;
        } catch {
          // Keep fallback message.
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || `Non_Responders_Report_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      closeCommonExport();
    } catch (e: any) {
      setCommonExportError(e?.message || 'Failed to export non-responders');
    } finally {
      setCommonExportDownloading(false);
    }
  };

  const handleDeactivateFilteredForms = async () => {
    if (!canDepartmentScopedCreate) return;
    setCommonExportError(null);

    if (!commonExportAllDepartments && commonExportSelectedDepartmentIds.length === 0) {
      setCommonExportError('Select at least one department or choose All Departments.');
      return;
    }

    if (!commonExportAllYears && commonExportSelectedYears.length === 0) {
      setCommonExportError('Select at least one year or choose All Years.');
      return;
    }

    const payload = {
      all_departments: commonExportAllDepartments,
      department_ids: commonExportAllDepartments ? [] : commonExportSelectedDepartmentIds,
      all_years: commonExportAllYears,
      years: commonExportAllYears ? [] : commonExportSelectedYears,
    };

    setDeactivatingAllForms(true);
    try {
      const response = await fetchWithAuth('/api/feedback/deactivate-filtered/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to deactivate feedback forms';
        try {
          const data = await response.json();
          errorMessage = data?.detail || errorMessage;
        } catch {
          // Keep fallback message.
        }
        throw new Error(errorMessage);
      }

      const data = await response.json().catch(() => ({}));
      await fetchFeedbackForms();
      if (typeof data?.count === 'number') {
        showToast(`Deactivated ${data.count} active form${data.count === 1 ? '' : 's'}`);
      } else {
        showToast('Feedback forms deactivated');
      }
      closeCommonExport();
    } catch (error: any) {
      console.error('[Feedback] Deactivate filtered failed:', error);
      setCommonExportError(error?.message || 'Failed to deactivate feedback forms');
    } finally {
      setDeactivatingAllForms(false);
    }
  };

  const handleActivateFilteredForms = async () => {
    if (!canDepartmentScopedCreate) return;
    setCommonExportError(null);

    if (!commonExportAllDepartments && commonExportSelectedDepartmentIds.length === 0) {
      setCommonExportError('Select at least one department or choose All Departments.');
      return;
    }

    if (!commonExportAllYears && commonExportSelectedYears.length === 0) {
      setCommonExportError('Select at least one year or choose All Years.');
      return;
    }

    const payload = {
      all_departments: commonExportAllDepartments,
      department_ids: commonExportAllDepartments ? [] : commonExportSelectedDepartmentIds,
      all_years: commonExportAllYears,
      years: commonExportAllYears ? [] : commonExportSelectedYears,
    };

    setActivatingAllForms(true);
    try {
      const response = await fetchWithAuth('/api/feedback/activate-filtered/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to activate feedback forms';
        try {
          const data = await response.json();
          errorMessage = data?.detail || errorMessage;
        } catch {
          // Keep fallback message.
        }
        throw new Error(errorMessage);
      }

      const data = await response.json().catch(() => ({}));
      await fetchFeedbackForms();
      if (typeof data?.count === 'number') {
        showToast(`Activated ${data.count} form${data.count === 1 ? '' : 's'}`);
      } else {
        showToast('Feedback forms activated');
      }
      closeCommonExport();
    } catch (error: any) {
      console.error('[Feedback] Activate filtered failed:', error);
      setCommonExportError(error?.message || 'Failed to activate feedback forms');
    } finally {
      setActivatingAllForms(false);
    }
  };

  // Subject Wise Report Modal Handlers
  const openSubjectWiseReportModal = async () => {
    setSubjectWiseReportOpen(true);
    setSubjectWiseReportError(null);

    if (subjectWiseReportOptions) return;
    setSubjectWiseReportLoading(true);
    try {
      const res = await fetchWithAuth('/api/feedback/common-export/options/');
      if (!res.ok) {
        let msg = 'Failed to load options';
        try {
          const data = await res.json();
          msg = data?.detail || msg;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      const data = await res.json();
      setSubjectWiseReportOptions(data);
    } catch (e: any) {
      setSubjectWiseReportError(e?.message || 'Failed to load options');
    } finally {
      setSubjectWiseReportLoading(false);
    }
  };

  const closeSubjectWiseReport = () => {
    setSubjectWiseReportOpen(false);
    setSubjectWiseReportError(null);
    setSubjectWiseReportAllDepartments(true);
    setSubjectWiseReportAllYears(true);
    setSubjectWiseReportSelectedYears([]);
    setSubjectWiseReportDeptDropdownOpen(false);
    setSubjectWiseReportYearDropdownOpen(false);
  };

  useEffect(() => {
    if (!subjectWiseReportOpen) return;
    if (!canDepartmentScopedCreate && !(permissions || []).includes('feedback.analytics_view')) return;

    // Use predefined years [1, 2, 3, 4] for Subject Wise Report
    setSubjectWiseReportYears([1, 2, 3, 4]);
  }, [subjectWiseReportOpen, canDepartmentScopedCreate, permissions]);

  useEffect(() => {
    if (!subjectWiseReportOpen) return;
    if (!subjectWiseReportAllDepartments) return;
    const allIds = (subjectWiseReportOptions?.departments || []).map((d) => d.id);
    setSubjectWiseReportSelectedDepartmentIds(allIds);
  }, [subjectWiseReportOpen, subjectWiseReportAllDepartments, subjectWiseReportOptions]);

  useEffect(() => {
    if (!subjectWiseReportOpen) return;
    if (!subjectWiseReportAllYears) return;
    setSubjectWiseReportSelectedYears(subjectWiseReportYears);
  }, [subjectWiseReportOpen, subjectWiseReportAllYears, subjectWiseReportYears]);

  const toggleSubjectWiseReportDepartmentId = (deptId: number) => {
    const allIds = (subjectWiseReportOptions?.departments || []).map((d) => d.id);
    if (subjectWiseReportAllDepartments) {
      setSubjectWiseReportAllDepartments(false);
      setSubjectWiseReportSelectedDepartmentIds(allIds.filter((id) => id !== deptId));
      return;
    }

    setSubjectWiseReportSelectedDepartmentIds((prev) => {
      if (prev.includes(deptId)) {
        return prev.filter((id) => id !== deptId);
      }
      return [...prev, deptId];
    });
  };

  const toggleSubjectWiseReportYearValue = (yearValue: number) => {
    if (subjectWiseReportAllYears) {
      setSubjectWiseReportAllYears(false);
      setSubjectWiseReportSelectedYears(subjectWiseReportYears.filter((y) => y !== yearValue));
      return;
    }

    setSubjectWiseReportSelectedYears((prev) => {
      let newSelection: number[];
      if (prev.includes(yearValue)) {
        newSelection = prev.filter((y) => y !== yearValue);
      } else {
        newSelection = [...prev, yearValue].sort((a, b) => a - b);
      }
      
      // Auto-select "All Years" if all individual years are now selected
      if (newSelection.length === subjectWiseReportYears.length && subjectWiseReportYears.length > 0) {
        setSubjectWiseReportAllYears(true);
      } else if (subjectWiseReportAllYears) {
        // Auto-unselect "All Years" if any year was unselected
        setSubjectWiseReportAllYears(false);
      }
      
      return newSelection;
    });
  };

  const getSubjectWiseReportDepartmentSummary = () => {
    if (subjectWiseReportAllDepartments) return 'All Departments Selected';
    const count = subjectWiseReportSelectedDepartmentIds.length;
    if (count === 0) return 'Select Departments';
    return `${count} Departments Selected`;
  };

  const getSubjectWiseReportYearSummary = () => {
    if (subjectWiseReportAllYears) return 'All Years Selected';
    const selected = [...subjectWiseReportSelectedYears].sort((a, b) => a - b);
    if (selected.length === 0) return 'Select Years';
    return selected.map((y) => 'Year ' + String(y)).join(', ');
  };

  const handleDownloadSubjectWiseReport = async () => {
    if (!canDepartmentScopedCreate) return;
    setSubjectWiseReportError(null);

    if (!subjectWiseReportAllDepartments && subjectWiseReportSelectedDepartmentIds.length === 0) {
      setSubjectWiseReportError('Select at least one department or choose All Departments.');
      return;
    }

    if (!subjectWiseReportAllYears && subjectWiseReportSelectedYears.length === 0) {
      setSubjectWiseReportError('Select at least one year or choose All Years.');
      return;
    }

    setSubjectWiseReportError(null);
    setSubjectWiseReportDownloading(true);
    try {
      const params = new URLSearchParams();
      params.append('all_departments', String(subjectWiseReportAllDepartments));
      if (!subjectWiseReportAllDepartments) {
        subjectWiseReportSelectedDepartmentIds.forEach((id) => params.append('department_ids[]', String(id)));
      }
      if (!subjectWiseReportAllYears) {
        params.append('years', subjectWiseReportSelectedYears.join(','));
      }

      const res = await fetchWithAuth(`/api/feedback/bulk-subject-wise-report/?${params.toString()}`);

      if (!res.ok) {
        let errorMessage = 'Failed to generate subject wise report';
        try {
          const data = await res.json();
          errorMessage = data?.detail || errorMessage;
        } catch {
          // Keep fallback message.
        }
        throw new Error(errorMessage);
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || `Bulk_Subject_Wise_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast('Subject wise report downloaded successfully');
      closeSubjectWiseReport();
    } catch (e: any) {
      setSubjectWiseReportError(e?.message || 'Failed to export subject wise report');
    } finally {
      setSubjectWiseReportDownloading(false);
    }
  };

  // Get department from user profile (for HOD)
  const getDepartmentId = (): number | null => {
    if (user?.profile && user.profile.department_id) {
      return user.profile.department_id;
    }
    return null;
  };

  const handleAddQuestion = () => {
    if (!newQuestion.trim()) return;

    const commonCommentEnabled = Boolean(formData.common_comment_enabled);

    // Ensure at least one response type is selected
    if (!allowRating && !allowComment && !allowOwnType) {
      setSubmitError('Select at least one response type.');
      return;
    }

    const ownTypeEnabled = allowOwnType;
    const questionType: Question['question_type'] = ownTypeEnabled
      ? (allowRating ? 'rating_radio_comment' : 'radio')
      : (allowRating ? 'rating' : (allowComment ? 'text' : 'rating'));

    // Keep payload aligned to backend normalization rules.
    const nextAllowRating = questionType === 'rating_radio_comment' ? true : (questionType === 'radio' ? false : allowRating);
    const nextAllowComment = commonCommentEnabled ? false : allowComment;

    const question: Question = {
      ui_id: `new-${Date.now()}-${formData.questions.length + 1}`,
      question: newQuestion.trim(),
      question_type: questionType,
      options: ownTypeEnabled ? ensureMinOwnTypeOptions([]) : [],
      allow_rating: nextAllowRating,
      allow_comment: nextAllowComment,
      is_mandatory: false,
      order: formData.questions.length + 1
    };

    setFormData({
      ...formData,
      questions: [...formData.questions, question]
    });

    setNewQuestion('');
    // Reset to defaults for adding the next question
    setAllowRating(true);
    setAllowComment(false);
    setAllowOwnType(false);
  };

  const handleRemoveQuestion = (index: number) => {
    const updatedQuestions = formData.questions.filter((_, i) => i !== index);
    // Reorder questions
    const reorderedQuestions = updatedQuestions.map((q, i) => ({
      ...q,
      order: i + 1
    }));
    setFormData({
      ...formData,
      questions: reorderedQuestions
    });
  };

  const handleUpdateQuestionText = (index: number, value: string) => {
    const updatedQuestions = [...formData.questions];
    updatedQuestions[index] = { ...updatedQuestions[index], question: value };
    setFormData({ ...formData, questions: updatedQuestions });
  };

  const handleUpdateQuestionType = (
    index: number,
    field: 'allow_rating' | 'allow_comment',
    checked: boolean
  ) => {
    if (field === 'allow_comment' && formData.common_comment_enabled) {
      return;
    }

    const updatedQuestions = [...formData.questions];
    const current = updatedQuestions[index];
    let next: Question = { ...current } as Question;
    const ownTypeEnabled = isOwnTypeEnabled(current);

    if (field === 'allow_rating') {
      if (ownTypeEnabled) {
        // Own Type supports either:
        // - radio (comment + option)
        // - rating_radio_comment (rating + comment + option)
        if (checked) {
          next.question_type = 'rating_radio_comment';
          next.allow_rating = true;
          next.allow_comment = true;
        } else {
          next.question_type = 'radio';
          next.allow_rating = false;
          next.allow_comment = true;
        }
        next.options = ensureMinOwnTypeOptions(next.options);
      } else {
        next.allow_rating = checked;
        next.question_type = deriveNonOwnTypeQuestionType(next);
        next.options = [];
      }
    } else {
      // allow_comment
      if (ownTypeEnabled) {
        if (!checked) {
          // Backend forces comment ON for Own Type; turning comment off disables Own Type.
          next = {
            ...next,
            allow_comment: false,
            question_type: deriveNonOwnTypeQuestionType({ ...next, allow_comment: false } as Question),
            options: [],
          };
        } else {
          next.allow_comment = true;
        }
      } else {
        next.allow_comment = checked;
        next.question_type = deriveNonOwnTypeQuestionType(next);
        next.options = [];
      }
    }

    setQuestionResponseTypeErrors(prev => {
      const key = getQuestionKey(next, index);
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    updatedQuestions[index] = next;
    setFormData({ ...formData, questions: updatedQuestions });
  };

  const ensureMinOwnTypeOptions = (options: { id?: number; ui_id?: string; option_text: string }[] | undefined) => {
    const next = Array.isArray(options) ? [...options] : [];
    while (next.length < 2) {
      next.push({
        ui_id: `opt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        option_text: '',
      });
    }
    return next;
  };

  const handleToggleOwnType = (index: number) => {
    if (!(isIQACUser && formData.target_type === 'STUDENT')) return;

    const updatedQuestions = [...formData.questions];
    const q = updatedQuestions[index];
    const isEnabled = isOwnTypeEnabled(q);

    const next: Question = isEnabled
      ? {
          ...q,
          question_type: deriveNonOwnTypeQuestionType(q),
          options: [],
        }
      : {
          ...q,
          question_type: q.allow_rating ? 'rating_radio_comment' : 'radio',
          allow_rating: q.allow_rating ? true : false,
          // Enabling Own Type must not force question-wise comment on.
          allow_comment: formData.common_comment_enabled ? false : q.allow_comment,
          options: ensureMinOwnTypeOptions(q.options),
        };

    setQuestionResponseTypeErrors(prev => {
      const key = getQuestionKey(next, index);
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    updatedQuestions[index] = next;

    setFormData({ ...formData, questions: updatedQuestions });
  };

  const handleAddOption = (questionIndex: number) => {
    const updatedQuestions = [...formData.questions];
    const q = updatedQuestions[questionIndex];
    const nextOptions = [...(q.options || [])];
    nextOptions.push({
      ui_id: `opt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      option_text: '',
    });
    updatedQuestions[questionIndex] = { ...q, options: nextOptions };
    setFormData({ ...formData, questions: updatedQuestions });
  };

  const handleUpdateOptionText = (questionIndex: number, optionIndex: number, value: string) => {
    const updatedQuestions = [...formData.questions];
    const q = updatedQuestions[questionIndex];
    const nextOptions = [...(q.options || [])];
    nextOptions[optionIndex] = { ...nextOptions[optionIndex], option_text: value };
    updatedQuestions[questionIndex] = { ...q, options: nextOptions };
    setFormData({ ...formData, questions: updatedQuestions });
  };

  const handleRemoveOption = (questionIndex: number, optionIndex: number) => {
    const updatedQuestions = [...formData.questions];
    const q = updatedQuestions[questionIndex];
    const nextOptions = (q.options || []).filter((_, i) => i !== optionIndex);
    updatedQuestions[questionIndex] = { ...q, options: nextOptions };
    setFormData({ ...formData, questions: updatedQuestions });
  };

  const handleEditForm = (form: FeedbackForm) => {
    setEditingFormId(form.id);
    setSubmitError(null);
    setNewQuestion('');
    setAllowRating(true);
    // Default unchecked for question-wise comment; admin can manually enable.
    setAllowComment(false);
    setAllowOwnType(false);
    setQuestionResponseTypeErrors({});

    const legacySemesterId = classOptions.semesters.find(
      sem => sem.number === form.semester_number
    )?.value || null;

    setFormData({
      target_type: (form.target_type as 'STAFF' | 'STUDENT') || '',
      type: (form.type as 'SUBJECT_FEEDBACK' | 'OPEN_FEEDBACK') || '',
      department: form.department || activeDepartment?.id || null,
      status: (form.status as 'DRAFT' | 'ACTIVE') || 'DRAFT',
      common_comment_enabled: Boolean((form as any).common_comment_enabled),
      allow_hod_view: Boolean((form as any).allow_hod_view),
      questions: (form.questions || []).map((q, idx) => ({
        id: q.id,
        ui_id: `saved-${q.id || idx}-${Date.now()}`,
        question: q.question,
        question_type: (q as any).question_type || 'rating',
        options: Array.isArray((q as any).options)
          ? (q as any).options.map((opt: any) => ({
              id: opt.id,
              ui_id: `opt-saved-${opt.id || Math.random().toString(16).slice(2)}-${Date.now()}`,
              option_text: opt.option_text || '',
            }))
          : [],
        allow_rating: q.allow_rating,
        allow_comment: q.allow_comment,
        order: q.order || idx + 1,
        answer_type: q.answer_type
      })),
      year: form.year,
      semester: legacySemesterId,
      section: null,
      regulation: null,
      years: form.years || (form.year ? [form.year] : []),
      semesters: [],
      sections: form.sections || []
    });

    setShowCreateForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    
    // Validation
    if (!formData.target_type) {
      setSubmitError('Please select a target audience');
      return;
    }
    if (!formData.type) {
      setSubmitError('Please select feedback type');
      return;
    }
    if (!formData.form_name || !formData.form_name.trim()) {
      setSubmitError('Please enter a form name');
      return;
    }
    if (formData.questions.length === 0) {
      setSubmitError('Please add at least one question');
      return;
    }

    const nextTypeErrors: Record<string, boolean> = {};
    for (let i = 0; i < formData.questions.length; i += 1) {
      const q = formData.questions[i];
      if (!q.question || !q.question.trim()) {
        setSubmitError(`Question ${i + 1} cannot be empty`);
        return;
      }

      if (formData.common_comment_enabled && q.question_type === 'text') {
        setSubmitError(`Question ${i + 1} is text-only. Disable Common Comment or enable rating.`);
        return;
      }

      const hasOwnType = isOwnTypeEnabled(q);
      if (!q.allow_rating && !q.allow_comment && !hasOwnType) {
        nextTypeErrors[getQuestionKey(q, i)] = true;
        setQuestionResponseTypeErrors(nextTypeErrors);
        setSubmitError('Select at least one response type.');
        return;
      }

      if (hasOwnType) {
        const opts = q.options || [];
        if (opts.length < 2) {
          setSubmitError(`Question ${i + 1} must have at least 2 options`);
          return;
        }
        const hasEmpty = opts.some((opt) => !opt.option_text || !opt.option_text.trim());
        if (hasEmpty) {
          setSubmitError(`Question ${i + 1} has an empty option`);
          return;
        }
      }
    }

    setQuestionResponseTypeErrors({});

    // Validate class selection for student feedback
    if (formData.target_type === 'STUDENT') {
      if (formData.years.length === 0) {
        setSubmitError('Please select at least one year');
        return;
      }
    }

    // Validate department selection
    if (isIQACUser) {
      // IQAC must select at least one department
      if (iqacSelectedDepartmentIds.length === 0) {
        setSubmitError('Please select at least one department');
        return;
      }
    } else {
      // HOD validation
      if (departmentData && departmentData.has_multiple_departments) {
        if (!allDepartmentsSelected && selectedDepartments.length === 0) {
          setSubmitError('Please select at least one department');
          return;
        }
      }
      
      // Use the fetched HOD department
      if (!activeDepartment?.id && (!departmentData || !departmentData.has_multiple_departments)) {
        setSubmitError('Department information not found. Please refresh the page or contact administrator.');
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Determine departments to send
      let departmentsToSend: number[] = [];
      if (isIQACUser) {
        // IQAC: use selected departments
        departmentsToSend = iqacSelectedDepartmentIds;
      } else if (allDepartmentsSelected) {
        departmentsToSend = [];
      } else if (departmentData && departmentData.has_multiple_departments) {
        // Multi-department HOD - use selected departments
        departmentsToSend = selectedDepartments;
      } else if (activeDepartment) {
        // Single department - use active department
        departmentsToSend = [activeDepartment.id];
      }
      
      const payload = {
        form_name: formData.form_name,
        target_type: formData.target_type,
        type: formData.type,
        departments: departmentsToSend,  // Send array of departments
        department_ids: departmentsToSend,
        all_departments: isIQACUser && allDepartmentsSelected,
        department: formData.department,
        status: formData.status,
        common_comment_enabled: Boolean(formData.common_comment_enabled),
        allow_hod_view: Boolean(formData.allow_hod_view),
        anonymous: Boolean(formData.anonymous),
        questions: formData.questions.map((q) => ({
          id: q.id,
          question: q.question,
          allow_rating: q.allow_rating,
          allow_comment: formData.common_comment_enabled ? false : q.allow_comment,
          is_mandatory: Boolean(q.is_mandatory),
          order: q.order,
          answer_type: q.answer_type,
          question_type: q.question_type || 'rating',
          options: (q.options || []).map((opt) => ({
            id: opt.id,
            option_text: opt.option_text,
          })),
        })),
        year: formData.target_type === 'STUDENT' ? formData.year : null,
        semester: formData.target_type === 'STUDENT' ? formData.semester : null,
        section: formData.target_type === 'STUDENT' ? formData.section : null,
        regulation: formData.target_type === 'STUDENT' ? formData.regulation : null,
        years: formData.target_type === 'STUDENT' ? formData.years : [],
        semesters: formData.target_type === 'STUDENT' ? formData.semesters : [],
        sections: formData.target_type === 'STUDENT' ? ((isIQACUser && allDepartmentsSelected) ? [] : formData.sections) : []
      };

      const endpoint = editingFormId
        ? `/api/feedback/${editingFormId}/update/`
        : '/api/feedback/create/';

      const response = await fetchWithAuth(endpoint, {
        method: editingFormId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned non-JSON response. Please check server logs.');
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse response as JSON:', jsonError);
        throw new Error('Invalid response from server. Expected JSON but received HTML.');
      }

      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data));
      }

      // Success
      setSubmitSuccess(true);
      setShowCreateForm(false);
      setEditingFormId(null);
      
      // Refresh the feedback forms list to show the new form
      await fetchFeedbackForms();
      
      // Reset form
      setFormData(getInitialFormData());

      // Hide success message after 3 seconds
      setTimeout(() => setSubmitSuccess(false), 3000);

    } catch (error: any) {
      setSubmitError(error.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setShowCreateForm(false);
    setEditingFormId(null);
    setFormData(getInitialFormData());
    setNewQuestion('');
    setSubmitError(null);
  };

  // Handle response changes
  const handleResponseChange = (questionId: number, type: 'STAR' | 'TEXT' | 'OPTION', value: number | string) => {
    // Use currentSubjectResponses when in subject mode, otherwise use responses
    if (selectedSubject) {
      setCurrentSubjectResponses(prev => ({
        ...prev,
        [questionId]: {
          question: questionId,
          ...(prev[questionId] || {}),
          ...(type === 'STAR'
            ? { answer_star: value as number }
            : type === 'OPTION'
              ? { selected_option: value as number }
              : { answer_text: value as string })
        }
      }));
    } else {
      setResponses(prev => ({
        ...prev,
        [questionId]: {
          question: questionId,
          ...(prev[questionId] || {}),
          ...(type === 'STAR'
            ? { answer_star: value as number }
            : type === 'OPTION'
              ? { selected_option: value as number }
              : { answer_text: value as string })
        }
      }));
    }

    if (type === 'TEXT' && String(value).trim()) {
      setCommentValidationErrors(prev => {
        if (!prev[questionId]) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }

    if (type === 'STAR' && Number(value) > 0) {
      setRatingValidationErrors(prev => {
        if (!prev[questionId]) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }

    if (type === 'OPTION' && value !== null && value !== undefined) {
      setOptionValidationErrors(prev => {
        if (!prev[questionId]) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const getMissingCommentQuestionIds = () => {
    if (!selectedForm) return [] as number[];
    if (selectedForm.common_comment_enabled) return [] as number[];
    const currentResponses = selectedSubject ? currentSubjectResponses : responses;
    return selectedForm.questions
      .filter((question) => {
        if (!question.allow_comment) return false;
        const comment = currentResponses[question.id!]?.answer_text;
        return !comment || !comment.trim();
      })
      .map((question) => question.id!);
  };

  const getMissingRatingQuestionIds = () => {
    if (!selectedForm) return [] as number[];
    const currentResponses = selectedSubject ? currentSubjectResponses : responses;
    return selectedForm.questions
      .filter((question) => {
        if (!question.allow_rating) return false;
        const rating = currentResponses[question.id!]?.answer_star;
        return rating === undefined || rating === null;
      })
      .map((question) => question.id!);
  };

  const getMissingOptionQuestionIds = () => {
    if (!selectedForm) return [] as number[];
    const currentResponses = selectedSubject ? currentSubjectResponses : responses;
    return selectedForm.questions
      .filter((question) => {
        if (question.question_type !== 'rating_radio_comment' && question.question_type !== 'radio') return false;
        const selected = currentResponses[question.id!]?.selected_option;
        return selected === undefined || selected === null;
      })
      .map((question) => question.id!);
  };

  const hasAllMandatoryComments = selectedForm ? getMissingCommentQuestionIds().length === 0 : false;
  const hasAllMandatoryRatings = selectedForm ? getMissingRatingQuestionIds().length === 0 : false;
  const hasAllMandatoryOptions = selectedForm ? getMissingOptionQuestionIds().length === 0 : false;
  const requiresCommonComment = Boolean(
    selectedForm?.common_comment_enabled && selectedForm?.type === 'SUBJECT_FEEDBACK' && selectedSubject
  );
  const hasCommonComment = !requiresCommonComment || Boolean(currentSubjectCommonComment.trim());

  // Submit feedback response
  const handleSubmitResponse = async () => {
    if (!selectedForm) return;

    const submittedFormId = selectedForm.id;

    // Determine which responses to use based on mode
    const currentResponses = selectedSubject ? currentSubjectResponses : responses;

    if (requiresCommonComment && !currentSubjectCommonComment.trim()) {
      setCurrentSubjectCommonCommentError(true);
      setResponseError('Please complete all required fields before submitting');
      return;
    }

    const missingCommentIds = getMissingCommentQuestionIds();
    if (missingCommentIds.length > 0) {
      const nextErrors: Record<number, boolean> = {};
      for (const questionId of missingCommentIds) {
        nextErrors[questionId] = true;
      }
      setCommentValidationErrors(nextErrors);
      setResponseError('Please complete all required fields before submitting');
      return;
    }

    const missingRatingIds = getMissingRatingQuestionIds();
    if (missingRatingIds.length > 0) {
      const nextErrors: Record<number, boolean> = {};
      for (const questionId of missingRatingIds) {
        nextErrors[questionId] = true;
      }
      setRatingValidationErrors(nextErrors);
      setResponseError('Please complete all required fields before submitting');
      return;
    }

    const missingOptionIds = getMissingOptionQuestionIds();
    if (missingOptionIds.length > 0) {
      const nextErrors: Record<number, boolean> = {};
      for (const questionId of missingOptionIds) {
        nextErrors[questionId] = true;
      }
      setOptionValidationErrors(nextErrors);
      setResponseError('Please complete all required fields before submitting');
      return;
    }

    setSubmittingResponse(true);
    setResponseError(null);
    setCommentValidationErrors({});
    setRatingValidationErrors({});
    setOptionValidationErrors({});
    setCurrentSubjectCommonCommentError(false);

    try {
      // Prepare payload - teaching_assignment_id goes at top level, not in each response
      const responsesArray = Object.values(currentResponses);

      const payload = {
        feedback_form_id: selectedForm.id,
        responses: responsesArray,
        ...(requiresCommonComment && { common_comment: currentSubjectCommonComment.trim() }),
        ...(selectedSubject && { teaching_assignment_id: selectedSubject.teaching_assignment_id })
      };

      console.log('Submitting feedback payload:', payload);
      if (selectedSubject) {
        console.log('Subject feedback - Teaching Assignment ID:', selectedSubject.teaching_assignment_id);
      } else {
        console.log('Open feedback submission');
      }

      const response = await fetchWithAuth('/api/feedback/submit/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('Response status:', response.status);

      let data;
      try {
        data = await response.json();
        console.log('Response data:', data);
      } catch (jsonError) {
        console.error('Failed to parse response as JSON:', jsonError);
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        // Handle specific error messages from backend
        const errorMessage = data.detail || data.message || 
                            (data.errors ? JSON.stringify(data.errors) : null) ||
                            'Failed to submit feedback';
        console.error('Submission failed:', errorMessage, data);
        throw new Error(errorMessage);
      }

      // Success
      console.log('Feedback submitted successfully');
      const submissionStatus = (data?.submission_status || '').toUpperCase();
      
      if (selectedSubject) {
        // For subject feedback, refresh the subject list and go back
        await fetchStudentSubjects(selectedForm.id);
        setSelectedSubject(null);
        setCurrentSubjectResponses({});
        setCurrentSubjectCommonComment('');
        setCurrentSubjectCommonCommentError(false);
        setCommentValidationErrors({});
        setRatingValidationErrors({});
        setOptionValidationErrors({});
        setResponseError(null);

        if (submissionStatus === 'SUBMITTED') {
          setResponseSuccess(true);
          setFeedbackForms(prev => prev.map(f => (
            f.id === submittedFormId ? { ...f, is_submitted: true, submission_status: 'SUBMITTED' } : f
          )));
          fetchFeedbackForms();
        }
      } else {
        // For open feedback, close the modal and show success
        setResponseSuccess(true);
        setSelectedForm(null);
        setResponses({});
        setCommentValidationErrors({});
        setRatingValidationErrors({});
        setOptionValidationErrors({});
        
        // Update local lock state immediately
        setFeedbackForms(prev => prev.map(f => (
          f.id === submittedFormId ? { ...f, is_submitted: true, submission_status: 'SUBMITTED' } : f
        )));

        // Refresh forms list
        fetchFeedbackForms();

        // Hide success message after 3 seconds
        setTimeout(() => setResponseSuccess(false), 3000);
      }

    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      setResponseError(error.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingResponse(false);
    }
  };

  const handleCloseForm = () => {
    setSelectedForm(null);
    setResponses({});
    setResponseError(null);
    setStudentSubjects(null);
    setSelectedSubject(null);
    setCurrentSubjectResponses({});
    setCommentValidationErrors({});
    setRatingValidationErrors({});
    setOptionValidationErrors({});
  };

  // Handle department switching for HODs with multiple departments
  const handleDepartmentSwitch = async (department: Department) => {
    try {
      setActiveDepartment(department);
      
      // Notify backend by calling the department API with the new active_department_id
      const response = await fetchWithAuth(`/api/feedback/department/?active_department_id=${department.id}`);
     if (response.ok) {
        console.log(`Switched to department: ${department.name}`);
        
        // Reload class options for the new department
        fetchClassOptions();
        
        // Reload subjects if currently viewing subject feedback
        if (formData.type === 'SUBJECT_FEEDBACK') {
          setSubjectsByYear(null); // Will trigger re-fetch via useEffect
        }
      }
    } catch (error) {
      console.error('Error switching department:', error);
    }
  };

  // Fetch student subjects for SUBJECT_FEEDBACK type
  const fetchStudentSubjects = async (formId: number) => {
    setLoadingStudentSubjects(true);
    try {
      const response = await fetchWithAuth(`/api/feedback/${formId}/subjects/`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch student subjects');
      }
      
      const data: StudentSubjectsResponse = await response.json();
      setStudentSubjects(data);
    } catch (error) {
      console.error('Error fetching student subjects:', error);
      setResponseError('Failed to load subjects. Please try again.');
    } finally {
      setLoadingStudentSubjects(false);
    }
  };

  // Fetch student subjects when SUBJECT_FEEDBACK form is selected
  useEffect(() => {
    if (selectedForm && selectedForm.type === 'SUBJECT_FEEDBACK') {
      fetchStudentSubjects(selectedForm.id);
    }
  }, [selectedForm]);

  const previewRegularSubjects = (subjectsByYear?.regular_subjects || []).filter((subject) => {
    if (!subject.years || subject.years.length === 0) return true;
    return subject.years.some((year) => formData.years.includes(year));
  });

  const previewElectiveCategories = (subjectsByYear?.elective_categories || []).filter((category) => {
    if (!category.years || category.years.length === 0) return true;
    return category.years.some((year) => formData.years.includes(year));
  });

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <span className="text-slate-600">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-indigo-600 rounded-lg shadow-lg">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Feedback</h1>
              <p className="text-slate-600">Manage and respond to feedback forms</p>
            </div>
          </div>
        </div>

        {/* Success message */}
        {submitSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-green-800 font-medium">Feedback form saved successfully!</span>
          </div>
        )}

        {showPrincipalSection && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-600 rounded-lg">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Principal Feedback</h2>
                <p className="text-sm text-slate-600">Single-page principal create, dashboard, and analytics by principal permissions.</p>
              </div>
            </div>

            {principalSubmitSuccess && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-green-800">{principalSubmitSuccess}</span>
              </div>
            )}

            {principalSubmitError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <span className="text-red-800">{principalSubmitError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Principal Create</h3>
                {canPrincipalCreate ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">Create permission enabled. Use the builder here to publish institutional feedback drafts.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setPrincipalCreateOpen(prev => !prev);
                        setPrincipalSubmitError(null);
                        setPrincipalSubmitSuccess(null);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    >
                      <PlusCircle className="w-4 h-4" />
                      {principalCreateOpen ? 'Hide Create Builder' : 'Open Create Builder'}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No permission: feedback.principal_create</p>
                )}
              </div>
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Principal Analytics</h3>
                {canPrincipalAnalytics ? (
                  <p className="text-sm text-slate-600">Analytics permission is enabled. Select a form below to preview analytics data.</p>
                ) : (
                  <p className="text-sm text-slate-500">No permission: feedback.principal_analytics</p>
                )}
              </div>
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Principal Department Scope</h3>
                <p className="text-sm text-slate-600">
                  {canPrincipalAllDepartmentsAccess
                    ? 'Principal all-departments access is enabled for institutional feedback.'
                    : 'No permission: feedback.principal_all_departments_access'}
                </p>
              </div>
            </div>

            {canPrincipalCreate && principalCreateOpen && (
              <form onSubmit={handlePrincipalCreateSubmit} className="mb-6 rounded-lg border border-slate-200 p-4 bg-slate-50 space-y-4">
                <h3 className="text-sm font-semibold text-slate-800">Create Principal Feedback</h3>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Target Audience</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {(['STUDENT', 'STAFF'] as const).map(target => (
                      <label key={target} className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={principalTargetAudience.includes(target)}
                          onChange={() => handleTogglePrincipalAudience(target)}
                          className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                        />
                        {target}
                      </label>
                    ))}
                  </div>
                </div>

                {principalTargetAudience.includes('STUDENT') && (
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={principalIsAnonymous}
                      onChange={(e) => setPrincipalIsAnonymous(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                    />
                    Anonymous feedback for students
                  </label>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Questions</p>
                    <button
                      type="button"
                      onClick={addPrincipalQuestion}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Add Question
                    </button>
                  </div>

                  {principalQuestions.map((q, index) => (
                    <div key={q.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-700">Question {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removePrincipalQuestion(q.id)}
                          className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <textarea
                        value={q.question_text}
                        onChange={(e) => updatePrincipalQuestion(q.id, prev => ({ ...prev, question_text: e.target.value }))}
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        placeholder="Enter question text"
                      />

                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={q.allow_rating}
                            onChange={(e) => updatePrincipalQuestion(q.id, prev => ({ ...prev, allow_rating: e.target.checked }))}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                          />
                          Rating
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={q.allow_comment}
                            onChange={(e) => updatePrincipalQuestion(q.id, prev => ({ ...prev, allow_comment: e.target.checked }))}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                          />
                          Comment
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={q.allow_own_type}
                            onChange={(e) => updatePrincipalQuestion(q.id, prev => ({ 
                              ...prev, 
                              allow_own_type: e.target.checked,
                              // Clear options when Own Type is enabled (mutual exclusivity)
                              options: e.target.checked ? [] : prev.options
                            }))}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                          />
                          Own Type
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={q.is_mandatory}
                            onChange={(e) => updatePrincipalQuestion(q.id, prev => ({ ...prev, is_mandatory: e.target.checked }))}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                          />
                          Mandatory
                        </label>
                      </div>

                      {q.allow_own_type && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-600">Options</p>
                          {q.options.map((opt, optIndex) => (
                            <div key={`${q.id}-opt-${optIndex}`} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => updatePrincipalQuestion(q.id, prev => {
                                  const nextOptions = [...prev.options];
                                  nextOptions[optIndex] = e.target.value;
                                  return { ...prev, options: nextOptions };
                                })}
                                className="flex-1 px-2 py-1.5 border border-slate-300 rounded"
                                placeholder={`Option ${optIndex + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => updatePrincipalQuestion(q.id, prev => {
                                  const nextOptions = prev.options.filter((_, idx) => idx !== optIndex);
                                  return { ...prev, options: nextOptions.length > 0 ? nextOptions : ['Option 1'] };
                                })}
                                className="p-1.5 rounded text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => updatePrincipalQuestion(q.id, prev => ({ ...prev, options: [...prev.options, `Option ${prev.options.length + 1}`] }))}
                            className="text-xs text-indigo-600 hover:text-indigo-700"
                          >
                            + Add Option
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={principalSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {principalSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {principalSubmitting ? 'Creating...' : 'Create Principal Feedback'}
                </button>
              </form>
            )}

            {canPrincipalAnalytics && (
              <>
                {principalDashboardError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="text-red-800">{principalDashboardError}</span>
                  </div>
                )}

                {principalDashboardLoading ? (
                  <div className="flex items-center gap-2 text-slate-600 mb-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading principal forms...
                  </div>
                ) : (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-800 mb-2">Principal Forms</h3>
                    {principalDashboardItems.length === 0 ? (
                      <p className="text-sm text-slate-500">No principal feedback forms found.</p>
                    ) : (
                      <div className="space-y-2">
                        {principalDashboardItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedPrincipalFormId(item.id)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedPrincipalFormId === item.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-800">PRINCIPAL Form #{item.id}</span>
                              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{item.status}</span>
                            </div>
                            <p className="text-xs text-slate-600 mt-1">{item.target_audience} • Responses {item.response_count}/{item.expected_count} • {item.percentage}% • {item.questions_count} Questions</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedPrincipalFormId && (
                  <div className="rounded-lg border border-slate-200 p-4 bg-white">
                    <h3 className="text-sm font-semibold text-slate-800 mb-3">Analytics Preview (Form #{selectedPrincipalFormId})</h3>

                    {principalAnalyticsError && (
                      <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{principalAnalyticsError}</div>
                    )}

                    {principalAnalyticsLoading ? (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading analytics...
                      </div>
                    ) : principalAnalyticsData ? (
                      <div className="space-y-2 text-sm text-slate-700">
                        <p>Target Audience: <span className="font-semibold">{principalAnalyticsData.target_audience}</span></p>
                        <p>Status: <span className="font-semibold">{principalAnalyticsData.status}</span></p>
                        <p>Responses: <span className="font-semibold">{principalAnalyticsData.response_count}</span> / {principalAnalyticsData.expected_count}</p>
                        <p>Completion: <span className="font-semibold">{principalAnalyticsData.percentage}%</span></p>
                        <p>Questions: <span className="font-semibold">{principalAnalyticsData.questions.length}</span></p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Select a principal form to load analytics.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* HOD Create Feedback Form Section */}
        {canDepartmentScopedCreate && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-800">
                {editingFormId ? 'Edit Draft Feedback Form' : 'Create Feedback Form'}
              </h2>
              {showCreateForm && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingFormId(null);
                    setFormData(getInitialFormData());
                    setNewQuestion('');
                    setSubmitError(null);
                  }}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              {!showCreateForm && (
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFormId(null);
                      setFormData(getInitialFormData());
                      setNewQuestion('');
                      setSubmitError(null);
                      setShowCreateForm(true);
                    }}
                    disabled={departmentLoading || !activeDepartment}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-md ${
                      !departmentLoading && activeDepartment
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <PlusCircle className="w-5 h-5" />
                    {departmentLoading ? 'Loading...' : 'New Form'}
                  </button>
                  {!departmentLoading && !activeDepartment && (
                    <div className="absolute bottom-full mb-2 right-0 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-3 py-2 whitespace-nowrap shadow-lg">
                      Department information required. Please contact administrator.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Department error (only show if API fetch completely failed) */}
            {departmentError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-4">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <span className="text-red-800">{departmentError}</span>
              </div>
            )}

            {showCreateForm && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Error message */}
                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="text-red-800">{submitError}</span>
                  </div>
                )}

                {/* Department Selection - Multi-Select for HODs with multiple departments */}
                {!isIQACUser && departmentData && departmentData.has_multiple_departments && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Users className="w-5 h-5 text-indigo-600" />
                      <label className="text-sm font-semibold text-indigo-900">
                        Select Department(s) <span className="text-red-500">*</span>
                      </label>
                    </div>
                    {isIQACUser ? (
                      <div className="relative" ref={departmentDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                          className="w-full px-4 py-2 text-left border border-indigo-300 rounded-lg bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between"
                        >
                          <span className="text-sm text-slate-700 truncate">
                            {allDepartmentsSelected
                              ? 'All Departments'
                              : selectedDepartments.length === 0
                                ? 'Select Departments...'
                                : selectedDepartments
                                    .map((id) => departmentData.departments.find((dept) => dept.id === id)?.name)
                                    .filter(Boolean)
                                    .join(', ')}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ml-2 ${departmentDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {departmentDropdownOpen && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                            <div className="p-2 space-y-1">
                              <label className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={allDepartmentsSelected}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setAllDepartmentsSelected(checked);
                                    if (checked) {
                                      const allDeptIds = departmentData.departments.map((dept) => dept.id);
                                      setSelectedDepartments(allDeptIds);
                                      setFormData({ ...formData, years: [], sections: [] });
                                      fetchClassOptions(undefined);
                                    } else {
                                      setSelectedDepartments([]);
                                      fetchClassOptions(undefined);
                                    }
                                  }}
                                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                />
                                <span className="text-sm font-medium text-slate-900">All Departments</span>
                              </label>

                              {departmentData.departments.map((dept) => (
                                <label key={dept.id} className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedDepartments.includes(dept.id)}
                                    disabled={allDepartmentsSelected}
                                    onChange={(e) => {
                                      setAllDepartmentsSelected(false);
                                      if (e.target.checked) {
                                        const newSelected = [...selectedDepartments, dept.id];
                                        setSelectedDepartments(newSelected);
                                        fetchClassOptions(newSelected, formData.years);
                                      } else {
                                        const newSelected = selectedDepartments.filter((id) => id !== dept.id);
                                        setSelectedDepartments(newSelected);
                                        fetchClassOptions(newSelected.length > 0 ? newSelected : undefined, formData.years);
                                      }
                                    }}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                  />
                                  <span className="text-sm text-slate-900">{dept.name}</span>
                                  <span className="text-xs text-slate-500">({dept.code})</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {departmentData.departments.map((dept) => (
                          <label
                            key={dept.id}
                            className="flex items-center gap-3 p-3 bg-white border border-indigo-200 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDepartments.includes(dept.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const newSelected = [...selectedDepartments, dept.id];
                                  setSelectedDepartments(newSelected);
                                  // Reload class options for selected departments
                                  fetchClassOptions(newSelected, formData.years);
                                } else {
                                  const newSelected = selectedDepartments.filter(id => id !== dept.id);
                                  setSelectedDepartments(newSelected);
                                  // Reload class options for selected departments
                                  fetchClassOptions(newSelected.length > 0 ? newSelected : undefined, formData.years);
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-slate-900">{dept.name}</span>
                            <span className="text-xs text-slate-500">({dept.code})</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {(allDepartmentsSelected || selectedDepartments.length > 0) && (
                      <p className="text-xs text-indigo-700 mt-3">
                        {allDepartmentsSelected
                          ? 'Selected: All Departments'
                          : <><span>Selected: </span><span className="font-semibold">{selectedDepartments.length} department(s)</span></>}
                      </p>
                    )}
                  </div>
                )}

                {/* Single Department Display - Show inside form for single-department HODs (NOT for IQAC) */}
                {!isIQACUser && departmentData && !departmentData.has_multiple_departments && activeDepartment && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-600" />
                    <span className="text-sm text-slate-700">
                      Department: <span className="font-semibold text-slate-900">{activeDepartment.name}</span>
                    </span>
                  </div>
                )}

                {/* IQAC Department Dropdown with All Departments checkbox */}
                {isIQACUser && !editingFormId && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Department <span className="text-red-500">*</span>
                    </label>
                    <div className="relative" ref={iqacDepartmentDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIqacDepartmentDropdownOpen(!iqacDepartmentDropdownOpen)}
                        className="w-full px-4 py-2 text-left bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-between"
                      >
                        <span className={iqacSelectedDepartmentIds.length === 0 ? 'text-slate-500' : 'text-slate-900'}>
                          {iqacSelectedDepartmentIds.length === 0
                            ? 'Select department(s)'
                            : iqacSelectedDepartmentIds.length === iqacAllDepartments.length
                              ? 'All Departments'
                              : iqacSelectedDepartmentIds.length === 1
                                ? iqacAllDepartments.find(d => d.id === iqacSelectedDepartmentIds[0])?.name || 'Select'
                                : `${iqacSelectedDepartmentIds.length} department(s) selected`}
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${iqacDepartmentDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {iqacDepartmentDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-10">
                          <div className="max-h-80 overflow-y-auto p-2 space-y-2">
                            {/* All Departments Checkbox */}
                            <label className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer bg-slate-50 border-b border-slate-200">
                              <input
                                type="checkbox"
                                checked={iqacSelectedDepartmentIds.length === iqacAllDepartments.length && iqacAllDepartments.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    // Select all departments
                                    setIqacSelectedDepartmentIds(iqacAllDepartments.map(d => d.id));
                                  } else {
                                    // Deselect all departments
                                    setIqacSelectedDepartmentIds([]);
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300"
                              />
                              <span className="text-sm font-semibold text-slate-900">All Departments</span>
                            </label>

                            {/* Individual Department Checkboxes */}
                            {iqacAllDepartments.map(dept => (
                              <label key={dept.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={iqacSelectedDepartmentIds.includes(dept.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setIqacSelectedDepartmentIds([...iqacSelectedDepartmentIds, dept.id]);
                                    } else {
                                      setIqacSelectedDepartmentIds(iqacSelectedDepartmentIds.filter(id => id !== dept.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-300"
                                />
                                <span className="text-sm text-slate-900">{dept.name}</span>
                                {dept.code && <span className="text-xs text-slate-500">({dept.code})</span>}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Target Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Target Audience <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!editingFormId) {
                          setAllowRating(true);
                          setAllowComment(false);
                          setAllowOwnType(false);
                          setFormData({
                            ...formData,
                            target_type: 'STAFF',
                            type: '',
                            common_comment_enabled: true,
                            questions: [],
                          });
                          return;
                        }
                        setFormData({ ...formData, target_type: 'STAFF', type: '' });
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        formData.target_type === 'STAFF'
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Users className={`w-6 h-6 mx-auto mb-2 ${formData.target_type === 'STAFF' ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span className={`font-medium ${formData.target_type === 'STAFF' ? 'text-indigo-900' : 'text-slate-700'}`}>
                        Staff
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isIQACUser && !editingFormId) {
                          setAllowRating(true);
                          setAllowComment(false);
                          setFormData({
                            ...formData,
                            target_type: 'STUDENT',
                            type: '',
                            questions: buildIqacStudentDefaultQuestions(),
                          });
                          return;
                        }
                        if (!editingFormId && formData.target_type === 'STAFF') {
                          setFormData({
                            ...formData,
                            target_type: 'STUDENT',
                            type: '',
                            questions: buildDefaultQuestions(),
                          });
                          return;
                        }

                        setFormData({ ...formData, target_type: 'STUDENT', type: '' });
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        formData.target_type === 'STUDENT'
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <FileText className={`w-6 h-6 mx-auto mb-2 ${formData.target_type === 'STUDENT' ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span className={`font-medium ${formData.target_type === 'STUDENT' ? 'text-indigo-900' : 'text-slate-700'}`}>
                        Students
                      </span>
                    </button>
                  </div>
                </div>

                {/* Feedback Type */}
                {formData.target_type && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Feedback Type <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {formData.target_type === 'STUDENT' && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, type: 'SUBJECT_FEEDBACK' })}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            formData.type === 'SUBJECT_FEEDBACK'
                              ? 'border-green-600 bg-green-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <FileText className={`w-6 h-6 mx-auto mb-2 ${formData.type === 'SUBJECT_FEEDBACK' ? 'text-green-600' : 'text-slate-400'}`} />
                          <span className={`font-medium ${formData.type === 'SUBJECT_FEEDBACK' ? 'text-green-900' : 'text-slate-700'}`}>
                            About Subjects
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, type: 'OPEN_FEEDBACK' })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          formData.type === 'OPEN_FEEDBACK'
                            ? 'border-green-600 bg-green-50'
                            : 'border-slate-200 hover:border-slate-300'
                        } ${formData.target_type === 'STAFF' ? 'col-span-2' : ''}`}
                      >
                        <MessageSquare className={`w-6 h-6 mx-auto mb-2 ${formData.type === 'OPEN_FEEDBACK' ? 'text-green-600' : 'text-slate-400'}`} />
                        <span className={`font-medium ${formData.type === 'OPEN_FEEDBACK' ? 'text-green-900' : 'text-slate-700'}`}>
                          Common Feedback
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Form Name */}
                {formData.type && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Form Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.form_name}
                      onChange={(e) => setFormData({ ...formData, form_name: e.target.value.slice(0, 255) })}
                      placeholder="e.g., Q1 Faculty Feedback, End of Semester Evaluation"
                      maxLength={255}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 text-sm"
                    />
                  </div>
                )}

                {/* Allow HOD to View Responses Checkbox - Only for IQAC/Admin and STUDENT feedback */}
                {formData.type && formData.target_type === 'STUDENT' && (user?.roles?.includes('IQAC') || user?.roles?.includes('ADMIN')) && (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allow_hod_view}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            allow_hod_view: e.target.checked,
                          }));
                        }}
                        className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-800">Allow HOD to View Responses</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          When enabled, department HODs can view responses filtered by their department. Otherwise, only the form creator can view responses.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Anonymous Feedback Checkbox - Only for IQAC/Admin and STUDENT feedback */}
                {formData.type && formData.target_type === 'STUDENT' && (user?.roles?.includes('IQAC') || user?.roles?.includes('ADMIN')) && (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.anonymous}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            anonymous: e.target.checked,
                          }));
                        }}
                        className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-800">Anonymous Feedback</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          When enabled, student names and register numbers will be hidden from responses, exports, and reports while preserving data for internal tracking.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Class Selection (for Students only) */}
                {formData.target_type === 'STUDENT' && formData.type && (
                  <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-semibold text-slate-800">Target Class</h3>

                    {/* Loading state */}
                    {loadingClassOptions && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading class options...
                      </div>
                    )}

                    {/* Error state */}
                    {classOptionsError && (
                      <div className="text-sm text-red-600">
                        {classOptionsError}
                      </div>
                    )}

                    {/* Form fields */}
                    {!loadingClassOptions && !classOptionsError && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Years - Dropdown with checkboxes */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Years <span className="text-red-500">*</span>
                          </label>
                          <p className="text-xs text-slate-500 mb-2">
                            Semester is auto-determined based on the current academic year
                          </p>
                          <div className="relative" ref={yearDropdownRef}>
                            <button
                              type="button"
                              onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                              className="w-full px-4 py-2 text-left border border-slate-300 rounded-lg bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between"
                            >
                              <span className="text-sm text-slate-700 truncate">
                                {formData.years.length === 0
                                  ? 'Select Years...'
                                  : formData.years
                                      .map(yearVal => classOptions.years.find(y => y.value === yearVal)?.label)
                                      .filter(Boolean)
                                      .join(', ')}
                              </span>
                              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ml-2 ${yearDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {yearDropdownOpen && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                <div className="p-2 space-y-1">
                                  {classOptions.years.map((year) => (
                                    <label key={year.value} className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={formData.years.includes(year.value)}
                                        onChange={(e) => {
                                          const newYears = e.target.checked
                                            ? [...formData.years, year.value]
                                            : formData.years.filter(y => y !== year.value);

                                          // Filter sections based on new year selection
                                          const availableSectionIds = new Set(
                                            newYears.flatMap(y => classOptions.year_sections?.[y] || []).map(s => s.value)
                                          );
                                          const newSections = formData.sections.filter(s => availableSectionIds.has(s));

                                          // Semester will be determined automatically by backend
                                          setFormData({ ...formData, years: newYears, sections: newSections });
                                        }}
                                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                      />
                                      <span className="text-sm">{year.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sections - Dropdown with checkboxes (Filtered by Years) */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Sections (Optional)
                          </label>
                          <p className="text-xs text-slate-500 mb-2">
                            {isIQACUser
                              ? 'If not selected, feedback applies to all sections in the selected department(s) and year(s).'
                              : 'If not selected, feedback applies to all sections in the selected year(s).'}
                          </p>
                          <div className="relative" ref={sectionDropdownRef}>
                            <button
                              type="button"
                              onClick={() => setSectionDropdownOpen(!sectionDropdownOpen)}
                              disabled={!hasDepartmentSelectionForSections || formData.years.length === 0}
                              className={`w-full px-4 py-2 text-left border border-slate-300 rounded-lg bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between ${
                                (!hasDepartmentSelectionForSections || formData.years.length === 0) ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              <span className="text-sm text-slate-700 truncate">
                                {(!hasDepartmentSelectionForSections || formData.years.length === 0)
                                  ? 'Select department and year first'
                                  : sectionOptionsLoading
                                  ? 'Loading sections...'
                                  : formData.sections.length === 0
                                  ? 'Select Sections...'
                                      : formData.sections
                                          .map(secVal => {
                                        const section = getAvailableSections().find(s => s.value === secVal);
                                        return section ? (section.display_name || section.label) : null;
                                      })
                                      .filter(Boolean)
                                      .join(', ')}
                              </span>
                              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ml-2 ${sectionDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {sectionDropdownOpen && hasDepartmentSelectionForSections && formData.years.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                <div className="p-2 space-y-1">
                                  {getAvailableSections().map((sec) => (
                                    <label key={sec.value} className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={formData.sections.includes(sec.value)}
                                        onChange={(e) => {
                                          const newSections = e.target.checked
                                            ? [...formData.sections, sec.value]
                                            : formData.sections.filter(s => s !== sec.value);
                                          setFormData({ ...formData, sections: newSections });
                                        }}
                                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                      />
                                      <span className="text-sm">{sec.display_name || sec.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Subjects Preview (for Subject Feedback) */}
                {formData.type === 'SUBJECT_FEEDBACK' && ((!isIQACUser && formData.years.length > 0) || (isIQACUser && !allDepartmentsSelected && selectedDepartments.length === 1)) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      Subjects for Selected Year(s)
                    </h3>
                    
                    {loadingSubjects ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span className="ml-2 text-xs text-slate-600">Loading subjects...</span>
                      </div>
                    ) : subjectsByYear && subjectsByYear.total_subjects > 0 ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-slate-600">
                            Found <span className="font-semibold text-blue-700">{previewRegularSubjects.length}</span> core subject(s)
                            {previewElectiveCategories.length > 0 && (
                              <>
                                {' '}and <span className="font-semibold text-purple-700">{previewElectiveCategories.length}</span> elective categor{previewElectiveCategories.length === 1 ? 'y' : 'ies'}
                              </>
                            )}
                            {formData.sections.length > 0 && (
                              <span className="ml-1 text-slate-500">
                                • Filtered by {formData.sections.length} section(s)
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 mb-3">
                          Students will provide feedback for each of their assigned subjects.
                        </p>
                        <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-blue-100">
                          {/* Display Regular/Core Subjects */}
                          {previewRegularSubjects.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                                <div className="w-1 h-4 bg-blue-600 rounded"></div>
                                Core Subjects
                                <span className="text-xs text-slate-500 font-normal">({previewRegularSubjects.length})</span>
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {previewRegularSubjects.map((subject, index) => {
                                  const yearText = subject.years && subject.years.length > 0 
                                    ? subject.years.map((y: number) => `Y${y}`).join(', ')
                                    : '';
                                  
                                  return (
                                    <div 
                                      key={`regular-${index}`} 
                                      className="bg-white p-2 rounded border border-blue-200 hover:border-blue-300 transition-colors"
                                    >
                                      <div className="flex items-start justify-between gap-1">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {subject.subject_code && (
                                              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                                {subject.subject_code}
                                              </span>
                                            )}
                                            {yearText && (
                                              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                {yearText}
                                              </span>
                                            )}
                                          </div>
                                          <h4 className="text-xs font-medium text-slate-800 mt-1 line-clamp-1" title={subject.subject_name}>
                                            {subject.subject_name}
                                          </h4>
                                          <p className="text-xs text-slate-600 mt-0.5 line-clamp-1" title={subject.staff_names}>
                                            {subject.staff_names}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Elective Preview - Static headers only (visual, non-interactive) */}
                          <div>
                            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                              <div className="w-1 h-4 bg-purple-600 rounded"></div>
                              Elective Categories
                            </h4>
                            {previewElectiveCategories.length > 0 ? (
                              <div className="space-y-2">
                                {previewElectiveCategories.map((category, idx) => {
                                  const yearText = category.years && category.years.length > 0
                                    ? category.years.map((y: number) => `Y${y}`).join(', ')
                                    : 'All Years';
                                  const categoryTitle = String(category.display_name || category.category || '')
                                    .replace(/\s*\(?\d+\s+subjects?\)?$/i, '')
                                    .trim();

                                  return (
                                    <div
                                      key={`${category.category}-${idx}`}
                                      className="bg-purple-50 rounded-lg border border-purple-200 p-3"
                                    >
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <h5 className="text-sm font-semibold text-purple-800">{categoryTitle || category.category}</h5>
                                        <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded">{yearText}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div
                                className="bg-purple-50 rounded-lg border border-purple-200 p-3"
                              >
                                <h5 className="text-sm font-semibold text-purple-800">No elective categories for selected year(s)</h5>
                              </div>
                            )}
                          </div>

                          {/* Fallback: Display all subjects if new structure not available */}
                          {(!subjectsByYear.regular_subjects && !subjectsByYear.elective_categories) && subjectsByYear.subjects.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {subjectsByYear.subjects.map((subject, index) => {
                                const yearText = subject.years && subject.years.length > 0 
                                  ? subject.years.map((y: number) => `Y${y}`).join(', ')
                                  : '';
                                
                                return (
                                  <div 
                                    key={index} 
                                    className="bg-white p-2 rounded border border-blue-200 hover:border-blue-300 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {subject.subject_code && (
                                            <span className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                              {subject.subject_code}
                                            </span>
                                          )}
                                          {yearText && (
                                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                              {yearText}
                                            </span>
                                          )}
                                        </div>
                                        <h4 className="text-xs font-medium text-slate-800 mt-1 line-clamp-1" title={subject.subject_name}>
                                          {subject.subject_name}
                                        </h4>
                                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-1" title={subject.staff_names}>
                                          {subject.staff_names}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-3">
                        <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                        <p className="text-xs text-slate-600">
                          No subjects found for the selected year(s).
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Please ensure teaching assignments exist for this year.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Questions Section */}
                {formData.type && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800">Questions</h3>

                    {formData.type === 'SUBJECT_FEEDBACK' && (
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.common_comment_enabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFormData((prev) => ({
                                ...prev,
                                common_comment_enabled: checked,
                                questions: (prev.questions || []).map((q) => ({
                                  ...q,
                                  allow_comment: checked ? false : true,
                                })),
                              }));
                              setAllowComment(false);
                            }}
                            className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                          />
                          <div>
                            <p className="text-sm font-medium text-slate-800">Common Comment (Per Subject)</p>
                            <p className="text-xs text-slate-600 mt-0.5">
                              When enabled, students enter one overall comment per subject and per-question comments are disabled.
                            </p>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Existing questions */}
                    {formData.questions.length > 0 && (
                      <div className="space-y-3">
                        {formData.questions.map((q, index) => (
                          <div key={q.ui_id || q.id || index} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-sm font-medium text-slate-600">Q{index + 1}</span>
                                <div className="flex items-center gap-4">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={q.allow_rating}
                                      onChange={(e) => handleUpdateQuestionType(index, 'allow_rating', e.target.checked)}
                                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs text-slate-700 flex items-center gap-1.5">
                                      <Star className="w-4 h-4 text-current" aria-hidden="true" />
                                      Rating
                                    </span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={q.allow_comment}
                                      onChange={(e) => handleUpdateQuestionType(index, 'allow_comment', e.target.checked)}
                                      disabled={formData.common_comment_enabled}
                                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs text-slate-700 flex items-center gap-1.5">
                                      <MessageSquare className="w-4 h-4 text-current" aria-hidden="true" />
                                      Comment
                                    </span>
                                  </label>

                                  {(isIQACUser && formData.target_type === 'STUDENT') && (
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isOwnTypeEnabled(q)}
                                        onChange={() => handleToggleOwnType(index)}
                                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                                      />
                                      <span className="text-xs text-slate-700 flex items-center gap-1.5">
                                        <CircleDot className="w-4 h-4 text-current" aria-hidden="true" />
                                        Own Type
                                      </span>
                                    </label>
                                  )}
                                </div>
                              </div>

                              {questionResponseTypeErrors[getQuestionKey(q, index)] && (
                                <p className="text-xs text-red-600 mb-2">Select at least one response type.</p>
                              )}

                              <textarea
                                value={q.question}
                                onChange={(e) => handleUpdateQuestionText(index, e.target.value)}
                                onInput={handleTextareaInput}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2 resize-none overflow-hidden"
                                rows={2}
                              />

                              {(isIQACUser && formData.target_type === 'STUDENT' && isOwnTypeEnabled(q)) && (
                                <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-slate-700">Options (min 2)</p>
                                    <button
                                      type="button"
                                      onClick={() => handleAddOption(index)}
                                      className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                      Add Option
                                    </button>
                                  </div>

                                  <div className="space-y-2">
                                    {(q.options || []).map((opt, optIdx) => (
                                      <div key={opt.ui_id || opt.id || optIdx} className="flex items-center gap-2">
                                        <input
                                          value={opt.option_text}
                                          onChange={(e) => handleUpdateOptionText(index, optIdx, e.target.value)}
                                          placeholder={`Option ${optIdx + 1}`}
                                          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveOption(index, optIdx)}
                                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Remove option"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>

                                  {(q.options || []).length < 2 && (
                                    <p className="text-xs text-red-600 mt-2">At least 2 options are required.</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveQuestion(index)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new question */}
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Add Question
                      </label>
                      <div className="space-y-3">
                        <textarea
                          value={newQuestion}
                          onChange={(e) => setNewQuestion(e.target.value)}
                          onInput={handleTextareaInput}
                          placeholder="Enter your question..."
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none overflow-hidden"
                          rows={3}
                        />
                        <div className="flex items-center gap-4">
                          <label className="text-sm font-medium text-slate-700">Answer Type:</label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allowRating}
                              onChange={(e) => setAllowRating(e.target.checked)}
                              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700 flex items-center gap-1.5">
                              <Star className="w-4 h-4 text-current" aria-hidden="true" />
                              Star Rating (1-5)
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allowComment}
                              onChange={(e) => {
                                const nextChecked = e.target.checked;
                                if (!nextChecked && allowOwnType) {
                                  setAllowOwnType(false);
                                }
                                setAllowComment(nextChecked);
                              }}
                              disabled={formData.common_comment_enabled}
                              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700 flex items-center gap-1.5">
                              <MessageSquare className="w-4 h-4 text-current" aria-hidden="true" />
                              Text Comment
                            </span>
                          </label>

                          {(isIQACUser && formData.target_type === 'STUDENT') && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={allowOwnType}
                                onChange={(e) => {
                                  const nextChecked = e.target.checked;
                                  setAllowOwnType(nextChecked);
                                }}
                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700 flex items-center gap-1.5">
                                <CircleDot className="w-4 h-4 text-current" aria-hidden="true" />
                                Own Type
                              </span>
                            </label>
                          )}
                          <button
                            type="button"
                            onClick={handleAddQuestion}
                            disabled={!newQuestion.trim() || (!allowRating && !allowComment && !allowOwnType)}
                            className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Add Question
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status */}
                {formData.type && formData.questions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as 'DRAFT' | 'ACTIVE' })}
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="DRAFT">Save as Draft</option>
                      <option value="ACTIVE">Publish (Active)</option>
                    </select>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={submitting || !formData.type || formData.questions.length === 0 || (isIQACUser ? iqacSelectedDepartmentIds.length === 0 : !activeDepartment)}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      editingFormId ? 'Save Changes' : 'Create Feedback Form'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={submitting}
                    className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {!showCreateForm && !departmentLoading && (
              <p className="text-slate-600 text-sm">
                Click "New Form" to create a feedback form for your department.
              </p>
            )}
          </div>
        )}

        {/* HOD: View Created Forms */}
        {canDepartmentScopedCreate && !showCreateForm && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-semibold text-slate-800">Your Feedback Forms</h2>
              {canDepartmentScopedCreate && (
                <div className="flex items-center gap-2">
                  {(isIQACUser || canDepartmentScopedCreate) && (
                    <button
                      type="button"
                      onClick={openCommonExport}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Common Export
                    </button>
                  )}

                  {(isIQACUser || canDepartmentScopedCreate) && (
                    <button
                      type="button"
                      onClick={openSubjectWiseReportModal}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Subject Wise Report
                    </button>
                  )}

                  {(isIQACUser || canDepartmentScopedCreate) && (
                    <button
                      type="button"
                      onClick={openNonRespondersExport}
                      className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Not Respond List
                    </button>
                  )}

                  {canDepartmentScopedCreate && feedbackForms.some(f => f.status === 'DRAFT') && (
                    <button
                      type="button"
                      onClick={handlePublishAllForms}
                      disabled={publishingAllForms}
                      className="px-4 py-2 rounded-lg transition-colors text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {publishingAllForms ? 'Publishing...' : 'Publish All'}
                    </button>
                  )}

                  {(isIQACUser || canDepartmentScopedCreate) && (
                    <button
                      type="button"
                      onClick={handleDeactivateAllForms}
                      disabled={deactivatingAllForms}
                      className="px-4 py-2 rounded-lg transition-colors text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deactivatingAllForms ? 'Deactivating...' : 'Deactivate All'}
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {loadingForms ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
            ) : feedbackForms.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex p-4 bg-slate-100 rounded-full mb-4">
                  <MessageSquare className="w-12 h-12 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">No Forms Created Yet</h3>
                <p className="text-slate-600">
                  Click "New Form" above to create your first feedback form.
                </p>
              </div>
            ) : (
              <>
                {/* Separate active and deactivated forms */}
                {(() => {
                  const activeForms = feedbackForms.filter(f => f.active || f.status === 'DRAFT');
                  const deactivatedForms = feedbackForms.filter(f => !f.active && f.status === 'ACTIVE');
                  
                  return (
                    <>
                      {/* Active and Draft Forms */}
                      {activeForms.length > 0 && (
                        <div className="space-y-4 mb-6">
                          {activeForms.map((form) => {
                            const stats = responseStats[form.id];
                            const isDraft = form.status === 'DRAFT';
                            const isDeactivated = !form.active && form.status === 'ACTIVE';
                            
                            // Role-based visibility logic (exact spec)
                            const isIQAC = user?.roles?.includes('IQAC');
                            const isAdmin = user?.roles?.includes('ADMIN');
                            const isHOD = user?.roles?.includes('HOD');
                            const isOwner = form.created_by === user?.id;
                            
                            // Permissions
                            const canView = isIQAC || isAdmin || isOwner || (isHOD && form.allow_hod_view);
                            const canExport = canView; // Same as canView
                            const canEdit = isIQAC || isAdmin || isOwner;
                            
                            // Hide card if HOD and not allowed to view
                            if (isHOD && !canView && !isOwner) {
                              return null;
                            }
                            
                            return (
                              <div
                                key={form.id}
                                className={`p-5 border-2 rounded-lg transition-all ${
                                  isDeactivated
                                    ? 'border-slate-300 bg-slate-100 opacity-60' 
                                    : form.active 
                                    ? 'border-slate-200 hover:border-indigo-300 hover:shadow-md bg-white' 
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                      <h3 className={`text-lg font-semibold ${
                                        isDeactivated ? 'text-slate-500' : 'text-slate-800'
                                      }`}>
                                        {form.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Common Feedback'}
                                      </h3>
                                      <span className={`text-xs px-2 py-1 rounded-full ${
                                        form.type === 'SUBJECT_FEEDBACK' 
                                          ? 'bg-green-100 text-green-800' 
                                          : 'bg-blue-100 text-blue-800'
                                      }`}>
                                        {form.type === 'SUBJECT_FEEDBACK' ? 'About Subjects' : 'General'}
                                      </span>
                                      {/* Status Badge */}
                                      {isDraft ? (
                                        <span className="text-xs px-2 py-1 rounded-full bg-slate-400 text-white font-medium">
                                          Draft
                                        </span>
                                      ) : form.status === 'ACTIVE' && form.active ? (
                                        <span className="text-xs px-2 py-1 rounded-full bg-green-500 text-white font-medium">
                                          Active
                                        </span>
                                      ) : null}
                                      {isDeactivated && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-red-500 text-white font-medium">
                                          Deactivated
                                        </span>
                                      )}
                                      {/* Anonymous Badge */}
                                      {form.anonymous && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                                          Anonymous
                                        </span>
                                      )}
                                    </div>
                                    {/* Form Name Display */}
                                    {form.form_name && (
                                      <p className={`text-sm font-medium mb-3 ${
                                        isDeactivated ? 'text-slate-400' : 'text-slate-700'
                                      }`}>
                                        {form.form_name}
                                      </p>
                                    )}
                                    <div className={`flex items-center gap-4 text-sm mb-3 ${
                                      isDeactivated ? 'text-slate-500' : 'text-slate-600'
                                    }`}>
                                      <span className="flex items-start gap-1">
                                        <Users className="w-4 h-4 mt-0.5" />
                                        <span className="leading-tight">
                                          {getClassContextLines(form).map((line, idx) => (
                                            <span key={`${form.id}-ctx-${idx}`} className="block">
                                              {line}
                                            </span>
                                          ))}
                                        </span>
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <FileText className="w-4 h-4" />
                                        {form.questions.length} questions
                                      </span>
                                      <span className={isDeactivated ? 'text-slate-400' : 'text-slate-400'}>
                                        {new Date(form.created_at).toLocaleDateString()}
                                      </span>
                                    </div>
                                    {/* Response Statistics */}
                                    {isDraft ? (
                                      <div className="flex items-center gap-2 text-sm">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                                          <span className="text-slate-600 font-semibold">
                                            Responses: 0
                                          </span>
                                          <span className="text-slate-500 text-xs">
                                            (Draft - not visible to users)
                                          </span>
                                        </div>
                                      </div>
                                    ) : stats && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                                          isDeactivated 
                                            ? 'bg-slate-200 border border-slate-300' 
                                            : 'bg-indigo-50 border border-indigo-200'
                                        }`}>
                                          <span className={`font-semibold ${
                                            isDeactivated ? 'text-slate-600' : 'text-indigo-700'
                                          }`}>
                                            Responses: {stats.response_count} / {stats.expected_count}
                                          </span>
                                          <span className={isDeactivated ? 'text-slate-500' : 'text-indigo-600'}>
                                            ({stats.percentage}%)
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-2">
                                    {isDraft && (
                                      <button
                                        onClick={() => handleEditForm(form)}
                                        className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-sm font-medium flex items-center gap-2"
                                      >
                                        <Pencil className="w-4 h-4" />
                                        Edit
                                      </button>
                                    )}

                                    {/* Publish Button (only for draft) */}
                                    {isDraft && (
                                      <button
                                        onClick={() => handlePublishForm(form.id)}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                        Publish
                                      </button>
                                    )}
                                    
                                    {/* View Responses Button */}
                                    {!isDraft && form.active && canView && (
                                      <button
                                        onClick={() => handleViewResponses(form.id)}
                                        disabled={loadingResponseView}
                                        className={`px-4 py-2 text-white rounded-lg transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700`}
                                      >
                                        {loadingResponseView ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <FileText className="w-4 h-4" />
                                        )}
                                        {loadingResponseView ? 'Loading...' : 'View Responses'}
                                      </button>
                                    )}

                                    {/* Export Responses (published forms only) */}
                                    {/* HOD can export their own forms and IQAC forms with allow_hod_view=true */}
                                    {/* IQAC uses "Common Export" header button instead */}
                                    {!isDraft && form.active && canExport && !isIQACUser && (
                                      <button
                                        onClick={() => handleExportResponsesExcel(form.id)}
                                        disabled={exportingFormId === form.id}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {exportingFormId === form.id ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <Download className="w-4 h-4" />
                                        )}
                                        {exportingFormId === form.id ? 'Exporting...' : 'Export'}
                                      </button>
                                    )}
                                    
                                    {/* Allow HOD View Toggle (only for IQAC/Admin and student feedback, not draft) */}
                                    {!isDraft && canEdit && form.target_type === 'STUDENT' && (
                                      <button
                                        onClick={() => handleToggleAllowHODView(form.id)}
                                        className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                                          form.allow_hod_view
                                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                        title={form.allow_hod_view ? 'Disable HOD access to responses' : 'Enable HOD access to responses'}
                                      >
                                        <CircleDot className="w-4 h-4" />
                                        HOD View: {form.allow_hod_view ? 'ON' : 'OFF'}
                                      </button>
                                    )}
                                    
                                    {/* Activate/Deactivate (only owners/IQAC, not HOD viewing IQAC feedback) */}
                                    {!isDraft && canEdit && (
                                      <button
                                        onClick={() => handleToggleActive(form.id)}
                                        className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                                          form.active
                                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                                        }`}
                                      >
                                        {form.active ? 'Deactivate' : 'Activate'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {/* Deactivated Forms Accordion */}
                      {deactivatedForms.length > 0 && (
                        <div className="border-t border-slate-200 pt-4">
                          <button
                            onClick={() => setShowDeactivatedForms(!showDeactivatedForms)}
                            className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-700">
                                Deactivated Feedback Forms
                              </span>
                              <span className="px-2 py-0.5 bg-slate-300 text-slate-700 text-xs rounded-full font-semibold">
                                {deactivatedForms.length}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isIQACUser && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleActivateAllForms();
                                  }}
                                  disabled={activatingAllForms}
                                  className="px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {activatingAllForms ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Activating...
                                    </span>
                                  ) : (
                                    'Activate All'
                                  )}
                                </button>
                              )}

                              {canDepartmentScopedCreate && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteAllDeactivated();
                                  }}
                                  disabled={deletingAllDeactivated}
                                  className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                  {deletingAllDeactivated ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Deleting...
                                    </span>
                                  ) : (
                                    <>
                                      <Trash2 className="w-4 h-4" />
                                      Delete All
                                    </>
                                  )}
                                </button>
                              )}

                              <ChevronDown
                                className={`w-5 h-5 text-slate-600 transition-transform ${
                                  showDeactivatedForms ? 'transform rotate-180' : ''
                                }`}
                              />
                            </div>
                          </button>
                          
                          {showDeactivatedForms && (
                            <div className="mt-4 space-y-4">
                              {deactivatedForms.map((form) => {
                                const stats = responseStats[form.id];
                                const isDraft = form.status === 'DRAFT';
                                const isDeactivated = !form.active && form.status === 'ACTIVE';
                                
                                // Role-based visibility logic (same as active forms)
                                const isIQAC = user?.roles?.includes('IQAC');
                                const isAdmin = user?.roles?.includes('ADMIN');
                                const isHOD = user?.roles?.includes('HOD');
                                const isOwner = form.created_by === user?.id;
                                
                                const canView = isIQAC || isAdmin || isOwner || (isHOD && form.allow_hod_view);
                                const canExport = canView;
                                const canEdit = isIQAC || isAdmin || isOwner;
                                
                                return (
                                  <div
                                    key={form.id}
                                    className="p-5 border-2 border-slate-300 bg-slate-100 opacity-60 rounded-lg transition-all"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <h3 className="text-lg font-semibold text-slate-500">
                                            {form.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Common Feedback'}
                                          </h3>
                                          <span className={`text-xs px-2 py-1 rounded-full ${
                                            form.type === 'SUBJECT_FEEDBACK' 
                                              ? 'bg-green-100 text-green-800' 
                                              : 'bg-blue-100 text-blue-800'
                                          }`}>
                                            {form.type === 'SUBJECT_FEEDBACK' ? 'About Subjects' : 'General'}
                                          </span>
                                          <span className="text-xs px-2 py-1 rounded-full bg-red-500 text-white font-medium">
                                            Deactivated
                                          </span>
                                        </div>
                                        {/* Form Name Display */}
                                        {form.form_name && (
                                          <p className="text-sm font-medium mb-3 text-slate-400">
                                            {form.form_name}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-4 text-sm mb-3 text-slate-500">
                                          <span className="flex items-start gap-1">
                                            <Users className="w-4 h-4 mt-0.5" />
                                            <span className="leading-tight">
                                              {getClassContextLines(form).map((line, idx) => (
                                                <span key={`${form.id}-deact-ctx-${idx}`} className="block">
                                                  {line}
                                                </span>
                                              ))}
                                            </span>
                                          </span>
                                          <span className="flex items-center gap-1">
                                            <FileText className="w-4 h-4" />
                                            {form.questions.length} questions
                                          </span>
                                          <span className="text-slate-400">
                                            {new Date(form.created_at).toLocaleDateString()}
                                          </span>
                                        </div>
                                        {/* Response Statistics */}
                                        {stats && (
                                          <div className="flex items-center gap-2 text-sm">
                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 border border-slate-300 rounded-lg">
                                              <span className="text-slate-600 font-semibold">
                                                Responses: {stats.response_count} / {stats.expected_count}
                                              </span>
                                              <span className="text-slate-500">
                                                ({stats.percentage}%)
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {/* Action Buttons */}
                                      <div className="flex items-center gap-2">
                                        {canView && (
                                          <button
                                            onClick={() => handleViewResponses(form.id)}
                                            disabled={loadingResponseView}
                                            className="px-4 py-2 bg-slate-400 text-white rounded-lg hover:bg-slate-500 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            {loadingResponseView ? (
                                              <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                              <FileText className="w-4 h-4" />
                                            )}
                                            {loadingResponseView ? 'Loading...' : 'View Responses'}
                                          </button>
                                        )}

                                        {canExport && !isIQACUser && (
                                          <button
                                            onClick={() => handleExportResponsesExcel(form.id)}
                                            disabled={exportingFormId === form.id}
                                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            {exportingFormId === form.id ? (
                                              <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                              <Download className="w-4 h-4" />
                                            )}
                                            {exportingFormId === form.id ? 'Exporting...' : 'Export'}
                                          </button>
                                        )}

                                        {canEdit && (
                                          <button
                                            onClick={() => handleToggleActive(form.id)}
                                            className="px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors text-sm font-medium"
                                          >
                                            Activate
                                          </button>
                                        )}

                                        {canEdit && (
                                          <button
                                            onClick={() => handleDeleteFeedback(form.id)}
                                            className="p-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors"
                                            title="Delete feedback form"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* IQAC Common Export Modal */}
        {commonExportOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">
                  {commonExportMode === 'DEACTIVATE'
                    ? 'Deactivate Feedback Forms'
                    : commonExportMode === 'ACTIVATE'
                      ? 'Activate Feedback Forms'
                      : commonExportMode === 'NON_RESPONDERS'
                        ? 'Not Respond List'
                        : 'Common Export'}
                </h3>
                <button
                  type="button"
                  onClick={closeCommonExport}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {commonExportError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                    <span>{commonExportError}</span>
                  </div>
                )}

                {commonExportLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Select Departments</label>
                      <div ref={commonExportDeptDropdownRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setCommonExportDeptDropdownOpen((v) => !v)}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between"
                        >
                          <span className="text-sm text-slate-700">{getCommonExportDepartmentSummary()}</span>
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${commonExportDeptDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {commonExportDeptDropdownOpen && (
                          <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-h-60 overflow-auto">
                            <label className="flex items-center gap-2 text-sm text-slate-700 select-none mb-2">
                              <input
                                type="checkbox"
                                checked={commonExportAllDepartments}
                                onChange={(e) => {
                                  const next = e.target.checked;
                                  if (next) {
                                    const allIds = (commonExportOptions?.departments || []).map((d) => d.id);
                                    setCommonExportAllDepartments(true);
                                    setCommonExportSelectedDepartmentIds(allIds);
                                  } else {
                                    setCommonExportAllDepartments(false);
                                    setCommonExportSelectedDepartmentIds([]);
                                  }
                                }}
                                className="h-4 w-4 accent-indigo-600"
                              />
                              <span className="font-medium">All Departments</span>
                            </label>

                            {(commonExportOptions?.departments || []).length === 0 ? (
                              <p className="text-sm text-slate-500 px-2 py-1">No departments available.</p>
                            ) : (
                              <div className="space-y-2">
                                {(commonExportOptions?.departments || []).map((d) => {
                                  const label = d.short_name || d.code || d.name;
                                  const checked = commonExportSelectedDepartmentIds.includes(d.id) || commonExportAllDepartments;
                                  return (
                                    <label
                                      key={d.id}
                                      className="flex items-center gap-2 text-sm text-slate-700 px-2 py-1 rounded hover:bg-slate-50 select-none cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleCommonExportDepartmentId(d.id)}
                                        className="h-4 w-4 accent-indigo-600"
                                      />
                                      <span>{label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Select Years</label>
                      <div ref={commonExportYearDropdownRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setCommonExportYearDropdownOpen((v) => !v)}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between"
                        >
                          <span className="text-sm text-slate-700">{getCommonExportYearSummary()}</span>
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${commonExportYearDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {commonExportYearDropdownOpen && (
                          <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-h-60 overflow-auto">
                            <label className="flex items-center gap-2 text-sm text-slate-700 select-none mb-2">
                              <input
                                type="checkbox"
                                checked={commonExportAllYears}
                                onChange={(e) => {
                                  const next = e.target.checked;
                                  if (next) {
                                    setCommonExportAllYears(true);
                                    setCommonExportSelectedYears(commonExportYears);
                                  } else {
                                    setCommonExportAllYears(false);
                                    setCommonExportSelectedYears([]);
                                  }
                                }}
                                className="h-4 w-4 accent-indigo-600"
                              />
                              <span className="font-medium">All Years</span>
                            </label>

                            {commonExportYearsLoading ? (
                              <p className="text-sm text-slate-500 px-2 py-1">Loading years...</p>
                            ) : commonExportYears.length === 0 ? (
                              <p className="text-sm text-slate-500 px-2 py-1">No years available.</p>
                            ) : (
                              <div className="space-y-2">
                                {commonExportYears.map((y) => {
                                  const checked = commonExportSelectedYears.includes(y) || commonExportAllYears;
                                  return (
                                    <label
                                      key={y}
                                      className="flex items-center gap-2 text-sm text-slate-700 px-2 py-1 rounded hover:bg-slate-50 select-none cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleCommonExportYearValue(y)}
                                        className="h-4 w-4 accent-indigo-600"
                                      />
                                      <span>Year {y}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="p-5 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCommonExport}
                  disabled={commonExportDownloading || deactivatingAllForms || activatingAllForms}
                  className="px-5 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={
                    commonExportMode === 'DEACTIVATE'
                      ? handleDeactivateFilteredForms
                      : commonExportMode === 'ACTIVATE'
                        ? handleActivateFilteredForms
                        : commonExportMode === 'NON_RESPONDERS'
                          ? handleDownloadNonRespondersExport
                          : handleDownloadCommonExport
                  }
                  disabled={commonExportLoading || commonExportDownloading || deactivatingAllForms || activatingAllForms}
                  className={`${commonExportMode === 'DEACTIVATE' ? 'bg-red-600 hover:bg-red-700' : commonExportMode === 'NON_RESPONDERS' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-emerald-600 hover:bg-emerald-700'} px-5 py-2 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2`}
                >
                  {(commonExportMode === 'DEACTIVATE'
                    ? deactivatingAllForms
                    : commonExportMode === 'ACTIVATE'
                      ? activatingAllForms
                      : commonExportDownloading) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : commonExportMode === 'DEACTIVATE' ? (
                    <X className="w-4 h-4" />
                  ) : commonExportMode === 'ACTIVATE' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {commonExportMode === 'DEACTIVATE'
                    ? (deactivatingAllForms ? 'Deactivating...' : 'Deactivate')
                    : commonExportMode === 'ACTIVATE'
                      ? (activatingAllForms ? 'Activating...' : 'Activate')
                      : commonExportMode === 'NON_RESPONDERS'
                        ? (commonExportDownloading ? 'Downloading...' : 'Download')
                        : (commonExportDownloading ? 'Exporting...' : 'Export')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Publish All Confirmation Modal */}
        {showPublishAllConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Publish All Draft Forms</h3>
                <button
                  type="button"
                  onClick={closePublishAllConfirm}
                  disabled={publishingAllForms}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-slate-700">
                  Are you sure you want to publish all draft feedback forms?
                </p>
                <p className="text-sm text-slate-600">
                  This will change all draft forms to active status and make them visible to students and staff.
                </p>
              </div>

              <div className="p-5 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closePublishAllConfirm}
                  disabled={publishingAllForms}
                  className="px-5 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePublishAllConfirm}
                  disabled={publishingAllForms}
                  className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {publishingAllForms ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {publishingAllForms ? 'Publishing...' : 'Publish All'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDeleteAllDeactivatedConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Delete All Feedback Forms</h3>
                <button
                  type="button"
                  onClick={closeDeleteAllDeactivatedConfirm}
                  disabled={deletingAllDeactivated}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-slate-700">
                  Are you sure you want to permanently delete all deactivated feedback forms?
                </p>
                <p className="text-sm text-red-600 font-medium">
                  This action cannot be undone.
                </p>
              </div>

              <div className="p-5 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDeleteAllDeactivatedConfirm}
                  disabled={deletingAllDeactivated}
                  className="px-5 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAllDeactivatedConfirm}
                  disabled={deletingAllDeactivated}
                  className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {deletingAllDeactivated ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {deletingAllDeactivated ? 'Deleting...' : 'Delete All'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Subject Wise Report Modal */}
        {subjectWiseReportOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Subject Wise Report</h3>
                <button
                  type="button"
                  onClick={closeSubjectWiseReport}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {subjectWiseReportError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                    <span>{subjectWiseReportError}</span>
                  </div>
                )}

                {subjectWiseReportLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Select Departments</label>
                      <div ref={subjectWiseReportDeptDropdownRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setSubjectWiseReportDeptDropdownOpen((v) => !v)}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between"
                        >
                          <span className="text-sm text-slate-700">{getSubjectWiseReportDepartmentSummary()}</span>
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${subjectWiseReportDeptDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {subjectWiseReportDeptDropdownOpen && (
                          <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-h-60 overflow-auto">
                            <label className="flex items-center gap-2 text-sm text-slate-700 select-none mb-2">
                              <input
                                type="checkbox"
                                checked={subjectWiseReportAllDepartments}
                                onChange={(e) => {
                                  const next = e.target.checked;
                                  if (next) {
                                    const allIds = (subjectWiseReportOptions?.departments || []).map((d) => d.id);
                                    setSubjectWiseReportAllDepartments(true);
                                    setSubjectWiseReportSelectedDepartmentIds(allIds);
                                  } else {
                                    setSubjectWiseReportAllDepartments(false);
                                    setSubjectWiseReportSelectedDepartmentIds([]);
                                  }
                                }}
                                className="h-4 w-4 accent-indigo-600"
                              />
                              <span className="font-medium">All Departments</span>
                            </label>

                            {(subjectWiseReportOptions?.departments || []).length === 0 ? (
                              <p className="text-sm text-slate-500 px-2 py-1">No departments available.</p>
                            ) : (
                              <div className="space-y-2">
                                {(subjectWiseReportOptions?.departments || []).map((d) => {
                                  const label = d.short_name || d.code || d.name;
                                  const checked = subjectWiseReportSelectedDepartmentIds.includes(d.id) || subjectWiseReportAllDepartments;
                                  return (
                                    <label
                                      key={d.id}
                                      className="flex items-center gap-2 text-sm text-slate-700 px-2 py-1 rounded hover:bg-slate-50 select-none cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleSubjectWiseReportDepartmentId(d.id)}
                                        className="h-4 w-4 accent-indigo-600"
                                      />
                                      <span>{label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Select Years</label>
                      <div ref={subjectWiseReportYearDropdownRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setSubjectWiseReportYearDropdownOpen((v) => !v)}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between"
                        >
                          <span className="text-sm text-slate-700">{getSubjectWiseReportYearSummary()}</span>
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${subjectWiseReportYearDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {subjectWiseReportYearDropdownOpen && (
                          <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-h-60 overflow-auto">
                            <label className="flex items-center gap-2 text-sm text-slate-700 select-none mb-2">
                              <input
                                type="checkbox"
                                checked={subjectWiseReportAllYears}
                                onChange={(e) => {
                                  const next = e.target.checked;
                                  if (next) {
                                    setSubjectWiseReportAllYears(true);
                                    setSubjectWiseReportSelectedYears(subjectWiseReportYears);
                                  } else {
                                    setSubjectWiseReportAllYears(false);
                                    setSubjectWiseReportSelectedYears([]);
                                  }
                                }}
                                className="h-4 w-4 accent-indigo-600"
                              />
                              <span className="font-medium">All Years</span>
                            </label>

                            {subjectWiseReportYears.length === 0 ? (
                              <p className="text-sm text-slate-500 px-2 py-1">No years available.</p>
                            ) : (
                              <div className="space-y-2">
                                {subjectWiseReportYears.map((y) => {
                                  const checked = subjectWiseReportSelectedYears.includes(y) || subjectWiseReportAllYears;
                                  return (
                                    <label
                                      key={y}
                                      className="flex items-center gap-2 text-sm text-slate-700 px-2 py-1 rounded hover:bg-slate-50 select-none cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleSubjectWiseReportYearValue(y)}
                                        className="h-4 w-4 accent-indigo-600"
                                      />
                                      <span>Year {y}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  </>
                )}
              </div>

              <div className="p-5 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeSubjectWiseReport}
                  disabled={subjectWiseReportDownloading}
                  className="px-5 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSubjectWiseReport}
                  disabled={subjectWiseReportLoading || subjectWiseReportDownloading}
                  className="bg-blue-600 hover:bg-blue-700 px-5 py-2 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {subjectWiseReportDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {subjectWiseReportDownloading ? 'Generating...' : 'Download'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Response List Modal (HOD) */}
        {(selectedResponseView || responseViewError) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              {responseViewError ? (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-red-700">Error Loading Responses</h2>
                    <button
                      onClick={() => {
                        setResponseViewError(null);
                        setSelectedResponseView(null);
                      }}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <X className="w-6 h-6 text-slate-600" />
                    </button>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                    <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <p className="text-red-800">{responseViewError}</p>
                  </div>
                </div>
              ) : selectedResponseView ? (
                <>
              <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Response Details</h2>
                  {selectedResponseView.form_name && (
                    <p className="text-sm font-medium text-slate-700 mt-1">
                      Form: {selectedResponseView.form_name}
                    </p>
                  )}
                  {getClassContextLines(selectedResponseView).map((line, idx) => (
                    <p key={`resp-ctx-${idx}`} className="text-xs text-slate-600 mt-1">{line}</p>
                  ))}
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span className="flex items-center gap-1.5 text-green-700 font-semibold">
                      <CheckCircle className="w-4 h-4" />
                      {selectedResponseView.total_responded} Responded
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="flex items-center gap-1.5 text-red-700 font-semibold">
                      <AlertCircle className="w-4 h-4" />
                      {selectedResponseView.total_non_responded} Pending
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600 font-medium">
                      Total: {selectedResponseView.total_students}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedResponseView(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-slate-600" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Responded Users */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    {selectedResponseView.target_type === 'STUDENT' ? 'Students' : 'Staff'} Who Responded ({selectedResponseView.total_responded})
                  </h3>
                  {selectedResponseView.responded && selectedResponseView.responded.length > 0 ? (
                    <div className="max-h-[450px] overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100 hover:scrollbar-thumb-slate-400">
                      {selectedResponseView.responded.map((resp) => {
                        // Check if this is subject feedback by looking if any answer has teaching_assignment
                        const isSubjectFeedback = resp.answers.some(a => a.teaching_assignment);
                        
                        if (isSubjectFeedback) {
                          // Group answers by teaching assignment
                          const subjectGroups = resp.answers.reduce((acc, answer) => {
                            if (!answer.teaching_assignment) return acc;
                            
                            const taId = answer.teaching_assignment.teaching_assignment_id;
                            if (!acc[taId]) {
                              acc[taId] = {
                                teaching_assignment_id: taId,
                                subject_name: answer.teaching_assignment.subject_name || 'Unknown Subject',
                                subject_code: answer.teaching_assignment.subject_code,
                                staff_name: answer.teaching_assignment.staff_name || 'Unknown Staff',
                                answers: []
                              };
                            }
                            acc[taId].answers.push(answer);
                            return acc;
                          }, {} as Record<number, {
                            teaching_assignment_id: number;
                            subject_name: string;
                            subject_code: string | null;
                            staff_name: string;
                            answers: typeof resp.answers;
                          }>);
                          
                          const subjects = Object.values(subjectGroups);
                          
                          return (
                            <div key={resp.user_id} className="bg-green-50 border border-green-200 rounded-lg p-3">
                              {/* User Header */}
                              <div className="flex items-center justify-between mb-3 pb-2 border-b border-green-200">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                                    {resp.user_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-800 text-sm">
                                      {resp.user_name}
                                      {resp.register_number && (
                                        <span className="text-slate-600 font-normal ml-1 text-xs">({resp.register_number})</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500">
                                  {new Date(resp.submitted_at).toLocaleDateString()}
                                </p>
                              </div>
                              
                              {/* Subject Cards in 3-column grid */}
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {subjects.map((subject) => (
                                  <div key={subject.teaching_assignment_id} className="bg-white border border-green-300 rounded-md p-2.5 shadow-sm">
                                    {/* Subject Header */}
                                    <div className="mb-2 pb-1.5 border-b border-slate-200">
                                      <p className="text-xs font-bold text-slate-800 leading-tight truncate" title={subject.subject_name}>
                                        {subject.subject_name}
                                      </p>
                                      {subject.subject_code && (
                                        <p className="text-[10px] text-slate-500 font-medium">{subject.subject_code}</p>
                                      )}
                                      <p className="text-[10px] text-green-700 font-medium flex items-center gap-1 mt-0.5">
                                        <span className="inline-block w-1 h-1 rounded-full bg-green-600"></span>
                                        {subject.staff_name}
                                      </p>
                                    </div>
                                    
                                    {/* Questions and Answers */}
                                    <div className="space-y-1.5">
                                      {(() => {
                                        const hasQuestionWiseComments = subject.answers.some(
                                          (a) => String(a.question_comment ?? a.answer_text ?? '').trim() !== ''
                                        );
                                        const overallCommentOnce = hasQuestionWiseComments
                                          ? ''
                                          : String(
                                              subject.answers.find(
                                                (a) => String(a.common_comment ?? '').trim() !== ''
                                              )?.common_comment ?? ''
                                            ).trim();

                                        return (
                                          <>
                                      {subject.answers.map((answer, idx) => (
                                        <div key={idx} className="text-[10px]">
                                          <p className="text-slate-700 font-medium mb-0.5 leading-tight">{answer.question_text}</p>
                                          {(() => {
                                            const questionComment = String(answer.question_comment ?? answer.answer_text ?? '').trim();
                                            const selectedOption = String(answer.selected_option ?? answer.selected_option_text ?? '').trim();
                                            return (
                                              <>
                                          
                                          {/* Star rating */}
                                          {answer.answer_star !== null && answer.answer_star !== undefined && (
                                            <div className="flex items-center gap-0.5 mb-0.5">
                                              {[1, 2, 3, 4, 5].map((star) => (
                                                <Star
                                                  key={star}
                                                  className={`w-2.5 h-2.5 ${
                                                    star <= (answer.answer_star || 0)
                                                      ? 'fill-yellow-400 text-yellow-400'
                                                      : 'text-slate-300'
                                                  }`}
                                                />
                                              ))}
                                              <span className="ml-0.5 text-[10px] text-slate-600 font-medium">({answer.answer_star}/5)</span>
                                            </div>
                                          )}
                                          
                                          {/* Question-wise comment */}
                                          {questionComment !== '' && (
                                            <p className="text-[10px] text-slate-600 bg-slate-50 p-1 rounded border border-slate-200 italic leading-snug">
                                              <span className="not-italic font-semibold">Comment:</span> {questionComment}
                                            </p>
                                          )}

                                          {/* Radio selected option (Own Type / Radio questions) */}
                                          {selectedOption !== '' && (
                                            <p className="text-[10px] text-slate-700 mt-0.5">
                                              <span className="font-semibold">Selected Option:</span> {selectedOption}
                                            </p>
                                          )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                      ))}

                                      {/* Show overall comment once per subject, only when question-wise comments are absent */}
                                      {overallCommentOnce !== '' && (
                                        <div className="text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200 leading-snug">
                                          <span className="font-semibold">Overall Comment:</span> {overallCommentOnce}
                                        </div>
                                      )}
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        } else {
                          // Original display for non-subject feedback
                          return (
                            <div key={resp.user_id} className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                                    {isAnonymous ? '●' : resp.user_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="leading-tight">
                                    <p className="font-semibold text-slate-800 text-xs">
                                      {isAnonymous ? 'Anonymous Responder' : resp.user_name}
                                      {!isAnonymous && resp.register_number && (
                                        <span className="text-slate-600 font-normal ml-1 text-xs">({resp.register_number})</span>
                                      )}
                                    </p>
                                    {isAnonymous && (
                                      <span className="text-xs px-1 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium inline-block mt-0.5">
                                        Anonymous
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right text-xs text-slate-500 leading-tight">
                                  <p className="font-medium text-green-700 text-xs">
                                    {new Date(resp.submitted_at).toLocaleDateString()} {new Date(resp.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-1.5 pl-2 border-l-2 border-green-300 ml-7">
                                {(() => {
                                  const hasQuestionWiseComments = resp.answers.some(
                                    (a) => String(a.question_comment ?? a.answer_text ?? '').trim() !== ''
                                  );
                                  const overallCommentOnce = hasQuestionWiseComments
                                    ? ''
                                    : String(
                                        resp.answers.find(
                                          (a) => String(a.common_comment ?? '').trim() !== ''
                                        )?.common_comment ?? ''
                                      ).trim();

                                  return (
                                    <>
                                {resp.answers.map((answer, idx) => (
                                  <div key={idx} className="pl-2">
                                    <p className="text-xs text-slate-700 font-medium mb-0.5">{answer.question_text}</p>
                                    {(() => {
                                      const questionComment = String(answer.question_comment ?? answer.answer_text ?? '').trim();
                                      const selectedOption = String(answer.selected_option ?? answer.selected_option_text ?? '').trim();
                                      return (
                                        <>
                                    
                                    {/* Display star rating if provided */}
                                    {answer.answer_star !== null && answer.answer_star !== undefined && (
                                      <div className="flex items-center gap-1 mb-0.5">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <Star
                                            key={star}
                                            className={`w-3.5 h-3.5 ${
                                              star <= (answer.answer_star || 0)
                                                ? 'fill-yellow-400 text-yellow-400'
                                                : 'text-slate-300'
                                            }`}
                                          />
                                        ))}
                                        <span className="ml-1 text-xs text-slate-600 font-medium">({answer.answer_star}/5)</span>
                                      </div>
                                    )}
                                    
                                    {/* Display question-wise comment if provided */}
                                    {questionComment !== '' && (
                                      <p className="text-xs text-slate-700 bg-white p-1.5 rounded border border-slate-200 leading-snug">
                                        <span className="font-semibold">Comment:</span> {questionComment}
                                      </p>
                                    )}

                                    {/* Display radio selected option if provided */}
                                    {selectedOption !== '' && (
                                      <p className="text-xs text-slate-700 mt-1">
                                        <span className="font-semibold">Selected Option:</span> {selectedOption}
                                      </p>
                                    )}
                                    
                                    {/* Show message if neither rating nor comment provided */}
                                    {(!answer.answer_star || answer.answer_star === 0) && questionComment === '' && selectedOption === '' && (
                                      <p className="text-xs text-slate-400 italic">(No response provided)</p>
                                    )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                ))}

                                {/* Show overall comment once per respondent, only when question-wise comments are absent */}
                                {overallCommentOnce !== '' && (
                                  <div className="pl-2">
                                    <p className="text-xs text-slate-700 bg-white p-1.5 rounded border border-slate-200 leading-snug">
                                      <span className="font-semibold">Overall Comment:</span> {overallCommentOnce}
                                    </p>
                                  </div>
                                )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        }
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
                      <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No responses submitted yet</p>
                    </div>
                  )}
                </div>

                {/* Non-Responders */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    {selectedResponseView.target_type === 'STUDENT' ? 'Students' : 'Staff'} Who Haven't Responded ({selectedResponseView.total_non_responded})
                  </h3>
                  {selectedResponseView.non_responders && selectedResponseView.non_responders.length > 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                      <div className="max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100 hover:scrollbar-thumb-slate-400">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {selectedResponseView.non_responders.map((nonResp) => (
                          <div key={nonResp.user_id} className="p-1.5 bg-white border border-red-200 rounded flex items-center gap-2 hover:shadow-sm transition-shadow">
                            <div className="w-7 h-7 bg-red-600 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                              {nonResp.user_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0 leading-tight">
                              <p className="text-xs font-semibold text-slate-800 truncate">{nonResp.user_name}</p>
                              {nonResp.register_number && (
                                <p className="text-xs text-slate-600">{nonResp.register_number}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        </div>
                      </div>
                    </div>
                  ) : selectedResponseView.total_students > 0 ? (
                    <div className="text-center py-8 bg-green-50 rounded-lg border border-green-200">
                      <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">Great! Everyone has responded</p>
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-yellow-50 rounded-lg border border-yellow-200">
                      <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">No students/staff matched the filters</p>
                    </div>
                  )}
                </div>
              </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Permission-based info card */}
        {!canDepartmentScopedCreate && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Your Access</h3>
                <ul className="space-y-2 text-slate-600">
                  {canReplyFeedback && (
                    <li className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>You can respond to feedback forms</span>
                    </li>
                  )}
                  {!canReplyFeedback && (
                    <li className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>You can view feedback forms</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Response success message */}
        {responseSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <span className="text-green-800 font-medium">Feedback Submitted Successfully</span>
          </div>
        )}

        {/* Staff/Student: View and Respond to Forms */}
        {canReplyFeedback && !canDepartmentScopedCreate && !selectedForm && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">Available Feedback Forms</h2>

            {toastMessage && (
              <div className="mb-4 bg-slate-900 text-white px-4 py-3 rounded-lg flex items-center justify-between">
                <span className="text-sm">{toastMessage}</span>
                <button
                  onClick={() => setToastMessage(null)}
                  className="p-1 rounded hover:bg-white/10"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {loadingForms ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
            ) : feedbackForms.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex p-4 bg-slate-100 rounded-full mb-4">
                  <MessageSquare className="w-12 h-12 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">No Feedback Forms Available</h3>
                <p className="text-slate-600">
                  There are no active feedback forms for you at the moment.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {feedbackForms.map((form) => (
                  <div
                    key={form.id}
                    className={`p-5 border border-slate-200 rounded-lg transition-all ${
                      form.is_submitted 
                        ? 'opacity-75' 
                        : isStudentUser
                          ? ''
                          : 'hover:border-indigo-300 hover:shadow-md cursor-pointer'
                    }`}
                    onClick={() => {
                      if (isStudentUser) return;
                      openFeedbackForm(form);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {isStudentUser ? (
                          <>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-lg font-semibold text-slate-800">
                                {form.context_display || form.target_display || (form.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Feedback')}
                              </h3>
                              {form.anonymous && (
                                <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                                  Anonymous
                                </span>
                              )}
                            </div>
                            {/* Form Name Display for Student */}
                            {form.form_name && (
                              <p className="text-sm font-medium mb-2 text-slate-700">
                                {form.form_name}
                              </p>
                            )}
                            <div className="flex items-center gap-1 text-sm text-slate-600">
                              <FileText className="w-4 h-4" />
                              {form.questions.length} questions
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-lg font-semibold text-slate-800">
                                {form.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Common Feedback'}
                              </h3>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                form.type === 'SUBJECT_FEEDBACK' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {form.type === 'SUBJECT_FEEDBACK' ? 'About Subjects' : 'General'}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                form.is_submitted ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {form.is_submitted ? 'Responded' : 'Pending'}
                              </span>
                              {form.anonymous && (
                                <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                                  Anonymous
                                </span>
                              )}
                            </div>
                            {/* Form Name Display for Non-Student */}
                            {form.form_name && (
                              <p className="text-sm font-medium mb-3 text-slate-700">
                                {form.form_name}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                              <span className="flex items-start gap-1">
                                <Users className="w-4 h-4 mt-0.5" />
                                <span className="leading-tight">
                                  {getClassContextLines(form).map((line, idx) => (
                                    <span key={`${form.id}-reply-ctx-${idx}`} className="block">
                                      {line}
                                    </span>
                                  ))}
                                </span>
                              </span>
                              <span className="flex items-center gap-1">
                                <FileText className="w-4 h-4" />
                                {form.questions.length} questions
                              </span>
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-4 h-4" />
                                Created by {form.created_by_name}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      {form.is_submitted ? (
                        isStudentUser ? (
                          <button
                            type="button"
                            disabled
                            className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg cursor-not-allowed"
                          >
                            Submitted
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-medium">Responded</span>
                          </div>
                        )
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openFeedbackForm(form);
                          }}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          Respond
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Response Form Modal */}
        {selectedForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Back button when viewing subject questions */}
                  {selectedSubject && (
                    <button
                      onClick={() => {
                        setSelectedSubject(null);
                        setCommentValidationErrors({});
                        setRatingValidationErrors({});
                        setOptionValidationErrors({});
                      }}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Back to subjects"
                    >
                      <ChevronLeft className="w-6 h-6 text-slate-600" />
                    </button>
                  )}
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">
                      {selectedSubject 
                        ? selectedSubject.subject_name 
                        : selectedForm.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Common Feedback'
                      }
                    </h2>
                    <p className="text-slate-600 text-sm mt-1">
                      {selectedSubject 
                        ? `${selectedSubject.subject_code} • ${selectedSubject.staff_name}`
                        : `${selectedForm.context_display || selectedForm.target_display} • ${selectedForm.questions.length} questions`
                      }
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseForm}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-slate-600" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Error message */}
                {responseError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <span className="text-red-800">{responseError}</span>
                  </div>
                )}

                {/* Subject List View (for SUBJECT_FEEDBACK type) */}
                {selectedForm.type === 'SUBJECT_FEEDBACK' && !selectedSubject && (
                  <div className="space-y-4">
                    {loadingStudentSubjects ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        <span className="ml-3 text-slate-600">Loading subjects...</span>
                      </div>
                    ) : studentSubjects?.is_first_year ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                        <Users className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-blue-900 mb-2">First Year Students</h3>
                        <p className="text-blue-700">Subject feedback is not available for first year students.</p>
                      </div>
                    ) : studentSubjects && studentSubjects.subjects.length > 0 ? (
                      <>
                        {/* Progress Indicator */}
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-indigo-900">Your Subjects</h3>
                              <p className="text-sm text-indigo-700 mt-1">
                                Complete feedback for all subjects to submit
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-indigo-900">
                                {studentSubjects.completed_subjects} / {studentSubjects.total_subjects} Subjects Completed
                              </p>
                              <p className="text-sm text-indigo-700">Completion Status</p>
                            </div>
                          </div>
                        </div>

                        {/* Subject Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {studentSubjects.subjects.map((subject) => (
                            <button
                              key={subject.teaching_assignment_id}
                              disabled={subject.is_completed}
                              onClick={() => {
                                if (subject.is_completed) return;
                                setSelectedSubject(subject);
                                setCurrentSubjectResponses({});
                                setCurrentSubjectCommonComment('');
                                setCurrentSubjectCommonCommentError(false);
                                setCommentValidationErrors({});
                                setRatingValidationErrors({});
                                setOptionValidationErrors({});
                              }}
                              className={`p-4 rounded-lg border-2 transition-all text-left ${
                                subject.is_completed
                                  ? 'border-green-300 bg-green-50 opacity-75 cursor-not-allowed'
                                  : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-indigo-50'
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-slate-800 mb-1">
                                    {subject.subject_name}
                                  </h4>
                                  <p className="text-sm text-slate-600">{subject.subject_code}</p>
                                </div>
                                {subject.is_completed ? (
                                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full border-2 border-slate-400 flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600 mt-3 pt-3 border-t border-slate-200">
                                <Users className="w-4 h-4" />
                                <span>{subject.staff_name}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : studentSubjects?.detail ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
                        <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-amber-900 mb-2">Information</h3>
                        <p className="text-amber-700">{studentSubjects.detail}</p>
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center">
                        <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Subjects Found</h3>
                        <p className="text-slate-600">You have no subjects assigned for this feedback.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Questions View (for OPEN_FEEDBACK or when subject selected) */}
                {(selectedForm.type === 'OPEN_FEEDBACK' || selectedSubject) && (
                  <>
                    {selectedForm.questions.map((question, index) => (
                      <div key={question.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-start gap-3 mb-4">
                          <span className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-semibold">
                            {index + 1}
                          </span>
                          <div className="flex-1">
                            <p className="text-slate-800 font-medium mb-2">{question.question}</p>
                            <div className="flex items-center gap-2">
                              {question.allow_rating && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                                  <Star className="w-3 h-3" />
                                  Rating
                                </span>
                              )}
                              {!selectedForm.common_comment_enabled && question.allow_comment && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                  <FileText className="w-3 h-3" />
                                  Comment
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Answer Input */}
                        <div className="ml-11 space-y-4">
                          {/* Star Rating Input */}
                          {question.allow_rating && (
                            <div>
                              <p className="text-sm font-medium text-slate-700 mb-2">
                                Rate (1-5 stars) {!selectedForm.common_comment_enabled && question.allow_comment && <span className="text-red-500">*</span>}
                              </p>
                              <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((star) => {
                                  const currentResponses = selectedSubject ? currentSubjectResponses : responses;
                                  const currentRating = currentResponses[question.id!]?.answer_star || 0;
                                  const isActive = star <= currentRating;
                                  const isSelected = star === currentRating;
                                  
                                  return (
                                    <button
                                      key={star}
                                      type="button"
                                      onClick={() => handleResponseChange(question.id!, 'STAR', star)}
                                      className={`p-3 rounded-lg border-2 transition-all ${
                                        isSelected
                                          ? 'border-yellow-500 bg-yellow-50'
                                          : 'border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      <Star
                                        className={`w-6 h-6 transition-all ${
                                          isActive
                                            ? 'text-yellow-500 fill-yellow-500'
                                            : 'text-slate-400'
                                        }`}
                                      />
                                      <span className="block text-xs text-slate-600 mt-1">{star}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {ratingValidationErrors[question.id!] && (
                                <p className="text-xs text-red-600 mt-2">Rating is required</p>
                              )}
                            </div>
                          )}

                          {/* Text Comment Input (question-wise) */}
                          {!selectedForm.common_comment_enabled && question.allow_comment && (
                            <div>
                              <p className="text-sm font-medium text-slate-700 mb-2">
                                Comment <span className="text-red-500">*</span>
                              </p>
                              <textarea
                                value={(selectedSubject ? currentSubjectResponses : responses)[question.id!]?.answer_text || ''}
                                onChange={(e) => handleResponseChange(question.id!, 'TEXT', e.target.value)}
                                onInput={handleTextareaInput}
                                placeholder="Add your comments here..."
                                required
                                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 resize-none overflow-hidden ${
                                  commentValidationErrors[question.id!] ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-indigo-500'
                                }`}
                                rows={4}
                              />
                              {commentValidationErrors[question.id!] && (
                                <p className="text-xs text-red-600 mt-2">Comment is required</p>
                              )}
                            </div>
                          )}

                          {(question.question_type === 'rating_radio_comment' || question.question_type === 'radio') && (
                            <div>
                              <p className="text-sm font-medium text-slate-700 mb-2">
                                Choose one option <span className="text-red-500">*</span>
                              </p>
                              <div className="flex flex-wrap gap-3">
                                {(question.options || []).map((opt) => {
                                  const currentResponses = selectedSubject ? currentSubjectResponses : responses;
                                  const selected = currentResponses[question.id!]?.selected_option;
                                  const checked = opt?.id !== undefined && selected === opt.id;
                                  const radioId = `q-${question.id}-opt-${opt.id}`;

                                  return (
                                    <label
                                      key={opt.ui_id || opt.id}
                                      htmlFor={radioId}
                                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors w-auto min-w-[90px] ${
                                        checked ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      <input
                                        id={radioId}
                                        type="radio"
                                        name={`q-${question.id}-opt`}
                                        checked={checked}
                                        onChange={() => {
                                          if (opt?.id !== undefined) {
                                            handleResponseChange(question.id!, 'OPTION', opt.id);
                                          }
                                        }}
                                        className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-2 focus:ring-indigo-500"
                                      />
                                      <span className="text-sm text-slate-800">{opt.option_text}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              {optionValidationErrors[question.id!] && (
                                <p className="text-xs text-red-600 mt-2">Please select an option</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {requiresCommonComment && (
                      <div className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-slate-800 font-medium mb-3">Overall Comment <span className="text-red-500">*</span></p>
                        <textarea
                          value={currentSubjectCommonComment}
                          onChange={(e) => {
                            setCurrentSubjectCommonComment(e.target.value);
                            if (currentSubjectCommonCommentError) {
                              setCurrentSubjectCommonCommentError(false);
                            }
                          }}
                          onInput={handleTextareaInput}
                          placeholder="Add your overall comments here..."
                          required
                          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 resize-none overflow-hidden ${
                            currentSubjectCommonCommentError ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-indigo-500'
                          }`}
                          rows={4}
                        />
                        {currentSubjectCommonCommentError && (
                          <p className="text-xs text-red-600 mt-2">Overall comment is required</p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Submit Button - Only show when viewing questions, not subject list */}
                {(selectedForm.type === 'OPEN_FEEDBACK' || selectedSubject) && (
                  <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={handleSubmitResponse}
                      disabled={submittingResponse || !hasAllMandatoryComments || !hasAllMandatoryRatings || !hasAllMandatoryOptions || !hasCommonComment}
                      className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md font-medium"
                    >
                      {submittingResponse ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Submitting...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <Send className="w-5 h-5" />
                          {selectedSubject ? 'Submit for This Subject' : 'Submit Feedback'}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={selectedSubject ? () => {
                        setSelectedSubject(null);
                        setCurrentSubjectCommonComment('');
                        setCurrentSubjectCommonCommentError(false);
                        setCommentValidationErrors({});
                        setRatingValidationErrors({});
                        setOptionValidationErrors({});
                      } : handleCloseForm}
                      disabled={submittingResponse}
                      className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50"
                    >
                      {selectedSubject ? 'Back' : 'Cancel'}
                    </button>
                  </div>
                )}

                {/* Final Submit Button for Subject Feedback - Only show when viewing subject list */}
                {selectedForm.type === 'SUBJECT_FEEDBACK' && !selectedSubject && studentSubjects && !studentSubjects.is_first_year && (
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    {!studentSubjects.all_completed ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-yellow-800 font-medium">Complete all subjects to submit</p>
                          <p className="text-yellow-700 text-sm mt-1">
                            You have completed {studentSubjects.completed_subjects} of {studentSubjects.total_subjects} subjects. Please complete feedback for all subjects before final submission.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-green-800 font-medium">All subjects completed!</p>
                          <p className="text-green-700 text-sm mt-1">
                            You have completed feedback for all {studentSubjects.total_subjects} subjects. You can now close this form.
                          </p>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={handleCloseForm}
                      className="w-full px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-600 font-medium">Available Forms</h3>
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-3xl font-bold text-slate-800">{canReplyFeedback ? feedbackForms.length : 0}</p>
            <p className="text-sm text-slate-500 mt-1">Feedback forms to respond to</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-600 font-medium">Questions</h3>
              <MessageSquare className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-3xl font-bold text-slate-800">
              {canReplyFeedback ? feedbackForms.reduce((acc, form) => acc + form.questions.length, 0) : 0}
            </p>
            <p className="text-sm text-slate-500 mt-1">Total questions across forms</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-600 font-medium">Your Role</h3>
              <Users className="w-5 h-5 text-orange-500" />
            </div>
            <p className="text-3xl font-bold text-slate-800">
              {canPrincipalAllDepartmentsAccess
                ? 'Principal All Departments Access'
                : canAllDepartmentsAccess
                  ? 'All Departments Access'
                  : canOwnDepartmentAccess
                    ? 'Own Department Access'
                    : canReplyFeedback
                      ? (user?.profile_type || 'User')
                      : 'Viewer'}
            </p>
            <p className="text-sm text-slate-500 mt-1">Current access level</p>
          </div>
        </div>
      </div>
    </div>
  );
}
