import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import {
  ArrowLeft,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  AlertCircle,
  Save,
  RotateCcw,
  MapPin,
  Phone,
  Bus,
  Loader2,
  CheckSquare,
  Sparkles
} from 'lucide-react';

interface FieldMeta {
  key: string;
  label: string;
  group: string;
  description: string;
}

interface CompletionConfigResponse {
  is_overall_compulsory: boolean;
  fields_config: Record<string, boolean>;
  fields_metadata: FieldMeta[];
  updated_at?: string;
}

export default function StudentCompletionPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isOverallCompulsory, setIsOverallCompulsory] = useState(true);
  const [fieldsConfig, setFieldsConfig] = useState<Record<string, boolean>>({});
  const [fieldsMetadata, setFieldsMetadata] = useState<FieldMeta[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/academics/student-profile/completion-config/');
      if (!res.ok) {
        throw new Error('Failed to load profile completion settings');
      }
      const data: CompletionConfigResponse = await res.json();
      setIsOverallCompulsory(Boolean(data.is_overall_compulsory));
      setFieldsConfig(data.fields_config || {});
      setFieldsMetadata(data.fields_metadata || []);
      setUpdatedAt(data.updated_at || null);
    } catch (err: any) {
      setError(err?.message || 'Error fetching completion configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleToggleField = (key: string) => {
    setFieldsConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setSuccessMsg(null);
  };

  const handleToggleOverall = () => {
    setIsOverallCompulsory((prev) => !prev);
    setSuccessMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetchWithAuth('/api/academics/student-profile/completion-config/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_overall_compulsory: isOverallCompulsory,
          fields_config: fieldsConfig,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || 'Failed to save completion settings');
      }
      const data = await res.json();
      setIsOverallCompulsory(Boolean(data.is_overall_compulsory));
      setFieldsConfig(data.fields_config || {});
      setUpdatedAt(data.updated_at || new Date().toISOString());
      setSuccessMsg('Student profile completion settings saved successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    const defaults: Record<string, boolean> = {
      address_line1: true,
      address_line2: true,
      address_line3: false,
      district: true,
      pincode: true,
      father_mobile: true,
      mother_mobile: true,
      mode_of_transportation: true,
    };
    setIsOverallCompulsory(true);
    setFieldsConfig(defaults);
    setSuccessMsg('Reset to default completion rules (unsaved). Click "Save Changes" to apply.');
  };

  // Group fields by their group attribute
  const groupedFields = fieldsMetadata.reduce((acc, field) => {
    const grp = field.group || 'General Details';
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(field);
    return acc;
  }, {} as Record<string, FieldMeta[]>);

  const totalFields = fieldsMetadata.length;
  const compulsoryCount = Object.values(fieldsConfig).filter(Boolean).length;
  const optionalCount = totalFields - compulsoryCount;

  const getGroupIcon = (groupName: string) => {
    if (groupName.toLowerCase().includes('address')) return <MapPin className="w-5 h-5 text-indigo-600" />;
    if (groupName.toLowerCase().includes('parent') || groupName.toLowerCase().includes('contact')) return <Phone className="w-5 h-5 text-blue-600" />;
    if (groupName.toLowerCase().includes('transport')) return <Bus className="w-5 h-5 text-emerald-600" />;
    return <Sliders className="w-5 h-5 text-purple-600" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-slate-600 text-sm font-medium">Loading profile completion settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-slate-900">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header with Navigation */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/staff/students')}
                className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-200"
                title="Back to Students"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                    IQAC Module
                  </span>
                  <span className="text-xs text-slate-400">
                    {updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : ''}
                  </span>
                </div>
                <h1 className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
                  <CheckSquare className="w-6 h-6 text-indigo-600" />
                  Student Profile Completion Settings
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Configure overall compulsory status and toggle compulsory requirements for individual student profile fields.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3.5 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors flex items-center gap-1.5"
                title="Reset to recommended defaults"
              >
                <RotateCcw className="w-4 h-4 text-slate-500" />
                <span>Reset Defaults</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Settings</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800 font-medium">{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-800 font-medium">{successMsg}</div>
          </div>
        )}

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isOverallCompulsory ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Requirement</div>
              <div className={`text-xl font-black ${isOverallCompulsory ? 'text-indigo-700' : 'text-slate-600'}`}>
                {isOverallCompulsory ? 'Mandatory' : 'Optional'}
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Compulsory Fields</div>
              <div className="text-xl font-black text-emerald-700">{compulsoryCount} of {totalFields} fields</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Optional Fields</div>
              <div className="text-xl font-black text-amber-700">{optionalCount} fields</div>
            </div>
          </div>
        </div>

        {/* Master Switch: Overall Compulsory */}
        <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 bg-indigo-500/30 text-indigo-200 rounded">
                  Master Switch
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${isOverallCompulsory ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}`}>
                  {isOverallCompulsory ? 'COMPULSORY ENABLED' : 'COMPULSORY DISABLED'}
                </span>
              </div>
              <h2 className="text-lg font-bold">Overall Student Profile Completion</h2>
              <p className="text-sm text-slate-300">
                When enabled, students are required to complete compulsory profile fields. Their profile progress percentage directly tracks completion against these fields.
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleOverall}
              className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                isOverallCompulsory ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isOverallCompulsory ? 'translate-x-8' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Fields Configuration by Group */}
        <div className="space-y-6">
          {Object.entries(groupedFields).map(([groupTitle, fields]) => (
            <div key={groupTitle} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getGroupIcon(groupTitle)}
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{groupTitle}</h3>
                    <p className="text-xs text-slate-500">{fields.length} configurable {fields.length === 1 ? 'field' : 'fields'}</p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {fields.map((f) => {
                  const isCompulsory = Boolean(fieldsConfig[f.key]);
                  return (
                    <div
                      key={f.key}
                      className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 text-sm">{f.label}</span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isCompulsory
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {isCompulsory ? 'Compulsory' : 'Optional'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{f.description}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-600 hidden sm:inline">
                          {isCompulsory ? 'Required' : 'Optional'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleField(f.key)}
                          className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                            isCompulsory ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              isCompulsory ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Save Action Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="text-sm text-slate-600">
            Ensure to save changes after modifying compulsory field rules.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/staff/students')}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
