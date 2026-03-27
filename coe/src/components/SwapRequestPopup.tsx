import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';

import fetchWithAuth from '../services/fetchAuth';

export default function SwapRequestPopup() {
  const [requests, setRequests] = useState<any[]>([]);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    const fetchPendingRequests = async () => {
      try {
        const response = await fetchWithAuth('/api/timetable/swap-requests/?status=PENDING');
        if (response.ok) {
          const respData = await response.json();
          const receivedRequests = (respData.received || []).filter((r: any) => r.status === 'PENDING');
          setRequests(receivedRequests);
          if (receivedRequests.length > 0) setShowPopup(true);
        }
      } catch {
        // Best-effort popup
      }
    };

    const timer = window.setTimeout(fetchPendingRequests, 500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!showPopup || requests.length === 0) return null;

  return (
    <div className="fixed right-4 top-20 z-[9999] w-80 animate-[slideInRight_0.3s_ease-out]">
      <style>{'@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }'}</style>
      <div className="overflow-hidden rounded-lg border border-orange-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-800">
              {requests.length} Pending Swap Request{requests.length > 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => setShowPopup(false)}
            className="rounded p-0.5 text-gray-400 transition-colors hover:bg-orange-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-60 space-y-2 overflow-y-auto p-3">
          {requests.slice(0, 3).map((req) => (
            <div key={req.id} className="rounded-md bg-gray-50 p-2.5">
              <p className="text-sm font-medium text-gray-900">{req.requested_by_name}</p>
              <p className="mt-0.5 text-xs text-gray-600">{req.from_period_label} ↔ {req.to_period_label}</p>
            </div>
          ))}
          {requests.length > 3 ? (
            <p className="text-center text-xs text-gray-500">and {requests.length - 3} more...</p>
          ) : null}
        </div>

        <div className="px-3 pb-3">
          <button
            onClick={() => {
              window.location.href = '/staff/timetable';
            }}
            className="w-full rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
          >
            View All Requests
          </button>
        </div>
      </div>
    </div>
  );
}
