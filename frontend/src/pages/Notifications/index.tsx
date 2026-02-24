import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { Bell, Save, Plus, X } from 'lucide-react';

import { fetchNotificationTemplates, saveNotificationTemplates, type NotificationTemplate as ApiTemplate } from '../../services/notifications';

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
  const [templates, setTemplates] = useState<MessageTemplate[]>(DEFAULT_TEMPLATES);
  const [activeTemplate, setActiveTemplate] = useState<string | null>('mobile_verify');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
          <button
            onClick={handleAddNewTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Template
          </button>
        </div>

        {loadError ? (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
            {loadError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
        </div>
      </div>
    </DashboardLayout>
  );
}
