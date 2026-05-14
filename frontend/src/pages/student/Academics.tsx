import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { AlertCircle, BookOpen, Camera, Phone, ExternalLink } from 'lucide-react';
import { ensureProfilePhotoPresent, ensureMobileVerified } from '../../services/auth';

type CourseItem = {
  id: number | null;
  code: string;
  name: string;
  class_type: string | null;
  marks: {
    final_mark?: number | null;
    final_mark_100?: number | null;
    final_mark_max?: number | null;
    internal?: {
      total: number | null;
      max_total: number | null;
    };
    has_cqi?: boolean;
    cos?: Record<string, number | null>;
  };
};

type MarksConditions = { require_profile: boolean; require_phone: boolean };

function BlockedAccessPopup({
  requireProfile,
  requirePhone,
  hasProfile,
  hasPhone,
  onClose,
}: {
  requireProfile: boolean;
  requirePhone: boolean;
  hasProfile: boolean;
  hasPhone: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const missing: { icon: React.ReactNode; label: string; action: () => void; actionLabel: string }[] = [];

  if (requireProfile && !hasProfile) {
    missing.push({
      icon: <Camera size={20} className="text-red-500" />,
      label: 'Upload your profile picture',
      action: () => navigate('/profile'),
      actionLabel: 'Go to Profile',
    });
  }
  if (requirePhone && !hasPhone) {
    missing.push({
      icon: <Phone size={20} className="text-red-500" />,
      label: 'Verify your mobile number',
      action: () => navigate('/profile'),
      actionLabel: 'Go to Profile',
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="text-red-600" size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Action Required</h2>
            <p className="text-sm text-gray-500">Complete the following to view your marks</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {missing.map((item, i) => (
            <div key={i} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                {item.icon}
                <span className="text-sm font-medium text-gray-800">{item.label}</span>
              </div>
              <button
                onClick={item.action}
                className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {item.actionLabel}
                <ExternalLink size={12} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function StudentAcademics() {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [semesterNumber, setSemesterNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [conditions, setConditions] = useState<MarksConditions>({ require_profile: false, require_phone: false });
  const [condLoaded, setCondLoaded] = useState(false);
  const [hasProfile, setHasProfile] = useState(true);
  const [hasPhone, setHasPhone] = useState(true);
  const [showBlockedPopup, setShowBlockedPopup] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);

  // Load conditions first
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/accounts/app-conditions/');
        if (res.ok) {
          const j = await res.json();
          const m: MarksConditions = j?.conditions?.marks ?? { require_profile: false, require_phone: false };
          setConditions(m);

          // Check user status
          const [hp, hph] = await Promise.all([
            m.require_profile ? ensureProfilePhotoPresent() : Promise.resolve(true),
            m.require_phone ? ensureMobileVerified() : Promise.resolve(true),
          ]);
          setHasProfile(hp);
          setHasPhone(hph);

          const blocked = (m.require_profile && !hp) || (m.require_phone && !hph);
          if (blocked) {
            setShowBlockedPopup(true);
          } else {
            setAccessGranted(true);
          }
        } else {
          // If conditions API fails, allow access (fail open)
          setAccessGranted(true);
        }
      } catch {
        setAccessGranted(true);
      } finally {
        setCondLoaded(true);
      }
    })();
  }, []);

  // Load marks only after access is granted
  useEffect(() => {
    if (!accessGranted) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth('/api/academics/student/marks/');
        if (!mounted) return;
        if (!res.ok) {
          setError(`Failed to load marks (HTTP ${res.status}).`);
          return;
        }
        const j = await res.json();
        if (!mounted) return;
        setCourses(Array.isArray(j?.courses) ? j.courses : []);
        setSemesterNumber(j?.semester?.number ?? null);
      } catch {
        if (mounted) setError('Failed to load marks.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [accessGranted]);

  const fmt = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return '—';
    return String(Math.round(v * 100) / 100);
  };

  const handleDismissPopup = () => {
    setShowBlockedPopup(false);
    // Re-check after dismissal in case user updated from another tab
    (async () => {
      const [hp, hph] = await Promise.all([
        conditions.require_profile ? ensureProfilePhotoPresent() : Promise.resolve(true),
        conditions.require_phone ? ensureMobileVerified() : Promise.resolve(true),
      ]);
      setHasProfile(hp);
      setHasPhone(hph);
      const blocked = (conditions.require_profile && !hp) || (conditions.require_phone && !hph);
      if (!blocked) setAccessGranted(true);
    })();
  };

  if (!condLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8 font-inter">
      {showBlockedPopup && (
        <BlockedAccessPopup
          requireProfile={conditions.require_profile}
          requirePhone={conditions.require_phone}
          hasProfile={hasProfile}
          hasPhone={hasPhone}
          onClose={handleDismissPopup}
        />
      )}

      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
              <BookOpen className="text-indigo-600" size={32} />
              My Marks
            </h1>
            <p className="text-sm text-gray-500 mt-2 font-medium">
              {semesterNumber ? `Semester ${semesterNumber} · ` : ''}Internal assessment summary.
            </p>
          </div>
        </div>

        {/* Body */}
        {!accessGranted ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-200 shadow-sm">
            <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
            <h3 className="text-lg font-bold text-gray-900">Access Restricted</h3>
            <p className="text-gray-500 mt-1">Please complete the required steps to view your marks.</p>
            <button
              onClick={() => setShowBlockedPopup(true)}
              className="mt-4 inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-colors"
            >
              View Requirements
            </button>
          </div>
        ) : loading ? (
          <div className="flex justify-center items-center h-48 bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm flex items-start gap-3">
            <AlertCircle className="text-red-500 mt-0.5" size={20} />
            <span className="text-red-800 text-sm font-medium">{error}</span>
          </div>
        ) : !courses.length ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-200 shadow-sm">
            <BookOpen className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-gray-900">No courses found</h3>
            <p className="text-gray-500 mt-1">No academic data available for the current semester.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {courses.map((c) => {
              const fim100 = c.marks?.final_mark_100 ?? null;
              const fimRaw = c.marks?.final_mark ?? null;
              const fimMax = c.marks?.final_mark_max ?? null;
              const hasCqi = Boolean(c.marks?.has_cqi);

              // primary: FinalInternalMark → "100" column (same as Internal Mark page)
              const displayScore: number | null = fim100;
              const displayRaw: number | null = fimRaw;
              const displayMax: number | null = fimMax;
              const hasData = displayScore != null || displayRaw != null;

              return (
                <div
                  key={c.id ?? c.code}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-5 py-4 gap-4">
                    {/* Left: code + name */}
                    <div className="flex-1 min-w-0">
                      <div className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 tracking-widest uppercase mb-1 border border-slate-200">
                        {c.code || 'CODE'}
                      </div>
                      <div className="text-base font-bold text-gray-900 leading-snug line-clamp-2">
                        {c.name || 'Course Name'}
                      </div>
                      {c.class_type && (
                        <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wider">{c.class_type}</div>
                      )}
                    </div>

                    {/* Right: marks */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Raw total (e.g. out of 50) */}
                      {displayRaw != null && displayMax != null && (
                        <div className="flex flex-col items-center justify-center min-w-[56px] rounded-xl px-2.5 py-2 border bg-gray-50 border-gray-200">
                          <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold mb-0.5">
                            {fmt(displayMax) === '50' ? '/ 50' : `/ ${fmt(displayMax)}`}
                          </span>
                          <span className="text-lg font-extrabold leading-none text-gray-700">
                            {fmt(displayRaw)}
                          </span>
                        </div>
                      )}
                      {/* Scaled / 100 */}
                      <div className={`flex flex-col items-center justify-center min-w-[64px] rounded-xl px-3 py-2.5 border ${hasData ? (hasCqi ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-900 border-slate-900') : 'bg-gray-50 border-gray-200'}`}>
                        <span className={`text-[9px] uppercase tracking-wider font-bold mb-0.5 ${hasData ? (hasCqi ? 'text-indigo-400' : 'text-white/60') : 'text-gray-400'}`}>
                          / 100
                        </span>
                        <span className={`text-2xl font-extrabold leading-none ${hasData ? (hasCqi ? 'text-indigo-700' : 'text-white') : 'text-gray-300'}`}>
                          {displayScore != null ? String(displayScore) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

