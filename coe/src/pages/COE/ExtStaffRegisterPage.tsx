import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, Send, Mail, Lock, Eye, EyeOff, ArrowRight, UserPlus, Search, Building2 } from 'lucide-react';
import idcsLogo from '../../assets/idcs-logo.png';
import krctLogo from '../../assets/krlogo.png';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FieldConfig {
  field: string;
  enabled: boolean;
  required: boolean;
  label: string;
  type: string;
  options?: string[];
  order: number;
}

interface FormData {
  form_code: string;
  form_title: string;
  form_description: string;
  is_accepting_responses: boolean;
  fields: FieldConfig[];
  message?: string;
}

interface SubmissionResult {
  success: boolean;
  message: string;
  ext_uid?: string;
  username?: string;
  email?: string;
}

interface CollegeResult {
  id: number;
  code: string;
  name: string;
  short_name: string;
  city: string;
  display: string;
}

type Step = 'email' | 'signup' | 'form' | 'success' | 'already-registered';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExtStaffRegisterPage() {
  const { formCode } = useParams<{ formCode: string }>();
  
  // Step management
  const [step, setStep] = useState<Step>('email');
  
  // Form data
  const [formData, setFormData] = useState<FormData | null>(null);
  
  // Email step state
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  
  // Signup step state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signupErrors, setSignupErrors] = useState<Record<string, string>>({});
  const [signingUp, setSigningUp] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [extUid, setExtUid] = useState<string | null>(null);
  
  // Skip email state
  const [skipEmail, setSkipEmail] = useState(false);
  const [fullName, setFullName] = useState('');
  
  // Form filling step state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [result, setResult] = useState<SubmissionResult | null>(null);
  
  // College autocomplete state
  const [collegeQuery, setCollegeQuery] = useState('');
  const [collegeResults, setCollegeResults] = useState<CollegeResult[]>([]);
  const [selectedCollege, setSelectedCollege] = useState<CollegeResult | null>(null);
  const [collegeSearching, setCollegeSearching] = useState(false);
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);
  const collegeDropdownRef = useRef<HTMLDivElement>(null);
  const collegeSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── College search with debounce ───────────────────────────────────────────

  const searchColleges = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCollegeResults([]);
      return;
    }
    
    setCollegeSearching(true);
    try {
      const res = await fetch(`/api/colleges/search/?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setCollegeResults(data.results || []);
      }
    } catch (e) {
      console.error('College search error:', e);
    } finally {
      setCollegeSearching(false);
    }
  }, []);

  const handleCollegeInputChange = (value: string) => {
    setCollegeQuery(value);
    setSelectedCollege(null);
    // Clear the college_name value since no college is selected
    setValues((prev) => {
      const n = { ...prev };
      delete n['college_name'];
      return n;
    });
    setShowCollegeDropdown(true);
    
    // Debounce search
    if (collegeSearchTimeout.current) {
      clearTimeout(collegeSearchTimeout.current);
    }
    collegeSearchTimeout.current = setTimeout(() => {
      searchColleges(value);
    }, 300);
  };

  const handleSelectCollege = (college: CollegeResult) => {
    setSelectedCollege(college);
    setCollegeQuery(college.name);
    setValues((prev) => ({ ...prev, college_name: college.name }));
    setShowCollegeDropdown(false);
    setCollegeResults([]);
    // Clear any field error for college_name
    setFieldErrors((prev) => {
      const n = { ...prev };
      delete n['college_name'];
      return n;
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (collegeDropdownRef.current && !collegeDropdownRef.current.contains(e.target as Node)) {
        setShowCollegeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Load form ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!formCode) return;
    
    const loadForm = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/academics/ext-staff-form/public/${formCode}/`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Form not found. Please check the link and try again.');
          } else {
            throw new Error('Failed to load form');
          }
          return;
        }
        const data = await res.json();
        setFormData(data);
      } catch (e: any) {
        setError(e?.message || 'Error loading form');
      } finally {
        setLoading(false);
      }
    };
    
    void loadForm();
  }, [formCode]);

  // ── Check email ────────────────────────────────────────────────────────────

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setEmailError('Please enter your email address');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    
    setCheckingEmail(true);
    setEmailError(null);
    
    try {
      const res = await fetch(`/api/academics/ext-staff-form/public/${formCode}/check-email/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setEmailError(data.error || data.detail || 'Failed to check email');
        return;
      }
      
      if (data.exists) {
        setStep('already-registered');
      } else {
        setStep('signup');
      }
    } catch (e: any) {
      setEmailError(e?.message || 'Network error');
    } finally {
      setCheckingEmail(false);
    }
  };

  // ── Signup ─────────────────────────────────────────────────────────────────

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors: Record<string, string> = {};
    
    // Validate full name if skipping email
    if (skipEmail) {
      if (!fullName.trim()) {
        errors.full_name = 'Full name is required';
      }
    }
    
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    if (!confirmPassword) {
      errors.confirm_password = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirm_password = 'Passwords do not match';
    }
    
    if (Object.keys(errors).length > 0) {
      setSignupErrors(errors);
      return;
    }
    
    setSigningUp(true);
    setSignupErrors({});
    
    try {
      const payload: Record<string, any> = {
        password,
        confirm_password: confirmPassword,
      };
      
      if (skipEmail) {
        payload.skip_email = true;
        payload.full_name = fullName.trim();
      } else {
        payload.email = email.trim().toLowerCase();
      }
      
      const res = await fetch(`/api/academics/ext-staff-form/public/${formCode}/signup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (data.errors) {
          setSignupErrors(data.errors);
        } else {
          setSignupErrors({ form: data.detail || 'Signup failed' });
        }
        return;
      }
      
      // Store user_id and ext_uid for profile submission
      setUserId(data.user_id);
      setExtUid(data.ext_uid);
      setStep('form');
    } catch (e: any) {
      setSignupErrors({ form: e?.message || 'Network error' });
    } finally {
      setSigningUp(false);
    }
  };

  // ── Handle input change ────────────────────────────────────────────────────

  const handleChange = (field: string, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  const handleFileChange = (field: string, file: File | null) => {
    if (file) {
      setFiles((prev) => ({ ...prev, [field]: file }));
    } else {
      setFiles((prev) => {
        const newFiles = { ...prev };
        delete newFiles[field];
        return newFiles;
      });
    }
  };

  // ── Submit form ────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData || !formCode || !userId) return;

    // Client-side validation (skip email since already captured)
    const errors: Record<string, string> = {};
    formData.fields.forEach((field) => {
      if (field.field === 'email') return; // Skip email validation
      
      // Special validation for college_name - must be selected from dropdown
      if (field.field === 'college_name' && field.enabled) {
        if (!selectedCollege) {
          errors[field.field] = 'Please select a college from the list';
        }
        return;
      }
      
      if (field.required) {
        // For file fields, check the files state
        if (field.type === 'file') {
          if (!files[field.field]) {
            errors[field.field] = `${field.label} is required`;
          }
        } else {
          const value = values[field.field];
          if (!value || !value.trim()) {
            errors[field.field] = `${field.label} is required`;
          }
        }
      }
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const submitData = new FormData();
      
      // Add user_id from signup
      submitData.append('user_id', userId.toString());
      
      // Add text fields
      Object.entries(values).forEach(([key, value]) => {
        submitData.append(key, value);
      });
      
      // Add files
      Object.entries(files).forEach(([key, file]) => {
        submitData.append(key, file);
      });

      const res = await fetch(`/api/academics/ext-staff-form/public/${formCode}/`, {
        method: 'POST',
        body: submitData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.errors) {
          setFieldErrors(data.errors);
        } else {
          setError(data.detail || 'Submission failed. Please try again.');
        }
        return;
      }

      setResult(data);
      setStep('success');
    } catch (e: any) {
      setError(e?.message || 'Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Logo Header ───────────────────────────────────────────────────────────

  const LogoHeader = ({ sticky = false }: { sticky?: boolean }) => (
    <div className={`bg-white border-b border-gray-100 px-6 py-4 ${sticky ? 'sticky top-0 z-50 shadow-md' : 'rounded-t-2xl'}`}>
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <img src={krctLogo} alt="KRCT Logo" className="h-14 sm:h-16 w-auto object-contain" />
        <div className="text-center flex-1 px-4">
          <h2 className="text-sm sm:text-base font-semibold text-[#6f1d34] uppercase tracking-wide">K. Ramakrishnan College of Technology</h2>
          <p className="text-xs text-gray-500 mt-0.5">Autonomous Institution | Affiliated to Anna University</p>
        </div>
        <img src={idcsLogo} alt="IDCS Logo" className="h-14 sm:h-16 w-auto object-contain" />
      </div>
    </div>
  );

  // ─── Render States ─────────────────────────────────────────────────────────

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fdf2f4] to-[#f8f9fa] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <LogoHeader />
          <div className="bg-white rounded-b-2xl shadow-xl p-8 text-center">
            <Loader2 className="w-12 h-12 text-[#6f1d34] animate-spin mx-auto" />
            <p className="mt-4 text-gray-600">Loading registration form...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !formData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fdf2f4] to-[#f8f9fa] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <LogoHeader />
          <div className="bg-white rounded-b-2xl shadow-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-gray-800">Form Not Available</h2>
            <p className="mt-2 text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Form closed state
  if (formData && !formData.is_accepting_responses) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fdf2f4] to-[#f8f9fa] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <LogoHeader />
          <div className="bg-white rounded-b-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-orange-500" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-gray-800">{formData.form_title}</h2>
            <p className="mt-2 text-gray-600">{formData.message || 'This form is currently not accepting responses.'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Already registered state
  if (step === 'already-registered') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fdf2f4] to-[#f8f9fa] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <LogoHeader />
          <div className="bg-white rounded-b-2xl shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-gray-800">Already Registered</h2>
            <p className="mt-2 text-gray-600">
              The email <strong className="text-[#6f1d34]">{email}</strong> is already registered in our system.
            </p>
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Please login to the COE portal and go to your <strong>Profile</strong> to view or edit your details.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setEmail('');
                  setStep('email');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Try Another Email
              </button>
              <a
                href="/login"
                className="flex-1 px-4 py-2 bg-[#6f1d34] text-white rounded-lg hover:bg-[#591729] transition-colors text-center"
              >
                Go to Login
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (step === 'success' && result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f0fdf4] to-[#f8f9fa] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <LogoHeader />
          <div className="bg-white rounded-b-2xl shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-800">Account Created Successfully!</h2>
            <p className="mt-2 text-gray-600">{result.message}</p>
            
            {/* Prominent External ID Display */}
            <div className="mt-6 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
              <div className="flex items-center justify-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">Your External ID is:</span>
              </div>
              <code className="mt-2 block text-2xl font-bold text-green-800 bg-white px-4 py-2 rounded-lg border border-green-300">
                {result.ext_uid}
              </code>
              <p className="mt-2 text-sm text-green-600">
                Please save this ID for future reference
              </p>
            </div>
            
            <div className="mt-6 bg-gray-50 rounded-lg p-4 text-left">
              <h3 className="font-semibold text-gray-800 mb-2">Your Account Details:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Username:</span>
                  <span className="font-medium text-gray-800">{result.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium text-gray-800">{result.email}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Email entry
  if (step === 'email') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fdf2f4] to-[#f8f9fa] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <LogoHeader />
          <div className="bg-[#6f1d34] px-6 py-4 text-white">
            <h1 className="text-xl font-bold">{formData?.form_title}</h1>
            <p className="text-sm text-white/80 mt-1">External Staff Registration</p>
          </div>
          <form onSubmit={handleCheckEmail} className="bg-white rounded-b-2xl shadow-xl p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#fdf2f4] rounded-full flex items-center justify-center mx-auto mb-3">
                <Mail className="w-8 h-8 text-[#6f1d34]" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800">Enter Your Email</h2>
              <p className="text-sm text-gray-500 mt-1">We'll check if you're already registered</p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                placeholder="your.email@example.com"
                className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                  emailError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                autoFocus
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-500">{emailError}</p>
              )}
            </div>
            
            <button
              type="submit"
              disabled={checkingEmail}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#6f1d34] text-white rounded-lg font-semibold hover:bg-[#591729] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {checkingEmail ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setSkipEmail(true);
                  setStep('signup');
                }}
                className="w-full text-center text-sm text-gray-500 hover:text-[#6f1d34] transition-colors"
              >
                Continue without email
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Step 2: Signup
  if (step === 'signup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fdf2f4] to-[#f8f9fa] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <LogoHeader />
          <div className="bg-[#6f1d34] px-6 py-4 text-white">
            <h1 className="text-xl font-bold">Create Your Account</h1>
            <p className="text-sm text-white/80 mt-1">Step 2 of 3: Set up your {skipEmail ? 'name and ' : ''}password</p>
          </div>
          <form onSubmit={handleSignup} className="bg-white rounded-b-2xl shadow-xl p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#fdf2f4] rounded-full flex items-center justify-center mx-auto mb-3">
                <UserPlus className="w-8 h-8 text-[#6f1d34]" />
              </div>
              {skipEmail ? (
                <p className="text-sm text-gray-600">Register without email</p>
              ) : (
                <p className="text-sm text-gray-600">
                  Creating account for: <strong className="text-[#6f1d34]">{email}</strong>
                </p>
              )}
            </div>
            
            {signupErrors.form && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                {signupErrors.form}
              </div>
            )}
            
            {skipEmail && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setSignupErrors((prev) => {
                      const n = { ...prev };
                      delete n.full_name;
                      return n;
                    });
                  }}
                  placeholder="Enter your full name"
                  className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                    signupErrors.full_name ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                  autoFocus
                />
                {signupErrors.full_name && (
                  <p className="mt-1 text-sm text-red-500">{signupErrors.full_name}</p>
                )}
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setSignupErrors((prev) => {
                      const n = { ...prev };
                      delete n.password;
                      return n;
                    });
                  }}
                  placeholder="Enter a strong password"
                  className={`w-full px-4 py-3 pr-12 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                    signupErrors.password ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {signupErrors.password && (
                <p className="mt-1 text-sm text-red-500">{signupErrors.password}</p>
              )}
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setSignupErrors((prev) => {
                      const n = { ...prev };
                      delete n.confirm_password;
                      return n;
                    });
                  }}
                  placeholder="Re-enter your password"
                  className={`w-full px-4 py-3 pr-12 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                    signupErrors.confirm_password ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {signupErrors.confirm_password && (
                <p className="mt-1 text-sm text-red-500">{signupErrors.confirm_password}</p>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setSkipEmail(false);
                  setStep('email');
                }}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={signingUp}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#6f1d34] text-white rounded-lg font-semibold hover:bg-[#591729] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {signingUp ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Step 3: Form filling
  // Filter out email field since it's already captured
  const formFields = formData?.fields.filter(f => f.field !== 'email') || [];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fdf2f4] to-[#f8f9fa]">
      {/* Sticky Logo Header */}
      <LogoHeader sticky />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Title Header */}
        <div className="bg-[#6f1d34] rounded-t-xl px-6 py-4 text-white">
          <h1 className="text-xl font-bold">{formData?.form_title}</h1>
          <p className="text-sm text-white/80 mt-1">Step 3 of 3: Complete your profile</p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Mail size={14} />
            <span className="text-white/80">{email}</span>
            {extUid && (
              <>
                <span className="text-white/40">|</span>
                <span className="text-white/80">UID: {extUid}</span>
              </>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-b-xl shadow-xl">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {formFields.map((field) => (
              <div key={field.field} className={field.type === 'textarea' || field.type === 'file' ? 'md:col-span-2' : ''}>
                <label className="block mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </span>
                </label>

                {field.type === 'select' && field.options ? (
                  <select
                    value={values[field.field] || ''}
                    onChange={(e) => handleChange(field.field, e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                      fieldErrors[field.field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select {field.label}</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === 'date' ? (
                  <input
                    type="date"
                    value={values[field.field] || ''}
                    onChange={(e) => handleChange(field.field, e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                      fieldErrors[field.field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                ) : field.type === 'file' ? (
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(field.field, e.target.files?.[0] || null)}
                    className={`w-full px-4 py-3 border rounded-lg text-sm ${
                      fieldErrors[field.field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={values[field.field] || ''}
                    onChange={(e) => handleChange(field.field, e.target.value)}
                    rows={3}
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                      fieldErrors[field.field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                ) : field.field === 'college_name' ? (
                  /* College Autocomplete */
                  <div className="relative" ref={collegeDropdownRef}>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={collegeQuery}
                        onChange={(e) => handleCollegeInputChange(e.target.value)}
                        onFocus={() => setShowCollegeDropdown(true)}
                        className={`w-full pl-10 pr-10 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                          fieldErrors[field.field] ? 'border-red-300 bg-red-50' : selectedCollege ? 'border-green-300 bg-green-50' : 'border-gray-300'
                        }`}
                        placeholder="Type to search colleges..."
                        autoComplete="off"
                      />
                      {collegeSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
                      )}
                      {selectedCollege && !collegeSearching && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                      )}
                    </div>
                    
                    {/* Dropdown results */}
                    {showCollegeDropdown && collegeQuery.length >= 2 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                        {collegeResults.length > 0 ? (
                          collegeResults.map((college) => (
                            <button
                              key={college.id}
                              type="button"
                              onClick={() => handleSelectCollege(college)}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-gray-50"
                            >
                              <div className="text-sm font-medium text-gray-900">{college.name}</div>
                              {college.city && (
                                <div className="text-xs text-gray-500 mt-0.5">{college.city}</div>
                              )}
                            </button>
                          ))
                        ) : !collegeSearching ? (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">
                            <AlertCircle className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                            No colleges found for "{collegeQuery}"
                          </div>
                        ) : null}
                      </div>
                    )}
                    
                    {/* Helper text */}
                    {!selectedCollege && collegeQuery.length < 2 && (
                      <p className="mt-1 text-xs text-gray-500">
                        <Search className="inline w-3 h-3 mr-1" />
                        Type at least 2 characters to search
                      </p>
                    )}
                    {selectedCollege && (
                      <p className="mt-1 text-xs text-green-600">
                        <CheckCircle2 className="inline w-3 h-3 mr-1" />
                        Selected: {selectedCollege.name}
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type={field.type === 'tel' ? 'tel' : 'text'}
                    value={values[field.field] || ''}
                    onChange={(e) => handleChange(field.field, e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent ${
                      fieldErrors[field.field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                )}

                {fieldErrors[field.field] && (
                  <p className="mt-1 text-sm text-red-500">{fieldErrors[field.field]}</p>
                )}
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl">
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#6f1d34] text-white rounded-lg font-semibold hover:bg-[#591729] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Submit Registration
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          External Staff Registration Portal
        </p>
      </div>
    </div>
  );
}
