/**
 * CanvaOAuthCallbackPage.tsx
 *
 * With the new server-side OAuth flow, Django handles the /api/canva/oauth/callback
 * route directly and redirects the browser to /branding/templates?canva_connected=1
 * on success.  This frontend route (/branding/oauth-callback) is no longer
 * used as the Canva redirect target, but is kept as a legacy/fallback page.
 *
 * If a user somehow lands here (e.g. an old bookmark), we detect query params
 * and redirect them appropriately.
 */
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';

export default function CanvaOAuthCallbackPage() {
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      navigate(`/branding/templates?canva_error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }
    // No code here — backend now handles this entirely.
    // Redirect to templates page; TemplatesListPage will call loadConnectionFromBackend().
    navigate('/branding/templates?canva_connected=1', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-sm w-full text-center">
        {error ? (
          <>
            <div className="flex justify-center mb-5">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Connection Failed</h2>
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-5">
              <Loader className="w-12 h-12 text-purple-500 animate-spin" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Redirecting…</h2>
            <p className="text-gray-500 text-sm">Taking you to Templates.</p>
          </>
        )}
      </div>
    </div>
  );
}
