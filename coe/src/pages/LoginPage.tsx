import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getMe, login } from '../services/auth';

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
      await getMe();
      navigate(getNextPath(location.search), { replace: true });
    } catch (err: any) {
      const message = String(err?.response?.data?.detail || err?.message || 'Login failed.');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-900">COE Login</h1>
      <p className="mt-2 text-sm text-gray-600">Sign in to access COE modules.</p>

      <form className="mt-5 space-y-4" onSubmit={handleLogin}>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="coe-login-identifier">
            Email or Username
          </label>
          <input
            id="coe-login-identifier"
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="coe-login-password">
            Password
          </label>
          <input
            id="coe-login-password"
            type="password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
