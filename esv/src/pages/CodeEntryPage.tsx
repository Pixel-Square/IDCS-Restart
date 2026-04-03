import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findAllocationsForFaculty } from '../stores/coeStore';

const CODE_LENGTH = 6;

export default function CodeEntryPage() {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  const handleChange = useCallback((index: number, value: string) => {
    const char = value.slice(-1).toUpperCase();
    if (char && !/^[A-Z0-9]$/.test(char)) return;

    setDigits((prev) => {
      const next = [...prev];
      next[index] = char;
      return next;
    });
    setError('');

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < text.length; i++) {
        next[i] = text[i];
      }
      return next;
    });
    const focusIndex = Math.min(text.length, CODE_LENGTH - 1);
    setTimeout(() => inputRefs.current[focusIndex]?.focus(), 0);
  }, []);

  const handleSubmit = useCallback(() => {
    const code = digits.join('');
    if (code.length < CODE_LENGTH) {
      setError('Please enter the complete faculty code.');
      return;
    }

    setChecking(true);
    setError('');

    // Small delay to show loading state
    setTimeout(() => {
      // Store faculty code in session and navigate immediately
      // The user is logged in regardless of whether bundles are assigned yet
      sessionStorage.setItem('esv-faculty-code', code);
      navigate('/profile');
    }, 300);
  }, [digits, navigate]);

  const handleKeySubmit = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl bg-white/95 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)] border border-[#d9b7ac] p-8 space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#6f1d34] to-[#a3462d] mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
            <h1 className="text-3xl font-bold text-[#5a192f]">End Semester Valuation</h1>
            <p className="mt-2 text-sm text-[#6f4a3f]">Enter your 6-character faculty code to begin</p>
          </div>

          {/* Code input boxes */}
          <div className="flex justify-center gap-3" onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => {
                  handleKeyDown(index, e);
                  handleKeySubmit(e);
                }}
                className="w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 border-[#d9b7ac] bg-[#faf4f0] text-[#5a192f] focus:border-[#b2472e] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#d67d55]/30 transition-all uppercase"
                autoFocus={index === 0}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={checking || digits.some((d) => !d)}
            className="w-full rounded-xl bg-gradient-to-r from-[#6f1d34] to-[#a3462d] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:from-[#591729] hover:to-[#8c3a25] focus:outline-none focus:ring-2 focus:ring-[#d67d55]/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {checking ? 'Verifying...' : 'Enter Valuation'}
          </button>

          <p className="text-center text-xs text-[#a08070]">
            Your faculty code was provided by the Controller of Examinations
          </p>
        </div>
      </div>
    </div>
  );
}
