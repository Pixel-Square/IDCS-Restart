/**
 * Academic 2.1 Admin Settings Page
 * Central settings page. Each setting is a standalone section.
 * Add new sections here as the system grows.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bell, Eye, Save, Settings, ShieldCheck, Tag, Users } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

// ─── Android-style Toggle Switch Component ──────────────────────────────────
function AndroidSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${
        checked ? 'bg-blue-500' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

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

interface MyMarksSetting {
  id: string;
  key: string;
  viewing_enabled: boolean;
  require_profile_photo: boolean;
  require_mobile_number: boolean;
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


function MyMarksSection() {
  const [setting, setSetting] = useState<MyMarksSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [viewingEnabled, setViewingEnabled] = useState(false);
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [requireMobile, setRequireMobile] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/my-marks-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MyMarksSetting = await res.json();
      setSetting(data);
      setViewingEnabled(Boolean(data.viewing_enabled));
      setRequirePhoto(Boolean(data.require_profile_photo));
      setRequireMobile(Boolean(data.require_mobile_number));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load My Marks settings');
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
      const res = await fetchWithAuth('/api/academic-v2/admin/my-marks-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewing_enabled: viewingEnabled,
          require_profile_photo: requirePhoto,
          require_mobile_number: requireMobile,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MyMarksSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save My Marks settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        Control whether students can open Academic 2.1 <strong>My Marks</strong> and whether their profile must include a photo and mobile number before access is granted.
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Viewing My Marks</div>
            <div className="text-xs text-gray-500 mt-1">Master switch for the student Academic 2.1 My Marks pages.</div>
          </div>
          <AndroidSwitch checked={viewingEnabled} onChange={setViewingEnabled} disabled={saving} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Profile photo required</div>
            <div className="text-xs text-gray-500 mt-1">Students must upload a profile photo before opening My Marks.</div>
          </div>
          <AndroidSwitch checked={requirePhoto} onChange={setRequirePhoto} disabled={saving} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Mobile number required</div>
            <div className="text-xs text-gray-500 mt-1">Students must add a mobile number before opening My Marks.</div>
          </div>
          <AndroidSwitch checked={requireMobile} onChange={setRequireMobile} disabled={saving} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {setting?.updated_at && <span>Last saved: {new Date(setting.updated_at).toLocaleString()}</span>}
      </p>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
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
    { key: '{conditions}', label: 'conditions' },
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
          <div className="flex items-center gap-2">
            <AndroidSwitch checked={studentEnabled} onChange={setStudentEnabled} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">First time published</span>
            <AndroidSwitch disabled={!studentEnabled} checked={firstEnabled} onChange={setFirstEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">Edited rows only</span>
            <AndroidSwitch disabled={!studentEnabled} checked={editedEnabled} onChange={setEditedEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">Every publish click</span>
            <AndroidSwitch disabled={!studentEnabled} checked={everyEnabled} onChange={setEveryEnabled} />
          </div>
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
          <div className="flex items-center gap-2">
            <AndroidSwitch checked={cqiAnnounceEnabled} onChange={setCqiAnnounceEnabled} />
          </div>
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

// ─── Faculty Request Section ─────────────────────────────────────────────────

interface FacultyRequestSetting {
  id: string;
  faculty_request_enabled: boolean;
  require_mobile_verification: boolean;
  require_profile_photo: boolean;
  notify_on_request_sent: boolean;
  notify_on_step_approved: boolean;
  notify_on_final_approved: boolean;
  request_sent_template: string;
  step_approved_template: string;
  final_approved_template: string;
  updated_at: string;
}

function FacultyRequestSection() {
  const [setting, setSetting] = useState<FacultyRequestSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [requestEnabled, setRequestEnabled] = useState(false);
  const [requireMobile, setRequireMobile] = useState(false);
  const [requirePhoto, setRequirePhoto] = useState(false);

  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyOnSent, setNotifyOnSent] = useState(false);
  const [notifyOnStep, setNotifyOnStep] = useState(false);
  const [notifyOnFinal, setNotifyOnFinal] = useState(false);

  const [tplSent, setTplSent] = useState('');
  const [tplStep, setTplStep] = useState('');
  const [tplFinal, setTplFinal] = useState('');

  const [activeTpl, setActiveTpl] = useState<'sent' | 'step' | 'final' | null>(null);

  const tokensRequest: { key: string; label: string }[] = useMemo(() => ([
    { key: '{faculty_name}', label: 'faculty_name' },
    { key: '{faculty_id}', label: 'faculty_id' },
    { key: '{mobile_number}', label: 'mobile_number' },
    { key: '{request_type}', label: 'request_type' },
    { key: '{request_date}', label: 'request_date' },
    { key: '{department}', label: 'department' },
  ]), []);

  const tokensApproval: { key: string; label: string }[] = useMemo(() => ([
    { key: '{step_name}', label: 'step_name' },
    { key: '{approved_by}', label: 'approved_by' },
    { key: '{approval_date}', label: 'approval_date' },
    { key: '{remarks}', label: 'remarks' },
  ]), []);

  const insertToken = (tok: string) => {
    if (!activeTpl) return;
    const apply = (prev: string) => {
      if (!prev) return tok;
      if (prev.endsWith(' ') || prev.endsWith('\n')) return prev + tok;
      return prev + ' ' + tok;
    };
    if (activeTpl === 'sent') setTplSent(apply);
    if (activeTpl === 'step') setTplStep(apply);
    if (activeTpl === 'final') setTplFinal(apply);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/faculty-request-settings/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FacultyRequestSetting = await res.json();
      setSetting(data);
      setRequestEnabled(Boolean(data.faculty_request_enabled));
      setRequireMobile(Boolean(data.require_mobile_verification));
      setRequirePhoto(Boolean(data.require_profile_photo));
      setNotifyEnabled(Boolean(data.notify_on_request_sent || data.notify_on_step_approved || data.notify_on_final_approved));
      setNotifyOnSent(Boolean(data.notify_on_request_sent));
      setNotifyOnStep(Boolean(data.notify_on_step_approved));
      setNotifyOnFinal(Boolean(data.notify_on_final_approved));
      setTplSent(String(data.request_sent_template || ''));
      setTplStep(String(data.step_approved_template || ''));
      setTplFinal(String(data.final_approved_template || ''));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load faculty request settings');
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
      const res = await fetchWithAuth('/api/academic-v2/admin/faculty-request-settings/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faculty_request_enabled: requestEnabled,
          require_mobile_verification: requireMobile,
          require_profile_photo: requirePhoto,
          notify_on_request_sent: notifyEnabled && notifyOnSent,
          notify_on_step_approved: notifyEnabled && notifyOnStep,
          notify_on_final_approved: notifyEnabled && notifyOnFinal,
          request_sent_template: tplSent,
          step_approved_template: tplStep,
          final_approved_template: tplFinal,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FacultyRequestSetting = await res.json();
      setSetting(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save faculty request settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        Configure faculty request settings, including verification requirements and WhatsApp notifications for request workflows.
      </div>

      {/* Main enable */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Faculty Request</div>
            <div className="text-xs text-gray-500 mt-0.5">Master switch — enables the faculty request feature system-wide.</div>
          </div>
          <AndroidSwitch checked={requestEnabled} onChange={setRequestEnabled} />
        </div>

        {/* Sub-settings */}
        <div className="space-y-3 pl-1">
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-gray-700 font-medium">Mobile number verification required</div>
              <div className="text-xs text-gray-500 mt-0.5">Faculty must have a verified mobile number to submit or edit a request.</div>
            </div>
            <AndroidSwitch disabled={!requestEnabled} checked={requireMobile} onChange={setRequireMobile} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-gray-700 font-medium">Profile photo required</div>
              <div className="text-xs text-gray-500 mt-0.5">Faculty must have a profile photo uploaded to submit or edit a request.</div>
            </div>
            <AndroidSwitch disabled={!requestEnabled} checked={requirePhoto} onChange={setRequirePhoto} />
          </div>
        </div>
      </div>

      {/* Notifications section */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Notifications</div>
            <div className="text-xs text-gray-500 mt-0.5">Send WhatsApp messages to faculty at key stages of the request workflow.</div>
          </div>
          <AndroidSwitch disabled={!requestEnabled} checked={notifyEnabled} onChange={setNotifyEnabled} />
        </div>

        {/* Notification toggles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-1">
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">Request sent</span>
            <AndroidSwitch disabled={!requestEnabled || !notifyEnabled} checked={notifyOnSent} onChange={setNotifyOnSent} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">Step approved</span>
            <AndroidSwitch disabled={!requestEnabled || !notifyEnabled} checked={notifyOnStep} onChange={setNotifyOnStep} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700">Final approval</span>
            <AndroidSwitch disabled={!requestEnabled || !notifyEnabled} checked={notifyOnFinal} onChange={setNotifyOnFinal} />
          </div>
        </div>

        {/* Message templates */}
        <div className="space-y-4 pl-1">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Message template — Request sent</label>
              <button type="button" onClick={() => setActiveTpl('sent')} className={`text-xs px-2 py-1 rounded border ${activeTpl === 'sent' ? 'bg-gray-100' : 'bg-white'}`}>Insert tokens</button>
            </div>
            <textarea
              value={tplSent}
              onFocus={() => setActiveTpl('sent')}
              onChange={e => setTplSent(e.target.value)}
              rows={4}
              disabled={!requestEnabled || !notifyEnabled || !notifyOnSent}
              placeholder="Sample will be used if empty"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Message template — Step approved</label>
              <button type="button" onClick={() => setActiveTpl('step')} className={`text-xs px-2 py-1 rounded border ${activeTpl === 'step' ? 'bg-gray-100' : 'bg-white'}`}>Insert tokens</button>
            </div>
            <textarea
              value={tplStep}
              onFocus={() => setActiveTpl('step')}
              onChange={e => setTplStep(e.target.value)}
              rows={4}
              disabled={!requestEnabled || !notifyEnabled || !notifyOnStep}
              placeholder="Sample will be used if empty"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Message template — Final approval</label>
              <button type="button" onClick={() => setActiveTpl('final')} className={`text-xs px-2 py-1 rounded border ${activeTpl === 'final' ? 'bg-gray-100' : 'bg-white'}`}>Insert tokens</button>
            </div>
            <textarea
              value={tplFinal}
              onFocus={() => setActiveTpl('final')}
              onChange={e => setTplFinal(e.target.value)}
              rows={4}
              disabled={!requestEnabled || !notifyEnabled || !notifyOnFinal}
              placeholder="Sample will be used if empty"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Token variables */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-gray-500" />
          <div className="text-sm font-semibold text-gray-900">Token Variables</div>
        </div>
        <div className="text-xs text-gray-500">Click a token to insert into the last focused template.</div>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Faculty / Request</div>
            <div className="flex flex-wrap gap-2">
              {tokensRequest.map(t => (
                <button key={t.key} type="button" onClick={() => insertToken(t.key)} className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Approval</div>
            <div className="flex flex-wrap gap-2">
              {tokensApproval.map(t => (
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
  const [active, setActive] = useState<'pass_mark' | 'my_marks' | 'academic_notifications' | 'faculty_request'>('pass_mark');

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
          <button
            type="button"
            onClick={() => setActive('my_marks')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'my_marks' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Eye className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">My Marks</div>
              <div className="text-xs text-gray-500 truncate">Student viewing and requirements</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActive('faculty_request')}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${active === 'faculty_request' ? 'bg-gray-50' : ''}`}
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <Users className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Faculty Request</div>
              <div className="text-xs text-gray-500 truncate">Request rules and notifications</div>
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

          {active === 'my_marks' && (
            <SettingsSection
              icon={<Eye className="w-5 h-5" />}
              title="My Marks"
              description="Control whether students can view Academic 2.1 My Marks and which profile requirements must be completed first."
            >
              <MyMarksSection />
            </SettingsSection>
          )}

          {active === 'faculty_request' && (
            <SettingsSection
              icon={<Users className="w-5 h-5" />}
              title="Faculty Request"
              description="Configure faculty request feature settings, verification requirements, and WhatsApp notifications."
            >
              <FacultyRequestSection />
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}
