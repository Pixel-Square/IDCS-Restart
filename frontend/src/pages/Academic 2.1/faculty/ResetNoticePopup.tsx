/**
 * ResetNoticePopup — shown to faculty when an admin has reset their course / exam.
 * Animated red warning with a 30-second SVG circular countdown timer.
 * Dismissal is tracked via localStorage so the popup never re-appears for the same notice.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, AlertTriangle, X } from 'lucide-react';

export interface ResetNotice {
  id: string;
  action: 'RESET_COURSE' | 'RESET_EXAM';
  description: string;
  extra: Record<string, unknown>;
  created_at: string;
  reset_by: { name: string; role: string };
  course_code: string;
  section_name: string;
}

interface Props {
  notices: ResetNotice[];
  /** Called when all visible notices have been dismissed */
  onDismissAll: () => void;
}

const TIMER_SECONDS = 30;
const CIRCLE_R = 38;          // SVG circle radius
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R; // ~238.76

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const DISMISS_PREFIX = 'reset_notice_dismissed_';

export default function ResetNoticePopup({ notices, onDismissAll }: Props) {
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const [visible, setVisible] = useState(false);

  const current = notices[index] ?? null;

  // Slide-in after mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Countdown tick
  useEffect(() => {
    if (!current) return;
    setSecondsLeft(TIMER_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          handleDismiss();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  const handleDismiss = useCallback(() => {
    if (!current) return;
    localStorage.setItem(`${DISMISS_PREFIX}${current.id}`, '1');
    if (index + 1 < notices.length) {
      setIndex((i) => i + 1);
      setVisible(false);
      setTimeout(() => setVisible(true), 60);
    } else {
      setVisible(false);
      setTimeout(onDismissAll, 350);
    }
  }, [current, index, notices.length, onDismissAll]);

  if (!current) return null;

  // SVG stroke progress: full circle = TIMER_SECONDS, animates to 0
  const progress = secondsLeft / TIMER_SECONDS;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const isCoursReset = current.action === 'RESET_COURSE';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(-24px) scale(0.96)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.35s cubic-bezier(.22,1,.36,1), opacity 0.35s ease',
        }}
      >
        {/* Red gradient header */}
        <div className="bg-gradient-to-r from-red-700 to-red-500 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Pulsing shield icon */}
              <div className="relative">
                <div
                  className="absolute inset-0 bg-red-300 rounded-full opacity-40"
                  style={{ animation: 'ping 1.5s cubic-bezier(0,0,.2,1) infinite' }}
                />
                <div className="relative p-2 bg-white/20 rounded-full">
                  <ShieldAlert className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wide">
                  Admin Action
                </p>
                <h2 className="text-white font-bold text-base leading-tight">
                  {isCoursReset ? 'Course Reset' : 'Exam Reset'} Notice
                </h2>
              </div>
            </div>

            {/* SVG circular countdown */}
            <div className="relative flex-shrink-0">
              <svg width="64" height="64" viewBox="0 0 88 88">
                {/* Track */}
                <circle
                  cx="44" cy="44" r={CIRCLE_R}
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="6"
                />
                {/* Progress arc */}
                <circle
                  cx="44" cy="44" r={CIRCLE_R}
                  fill="none"
                  stroke="white"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 44 44)"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
                <text
                  x="44" y="50"
                  textAnchor="middle"
                  fill="white"
                  fontSize="18"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {secondsLeft}
                </text>
              </svg>
            </div>
          </div>
        </div>

        {/* Notice counter badge */}
        {notices.length > 1 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-900 text-white text-xs px-3 py-0.5 rounded-full">
            {index + 1} of {notices.length} notices
          </div>
        )}

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Warning banner */}
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" style={{ animation: 'bounce 1s infinite' }} />
            <p className="text-sm text-red-700 leading-snug">{current.description}</p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Reset by</p>
              <p className="font-semibold text-gray-900">{current.reset_by.name}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
              <p className="text-xs text-red-400 mb-0.5">Role</p>
              <p className="font-semibold text-red-700">{current.reset_by.role}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <p className="text-xs text-gray-400 mb-0.5">Date &amp; Time</p>
              <p className="font-medium text-gray-800">{formatDate(current.created_at)}</p>
            </div>
          </div>

          {/* Extra info for exam reset */}
          {!isCoursReset && current.extra?.exam_name && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <span className="text-xs text-amber-500 block mb-0.5">Affected Exam</span>
              <span className="font-semibold text-amber-800">{String(current.extra.exam_name)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Okay, Got It
          </button>
          <button
            onClick={handleDismiss}
            className="p-3 border rounded-xl hover:bg-gray-50 text-gray-500"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom timer bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-1 bg-red-500 transition-all"
            style={{
              width: `${(secondsLeft / TIMER_SECONDS) * 100}%`,
              transition: 'width 1s linear',
            }}
          />
        </div>
      </div>

      {/* Bounce animation keyframes */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); animation-timing-function: cubic-bezier(.8,0,1,1); }
          50% { transform: translateY(-4px); animation-timing-function: cubic-bezier(0,0,.2,1); }
        }
      `}</style>
    </div>
  );
}
