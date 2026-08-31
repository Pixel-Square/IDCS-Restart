import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import {
  ArrowLeft, ChevronRight, Settings2, ToggleLeft, ToggleRight,
  BookOpen, Calendar, ClipboardList, BarChart2, Shield, FileText,
  MessageCircle, PartyPopper, Layout, Bell, UserCheck, Wallet, ScanLine,
  Loader2, GraduationCap, Users, ShieldCheck, Zap, Star, ChevronDown, Check
} from 'lucide-react';

interface College {
  id: number;
  code: string;
  name: string;
  short_name: string;
  city: string;
  state: string;
  is_active: boolean;
  tier: 'BASIC' | 'PRO' | 'PREMIUM';
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

const ROLE_FILTERS = ['ALL', 'STUDENT', 'FACULTY', 'HOD', 'ADVISOR', 'IQAC', 'HR', 'SECURITY', 'COE'];

// ─── Tier metadata ────────────────────────────────────────────────────────────
type TierKey = 'BASIC' | 'PRO' | 'PREMIUM';

const TIER_CONFIG: Record<TierKey, {
  label: string;
  tagline: string;
  icon: React.FC<{ className?: string }>;
  gradient: string;
  badge: string;
  ring: string;
  cardBg: string;
  textColor: string;
  btnActive: string;
  btnInactive: string;
}> = {
  BASIC: {
    label: 'Basic',
    tagline: 'Core academic modules',
    icon: ShieldCheck,
    gradient: 'from-blue-600 to-blue-500',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    ring: 'ring-blue-400',
    cardBg: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-700',
    btnActive: 'bg-blue-600 text-white shadow-md',
    btnInactive: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100',
  },
  PRO: {
    label: 'Pro',
    tagline: 'Advanced management tools',
    icon: Zap,
    gradient: 'from-violet-600 to-purple-500',
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    ring: 'ring-purple-400',
    cardBg: 'bg-purple-50 border-purple-200',
    textColor: 'text-purple-700',
    btnActive: 'bg-purple-600 text-white shadow-md',
    btnInactive: 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100',
  },
  PREMIUM: {
    label: 'Premium',
    tagline: 'Full platform access',
    icon: Star,
    gradient: 'from-amber-500 to-orange-400',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    ring: 'ring-amber-400',
    cardBg: 'bg-amber-50 border-amber-200',
    textColor: 'text-amber-700',
    btnActive: 'bg-amber-500 text-white shadow-md',
    btnInactive: 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100',
  },
};

const TIERS: TierKey[] = ['BASIC', 'PRO', 'PREMIUM'];

// ─── Tier → feature presets (mirrors CollegesPage.tsx presets) ───────────────
const TIER_FEATURES: Record<TierKey, 'ALL' | string[]> = {
  BASIC: [
    'announcements', 'queries',
    'attendance_student', 'marks_student', 'timetable_student', 'curriculum_student',
  ],
  PRO: [
    'announcements', 'queries',
    'attendance_student', 'marks_student', 'timetable_student', 'curriculum_student',
    'attendance_marking', 'attendance_analytics', 'timetable_staff', 'assigned_subjects',
    'obe', 'curriculum_dept', 'result_analysis', 'mentor_assign', 'my_calendar',
    'staff_salary', 'staff_requests', 'requests_hub', 'feedback', 'events',
    'applications_student', 'applications_staff', 'certificates_student', 'certificates_review',
  ],
  PREMIUM: 'ALL',   // enable every available feature
};
// ─────────────────────────────────────────────────────────────────────────────

export default function CollegeFeaturesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [college, setCollege] = useState<College | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string>('ALL');

  // Tier panel
  const [tierPanelOpen, setTierPanelOpen] = useState(false);
  const [pendingTier, setPendingTier] = useState<TierKey | null>(null);
  const [savingTier, setSavingTier] = useState(false);
  const [tierSuccess, setTierSuccess] = useState(false);

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

