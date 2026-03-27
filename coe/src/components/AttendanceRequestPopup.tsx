import React, { useEffect, useState } from 'react';
import { Users, X } from 'lucide-react';

import fetchWithAuth from '../services/fetchAuth';

function formatType(type: string) {
  return type === 'DAILY' ? 'Daily Attendance' : 'Period Attendance';
}

export default function AttendanceRequestPopup() {
  const [requests, setRequests] = useState<any[]>([]);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    const fetchPendingRequests = async () => {
      try {
        const response = await fetchWithAuth('/api/academics/attendance-assignment-requests/?status=PENDING');
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

    const timer = window.setTimeout(fetchPendingRequests, 800);
    return () => window.clearTimeout(timer);
  }, []);

  if (!showPopup || requests.length === 0) return null;

  return (
    <div className="fixed right-4 top-36 z-[9999] w-80 animate-[slideInRight_0.3s_ease-out]">
      <style>{'@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }'}</style>
      <div className="overflow-hidden rounded-lg border border-blue-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-800">
              {requests.length} Attendance Request{requests.length > 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => setShowPopup(false)}
            className="rounded p-0.5 text-gray-400 transition-colors hover:bg-blue-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-60 space-y-2 overflow-y-auto p-3">
          {requests.slice(0, 3).map((req) => (
            <div key={req.id} className="rounded-md bg-gray-50 p-2.5">
              <p className="text-sm font-medium text-gray-900">{req.requested_by_name}</p>
              <p className="mt-0.5 text-xs text-gray-600">{formatType(req.assignment_type)} - {req.section_name}</p>
              <p className="mt-0.5 text-xs text-gray-500">Date: {req.date}</p>
            </div>
          ))}
          {requests.length > 3 ? (
            <p className="text-center text-xs text-gray-500">and {requests.length - 3} more...</p>
          ) : null}
        </div>

        <div className="px-3 pb-3">
          <button
            onClick={() => {
              window.location.href = '/staff/analytics';
            }}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            View & Respond to Requests
          </button>
        </div>
      </div>
    </div>
  );
}
