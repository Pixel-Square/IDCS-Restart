import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getMe, login, logout } from '../services/auth';

function getNextPath(search: string): string {
  try {
    const params = new URLSearchParams(search || '');
    const next = String(params.get('next') || '/coe').trim();
    // Avoid open redirects by forcing internal absolute path only.
    if (!next.startsWith('/')) return '/coe';
    return next;
  } catch {
    return '/coe';
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setError('Identifier and password are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(identifier.trim(), password);
      const me = await getMe();

      // Only users with COE portal access may use this site.
      const roles: string[] = (me?.roles ?? []).map((r: string) => r.toUpperCase());
      const perms: string[] = me?.permissions ?? [];
      const email: string = (me?.email ?? '').toLowerCase();
      const hasCoeAccess =
        roles.includes('COE') ||
        perms.includes('coe.portal.access') ||
        email === 'coe@krct.ac.in';

      if (!hasCoeAccess) {
        logout();
        setError('Access denied. You do not have COE portal access.');
        return;
      }

      navigate(getNextPath(location.search), { replace: true });
    } catch (err: any) {
      const message = String(err?.response?.data?.detail || err?.message || 'Login failed.');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[#dbb6a9] bg-white/95 p-7 shadow-[0_35px_50px_-32px_rgba(111,29,52,0.6)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9b4934]">Secure Access</p>
      <h1 className="mt-2 text-2xl font-bold text-[#5c1a31]">COE Login</h1>
      <p className="mt-2 text-sm text-[#6e4d42]">Sign in to access COE modules.</p>

      <form className="mt-5 space-y-4" onSubmit={handleLogin}>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#674338]" htmlFor="coe-login-identifier">
            Email or Username
          </label>
          <input
            id="coe-login-identifier"
            type="text"
            className="w-full rounded-lg border border-[#e5c9be] bg-[#fffdfa] px-3 py-2 text-sm text-[#3b2323] focus:border-[#b2472e] focus:outline-none"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#674338]" htmlFor="coe-login-password">
            Password
          </label>
          <input
            id="coe-login-password"
            type="password"
            className="w-full rounded-lg border border-[#e5c9be] bg-[#fffdfa] px-3 py-2 text-sm text-[#3b2323] focus:border-[#b2472e] focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#6f1d34] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5a182b] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
