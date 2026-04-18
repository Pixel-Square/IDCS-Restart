/**
 * Publish Control & Semester Due Date Admin Page
 * Manage semester-level publish control, due dates, and approval settings
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Lock, Unlock, CheckCircle, AlertTriangle, Shield, Save, RefreshCw } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface Semester {
  id: string | number;
  name: string;
  year: number;
  term: number;
  status: string;
}

interface SemesterConfig {
  id: string;
  semester: string | number;
  semester_name: string;
  due_at: string | null;
  open_from: string | null;
  publish_control_enabled: boolean;
  auto_publish_on_due: boolean;
  approval_workflow: string[];
  approval_window_minutes: number;
  edit_request_validity_hours?: number;
  approval_until_publish?: boolean;
  is_open: boolean;
  time_remaining_seconds: number | null;
  updated_at: string;
}

export default function PublishControlPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [configs, setConfigs] = useState<SemesterConfig[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [localConfig, setLocalConfig] = useState({
    due_at: '',
    open_from: '',
    publish_control_enabled: false,
    auto_publish_on_due: false,
    approval_workflow: [] as string[],
    approval_window_minutes: 120,
    edit_request_validity_hours: 24,
    approval_until_publish: false,
  });

  const AVAILABLE_WORKFLOW_ROLES = ['HOD', 'IQAC', 'ADMIN'] as const;

  const normalizeWorkflow = (wf: any): string[] => {
    const raw = Array.isArray(wf) ? wf : [];
    const out: string[] = [];
    for (const item of raw) {
      const role = typeof item === 'string' ? item : (item && typeof item === 'object' ? item.role : null);
      const roleU = String(role || '').trim().toUpperCase();
      if (!roleU) continue;
      if (!out.includes(roleU)) out.push(roleU);
    }
    // keep canonical order when both present
    if (out.includes('HOD') && out.includes('IQAC')) {
      return ['HOD', 'IQAC', ...out.filter(r => r !== 'HOD' && r !== 'IQAC')];
    }
    return out;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [semRes, configRes] = await Promise.all([
        fetchWithAuth('/api/academics/semesters/').then(r => r.ok ? r.json() : []),
        fetchWithAuth('/api/academic-v2/semester-configs/').then(r => r.ok ? r.json() : []),
      ]);
      const semArray = Array.isArray(semRes) ? semRes : (semRes?.results || []);
      const configArray = Array.isArray(configRes) ? configRes : (configRes?.results || []);
      setSemesters(semArray);
      setConfigs(configArray);

      // Preserve user selection on refresh. Only auto-select current when nothing selected.
      if (!selectedSemester) {
        const current = semArray.find((s: Semester) => s.status === 'CURRENT');
        if (current) setSelectedSemester(String(current.id));
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedSemester) return;

    const existingConfig = configs.find(c => String(c.semester) === String(selectedSemester));
    if (existingConfig) {
      setLocalConfig({
        due_at: existingConfig.due_at ? existingConfig.due_at.slice(0, 16) : '',
        open_from: existingConfig.open_from ? existingConfig.open_from.slice(0, 16) : '',
        publish_control_enabled: existingConfig.publish_control_enabled,
        auto_publish_on_due: existingConfig.auto_publish_on_due,
        approval_workflow: normalizeWorkflow(existingConfig.approval_workflow),
        approval_window_minutes: existingConfig.approval_window_minutes || 120,
        edit_request_validity_hours: typeof existingConfig.edit_request_validity_hours === 'number' ? existingConfig.edit_request_validity_hours : 24,
        approval_until_publish: Boolean(existingConfig.approval_until_publish),
      });
      setIsDirty(false);
    } else {
      setLocalConfig({
        due_at: '',
        open_from: '',
        publish_control_enabled: false,
        auto_publish_on_due: false,
        approval_workflow: [],
        approval_window_minutes: 120,
        edit_request_validity_hours: 24,
        approval_until_publish: false,
      });
      setIsDirty(true);
    }
  }, [selectedSemester, configs]);

  const handleChange = (field: string, value: unknown) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const setWorkflow = (wf: string[]) => {
    setLocalConfig(prev => ({ ...prev, approval_workflow: normalizeWorkflow(wf) }));
    setIsDirty(true);
  };

  const addWorkflowRole = () => {
    setLocalConfig(prev => {
      const current = normalizeWorkflow(prev.approval_workflow);
      const next = AVAILABLE_WORKFLOW_ROLES.find(r => !current.includes(r)) || AVAILABLE_WORKFLOW_ROLES[0];
      return { ...prev, approval_workflow: normalizeWorkflow([...current, next]) };
    });
    setIsDirty(true);
  };

  const updateWorkflowRoleAt = (index: number, role: string) => {
    setLocalConfig(prev => {
      const current = normalizeWorkflow(prev.approval_workflow);
      const next = [...current];
      next[index] = String(role || '').toUpperCase();
      return { ...prev, approval_workflow: normalizeWorkflow(next) };
    });
    setIsDirty(true);
  };

  const removeWorkflowRoleAt = (index: number) => {
    setLocalConfig(prev => {
      const current = normalizeWorkflow(prev.approval_workflow);
      const next = current.filter((_, i) => i !== index);
      return { ...prev, approval_workflow: normalizeWorkflow(next) };
    });
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!selectedSemester) return;

    try {
      setSaving(true);
      setMessage(null);

      const existingConfig = configs.find(c => String(c.semester) === String(selectedSemester));
      const payload = {
        semester: selectedSemester,
        due_at: localConfig.due_at ? new Date(localConfig.due_at).toISOString() : null,
        open_from: localConfig.open_from ? new Date(localConfig.open_from).toISOString() : null,
        publish_control_enabled: localConfig.publish_control_enabled,
        auto_publish_on_due: localConfig.auto_publish_on_due,
        approval_workflow: localConfig.approval_workflow,
        approval_window_minutes: localConfig.approval_window_minutes,
        edit_request_validity_hours: localConfig.edit_request_validity_hours,
        approval_until_publish: localConfig.approval_until_publish,
      };

      const url = existingConfig
        ? `/api/academic-v2/semester-configs/${existingConfig.id}/`
        : '/api/academic-v2/semester-configs/';
      const method = existingConfig ? 'PUT' : 'POST';

      const response = await fetchWithAuth(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err) || 'Save failed');
      }

      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setIsDirty(false);
      await loadData();
    } catch (error: any) {
      console.error('Save failed:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const getDueDateStatus = () => {
    if (!localConfig.due_at) return null;
    const due = new Date(localConfig.due_at);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return { label: `${Math.abs(days)} days past`, color: 'text-red-600 bg-red-50', icon: AlertTriangle };
    if (days === 0) return { label: 'Due Today', color: 'text-orange-600 bg-orange-50', icon: Clock };
    if (days <= 7) return { label: `${days} days left`, color: 'text-yellow-600 bg-yellow-50', icon: Clock };
    return { label: `${days} days left`, color: 'text-green-600 bg-green-50', icon: Clock };
  };

  const dueDateStatus = getDueDateStatus();

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const selectedSemObj = semesters.find(s => String(s.id) === String(selectedSemester));
  const selectedTitle = selectedSemObj
    ? `${selectedSemObj.name} ${selectedSemObj.status === 'CURRENT' ? '(Current)' : ''}`
    : 'Select a semester';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Publish Control Settings</h1>
          <p className="text-gray-500 mt-1">Configure semester-level due dates and publish control options</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left sidebar: semester selection */}
        <div className="md:col-span-4 bg-white rounded-lg shadow border overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold">Semesters</h2>
          </div>
          <div className="p-3">
            <div className="space-y-2">
              {semesters.length === 0 ? (
                <div className="p-6 text-center text-gray-400">No semesters found</div>
              ) : semesters.map((sem) => {
                const active = String(sem.id) === String(selectedSemester);
                return (
                  <button
                    key={String(sem.id)}
                    onClick={() => setSelectedSemester(String(sem.id))}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">
                        {sem.name}
                      </div>
                      {sem.status === 'CURRENT' && (
                        <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Current</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Year {sem.year} · Term {sem.term}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right panel: selected config */}
        <div className="md:col-span-8 space-y-6">
          <div className="bg-white rounded-lg shadow border p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedTitle}</h2>
                <p className="text-sm text-gray-500">Semester configuration</p>
              </div>
              <button
                onClick={handleSave}
                disabled={!isDirty || !selectedSemester || saving}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                  isDirty && selectedSemester && !saving
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {selectedSemester ? (
            <>
            <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold">Schedule</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Open From</label>
                <input
                  type="datetime-local"
                  value={localConfig.open_from}
                  onChange={(e) => handleChange('open_from', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">When faculty can start entering marks</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <div className="flex items-center gap-3">
                  <input
                    type="datetime-local"
                    value={localConfig.due_at}
                    onChange={(e) => handleChange('due_at', e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  {dueDateStatus && (
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${dueDateStatus.color}`}>
                      <dueDateStatus.icon className="w-4 h-4" />
                      {dueDateStatus.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Deadline for mark entry</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              {localConfig.publish_control_enabled ? <Lock className="w-5 h-5 text-green-600" /> : <Unlock className="w-5 h-5 text-gray-400" />}
              <h2 className="text-lg font-semibold">Publish Control</h2>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Enable Publish Control</p>
                  <p className="text-sm text-gray-500">Lock tables after faculty clicks "Publish"</p>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.publish_control_enabled}
                  onChange={(e) => handleChange('publish_control_enabled', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>
              {localConfig.publish_control_enabled && (
                <label className="flex items-center justify-between cursor-pointer border-t pt-4">
                  <div>
                    <p className="font-medium">Auto-Publish on Due Date</p>
                    <p className="text-sm text-gray-500">Automatically publish drafts when due date passes</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localConfig.auto_publish_on_due}
                    onChange={(e) => handleChange('auto_publish_on_due', e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold">Edit Request Approval</h2>
            </div>
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <p className="text-sm font-semibold text-gray-800">Timers</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Request Validity (hours)</label>
                    <input
                      type="number"
                      min="0"
                      value={localConfig.edit_request_validity_hours}
                      onChange={(e) => handleChange('edit_request_validity_hours', parseInt(e.target.value) || 0)}
                      className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Pending request expires after this time (0 = never expires)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">After Approval</label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={localConfig.approval_until_publish}
                        onChange={(e) => handleChange('approval_until_publish', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      Keep table editable until faculty clicks Publish again
                    </label>
                    <p className="text-xs text-gray-500 mt-1">If disabled, the edit window uses the time below.</p>
                  </div>
                </div>

                {!localConfig.approval_until_publish && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Write Mode Window (hours)</label>
                    <input
                      type="number"
                      min="0"
                      value={Math.max(0, Math.round((localConfig.approval_window_minutes || 0) / 60))}
                      onChange={(e) => {
                        const h = parseInt(e.target.value) || 0;
                        handleChange('approval_window_minutes', h * 60);
                      }}
                      className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">How long the table stays editable after approval</p>
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Approval workflow</p>
                    <p className="text-xs text-gray-500 mt-0.5">Faculty is always the starter. The last selected role is the final approver.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addWorkflowRole}
                    className="px-3 py-1.5 rounded-lg bg-white border text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Add role
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-gray-700 flex flex-wrap items-center gap-2">
                    <span className="px-2 py-1 bg-white border rounded font-medium">Faculty Request</span>
                    <span className="text-gray-400">→</span>
                    {localConfig.approval_workflow.map((role, idx) => (
                      <React.Fragment key={`${role}-${idx}`}>
                        <span className="inline-flex items-center gap-2">
                          <select
                            value={String(role || '').toUpperCase()}
                            onChange={(e) => updateWorkflowRoleAt(idx, e.target.value)}
                            className="px-2 py-1 bg-white border rounded text-sm focus:ring-2 focus:ring-blue-500"
                          >
                            {AVAILABLE_WORKFLOW_ROLES.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeWorkflowRoleAt(idx)}
                            className="px-2 py-1 rounded border text-xs text-gray-600 hover:bg-gray-100"
                            title="Remove role"
                          >
                            Remove
                          </button>
                        </span>
                        <span className="text-gray-400">→</span>
                      </React.Fragment>
                    ))}
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded border border-green-200 font-medium">
                      <CheckCircle className="w-3 h-3" />
                      Approved
                    </span>
                  </div>

                  <div className="text-xs text-gray-500">
                    Tip: leave this empty for no-approval flow (faculty request goes directly to Approved).
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setWorkflow([])}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    Clear workflow
                  </button>
                </div>
              </div>
            </div>
          </div>
            </>
          ) : (
            <div className="bg-white rounded-lg shadow border-dashed border-2 p-12 text-center">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Select a semester from the left</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
