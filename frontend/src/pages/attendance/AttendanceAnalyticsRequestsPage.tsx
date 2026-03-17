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
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm text-white">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">Attendance Unlock Requests</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">Review and process pending attendance unlock requests</p>
          </div>
        </div>

        {/* Requests list */}
        <div className="mt-4">
          <AttendanceRequests />
        </div>
      </div>
    </DashboardLayout>
  );
}
