/**
 * Publish Control & Semester Due Date Admin Page
 * Manage semester-level publish control, due dates, and approval settings
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Lock, Unlock, CheckCircle, AlertTriangle, Shield, Save, RefreshCw, Trash2, X } from 'lucide-react';
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
  seal_animation_enabled?: boolean;
  seal_watermark_enabled?: boolean;
  seal_image?: string | null;
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

  // Reset modals state
  const [resetModal, setResetModal] = useState<{ type: 'requests' | 'marks' | null; stage: 'confirm' | 'password' | 'success' }>({ type: null, stage: 'confirm' });
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ cancelled_count?: number; reopened_count?: number; affected_count?: number } | null>(null);

  // Seal upload state
  const [sealImage, setSealImage] = useState<string | null>(null);
  const [sealImageFile, setSealImageFile] = useState<File | null>(null);

  const [localConfig, setLocalConfig] = useState({
    due_at: '',
    open_from: '',
    publish_control_enabled: false,
    auto_publish_on_due: false,
    approval_workflow: [] as string[],
    approval_window_minutes: 120,
    edit_request_validity_hours: 24,
    approval_until_publish: false,
    seal_animation_enabled: false,
    seal_watermark_enabled: false,
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
        seal_animation_enabled: Boolean((existingConfig as any).seal_animation_enabled),
        seal_watermark_enabled: Boolean((existingConfig as any).seal_watermark_enabled),
      });

      // Load persisted seal image (URL) for this semester
      const persistedSeal = (existingConfig as any).seal_image as (string | null | undefined);
      setSealImage(persistedSeal || null);
      setSealImageFile(null);
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
        seal_animation_enabled: false,
        seal_watermark_enabled: false,
      });

      setSealImage(null);
      setSealImageFile(null);
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

      const shouldUploadSeal = Boolean(sealImageFile && sealImage && String(sealImage).startsWith('data:'));
      const shouldClearSeal = Boolean(existingConfig && (existingConfig as any).seal_image && !sealImage && !sealImageFile);
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
        seal_animation_enabled: localConfig.seal_animation_enabled,
        seal_watermark_enabled: localConfig.seal_watermark_enabled,
        ...(shouldUploadSeal ? { seal_image_base64: sealImage } : {}),
        ...(shouldClearSeal ? { seal_image_base64: '' } : {}),
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

  const handleResetRequests = async () => {
    if (!selectedSemester || resetModal.stage !== 'password') return;
    
    try {
      setResetting(true);
      setResetPasswordError('');
      const config = configs.find(c => String(c.semester) === String(selectedSemester));
      if (!config) throw new Error('Config not found');

      const response = await fetchWithAuth(
        `/api/academic-v2/semester-configs/${config.id}/reset_requests/`,
        { method: 'POST', body: JSON.stringify({ password: resetPassword }) }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errorMsg = err.detail || 'Reset failed';
        if (response.status === 400 && errorMsg.includes('password')) {
          setResetPasswordError(errorMsg);
          setResetPassword('');
        } else {
          throw new Error(errorMsg);
        }
        return;
      }

      const data = await response.json();
      setResetResult(data);
      setResetModal({ type: 'requests', stage: 'success' });
      setResetPassword('');
      setTimeout(() => {
        setResetModal({ type: null, stage: 'confirm' });
        setMessage({ type: 'success', text: `${data.reopened_count} courses opened for edits` });
        setResetResult(null);
        loadData();
      }, 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to reset requests' });
      setResetModal({ type: 'requests', stage: 'password' });
    } finally {
      setResetting(false);
    }
  };

  const handleResetMarks = async () => {
    if (!selectedSemester || resetModal.stage !== 'password') return;
    
    try {
      setResetting(true);
      setResetPasswordError('');
      const config = configs.find(c => String(c.semester) === String(selectedSemester));
      if (!config) throw new Error('Config not found');

      const response = await fetchWithAuth(
        `/api/academic-v2/semester-configs/${config.id}/reset_marks/`,
        { method: 'POST', body: JSON.stringify({ password: resetPassword }) }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errorMsg = err.detail || 'Reset failed';
        if (response.status === 400 && errorMsg.includes('password')) {
          setResetPasswordError(errorMsg);
          setResetPassword('');
        } else {
          throw new Error(errorMsg);
        }
        return;
      }

      const data = await response.json();
      setResetResult(data);
      setResetModal({ type: 'marks', stage: 'success' });
      setResetPassword('');
      setTimeout(() => {
        setResetModal({ type: null, stage: 'confirm' });
        setMessage({ type: 'success', text: `Marks reset for ${data.affected_count} exam assignments` });
        setResetResult(null);
        loadData();
      }, 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to reset marks' });
      setResetModal({ type: 'marks', stage: 'password' });
    } finally {
      setResetting(false);
    }
  };

  const handleSealImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload an image file (PNG, JPG, GIF)' });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image size must be less than 2MB' });
      return;
    }

    setSealImageFile(file);
    setIsDirty(true);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setSealImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    setMessage({ type: 'success', text: 'Seal image uploaded successfully' });
  };

  const handleRemoveSealImage = () => {
    setSealImage(null);
    setSealImageFile(null);
    setIsDirty(true);
    const input = document.getElementById('seal-upload') as HTMLInputElement;
    if (input) input.value = '';
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
    <div className="p-6 w-full max-w-none space-y-6">
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

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-semibold">Office Seal Stamp</h2>
            </div>
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Upload Seal Image</label>
                  
                  {sealImage ? (
                    <div className="border-2 border-green-300 rounded-lg p-6 bg-green-50 grid grid-cols-2 gap-6 items-center">
                      {/* Left side - Controls */}
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-medium text-green-900">Seal image uploaded</p>
                          {sealImageFile ? (
                            <>
                              <p className="text-xs text-green-700 mt-1 break-words">{sealImageFile.name}</p>
                              <p className="text-xs text-green-600 mt-2">
                                Size: {sealImageFile.size / 1024 > 1024
                                  ? (sealImageFile.size / (1024 * 1024)).toFixed(2) + ' MB'
                                  : (sealImageFile.size / 1024).toFixed(2) + ' KB'}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-green-700 mt-1">Saved on server</p>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById('seal-upload') as HTMLInputElement;
                              input?.click();
                            }}
                            className="w-full px-3 py-2 rounded-lg bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200 transition-colors"
                          >
                            Upload Another Image
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveSealImage}
                            className="w-full px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-colors"
                          >
                            Remove Image
                          </button>
                        </div>
                      </div>

                      {/* Right side - Image Preview */}
                      <div className="flex justify-center">
                        <div className="w-40 h-40 flex items-center justify-center bg-white rounded-lg border-2 border-green-300 overflow-hidden shadow-md">
                          <img src={sealImage} alt="Seal preview" className="w-full h-full object-contain p-2" />
                        </div>
                      </div>

                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        id="seal-upload"
                        onChange={handleSealImageUpload}
                      />
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer bg-gray-50">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        id="seal-upload"
                        onChange={handleSealImageUpload}
                      />
                      <label htmlFor="seal-upload" className="cursor-pointer flex flex-col items-center gap-2">
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <p className="text-sm font-medium text-gray-700">Click to upload seal image</p>
                        <p className="text-xs text-gray-500">PNG, JPG, or GIF (recommended: square, transparent background)</p>
                      </label>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">Upload an official seal stamp image to display on published marks (max 2MB)</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={localConfig.seal_animation_enabled}
                      onChange={(e) => handleChange('seal_animation_enabled', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Seal Animation on Published Popup</p>
                      <p className="text-sm text-gray-600">Display animated seal stamp when marks are published (top-right corner)</p>
                      <p className="text-xs text-gray-500 mt-1">Options: Spin-Drop, Swing-Stamp, Glow-Pulse, Bounce-Press</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={localConfig.seal_watermark_enabled}
                      onChange={(e) => handleChange('seal_watermark_enabled', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Seal Watermark on Mark Entry Table</p>
                      <p className="text-sm text-gray-600">Display watermarked seal on mark entry table after marks are published (prevents editing)</p>
                      <p className="text-xs text-gray-500 mt-1">Shows subtle seal in background + read-only overlay</p>
                    </div>
                  </label>
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

          {selectedSemester && (
            <div className="bg-white rounded-lg shadow border p-6 space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Danger Zone
              </h3>
              <p className="text-sm text-gray-600">These actions affect all exam assignments in this semester. Proceed with caution.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => setResetModal({ type: 'requests', stage: 'confirm' })}
                  className="px-4 py-2.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Reset All Requests
                </button>
                <button
                  onClick={() => setResetModal({ type: 'marks', stage: 'confirm' })}
                  className="px-4 py-2.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Reset All Marks
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset Modals */}
      {resetModal.type && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          {resetModal.stage === 'confirm' && (
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-gray-900">
                    {resetModal.type === 'requests' ? 'Cancel All Edit Requests?' : 'Reset All Marks?'}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {resetModal.type === 'requests'
                      ? 'All pending edit requests for this semester will be cancelled. This action cannot be undone.'
                      : 'All marks and exam assignments will be reset to DRAFT status. All data will be cleared. This action cannot be undone.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setResetModal({ type: null, stage: 'confirm' })}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setResetModal({ type: resetModal.type, stage: 'password' })}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {resetModal.stage === 'password' && (
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Verify Your Password</h2>
                <p className="text-sm text-gray-600 mt-1">Enter your password to confirm this action.</p>
              </div>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Password"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${resetPasswordError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-red-500'}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && resetPassword.trim()) {
                    if (resetModal.type === 'requests') handleResetRequests();
                    else handleResetMarks();
                  }
                }}
              />
              {resetPasswordError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{resetPasswordError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setResetModal({ type: null, stage: 'confirm' });
                    setResetPassword('');
                  }}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (resetModal.type === 'requests') handleResetRequests();
                    else handleResetMarks();
                  }}
                  disabled={!resetPassword.trim() || resetting}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {resetting ? 'Resetting...' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          {resetModal.stage === 'success' && (
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8 text-center space-y-4 animate-in fade-in zoom-in-95">
              <style>{`
                @keyframes checkmarkDraw {
                  0% { stroke-dasharray: 52; stroke-dashoffset: 52; }
                  100% { stroke-dasharray: 52; stroke-dashoffset: 0; }
                }
                .success-checkmark { animation: checkmarkDraw 0.7s ease-out 0.3s forwards; stroke-dasharray: 52; stroke-dashoffset: 52; }
              `}</style>
              <div className="w-16 h-16 mx-auto">
                <svg viewBox="0 0 100 100" className="w-full h-full" style={{ filter: 'drop-shadow(0 4px 12px rgba(34, 197, 94, 0.25))' }}>
                  <circle cx="50" cy="50" r="48" fill="#22c55e" />
                  <polyline points="32,50 46,62 68,38" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="success-checkmark" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Success!</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {resetModal.type === 'requests' 
                    ? `${resetResult?.reopened_count || 0} courses opened for edits.`
                    : `All marks have been reset for ${resetResult?.affected_count || 0} exam assignments.`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
