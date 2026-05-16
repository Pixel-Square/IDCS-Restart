/**
 * Academic 2.1 Admin Settings Page
 * Central settings page. Each setting is a standalone section.
 * Add new sections here as the system grows.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bell, Save, Settings, ShieldCheck, Tag } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

// ─── Pass Mark Section ───────────────────────────────────────────────────────

interface PassMarkSetting {
  id: string;
  out_of: number;
  pass_mark: number;
  label: string;
  updated_at: string;
}

interface AcademicNotificationSetting {
  id: string;
  key: string;
  student_publish_enabled: boolean;
  notify_on_first_publish: boolean;
  notify_on_row_edits_only: boolean;
  notify_on_every_publish_click: boolean;
  first_publish_template: string;
  edited_rows_template: string;
  every_publish_template: string;
  cqi_announce_enabled: boolean;
  cqi_announce_template: string;
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

// ─── Academic Notifications Section ─────────────────────────────────────────

type TokenDef = { key: string; label: string };

function AcademicNotificationsSection() {
  const [setting, setSetting] = useState<AcademicNotificationSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [studentEnabled, setStudentEnabled] = useState(false);
  const [firstEnabled, setFirstEnabled] = useState(true);
  const [editedEnabled, setEditedEnabled] = useState(true);
  const [everyEnabled, setEveryEnabled] = useState(false);

  const [tplFirst, setTplFirst] = useState('');
  const [tplEdited, setTplEdited] = useState('');
  const [tplEvery, setTplEvery] = useState('');

  const [cqiAnnounceEnabled, setCqiAnnounceEnabled] = useState(false);
  const [tplCqiAnnounce, setTplCqiAnnounce] = useState('');

  const [activeTpl, setActiveTpl] = useState<'first' | 'edited' | 'every' | 'cqi' | null>(null);

  const tokensCourse: TokenDef[] = useMemo(() => ([
    { key: '{course_code}', label: 'course_code' },
    { key: '{course_name}', label: 'course_name' },
    { key: '{class_name}', label: 'class_name' },
    { key: '{section}', label: 'section' },
    { key: '{exam_name}', label: 'exam_name' },
    { key: '{max_mark}', label: 'max_mark' },
    { key: '{faculty_name}', label: 'faculty_name' },
  ]), []);

  const tokensStudent: TokenDef[] = useMemo(() => ([
    { key: '{student_name}', label: 'student_name' },
    { key: '{register_number}', label: 'register_number' },
    { key: '{mark}', label: 'mark' },
  ]), []);

  const tokensCqi: TokenDef[] = useMemo(() => ([
    { key: '{co_attainments}', label: 'co_attainments' },
    { key: '{satisfied_conditions}', label: 'satisfied_conditions' },
  ]), []);

  const insertToken = (tok: string) => {
    if (!activeTpl) return;
    const apply = (prev: string) => {
      if (!prev) return tok;
      if (prev.endsWith(' ') || prev.endsWith('\n')) return prev + tok;
      return prev + ' ' + tok;
    };
    if (activeTpl === 'first') setTplFirst(apply);
    if (activeTpl === 'edited') setTplEdited(apply);
    if (activeTpl === 'every') setTplEvery(apply);
    if (activeTpl === 'cqi') setTplCqiAnnounce(apply);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/academic-notification-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AcademicNotificationSetting = await res.json();
      setSetting(data);
      setStudentEnabled(Boolean(data.student_publish_enabled));
      setFirstEnabled(Boolean(data.notify_on_first_publish));
      setEditedEnabled(Boolean(data.notify_on_row_edits_only));
      setEveryEnabled(Boolean(data.notify_on_every_publish_click));
      setTplFirst(String(data.first_publish_template || ''));
      setTplEdited(String(data.edited_rows_template || ''));
      setTplEvery(String(data.every_publish_template || ''));
      setCqiAnnounceEnabled(Boolean(data.cqi_announce_enabled));
      setTplCqiAnnounce(String(data.cqi_announce_template || ''));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/academic-notification-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_publish_enabled: studentEnabled,
          notify_on_first_publish: firstEnabled,
          notify_on_row_edits_only: editedEnabled,
          notify_on_every_publish_click: everyEnabled,
          first_publish_template: tplFirst,
          edited_rows_template: tplEdited,
          every_publish_template: tplEvery,
          cqi_announce_enabled: cqiAnnounceEnabled,
          cqi_announce_template: tplCqiAnnounce,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AcademicNotificationSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        Configure WhatsApp notification rules and message templates for Academic 2.1.
        Templates support token variables (listed at the bottom).
      </div>

      {/* Student academic notifications */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Student Academic Notifications</div>
            <div className="text-xs text-gray-500 mt-0.5">Send WhatsApp messages when faculty publishes marks for exams inside a course.</div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={studentEnabled} onChange={e => setStudentEnabled(e.target.checked)} />
            Enable
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={!studentEnabled} checked={firstEnabled} onChange={e => setFirstEnabled(e.target.checked)} />
            First time published
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={!studentEnabled} checked={editedEnabled} onChange={e => setEditedEnabled(e.target.checked)} />
            Edited rows only
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={!studentEnabled} checked={everyEnabled} onChange={e => setEveryEnabled(e.target.checked)} />
            Every publish click
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Message template — First time published</label>
              <button type="button" onClick={() => setActiveTpl('first')} className={`text-xs px-2 py-1 rounded border ${activeTpl === 'first' ? 'bg-gray-100' : 'bg-white'}`}>Insert tokens</button>
            </div>
            <textarea
              value={tplFirst}
              onFocus={() => setActiveTpl('first')}
              onChange={e => setTplFirst(e.target.value)}
              rows={4}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sample will be used if empty"
              disabled={!studentEnabled || !firstEnabled}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Message template — Edited rows only</label>
              <button type="button" onClick={() => setActiveTpl('edited')} className={`text-xs px-2 py-1 rounded border ${activeTpl === 'edited' ? 'bg-gray-100' : 'bg-white'}`}>Insert tokens</button>
            </div>
            <textarea
              value={tplEdited}
              onFocus={() => setActiveTpl('edited')}
              onChange={e => setTplEdited(e.target.value)}
              rows={4}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sample will be used if empty"
              disabled={!studentEnabled || !editedEnabled}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Message template — Every publish click</label>
              <button type="button" onClick={() => setActiveTpl('every')} className={`text-xs px-2 py-1 rounded border ${activeTpl === 'every' ? 'bg-gray-100' : 'bg-white'}`}>Insert tokens</button>
            </div>
            <textarea
              value={tplEvery}
              onFocus={() => setActiveTpl('every')}
              onChange={e => setTplEvery(e.target.value)}
              rows={4}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Sample will be used if empty"
              disabled={!studentEnabled || !everyEnabled}
            />
          </div>
        </div>
      </div>

      {/* CQI announcement */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">CQI Announcement to Students</div>
            <div className="text-xs text-gray-500 mt-0.5">If enabled, faculty can announce CQI from the CQI Entry page header.</div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cqiAnnounceEnabled} onChange={e => setCqiAnnounceEnabled(e.target.checked)} />
            Enable
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">Message template — CQI announcement</label>
            <button type="button" onClick={() => setActiveTpl('cqi')} className={`text-xs px-2 py-1 rounded border ${activeTpl === 'cqi' ? 'bg-gray-100' : 'bg-white'}`}>Insert tokens</button>
          </div>
          <textarea
            value={tplCqiAnnounce}
            onFocus={() => setActiveTpl('cqi')}
            onChange={e => setTplCqiAnnounce(e.target.value)}
            rows={5}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Sample will be used if empty"
            disabled={!cqiAnnounceEnabled}
          />
          <div className="text-xs text-gray-500 mt-1">Include condition titles by using {`{satisfied_conditions}`}. CO attainments can be included via {`{co_attainments}`}</div>
        </div>
      </div>

      {/* Token variables list (grouped at bottom) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-gray-500" />
          <div className="text-sm font-semibold text-gray-900">Token Variables</div>
        </div>
        <div className="text-xs text-gray-500">Click a token to insert into the last focused template.</div>

        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Course / Exam</div>
            <div className="flex flex-wrap gap-2">
              {tokensCourse.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Student</div>
            <div className="flex flex-wrap gap-2">
              {tokensStudent.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">CQI</div>
            <div className="flex flex-wrap gap-2">
              {tokensCqi.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">Saved successfully!</div>}

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {setting?.updated_at ? `Last saved: ${new Date(setting.updated_at).toLocaleString()}` : ''}
        </div>
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
  const [active, setActive] = useState<'pass_mark' | 'academic_notifications'>('pass_mark');

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Settings className="w-6 h-6 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">System-wide configuration for Academic 2.1</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Left sidebar */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">Main Sections</div>
          <button
            type="button"
            onClick={() => setActive('pass_mark')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'pass_mark' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Pass Mark</div>
              <div className="text-xs text-gray-500 truncate">Result analysis threshold</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActive('academic_notifications')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'academic_notifications' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Bell className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Academic Notifications</div>
              <div className="text-xs text-gray-500 truncate">WhatsApp templates and rules</div>
            </div>
          </button>
        </div>

        {/* Right content */}
        <div className="space-y-6">
          {active === 'pass_mark' && (
            <SettingsSection
              icon={<ShieldCheck className="w-5 h-5" />}
              title="Pass Mark"
              description="Configure the pass mark threshold used in result analysis PDF reports and dashboards."
            >
              <PassMarkSection />
            </SettingsSection>
          )}

          {active === 'academic_notifications' && (
            <SettingsSection
              icon={<Bell className="w-5 h-5" />}
              title="Academic Notifications"
              description="WhatsApp notification rules and message templates for student academic updates and CQI announcements."
            >
              <AcademicNotificationsSection />
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}
