import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getMe, requestMobileOtp, verifyMobileOtp, removeMobileNumber, changePassword, getCachedMe } from '../../services/auth';
import { User, Mail, Shield, Building, Briefcase, School, Phone, CheckCircle2, Trash2, Key, Eye, EyeOff, Edit2, Save, X, Camera, CreditCard, XCircle, Award, MapPin, Bus, Users, Sparkles, AlertCircle, Navigation, Heart, Calendar } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { ModalPortal } from '../../components/ModalPortal';
import logo from '../../assets/idcs-logo.png';
import indiaFlag from '../../assets/india-flag.svg';
import fetchWithAuth from '../../services/fetchAuth';
import { getApiBase } from '../../services/apiBase';

export const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
  'A1+', 'A1-', 'A2+', 'A2-', 'A1B+', 'A1B-', 'A2B+', 'A2B-',
  'Bombay Blood Group', 'Other'
] as const;

type RoleObj = { name: string };
type Me = {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  profileEdited?: boolean;
  name_email_edited?: boolean;
  roles?: string[] | RoleObj[];
  permissions?: string[];
  profile_type?: string | null;
  profile_status?: string | null;
  capabilities?: Record<string, string[]>;
  profile_image?: string;
  profile_image_updated?: boolean;
  pbas_credit?: number;
  pbas_scores?: Record<string, number>;
  profile?: any;
  college?: {
    code?: string;
    name?: string;
    short_name?: string;
    address?: string;
  };
};

const DEFAULT_COUNTRY_CODE = '91';
const AVATAR_EDITOR_FRAME_SIZE = 280;
const AVATAR_UPLOAD_SIZE = 512;
const PBAS_SCORE_CATEGORIES = [
  'Academics',
  'Student Development',
  'Research and Development',
  'Institutional Contribution',
] as const;

type AvatarNatural = {
  width: number;
  height: number;
};

type AvatarOffset = {
  x: number;
  y: number;
};

function normalizeMobileForApi(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let digits = s.replace(/\D+/g, '');
  if (!digits) return '';

  // Local formats -> add country code
  if (digits.length === 10) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }

  // Guard against accidental double country-code prefix (e.g. 9191XXXXXXXXXX)
  if (digits.startsWith(DEFAULT_COUNTRY_CODE + DEFAULT_COUNTRY_CODE) && digits.length === (DEFAULT_COUNTRY_CODE.length * 2 + 10)) {
    digits = digits.slice(DEFAULT_COUNTRY_CODE.length);
  }

  if (digits.length < 11 || digits.length > 15) return '';
  return `+${digits}`;
}

function normalizeMobileForUi(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return normalizeMobileForApi(s) || s;
}

function getDisplayName(me: Me | null | undefined): string {
  const first = String(me?.first_name || '').trim();
  const last = String(me?.last_name || '').trim();
  return String(`${first} ${last}`).trim();
}

