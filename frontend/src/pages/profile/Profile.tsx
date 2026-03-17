import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getMe, requestMobileOtp, verifyMobileOtp, removeMobileNumber, changePassword, getCachedMe } from '../../services/auth';
import { User, Mail, Shield, Building, Briefcase, School, Phone, CheckCircle2, Trash2, Key, Eye, EyeOff, Edit2, Save, X, Camera, CreditCard, XCircle } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { ModalPortal } from '../../components/ModalPortal';
import logo from '../../assets/idcs-logo.png';
import indiaFlag from '../../assets/india-flag.svg';
import fetchWithAuth from '../../services/fetchAuth';
import { getApiBase } from '../../services/apiBase';

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
  const [profile, setProfile] = useState({ name: '', email: '', nameEdited: false });
  const [nameEmailEditError, setNameEmailEditError] = useState<string | null>(null);
  const [nameEmailSaving, setNameEmailSaving] = useState(false);
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
      email: String(user?.email || ''),
      nameEdited: edited,
    });
    if (edited) setIsEditingName(false);
  }, [user]);

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

  const avatarUrlCandidates = useMemo(() => {
    const rootValue = String((user as any)?.profile_image || '').trim();
    const nestedValue = String((user as any)?.profile?.profile_image || '').trim();
    const raw = rootValue || nestedValue;
    if (!raw) return [] as string[];

    const normalized = raw.replace(/\\+/g, '/');

    if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('blob:') || normalized.startsWith('data:')) {
      return [normalized];
    }

    if (normalized.startsWith('/')) {
      const direct = normalized;
      const apiBaseUrl = `${getApiBase()}${normalized}`;
      return direct === apiBaseUrl ? [direct] : [direct, apiBaseUrl];
    }

    const direct = `/media/${normalized}`;
    const apiBaseUrl = `${getApiBase()}/media/${normalized}`;
    return direct === apiBaseUrl ? [direct] : [direct, apiBaseUrl];
  }, [user]);

  useEffect(() => {
    setAvatarCandidateIndex(0);
  }, [avatarUrlCandidates]);

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
    const fullName = String(profile.name || '').trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName = String(parts.shift() || '').trim();
    const lastName = String(parts.join(' ')).trim();

    const confirmEdit = window.confirm(
      'This is a one-time edit. After saving you cannot change your name again.'
    );
    if (!confirmEdit) return;

    if (!firstName) {
      setNameEmailEditError('Name cannot be empty.');
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
          profileEdited: true,
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to update profile');
      }

      const updated = await getMe();
      const normalized = {
        ...updated,
        profileEdited: true,
        roles: Array.isArray(updated.roles) ? updated.roles.map((role: any) => (typeof role === 'string' ? role : role.name)) : [],
      } as Me;
      setUser(normalized);
      setProfile({
        name: getDisplayName(normalized),
        email: String(normalized.email || ''),
        nameEdited: true,
      });
      setIsEditingName(false);
    } catch (e: any) {
      setNameEmailEditError(String(e?.message || e || 'Failed to update profile'));
    } finally {
      setNameEmailSaving(false);
    }
  }

  function startEditingName() {
    if (profile.nameEdited) return;
    setProfile((prev) => ({ ...prev, name: getDisplayName(user) }));
    setIsEditingName(true);
    setNameEmailEditError(null);
  }

  function cancelEditingName() {
    setProfile((prev) => ({ ...prev, name: getDisplayName(user) }));
    setIsEditingName(false);
    setNameEmailEditError(null);
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
                      onError={() => {
                        setAvatarCandidateIndex((prev) => {
                          const next = prev + 1;
                          return next;
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
              <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
                <div className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Profile Type</div>
                <div className="font-bold text-gray-900">{user.profile_type || '—'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Details Section */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                          <span className="text-xs font-semibold text-gray-500 w-20">Name:</span>
                          <span className="text-gray-900 font-medium">
                            {profile.name || '—'}
                          </span>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Name"
                        className="w-full px-2 py-1 border rounded text-sm"
                        disabled={!isEditingName || nameEmailSaving}
                      />
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
                          <span className="text-xs font-semibold text-gray-500 w-20">Name:</span>
                          <span className="text-gray-900 font-medium">
                            {profile.name || '—'}
                          </span>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Name"
                        className="mt-2 w-full px-2 py-1 border rounded text-sm"
                        disabled={!isEditingName || nameEmailSaving}
                      />
                      {!profile.nameEdited && (
                        <button
                          onClick={startEditingName}
                          className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Email Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">Email</div>
                  <div className="text-gray-900 font-medium truncate">{profile.email || '—'}</div>
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
                <input type="password" value={removePassword} onChange={(e)=>setRemovePassword(e.target.value)} className="w-full px-3 py-2 border rounded mb-3" />
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

