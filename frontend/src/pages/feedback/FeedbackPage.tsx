import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, PlusCircle, FileText, Users, Loader2, AlertCircle, X, Trash2, Star, Send, CheckCircle, ChevronDown, ChevronLeft, User as UserIcon } from 'lucide-react';
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
  question: string;
  answer_type?: 'STAR' | 'TEXT' | 'BOTH';  // Legacy field for backward compatibility
  allow_rating: boolean;
  allow_comment: boolean;
  order: number;
};

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
  all_classes: boolean;
  years: number[];
  semesters: number[];
  sections: number[];
};

type FeedbackForm = {
  id: number;
  target_type: string;
  type: string;
  status: string;
  created_at: string;
  created_by: number;
  created_by_name: string;
  questions: Question[];
  year: number | null;
  semester_number: number | null;
  section_name: string | null;
  regulation_name: string | null;
  all_classes: boolean;
  target_display: string;
  active: boolean;
  is_submitted?: boolean;
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
    answer_star: number | null;
    answer_text: string | null;
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
  target_type?: string;
  responded: ResponseDetail[];
  non_responders: {
    user_id: number;
    user_name: string;
    register_number: string | null;
  }[];
  total_responded: number;
  total_non_responded: number;
};

type FeedbackResponse = {
  question: number;
  answer_star?: number;
  answer_text?: string;
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
  name?: string;
  number?: number;
  year?: number;
};

type ClassOptions = {
  years: ClassOption[];
  semesters: ClassOption[];
  sections: ClassOption[];
  year_sections?: Record<number, ClassOption[]>;
};

