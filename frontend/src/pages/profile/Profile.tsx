import React, { useEffect, useMemo, useState } from 'react';
import { getMe, requestMobileOtp, verifyMobileOtp, removeMobileNumber, changePassword } from '../../services/auth';
import { User, Mail, Shield, Building, Briefcase, School, Phone, CheckCircle2, Trash2, Key, Eye, EyeOff, Edit2, Save, X } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { ModalPortal } from '../../components/ModalPortal';
import logo from '../../assets/idcs-logo.png';
import fetchWithAuth from '../../services/fetchAuth';

type RoleObj = { name: string };
type Me = {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  roles?: string[] | RoleObj[];
  permissions?: string[];
  profile_type?: string | null;
  profile_status?: string | null;
  capabilities?: Record<string, string[]>;
  profile?: any;
  college?: {
    code?: string;
    name?: string;
    short_name?: string;
    address?: string;
  };
};

function normalizeMobileForUi(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return s;
}

export default function ProfilePage({ user: initialUser }: { user?: Me | null }) {
  const [user, setUser] = useState<Me | null | undefined>(initialUser === undefined ? null : initialUser);
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

  // Edit username and name (combined) states
  const [editingProfile, setEditingProfile] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [nameFirstDraft, setNameFirstDraft] = useState('');
  const [nameLastDraft, setNameLastDraft] = useState('');
  const [profileEditError, setProfileEditError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);

  useEffect(() => {
    const current = profileMobile || '';
    const normalized = current.trim() ? (current.startsWith('+91') ? current : `+91${current.replace(/^\+91\s*/, '')}`) : '';
    setMobileDraft(normalized);
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

  const showVerifiedCheck = Boolean(profileMobileVerified && !mobileEditing && profileMobile);

  async function handleRequestOtp() {
    setOtpError(null);
    setOtpInfo(null);

    let nextMobile = String(mobileDraft || '').trim();
    if (nextMobile && !nextMobile.startsWith('+91')) {
      nextMobile = `+91${nextMobile}`;
    }
    if (!nextMobile || nextMobile === '+91') {
      setOtpError('Enter mobile number.');
      return;
    }
    try {
      setOtpBusy(true);
      const res = await requestMobileOtp(nextMobile);
      setOtpSent(true);

      const expiresIn = Number(res?.expires_in_seconds ?? 0);
      if (Number.isFinite(expiresIn) && expiresIn > 0) {
        setOtpExpiresAtMs(Date.now() + expiresIn * 1000);
        setOtpSecondsLeft(Math.ceil(expiresIn));
        const mins = Math.ceil(expiresIn / 60);
        setOtpInfo(`OTP sent. Valid for ${mins} minute${mins === 1 ? '' : 's'}.`);
      } else {
        setOtpExpiresAtMs(null);
        setOtpSecondsLeft(0);
        setOtpInfo('OTP sent.');
      }
    } catch (e: any) {
      const statusCode = Number(e?.response?.status || 0);
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
    let nextMobile = String(mobileDraft || '').trim();
    if (nextMobile && !nextMobile.startsWith('+91')) {
      nextMobile = `+91${nextMobile}`;
    }
    const otp = String(otpDraft || '').trim();
    if (!nextMobile || nextMobile === '+91') {
      setOtpError('Enter mobile number.');
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
        const normalized = {
          ...me,
          roles: Array.isArray(me.roles) ? me.roles.map((role: any) => (typeof role === 'string' ? role : role.name)) : [],
        } as Me;
        setUser(normalized);
      } else {
        const r = await getMe();
        const normalized = {
          ...r,
          roles: Array.isArray(r.roles) ? r.roles.map((role: any) => (typeof role === 'string' ? role : role.name)) : [],
        } as Me;
        setUser(normalized);
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
        const normalized = {
          ...me,
          roles: Array.isArray(me.roles) ? me.roles.map((role: any) => (typeof role === 'string' ? role : role.name)) : [],
        } as Me;
        setUser(normalized);
      } else {
        const r = await getMe();
        const normalized = {
          ...r,
          roles: Array.isArray(r.roles) ? r.roles.map((role: any) => (typeof role === 'string' ? role : role.name)) : [],
        } as Me;
        setUser(normalized);
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

  async function handleSaveProfile() {
    setProfileEditError(null);
    const username = String(usernameDraft || '').trim();
    const firstName = String(nameFirstDraft || '').trim();
    const lastName = String(nameLastDraft || '').trim();

    if (!username) {
      setProfileEditError('Username cannot be empty');
      return;
    }

    try {
      setProfileSaving(true);
      const response = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, first_name: firstName, last_name: lastName })
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
      setEditingProfile(false);
    } catch (e: any) {
      setProfileEditError(String(e?.message || e || 'Failed to update profile'));
    } finally {
      setProfileSaving(false);
    }
  }

  function startEditingProfile() {
    setUsernameDraft(user?.username || '');
    setNameFirstDraft(user?.first_name || '');
    setNameLastDraft(user?.last_name || '');
    setEditingProfile(true);
    setProfileEditError(null);
  }

  function cancelEditingProfile() {
    setEditingProfile(false);
    setProfileEditError(null);
  }

  async function handleSaveEmail() {
    setEmailError(null);
    const email = String(emailDraft || '').trim();

    try {
      setEmailSaving(true);
      const response = await fetchWithAuth('/api/accounts/profile/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to update email');
      }

      const updated = await getMe();
      const normalized = {
        ...updated,
        roles: Array.isArray(updated.roles) ? updated.roles.map((role: any) => (typeof role === 'string' ? role : role.name)) : [],
      } as Me;
      setUser(normalized);
      setEditingEmail(false);
    } catch (e: any) {
      setEmailError(String(e?.message || e || 'Failed to update email'));
    } finally {
      setEmailSaving(false);
    }
  }

  function startEditingEmail() {
    setEmailDraft(user?.email || '');
    setEditingEmail(true);
    setEmailError(null);
  }

  function cancelEditingEmail() {
    setEditingEmail(false);
    setEmailError(null);
  }

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6 space-y-6">
        {/* Profile Header Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 sm:p-8 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-2xl sm:text-3xl font-bold text-white">{initials}</span>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{user.username}</h1>
                <p className="text-gray-600 mt-1">{user.email || 'No email provided'}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg px-4 py-2 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">Profile Type</div>
              <div className="font-bold text-gray-900">{user.profile_type || '—'}</div>
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

            {/* Username & Name Card (Combined) */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">Username & Name</div>
                  {editingProfile ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={usernameDraft}
                        onChange={(e) => setUsernameDraft(e.target.value)}
                        placeholder="Username"
                        className="w-full px-2 py-1 border rounded text-sm"
                        disabled={profileSaving}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={nameFirstDraft}
                          onChange={(e) => setNameFirstDraft(e.target.value)}
                          placeholder="First Name"
                          className="w-full px-2 py-1 border rounded text-sm"
                          disabled={profileSaving}
                        />
                        <input
                          type="text"
                          value={nameLastDraft}
                          onChange={(e) => setNameLastDraft(e.target.value)}
                          placeholder="Last Name"
                          className="w-full px-2 py-1 border rounded text-sm"
                          disabled={profileSaving}
                        />
                      </div>
                      {profileEditError && <div className="text-xs text-red-600">{profileEditError}</div>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveProfile}
                          disabled={profileSaving}
                          className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                        >
                          <Save className="w-3 h-3" />
                          {profileSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditingProfile}
                          disabled={profileSaving}
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
                          <span className="text-gray-900 font-medium">{user.username || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500 w-20">Name:</span>
                          <span className="text-gray-900 font-medium">
                            {user.first_name || ''} {user.last_name || ''} {(!user.first_name && !user.last_name) && '—'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={startEditingProfile}
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

            {/* Email Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">Email</div>
                  {editingEmail ? (
                    <div className="space-y-2">
                      <input
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        placeholder="Email"
                        className="w-full px-2 py-1 border rounded text-sm"
                        disabled={emailSaving}
                      />
                      {emailError && <div className="text-xs text-red-600">{emailError}</div>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEmail}
                          disabled={emailSaving}
                          className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                        >
                          <Save className="w-3 h-3" />
                          {emailSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditingEmail}
                          disabled={emailSaving}
                          className="flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-gray-900 font-medium truncate">{user.email || '—'}</div>
                      <button
                        onClick={startEditingEmail}
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
                    <input
                      value={mobileDraft}
                      onChange={(e) => setMobileDraft(e.target.value)}
                      className="px-3 py-2 border rounded-md w-full sm:w-64"
                      placeholder="+91XXXXXXXXXX"
                      disabled={otpBusy}
                    />
                    <button
                      onClick={handleRequestOtp}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md"
                      disabled={otpBusy}
                    >
                      {otpBusy ? 'Sending…' : 'Request OTP'}
                    </button>
                  </div>

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

                  <div className="mt-4">
                    <button onClick={() => setRemoveModalOpen(true)} className="text-sm text-red-600">Remove mobile number</button>
                  </div>

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

      </div>
    </DashboardLayout>
  );
}

