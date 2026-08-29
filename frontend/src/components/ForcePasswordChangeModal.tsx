import React, { useState } from 'react';
import fetchWithAuth from '../services/fetchAuth';
import { Lock, Eye, EyeOff, AlertTriangle, Trophy, ArrowRight, CheckCircle2 } from 'lucide-react';

interface Props {
  user?: any;
  onComplete: (navigateToProfile?: boolean) => void;
}

export default function ForcePasswordChangeModal({ user, onComplete }: Props) {
  const [step, setStep] = useState<'change' | 'success'>('change');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from current password.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/accounts/change-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Password change failed.');
        return;
      }

      // Clear flag from localStorage
      try {
        localStorage.removeItem('must_change_password');
      } catch {}

      // Check if user is super admin or college admin
      const roles = Array.isArray(user?.roles)
        ? user.roles.map((r: any) => String(typeof r === 'string' ? r : r?.name || '').toUpperCase())
        : [];
      const roleStr = String(user?.role || '').toUpperCase();
      const isSuperOrAdmin = user?.is_superuser ||
        roles.includes('SUPER_ADMIN') || roles.includes('SUPERADMIN') ||
        roles.includes('ADMIN') || roles.includes('COLLEGE_ADMIN') || roles.includes('COLLEGE ADMIN') ||
        ['SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'COLLEGE_ADMIN'].includes(roleStr);

      if (isSuperOrAdmin) {
        onComplete(false);
      } else {
        // Transition to game-like Step 2 onboarding screen for regular users
        setStep('success');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 transition-all duration-300">
        
        {step === 'change' ? (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 p-6 text-white relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                    <Lock className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">Security Check</h2>
                </div>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold uppercase tracking-wider">
                  Step 1 of 2
                </span>
              </div>
              <p className="text-sm text-amber-100 leading-relaxed">
                Your account was set up with a temporary password. Please set a new secure password to proceed.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Current Password <span className="text-xs text-gray-400 font-normal">(Reg No / Staff ID)</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm transition-all"
                  />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm transition-all"
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl transition-all shadow-lg hover:shadow-orange-200 disabled:opacity-60"
              >
                {saving ? 'Changing Password...' : 'Change Password & Unlock Next Step'}
              </button>
            </form>
          </>
        ) : (
          /* Gamified Step 2 Transition Screen */
          <div className="p-8 text-center bg-gradient-to-b from-indigo-900 via-purple-900 to-slate-900 text-white relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-pink-500/20 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-5">
              <div className="w-20 h-20 bg-gradient-to-tr from-amber-400 to-orange-500 rounded-3xl mx-auto flex items-center justify-center shadow-xl transform hover:scale-105 transition-transform duration-300 ring-4 ring-amber-400/30">
                <Trophy className="w-10 h-10 text-slate-900" />
              </div>

              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Level 1 Complete: Password Updated
                </span>
                <h3 className="text-2xl font-black tracking-tight text-white pt-2">
                  Welcome Aboard! 🎉
                </h3>
              </div>

              <p className="text-sm text-purple-200 leading-relaxed max-w-sm mx-auto">
                Your new password is now active. <br />
                <span className="text-amber-300 font-semibold">Step 2 of 2:</span> Next, let's complete your basic profile details so your department and mentors can reach you.
              </p>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={() => onComplete(true)}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500 text-slate-950 font-black text-base shadow-xl hover:shadow-orange-500/20 transform hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 group ring-2 ring-amber-300/50 cursor-pointer"
                >
                  <span>Go to Profile & Complete Details</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
