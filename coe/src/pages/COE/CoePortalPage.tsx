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
    <div className="mx-auto max-w-6xl space-y-6 py-2">
      <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_30px_45px_-30px_rgba(111,29,52,0.55)]">
        <h1 className="text-2xl font-bold text-[#5b1a30]">COE Portal</h1>
        <p className="mt-2 text-sm text-[#6a4a40]">
          All modules in this portal are permission-controlled. If the database manager updates role-permission mapping, access updates automatically.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link
            to="/coe/courses"
            className="rounded-xl border border-[#ead7d0] bg-[#fcf8f5] p-4 transition-colors hover:bg-[#f7eee8]"
          >
            <p className="text-sm font-semibold text-[#4f1a2c]">Course List</p>
            <p className="mt-1 text-xs text-[#755348]">Select courses, set QP type, and ESE mode.</p>
          </Link>
          <Link
            to="/coe/students"
            className="rounded-xl border border-[#d8a791] bg-[#f8ede8] p-4 transition-colors hover:bg-[#f4e3db]"
          >
            <p className="text-sm font-semibold text-[#4f1a2c]">Students List</p>
            <p className="mt-1 text-xs text-[#755348]">Shows only selected courses with generated dummy and barcode.</p>
          </Link>
          <Link
            to="/coe/arrears"
            className="rounded-xl border border-[#ebb08d] bg-[#fff4eb] p-4 transition-colors hover:bg-[#feebdc]"
          >
            <p className="text-sm font-semibold text-[#4f1a2c]">Arrear List</p>
            <p className="mt-1 text-xs text-[#755348]">Add arrear students manually or by Excel upload for each sem/course.</p>
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-[#ead7d0] bg-white p-6 text-[#7a5a50]">Loading COE permissions...</div> : null}

      {!loading && error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : null}

      {!loading && !error && context ? (
        <>
          <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-6">
            <h2 className="text-lg font-semibold text-[#5b1a30]">Access Summary</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-lg border border-[#f0e3de] bg-[#fdf9f7] p-3">
                <p className="text-[#8d6b60]">Current Login</p>
                <p className="font-medium text-[#4f1a2c]">{userEmail || 'unknown'}</p>
              </div>
              <div className="rounded-lg border border-[#f0e3de] bg-[#fdf9f7] p-3">
                <p className="text-[#8d6b60]">COE Account</p>
                <p className="font-medium text-[#4f1a2c]">{context.is_coe_login ? 'Yes' : 'No'}</p>
              </div>
              <div className="rounded-lg border border-[#f0e3de] bg-[#fdf9f7] p-3">
                <p className="text-[#8d6b60]">Access Via Permission</p>
                <p className="font-medium text-[#4f1a2c]">{context.access_via_permission ? 'Granted' : 'Not Granted'}</p>
              </div>
              <div className="rounded-lg border border-[#f0e3de] bg-[#fdf9f7] p-3">
                <p className="text-[#8d6b60]">COE Permission Codes</p>
                <p className="font-medium text-[#4f1a2c]">{context.permissions.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-6">
            <h2 className="text-lg font-semibold text-[#5b1a30]">Feature Access</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(context.features).map(([featureKey, enabled]) => (
                <div
                  key={featureKey}
                  className={`rounded-lg border p-4 ${enabled ? 'border-[#d8a791] bg-[#f9ece6]' : 'border-[#eadfdb] bg-[#faf6f4]'}`}
                >
                  <p className="text-sm font-medium text-[#4f1a2c]">{FEATURE_LABELS[featureKey as keyof CoePortalContext['features']]}</p>
                  <p className={`mt-1 text-xs ${enabled ? 'text-[#7a2038]' : 'text-[#8e6f65]'}`}>
                    {enabled ? 'Enabled for this login' : 'Disabled for this login'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-6">
            <h2 className="text-lg font-semibold text-[#5b1a30]">Enabled Modules</h2>
            {enabledFeatures.length === 0 ? (
              <p className="mt-3 text-sm text-[#7a5a50]">No COE modules are enabled for this login.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-[#5e3a33]">
                {enabledFeatures.map((featureKey) => (
                  <li key={featureKey} className="rounded-md border border-[#efccb8] bg-[#fff5ee] px-3 py-2">
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
