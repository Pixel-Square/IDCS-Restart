import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { Bell, Save, Plus, X, ArrowLeft } from 'lucide-react';

import { fetchNotificationTemplates, saveNotificationTemplates, type NotificationTemplate as ApiTemplate } from '../../services/notifications';
import {
  fetchApplicationTypesAdmin,
  fetchApplicationNotificationSettings,
  updateApplicationNotificationSettings,
  type AppTypeRow,
  type NotificationSettingsRow,
} from '../../services/applicationsAdmin';

type MessageTemplate = {
  id: string;
  name: string;
  template: string;
  enabled: boolean;
  expiry_minutes?: number | null;
  updated_at?: string;
};

const PLACEHOLDER_BUTTONS = [
  { label: '{otp}', value: '{otp}', description: 'Auto-generated OTP code', category: 'auth' },
  { label: '{username}', value: '{username}', description: 'User\'s username', category: 'user' },
  { label: '{email}', value: '{email}', description: 'User\'s email', category: 'user' },
  { label: '{mobile}', value: '{mobile}', description: 'Mobile number', category: 'user' },
  { label: '{name}', value: '{name}', description: 'Full name', category: 'user' },
  { label: '{expiry}', value: '{expiry}', description: 'OTP/time expiry', category: 'time' },
  { label: '{subject}', value: '{subject}', description: 'Subject/course name', category: 'academic' },
  { label: '{assessment}', value: '{assessment}', description: 'Assessment type (CIA1, CIA2, etc.)', category: 'academic' },
  { label: '{percentage}', value: '{percentage}', description: 'Percentage value', category: 'academic' },
  { label: '{time}', value: '{time}', description: 'Timestamp', category: 'time' },
  { label: '{date}', value: '{date}', description: 'Date', category: 'time' },
];