export function formatDobDisplay(val?: string | null): string {
  if (!val) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}-${m}-${y}`;
  }
  return s;
}

export default function ProfilePage({ user: initialUser }: { user?: Me | null }) {
  const [user, setUser] = useState<Me | null | undefined>(initialUser === undefined ? null : initialUser);
  const [loading, setLoading] = useState(initialUser ? false : true);
  const [error, setError] = useState<string | null>(null);

  const rfidUid = useMemo(() => {
    const candidateKeys = ['rfid_uid', 'rfid', 'rfidId', 'rfid_id', 'rfid_no', 'rfid_number'];
    const root = user as any;
    const nested = (user as any)?.profile as any;

    for (const obj of [root, nested]) {
      if (!obj || typeof obj !== 'object') continue;
      for (const k of candidateKeys) {
        const v = String(obj?.[k] ?? '').trim();
        if (v) return v;
      }
    }
    return '';
  }, [user]);

  const profileMobile = useMemo(() => normalizeMobileForUi((user as any)?.profile?.mobile_number), [user]);
  const profileMobileVerified = useMemo(() => Boolean((user as any)?.profile?.mobile_verified), [user]);

  const [mobileDraft, setMobileDraft] = useState('');
  const [mobileEditing, setMobileEditing] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpDraft, setOtpDraft] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const [otpExpiresAtMs, setOtpExpiresAtMs] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState<number>(0);

  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removePassword, setRemovePassword] = useState('');
  const [verifySuccess, setVerifySuccess] = useState(false);

  // Change password states
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changePasswordBusy, setChangePasswordBusy] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);

  // One-time edit state for name using a single source of truth for UI sync.
  const [isEditingName, setIsEditingName] = useState(false);
  const [profile, setProfile] = useState({ name: '', first_name: '', last_name: '', email: '', nameEdited: false });
  const [nameEmailEditError, setNameEmailEditError] = useState<string | null>(null);
  const [nameEmailSaving, setNameEmailSaving] = useState(false);
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailEditError, setEmailEditError] = useState<string | null>(null);

  // Student specific data & completion config
  const [modesOfTransportation, setModesOfTransportation] = useState<Array<{ id: number; name: string }>>([]);
  const [completionConfig, setCompletionConfig] = useState<{
    is_overall_compulsory: boolean;
    fields_config: Record<string, boolean>;
  } | null>(null);

  // Personal Details editing states (DOB & Blood Group)
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [personalDraft, setPersonalDraft] = useState({
    dob: '',
    blood_group: '',
  });
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);

  // Parents Information editing states (Father's Name & Mother's Name)
  const [isEditingParentNames, setIsEditingParentNames] = useState(false);
  const [parentNamesDraft, setParentNamesDraft] = useState({
    father_name: '',
    mother_name: '',
  });
  const [parentNamesSaving, setParentNamesSaving] = useState(false);
  const [parentNamesError, setParentNamesError] = useState<string | null>(null);

  // Address editing states
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState({
    address_line1: '',
    address_line2: '',
    address_line3: '',
    district: '',
    pincode: '',
  });
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Parent contact editing states
  const [isEditingParents, setIsEditingParents] = useState(false);
  const [parentsDraft, setParentsDraft] = useState({
    father_mobile: '',
    mother_mobile: '',
  });
  const [parentsSaving, setParentsSaving] = useState(false);
  const [parentsError, setParentsError] = useState<string | null>(null);

  // Mode of Transportation editing states
  const [isEditingTransport, setIsEditingTransport] = useState(false);
  const [transportDraft, setTransportDraft] = useState<{
    mode_of_transportation_id: number | string;
    boarding_point: string;
  }>({
    mode_of_transportation_id: '',
    boarding_point: '',
  });
  const [transportSaving, setTransportSaving] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarCandidateIndex, setAvatarCandidateIndex] = useState(0);
  const [avatarConfirmModalOpen, setAvatarConfirmModalOpen] = useState(false);
  const [avatarPendingFile, setAvatarPendingFile] = useState<File | null>(null);
  const [avatarEditorSrc, setAvatarEditorSrc] = useState<string | null>(null);
  const [avatarEditorNatural, setAvatarEditorNatural] = useState<AvatarNatural | null>(null);
  const [avatarEditorScale, setAvatarEditorScale] = useState(1);
  const [avatarEditorOffset, setAvatarEditorOffset] = useState<AvatarOffset>({ x: 0, y: 0 });
  const [avatarEditorDragging, setAvatarEditorDragging] = useState(false);
  const [avatarUnlockRequestBusy, setAvatarUnlockRequestBusy] = useState(false);
  const [avatarUnlockRequestError, setAvatarUnlockRequestError] = useState<string | null>(null);
  const [avatarUnlockRequestInfo, setAvatarUnlockRequestInfo] = useState<string | null>(null);
  const [avatarUnlockRequestStatus, setAvatarUnlockRequestStatus] = useState<string | null>(null);
  const [avatarUnlockModalOpen, setAvatarUnlockModalOpen] = useState(false);
  const [avatarUnlockRequestReason, setAvatarUnlockRequestReason] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarDragPointerIdRef = useRef<number | null>(null);
  const avatarDragStartRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);

  function getBaseAvatarScale(natural: AvatarNatural): number {
    return Math.max(
      AVATAR_EDITOR_FRAME_SIZE / Math.max(1, natural.width),
      AVATAR_EDITOR_FRAME_SIZE / Math.max(1, natural.height),
    );
  }

  function getAvatarRenderedSize(natural: AvatarNatural, scaleMultiplier: number) {
    const baseScale = getBaseAvatarScale(natural);
    const scale = baseScale * scaleMultiplier;
    return {
      width: natural.width * scale,
      height: natural.height * scale,
      effectiveScale: scale,
    };
  }

  function clampAvatarOffset(offset: AvatarOffset, natural: AvatarNatural, scaleMultiplier: number): AvatarOffset {
    const rendered = getAvatarRenderedSize(natural, scaleMultiplier);
    const maxX = Math.max(0, (rendered.width - AVATAR_EDITOR_FRAME_SIZE) / 2);
    const maxY = Math.max(0, (rendered.height - AVATAR_EDITOR_FRAME_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, offset.x)),
      y: Math.min(maxY, Math.max(-maxY, offset.y)),
    };
  }

  const normalizeMeResponse = (value: any): Me => ({
    ...value,
    roles: Array.isArray(value?.roles)
      ? value.roles.map((role: string | RoleObj) => (typeof role === 'string' ? role : role?.name))
      : [],
  });

  const applyUserUpdate = (value: any) => {
    const normalized = normalizeMeResponse(value);
    setUser(normalized);
    window.dispatchEvent(new CustomEvent('idcs:me-updated', { detail: normalized }));
    return normalized;
  };

  useEffect(() => {
    const current = profileMobile || '';
    let initialDraft = '';
    if (current) {
      const normalized = normalizeMobileForApi(current);
      if (normalized) {
        const digits = normalized.replace(/\D+/g, '');
        if (digits.length >= 10) {
          initialDraft = digits.slice(-10);
        }
      }
    }
    setMobileDraft(initialDraft);
    setMobileEditing(!profileMobileVerified || !current);
    setOtpSent(false);
    setOtpDraft('');
    setOtpError(null);
    setOtpInfo(null);
    setOtpExpiresAtMs(null);
    setOtpSecondsLeft(0);
    setVerifySuccess(false);
  }, [profileMobile, profileMobileVerified]);

  useEffect(() => {
    if (!otpSent || !otpExpiresAtMs) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((otpExpiresAtMs - Date.now()) / 1000));
      setOtpSecondsLeft(left);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [otpSent, otpExpiresAtMs]);

  useEffect(() => {
    if (initialUser) return;

    // Try to use cached user data first to prevent unnecessary API calls
    const cached = getCachedMe();
    if (cached) {
      const normalized = {
        ...cached,
        roles: Array.isArray(cached.roles)
          ? cached.roles.map((role: string | RoleObj) => (typeof role === 'string' ? role : role.name))
          : [],
      } as Me;
      setUser(normalized);
      setLoading(false);
      return;
    }

    // If no cache, fetch from API
    let mounted = true;
    setLoading(true);
    getMe()
      .then((r) => {
        if (!mounted) return;
        const normalized = {
          ...r,
          roles: Array.isArray(r.roles)
            ? r.roles.map((role: string | RoleObj) => (typeof role === 'string' ? role : role.name))
            : [],
        } as Me;
        setUser(normalized);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, [initialUser]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    return () => {
      if (avatarEditorSrc) {
        URL.revokeObjectURL(avatarEditorSrc);
      }
    };
  }, [avatarEditorSrc]);

  useEffect(() => {
    const edited = Boolean((user as any)?.profileEdited ?? (user as any)?.name_email_edited);
    setProfile({
      name: getDisplayName(user),
      first_name: String(user?.first_name || ''),
      last_name: String(user?.last_name || ''),
      email: String(user?.email || ''),
      nameEdited: edited,
    });
    if (edited) setIsEditingName(false);

    const prof = (user as any)?.profile || {};
    setPersonalDraft({
      dob: String(prof.dob || ''),
      blood_group: String(prof.blood_group || ''),
    });
    setParentNamesDraft({
      father_name: String(prof.father_name || ''),
      mother_name: String(prof.mother_name || ''),
    });
    setAddressDraft({
      address_line1: String(prof.address_line1 || ''),
      address_line2: String(prof.address_line2 || ''),
      address_line3: String(prof.address_line3 || ''),
      district: String(prof.district || ''),
      pincode: String(prof.pincode || ''),
    });
    setParentsDraft({
      father_mobile: String(prof.father_mobile || ''),
      mother_mobile: String(prof.mother_mobile || ''),
    });
    setTransportDraft({
      mode_of_transportation_id: prof.mode_of_transportation_id || '',
      boarding_point: String(prof.boarding_point || ''),
    });
  }, [user]);

  useEffect(() => {
    if (user?.profile_type === 'STUDENT') {
      fetchWithAuth('/api/academics/modes-of-transportation/')
        .then((res) => res.ok ? res.json() : [])
        .then((data) => setModesOfTransportation(data || []))
        .catch(() => {});

      fetchWithAuth('/api/academics/student-profile/completion-config/')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data) setCompletionConfig(data);
        })
        .catch(() => {});
    }
  }, [user?.profile_type]);

  const completionDetails = useMemo(() => {
    if (user?.profile_type !== 'STUDENT') return null;

    const prof = (user as any)?.profile || {};
    const config = completionConfig?.fields_config || {
      father_name: true,
      mother_name: true,
      dob: true,
      blood_group: true,
      address_line1: true,
      address_line2: true,
      address_line3: false,
      district: true,
      pincode: true,
      father_mobile: true,
      mother_mobile: true,
      mode_of_transportation: true,
    };

    const isBus = (() => {
      const modeId = prof.mode_of_transportation_id;
      const modeName = prof.mode_of_transportation;
      if (!modeId && !modeName) return false;
      const found = modesOfTransportation.find((m) => String(m.id) === String(modeId));
      const name = found ? found.name : String(modeName || '');
      return name.toLowerCase().includes('college bus') || name.toLowerCase().includes('bus');
    })();

    const fieldValues: Record<string, any> = {
      father_name: prof.father_name,
      mother_name: prof.mother_name,
      dob: prof.dob,
      blood_group: prof.blood_group,
      address_line1: prof.address_line1,
      address_line2: prof.address_line2,
      address_line3: prof.address_line3,
      district: prof.district,
      pincode: prof.pincode,
      father_mobile: prof.father_mobile,
      mother_mobile: prof.mother_mobile,
      mode_of_transportation: prof.mode_of_transportation_id || prof.mode_of_transportation,
      boarding_point: prof.boarding_point,
    };

    const fieldLabels: Record<string, string> = {
      father_name: "Father's Name",
      mother_name: "Mother's Name",
      dob: 'Date of Birth',
      blood_group: 'Blood Group',
      address_line1: 'Address Line 1',
      address_line2: 'Address Line 2',
      address_line3: 'Address Line 3',
      district: 'District',
      pincode: 'Pincode',
      father_mobile: 'Parent/Guardian Number 1 (Compulsory)',
      mother_mobile: 'Parent Mobile Number 2',
      mode_of_transportation: 'Mode of Transportation',
      boarding_point: 'Boarding Point',
    };

    const evaluatedKeys = Object.keys(config).filter((k) => config[k] === true);
    if (config.mode_of_transportation && isBus && !evaluatedKeys.includes('boarding_point')) {
      evaluatedKeys.push('boarding_point');
    }

    if (evaluatedKeys.length === 0) {
      return {
        percentage: 100,
        completedCount: 0,
        totalCount: 0,
        missingFields: [],
        isOverallCompulsory: Boolean(completionConfig?.is_overall_compulsory),
      };
    }

    let completedCount = 0;
    const missingFields: string[] = [];

    evaluatedKeys.forEach((key) => {
      const val = fieldValues[key];
      const isFilled = val !== undefined && val !== null && String(val).trim().length > 0;
      if (isFilled) {
        completedCount += 1;
      } else {
        missingFields.push(fieldLabels[key] || key);
      }
    });

    const percentage = Math.round((completedCount / evaluatedKeys.length) * 100);

    return {
      percentage,
      completedCount,
      totalCount: evaluatedKeys.length,
      missingFields,
      isOverallCompulsory: Boolean(completionConfig?.is_overall_compulsory),
    };
  }, [user, completionConfig, modesOfTransportation]);

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile…</p>
        </div>
      </div>
    </DashboardLayout>
  );

  if (error) return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          Error loading profile: {error}
        </div>
      </div>
    </DashboardLayout>
  );

  if (!user) return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <div className="text-center text-gray-500">No profile available</div>
      </div>
    </DashboardLayout>
  );

  const initials = (user.username || 'U').slice(0, 2).toUpperCase();

  const rootAvatarValue = String((user as any)?.profile_image || '').trim();
  const nestedAvatarValue = String((user as any)?.profile?.profile_image || '').trim();
  const avatarSourceValue = rootAvatarValue || nestedAvatarValue;

  const avatarUrlCandidates = useMemo(() => {
    const raw = avatarSourceValue;
    if (!raw) return [] as string[];

    const normalized = raw.replace(/\\+/g, '/');

    if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('blob:') || normalized.startsWith('data:')) {
      return [normalized];
    }

    if (normalized.startsWith('/')) {
      // Use relative path first; avoid duplicate absolute+relative retries for the same resource.
      return [normalized];
    }

    const direct = `/media/${normalized}`;
    const apiBaseUrl = `${getApiBase()}/media/${normalized}`;

    // Deduplicate while preserving order.
    const unique = new Set<string>();
    for (const candidate of [direct, apiBaseUrl]) {
      const value = String(candidate || '').trim();
      if (value) unique.add(value);
    }
    return Array.from(unique);
  }, [avatarSourceValue]);

  useEffect(() => {
    setAvatarCandidateIndex(0);
  }, [avatarSourceValue]);

  const resolvedCandidate = avatarUrlCandidates[avatarCandidateIndex] || '';
  const hasLoadableCandidate = Boolean(avatarPreviewUrl) || avatarCandidateIndex < avatarUrlCandidates.length;
  const activeAvatarUrl = avatarPreviewUrl || resolvedCandidate;
  const avatarLocked = Boolean((user as any)?.profile_image_updated ?? (user as any)?.profile?.profile_image_updated);

  async function loadAvatarUnlockRequestStatus() {
    try {
      const res = await fetchWithAuth('/api/accounts/profile-image-update-requests/');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.detail || 'Failed to load profile image request status'));
      }
      const latestStatus = String(data?.latest?.status || '').trim();
      setAvatarUnlockRequestStatus(latestStatus || null);
      setAvatarUnlockRequestError(null);
    } catch (err: any) {
      setAvatarUnlockRequestStatus(null);
      setAvatarUnlockRequestError(String(err?.message || err || 'Failed to load request status'));
    }
  }

  useEffect(() => {
    if (avatarLocked) {
      loadAvatarUnlockRequestStatus();
    } else {
      setAvatarUnlockRequestStatus(null);
      setAvatarUnlockRequestError(null);
      setAvatarUnlockRequestInfo(null);
    }
  }, [avatarLocked]);

  function openAvatarUnlockModal() {
    if (!avatarLocked || avatarUnlockRequestBusy) return;
    setAvatarUnlockRequestReason('');
    setAvatarUnlockModalOpen(true);
  }

  async function submitAvatarUnlockRequest() {
    if (!avatarLocked || avatarUnlockRequestBusy) return;

    try {
      setAvatarUnlockRequestBusy(true);
      setAvatarUnlockRequestError(null);
      setAvatarUnlockRequestInfo(null);

      const res = await fetchWithAuth('/api/accounts/profile-image-update-requests/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: avatarUnlockRequestReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.detail || 'Failed to submit request'));
      }

      setAvatarUnlockRequestInfo('Request submitted successfully. Please wait for approval.');
      setAvatarUnlockRequestStatus('PENDING');
      setAvatarUnlockModalOpen(false);
    } catch (err: any) {
      setAvatarUnlockRequestError(String(err?.message || err || 'Failed to submit request'));
    } finally {
      setAvatarUnlockRequestBusy(false);
    }
  }

  const showVerifiedCheck = Boolean(profileMobileVerified && !mobileEditing && profileMobile);

  const handleMobileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onlyDigits = e.target.value.replace(/\D+/g, '').slice(0, 10);
    setMobileDraft(onlyDigits);
  };

  async function handleRequestOtp() {
    setOtpError(null);
    setOtpInfo(null);

    const nextMobile = normalizeMobileForApi(mobileDraft);
    if (!nextMobile) {
      setOtpError('Enter a valid mobile number.');
      return;
    }
    try {
      setOtpBusy(true);
      const res = await requestMobileOtp(nextMobile);
      setOtpSent(true);

      // In dev, backend may include debug OTP when SMS_BACKEND=console.
      const debugOtp = String((res as any)?.debug_otp || '').trim();
      if (debugOtp) {
        setOtpDraft(debugOtp);
      }

      const deliveryError = String((res as any)?.delivery_error || '').trim();

      const expiresIn = Number(res?.expires_in_seconds ?? 0);
      if (Number.isFinite(expiresIn) && expiresIn > 0) {
        setOtpExpiresAtMs(Date.now() + expiresIn * 1000);
        setOtpSecondsLeft(Math.ceil(expiresIn));
        const mins = Math.ceil(expiresIn / 60);
        setOtpInfo(deliveryError
          ? `OTP generated, but delivery failed (${deliveryError}). Valid for ${mins} minute${mins === 1 ? '' : 's'}.`
          : `OTP sent. Valid for ${mins} minute${mins === 1 ? '' : 's'}.`
        );
      } else {
        setOtpExpiresAtMs(null);
        setOtpSecondsLeft(0);
        setOtpInfo(deliveryError ? `OTP generated, but delivery failed (${deliveryError}).` : 'OTP sent.');
      }
    } catch (e: any) {
      const statusCode = Number(e?.response?.status || 0);
      if (statusCode === 429) {
        const retryAfter = Number(e?.response?.data?.retry_after_seconds || 0);
        const hint = retryAfter > 0 ? ` Try again in ${retryAfter}s.` : '';
        setOtpError(`Please wait before requesting another OTP.${hint}`);
        return;
      }
      const msg = statusCode === 401
        ? 'Session expired. Please login again and retry OTP request.'
        : String(e?.response?.data?.detail || e?.message || e || 'Failed to send OTP');
      setOtpError(msg);
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setOtpError(null);
    setOtpInfo(null);
    const nextMobile = normalizeMobileForApi(mobileDraft);
    const otp = String(otpDraft || '').trim();
    if (!nextMobile) {
      setOtpError('Enter a valid mobile number.');
      return;
    }
    if (!otp) {
      setOtpError('Enter OTP.');
      return;
    }
    try {
      setOtpBusy(true);
      const res = await verifyMobileOtp(nextMobile, otp);
      const me = (res && (res.me as any)) || null;
      if (me) {
        applyUserUpdate(me);
      } else {
        const r = await getMe();
        applyUserUpdate(r);
      }
      setOtpSent(false);
      setOtpDraft('');
      setOtpInfo(null);
      setOtpError(null);
      setMobileEditing(false);
      setOtpExpiresAtMs(null);
      setOtpSecondsLeft(0);
      setVerifySuccess(true);
      setTimeout(() => setVerifySuccess(false), 8000);
    } catch (e: any) {
      const statusCode = Number(e?.response?.status || 0);
      const msg = statusCode === 401
        ? 'Session expired. Please login again and retry OTP verification.'
        : String(e?.response?.data?.detail || e?.message || e || 'OTP verification failed');
      setOtpError(msg);
    } finally {
      setOtpBusy(false);
    }
  }

  const canResendOtp = otpSent && otpExpiresAtMs != null && otpSecondsLeft <= 0;

  async function handleRemoveMobile() {
    setRemoveError(null);
    const pwd = String(removePassword || '').trim();
    if (!pwd) {
      setRemoveError('Password is required.');
      return;
    }
    try {
      setRemoveBusy(true);
      const res = await removeMobileNumber(pwd);
      const me = (res && (res.me as any)) || null;
      if (me) {
        applyUserUpdate(me);
      } else {
        const r = await getMe();
        applyUserUpdate(r);
      }
      setRemoveModalOpen(false);
      setRemovePassword('');
      setRemoveError(null);
    } catch (e: any) {
      const statusCode = Number(e?.response?.status || 0);
      const msg = statusCode === 401
        ? 'Session expired or incorrect password.'
        : String(e?.response?.data?.detail || e?.message || e || 'Failed to remove mobile number');
      setRemoveError(msg);
    } finally {
      setRemoveBusy(false);
    }
  }

  async function handleChangePassword() {
    setChangePasswordError(null);
    setChangePasswordSuccess(false);

    const current = String(currentPassword || '').trim();
    const newPwd = String(newPassword || '').trim();
    const confirmPwd = String(confirmPassword || '').trim();

    if (!current) {
      setChangePasswordError('Current password is required.');
      return;
    }
    if (!newPwd) {
      setChangePasswordError('New password is required.');
      return;
    }
    if (!confirmPwd) {
      setChangePasswordError('Please confirm your new password.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setChangePasswordError('New passwords do not match.');
      return;
    }
    if (current === newPwd) {
      setChangePasswordError('New password must be different from current password.');
      return;
    }
    if (newPwd.length < 6) {
      setChangePasswordError('New password must be at least 6 characters long.');
      return;
    }

    try {
      setChangePasswordBusy(true);
      await changePassword(current, newPwd, confirmPwd);
      setChangePasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setChangePasswordModalOpen(false);
        setChangePasswordSuccess(false);
      }, 2000);
    } catch (e: any) {
      const statusCode = Number(e?.response?.status || 0);
      const msg = statusCode === 401
        ? 'Session expired or incorrect password.'
        : String(e?.response?.data?.detail || e?.message || e || 'Failed to change password');
      setChangePasswordError(msg);
    } finally {
      setChangePasswordBusy(false);
    }
  }

  async function handleSaveName() {
    setNameEmailEditError(null);
    const firstName = String(profile.first_name || '').trim();
    const lastName = String(profile.last_name || '').trim();

    // Allow repeated edits; no one-time confirmation.

    if (!firstName) {
      setNameEmailEditError('First name cannot be empty.');
      return;
    }

    try {
      setNameEmailSaving(true);
      const response = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to update profile');
      }

      const updated = await getMe();
      const normalized = {
        ...updated,
        roles: Array.isArray(updated.roles) ? updated.roles.map((role: any) => (typeof role === 'string' ? role : role.name)) : [],
      } as Me;
      setUser(normalized);
      setProfile({
        name: getDisplayName(normalized),
        first_name: String(normalized.first_name || ''),
        last_name: String(normalized.last_name || ''),
        email: String(normalized.email || ''),
        nameEdited: Boolean((normalized as any)?.profileEdited ?? (normalized as any)?.name_email_edited),
      });
      setIsEditingName(false);
    } catch (e: any) {
      setNameEmailEditError(String(e?.message || e || 'Failed to update profile'));
    } finally {
      setNameEmailSaving(false);
    }
  }

  async function handleSaveEmail() {
    setEmailEditError(null);
    const next = String((profile.email || '')).trim().toLowerCase();
    if (!next) {
      setEmailEditError('Email cannot be empty.');
      return;
    }
    // simple validation
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(next)) {
      setEmailEditError('Enter a valid email address.');
      return;
    }

    try {
      setEmailSaving(true);
      const response = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: next }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to update email');
      }
      const updated = await getMe();
      applyUserUpdate(updated);
      setProfile((p) => ({ ...p, email: String(updated.email || '') }));
      setEmailEditing(false);
    } catch (e: any) {
      setEmailEditError(String(e?.message || e || 'Failed to update email'));
    } finally {
      setEmailSaving(false);
    }
  }

  function startEditingName() {
    // Allow editing name even if previously edited
    setProfile((prev) => ({ ...prev, name: getDisplayName(user), first_name: String(user?.first_name || ''), last_name: String(user?.last_name || '') }));
    setIsEditingName(true);
    setNameEmailEditError(null);
  }

  function cancelEditingName() {
    setProfile((prev) => ({ ...prev, name: getDisplayName(user), first_name: String(user?.first_name || ''), last_name: String(user?.last_name || '') }));
    setIsEditingName(false);
    setNameEmailEditError(null);
  }

  function cancelEditingEmail() {
    setProfile((prev) => ({ ...prev, email: String(user?.email || '') }));
    setEmailEditing(false);
    setEmailEditError(null);
  }

  async function handleSavePersonal() {
    setPersonalSaving(true);
    setPersonalError(null);
    try {
      const res = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dob: personalDraft.dob || null,
          blood_group: personalDraft.blood_group.trim(),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || 'Failed to update personal details');
      }
      const updated = await getMe();
      applyUserUpdate(updated);
      setIsEditingPersonal(false);
    } catch (err: any) {
      setPersonalError(err?.message || 'Failed to update personal details');
    } finally {
      setPersonalSaving(false);
    }
  }

  function cancelEditingPersonal() {
    const prof = (user as any)?.profile || {};
    setPersonalDraft({
      dob: String(prof.dob || ''),
      blood_group: String(prof.blood_group || ''),
    });
    setIsEditingPersonal(false);
    setPersonalError(null);
  }

  async function handleSaveParentNames() {
    setParentNamesSaving(true);
    setParentNamesError(null);
    try {
      const res = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          father_name: parentNamesDraft.father_name.trim(),
          mother_name: parentNamesDraft.mother_name.trim(),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || "Failed to update parent's names");
      }
      const updated = await getMe();
      applyUserUpdate(updated);
      setIsEditingParentNames(false);
    } catch (err: any) {
      setParentNamesError(err?.message || "Failed to update parent's names");
    } finally {
      setParentNamesSaving(false);
    }
  }

  function cancelEditingParentNames() {
    const prof = (user as any)?.profile || {};
    setParentNamesDraft({
      father_name: String(prof.father_name || ''),
      mother_name: String(prof.mother_name || ''),
    });
    setIsEditingParentNames(false);
    setParentNamesError(null);
  }

  async function handleSaveAddress() {
    setAddressSaving(true);
    setAddressError(null);
    try {
      const res = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address_line1: addressDraft.address_line1.trim(),
          address_line2: addressDraft.address_line2.trim(),
          address_line3: addressDraft.address_line3.trim(),
          district: addressDraft.district.trim(),
          pincode: addressDraft.pincode.trim(),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || 'Failed to update address');
      }
      const updated = await getMe();
      applyUserUpdate(updated);
      setIsEditingAddress(false);
    } catch (err: any) {
      setAddressError(err?.message || 'Failed to update address');
    } finally {
      setAddressSaving(false);
    }
  }

  function cancelEditingAddress() {
    const prof = (user as any)?.profile || {};
    setAddressDraft({
      address_line1: String(prof.address_line1 || ''),
      address_line2: String(prof.address_line2 || ''),
      address_line3: String(prof.address_line3 || ''),
      district: String(prof.district || ''),
      pincode: String(prof.pincode || ''),
    });
    setIsEditingAddress(false);
    setAddressError(null);
  }

  async function handleSaveParents() {
    setParentsSaving(true);
    setParentsError(null);
    try {
      const res = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          father_mobile: parentsDraft.father_mobile.trim(),
          mother_mobile: parentsDraft.mother_mobile.trim(),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || 'Failed to update parent contacts');
      }
      const updated = await getMe();
      applyUserUpdate(updated);
      setIsEditingParents(false);
    } catch (err: any) {
      setParentsError(err?.message || 'Failed to update parent contacts');
    } finally {
      setParentsSaving(false);
    }
  }

  function cancelEditingParents() {
    const prof = (user as any)?.profile || {};
    setParentsDraft({
      father_mobile: String(prof.father_mobile || ''),
      mother_mobile: String(prof.mother_mobile || ''),
    });
    setIsEditingParents(false);
    setParentsError(null);
  }

  async function handleSaveTransport() {
    setTransportSaving(true);
    setTransportError(null);
    try {
      const modeId = transportDraft.mode_of_transportation_id;
      const found = modesOfTransportation.find((m) => String(m.id) === String(modeId));
      const modeName = found ? found.name : '';
      const isBus = modeName.toLowerCase().includes('college bus') || modeName.toLowerCase().includes('bus');

      const res = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode_of_transportation_id: modeId ? Number(modeId) : null,
          boarding_point: isBus ? transportDraft.boarding_point.trim() : '',
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || 'Failed to update mode of transportation');
      }
      const updated = await getMe();
      applyUserUpdate(updated);
      setIsEditingTransport(false);
    } catch (err: any) {
      setTransportError(err?.message || 'Failed to update mode of transportation');
    } finally {
      setTransportSaving(false);
    }
  }

  function cancelEditingTransport() {
    const prof = (user as any)?.profile || {};
    setTransportDraft({
      mode_of_transportation_id: prof.mode_of_transportation_id || '',
      boarding_point: String(prof.boarding_point || ''),
    });
    setIsEditingTransport(false);
    setTransportError(null);
  }

  function handleAvatarEditClick() {
    if (avatarLocked || avatarUploading) return;
    avatarInputRef.current?.click();
  }

  function closeAvatarConfirmModal() {
    if (avatarUploading) return;
    setAvatarConfirmModalOpen(false);
    setAvatarPendingFile(null);
    if (avatarEditorSrc) {
      URL.revokeObjectURL(avatarEditorSrc);
    }
    setAvatarEditorSrc(null);
    setAvatarEditorNatural(null);
    setAvatarEditorScale(1);
    setAvatarEditorOffset({ x: 0, y: 0 });
    setAvatarEditorDragging(false);
    avatarDragPointerIdRef.current = null;
    avatarDragStartRef.current = null;
  }

  function buildCroppedAvatarFile(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      if (!avatarEditorNatural || !avatarEditorSrc) {
        reject(new Error('Image editor is not ready. Please reselect the image.'));
        return;
      }

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_UPLOAD_SIZE;
        canvas.height = AVATAR_UPLOAD_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Unable to process image.'));
          return;
        }

        const rendered = getAvatarRenderedSize(avatarEditorNatural, avatarEditorScale);
        const scaleRatio = AVATAR_UPLOAD_SIZE / AVATAR_EDITOR_FRAME_SIZE;
        const drawWidth = rendered.width * scaleRatio;
        const drawHeight = rendered.height * scaleRatio;
        const drawX = (AVATAR_UPLOAD_SIZE - drawWidth) / 2 + avatarEditorOffset.x * scaleRatio;
        const drawY = (AVATAR_UPLOAD_SIZE - drawHeight) / 2 + avatarEditorOffset.y * scaleRatio;

        ctx.clearRect(0, 0, AVATAR_UPLOAD_SIZE, AVATAR_UPLOAD_SIZE);
        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

        const usePng = String(file.type || '').toLowerCase().includes('png');
        const outputType = usePng ? 'image/png' : 'image/jpeg';
        const outputName = usePng ? 'profile-image.png' : 'profile-image.jpg';

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Unable to generate cropped image.'));
              return;
            }
            resolve(new File([blob], outputName, { type: outputType }));
          },
          outputType,
          usePng ? undefined : 0.92,
        );
      };
      image.onerror = () => reject(new Error('Failed to load selected image.'));
      image.src = avatarEditorSrc;
    });
  }

  function handleAvatarEditorPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!avatarEditorNatural || avatarUploading) return;
    avatarDragPointerIdRef.current = e.pointerId;
    avatarDragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      x: avatarEditorOffset.x,
      y: avatarEditorOffset.y,
    };
    setAvatarEditorDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleAvatarEditorPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!avatarEditorNatural) return;
    if (avatarDragPointerIdRef.current !== e.pointerId || !avatarDragStartRef.current) return;
    const dx = e.clientX - avatarDragStartRef.current.clientX;
    const dy = e.clientY - avatarDragStartRef.current.clientY;
    const nextOffset = {
      x: avatarDragStartRef.current.x + dx,
      y: avatarDragStartRef.current.y + dy,
    };
    setAvatarEditorOffset(clampAvatarOffset(nextOffset, avatarEditorNatural, avatarEditorScale));
  }

  function handleAvatarEditorPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (avatarDragPointerIdRef.current !== e.pointerId) return;
    avatarDragPointerIdRef.current = null;
    avatarDragStartRef.current = null;
    setAvatarEditorDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  async function uploadAvatar(file: File) {
    const previewUrl = URL.createObjectURL(file);
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl(previewUrl);

    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append('profile_image', file);

      const response = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to upload profile image');
      }

      const updated = await getMe();
      applyUserUpdate(updated);

      URL.revokeObjectURL(previewUrl);
      setAvatarPreviewUrl(null);
      setAvatarConfirmModalOpen(false);
      setAvatarPendingFile(null);
    } catch (err: any) {
      window.alert(String(err?.message || err || 'Failed to upload profile image'));
      URL.revokeObjectURL(previewUrl);
      setAvatarPreviewUrl(null);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleConfirmAvatarUpload() {
    if (!avatarPendingFile || avatarUploading) return;
    try {
      const croppedFile = await buildCroppedAvatarFile(avatarPendingFile);
      await uploadAvatar(croppedFile);
    } catch (err: any) {
      window.alert(String(err?.message || err || 'Failed to prepare cropped profile image'));
    }
  }

  async function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = String(file.name || '').toLowerCase();
    const validType = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/jpg';
    const validExt = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png');

    if (!validType && !validExt) {
      window.alert('Please select a JPG or PNG image.');
      e.target.value = '';
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const meta = await new Promise<AvatarNatural | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });

    if (!meta) {
      URL.revokeObjectURL(imageUrl);
      window.alert('Unable to read the selected image. Please choose another file.');
      e.target.value = '';
      return;
    }

    if (avatarEditorSrc) {
      URL.revokeObjectURL(avatarEditorSrc);
    }

    const startScale = 1;
    setAvatarPendingFile(file);
    setAvatarEditorSrc(imageUrl);
    setAvatarEditorNatural(meta);
    setAvatarEditorScale(startScale);
    setAvatarEditorOffset(clampAvatarOffset({ x: 0, y: 0 }, meta, startScale));
    setAvatarConfirmModalOpen(true);
    e.target.value = '';
  }

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6 space-y-6">
        {/* Profile Header Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 sm:p-8 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0">
                <div
                  className="w-full h-full bg-blue-600 rounded-full flex items-center justify-center overflow-hidden"
                  aria-label="Profile image"
                >
                  {activeAvatarUrl && hasLoadableCandidate ? (
                    <img
                      src={activeAvatarUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Prevent recursive onError loops on broken/missing URLs.
                        e.currentTarget.onerror = null;

                        if (avatarPreviewUrl) {
                          setAvatarPreviewUrl(null);
                          return;
                        }

                        setAvatarCandidateIndex((prev) => {
                          const next = prev + 1;
                          return next < avatarUrlCandidates.length ? next : avatarUrlCandidates.length;
                        });
                      }}
                    />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-bold text-white">{initials}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAvatarEditClick}
                  disabled={avatarLocked || avatarUploading}
                  title={avatarLocked ? 'Profile image can only be updated once.' : 'Change profile image'}
                  aria-label={avatarLocked ? 'Profile image can only be updated once.' : 'Change profile image'}
                  className="absolute -bottom-1 -right-1 h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 border-white bg-blue-600 text-white shadow-md flex items-center justify-center transition-colors hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
              </div>
              {avatarLocked && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={openAvatarUnlockModal}
                    disabled={avatarUnlockRequestBusy || avatarUnlockRequestStatus === 'PENDING'}
                    className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {avatarUnlockRequestStatus === 'PENDING'
                      ? 'Request Pending'
                      : avatarUnlockRequestBusy
                        ? 'Submitting...'
                        : 'Request Image Update'}
                  </button>
                  {avatarUnlockRequestInfo && (
                    <div className="mt-1 text-xs text-emerald-700">{avatarUnlockRequestInfo}</div>
                  )}
                  {avatarUnlockRequestError && (
                    <div className="mt-1 text-xs text-red-600">{avatarUnlockRequestError}</div>
                  )}
                </div>
              )}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{user.username}</h1>
                <p className="text-gray-600 mt-1">{user.email || 'No email provided'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(user.profile_type === 'STUDENT' || user.profile_type === 'STAFF') && (
                <div
                  className={`px-4 py-2 rounded-lg shadow-sm border ${
                    rfidUid
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">ID Card</div>
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    {rfidUid ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Connected
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" /> Not Connected
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="bg-gradient-to-r from-amber-500 to-indigo-600 rounded-lg px-4 py-2 shadow-sm text-white flex flex-col justify-center shrink-0">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-200">PBAS Score</div>
                <div className="font-black text-xl leading-tight">
                  {(user as any)?.pbas_credit ?? (user as any)?.profile?.pbas_credit ?? 0} Points
                </div>
              </div>
              <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
                <div className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Profile Type</div>
                <div className="font-bold text-gray-900">{user.profile_type || '—'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Completion Progress Bar (placed between Name section and Details section) */}
        {completionDetails && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base ${
                    completionDetails.percentage === 100
                      ? 'bg-emerald-100 text-emerald-700'
                      : completionDetails.percentage >= 50
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">Profile Completion</h3>
                    {completionDetails.isOverallCompulsory ? (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                        Compulsory
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        Optional
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {completionDetails.completedCount} of {completionDetails.totalCount} compulsory fields completed
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-2xl font-black ${
                    completionDetails.percentage === 100
                      ? 'text-emerald-600'
                      : completionDetails.percentage >= 50
                        ? 'text-indigo-600'
                        : 'text-amber-600'
                  }`}
                >
                  {completionDetails.percentage}%
                </span>
                <span className="text-xs text-slate-500 font-medium">Completed</span>
              </div>
            </div>

            {/* Line Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  completionDetails.percentage === 100
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    : completionDetails.percentage >= 50
                      ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600'
                      : 'bg-gradient-to-r from-amber-500 to-orange-500'
                }`}
                style={{ width: `${Math.max(4, completionDetails.percentage)}%` }}
              />
            </div>

            {/* Missing required fields alert */}
            {completionDetails.missingFields.length > 0 ? (
              <div className="mt-3 flex items-start sm:items-center gap-2 text-xs text-slate-600 bg-amber-50/70 border border-amber-200/80 p-3 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <span className="font-semibold text-slate-800">Pending compulsory fields: </span>
                  <span className="text-amber-800 font-medium">
                    {completionDetails.missingFields.join(', ')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">All compulsory profile fields are complete!</span>
              </div>
            )}
          </div>
        )}

        {/* Details Section */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PBAS_SCORE_CATEGORIES.map((category) => (
              <div key={category} className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow border-l-4 border-amber-500">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Award className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-500 mb-1">{category}</div>
                    <div className="text-2xl font-black text-amber-700">
                      {user?.pbas_scores?.[category] ?? user?.profile?.pbas_scores?.[category] ?? 0}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">PBAS points</div>
                  </div>
                </div>
              </div>
            ))}

            {/* Staff/Student ID Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">
                    {user.profile_type === 'STAFF' ? 'Staff ID' : user.profile_type === 'STUDENT' ? 'Student ID' : 'ID'}
                  </div>
                  <div className="text-gray-900 font-medium truncate">
                    {user.profile_type === 'STAFF' ? (user.profile?.staff_id || '—') :
                     user.profile_type === 'STUDENT' ? (user.profile?.student_id || '—') : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Name Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">Name</div>
                  {isEditingName ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500 w-20">Username:</span>
                          <span className="text-gray-900 font-medium">{user.username}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={profile.first_name}
                          onChange={(e) => setProfile((prev) => ({ ...prev, first_name: e.target.value }))}
                          placeholder="First name"
                          className="w-full px-2 py-1 border rounded text-sm"
                          disabled={nameEmailSaving}
                        />
                        <input
                          type="text"
                          value={profile.last_name}
                          onChange={(e) => setProfile((prev) => ({ ...prev, last_name: e.target.value }))}
                          placeholder="Last name"
                          className="w-full px-2 py-1 border rounded text-sm"
                          disabled={nameEmailSaving}
                        />
                      </div>

                      {nameEmailEditError && <div className="text-xs text-red-600">{nameEmailEditError}</div>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveName}
                          disabled={nameEmailSaving}
                          className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                        >
                          <Save className="w-3 h-3" />
                          {nameEmailSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditingName}
                          disabled={nameEmailSaving}
                          className="flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500 w-20">Username:</span>
                          <span className="text-gray-900 font-medium">{user.username}</span>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-xs text-gray-500">First name</span>
                          <div className="text-gray-900 font-medium">{user.first_name || '—'}</div>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">Last name</span>
                          <div className="text-gray-900 font-medium">{user.last_name || '—'}</div>
                        </div>
                      </div>

                      <button
                        onClick={startEditingName}
                        className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Email Card (editable) */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-500 mb-1">Email</div>
                    <div>
                      <button
                        onClick={() => { setEmailEditing(true); setEmailEditError(null); }}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {emailEditing ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="email"
                        value={profile.email || ''}
                        onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                        className="w-full px-3 py-2 border rounded text-sm"
                        disabled={emailSaving}
                      />
                      <button
                        onClick={handleSaveEmail}
                        disabled={emailSaving}
                        className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        {emailSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditingEmail}
                        disabled={emailSaving}
                        className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="text-gray-900 font-medium truncate mt-2">{profile.email || '—'}</div>
                  )}

                  {emailEditError && <div className="text-xs text-red-600 mt-2">{emailEditError}</div>}
                </div>
              </div>
            </div>

            {/* Roles Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">Roles</div>
                  <div className="text-gray-900 font-medium truncate">{(user.roles || []).join(', ') || '—'}</div>
                </div>
              </div>
            </div>

            {/* Department Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">Department</div>
                  <div className="text-gray-900 font-medium truncate">
                    {(user.profile && user.profile.department && (user.profile.department.short_name || user.profile.department.code)) || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Designation Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">Designation</div>
                  <div className="text-gray-900 font-medium truncate">
                    {(user.profile && user.profile.designation) || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* College Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow lg:col-span-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <School className="w-5 h-5 text-pink-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-2">College</div>
                  {user.college ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 w-20">Code:</span>
                        <span className="text-gray-900 font-medium">{user.college.code || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 w-20">Name:</span>
                        <span className="text-gray-900 font-medium">{user.college.name || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 w-20">Short Name:</span>
                        <span className="text-gray-900 font-medium">{user.college.short_name || '—'}</span>
                      </div>
                      {user.college.address && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-semibold text-gray-500 w-20">Address:</span>
                          <span className="text-gray-900 font-medium">{user.college.address}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-900 font-medium">—</div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Number Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow lg:col-span-2">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-2">Mobile Number</div>

                  {verifySuccess && (
                    <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-emerald-800 leading-relaxed">
                        <strong>Mobile number verified successfully!</strong> You can now access your Academic panel and submit requests through IDCS.
                      </div>
                    </div>
                  )}

                  {/* Mobile display and actions */}
                  <div className="mt-3">
                    <div className="text-sm text-gray-500 mb-1">Current number</div>
                    <div className="flex items-center gap-2">
                      <div className="text-gray-900 font-medium">{profileMobile || '—'}</div>
                      {!profileMobileVerified && profileMobile ? (
                        <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">Unverified</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex w-full sm:w-auto">
                      <div className="flex items-center gap-2 px-3 py-2 border border-r-0 rounded-l-md bg-gray-50">
                        <img
                          src={indiaFlag}
                          alt="India flag"
                          className="w-6 h-4 object-cover rounded-sm shadow-sm"
                        />
                        <span className="text-sm font-medium text-gray-700">+91</span>
                      </div>
                      <input
                        value={mobileDraft}
                        onChange={handleMobileInputChange}
                        className="px-3 py-2 border rounded-r-md w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Enter 10-digit mobile"
                        disabled={otpBusy}
                        inputMode="numeric"
                        maxLength={10}
                      />
                    </div>
                    <button
                      onClick={handleRequestOtp}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md"
                      disabled={otpBusy}
                    >
                      {otpBusy ? 'Sending…' : 'Request OTP'}
                    </button>
                  </div>

                  {otpInfo && (
                    <div className="mt-2 text-sm text-emerald-700">{otpInfo}</div>
                  )}

                  {otpError && !otpSent && (
                    <div className="mt-2 text-sm text-red-600">{otpError}</div>
                  )}

                  {otpSent && (
                    <div className="mt-3">
                      <div className="text-sm text-gray-500 mb-2">Enter OTP ({otpSecondsLeft}s)</div>
                      <div className="flex items-center gap-2">
                        <input value={otpDraft} onChange={(e) => setOtpDraft(e.target.value)} className="px-3 py-2 border rounded-md" />
                        <button onClick={handleVerifyOtp} className="bg-emerald-600 text-white px-3 py-2 rounded-md">Verify</button>
                        {canResendOtp && <button onClick={handleRequestOtp} className="text-sm text-blue-600">Resend</button>}
                      </div>
                      {otpError && <div className="mt-2 text-sm text-red-600">{otpError}</div>}
                    </div>
                  )}

                  {/* Only show "Remove mobile number" when a verified number exists */}
                  {profileMobile && profileMobileVerified && (
                    <div className="mt-4">
                      <button onClick={() => setRemoveModalOpen(true)} className="text-sm text-red-600">Remove mobile number</button>
                    </div>
                  )}

                </div>
              </div>
            </div>

            {/* Student Specific Field Groups: Personal, Parents Info, Parents Contacts, Transport, Address */}
            {user.profile_type === 'STUDENT' && (
              <>
                {/* Group 1: Personal Details (Date of Birth & Blood Group) */}
                <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow lg:col-span-1 border-l-4 border-rose-500">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Heart className="w-5 h-5 text-rose-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-700 mb-0.5">Personal Details</div>
                          <div className="text-xs text-gray-500">Date of Birth & Blood Group</div>
                        </div>
                        {!isEditingPersonal && (
                          <button
                            type="button"
                            onClick={() => { setIsEditingPersonal(true); setPersonalError(null); }}
                            className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                      </div>

                      {isEditingPersonal ? (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Date of Birth (DD-MM-YYYY)</label>
                            <input
                              type="date"
                              value={personalDraft.dob}
                              onChange={(e) => setPersonalDraft((d) => ({ ...d, dob: e.target.value }))}
                              className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-rose-500 bg-white"
                              disabled={personalSaving}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-600">Blood Group</label>
                            <select
                              value={personalDraft.blood_group}
                              onChange={(e) => setPersonalDraft((d) => ({ ...d, blood_group: e.target.value }))}
                              className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-rose-500 bg-white"
                              disabled={personalSaving}
                            >
                              <option value="">-- Select Blood Group --</option>
                              {BLOOD_GROUPS.map((bg) => (
                                <option key={bg} value={bg}>
                                  {bg}
                                </option>
                              ))}
                            </select>
                          </div>

                          {personalError && <div className="text-xs text-red-600">{personalError}</div>}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleSavePersonal}
                              disabled={personalSaving}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-sm"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {personalSaving ? 'Saving...' : 'Save Details'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingPersonal}
                              disabled={personalSaving}
                              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2 text-sm text-gray-800">
                          <div>
                            <span className="text-xs text-gray-500 block">Date of Birth:</span>
                            <span className="font-medium text-gray-900">
                              {(user as any)?.profile?.dob_display || formatDobDisplay((user as any)?.profile?.dob) || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 block">Blood Group:</span>
                            {(user as any)?.profile?.blood_group ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 mt-0.5">
                                {(user as any)?.profile?.blood_group}
                              </span>
                            ) : (
                              <span className="font-medium text-gray-900">—</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Group 2: Parents Information (Father's Name & Mother's Name) */}
                <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow lg:col-span-1 border-l-4 border-amber-500">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-700 mb-0.5">Parents Information</div>
                          <div className="text-xs text-gray-500">Father's & Mother's Name</div>
                        </div>
                        {!isEditingParentNames && (
                          <button
                            type="button"
                            onClick={() => { setIsEditingParentNames(true); setParentNamesError(null); }}
                            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium px-2 py-1 rounded hover:bg-amber-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                      </div>

                      {isEditingParentNames ? (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Father's Name</label>
                            <input
                              type="text"
                              value={parentNamesDraft.father_name}
                              onChange={(e) => setParentNamesDraft((d) => ({ ...d, father_name: e.target.value }))}
                              placeholder="Enter Father's Name"
                              className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                              disabled={parentNamesSaving}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-600">Mother's Name</label>
                            <input
                              type="text"
                              value={parentNamesDraft.mother_name}
                              onChange={(e) => setParentNamesDraft((d) => ({ ...d, mother_name: e.target.value }))}
                              placeholder="Enter Mother's Name"
                              className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                              disabled={parentNamesSaving}
                            />
                          </div>

                          {parentNamesError && <div className="text-xs text-red-600">{parentNamesError}</div>}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleSaveParentNames}
                              disabled={parentNamesSaving}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-sm"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {parentNamesSaving ? 'Saving...' : 'Save Names'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingParentNames}
                              disabled={parentNamesSaving}
                              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2 text-sm text-gray-800">
                          <div>
                            <span className="text-xs text-gray-500 block">Father's Name:</span>
                            <span className="font-medium text-gray-900">
                              {(user as any)?.profile?.father_name || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 block">Mother's Name:</span>
                            <span className="font-medium text-gray-900">
                              {(user as any)?.profile?.mother_name || '—'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Group 3: Parent / Guardian Contact */}
                <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow lg:col-span-1 border-l-4 border-blue-500">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-700 mb-0.5">Parent Contacts</div>
                          <div className="text-xs text-gray-500">Parent / Guardian mobile numbers</div>
                        </div>
                        {!isEditingParents && (
                          <button
                            type="button"
                            onClick={() => { setIsEditingParents(true); setParentsError(null); }}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                      </div>

                      {isEditingParents ? (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Parent/Guardian Number 1 (Compulsory)</label>
                            <div className="flex mt-1">
                              <span className="inline-flex items-center px-2 py-1 border border-r-0 border-gray-300 bg-gray-50 text-gray-600 text-xs rounded-l">
                                +91
                              </span>
                              <input
                                type="tel"
                                value={parentsDraft.father_mobile}
                                onChange={(e) => setParentsDraft((d) => ({ ...d, father_mobile: e.target.value }))}
                                placeholder="10-digit mobile number"
                                maxLength={15}
                                className="w-full px-3 py-1.5 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                disabled={parentsSaving}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-600">Parent Mobile Number 2</label>
                            <div className="flex mt-1">
                              <span className="inline-flex items-center px-2 py-1 border border-r-0 border-gray-300 bg-gray-50 text-gray-600 text-xs rounded-l">
                                +91
                              </span>
                              <input
                                type="tel"
                                value={parentsDraft.mother_mobile}
                                onChange={(e) => setParentsDraft((d) => ({ ...d, mother_mobile: e.target.value }))}
                                placeholder="10-digit mobile number"
                                maxLength={15}
                                className="w-full px-3 py-1.5 border border-gray-300 rounded-r text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                disabled={parentsSaving}
                              />
                            </div>
                          </div>

                          {parentsError && <div className="text-xs text-red-600">{parentsError}</div>}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleSaveParents}
                              disabled={parentsSaving}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-sm"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {parentsSaving ? 'Saving...' : 'Save Contacts'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingParents}
                              disabled={parentsSaving}
                              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2 text-sm text-gray-800">
                          <div>
                            <span className="text-xs text-gray-500 block">Parent/Guardian Number 1 (Compulsory):</span>
                            <span className="font-medium text-gray-900">
                              {(user as any)?.profile?.father_mobile || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 block">Parent Mobile Number 2:</span>
                            <span className="font-medium text-gray-900">
                              {(user as any)?.profile?.mother_mobile || '—'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Group 4: Mode of Transportation (Dropdown select + dynamic Boarding Point) */}
                <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow lg:col-span-1 border-l-4 border-emerald-500">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Bus className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-700 mb-0.5">Mode of Transportation</div>
                          <div className="text-xs text-gray-500">Transit method to college</div>
                        </div>
                        {!isEditingTransport && (
                          <button
                            type="button"
                            onClick={() => { setIsEditingTransport(true); setTransportError(null); }}
                            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                      </div>

                      {isEditingTransport ? (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Select Mode</label>
                            <select
                              value={transportDraft.mode_of_transportation_id}
                              onChange={(e) => setTransportDraft((d) => ({ ...d, mode_of_transportation_id: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                              disabled={transportSaving}
                            >
                              <option value="">-- Select Mode of Transportation --</option>
                              {modesOfTransportation.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Dynamic Boarding Point if College Bus is selected */}
                          {(() => {
                            const selectedId = transportDraft.mode_of_transportation_id;
                            const found = modesOfTransportation.find((m) => String(m.id) === String(selectedId));
                            const modeName = found ? found.name : '';
                            const isBus = modeName.toLowerCase().includes('college bus') || modeName.toLowerCase().includes('bus');
                            if (!isBus) return null;
                            const isCompulsory = completionConfig?.fields_config?.mode_of_transportation !== false;

                            return (
                              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-1 animate-in fade-in duration-150">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-semibold text-emerald-900 flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                    Boarding Point {isCompulsory && <span className="text-rose-600 font-bold">*</span>}
                                  </label>
                                  {isCompulsory && (
                                    <span className="text-[10px] uppercase font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                      Compulsory
                                    </span>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={transportDraft.boarding_point}
                                  onChange={(e) => setTransportDraft((d) => ({ ...d, boarding_point: e.target.value }))}
                                  placeholder="Enter Bus Stop / Boarding Point"
                                  className="w-full px-3 py-1.5 border border-emerald-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                                  disabled={transportSaving}
                                />
                              </div>
                            );
                          })()}

                          {transportError && <div className="text-xs text-red-600">{transportError}</div>}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleSaveTransport}
                              disabled={transportSaving}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-sm"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {transportSaving ? 'Saving...' : 'Save Mode'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingTransport}
                              disabled={transportSaving}
                              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          <div>
                            {(user as any)?.profile?.mode_of_transportation ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Bus className="w-3.5 h-3.5" />
                                {(user as any)?.profile?.mode_of_transportation}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic text-sm">Not selected</span>
                            )}
                          </div>
                          {Boolean((user as any)?.profile?.boarding_point) && (
                            <div className="text-xs text-gray-700">
                              <span className="text-gray-500">Boarding Point: </span>
                              <span className="font-semibold text-gray-900">{(user as any)?.profile?.boarding_point}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Group 5: Address Details (Line 1, Line 2, Line 3, District, Pincode) */}
                <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow lg:col-span-2 border-l-4 border-indigo-500">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-700 mb-0.5">Address Details</div>
                          <div className="text-xs text-gray-500">Line 1, Line 2, Line 3, District & Pincode</div>
                        </div>
                        {!isEditingAddress && (
                          <button
                            type="button"
                            onClick={() => { setIsEditingAddress(true); setAddressError(null); }}
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 rounded hover:bg-indigo-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                      </div>

                      {isEditingAddress ? (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Address Line 1</label>
                            <input
                              type="text"
                              value={addressDraft.address_line1}
                              onChange={(e) => setAddressDraft((d) => ({ ...d, address_line1: e.target.value }))}
                              placeholder="Door No, Building Name, Street"
                              className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              disabled={addressSaving}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-600">Address Line 2</label>
                            <input
                              type="text"
                              value={addressDraft.address_line2}
                              onChange={(e) => setAddressDraft((d) => ({ ...d, address_line2: e.target.value }))}
                              placeholder="Locality, Area, Landmark"
                              className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              disabled={addressSaving}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-gray-600">Address Line 3 (Optional)</label>
                            <input
                              type="text"
                              value={addressDraft.address_line3}
                              onChange={(e) => setAddressDraft((d) => ({ ...d, address_line3: e.target.value }))}
                              placeholder="Village / Taluk / Additional info"
                              className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              disabled={addressSaving}
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-semibold text-gray-600">District</label>
                              <input
                                type="text"
                                value={addressDraft.district}
                                onChange={(e) => setAddressDraft((d) => ({ ...d, district: e.target.value }))}
                                placeholder="District"
                                className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                disabled={addressSaving}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-gray-600">Pincode</label>
                              <input
                                type="text"
                                value={addressDraft.pincode}
                                onChange={(e) => setAddressDraft((d) => ({ ...d, pincode: e.target.value }))}
                                placeholder="6-digit Pincode"
                                maxLength={10}
                                className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                disabled={addressSaving}
                              />
                            </div>
                          </div>

                          {addressError && <div className="text-xs text-red-600">{addressError}</div>}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleSaveAddress}
                              disabled={addressSaving}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-sm"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {addressSaving ? 'Saving...' : 'Save Address'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingAddress}
                              disabled={addressSaving}
                              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-1.5 text-sm text-gray-800">
                          {((user as any)?.profile?.address_line1 || (user as any)?.profile?.district) ? (
                            <>
                              {(user as any)?.profile?.address_line1 && <div>{(user as any)?.profile?.address_line1}</div>}
                              {(user as any)?.profile?.address_line2 && <div>{(user as any)?.profile?.address_line2}</div>}
                              {(user as any)?.profile?.address_line3 && <div>{(user as any)?.profile?.address_line3}</div>}
                              <div className="text-gray-600 font-medium">
                                {[
                                  (user as any)?.profile?.district,
                                  (user as any)?.profile?.pincode ? `PIN: ${(user as any)?.profile?.pincode}` : ''
                                ].filter(Boolean).join(', ')}
                              </div>
                            </>
                          ) : (
                            <div className="text-gray-400 italic text-sm">No address provided yet. Click edit to add address.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Change Password Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Key className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-2">Password</div>
                  <div className="text-gray-900 font-medium mb-3">••••••••</div>
                  <button
                    onClick={() => setChangePasswordModalOpen(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 transition-colors"
                  >
                    Change Password
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Change Password Modal */}
        {changePasswordModalOpen && (
          <ModalPortal>
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="absolute inset-0 bg-black opacity-30" onClick={() => {
                if (!changePasswordBusy) {
                  setChangePasswordModalOpen(false);
                  setChangePasswordError(null);
                  setChangePasswordSuccess(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }
              }} />
              <div className="bg-white rounded-lg p-6 shadow-lg z-10 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">Change Password</h3>

                {changePasswordSuccess && (
                  <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-emerald-800">Password changed successfully!</div>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Current Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md pr-10"
                        disabled={changePasswordBusy}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md pr-10"
                        disabled={changePasswordBusy}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleChangePassword();
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-md pr-10"
                        disabled={changePasswordBusy}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {changePasswordError && (
                  <div className="mt-3 text-sm text-red-600">{changePasswordError}</div>
                )}

                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => {
                      if (!changePasswordBusy) {
                        setChangePasswordModalOpen(false);
                        setChangePasswordError(null);
                        setChangePasswordSuccess(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                      }
                    }}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                    disabled={changePasswordBusy}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePassword}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
                    disabled={changePasswordBusy}
                  >
                    {changePasswordBusy ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Remove mobile modal */}
        {removeModalOpen && (
          <ModalPortal>
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="absolute inset-0 bg-black opacity-30" onClick={() => setRemoveModalOpen(false)} />
              <div className="bg-white rounded-lg p-6 shadow-lg z-10 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-3">Remove Mobile Number</h3>
                <p className="text-sm text-gray-600 mb-4">Enter your password to confirm removal of the mobile number.</p>
                <input type="password" value={removePassword} onChange={(e)=>setRemovePassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRemoveMobile(); } }} className="w-full px-3 py-2 border rounded mb-3" />
                {removeError && <div className="text-sm text-red-600 mb-2">{removeError}</div>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setRemoveModalOpen(false)} className="px-3 py-2">Cancel</button>
                  <button onClick={handleRemoveMobile} className="px-3 py-2 bg-red-600 text-white rounded">Remove</button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Confirm avatar upload modal */}
        {avatarConfirmModalOpen && (
          <ModalPortal>
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="absolute inset-0 bg-black opacity-30" onClick={closeAvatarConfirmModal} />
              <div className="bg-white rounded-lg p-6 shadow-lg z-10 w-full max-w-lg">
                <h3 className="text-lg font-semibold mb-3">Confirm Profile Image Upload</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Once uploaded, this profile image cannot be changed later. Please confirm to continue.
                </p>

                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-2">Adjust image (drag to move)</div>
                    <div
                      className={`relative w-[280px] h-[280px] max-w-full rounded-xl border border-gray-200 overflow-hidden bg-gray-100 ${avatarEditorDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                      onPointerDown={handleAvatarEditorPointerDown}
                      onPointerMove={handleAvatarEditorPointerMove}
                      onPointerUp={handleAvatarEditorPointerUp}
                      onPointerCancel={handleAvatarEditorPointerUp}
                    >
                      {avatarEditorSrc && avatarEditorNatural ? (
                        <img
                          src={avatarEditorSrc}
                          alt="Avatar editor"
                          draggable={false}
                          className="absolute select-none pointer-events-none"
                          style={{
                            width: `${getAvatarRenderedSize(avatarEditorNatural, avatarEditorScale).width}px`,
                            height: `${getAvatarRenderedSize(avatarEditorNatural, avatarEditorScale).height}px`,
                            maxWidth: 'none',
                            maxHeight: 'none',
                            left: '50%',
                            top: '50%',
                            transform: `translate(calc(-50% + ${avatarEditorOffset.x}px), calc(-50% + ${avatarEditorOffset.y}px))`,
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <label className="text-xs font-semibold text-gray-500">Zoom</label>
                      <input
                        type="range"
                        min={0.5}
                        max={3}
                        step={0.01}
                        value={avatarEditorScale}
                        onChange={(evt) => {
                          const nextScale = Number(evt.target.value || 1);
                          setAvatarEditorScale(nextScale);
                          if (avatarEditorNatural) {
                            setAvatarEditorOffset((prev) => clampAvatarOffset(prev, avatarEditorNatural, nextScale));
                          }
                        }}
                        className="w-full"
                        disabled={avatarUploading || !avatarEditorNatural}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-2">Final profile icon preview</div>
                    <div className="relative w-[120px] h-[120px] rounded-full overflow-hidden border-4 border-white shadow-lg bg-gray-100">
                      {avatarEditorSrc && avatarEditorNatural ? (
                        <img
                          src={avatarEditorSrc}
                          alt="Final avatar preview"
                          draggable={false}
                          className="absolute select-none pointer-events-none"
                          style={{
                            width: `${(getAvatarRenderedSize(avatarEditorNatural, avatarEditorScale).width * 120) / AVATAR_EDITOR_FRAME_SIZE}px`,
                            height: `${(getAvatarRenderedSize(avatarEditorNatural, avatarEditorScale).height * 120) / AVATAR_EDITOR_FRAME_SIZE}px`,
                            maxWidth: 'none',
                            maxHeight: 'none',
                            left: '50%',
                            top: '50%',
                            transform: `translate(calc(-50% + ${(avatarEditorOffset.x * 120) / AVATAR_EDITOR_FRAME_SIZE}px), calc(-50% + ${(avatarEditorOffset.y * 120) / AVATAR_EDITOR_FRAME_SIZE}px))`,
                          }}
                        />
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                      Tip: center your face/logo in the circle preview. Use zoom when the image is too wide or too tall.
                    </p>
                  </div>
                </div>

                {avatarPendingFile && (
                  <div className="text-sm text-gray-700 mb-4">
                    <span className="font-medium">Selected file:</span> {avatarPendingFile.name}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={closeAvatarConfirmModal}
                    className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded"
                    disabled={avatarUploading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAvatarUpload}
                    className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                    disabled={avatarUploading || !avatarPendingFile}
                  >
                    {avatarUploading ? 'Uploading...' : 'Yes, Upload'}
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Profile Image Unlock Request Modal */}
        {avatarUnlockModalOpen && (
          <ModalPortal>
            <div className="fixed inset-0 flex items-center justify-center z-[60]">
              <div className="absolute inset-0 bg-black opacity-30" onClick={() => !avatarUnlockRequestBusy && setAvatarUnlockModalOpen(false)} />
              <div className="bg-white rounded-lg p-6 shadow-lg z-10 w-full max-w-md mx-4">
                <h3 className="text-lg font-semibold mb-3">Request Profile Image Update</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Please provide a reason for requesting a profile image update. (Optional)
                </p>
                <div className="mb-4">
                  <textarea
                    value={avatarUnlockRequestReason}
                    onChange={(e) => setAvatarUnlockRequestReason(e.target.value)}
                    placeholder="Enter reason..."
                    disabled={avatarUnlockRequestBusy}
                    className="w-full h-24 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                {avatarUnlockRequestError && (
                  <div className="mb-4 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    {avatarUnlockRequestError}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAvatarUnlockModalOpen(false)}
                    disabled={avatarUnlockRequestBusy}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitAvatarUnlockRequest}
                    disabled={avatarUnlockRequestBusy}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {avatarUnlockRequestBusy ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

      </div>
    </DashboardLayout>
  );
}

