import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import fetchWithAuth from '../../services/fetchAuth';

type ConditionSection = { require_profile: boolean; require_phone: boolean };
type Conditions = { application: ConditionSection; marks: ConditionSection };

const DEFAULT_CONDITIONS: Conditions = {
  application: { require_profile: true, require_phone: true },
  marks: { require_profile: false, require_phone: false },
};

export default function ConditionsPage() {
  const [conditions, setConditions] = useState<Conditions>(DEFAULT_CONDITIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth('/api/accounts/app-conditions/');
        if (res.ok) {
          const j = await res.json();
          setConditions({ ...DEFAULT_CONDITIONS, ...(j.conditions || {}) });
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/accounts/app-conditions/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.detail || 'Failed to save.');
      } else {
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 2500);
      }
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const setSection = (section: keyof Conditions, key: keyof ConditionSection, val: boolean) => {
    setConditions(prev => ({ ...prev, [section]: { ...prev[section], [key]: val } }));
  };

  const ConditionRow = ({
    label, desc, checked, onChange,
  }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-4">
      <div>
        <div className="font-semibold text-gray-900">{label}</div>
        <div className="text-sm text-gray-600">{desc}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-6 h-6 accent-indigo-600 flex-shrink-0"
        disabled={saving || loading}
      />
    </div>
  );

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Application Conditions</h1>
        <p className="text-sm text-gray-500 mb-6">Control application requirements across all types.</p>

        {loading ? (
          <div className="flex justify-center items-center h-24">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Gatepass / Applications section */}
            <div>
              <h2 className="text-base font-bold text-gray-700 uppercase tracking-wide mb-3">
                Gatepass / Applications
              </h2>
              <div className="space-y-3">
                <ConditionRow
                  label="Profile Picture Upload Required"
                  desc="Applicant must upload a profile picture before applying for Gatepass."
                  checked={conditions.application.require_profile}
                  onChange={v => setSection('application', 'require_profile', v)}
                />
                <ConditionRow
                  label="Mobile Number Verification Required"
                  desc="Applicant must verify their mobile number before applying for Gatepass."
                  checked={conditions.application.require_phone}
                  onChange={v => setSection('application', 'require_phone', v)}
                />
              </div>
            </div>

            {/* My Marks section */}
            <div>
              <h2 className="text-base font-bold text-gray-700 uppercase tracking-wide mb-1">
                My Marks Access
              </h2>
              <p className="text-sm text-gray-500 mb-3">
                Students must meet these requirements before they can view their internal marks.
              </p>
              <div className="space-y-3">
                <ConditionRow
                  label="Profile Picture Required"
                  desc="Student must have a profile picture set to access their marks."
                  checked={conditions.marks.require_profile}
                  onChange={v => setSection('marks', 'require_profile', v)}
                />
                <ConditionRow
                  label="Mobile Number Verification Required"
                  desc="Student must have their mobile number verified to access their marks."
                  checked={conditions.marks.require_phone}
                  onChange={v => setSection('marks', 'require_phone', v)}
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end items-center gap-4 pt-2">
              {savedMsg && <span className="text-sm text-green-600 font-medium">Saved!</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Conditions'}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
