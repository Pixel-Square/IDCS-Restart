import React from 'react';
import useDashboard from '../hooks/useDashboard';

export default function DashboardEntryPoints({ baseUrl = '' }: { baseUrl?: string }) {
  const { data, loading, error, refresh } = useDashboard(baseUrl);

  if (loading) return <div>Loading dashboard…</div>;
  if (error)
    return (
      <div>
        <div>Error loading dashboard: {String(error)}</div>
        <button onClick={refresh}>Retry</button>
      </div>
    );
  if (!data) return <div>No dashboard data</div>;

  const entry = data.entry_points || {};
  const flags = data.flags || {};

  return (
    <div>
      <h3>Entry Points</h3>
      <ul>
        {Object.entries(entry).map(([k, v]) => (
          <li key={k}>
            <strong>{k}</strong>: {String(v)}
          </li>
        ))}
      </ul>

      <h4>Flags</h4>
      <ul>
        {Object.entries(flags).map(([k, v]) => (
          <li key={k}>{k}: {String(v)}</li>
        ))}
      </ul>
    </div>
  );
}
