import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, MessageCircle, Bell, ArrowRight } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';

export default function SettingsPage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 lg:px-8 pb-6 space-y-6">
        <div className="bg-white rounded-xl p-6 shadow-md">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Settings className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-600 mt-1">IQAC configuration for system integrations.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* WhatsApp Sender Number */}
          <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-500 mb-1">WhatsApp Sender Number</div>
                <div className="text-gray-900 font-medium">Configure message sending number via QR pairing</div>
                <p className="text-sm text-gray-600 mt-2">
                  Pair the WhatsApp gateway and confirm which number is used to send OTP and notifications.
                </p>
                <button
                  onClick={() => navigate('/settings/whatsapp-sender')}
                  className="mt-4 inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 transition-colors"
                >
                  Open
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Notification Templates */}
          <div className="bg-white rounded-lg p-5 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-500 mb-1">Notification Templates</div>
                <div className="text-gray-900 font-medium">Manage OTP and alert message templates</div>
                <p className="text-sm text-gray-600 mt-2">
                  Configure message templates for OTP, login alerts, attendance alerts, and other system notifications.
                </p>
                <button
                  onClick={() => navigate('/settings/notification-templates')}
                  className="mt-4 inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 transition-colors"
                >
                  Open
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
