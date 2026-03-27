import React, { useMemo } from 'react';

import UserQueriesPanel from '../components/UserQueriesPanel';
import { getCachedMe } from '../services/auth';

export default function QueriesPage() {
  const user = useMemo(() => getCachedMe(), []);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-xl border border-[#ead7d0] bg-white/95 p-5">
        <h1 className="text-xl font-bold text-[#5b1a30]">Raise Token</h1>
        <p className="mt-1 text-sm text-[#755348]">Track and raise your support tokens.</p>
      </div>
      <UserQueriesPanel user={user} />
    </div>
  );
}
