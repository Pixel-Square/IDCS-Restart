import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  Building,
  Camera,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  Key,
  Mail,
  Phone,
  Save,
  School,
  Shield,
  User,
  X,
} from 'lucide-react';

import { ModalPortal } from '../components/ModalPortal';
import indiaFlag from '../assets/india-flag.svg';
import { getApiBase } from '../services/apiBase';
import {
  changePassword,
  getCachedMe,
  getMe,
  removeMobileNumber,
  requestMobileOtp,
  verifyMobileOtp,
} from '../services/auth';
import fetchWithAuth from '../services/fetchAuth';

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

function normalizeMobileForApi(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  let digits = s.replace(/\D+/g, '');
  if (!digits) return '';

  if (digits.length === 10) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }

  if (
    digits.startsWith(DEFAULT_COUNTRY_CODE + DEFAULT_COUNTRY_CODE) &&
    digits.length === DEFAULT_COUNTRY_CODE.length * 2 + 10
  ) {
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

function normalizeRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) => {
      if (typeof role === 'string') return role;
      if (role && typeof role === 'object' && 'name' in role) return String((role as RoleObj).name || '');
      return '';
    })
    .filter(Boolean);
}

export default function ProfilePage({ user: initialUser }: { user?: Me | null }) {
  const [user, setUser] = useState<Me | null>(initialUser || null);
  const [loading, setLoading] = useState(initialUser ? false : true);
  const [error, setError] = useState<string | null>(null);

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

  const [editingNameEmail, setEditingNameEmail] = useState(false);
  const [nameDraft, setNameDraft] = useState({ first: '', last: '' });
  const [nameEmailEditError, setNameEmailEditError] = useState<string | null>(null);
  const [nameEmailSaving, setNameEmailSaving] = useState(false);
  const [nameEmailEditLocked, setNameEmailEditLocked] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarCandidateIndex, setAvatarCandidateIndex] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const avatarUrlCandidates = useMemo(() => {
    const rootValue = String((user as any)?.profile_image || '').trim();
    const nestedValue = String((user as any)?.profile?.profile_image || '').trim();
    const raw = rootValue || nestedValue;
    if (!raw) return [] as string[];

    const normalized = raw.replace(/\\+/g, '/');

    if (
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('blob:') ||
      normalized.startsWith('data:')
    ) {
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

    const cached = getCachedMe();
    if (cached) {
      const normalized = {
        ...cached,
        roles: normalizeRoles(cached.roles),
      } as Me;
      setUser(normalized);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    getMe()
      .then((r) => {
        if (!mounted) return;
        const normalized = {
          ...r,
          roles: normalizeRoles((r as any).roles),
        } as Me;
        setUser(normalized);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setError(String((e as any)?.message || e || 'Failed to load profile'));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

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
    const edited = Boolean((user as any)?.profileEdited ?? (user as any)?.name_email_edited);
    setNameEmailEditLocked(edited);
    if (edited) {
      setEditingNameEmail(false);
    }
  }, [user]);

  useEffect(() => {
    setNameDraft({
      first: user?.first_name || '',
      last: user?.last_name || '',
    });
  }, [user?.first_name, user?.last_name]);

  useEffect(() => {
    setAvatarCandidateIndex(0);
  }, [avatarUrlCandidates]);

  const canResendOtp = otpSent && otpExpiresAtMs != null && otpSecondsLeft <= 0;
  const initials = (user?.username || 'U').slice(0, 2).toUpperCase();
  const resolvedCandidate = avatarUrlCandidates[avatarCandidateIndex] || '';
  const hasLoadableCandidate = Boolean(avatarPreviewUrl) || avatarCandidateIndex < avatarUrlCandidates.length;
  const activeAvatarUrl = avatarPreviewUrl || resolvedCandidate;
  const avatarLocked = Boolean((user as any)?.profile_image_updated ?? (user as any)?.profile?.profile_image_updated);
  const rolesText = normalizeRoles(user?.roles).join(', ');

  const handleMobileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onlyDigits = e.target.value.replace(/\D+/g, '').slice(0, 10);
    setMobileDraft(onlyDigits);
  };

  async function refreshUserFromApiOrPayload(payloadMe: any | null) {
    if (payloadMe) {
      const normalized = {
        ...payloadMe,
        roles: normalizeRoles(payloadMe.roles),
      } as Me;
      setUser(normalized);
      return;
    }

    const r = await getMe();
    const normalized = {
      ...r,
      roles: normalizeRoles((r as any).roles),
    } as Me;
    setUser(normalized);
  }

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

      const debugOtp = String((res as any)?.debug_otp || '').trim();
      if (debugOtp) {
        setOtpDraft(debugOtp);
      }

      const deliveryError = String((res as any)?.delivery_error || '').trim();
      const expiresIn = Number((res as any)?.expires_in_seconds ?? 0);
      if (Number.isFinite(expiresIn) && expiresIn > 0) {
        setOtpExpiresAtMs(Date.now() + expiresIn * 1000);
        setOtpSecondsLeft(Math.ceil(expiresIn));
        const mins = Math.ceil(expiresIn / 60);
        setOtpInfo(
          deliveryError
            ? `OTP generated, but delivery failed (${deliveryError}). Valid for ${mins} minute${mins === 1 ? '' : 's'}.`
            : `OTP sent. Valid for ${mins} minute${mins === 1 ? '' : 's'}.`,
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
      const msg =
        statusCode === 401
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
      await refreshUserFromApiOrPayload((res as any)?.me || null);
      setOtpSent(false);
      setOtpDraft('');
      setOtpInfo(null);
      setOtpError(null);
      setMobileEditing(false);
      setOtpExpiresAtMs(null);
      setOtpSecondsLeft(0);
      setVerifySuccess(true);
      window.setTimeout(() => setVerifySuccess(false), 8000);
    } catch (e: any) {
      const statusCode = Number(e?.response?.status || 0);
      const msg =
        statusCode === 401
          ? 'Session expired. Please login again and retry OTP verification.'
          : String(e?.response?.data?.detail || e?.message || e || 'OTP verification failed');
      setOtpError(msg);
    } finally {
      setOtpBusy(false);
    }
  }

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
      await refreshUserFromApiOrPayload((res as any)?.me || null);
      setRemoveModalOpen(false);
      setRemovePassword('');
      setRemoveError(null);
    } catch (e: any) {
      const statusCode = Number(e?.response?.status || 0);
      const msg =
        statusCode === 401
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
      window.setTimeout(() => {
        setChangePasswordModalOpen(false);
        setChangePasswordSuccess(false);
      }, 2000);
    } catch (e: any) {
      const statusCode = Number(e?.response?.status || 0);
      const msg =
        statusCode === 401
          ? 'Session expired or incorrect password.'
          : String(e?.response?.data?.detail || e?.message || e || 'Failed to change password');
      setChangePasswordError(msg);
    } finally {
      setChangePasswordBusy(false);
    }
  }

  async function handleSaveNameEmail() {
    setNameEmailEditError(null);
    const firstName = String(nameDraft.first || '').trim();
    const lastName = String(nameDraft.last || '').trim();
    const email = String(emailDraft || '').trim();

    const confirmEdit = window.confirm('This is a one-time edit. After saving you cannot edit your Name or Email again. Continue?');
    if (!confirmEdit) return;

    try {
      setNameEmailSaving(true);
      const response = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          profileEdited: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as any));
        throw new Error(String(data.detail || 'Failed to update profile'));
      }

      const updated = await getMe();
      const normalized = {
        ...updated,
        roles: normalizeRoles((updated as any).roles),
      } as Me;
      setUser(normalized);
      setEditingNameEmail(false);
      setNameEmailEditLocked(true);
    } catch (e: any) {
      setNameEmailEditError(String(e?.message || e || 'Failed to update profile'));
    } finally {
      setNameEmailSaving(false);
    }
  }

  function startEditingNameEmail() {
    if (nameEmailEditLocked) return;
    setNameDraft({
      first: user?.first_name || '',
      last: user?.last_name || '',
    });
    setEmailDraft(user?.email || '');
    setEditingNameEmail(true);
    setNameEmailEditError(null);
  }

  function cancelEditingNameEmail() {
    setNameDraft({
      first: user?.first_name || '',
      last: user?.last_name || '',
    });
    setEditingNameEmail(false);
    setNameEmailEditError(null);
  }

  function handleAvatarEditClick() {
    if (avatarLocked || avatarUploading) return;
    avatarInputRef.current?.click();
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
        const data = await response.json().catch(() => ({} as any));
        throw new Error(String(data.detail || 'Failed to upload profile image'));
      }

      const updated = await getMe();
      const normalized = {
        ...updated,
        roles: normalizeRoles((updated as any).roles),
      } as Me;
      setUser(normalized);

      URL.revokeObjectURL(previewUrl);
      setAvatarPreviewUrl(null);
    } catch (err: any) {
      window.alert(String(err?.message || err || 'Failed to upload profile image'));
      URL.revokeObjectURL(previewUrl);
      setAvatarPreviewUrl(null);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#7a2038]" />
          <p className="text-[#6f4a3f]">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pb-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">Error loading profile: {error}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-4 pb-6 text-center text-[#7a5a50] sm:px-6 lg:px-8">No profile available</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-6 sm:px-6 lg:px-8">
      <div className="rounded-xl bg-gradient-to-br from-[#f8ece7] to-[#f2dfd8] p-6 shadow-md sm:p-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 flex-shrink-0 sm:h-20 sm:w-20">
              <div className="h-full w-full overflow-hidden rounded-full bg-[#7a2038]" aria-label="Profile image">
                {activeAvatarUrl && hasLoadableCandidate ? (
                  <img
                    src={activeAvatarUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                    onError={() => {
                      setAvatarCandidateIndex((prev) => prev + 1);
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white sm:text-3xl">{initials}</div>
                )}
              </div>
              <button
                type="button"
                onClick={handleAvatarEditClick}
                disabled={avatarLocked || avatarUploading}
                title={avatarLocked ? 'Profile image can only be updated once.' : 'Change profile image'}
                aria-label={avatarLocked ? 'Profile image can only be updated once.' : 'Change profile image'}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#7a2038] text-white shadow-md transition-colors hover:bg-[#651c2f] disabled:cursor-not-allowed disabled:bg-gray-400 sm:h-8 sm:w-8"
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
            <div>
              <h1 className="text-2xl font-bold text-[#4f1a2c] sm:text-3xl">{user.username}</h1>
              <p className="mt-1 text-[#6f4a3f]">{user.email || 'No email provided'}</p>
            </div>
          </div>
          <div className="rounded-lg bg-white px-4 py-2 shadow-sm">
            <div className="mb-1 text-xs text-[#7a5a50]">Profile Type</div>
            <div className="font-bold text-[#4f1a2c]">{user.profile_type || '-'}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-xl font-bold text-[#4f1a2c]">Details</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#f1d9d0]">
                <User className="h-5 w-5 text-[#7a2038]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-sm font-semibold text-gray-500">
                  {user.profile_type === 'STAFF' ? 'Staff ID' : user.profile_type === 'STUDENT' ? 'Student ID' : 'ID'}
                </div>
                <div className="truncate font-medium text-gray-900">
                  {user.profile_type === 'STAFF'
                    ? user.profile?.staff_id || '-'
                    : user.profile_type === 'STUDENT'
                      ? user.profile?.student_id || '-'
                      : '-'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <User className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-sm font-semibold text-gray-500">Name</div>
                {editingNameEmail ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={nameDraft.first}
                        onChange={(e) => setNameDraft((prev) => ({ ...prev, first: e.target.value }))}
                        placeholder="First Name"
                        className="w-full rounded border px-2 py-1 text-sm"
                        disabled={nameEmailSaving}
                      />
                      <input
                        type="text"
                        value={nameDraft.last}
                        onChange={(e) => setNameDraft((prev) => ({ ...prev, last: e.target.value }))}
                        placeholder="Last Name"
                        className="w-full rounded border px-2 py-1 text-sm"
                        disabled={nameEmailSaving}
                      />
                    </div>
                    {nameEmailEditError && <div className="text-xs text-red-600">{nameEmailEditError}</div>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveNameEmail}
                        disabled={nameEmailSaving}
                        className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                      >
                        <Save className="h-3 w-3" />
                        {nameEmailSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditingNameEmail}
                        disabled={nameEmailSaving}
                        className="flex items-center gap-1 rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium text-gray-900">{String(`${nameDraft.first || ''} ${nameDraft.last || ''}`).trim() || '-'}</div>
                    {!nameEmailEditLocked && (
                      <button onClick={startEditingNameEmail} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                <Mail className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-sm font-semibold text-gray-500">Email</div>
                {editingNameEmail ? (
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      placeholder="Email"
                      className="w-full rounded border px-2 py-1 text-sm"
                      disabled={nameEmailSaving}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveNameEmail}
                        disabled={nameEmailSaving}
                        className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                      >
                        <Save className="h-3 w-3" />
                        {nameEmailSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditingNameEmail}
                        disabled={nameEmailSaving}
                        className="flex items-center gap-1 rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="truncate font-medium text-gray-900">{user.email || '-'}</div>
                    {!nameEmailEditLocked && (
                      <button onClick={startEditingNameEmail} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-sm font-semibold text-gray-500">Roles</div>
                <div className="truncate font-medium text-gray-900">{rolesText || '-'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange-100">
                <Building className="h-5 w-5 text-orange-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-sm font-semibold text-gray-500">Department</div>
                <div className="truncate font-medium text-gray-900">{(user.profile && user.profile.department && (user.profile.department.short_name || user.profile.department.code)) || '-'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <Briefcase className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-sm font-semibold text-gray-500">Designation</div>
                <div className="truncate font-medium text-gray-900">{(user.profile && user.profile.designation) || '-'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg lg:col-span-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-pink-100">
                <School className="h-5 w-5 text-pink-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 text-sm font-semibold text-gray-500">College</div>
                {user.college ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-20 text-xs font-semibold text-gray-500">Code:</span>
                      <span className="font-medium text-gray-900">{user.college.code || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-20 text-xs font-semibold text-gray-500">Name:</span>
                      <span className="font-medium text-gray-900">{user.college.name || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-20 text-xs font-semibold text-gray-500">Short Name:</span>
                      <span className="font-medium text-gray-900">{user.college.short_name || '-'}</span>
                    </div>
                    {user.college.address && (
                      <div className="flex items-start gap-2">
                        <span className="w-20 text-xs font-semibold text-gray-500">Address:</span>
                        <span className="font-medium text-gray-900">{user.college.address}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="font-medium text-gray-900">-</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg lg:col-span-2">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-teal-100">
                <Phone className="h-5 w-5 text-teal-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 text-sm font-semibold text-gray-500">Mobile Number</div>

                {verifySuccess && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                    <div className="text-sm leading-relaxed text-emerald-800">
                      <strong>Mobile number verified successfully!</strong> You can now access your Academic panel and submit requests through IDCS.
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <div className="mb-1 text-sm text-gray-500">Current number</div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-gray-900">{profileMobile || '-'}</div>
                    {!profileMobileVerified && profileMobile ? (
                      <span className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800">Unverified</span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <div className="flex w-full sm:w-auto">
                    <div className="flex items-center gap-2 rounded-l-md border border-r-0 bg-gray-50 px-3 py-2">
                      <img src={indiaFlag} alt="India flag" className="h-4 w-6 rounded-sm object-cover shadow-sm" />
                      <span className="text-sm font-medium text-gray-700">+91</span>
                    </div>
                    <input
                      value={mobileDraft}
                      onChange={handleMobileInputChange}
                      className="w-full rounded-r-md border px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#7a2038] sm:w-64"
                      placeholder="Enter 10-digit mobile"
                      disabled={otpBusy}
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </div>
                  <button onClick={handleRequestOtp} className="rounded-md bg-[#7a2038] px-4 py-2 text-white" disabled={otpBusy}>
                    {otpBusy ? 'Sending...' : 'Request OTP'}
                  </button>
                </div>

                {otpInfo && <div className="mt-2 text-sm text-emerald-700">{otpInfo}</div>}
                {otpError && !otpSent && <div className="mt-2 text-sm text-red-600">{otpError}</div>}

                {otpSent && (
                  <div className="mt-3">
                    <div className="mb-2 text-sm text-gray-500">Enter OTP ({otpSecondsLeft}s)</div>
                    <div className="flex items-center gap-2">
                      <input value={otpDraft} onChange={(e) => setOtpDraft(e.target.value)} className="rounded-md border px-3 py-2" />
                      <button onClick={handleVerifyOtp} className="rounded-md bg-emerald-600 px-3 py-2 text-white">
                        Verify
                      </button>
                      {canResendOtp && (
                        <button onClick={handleRequestOtp} className="text-sm text-[#7a2038]">
                          Resend
                        </button>
                      )}
                    </div>
                    {otpError && <div className="mt-2 text-sm text-red-600">{otpError}</div>}
                  </div>
                )}

                {profileMobile && profileMobileVerified && (
                  <div className="mt-4">
                    <button onClick={() => setRemoveModalOpen(true)} className="text-sm text-red-600">
                      Remove mobile number
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                <Key className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 text-sm font-semibold text-gray-500">Password</div>
                <div className="mb-3 font-medium text-gray-900">••••••••</div>
                <button
                  onClick={() => setChangePasswordModalOpen(true)}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-700"
                >
                  Change Password
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {changePasswordModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black opacity-30"
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
            />
            <div className="z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
              <h3 className="mb-4 text-lg font-semibold">Change Password</h3>

              {changePasswordSuccess && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                  <div className="text-sm text-emerald-800">Password changed successfully!</div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 pr-10"
                      disabled={changePasswordBusy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 pr-10"
                      disabled={changePasswordBusy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 pr-10"
                      disabled={changePasswordBusy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              {changePasswordError && <div className="mt-3 text-sm text-red-600">{changePasswordError}</div>}

              <div className="mt-6 flex justify-end gap-2">
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
                  className="rounded-md px-4 py-2 text-gray-700 hover:bg-gray-100"
                  disabled={changePasswordBusy}
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePassword}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:bg-gray-400"
                  disabled={changePasswordBusy}
                >
                  {changePasswordBusy ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {removeModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black opacity-30" onClick={() => setRemoveModalOpen(false)} />
            <div className="z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
              <h3 className="mb-3 text-lg font-semibold">Remove Mobile Number</h3>
              <p className="mb-4 text-sm text-gray-600">Enter your password to confirm removal of the mobile number.</p>
              <input
                type="password"
                value={removePassword}
                onChange={(e) => setRemovePassword(e.target.value)}
                className="mb-3 w-full rounded border px-3 py-2"
              />
              {removeError && <div className="mb-2 text-sm text-red-600">{removeError}</div>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setRemoveModalOpen(false)} className="px-3 py-2">
                  Cancel
                </button>
                <button onClick={handleRemoveMobile} className="rounded bg-red-600 px-3 py-2 text-white" disabled={removeBusy}>
                  {removeBusy ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
