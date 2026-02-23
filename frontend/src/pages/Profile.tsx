import React, { useEffect, useMemo, useState } from 'react';
import { getMe, requestMobileOtp, verifyMobileOtp } from '../services/auth';
import { User, Mail, Shield, Building, Briefcase, School, Phone, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

type RoleObj = { name: string };
type Me = {
  id: number;
  username: string;
  email?: string;
  roles?: string[] | RoleObj[];
  permissions?: string[];
  profile_type?: string | null;
  profile_status?: string | null;
  capabilities?: Record<string, string[]>;
  profile?: any;
  college?: any;
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

  useEffect(() => {
    // Keep local UI state synced with loaded profile
    const current = profileMobile || '';
    setMobileDraft(current);
    setMobileEditing(!profileMobileVerified || !current);
    setOtpSent(false);
    setOtpDraft('');
    setOtpError(null);
    setOtpInfo(null);
    setOtpExpiresAtMs(null);
    setOtpSecondsLeft(0);
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
        // normalize roles
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

    const nextMobile = String(mobileDraft || '').trim();
    if (!nextMobile) {
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
    const nextMobile = String(mobileDraft || '').trim();
    const otp = String(otpDraft || '').trim();
    if (!nextMobile) {
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
      // Prefer server-returned updated /me payload when present.
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
            {/* Account Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">Account</div>
                  <div className="text-gray-900 font-medium truncate">ID: {user.id}</div>
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
                  <div className="text-gray-900 font-medium truncate">{user.email || '—'}</div>
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
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <School className="w-5 h-5 text-pink-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-1">College</div>
                  <div className="text-gray-900 font-medium truncate">
                    {(user.college && (user.college.short_name || user.college.name)) || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Number Card */}
            <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-500 mb-2">Mobile Number</div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"
                        value={mobileDraft}
                        onChange={(e) => {
                          setMobileDraft(e.target.value);
                          setOtpSent(false);
                          setOtpDraft('');
                          setOtpError(null);
                          setOtpInfo(null);
                          setOtpExpiresAtMs(null);
                          setOtpSecondsLeft(0);
                        }}
                        readOnly={showVerifiedCheck}
                        placeholder="Enter mobile number"
                      />
                      {showVerifiedCheck && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                      )}
                    </div>

                    {!showVerifiedCheck && (
                      <button
                        type="button"
                        className="px-3 py-2 rounded-md bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"
                        onClick={handleRequestOtp}
                        disabled={otpBusy || (otpSent && otpExpiresAtMs != null && !canResendOtp)}
                      >
                        {otpSent ? (canResendOtp ? 'Resend OTP' : 'OTP Sent') : 'Verify'}
                      </button>
                    )}
                  </div>

                  {otpInfo && <div className="mt-2 text-xs text-gray-500">{otpInfo}</div>}
                  {otpError && <div className="mt-2 text-xs text-red-600 font-semibold">{otpError}</div>}

                  {otpSent && otpExpiresAtMs != null && !showVerifiedCheck && (
                    <div className="mt-2 text-xs text-gray-600">
                      {otpSecondsLeft > 0 ? (
                        <span>
                          OTP expires in{' '}
                          {String(Math.floor(otpSecondsLeft / 60)).padStart(2, '0')}:
                          {String(otpSecondsLeft % 60).padStart(2, '0')}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">OTP expired. You can resend now.</span>
                      )}
                    </div>
                  )}

                  {otpSent && !showVerifiedCheck && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"
                        value={otpDraft}
                        onChange={(e) => setOtpDraft(e.target.value)}
                        placeholder="Enter OTP"
                      />
                      <button
                        type="button"
                        className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
                        onClick={handleVerifyOtp}
                        disabled={otpBusy}
                      >
                        Submit
                      </button>
                    </div>
                  )}

                  {showVerifiedCheck && (
                    <button
                      type="button"
                      className="mt-2 text-xs text-blue-700 underline font-semibold"
                      onClick={() => {
                        setMobileEditing(true);
                        setOtpSent(false);
                        setOtpDraft('');
                        setOtpError(null);
                        setOtpInfo(null);
                      }}
                    >
                      Change number
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
