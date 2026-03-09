import React, { useEffect, useState } from 'react';
import { rfreaderFetchLastScan, type RFReaderLastScan } from '../../services/rfreader';

export default function RFReaderTestStudentsPage() {
  const [last, setLast] = useState<RFReaderLastScan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        setError(null);
        const data = await rfreaderFetchLastScan();
        if (mounted) setLast(data);
      } catch (e: any) {
        if (mounted) setError(String(e?.message || e));
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">RFReader · Test Students</h1>
      <p className="mt-2 text-sm text-gray-600">
        This page polls the backend every second to show the latest scan received from the USB listener.
      </p>

      <div className="mt-6 max-w-2xl rounded-lg border border-gray-200 bg-white p-4">
        {error ? (
          <div className="text-sm text-red-600">Error: {error}</div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="text-gray-500">Gate</div>
          <div className="text-gray-900">{last?.gate?.name || '—'}</div>

          <div className="text-gray-500">Scanned At</div>
          <div className="text-gray-900">{last?.scanned_at || '—'}</div>

          <div className="text-gray-500">UID</div>
          <div className="text-gray-900">{last?.uid || '—'}</div>

          <div className="text-gray-500">Roll No</div>
          <div className="text-gray-900">{last?.roll_no || '—'}</div>

          <div className="text-gray-500">Name</div>
          <div className="text-gray-900">{last?.name || '—'}</div>

          <div className="text-gray-500">IMPRES</div>
          <div className="text-gray-900">{last?.impres_code || '—'}</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        USB listener tip: close Arduino Serial Monitor while the listener is running.
      </div>
    </div>
  );
}
