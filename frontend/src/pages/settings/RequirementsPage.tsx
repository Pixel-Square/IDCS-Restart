import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, Lock, Phone, UserCircle2 } from 'lucide-react';
import idcsLogo from '../../assets/idcs-logo.png';

type RequirementsConfig = {
  viewing_enabled: boolean;
  require_profile_photo: boolean;
  require_mobile_number: boolean;
  has_profile_photo: boolean;
  has_mobile_number: boolean;
};

interface RequirementsPageProps {
  externalConfig: RequirementsConfig;
  title?: string;
}

function RequirementRow({
  title,
  description,
  done,
  accent,
  icon,
}: {
  title: string;
  description: string;
  done: boolean;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-2xl p-3 ${accent}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
            </div>
            {done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            )}
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${done ? 'bg-emerald-500 w-full' : 'bg-amber-400 w-2/5'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RequirementsPage({
  externalConfig,
  title = 'Complete your profile to view My Marks',
}: RequirementsPageProps) {
  const navigate = useNavigate();

  const requirements = [
    {
      key: 'viewing',
      enabled: true,
      done: externalConfig.viewing_enabled,
      title: 'My Marks viewing enabled',
      description: 'Academic 2.1 student marks are currently controlled by admin settings.',
      accent: 'bg-rose-50 text-rose-500',
      icon: <Lock className="h-5 w-5" />,
    },
    {
      key: 'photo',
      enabled: externalConfig.require_profile_photo,
      done: externalConfig.has_profile_photo,
      title: 'Profile photo required',
      description: 'Upload a profile photo so your student account is complete for secure marks viewing.',
      accent: 'bg-sky-50 text-sky-500',
      icon: <UserCircle2 className="h-5 w-5" />,
    },
    {
      key: 'mobile',
      enabled: externalConfig.require_mobile_number,
      done: externalConfig.has_mobile_number,
      title: 'Mobile number required',
      description: 'Add your mobile number in the student profile before opening My Marks.',
      accent: 'bg-violet-50 text-violet-500',
      icon: <Phone className="h-5 w-5" />,
    },
  ].filter((item) => item.enabled || item.key === 'viewing');

  const completedCount = requirements.filter((item) => item.done).length;
  const totalCount = requirements.length || 1;
  const progress = Math.round((completedCount / totalCount) * 100);
  const blockedByAdmin = !externalConfig.viewing_enabled;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(244,114,182,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.18),_transparent_24%),linear-gradient(135deg,_#fff7ed_0%,_#ffffff_42%,_#eff6ff_100%)] p-6 shadow-xl sm:p-8">
        <div className="absolute inset-y-0 right-0 hidden w-80 translate-x-20 rounded-full bg-gradient-to-br from-amber-100/60 via-rose-100/40 to-sky-100/60 blur-3xl lg:block" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/70 px-4 py-2 shadow-sm backdrop-blur">
              <img src={idcsLogo} alt="IDCS" className="h-8 w-8 rounded-full object-cover" />
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Academic 2.1</span>
            </div>
            <h1 className="max-w-xl text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              {blockedByAdmin
                ? 'My Marks is currently disabled by the administrator. Once it is enabled, the remaining profile requirements below will be checked automatically.'
                : 'Your My Marks page is protected by profile requirements. Complete the missing items below and come back to view your course marks and cycle analytics.'}
            </p>

            <div className="mt-6 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Completion Progress</p>
                  <p className="mt-2 text-3xl font-black text-slate-900">{progress}%</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-700">{completedCount}/{totalCount} requirements ready</p>
                  <p className="mt-1 text-xs text-slate-500">Profile checks update automatically after you save changes.</p>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-sky-500 transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Update Profile
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to Dashboard
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {requirements.map((item) => (
              <RequirementRow
                key={item.key}
                title={item.title}
                description={item.description}
                done={item.done}
                accent={item.accent}
                icon={item.icon}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
