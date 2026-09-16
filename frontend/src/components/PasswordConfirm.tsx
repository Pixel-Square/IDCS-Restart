import React, { useCallback, useRef, useState } from 'react';

interface AskOptions {
  title: string;
  message: string;
  actionLabel?: string;
  onConfirm: (password: string) => Promise<void>;
}

/**
 * Hook that exposes:
 *  - `ask(opts)` — opens the password confirmation dialog
 *  - `modal`     — JSX element to embed in the render tree (lowercase, matches usage in AuditManagementPage)
 */
export function usePasswordConfirm() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<AskOptions | null>(null);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = useCallback((options: AskOptions) => {
    setOpts(options);
    setPassword('');
    setError('');
    setSubmitting(false);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPassword('');
    setError('');
    setSubmitting(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!opts) return;
    setSubmitting(true);
    setError('');
    try {
      await opts.onConfirm(password);
      close();
    } catch (e: any) {
      setError(e?.message || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [opts, password, close]);

  const modal = open && opts ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{opts.title}</h3>
            <p className="mt-1 text-sm text-gray-500 whitespace-pre-line">{opts.message}</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Enter your password to confirm</label>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && password) handleConfirm(); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="Password"
            autoComplete="current-password"
          />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={close}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!password || submitting}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Please wait…' : (opts.actionLabel ?? 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { ask, modal };
}
