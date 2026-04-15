import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';

export default function ConditionsPage() {
  const [profilePicRequired, setProfilePicRequired] = useState(true);
  const [mobileVerifiedRequired, setMobileVerifiedRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // TODO: Fetch from backend
    setLoading(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    // TODO: Save to backend
    setTimeout(() => setSaving(false), 800);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Application Conditions</h1>
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">Profile Picture Upload Required</div>
              <div className="text-sm text-gray-600">Applicant must upload a profile picture before applying for Gatepass.</div>
            </div>
            <input
              type="checkbox"
              checked={profilePicRequired}
              onChange={e => setProfilePicRequired(e.target.checked)}
              className="w-6 h-6 accent-indigo-600"
              disabled={saving}
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">Mobile Number Verification Required</div>
              <div className="text-sm text-gray-600">Applicant must verify their mobile number before applying for Gatepass.</div>
            </div>
            <input
              type="checkbox"
              checked={mobileVerifiedRequired}
              onChange={e => setMobileVerifiedRequired(e.target.checked)}
              className="w-6 h-6 accent-indigo-600"
              disabled={saving}
            />
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Conditions'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
