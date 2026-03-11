import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import AttendanceRequests from '../staff/AttendanceRequests';

/**
 * Standalone page for HOD / IQAC to review and process pending
 * attendance unlock requests.  Accessible at /attendance-analytics/requests.
 */
export default function AttendanceAnalyticsRequestsPage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Bell className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Attendance Analytics – Requests</h1>
              <p className="text-sm text-gray-500">Review and process pending attendance unlock requests</p>
            </div>
          </div>
        </div>

        {/* Requests list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <AttendanceRequests />
        </div>
      </div>
    </DashboardLayout>
  );
}
