/**
 * CanvaOAuthCallbackPage.tsx
 *
 * Handles the redirect back from Canva after OAuth authorisation.
 * Route: /branding/oauth-callback  (relative to Routes in BrandingLayout)
 *
 * Canva appends ?code=...&state=...  (success) or ?error=...&error_description=... (denied)
 * to the registered redirect_uri.
 *
 * On success: exchanges code for tokens via backend proxy, then navigates to /branding/templates.
 * On error:   displays the error and offers a retry link.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { handleCallback } from '../../../services/canva/CanvaAuthService';

type Phase = 'exchanging' | 'success' | 'error';

export default function CanvaOAuthCallbackPage() {
  const [searchParams]    = useSearchParams();
  const navigate          = useNavigate();
  const [phase, setPhase] = useState<Phase>('exchanging');
  const [errMsg, setErr]  = useState('');
  const didRun            = useRef(false);

  useEffect(() => {
    // Guard against React Strict Mode double-invoke
    if (didRun.current) return;
    didRun.current = true;

    const code  = searchParams.get('code')  ?? '';
    const state = searchParams.get('state') ?? '';
    const error = searchParams.get('error') ?? '';

    if (error) {
      const desc = searchParams.get('error_description') ?? error;
      setErr(decodeURIComponent(desc));
      setPhase('error');
      return;
    }

    if (!code) {
      setErr('No authorisation code received from Canva.');
      setPhase('error');
      return;
    }

    handleCallback(code, state)
      .then(() => {
        setPhase('success');
        setTimeout(() => navigate('/branding/templates', { replace: true }), 1500);
      })
      .catch((err: unknown) => {
        setErr((err as Error).message ?? 'Token exchange failed.');
        setPhase('error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-sm w-full text-center">
        {phase === 'exchanging' && (
          <>
            <div className="flex justify-center mb-5">
              <Loader className="w-12 h-12 text-purple-500 animate-spin" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Connecting to Canva…</h2>
            <p className="text-gray-500 text-sm">Exchanging authorisation code for tokens.</p>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="flex justify-center mb-5">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Connected!</h2>
            <p className="text-gray-500 text-sm">Redirecting to Templates…</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="flex justify-center mb-5">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Connection Failed</h2>
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-6">{errMsg}</p>
            <button
              onClick={() => navigate('/branding/templates', { replace: true })}
              className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors"
            >
              Back to Templates
            </button>
          </>
        )}
      </div>
    </div>
  );
}
