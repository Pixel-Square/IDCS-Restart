import React from 'react';

export default function PBASAdminPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">PBAS Admin</h1>
      <p className="text-sm text-gray-600 mt-1">Administrative PBAS page — visible only to PBAS_ADMIN role.</p>
      <div className="mt-4 text-sm text-gray-700">
        {/* Replace with real admin UI or lazy import of existing manager when available. */}
        PBAS administrative functions will appear here.
      </div>
    </div>
  );
}
