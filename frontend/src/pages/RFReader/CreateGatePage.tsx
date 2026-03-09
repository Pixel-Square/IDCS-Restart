import React, { useState } from 'react';
import { rfreaderCreateGate } from '../../services/rfreader';

export default function RFReaderCreateGatePage() {
  const [gateName, setGateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">RFReader · Create Gate</h1>
      <p className="mt-2 text-sm text-gray-600">
        Create a gate entry for RF reader testing.
      </p>

      <div className="mt-6 max-w-xl rounded-lg border border-gray-200 bg-white p-4">
        <label className="block text-sm font-medium text-gray-700">Gate Name</label>
        <input
          value={gateName}
          onChange={(e) => setGateName(e.target.value)}
          className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g., Main Gate"
        />
        <div className="mt-4">
          <button
            type="button"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!gateName.trim() || saving}
            onClick={async () => {
              try {
                setSaving(true);
                setMsg(null);
                await rfreaderCreateGate({ name: gateName.trim() });
                setMsg('Gate created.');
                setGateName('');
              } catch (e: any) {
                setMsg(String(e?.message || e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
          {msg ? <div className="mt-3 text-sm text-gray-600">{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
