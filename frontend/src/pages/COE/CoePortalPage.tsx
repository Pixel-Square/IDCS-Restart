import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { CoePortalContext, fetchCoePortalContext } from '../../services/coe';

type AppUser = {
  email?: string;
};

type Props = {
  user: AppUser | null;
};

const FEATURE_LABELS: Record<keyof CoePortalContext['features'], string> = {
  exam_control: 'Exam Control',
  results: 'Result Publishing',
  circulars: 'Circular Management',
  academic_calendar: 'Academic Calendar',
};

export default function CoePortalPage({ user }: Props) {
  const [context, setContext] = useState<CoePortalContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await fetchCoePortalContext();
        if (!mounted) return;
        setContext(data);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load COE portal context.';
        setError(message);
      } finally {
        // eslint-disable-next-line no-unsafe-finally
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const enabledFeatures = useMemo(() => {
    if (!context) return [];
    return Object.entries(context.features)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key as keyof CoePortalContext['features']);
  }, [context]);

  const userEmail = String(user?.email || '').toLowerCase();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">COE Portal</h1>
        <p className="mt-2 text-sm text-gray-600">
          All modules in this portal are permission-controlled. If the database manager updates role-permission mapping, access updates automatically.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link
            to="/coe/courses"
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100"
          >
            <p className="text-sm font-semibold text-gray-900">Course List</p>
            <p className="mt-1 text-xs text-gray-600">Select courses, set QP type, and ESE mode.</p>
          </Link>
          <Link
            to="/coe/students"
            className="rounded-lg border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100"
          >
            <p className="text-sm font-semibold text-gray-900">Students List</p>
            <p className="mt-1 text-xs text-gray-600">Shows only selected courses with generated dummy and barcode.</p>
          </Link>
          <Link
            to="/coe/arrears"
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100"
          >
            <p className="text-sm font-semibold text-gray-900">Arrear List</p>
            <p className="mt-1 text-xs text-gray-600">Add arrear students manually or by Excel upload for each sem/course.</p>
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">Loading COE permissions...</div> : null}

      {!loading && error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {!loading && !error && context ? (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Access Summary</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-gray-500">Current Login</p>
                <p className="font-medium text-gray-800">{userEmail || 'unknown'}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-gray-500">COE Account</p>
                <p className="font-medium text-gray-800">{context.is_coe_login ? 'Yes' : 'No'}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-gray-500">Access Via Permission</p>
                <p className="font-medium text-gray-800">{context.access_via_permission ? 'Granted' : 'Not Granted'}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-gray-500">COE Permission Codes</p>
                <p className="font-medium text-gray-800">{context.permissions.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Feature Access</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(context.features).map(([featureKey, enabled]) => (
                <div
                  key={featureKey}
                  className={`rounded-lg border p-4 ${enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                >
                  <p className="text-sm font-medium text-gray-900">{FEATURE_LABELS[featureKey as keyof CoePortalContext['features']]}</p>
                  <p className={`mt-1 text-xs ${enabled ? 'text-green-700' : 'text-gray-500'}`}>
                    {enabled ? 'Enabled for this login' : 'Disabled for this login'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Enabled Modules</h2>
            {enabledFeatures.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No COE modules are enabled for this login.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                {enabledFeatures.map((featureKey) => (
                  <li key={featureKey} className="rounded-md bg-blue-50 px-3 py-2">
                    {FEATURE_LABELS[featureKey]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