export default function FeedbackPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<FeedbackFormData>({
    target_type: '',
    type: '',
    department: null,
    status: 'DRAFT',
    questions: [],
    year: null,
    semester: null,
    section: null,
    regulation: null,
    all_classes: false,
    years: [],
    semesters: [],
    sections: []
  });
  const [newQuestion, setNewQuestion] = useState('');
  const [allowRating, setAllowRating] = useState(true);
  const [allowComment, setAllowComment] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // HOD department state - supports multiple departments
  const [departmentData, setDepartmentData] = useState<DepartmentResponse | null>(null);
  const [activeDepartment, setActiveDepartment] = useState<Department | null>(null);
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([]); // For multi-select during form creation
  const [departmentLoading, setDepartmentLoading] = useState(true);
  const [departmentError, setDepartmentError] = useState<string | null>(null);

  // Class options state
  const [classOptions, setClassOptions] = useState<ClassOptions>({
    years: [],
    semesters: [],
    sections: [],
    year_sections: {}
  });
  const [loadingClassOptions, setLoadingClassOptions] = useState(false);
  const [classOptionsError, setClassOptionsError] = useState<string | null>(null);
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

  // HOD response view states
  const [responseStats, setResponseStats] = useState<Record<number, ResponseStatistics>>({});
  const [selectedResponseView, setSelectedResponseView] = useState<ResponseListData | null>(null);
  const [loadingResponseView, setLoadingResponseView] = useState(false);
  const [responseViewError, setResponseViewError] = useState<string | null>(null);
  
  // Deactivated forms accordion state
  const [showDeactivatedForms, setShowDeactivatedForms] = useState(false);

  // Ref for dropdowns
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const sectionDropdownRef = useRef<HTMLDivElement>(null);

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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Check permissions
  const permissions = (user?.permissions || []).map(p => p.toLowerCase());
  const canCreateFeedback = permissions.includes('feedback.create');
  const canReplyFeedback = permissions.includes('feedback.reply');

  // Helper function to get available sections based on selected years
  const getAvailableSections = (): ClassOption[] => {
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
    
    return availableSections.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  // Note: Semester selection removed - backend will automatically determine
  // the current semester based on the active academic year parity

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target as Node)) {
        setYearDropdownOpen(false);
      }
      if (sectionDropdownRef.current && !sectionDropdownRef.current.contains(event.target as Node)) {
        setSectionDropdownOpen(false);
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

  // Fetch HOD department(s) on mount
  useEffect(() => {
    const fetchHODDepartments = async () => {
      if (canCreateFeedback) {
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
  }, [user, canCreateFeedback]);

  // Initialize selectedDepartments when form is opened
  useEffect(() => {
    if (showCreateForm && departmentData) {
      if (departmentData.has_multiple_departments) {
        // For multi-department HODs, default to all departments selected
        const allDeptIds = departmentData.departments.map(d => d.id);
        setSelectedDepartments(allDeptIds);
        // Fetch class options for all departments
        fetchClassOptions(allDeptIds);
      } else {
        // Single department - set to that department
        setSelectedDepartments(activeDepartment ? [activeDepartment.id] : []);
      }
    } else if (!showCreateForm) {
      // Reset when form is closed
      setSelectedDepartments([]);
    }
  }, [showCreateForm, departmentData]);

  // Fetch class options function (extracted for reuse)
  const fetchClassOptions = async (deptIds?: number[]) => {
    if (canCreateFeedback) {
      try {
        setLoadingClassOptions(true);
        
        // Build URL with departments parameter if provided
        let url = '/api/feedback/class-options/';
        if (deptIds && deptIds.length > 0) {
          const params = new URLSearchParams();
          deptIds.forEach(id => params.append('departments[]', id.toString()));
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

  // Fetch subjects by year when creating Subject Feedback
  useEffect(() => {
    const fetchSubjectsByYear = async () => {
      if (
        canCreateFeedback && 
        formData.type === 'SUBJECT_FEEDBACK' && 
        formData.years.length > 0 &&
        activeDepartment
      ) {
        try {
          setLoadingSubjects(true);
          
          // Fetch subjects for ALL selected years (comma-separated)
          const yearsParam = formData.years.join(',');
          const queryParams = new URLSearchParams({
            years: yearsParam,
            department_id: activeDepartment.id.toString()
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
        setSubjectsByYear(null);
      }
    };

    fetchSubjectsByYear();
  }, [canCreateFeedback, formData.type, formData.years, formData.sections, activeDepartment]);

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
        setFeedbackForms(data);
        
        // If HOD, fetch response statistics for each form
        if (canCreateFeedback) {
          fetchAllResponseStatistics(data);
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

  // Get department from user profile (for HOD)
  const getDepartmentId = (): number | null => {
    if (user?.profile && user.profile.department_id) {
      return user.profile.department_id;
    }
    return null;
  };

  const handleAddQuestion = () => {
    if (!newQuestion.trim()) return;
    
    // Ensure at least one answer method is selected
    if (!allowRating && !allowComment) {
      alert('Please select at least one answer method (Rating or Comment)');
      return;
    }

    const question: Question = {
      question: newQuestion.trim(),
      allow_rating: allowRating,
      allow_comment: allowComment,
      order: formData.questions.length + 1
    };

    setFormData({
      ...formData,
      questions: [...formData.questions, question]
    });

    setNewQuestion('');
    // Reset to default: both enabled
    setAllowRating(true);
    setAllowComment(true);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.target_type) {
      setSubmitError('Please select a target audience');
      return;
    }
    if (!formData.type) {
      setSubmitError('Please select feedback type');
      return;
    }
    if (formData.questions.length === 0) {
      setSubmitError('Please add at least one question');
      return;
    }

    // Validate class selection for student feedback
    if (formData.target_type === 'STUDENT' && !formData.all_classes) {
      if (formData.years.length === 0) {
        setSubmitError('Please select at least one year or check "All Classes"');
        return;
      }
    }

    // Validate department selection for multi-department HODs
    if (departmentData && departmentData.has_multiple_departments) {
      if (selectedDepartments.length === 0) {
        setSubmitError('Please select at least one department');
        return;
      }
    }

    // Use the fetched HOD department
    if (!activeDepartment?.id && (!departmentData || !departmentData.has_multiple_departments)) {
      setSubmitError('Department information not found. Please refresh the page or contact administrator.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Determine departments to send
      let departmentsToSend: number[] = [];
      if (departmentData && departmentData.has_multiple_departments) {
        // Multi-department HOD - use selected departments
        departmentsToSend = selectedDepartments;
      } else if (activeDepartment) {
        // Single department - use active department
        departmentsToSend = [activeDepartment.id];
      }
      
      const payload = {
        target_type: formData.target_type,
        type: formData.type,
        departments: departmentsToSend,  // Send array of departments
        status: formData.status,
        questions: formData.questions,
        year: formData.target_type === 'STUDENT' ? formData.year : null,
        semester: formData.target_type === 'STUDENT' ? formData.semester : null,
        section: formData.target_type === 'STUDENT' ? formData.section : null,
        regulation: formData.target_type === 'STUDENT' ? formData.regulation : null,
        all_classes: formData.target_type === 'STUDENT' ? formData.all_classes : false,
        years: formData.target_type === 'STUDENT' ? formData.years : [],
        semesters: formData.target_type === 'STUDENT' ? formData.semesters : [],
        sections: formData.target_type === 'STUDENT' ? formData.sections : []
      };

      const response = await fetchWithAuth('/api/feedback/create/', {
        method: 'POST',
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
        // Handle specific error messages from backend (detail or error key)
        throw new Error(data.detail || data.error || 'Failed to create feedback form');
      }

      // Success
      setSubmitSuccess(true);
      setShowCreateForm(false);
      
      // Refresh the feedback forms list to show the new form
      await fetchFeedbackForms();
      
      // Reset form
      setFormData({
        target_type: '',
        type: '',
        department: null,
        status: 'DRAFT',
        questions: [],
        year: null,
        semester: null,
        section: null,
        regulation: null,
        all_classes: false,
        years: [],
        semesters: [],
        sections: []
      });

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
    setFormData({
      target_type: '',
      type: '',
      department: null,
      status: 'DRAFT',
      questions: [],
      year: null,
      semester: null,
      section: null,
      regulation: null,
      all_classes: false,
      years: [],
      semesters: [],
      sections: []
    });
    setNewQuestion('');
    setSubmitError(null);
  };

  // Handle response changes
  const handleResponseChange = (questionId: number, type: 'STAR' | 'TEXT', value: number | string) => {
    // Use currentSubjectResponses when in subject mode, otherwise use responses
    if (selectedSubject) {
      setCurrentSubjectResponses(prev => ({
        ...prev,
        [questionId]: {
          question: questionId,
          ...(prev[questionId] || {}),
          ...(type === 'STAR' ? { answer_star: value as number } : { answer_text: value as string })
        }
      }));
    } else {
      setResponses(prev => ({
        ...prev,
        [questionId]: {
          question: questionId,
          ...(prev[questionId] || {}),
          ...(type === 'STAR' ? { answer_star: value as number } : { answer_text: value as string })
        }
      }));
    }
  };

  // Submit feedback response
  const handleSubmitResponse = async () => {
    if (!selectedForm) return;

    // Determine which responses to use based on mode
    const currentResponses = selectedSubject ? currentSubjectResponses : responses;

    // Validate all questions are answered appropriately
    const validationErrors: string[] = [];
    
    for (const question of selectedForm.questions) {
      const response = currentResponses[question.id!];
      
      // Check if question requires rating
      if (question.allow_rating && !question.allow_comment) {
        // Only rating required
        if (!response || response.answer_star === undefined) {
          validationErrors.push(`Question ${question.id}: Rating is required`);
        }
      } else if (question.allow_comment && !question.allow_rating) {
        // Only comment required
        if (!response || !response.answer_text || !response.answer_text.trim()) {
          validationErrors.push(`Question ${question.id}: Comment is required`);
        }
      } else if (question.allow_rating && question.allow_comment) {
        // Both allowed - rating is required, comment is optional
        if (!response || response.answer_star === undefined) {
          validationErrors.push(`Question ${question.id}: Rating is required`);
        }
      }
    }
    
    if (validationErrors.length > 0) {
      setResponseError('Please complete all required fields before submitting');
      return;
    }

    setSubmittingResponse(true);
    setResponseError(null);

    try {
      // Prepare payload - teaching_assignment_id goes at top level, not in each response
      const responsesArray = Object.values(currentResponses);

      const payload = {
        feedback_form_id: selectedForm.id,
        responses: responsesArray,
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
      
      if (selectedSubject) {
        // For subject feedback, refresh the subject list and go back
        await fetchStudentSubjects(selectedForm.id);
        setSelectedSubject(null);
        setCurrentSubjectResponses({});
        setResponseError(null);
        // Show success message briefly
        const successMessage = `Feedback for ${selectedSubject.subject_name} submitted successfully!`;
        setResponseError(null);
        // You could add a success state here if needed
      } else {
        // For open feedback, close the modal and show success
        setResponseSuccess(true);
        setSelectedForm(null);
        setResponses({});
        
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
        if (formData.type === 'SUBJECT_FEEDBACK' && formData.years.length > 0) {
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
            <span className="text-green-800 font-medium">Feedback form created successfully!</span>
          </div>
        )}

        {/* HOD Create Feedback Form Section */}
        {canCreateFeedback && (
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-800">Create Feedback Form</h2>
              {!showCreateForm && !departmentLoading && (
                <div className="relative group">
                  <button
                    onClick={() => setShowCreateForm(true)}
                    disabled={!activeDepartment}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-md ${
                      activeDepartment
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <PlusCircle className="w-5 h-5" />
                    New Form
                  </button>
                  {!activeDepartment && (
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
                {departmentData && departmentData.has_multiple_departments && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Users className="w-5 h-5 text-indigo-600" />
                      <label className="text-sm font-semibold text-indigo-900">
                        Select Department(s) <span className="text-red-500">*</span>
                      </label>
                    </div>
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
                                fetchClassOptions(newSelected);
                              } else {
                                const newSelected = selectedDepartments.filter(id => id !== dept.id);
                                setSelectedDepartments(newSelected);
                                // Reload class options for selected departments
                                fetchClassOptions(newSelected.length > 0 ? newSelected : undefined);
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-slate-900">{dept.name}</span>
                          <span className="text-xs text-slate-500">({dept.code})</span>
                        </label>
                      ))}
                    </div>
                    {selectedDepartments.length > 0 && (
                      <p className="text-xs text-indigo-700 mt-3">
                        Selected: <span className="font-semibold">{selectedDepartments.length} department(s)</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Single Department Display - Show inside form for single-department HODs */}
                {departmentData && !departmentData.has_multiple_departments && activeDepartment && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-600" />
                    <span className="text-sm text-slate-700">
                      Department: <span className="font-semibold text-slate-900">{activeDepartment.name}</span>
                    </span>
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
                      onClick={() => setFormData({ ...formData, target_type: 'STAFF', type: '' })}
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
                      onClick={() => setFormData({ ...formData, target_type: 'STUDENT', type: '' })}
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
                          Open Feedback
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Class Selection (for Students only) */}
                {formData.target_type === 'STUDENT' && formData.type && (
                  <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-semibold text-slate-800">Target Class</h3>
                    
                    {/* All Classes Checkbox */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="all_classes"
                        checked={formData.all_classes}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          all_classes: e.target.checked,
                          year: e.target.checked ? null : formData.year,
                          semester: e.target.checked ? null : formData.semester,
                          section: e.target.checked ? null : formData.section,
                          years: e.target.checked ? [] : formData.years,
                          semesters: e.target.checked ? [] : formData.semesters,
                          sections: e.target.checked ? [] : formData.sections
                        })}
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="all_classes" className="text-sm font-medium text-slate-700">
                        All Classes (All years & sections in department)
                      </label>
                    </div>

                    {/* Class Details (show if not all_classes) */}
                    {!formData.all_classes && (
                      <>
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
                          <div className="grid grid-cols-3 gap-4">
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
                              <div className="relative" ref={sectionDropdownRef}>
                                <button
                                  type="button"
                                  onClick={() => setSectionDropdownOpen(!sectionDropdownOpen)}
                                  disabled={formData.years.length === 0}
                                  className={`w-full px-4 py-2 text-left border border-slate-300 rounded-lg bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between ${
                                    formData.years.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                                  }`}
                                >
                                  <span className="text-sm text-slate-700 truncate">
                                    {formData.years.length === 0
                                      ? 'Select a year first...'
                                      : formData.sections.length === 0
                                      ? 'Select Sections...'
                                      : formData.sections
                                          .map(secVal => {
                                            const section = getAvailableSections().find(s => s.value === secVal);
                                            return section ? `Section ${section.name}` : null;
                                          })
                                          .filter(Boolean)
                                          .join(', ')}
                                  </span>
                                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ml-2 ${sectionDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                
                                {sectionDropdownOpen && formData.years.length > 0 && (
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
                                          <span className="text-sm">Section {sec.name}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Subjects Preview (for Subject Feedback) */}
                {formData.type === 'SUBJECT_FEEDBACK' && formData.years.length > 0 && (
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
                            Found <span className="font-semibold text-blue-700">{subjectsByYear.regular_subjects?.length || 0}</span> core subject(s)
                            {subjectsByYear.elective_categories && subjectsByYear.elective_categories.length > 0 && (
                              <span className="ml-1 text-slate-500">
                                • {subjectsByYear.elective_categories.length} elective categor{subjectsByYear.elective_categories.length === 1 ? 'y' : 'ies'}
                              </span>
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
                          {subjectsByYear.regular_subjects && subjectsByYear.regular_subjects.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                                <div className="w-1 h-4 bg-blue-600 rounded"></div>
                                Core Subjects
                                <span className="text-xs text-slate-500 font-normal">({subjectsByYear.regular_subjects.length})</span>
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {subjectsByYear.regular_subjects.map((subject, index) => {
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

                          {/* Display Elective CATEGORIES with Expand/Collapse for HOD */}
                          {subjectsByYear.elective_categories && subjectsByYear.elective_categories.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                                <div className="w-1 h-4 bg-purple-600 rounded"></div>
                                Elective Categories
                                <span className="text-xs text-slate-500 font-normal">({subjectsByYear.elective_categories.length})</span>
                              </h4>
                              <p className="text-xs text-slate-500 mb-2 italic">
                                Students will see their selected elective subjects with staff names. Click a category to expand and view subjects.
                              </p>
                              
                              <div className="space-y-2">
                                {subjectsByYear.elective_categories.map((category, index) => {
                                  const yearText = category.years && category.years.length > 0 
                                    ? category.years.map((y: number) => `Y${y}`).join(', ')
                                    : '';
                                  
                                  const isExpanded = expandedCategories.has(category.category);
                                  
                                  // Find matching group data for expanded view
                                  const groupData = subjectsByYear.elective_groups?.find(
                                    (g) => g.category === category.category
                                  );
                                  
                                  return (
                                    <div 
                                      key={`category-${index}`} 
                                      className="bg-purple-50 rounded-lg border border-purple-200 hover:border-purple-300 transition-colors"
                                    >
                                      {/* Category Header - Clickable */}
                                      <button
                                        onClick={() => {
                                          const newExpanded = new Set(expandedCategories);
                                          if (isExpanded) {
                                            newExpanded.delete(category.category);
                                          } else {
                                            newExpanded.add(category.category);
                                          }
                                          setExpandedCategories(newExpanded);
                                        }}
                                        className="w-full p-3 flex items-center justify-between text-left hover:bg-purple-100 transition-colors rounded-lg"
                                      >
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <h5 className="text-sm font-semibold text-purple-800">
                                              {category.display_name}
                                            </h5>
                                            {yearText && (
                                              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                                {yearText}
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-xs text-purple-600">
                                            {category.count} elective option{category.count !== 1 ? 's' : ''} available • Students select based on their choices
                                          </p>
                                        </div>
                                        <ChevronDown 
                                          className={`w-5 h-5 text-purple-600 transition-transform flex-shrink-0 ${
                                            isExpanded ? 'rotate-180' : ''
                                          }`}
                                        />
                                      </button>
                                      
                                      {/* Expanded Subjects List */}
                                      {isExpanded && groupData && groupData.subjects && groupData.subjects.length > 0 && (
                                        <div className="px-3 pb-3 pt-0 border-t border-purple-200 mt-2">
                                          <div className="mt-2 space-y-2">
                                            {groupData.subjects.map((subject, subIndex) => (
                                              <div
                                                key={`subject-${category.category}-${subIndex}`}
                                                className="bg-white p-2 rounded border border-purple-200 hover:border-purple-300 transition-colors"
                                              >
                                                <div className="flex items-start justify-between gap-1">
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      {subject.subject_code && (
                                                        <span className="text-xs font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                                                          {subject.subject_code}
                                                        </span>
                                                      )}
                                                      {subject.years && subject.years.length > 0 && (
                                                        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                          {subject.years.map((y: number) => `Y${y}`).join(', ')}
                                                        </span>
                                                      )}
                                                    </div>
                                                    <h6 className="text-xs font-medium text-slate-800 mt-1 line-clamp-2" title={subject.subject_name}>
                                                      {subject.subject_name}
                                                    </h6>
                                                    <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                                                      <UserIcon className="w-3 h-3" />
                                                      {subject.staff_names}
                                                    </p>
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

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
                    
                    {/* Existing questions */}
                    {formData.questions.length > 0 && (
                      <div className="space-y-3">
                        {formData.questions.map((q, index) => (
                          <div key={index} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-slate-600">Q{index + 1}</span>
                                {q.allow_rating && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                                    <Star className="w-3 h-3" />
                                    Rating
                                  </span>
                                )}
                                {q.allow_comment && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                                    <FileText className="w-3 h-3" />
                                    Comment
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-800">{q.question}</p>
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
                          placeholder="Enter your question..."
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                            <span className="text-sm text-slate-700">⭐ Star Rating (1-5)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allowComment}
                              onChange={(e) => setAllowComment(e.target.checked)}
                              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">💬 Text Comment</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleAddQuestion}
                            disabled={!newQuestion.trim() || (!allowRating && !allowComment)}
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
                    disabled={submitting || !formData.type || formData.questions.length === 0 || !activeDepartment}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      'Create Feedback Form'
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
        {canCreateFeedback && !showCreateForm && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">Your Feedback Forms</h2>
            
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
                                    <div className="flex items-center gap-2 mb-2">
                                      <h3 className={`text-lg font-semibold ${
                                        isDeactivated ? 'text-slate-500' : 'text-slate-800'
                                      }`}>
                                        {form.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Open Feedback'}
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
                                    </div>
                                    <div className={`flex items-center gap-4 text-sm mb-3 ${
                                      isDeactivated ? 'text-slate-500' : 'text-slate-600'
                                    }`}>
                                      <span className="flex items-center gap-1">
                                        <Users className="w-4 h-4" />
                                        {form.target_display}
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
                                    
                                    {/* View Responses Button (not for draft, and only if active) */}
                                    {!isDraft && form.active && (
                                      <button
                                        onClick={() => handleViewResponses(form.id)}
                                        disabled={loadingResponseView}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {loadingResponseView ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <FileText className="w-4 h-4" />
                                        )}
                                        {loadingResponseView ? 'Loading...' : 'View Responses'}
                                      </button>
                                    )}

                                    {/* For deactivated forms, show View Responses but with muted styling */}
                                    {!isDraft && !form.active && (
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

                                    {/* Toggle Active/Inactive (not for draft) */}
                                    {!isDraft && (
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
                            <ChevronDown
                              className={`w-5 h-5 text-slate-600 transition-transform ${
                                showDeactivatedForms ? 'transform rotate-180' : ''
                              }`}
                            />
                          </button>
                          
                          {showDeactivatedForms && (
                            <div className="mt-4 space-y-4">
                              {deactivatedForms.map((form) => {
                                const stats = responseStats[form.id];
                                const isDraft = form.status === 'DRAFT';
                                const isDeactivated = !form.active && form.status === 'ACTIVE';
                                return (
                                  <div
                                    key={form.id}
                                    className="p-5 border-2 border-slate-300 bg-slate-100 opacity-60 rounded-lg transition-all"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <h3 className="text-lg font-semibold text-slate-500">
                                            {form.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Open Feedback'}
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
                                        <div className="flex items-center gap-4 text-sm mb-3 text-slate-500">
                                          <span className="flex items-center gap-1">
                                            <Users className="w-4 h-4" />
                                            {form.target_display}
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

                                        <button
                                          onClick={() => handleToggleActive(form.id)}
                                          className="px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors text-sm font-medium"
                                        >
                                          Activate
                                        </button>

                                        <button
                                          onClick={() => handleDeleteFeedback(form.id)}
                                          className="p-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors"
                                          title="Delete feedback form"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
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
                      Total: {selectedResponseView.total_responded + selectedResponseView.total_non_responded}
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
                                      {subject.answers.map((answer, idx) => (
                                        <div key={idx} className="text-[10px]">
                                          <p className="text-slate-700 font-medium mb-0.5 leading-tight">{answer.question_text}</p>
                                          
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
                                          
                                          {/* Text comment */}
                                          {answer.answer_text && answer.answer_text.trim() !== '' && (
                                            <p className="text-[10px] text-slate-600 bg-slate-50 p-1 rounded border border-slate-200 italic leading-snug">
                                              "{answer.answer_text}"
                                            </p>
                                          )}
                                        </div>
                                      ))}
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
                                    {resp.user_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="leading-tight">
                                    <p className="font-semibold text-slate-800 text-xs">
                                      {resp.user_name}
                                      {resp.register_number && (
                                        <span className="text-slate-600 font-normal ml-1 text-xs">({resp.register_number})</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right text-xs text-slate-500 leading-tight">
                                  <p className="font-medium text-green-700 text-xs">
                                    {new Date(resp.submitted_at).toLocaleDateString()} {new Date(resp.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-1.5 pl-2 border-l-2 border-green-300 ml-7">
                                {resp.answers.map((answer, idx) => (
                                  <div key={idx} className="pl-2">
                                    <p className="text-xs text-slate-700 font-medium mb-0.5">{answer.question_text}</p>
                                    
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
                                    
                                    {/* Display text comment if provided */}
                                    {answer.answer_text && answer.answer_text.trim() !== '' && (
                                      <p className="text-xs text-slate-700 bg-white p-1.5 rounded border border-slate-200 italic leading-snug">
                                        "{answer.answer_text}"
                                      </p>
                                    )}
                                    
                                    {/* Show message if neither rating nor comment provided */}
                                    {(!answer.answer_star || answer.answer_star === 0) && (!answer.answer_text || answer.answer_text.trim() === '') && (
                                      <p className="text-xs text-slate-400 italic">(No response provided)</p>
                                    )}
                                  </div>
                                ))}
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
                  ) : (
                    <div className="text-center py-8 bg-green-50 rounded-lg border border-green-200">
                      <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">Great! Everyone has responded</p>
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
        {!canCreateFeedback && (
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
            <span className="text-green-800 font-medium">Feedback submitted successfully!</span>
          </div>
        )}

        {/* Staff/Student: View and Respond to Forms */}
        {canReplyFeedback && !canCreateFeedback && !selectedForm && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">Available Feedback Forms</h2>
            
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
                        : 'hover:border-indigo-300 hover:shadow-md cursor-pointer'
                    }`}
                    onClick={() => {
                      if (!form.is_submitted) {
                        console.log('Opening feedback form:', form);
                        setSelectedForm(form);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-slate-800">
                            {form.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Open Feedback'}
                          </h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            form.type === 'SUBJECT_FEEDBACK' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {form.type === 'SUBJECT_FEEDBACK' ? 'About Subjects' : 'General'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {form.target_display}
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
                      </div>
                      {form.is_submitted ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
                          <CheckCircle className="w-5 h-5" />
                          <span className="font-medium">Submitted</span>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedForm(form);
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
                      onClick={() => setSelectedSubject(null)}
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
                        : selectedForm.type === 'SUBJECT_FEEDBACK' ? 'Subject Feedback' : 'Open Feedback'
                      }
                    </h2>
                    <p className="text-slate-600 text-sm mt-1">
                      {selectedSubject 
                        ? `${selectedSubject.subject_code} • ${selectedSubject.staff_name}`
                        : `${selectedForm.target_display} • ${selectedForm.questions.length} questions`
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
                                {studentSubjects.completed_subjects} / {studentSubjects.total_subjects}
                              </p>
                              <p className="text-sm text-indigo-700">Completed</p>
                            </div>
                          </div>
                        </div>

                        {/* Subject Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {studentSubjects.subjects.map((subject) => (
                            <button
                              key={subject.teaching_assignment_id}
                              onClick={() => {
                                setSelectedSubject(subject);
                                setCurrentSubjectResponses({});
                              }}
                              className={`p-4 rounded-lg border-2 transition-all text-left ${
                                subject.is_completed
                                  ? 'border-green-300 bg-green-50 hover:bg-green-100'
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
                {(selectedForm.type === 'OPEN_FEEDBACK' || selectedSubject) && selectedForm.questions.map((question, index) => (
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
                          {question.allow_comment && (
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
                            Rate (1-5 stars) {question.allow_comment && <span className="text-red-500">*</span>}
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
                        </div>
                      )}

                      {/* Text Comment Input */}
                      {question.allow_comment && (
                        <div>
                          <p className="text-sm font-medium text-slate-700 mb-2">
                            Comment {question.allow_rating && <span className="text-slate-500">(Optional)</span>}
                          </p>
                          <textarea
                            value={(selectedSubject ? currentSubjectResponses : responses)[question.id!]?.answer_text || ''}
                            onChange={(e) => handleResponseChange(question.id!, 'TEXT', e.target.value)}
                            placeholder={question.allow_rating ? "Add your comments here (optional)..." : "Type your response here..."}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={4}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Submit Button - Only show when viewing questions, not subject list */}
                {(selectedForm.type === 'OPEN_FEEDBACK' || selectedSubject) && (
                  <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={handleSubmitResponse}
                      disabled={submittingResponse}
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
                      onClick={selectedSubject ? () => setSelectedSubject(null) : handleCloseForm}
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
              {canCreateFeedback ? 'HOD' : canReplyFeedback ? user?.profile_type || 'User' : 'Viewer'}
            </p>
            <p className="text-sm text-slate-500 mt-1">Current access level</p>
          </div>
        </div>
      </div>
    </div>
  );
}
