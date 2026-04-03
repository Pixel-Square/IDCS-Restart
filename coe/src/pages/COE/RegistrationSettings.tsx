import React, { useEffect, useState, useCallback } from 'react';
import { Settings, Link2, QrCode, ToggleLeft, ToggleRight, GripVertical, Save, RefreshCw, Copy, Check, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';
import QRCode from 'qrcode';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FieldConfig {
  field: string;
  enabled: boolean;
  required: boolean;
  label: string;
  type: string;
  options?: string[];
  order: number;
}

interface FormSettings {
  form_code: string;
  form_title: string;
  form_description: string;
  is_accepting_responses: boolean;
  field_config: FieldConfig[];
  share_url: string;
  available_fields: { field: string; label: string; type: string; options?: string[] }[];
  updated_at: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RegistrationSettings() {
  const [settings, setSettings] = useState<FormSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // ── Load settings ──────────────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academics/ext-staff-form/settings/');
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();
      setSettings(data);
      
      // Generate QR code
      if (data.share_url) {
        const qr = await QRCode.toDataURL(data.share_url, {
          width: 200,
          margin: 2,
          color: { dark: '#6f1d34', light: '#ffffff' },
        });
        setQrCodeDataUrl(qr);
      }
    } catch (e: any) {
      setError(e?.message || 'Error loading settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // ── Save settings ──────────────────────────────────────────────────────────

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth('/api/academics/ext-staff-form/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_title: settings.form_title,
          form_description: settings.form_description,
          is_accepting_responses: settings.is_accepting_responses,
          field_config: settings.field_config,
        }),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      const data = await res.json();
      setSettings(data);
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle accept responses ────────────────────────────────────────────────

  const toggleAcceptResponses = async () => {
    if (!settings) return;
    const newValue = !settings.is_accepting_responses;
    setSettings({ ...settings, is_accepting_responses: newValue });
    
    try {
      const res = await fetchWithAuth('/api/academics/ext-staff-form/settings/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_accepting_responses: newValue }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const data = await res.json();
      setSettings(data);
    } catch (e: any) {
      setError(e?.message || 'Error updating settings');
      setSettings({ ...settings, is_accepting_responses: !newValue });
    }
  };

  // ── Field handlers ─────────────────────────────────────────────────────────

  const toggleFieldEnabled = (index: number) => {
    if (!settings) return;
    const newConfig = [...settings.field_config];
    newConfig[index] = { ...newConfig[index], enabled: !newConfig[index].enabled };
    setSettings({ ...settings, field_config: newConfig });
  };

  const toggleFieldRequired = (index: number) => {
    if (!settings) return;
    const newConfig = [...settings.field_config];
    newConfig[index] = { ...newConfig[index], required: !newConfig[index].required };
    setSettings({ ...settings, field_config: newConfig });
  };

  const updateFieldLabel = (index: number, label: string) => {
    if (!settings) return;
    const newConfig = [...settings.field_config];
    newConfig[index] = { ...newConfig[index], label };
    setSettings({ ...settings, field_config: newConfig });
  };

  // ── Drag and drop ──────────────────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index || !settings) return;
    
    const newConfig = [...settings.field_config];
    const draggedItem = newConfig[draggedIndex];
    newConfig.splice(draggedIndex, 1);
    newConfig.splice(index, 0, draggedItem);
    
    // Update order values
    newConfig.forEach((item, idx) => {
      item.order = idx + 1;
    });
    
    setSettings({ ...settings, field_config: newConfig });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // ── Copy link ──────────────────────────────────────────────────────────────

  const copyLink = async () => {
    if (!settings?.share_url) return;
    try {
      await navigator.clipboard.writeText(settings.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#d9b7ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
        <div className="flex items-center justify-center py-12 text-gray-500">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading form settings...
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-2xl border border-[#d9b7ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
        <div className="text-center py-12 text-red-600">
          Failed to load form settings. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#d9b7ac] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(111,29,52,0.55)]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#5a192f] flex items-center gap-2">
            <Settings size={22} />
            Registration Form Settings
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Configure the external staff registration form like Google Forms
          </p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#6f1d34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#591729] disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-700 hover:text-red-900">×</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Settings & Fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Accept Responses Toggle */}
          <div className="bg-gradient-to-r from-[#fdf2f4] to-white border border-[#f5c6cb] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#5a192f]">Accept Responses</h3>
                <p className="text-sm text-gray-600">
                  {settings.is_accepting_responses 
                    ? 'Form is currently accepting new registrations' 
                    : 'Form is closed and not accepting registrations'}
                </p>
              </div>
              <button
                onClick={toggleAcceptResponses}
                className={`p-2 rounded-lg transition-colors ${
                  settings.is_accepting_responses 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-300 text-gray-600'
                }`}
              >
                {settings.is_accepting_responses ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
          </div>

          {/* Form Title & Description */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-bold text-gray-800 mb-4">Form Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Form Title</label>
                <input
                  type="text"
                  value={settings.form_title}
                  onChange={(e) => setSettings({ ...settings, form_title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent"
                  placeholder="External Staff Registration"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={settings.form_description}
                  onChange={(e) => setSettings({ ...settings, form_description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#6f1d34] focus:border-transparent"
                  placeholder="Enter form description or instructions..."
                />
              </div>
            </div>
          </div>

          {/* Field Configuration */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-bold text-gray-800 mb-4">Form Fields</h3>
            <p className="text-sm text-gray-500 mb-4">
              Drag to reorder • Toggle to enable/disable • Check to make required
            </p>
            
            <div className="space-y-2">
              {settings.field_config.map((field, index) => (
                <div
                  key={field.field}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    field.enabled 
                      ? 'bg-white border-gray-200' 
                      : 'bg-gray-50 border-gray-100 opacity-60'
                  } ${draggedIndex === index ? 'opacity-50' : ''}`}
                >
                  <GripVertical 
                    size={16} 
                    className="text-gray-400 cursor-grab flex-shrink-0" 
                  />
                  
                  {/* Enable/Disable Toggle */}
                  <button
                    onClick={() => toggleFieldEnabled(index)}
                    className={`p-1 rounded ${field.enabled ? 'text-green-600' : 'text-gray-400'}`}
                    title={field.enabled ? 'Click to disable' : 'Click to enable'}
                  >
                    {field.enabled ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                  
                  {/* Field Label */}
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateFieldLabel(index, e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-transparent hover:border-gray-200 rounded focus:border-[#6f1d34] focus:outline-none"
                    disabled={!field.enabled}
                  />
                  
                  {/* Field Type Badge */}
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 capitalize">
                    {field.type}
                  </span>
                  
                  {/* Required Checkbox */}
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={() => toggleFieldRequired(index)}
                      disabled={!field.enabled}
                      className="rounded border-gray-300 text-[#6f1d34] focus:ring-[#6f1d34]"
                    />
                    Required
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Share & QR Code */}
        <div className="space-y-6">
          {/* Share Link */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Link2 size={18} />
              Share Link
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={settings.share_url}
                readOnly
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600"
              />
              <button
                onClick={copyLink}
                className={`p-2 rounded-lg border ${
                  copied 
                    ? 'bg-green-50 border-green-200 text-green-600' 
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                title="Copy link"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Share this link with external staff to register
            </p>
          </div>

          {/* QR Code */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <QrCode size={18} />
              QR Code
            </h3>
            {qrCodeDataUrl && (
              <div className="flex justify-center">
                <div className="p-4 bg-white border border-gray-100 rounded-lg shadow-sm">
                  <img src={qrCodeDataUrl} alt="Registration QR Code" className="w-48 h-48" />
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3 text-center">
              Scan to open registration form
            </p>
            {qrCodeDataUrl && (
              <div className="mt-3 flex justify-center">
                <a
                  href={qrCodeDataUrl}
                  download="registration-qr-code.png"
                  className="inline-flex items-center gap-2 text-sm text-[#6f1d34] hover:underline"
                >
                  Download QR Code
                </a>
              </div>
            )}
          </div>

          {/* Form Status */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-bold text-gray-800 mb-3">Form Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Form Code:</span>
                <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{settings.form_code}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  settings.is_accepting_responses 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  {settings.is_accepting_responses ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Enabled Fields:</span>
                <span className="text-gray-800 font-medium">
                  {settings.field_config.filter(f => f.enabled).length} / {settings.field_config.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Updated:</span>
                <span className="text-gray-800">
                  {new Date(settings.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Preview Link */}
          <a
            href={settings.share_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-3 bg-[#6f1d34] text-white rounded-lg font-semibold hover:bg-[#591729] transition-colors"
          >
            Preview Form
          </a>
        </div>
      </div>
    </div>
  );
}
