import React, { useState } from 'react';
import { rfreaderCreateStudent } from '../../services/rfreader';

export default function RFReaderAddStudentsRFPage() {
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [impres, setImpres] = useState('');
  const [uid, setUid] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">RFReader · Add Students RF</h1>
      <p className="mt-2 text-sm text-gray-600">
        Add or map a student to an RF UID (for matching scans).
      </p>

      <div className="mt-6 max-w-2xl rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Roll No</label>
            <input value={roll} onChange={(e) => setRoll(e.target.value)} className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">IMPRES Code</label>
            <input value={impres} onChange={(e) => setImpres(e.target.value)} className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">RF UID</label>
            <input value={uid} onChange={(e) => setUid(e.target.value)} className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g., 539EA5BB" />
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!roll.trim() || !uid.trim() || saving}
            onClick={async () => {
              try {
                setSaving(true);
                setMsg(null);
                await rfreaderCreateStudent({
                  roll_no: roll.trim(),
                  name: (name || roll).trim(),
                  impres_code: impres.trim() || undefined,
                  rf_uid: uid.trim().toUpperCase(),
                });
                setMsg('Student saved.');
                setName('');
                setRoll('');
                setImpres('');
                setUid('');
              } catch (e: any) {
                setMsg(String(e?.message || e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {msg ? <div className="mt-3 text-sm text-gray-600">{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
