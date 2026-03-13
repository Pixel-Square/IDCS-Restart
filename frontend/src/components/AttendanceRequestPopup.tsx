import React, { useEffect, useState } from 'react';
import { X, Users } from 'lucide-react';
import fetchWithAuth from '../services/fetchAuth';
import AttendanceAssignmentRequestsModal from './AttendanceAssignmentRequestsModal';

export default function AttendanceRequestPopup() {
  const [requests, setRequests] = useState<any[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fetchPendingRequests = async () => {
    try {
      const response = await fetchWithAuth('/api/academics/attendance-assignment-requests/?status=PENDING');
      if (response.ok) {
        const respData = await response.json();
        const receivedRequests = (respData.received || []).filter(
          (r: any) => r.status === 'PENDING'
        );
        setRequests(receivedRequests);
        if (receivedRequests.length > 0) {
          setShowPopup(true);
        }
      }
    } catch (error) {
      console.error('Error fetching attendance requests:', error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchPendingRequests, 800);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => setShowPopup(false);

  const handleViewRequests = () => {
    setShowPopup(false);
    setShowModal(true);
  };

  const handleRequestUpdated = () => {
    fetchPendingRequests();
  };

  const formatType = (type: string) =>
    type === 'DAILY' ? 'Daily Attendance' : 'Period Attendance';

  return (
    <>
      {showPopup && requests.length > 0 && (
        <div
          className="fixed top-36 right-4 w-80"
          style={{ zIndex: 9999, animation: 'slideInRight 0.3s ease-out' }}
        >
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
          <div className="bg-white rounded-lg shadow-2xl border border-blue-200 overflow-hidden">
            {/* Header */}
            <div className="bg-blue-50 px-4 py-3 flex items-center justify-between border-b border-blue-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">
                  {requests.length} Attendance Request{requests.length > 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={handleDismiss}
                className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded hover:bg-blue-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
              {requests.slice(0, 3).map((req) => (
                <div key={req.id} className="bg-gray-50 rounded-md p-2.5">
                  <p className="text-sm font-medium text-gray-900">{req.requested_by_name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {formatType(req.assignment_type)} — {req.section_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Date: {req.date}</p>
                </div>
              ))}
              {requests.length > 3 && (
                <p className="text-xs text-gray-500 text-center">
                  and {requests.length - 3} more...
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-3 pb-3">
              <button
                onClick={handleViewRequests}
                className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                View &amp; Respond to Requests
              </button>
            </div>
          </div>
        </div>
      )}

      <AttendanceAssignmentRequestsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onRequestUpdated={handleRequestUpdated}
      />
    </>
  );
}
