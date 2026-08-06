import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import {
  ArrowLeft, ChevronRight, Settings2, ToggleLeft, ToggleRight,
  BookOpen, Calendar, ClipboardList, BarChart2, Shield, FileText,
  MessageCircle, PartyPopper, Layout, Bell, UserCheck, Wallet, ScanLine, Loader2, GraduationCap, Users
} from 'lucide-react';

interface College {
  id: number;
  code: string;
  name: string;
  short_name: string;
  city: string;
  state: string;
  is_active: boolean;
}

interface Feature {
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  sort_order: number;
  applicable_roles: string;
  sidebar_keys: string;
  is_enabled: boolean;
  enabled_at: string | null;
  disabled_at: string | null;
}

const ICON_MAP: Record<string, any> = {
  ClipboardList, Calendar, BookOpen, BarChart2, Shield, FileText,
  MessageCircle, PartyPopper, Layout, Bell, UserCheck, Wallet, ScanLine, GraduationCap, Users, Settings: Settings2
};

const ROLE_FILTERS = [
  'ALL',
  'STUDENT',
  'FACULTY',
  'HOD',
  'ADVISOR',
  'IQAC',
  'HR',
  'SECURITY',
  'COE'
];

export default function CollegeFeaturesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [college, setCollege] = useState<College | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string>('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [collegeRes, featuresRes] = await Promise.all([
        fetchWithAuth(`/api/college/colleges/${id}/`),
        fetchWithAuth(`/api/college/colleges/${id}/features/`),
      ]);
      if (collegeRes.ok) setCollege(await collegeRes.json());
      if (featuresRes.ok) setFeatures(await featuresRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (code: string, currentState: boolean) => {
    setToggling(code);
    try {
      const res = await fetchWithAuth(`/api/college/colleges/${id}/features/${code}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !currentState }),
      });
      if (res.ok) {
        setFeatures(prev =>
          prev.map(f => f.code === code ? { ...f, is_enabled: !currentState } : f)
        );
      }
    } catch { /* ignore */ }
    setToggling(null);
  };

  const filteredFeatures = features.filter(f => {
    if (activeRole === 'ALL') return true;
    if (!f.applicable_roles) return false;
    const roles = f.applicable_roles.split(',').map(r => r.trim());
    return roles.includes(activeRole);
  });

  const enabledCount = filteredFeatures.filter(f => f.is_enabled).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!college) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="text-lg font-medium">College not found</p>
        <button onClick={() => navigate('/colleges')} className="mt-4 text-blue-600 hover:underline">← Back to Colleges</button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <button onClick={() => navigate('/colleges')} className="hover:text-blue-600 transition-colors">Colleges</button>
        <ChevronRight className="w-3.5 h-3.5" />
        <button onClick={() => navigate(`/colleges/${college.id}`)} className="hover:text-blue-600 transition-colors">{college.code}</button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-700 font-medium">Features</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(`/colleges/${college.id}`)}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="p-3 bg-indigo-100 rounded-xl">
          <Settings2 className="w-7 h-7 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Features Management</h1>
          <p className="text-sm text-gray-500">{college.name}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-4">
        {ROLE_FILTERS.map(role => (
          <button
            key={role}
            onClick={() => setActiveRole(role)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              activeRole === role
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {role}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-700">{enabledCount}</p>
          <p className="text-xs text-green-600 font-medium">Active for {activeRole}</p>
        </div>
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-gray-500">{filteredFeatures.length - enabledCount}</p>
          <p className="text-xs text-gray-500 font-medium">Disabled for {activeRole}</p>
        </div>
        <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{filteredFeatures.length}</p>
          <p className="text-xs text-blue-600 font-medium">Total Modules for {activeRole}</p>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredFeatures.map(feat => {
          const IconComponent = ICON_MAP[feat.icon] || Settings2;
          const isToggling = toggling === feat.code;
          const roles = feat.applicable_roles ? feat.applicable_roles.split(',').map(r => r.trim()) : [];
          const keys = feat.sidebar_keys ? feat.sidebar_keys.split(',').map(k => k.trim()) : [];

          return (
            <div
              key={feat.code}
              className={`relative rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col ${
                feat.is_enabled ? 'border-blue-400' : 'border-gray-200'
              }`}
            >
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${feat.is_enabled ? 'bg-blue-50' : 'bg-gray-100'}`}>
                      <IconComponent className={`w-5 h-5 ${feat.is_enabled ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className={`font-semibold text-sm ${feat.is_enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                        {feat.name}
                      </h3>
                      <p className={`text-xs mt-1 leading-relaxed ${feat.is_enabled ? 'text-gray-600' : 'text-gray-400'}`}>
                        {feat.description}
                      </p>
                    </div>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(feat.code, feat.is_enabled)}
                    disabled={isToggling}
                    className="flex-shrink-0 mt-0.5"
                    title={feat.is_enabled ? 'Disable' : 'Enable'}
                  >
                    {isToggling ? (
                      <Loader2 className="w-7 h-7 text-gray-400 animate-spin" />
                    ) : feat.is_enabled ? (
                      <ToggleRight className="w-10 h-10 text-green-500 hover:text-green-600 transition-colors" />
                    ) : (
                      <ToggleLeft className="w-10 h-10 text-gray-300 hover:text-gray-400 transition-colors" />
                    )}
                  </button>
                </div>

                <div className="mt-4 flex-1 flex flex-col justify-end">
                  {/* Roles Pills */}
                  {roles.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {roles.map(r => (
                        <span key={r} className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold tracking-wide border border-indigo-100">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Sidebar Keys Chips */}
                  {keys.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {keys.map(k => {
                        if (!k) return null;
                        return (
                          <span key={k} className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-mono border border-gray-200 truncate max-w-full">
                            {k}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Status badge */}
                  <div className="flex items-center justify-between mt-1 pt-3 border-t border-gray-100">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md ${
                      feat.is_enabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${feat.is_enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {feat.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{feat.code}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {filteredFeatures.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No features found for the selected role filter.
        </div>
      )}
    </div>
  );
}