const APP_NOTIF_PLACEHOLDERS = [
  { key: '{applicant_name}', desc: 'Applicant full name' },
  { key: '{application_type}', desc: 'Application type name' },
  { key: '{application_id}', desc: 'Application ID number' },
  { key: '{current_role}', desc: 'Current pending role' },
  { key: '{next_role}', desc: 'Next approver role' },
  { key: '{actor_name}', desc: 'Approver/actor name' },
  { key: '{actor_role}', desc: 'Approver/actor role' },
  { key: '{remarks}', desc: 'Approval remarks' },
  { key: '{link}', desc: 'Application link' },
  { key: '{approver_name}', desc: 'Next approver name' },
];

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'mobile_verify',
    name: 'Mobile Number Verification OTP',
    template: 'Your OTP is {otp}. It is valid for {expiry} minutes. - IQAC',
    enabled: true,
    expiry_minutes: 5,
  },
  {
    id: 'password_reset',
    name: 'Password Reset OTP',
    template: 'Hello {username}, your password reset OTP is {otp}. Valid for {expiry} minutes. - IQAC',
    enabled: false,
    expiry_minutes: 10,
  },
  {
    id: 'login_alert',
    name: 'Login Alert Notification',
    template: 'Hello {name}, a login was detected on your account from a new device at {time}.',
    enabled: false,
  },
  {
    id: 'obe_approval',
    name: 'OBE Edit Request Approved',
    template: 'Your OBE edit request for {subject} ({assessment}) has been approved. Edit until: {expiry}',
    enabled: false,
  },
  {
    id: 'attendance_alert',
    name: 'Low Attendance Alert',
    template: 'Dear {name}, your attendance is {percentage}% in {subject}. Please improve to meet requirements.',
    enabled: false,
  },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [pageTab, setPageTab] = useState<'templates' | 'application'>('templates');
  const [templates, setTemplates] = useState<MessageTemplate[]>(DEFAULT_TEMPLATES);
  const [activeTemplate, setActiveTemplate] = useState<string | null>('mobile_verify');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Application notification state
  const [appTypes, setAppTypes] = useState<AppTypeRow[]>([]);
  const [selectedAppTypeId, setSelectedAppTypeId] = useState<number | null>(null);
  const [appNotifSettings, setAppNotifSettings] = useState<NotificationSettingsRow | null>(null);
  const [loadingAppNotif, setLoadingAppNotif] = useState(false);
  const [appNotifError, setAppNotifError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<{ key: string; label: string; value: string } | null>(null);
  const [savingNotif, setSavingNotif] = useState(false);

  const activeTemplateData = templates.find((t) => t.id === activeTemplate);

  const expiryForPreview = useMemo(() => {
    const exp = activeTemplateData?.expiry_minutes;
    if (typeof exp === 'number' && Number.isFinite(exp) && exp > 0) return String(exp);
    return '5';
  }, [activeTemplateData]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    fetchNotificationTemplates()
      .then((rows: ApiTemplate[]) => {
        if (!mounted) return;
        if (rows && rows.length) {
          const serverByCode = new Map(
            rows.map((r) => [
              r.code,
              {
                id: r.code,
                name: r.name,
                template: r.template,
                enabled: Boolean(r.enabled),
                expiry_minutes: r.expiry_minutes ?? null,
                updated_at: r.updated_at,
              } as MessageTemplate,
            ])
          );

          const mergedDefaults = DEFAULT_TEMPLATES.map((d) => serverByCode.get(d.id) || d);
          const extraServer = rows
            .filter((r) => !DEFAULT_TEMPLATES.some((d) => d.id === r.code))
            .map((r) => serverByCode.get(r.code)!)
            .filter(Boolean);

          const finalTemplates = [...mergedDefaults, ...extraServer];
          setTemplates(finalTemplates);

          const nextActive = finalTemplates.some((t) => t.id === 'mobile_verify')
            ? 'mobile_verify'
            : (finalTemplates[0]?.id || null);
          setActiveTemplate(nextActive);
        }
      })
      .catch((e: any) => {
        if (!mounted) return;
        setLoadError(String(e?.response?.data?.detail || e?.message || e || 'Failed to load templates'));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Load application types for the Application Notifications tab
  useEffect(() => {
    fetchApplicationTypesAdmin()
      .then((types) => {
        setAppTypes(types);
        if (types.length > 0) setSelectedAppTypeId(types[0].id);
      })
      .catch(() => {});
  }, []);

  // Load notification settings when selected app type changes
  useEffect(() => {
    if (!selectedAppTypeId) return;
    setLoadingAppNotif(true);
    setAppNotifError(null);
    fetchApplicationNotificationSettings(selectedAppTypeId)
      .then((s) => setAppNotifSettings(s))
      .catch((e: any) => {
        setAppNotifError(String(e?.response?.data?.detail || e?.message || 'Failed to load settings'));
        setAppNotifSettings(null);
      })
      .finally(() => setLoadingAppNotif(false));
  }, [selectedAppTypeId]);

  const toggleAppNotifSetting = async (key: string, value: boolean) => {
    if (!selectedAppTypeId || !appNotifSettings) return;
    setSavingNotif(true);
    try {
      const updated = await updateApplicationNotificationSettings(selectedAppTypeId, { [key]: value });
      setAppNotifSettings(updated);
    } catch {
      /* ignore */
    } finally {
      setSavingNotif(false);
    }
  };

  const saveAppNotifTemplate = async () => {
    if (!editingTemplate || !selectedAppTypeId) return;
    setSavingNotif(true);
    try {
      const updated = await updateApplicationNotificationSettings(selectedAppTypeId, {
        [editingTemplate.key]: editingTemplate.value,
      });
      setAppNotifSettings(updated);
      setEditingTemplate(null);
    } catch {
      /* ignore */
    } finally {
      setSavingNotif(false);
    }
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    if (!activeTemplate) return;
    
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === activeTemplate
          ? { ...t, template: t.template + ' ' + placeholder }
          : t
      )
    );
  };

  const handleTemplateChange = (id: string, newTemplate: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, template: newTemplate } : t))
    );
  };

  const handleToggleEnabled = (id: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const handleSaveTemplate = async () => {
    setSaveStatus('saving');
    try {
      await saveNotificationTemplates(
        templates.map(t => ({
          code: t.id,
          name: t.name,
          template: t.template,
          enabled: Boolean(t.enabled),
          expiry_minutes: t.expiry_minutes ?? null,
          updated_at: t.updated_at,
        }))
      );
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e: any) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2500);
      alert(String(e?.response?.data?.detail || e?.message || e || 'Failed to save'));
    }
  };

  const handleAddNewTemplate = () => {
    const newId = `template_${Date.now()}`;
    const newTemplate: MessageTemplate = {
      id: newId,
      name: 'New Message Template',
      template: 'Enter your message here...',
      enabled: false,
      expiry_minutes: null,
    };
    setTemplates((prev) => [...prev, newTemplate]);
    setActiveTemplate(newId);
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeTemplate === id) {
        setActiveTemplate(templates[0]?.id || null);
      }
    }
  };

  const handleNameChange = (id: string, newName: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: newName } : t))
    );
  };

  const handleExpiryMinutesChange = (id: string, next: string) => {
    const trimmed = String(next ?? '').trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    setTemplates(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (parsed === null) return { ...t, expiry_minutes: null };
      if (!Number.isFinite(parsed) || parsed <= 0) return t;
      return { ...t, expiry_minutes: Math.floor(parsed) };
    }));
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mr-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Settings
            </button>
            <Bell className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Notification Templates
              </h1>
              <p className="text-sm text-gray-600">
                Configure message templates for OTP, alerts, and notifications
              </p>
            </div>
          </div>
          {pageTab === 'templates' && (
            <button
              onClick={handleAddNewTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Template
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 border-b border-gray-200">
          <button
            onClick={() => setPageTab('templates')}
            className={`pb-3 px-5 text-sm font-medium border-b-2 transition-colors ${pageTab === 'templates' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Message Templates
          </button>
          <button
            onClick={() => setPageTab('application')}
            className={`pb-3 px-5 text-sm font-medium border-b-2 transition-colors ${pageTab === 'application' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Application Notifications
          </button>
        </div>

        {loadError && pageTab === 'templates' ? (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
            {loadError}
          </div>
        ) : null}

        {/* ── MESSAGE TEMPLATES TAB ── */}
        {pageTab === 'templates' && <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Template List Sidebar */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Message Templates</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => setActiveTemplate(template.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      activeTemplate === template.id
                        ? 'bg-blue-50 border-l-4 border-blue-600'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {template.name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {template.template}
                        </p>
                      </div>
                      <div className="ml-2 flex items-center gap-2">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                            template.enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {template.enabled ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Template Editor */}
          <div className="lg:col-span-8">
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-gray-600">
                Loading templates…
              </div>
            ) : activeTemplateData ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={activeTemplateData.name}
                      onChange={(e) =>
                        handleNameChange(activeTemplateData.id, e.target.value)
                      }
                      className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 -mx-2"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleEnabled(activeTemplateData.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          activeTemplateData.enabled
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {activeTemplateData.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(activeTemplateData.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete template"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* OTP Validity Time (minutes) */}
                  {activeTemplateData.template.includes('{expiry}') ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-blue-900">Validity Time</div>
                          <div className="text-xs text-blue-800">Controls {`{expiry}`} and OTP expiry minutes.</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={String(activeTemplateData.expiry_minutes ?? '')}
                            onChange={(e) => handleExpiryMinutesChange(activeTemplateData.id, e.target.value)}
                            className="w-24 px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="5"
                          />
                          <span className="text-sm text-blue-900">minutes</span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Message Template Editor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Message Template
                    </label>
                    <textarea
                      value={activeTemplateData.template}
                      onChange={(e) =>
                        handleTemplateChange(
                          activeTemplateData.id,
                          e.target.value
                        )
                      }
                      rows={6}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      placeholder="Enter your message template here..."
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      Use placeholders from the buttons below to insert dynamic values
                    </p>
                  </div>

                  {/* Placeholder Buttons by Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Insert Placeholders
                    </label>
                    <div className="space-y-4">
                      {/* User Info Placeholders */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          User Information
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {PLACEHOLDER_BUTTONS.filter(btn => btn.category === 'user').map((btn) => (
                            <button
                              key={btn.value}
                              onClick={() => handleInsertPlaceholder(btn.value)}
                              className="group relative px-3 py-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg text-sm font-medium text-gray-700 hover:text-blue-700 transition-all text-left"
                              title={btn.description}
                            >
                              <span className="font-mono">{btn.label}</span>
                              <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-10">
                                {btn.description}
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Authentication Placeholders */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          Authentication
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {PLACEHOLDER_BUTTONS.filter(btn => btn.category === 'auth').map((btn) => (
                            <button
                              key={btn.value}
                              onClick={() => handleInsertPlaceholder(btn.value)}
                              className="group relative px-3 py-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg text-sm font-medium text-gray-700 hover:text-blue-700 transition-all text-left"
                              title={btn.description}
                            >
                              <span className="font-mono">{btn.label}</span>
                              <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-10">
                                {btn.description}
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Academic Placeholders */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          Academic
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {PLACEHOLDER_BUTTONS.filter(btn => btn.category === 'academic').map((btn) => (
                            <button
                              key={btn.value}
                              onClick={() => handleInsertPlaceholder(btn.value)}
                              className="group relative px-3 py-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg text-sm font-medium text-gray-700 hover:text-blue-700 transition-all text-left"
                              title={btn.description}
                            >
                              <span className="font-mono">{btn.label}</span>
                              <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-10">
                                {btn.description}
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Time Placeholders */}
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          Date & Time
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {PLACEHOLDER_BUTTONS.filter(btn => btn.category === 'time').map((btn) => (
                            <button
                              key={btn.value}
                              onClick={() => handleInsertPlaceholder(btn.value)}
                              className="group relative px-3 py-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg text-sm font-medium text-gray-700 hover:text-blue-700 transition-all text-left"
                              title={btn.description}
                            >
                              <span className="font-mono">{btn.label}</span>
                              <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-10">
                                {btn.description}
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Preview (valid for {expiryForPreview} minutes)
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-700 font-mono whitespace-pre-wrap">
                        {activeTemplateData.template
                          .replace(/{otp}/g, '123456')
                          .replace(/{username}/g, 'john_doe')
                          .replace(/{email}/g, 'john@example.com')
                          .replace(/{mobile}/g, '+91XXXXXXXXXX')
                          .replace(/{name}/g, 'John Doe')
                          .replace(/{expiry}/g, expiryForPreview)
                          .replace(/{subject}/g, 'Mathematics')
                          .replace(/{assessment}/g, 'CIA1')
                          .replace(/{percentage}/g, '75')
                          .replace(/{time}/g, new Date().toLocaleTimeString())
                          .replace(/{date}/g, new Date().toLocaleDateString())}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      This is how your message will look with sample data
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      {saveStatus === 'saved' && (
                        <span className="text-green-600 font-medium">
                          ✓ Template saved successfully
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleSaveTemplate}
                      disabled={saveStatus === 'saving'}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      {saveStatus === 'saving' ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">
                  Select a template from the list or create a new one
                </p>
              </div>
            )}
          </div>
        </div>}

        {/* ── APPLICATION NOTIFICATIONS TAB ── */}
        {pageTab === 'application' && (
          <div className="space-y-6">
            {/* Application Type Selector */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Application Type</label>
              {appTypes.length === 0 ? (
                <span className="text-sm text-gray-400">Loading…</span>
              ) : (
                <select
                  value={selectedAppTypeId ?? ''}
                  onChange={(e) => setSelectedAppTypeId(Number(e.target.value))}
                  className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {appTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Placeholder reference */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-sm font-semibold text-blue-900 mb-2">Available Placeholders</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {APP_NOTIF_PLACEHOLDERS.map((p) => (
                  <span key={p.key} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
                    {p.key}
                    <span className="text-blue-600 font-normal">({p.desc})</span>
                  </span>
                ))}
              </div>
            </div>

            {appNotifError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{appNotifError}</div>
            )}

            {loadingAppNotif ? (
              <div className="text-sm text-gray-500 py-6 text-center">Loading notification settings…</div>
            ) : !appNotifSettings ? (
              <div className="text-sm text-gray-400 py-6 text-center">Select an application type to configure notifications.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Card 1: On Submit */}
                <div className={`rounded-xl border-2 p-5 transition-colors ${appNotifSettings.notify_on_submit ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${appNotifSettings.notify_on_submit ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                      </div>
                      <div className="font-semibold text-gray-900">On Submit</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAppNotifSetting('notify_on_submit', !appNotifSettings.notify_on_submit)}
                      disabled={savingNotif}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${appNotifSettings.notify_on_submit ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${appNotifSettings.notify_on_submit ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Send WhatsApp message to applicant when their application is submitted.</p>
                  <button
                    type="button"
                    onClick={() => setEditingTemplate({ key: 'submit_template', label: 'Submission Notification', value: appNotifSettings.submit_template })}
                    className="w-full text-sm text-indigo-600 hover:text-indigo-700 font-medium border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-50 transition-colors"
                  >
                    Edit Template
                  </button>
                </div>

                {/* Card 2: On Approve / Reject */}
                <div className={`rounded-xl border-2 p-5 transition-colors ${appNotifSettings.notify_on_status_change ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${appNotifSettings.notify_on_status_change ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <div className="font-semibold text-gray-900">On Approve / Reject</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAppNotifSetting('notify_on_status_change', !appNotifSettings.notify_on_status_change)}
                      disabled={savingNotif}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${appNotifSettings.notify_on_status_change ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${appNotifSettings.notify_on_status_change ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Send WhatsApp message to applicant when a stage is approved or rejected.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingTemplate({ key: 'approve_template', label: 'Approval Message', value: appNotifSettings.approve_template })}
                      className="flex-1 text-sm text-emerald-600 hover:text-emerald-700 font-medium border border-emerald-200 rounded-lg px-3 py-2 hover:bg-emerald-50 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTemplate({ key: 'reject_template', label: 'Rejection Message', value: appNotifSettings.reject_template })}
                      className="flex-1 text-sm text-red-600 hover:text-red-700 font-medium border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {/* Card 3: On Forward */}
                <div className={`rounded-xl border-2 p-5 transition-colors ${appNotifSettings.notify_on_forward ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${appNotifSettings.notify_on_forward ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                      </div>
                      <div className="font-semibold text-gray-900">On Forward</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAppNotifSetting('notify_on_forward', !appNotifSettings.notify_on_forward)}
                      disabled={savingNotif}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${appNotifSettings.notify_on_forward ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${appNotifSettings.notify_on_forward ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Notify next approver and applicant when application is forwarded.</p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingTemplate({ key: 'forward_approver_template', label: 'Forward — To Approver', value: appNotifSettings.forward_approver_template })}
                      className="w-full text-sm text-indigo-600 hover:text-indigo-700 font-medium border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-50 transition-colors"
                    >
                      Edit Approver Message
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTemplate({ key: 'forward_applicant_template', label: 'Forward — To Applicant', value: appNotifSettings.forward_applicant_template })}
                      className="w-full text-sm text-gray-600 hover:text-gray-700 font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors"
                    >
                      Edit Applicant Message
                    </button>
                  </div>
                </div>

                {/* Card 4: On Self Cancellation */}
                <div className={`rounded-xl border-2 p-5 transition-colors ${appNotifSettings.notify_on_cancel ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${appNotifSettings.notify_on_cancel ? 'bg-rose-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </div>
                      <div className="font-semibold text-gray-900">On Self Cancel</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAppNotifSetting('notify_on_cancel', !appNotifSettings.notify_on_cancel)}
                      disabled={savingNotif}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${appNotifSettings.notify_on_cancel ? 'bg-rose-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${appNotifSettings.notify_on_cancel ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Send WhatsApp confirmation to applicant when they cancel their own application.</p>
                  <button
                    type="button"
                    onClick={() => setEditingTemplate({ key: 'cancel_template', label: 'Cancellation Confirmation', value: appNotifSettings.cancel_template })}
                    className="w-full text-sm text-rose-600 hover:text-rose-700 font-medium border border-rose-200 rounded-lg px-3 py-2 hover:bg-rose-50 transition-colors"
                  >
                    Edit Template
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Template Edit Modal (Application Notifications) */}
        {editingTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{editingTemplate.label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Edit the WhatsApp message template</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Modal body */}
              <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
                {/* Placeholder quick-insert */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Insert Placeholder</div>
                  <div className="flex flex-wrap gap-1.5">
                    {APP_NOTIF_PLACEHOLDERS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        title={p.desc}
                        onClick={() => setEditingTemplate((prev) => prev ? { ...prev, value: prev.value + ' ' + p.key } : prev)}
                        className="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs font-mono hover:bg-blue-100 transition-colors"
                      >
                        {p.key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    rows={7}
                    value={editingTemplate.value}
                    onChange={(e) => setEditingTemplate((prev) => prev ? { ...prev, value: e.target.value } : prev)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Preview */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Preview</div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 font-mono whitespace-pre-wrap">
                    {editingTemplate.value
                      .replace(/{applicant_name}/g, 'Ramesh Kumar')
                      .replace(/{application_type}/g, 'Gate Pass')
                      .replace(/{application_id}/g, '42')
                      .replace(/{current_role}/g, 'HOD')
                      .replace(/{next_role}/g, 'Principal')
                      .replace(/{actor_name}/g, 'Dr. Sharma')
                      .replace(/{actor_role}/g, 'HOD')
                      .replace(/{remarks}/g, 'Approved with conditions')
                      .replace(/{link}/g, 'https://idcs.example.com/app/42')
                      .replace(/{approver_name}/g, 'Dr. Principal')}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAppNotifTemplate}
                  disabled={savingNotif}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {savingNotif ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