  const handleTierSave = async () => {
    if (!pendingTier || !college || pendingTier === college.tier) return;
    setSavingTier(true);
    try {
      // 1. Update the tier label on the college record
      const tierRes = await fetchWithAuth(`/api/college/colleges/${id}/tier/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: pendingTier }),
      });
      if (!tierRes.ok) { setSavingTier(false); return; }

      // 2. Build a features map: every known feature code → enabled/disabled
      const preset = TIER_FEATURES[pendingTier];
      const featuresMap: Record<string, boolean> = {};
      features.forEach(f => {
        featuresMap[f.code] = preset === 'ALL' || (preset as string[]).includes(f.code);
      });

      // 3. Bulk-update features via the existing PUT endpoint
      const bulkRes = await fetchWithAuth(`/api/college/colleges/${id}/features/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: featuresMap }),
      });

      if (bulkRes.ok) {
        // 4. Update local feature state so the grid re-renders immediately
        setFeatures(prev =>
          prev.map(f => ({ ...f, is_enabled: featuresMap[f.code] ?? f.is_enabled }))
        );
      }

      setCollege(prev => prev ? { ...prev, tier: pendingTier } : prev);
      setTierSuccess(true);
      setTimeout(() => {
        setTierSuccess(false);
        setTierPanelOpen(false);
        setPendingTier(null);
      }, 1800);
    } catch { /* ignore */ }
    setSavingTier(false);
  };

  const openTierPanel = () => {
    setPendingTier(college?.tier ?? 'BASIC');
    setTierPanelOpen(true);
    setTierSuccess(false);
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

  const currentTier = (college.tier || 'BASIC') as TierKey;
  const currentTierCfg = TIER_CONFIG[currentTier];
  const CurrentTierIcon = currentTierCfg.icon;
  const effectivePending = pendingTier ?? currentTier;

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
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Features Management</h1>
          <p className="text-sm text-gray-500 truncate">{college.name}</p>
        </div>
      </div>

      {/* ── Tier Banner ───────────────────────────────────────────────────────── */}
      <div className={`relative rounded-2xl border ${currentTierCfg.cardBg} p-5 mb-6 overflow-hidden`}>
        {/* decorative gradient blob */}
        <div className={`absolute inset-0 bg-gradient-to-br ${currentTierCfg.gradient} opacity-5 pointer-events-none`} />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: current tier display */}
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${currentTierCfg.gradient} flex items-center justify-center shadow-lg`}>
              <CurrentTierIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-0.5">Current Plan</p>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-extrabold ${currentTierCfg.textColor}`}>
                  {currentTierCfg.label}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${currentTierCfg.badge}`}>
                  {currentTier}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{currentTierCfg.tagline}</p>
            </div>
          </div>

          {/* Right: change tier button */}
          <button
            id="change-tier-btn"
            onClick={openTierPanel}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${currentTierCfg.btnInactive}`}
          >
            Change Plan
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* ── Tier Change Panel (inline dropdown) ─────────────────────────── */}
        {tierPanelOpen && (
          <div className="mt-5 pt-5 border-t border-gray-200/60">
            <p className="text-sm font-semibold text-gray-700 mb-3">Select a new plan for {college.code}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TIERS.map(tier => {
                const cfg = TIER_CONFIG[tier];
                const TierIcon = cfg.icon;
                const isCurrentSaved = tier === currentTier;
                const isSelected = tier === effectivePending;
                // compute how many features this tier would enable
                const preset = TIER_FEATURES[tier];
                const enabledCount = preset === 'ALL'
                  ? features.length
                  : features.filter(f => (preset as string[]).includes(f.code)).length;
                return (
                  <button
                    key={tier}
                    id={`tier-select-${tier.toLowerCase()}`}
                    type="button"
                    onClick={() => setPendingTier(tier)}
                    className={`relative flex flex-col gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? `border-2 ${cfg.ring} ring-2 ${cfg.btnActive}`
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    {isCurrentSaved && (
                      <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wide">
                        Current
                      </span>
                    )}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
                      <TierIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-gray-900'}`}>{cfg.label}</p>
                      <p className={`text-xs mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{cfg.tagline}</p>
                      <p className={`text-xs mt-1.5 font-semibold ${isSelected ? 'text-white/90' : cfg.textColor}`}>
                        {enabledCount} of {features.length} features
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Change preview + action row */}
            {(() => {
              const preset = TIER_FEATURES[effectivePending];
              const willEnable = preset === 'ALL'
                ? features.length
                : features.filter(f => (preset as string[]).includes(f.code)).length;
              const willDisable = features.length - willEnable;
              const isChange = effectivePending !== currentTier;
              return (
                <div className="mt-4 space-y-3">
                  {isChange && (
                    <div className="flex items-center gap-3 text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <span className="text-gray-500">Switching to</span>
                      <span className={`font-bold ${TIER_CONFIG[effectivePending].textColor}`}>{TIER_CONFIG[effectivePending].label}</span>
                      <span className="text-gray-400">will</span>
                      <span className="font-semibold text-green-600">enable {willEnable} features</span>
                      <span className="text-gray-400">&amp;</span>
                      <span className="font-semibold text-red-500">disable {willDisable}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => { setTierPanelOpen(false); setPendingTier(null); }}
                      className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      id="confirm-tier-btn"
                      type="button"
                      onClick={handleTierSave}
                      disabled={savingTier || effectivePending === currentTier || tierSuccess}
                      className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-60 ${
                        tierSuccess
                          ? 'bg-green-600 text-white'
                          : `bg-gradient-to-r ${TIER_CONFIG[effectivePending].gradient} text-white shadow-md hover:opacity-90`
                      }`}
                    >
                      {savingTier ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Applying...</>  
                      ) : tierSuccess ? (
                        <><Check className="w-4 h-4" /> Plan &amp; features updated!</>
                      ) : (
                        <>Confirm — Switch to {TIER_CONFIG[effectivePending].label}</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
      {/* ─────────────────────────────────────────────────────────────────────── */}

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
