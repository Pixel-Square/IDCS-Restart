/**
 * Academic 2.1 Admin Settings Page
 * Central settings page. Each setting is a standalone section.
 * Add new sections here as the system grows.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Save, Settings, ShieldCheck } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

// ─── Pass Mark Section ───────────────────────────────────────────────────────

interface PassMarkSetting {
  id: string;
  out_of: number;
  pass_mark: number;
  label: string;
  updated_at: string;
}

function PassMarkSection() {
  const [setting, setSetting]     = useState<PassMarkSetting | null>(null);
  const [outOf, setOutOf]         = useState<number>(100);
  const [passMark, setPassMark]   = useState<number>(50);
  const [label, setLabel]         = useState<string>('Default');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/pass-mark-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PassMarkSetting = await res.json();
      setSetting(data);
      setOutOf(data.out_of);
      setPassMark(data.pass_mark);
      setLabel(data.label || 'Default');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (passMark > outOf) { setError('Pass mark cannot exceed Out Of value'); return; }
    if (outOf <= 0 || passMark < 0) { setError('Invalid values'); return; }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/pass-mark-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ out_of: outOf, pass_mark: passMark, label }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PassMarkSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        The <strong>Pass Mark</strong> and <strong>Out Of</strong> values set the pass threshold used in
        Result Analysis PDF reports. Students scoring ≥ Pass Mark are counted as passed.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            maxLength={100}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Default"
          />
        </div>
        {/* Out Of */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Out Of (Total Marks)</label>
          <input
            type="number"
            value={outOf}
            min={1}
            max={1000}
            onChange={e => setOutOf(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Pass Mark */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Pass Mark</label>
          <input
            type="number"
            value={passMark}
            min={0}
            max={outOf}
            onChange={e => setPassMark(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Preview */}
      <p className="text-xs text-gray-500">
        Preview: pass mark is <strong>{passMark}/{outOf}</strong> ({outOf > 0 ? Math.round((passMark / outOf) * 100) : 0}%)
        {setting?.updated_at && <span className="ml-3 text-gray-400">· Last saved: {new Date(setting.updated_at).toLocaleString()}</span>}
      </p>

      {error   && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">Saved successfully!</div>}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Settings Section Wrapper ─────────────────────────────────────────────────

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100">
        <div className="mt-0.5 text-gray-500">{icon}</div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Settings className="w-6 h-6 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">System-wide configuration for Academic 2.1</p>
        </div>
      </div>

      {/* Pass Mark */}
      <SettingsSection
        icon={<ShieldCheck className="w-5 h-5" />}
        title="Pass Mark"
        description="Configure the pass mark threshold used in result analysis PDF reports and dashboards."
      >
        <PassMarkSection />
      </SettingsSection>

      {/* Future sections go here */}
    </div>
  );
}
