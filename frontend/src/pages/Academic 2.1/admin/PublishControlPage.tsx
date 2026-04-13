/**
 * Publish Control & Semester Due Date Admin Page
 * Manage semester-level publish control, due dates, and approval settings
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Lock, Unlock, CheckCircle, AlertTriangle, Shield, Save, RefreshCw } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

interface Semester {
  id: string;
  name: string;
  year: number;
  term: number;
  status: string;
}

interface SemesterConfig {
  id: string;
  semester: string;
  semester_name: string;
  due_at: string | null;
  open_from: string | null;
  publish_control_enabled: boolean;
  auto_publish_on_due: boolean;
  approval_workflow: string[];
  approval_window_minutes: number;
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
  });

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

      const current = semArray.find((s: Semester) => s.status === 'CURRENT');
      if (current) setSelectedSemester(current.id);
    } catch (error) {
      console.error('Failed to load data:', error);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedSemester) return;

    const existingConfig = configs.find(c => c.semester === selectedSemester);
    if (existingConfig) {
      setLocalConfig({
        due_at: existingConfig.due_at ? existingConfig.due_at.slice(0, 16) : '',
        open_from: existingConfig.open_from ? existingConfig.open_from.slice(0, 16) : '',
        publish_control_enabled: existingConfig.publish_control_enabled,
        auto_publish_on_due: existingConfig.auto_publish_on_due,
        approval_workflow: existingConfig.approval_workflow || [],
        approval_window_minutes: existingConfig.approval_window_minutes || 120,
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
      });
      setIsDirty(true);
    }
  }, [selectedSemester, configs]);

  const handleChange = (field: string, value: unknown) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const toggleWorkflowStep = (step: string) => {
    setLocalConfig(prev => {
      const wf = prev.approval_workflow.includes(step)
        ? prev.approval_workflow.filter(s => s !== step)
        : [...prev.approval_workflow, step];
      return { ...prev, approval_workflow: wf };
    });
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!selectedSemester) return;

    try {
      setSaving(true);
      setMessage(null);

      const existingConfig = configs.find(c => c.semester === selectedSemester);
      const payload = {
        semester: selectedSemester,
        due_at: localConfig.due_at ? new Date(localConfig.due_at).toISOString() : null,
        open_from: localConfig.open_from ? new Date(localConfig.open_from).toISOString() : null,
        publish_control_enabled: localConfig.publish_control_enabled,
        auto_publish_on_due: localConfig.auto_publish_on_due,
        approval_workflow: localConfig.approval_workflow,
        approval_window_minutes: localConfig.approval_window_minutes,
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
      loadData();
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Publish Control Settings</h1>
          <p className="text-gray-500 mt-1">Configure semester-level due dates and publish control options</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
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

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">Select Semester</h2>
        </div>
        <select
          value={selectedSemester}
          onChange={(e) => setSelectedSemester(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a semester...</option>
          {semesters.map(sem => (
            <option key={sem.id} value={sem.id}>
              {sem.name} {sem.status === 'CURRENT' ? '(Current)' : ''}
            </option>
          ))}
        </select>
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
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Require HOD Approval</p>
                  <p className="text-sm text-gray-500">HOD must approve before faculty can edit</p>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.approval_workflow.includes('HOD')}
                  onChange={() => toggleWorkflowStep('HOD')}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Require IQAC Approval</p>
                  <p className="text-sm text-gray-500">IQAC must also approve (after HOD if both enabled)</p>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.approval_workflow.includes('IQAC')}
                  onChange={() => toggleWorkflowStep('IQAC')}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Approval Window (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  value={localConfig.approval_window_minutes}
                  onChange={(e) => handleChange('approval_window_minutes', parseInt(e.target.value) || 0)}
                  className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Time allowed for approved edits</p>
              </div>
              <div className="border rounded-lg p-4 bg-gray-50">
                <p className="text-sm font-medium mb-2">Approval Flow:</p>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="px-2 py-1 bg-white border rounded">Faculty Request</span>
                  <span>→</span>
                  {localConfig.approval_workflow.includes('HOD') && (
                    <>
                      <span className="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded">HOD Review</span>
                      <span>→</span>
                    </>
                  )}
                  {localConfig.approval_workflow.includes('IQAC') && (
                    <>
                      <span className="px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded">IQAC Review</span>
                      <span>→</span>
                    </>
                  )}
                  <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded">
                    <CheckCircle className="w-3 h-3" />
                    Approved
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow border-dashed border-2 p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Select a semester to configure settings</p>
        </div>
      )}
    </div>
  );
}
