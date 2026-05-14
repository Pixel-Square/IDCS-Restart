/**
 * BypassShareLandingPage — handles shared bypass links.
 * URL: /academic-v2/bypass-share/:token
 *
 * Flow:
 * 1. If not authenticated → save current URL to localStorage → redirect to /login
 * 2. If authenticated → validate the token → redirect to the bypass course page
 *    or show an error if token is invalid/expired.
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldAlert, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import fetchWithAuth from '../../../../services/fetchAuth';

export const POST_LOGIN_REDIRECT_KEY = 'postLoginRedirect';

function isLoggedIn(): boolean {
  try {
    return !!localStorage.getItem('access');
  } catch {
    return false;
  }
}

type State =
  | { kind: 'loading' }
  | { kind: 'redirecting_login' }
  | { kind: 'valid'; course_code: string; course_name: string; faculty: string; section: string }
  | { kind: 'error'; message: string };

export default function BypassShareLandingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', message: 'Invalid share link.' });
      return;
    }

    // If not logged in, save this URL and redirect to login
    if (!isLoggedIn()) {
      try {
        localStorage.setItem(POST_LOGIN_REDIRECT_KEY, window.location.href);
      } catch { /* ignore */ }
      setState({ kind: 'redirecting_login' });
      navigate('/login', { replace: true });
      return;
    }

    // Authenticated: validate the token
    fetchWithAuth(`/api/academic-v2/admin/bypass/share/${token}/`)
      .then(async (res) => {
        if (res.status === 404) {
          setState({ kind: 'error', message: 'This share link is invalid or no longer exists.' });
          return;
        }
        if (res.status === 410) {
          setState({ kind: 'error', message: 'This share link has expired.' });
          return;
        }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setState({ kind: 'error', message: d.detail || 'Failed to validate share link.' });
          return;
        }
        const data = await res.json();
        if (!data.valid || !data.session) {
          setState({ kind: 'error', message: 'Share link is not valid.' });
          return;
        }

        const session = data.session;
        setState({
          kind: 'valid',
          course_code: session.course_code,
          course_name: session.course_name,
          faculty: session.faculty?.name || 'Faculty',
          section: session.section_name,
        });

        // Save session info to sessionStorage so AdminBypassCoursePage can load it
        // without needing admin-level API permissions (faculty share link case).
        try {
          const info = {
            session_id: session.id,
            ta_id: session.teaching_assignment_id,
            course_code: session.course_code,
            course_name: session.course_name,
            section_name: session.section_name,
            faculty_id: session.faculty?.id || 0,
            faculty_name: session.faculty?.name || 'Faculty',
            started_at: session.started_at,
          };
          sessionStorage.setItem('active_bypass_session', JSON.stringify(info));
        } catch { /* ignore */ }

        // Short delay so user sees the confirmation, then navigate to bypass
        setTimeout(() => {
          navigate(
            `/academic-v2/admin/bypass/${session.id}/course/${session.teaching_assignment_id}`,
            { replace: true },
          );
        }, 1200);
      })
      .catch(() => {
        setState({ kind: 'error', message: 'Network error while validating link.' });
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 text-center">
        {state.kind === 'loading' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-amber-600 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Validating Bypass Link</h2>
            <p className="text-sm text-gray-500">Please wait…</p>
            <div className="mt-4 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-600" />
            </div>
          </>
        )}

        {state.kind === 'redirecting_login' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
              <Clock className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Login Required</h2>
            <p className="text-sm text-gray-500">Redirecting to login page…</p>
          </>
        )}

        {state.kind === 'valid' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Link Validated</h2>
            <p className="text-sm text-gray-500 mb-4">Entering bypass for:</p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left text-sm">
              <p className="font-bold text-amber-900">{state.course_code}</p>
              <p className="text-amber-700">{state.course_name}</p>
              <p className="text-gray-500 text-xs mt-1">{state.section} · {state.faculty}</p>
            </div>
            <p className="text-xs text-gray-400 mt-3">Redirecting…</p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link Error</h2>
            <p className="text-sm text-red-600 mb-4">{state.message}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
