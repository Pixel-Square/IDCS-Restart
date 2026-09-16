/**
 * Academic 2.1 - Version Management Page
 * Allows viewing, creating, toggling active/inactive status, and switching Academic Controller configuration versions.
 * Enforces that an Academic Year belongs to ONE version only.
 * Split into Two Sections: Top (Active Versions) and Bottom (Inactive Versions).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  Plus,
  CheckCircle2,
  Calendar,
  Settings2,
  Copy,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  RefreshCw,
  Edit3,
  BookOpen,
  HelpCircle,
  FileSpreadsheet,
  Grid3x3,
  FileText,
  Power,
  AlertTriangle,
  Archive,
  Check,
  ArrowRightLeft
} from 'lucide-react';
import fetchWithAuth from '../../../../services/fetchAuth';
import { fetchAcademicYears, AcademicYearRow } from '../../../../services/academics';

export interface VersionItem {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  academic_years: {
    id: number;
    name: string;
    parity: string;
    is_active: boolean;
  }[];
  class_types_count: number;
  qp_patterns_count: number;
  cycles_count: number;
  created_at: string;
  updated_at: string;
}

export default function VersionManagementPage() {
  const navigate = useNavigate();

  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State: Create / Clone Version
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newVersionName, setNewVersionName] = useState<string>('');
  const [newVersionDescription, setNewVersionDescription] = useState<string>('');
  const [selectedYearIds, setSelectedYearIds] = useState<number[]>([]);
  const [cloneSourceId, setCloneSourceId] = useState<string>('');
  const [setAsDefault, setSetAsDefault] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Modal State: Edit Mappings
  const [editingVersion, setEditingVersion] = useState<VersionItem | null>(null);
  const [editDescription, setEditDescription] = useState<string>('');
  const [editYearIds, setEditYearIds] = useState<number[]>([]);

  // Build a map of which version currently owns each academic year
  // Enforces visibility that an academic year is in ONE version only
  const yearOwnerMap = useMemo(() => {
    const map = new Map<number, VersionItem>();
    versions.forEach((v) => {
      v.academic_years.forEach((ay) => {
        map.set(ay.id, v);
      });
    });
    return map;
  }, [versions]);

  // Load versions and academic years
  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [vRes, ayList] = await Promise.all([
        fetchWithAuth('/api/academic-v2/versions/'),
        fetchAcademicYears().catch(() => [] as AcademicYearRow[]),
      ]);

      if (!vRes.ok) {
        throw new Error(`Failed to load versions (${vRes.status})`);
      }

      const vData = await vRes.json();
      const loadedVersions: VersionItem[] = Array.isArray(vData) ? vData : vData.results || [];
      setVersions(loadedVersions);
      setAcademicYears(ayList);

      // Default clone source to current default version
      const defaultV = loadedVersions.find((v) => v.is_default);
      if (defaultV && !cloneSourceId) {
        setCloneSourceId(defaultV.id);
      }
    } catch (err: any) {
      console.error('Error loading version data:', err);
      setError(err?.message || 'Failed to fetch version configuration.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle setting version as default
  const handleSetDefault = async (v: VersionItem) => {
    if (v.is_default) return;
    try {
      const res = await fetchWithAuth(`/api/academic-v2/versions/${v.id}/set-default/`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to set default version');
      await loadData(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to update default version');
    }
  };

  // Handle toggle active / inactive
  const handleToggleActive = async (v: VersionItem) => {
    if (v.is_default && v.is_active) {
      alert('Cannot deactivate the default active version. Please designate another version as default first.');
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/academic-v2/versions/${v.id}/toggle-active/`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || 'Failed to toggle version status');
      }
      await loadData(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to toggle version status');
    }
  };

  // Open Create Modal
  const handleOpenAddModal = (presetCloneSource?: VersionItem) => {
    const defaultV = versions.find((v) => v.is_default);
    setNewVersionName('');
    setNewVersionDescription('');
    setSelectedYearIds([]);
    setCloneSourceId(presetCloneSource ? presetCloneSource.id : defaultV ? defaultV.id : '');
    setSetAsDefault(false);
    setShowAddModal(true);
  };

  // Submit Create / Clone Version
  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newVersionName.trim().toUpperCase();
    if (!cleanName) {
      alert('Please enter a version name (e.g. OCT2026)');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: cleanName,
        description: newVersionDescription.trim(),
        is_default: setAsDefault,
        is_active: true,
        academic_year_ids: selectedYearIds,
      };

      if (cloneSourceId) {
        payload.clone_from_version_id = cloneSourceId;
      }

      const res = await fetchWithAuth('/api/academic-v2/versions/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errMsg = errorData?.name?.[0] || errorData?.detail || 'Failed to create version';
        throw new Error(errMsg);
      }

      setShowAddModal(false);
      await loadData(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to create version');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Mappings Modal
  const handleOpenEditModal = (v: VersionItem) => {
    setEditingVersion(v);
    setEditDescription(v.description || '');
    setEditYearIds(v.academic_years.map((ay) => ay.id));
  };

  // Save Edit Mappings
  const handleSaveEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVersion) return;

    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/academic-v2/versions/${editingVersion.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editDescription.trim(),
          academic_year_ids: editYearIds,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update version mappings');
      }

      setEditingVersion(null);
      await loadData(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to update version');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Version
  const handleDeleteVersion = async (v: VersionItem) => {
    if (v.is_default) {
      alert('Cannot delete the default active version.');
      return;
    }
    const confirmMsg = v.is_active
      ? `Move version "${v.name}" to Inactive?`
      : `Permanently delete inactive version "${v.name}" and all its cloned configurations? This cannot be undone.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/academic-v2/versions/${v.id}/`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete version');
      await loadData(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete version');
    }
  };

  // Navigate to controller for a specific version
  const handleOpenController = (versionId: string) => {
    navigate(`/academic-v2/admin/controller?version_id=${versionId}`);
  };

  // Split into two sections: Active and Inactive
  const activeVersions = useMemo(() => versions.filter((v) => v.is_active), [versions]);
  const inactiveVersions = useMemo(() => versions.filter((v) => !v.is_active), [versions]);
  const defaultVersion = useMemo(() => versions.find((v) => v.is_default && v.is_active), [versions]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-10">

        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-200">
                <Layers className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Academic 2.1 Version Management
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Manage configuration versions, question paper patterns, and exclusive academic year mappings
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => handleOpenAddModal()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md shadow-indigo-200"
            >
              <Plus className="w-5 h-5" />
              Add Version
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700 flex items-center gap-3">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════════ */}
        {/* TOP SECTION: ACTIVE VERSIONS */}
        {/* ═════════════════════════════════════════════════════════════════════════ */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Active Versions
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {activeVersions.length} Active
              </span>
            </div>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Available for live Academic Controller operations and curriculum cycles
            </span>
          </div>

          {/* Hero Banner: Current Default Active Version */}
          {defaultVersion && (
            <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-400/30">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    DEFAULT ACTIVE VERSION
                  </div>
                  <h3 className="text-3xl font-extrabold tracking-tight">
                    {defaultVersion.name}
                  </h3>
                  <p className="text-indigo-200 text-sm max-w-2xl leading-relaxed">
                    {defaultVersion.description || 'Primary baseline version for Academic 2.1 Controller.'}
                  </p>

                  {/* Mapped Years Pills */}
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-indigo-300 font-medium">Exclusive Mapped Academic Years:</span>
                    {defaultVersion.academic_years.length === 0 ? (
                      <span className="text-xs text-indigo-300 italic">No academic years mapped</span>
                    ) : (
                      defaultVersion.academic_years.map((ay) => (
                        <span
                          key={ay.id}
                          className={`text-xs px-2.5 py-1 rounded-md font-medium border ${
                            ay.is_active
                              ? 'bg-emerald-500/30 border-emerald-400/50 text-white font-semibold'
                              : 'bg-white/10 border-white/20 text-indigo-100'
                          }`}
                        >
                          {ay.name} ({ay.parity}) {ay.is_active && '• Current'}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleOpenController(defaultVersion.id)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-900 hover:bg-indigo-50 font-bold rounded-xl shadow-lg transition-transform hover:-translate-y-0.5"
                  >
                    <Settings2 className="w-5 h-5 text-indigo-600" />
                    Open Academic Controller
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Versions Cards Grid */}
          {loading ? (
            <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
              Loading active versions...
            </div>
          ) : activeVersions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <Layers className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              No active versions. Click "+ Add Version" to create one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeVersions.map((v) => (
                <div
                  key={v.id}
                  className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                    v.is_default
                      ? 'border-indigo-300 bg-indigo-50/30 shadow-md ring-1 ring-indigo-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xl font-bold text-slate-900 tracking-tight">
                            {v.name}
                          </h4>
                          {v.is_default && (
                            <span className="px-2 py-0.5 text-xs font-bold text-emerald-800 bg-emerald-100 rounded-full border border-emerald-200">
                              Default
                            </span>
                          )}
                          <span className="px-2 py-0.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-full border border-emerald-200">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Created {new Date(v.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          title="Edit mappings & description"
                          onClick={() => handleOpenEditModal(v)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          title="Clone into new version"
                          onClick={() => handleOpenAddModal(v)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {!v.is_default && (
                          <button
                            title="Deactivate version (Move to Inactive)"
                            onClick={() => handleToggleActive(v)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-2 min-h-[40px]">
                      {v.description || 'No description provided.'}
                    </p>

                    {/* Stats counts */}
                    <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center">
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="text-xs text-slate-500 font-medium">Class Types</div>
                        <div className="text-base font-bold text-slate-800 mt-0.5">
                          {v.class_types_count}
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="text-xs text-slate-500 font-medium">QP Patterns</div>
                        <div className="text-base font-bold text-slate-800 mt-0.5">
                          {v.qp_patterns_count}
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="text-xs text-slate-500 font-medium">Cycles</div>
                        <div className="text-base font-bold text-slate-800 mt-0.5">
                          {v.cycles_count}
                        </div>
                      </div>
                    </div>

                    {/* Mapped Academic Years (Strict 1-to-1) */}
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          Mapped Academic Years ({v.academic_years.length})
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">Exclusive</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {v.academic_years.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">No academic years mapped</span>
                        ) : (
                          v.academic_years.map((ay) => (
                            <span
                              key={ay.id}
                              className={`text-[11px] px-2 py-0.5 rounded-md font-medium border ${
                                ay.is_active
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                                  : 'bg-slate-100 border-slate-200 text-slate-600'
                              }`}
                            >
                              {ay.name} ({ay.parity}) {ay.is_active && '★'}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="p-4 bg-slate-50/60 border-t border-slate-100 rounded-b-2xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {!v.is_default && (
                        <button
                          onClick={() => handleSetDefault(v)}
                          className="text-xs font-medium text-slate-600 hover:text-indigo-600 hover:underline"
                        >
                          Set Default
                        </button>
                      )}
                      {!v.is_default && (
                        <button
                          onClick={() => handleToggleActive(v)}
                          className="text-xs font-medium text-amber-600 hover:text-amber-800"
                          title="Deactivate version"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleOpenController(v.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm"
                    >
                      Open Controller
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═════════════════════════════════════════════════════════════════════════ */}
        {/* BOTTOM SECTION: INACTIVE VERSIONS */}
        {/* ═════════════════════════════════════════════════════════════════════════ */}
        <section className="space-y-6 pt-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-slate-400" />
              <h2 className="text-xl font-bold text-slate-700 tracking-tight">
                Inactive Versions
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-200 text-slate-700 border border-slate-300">
                {inactiveVersions.length} Inactive
              </span>
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Archived versions. Can be reactivated or permanently removed.
            </span>
          </div>

          {inactiveVersions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white/70 rounded-2xl border border-dashed border-slate-200">
              <Archive className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium">No inactive versions</p>
              <p className="text-xs text-slate-400 mt-0.5">
                All configuration versions are currently active. When you deactivate a version, it will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {inactiveVersions.map((v) => (
                <div
                  key={v.id}
                  className="rounded-2xl border border-slate-200 bg-white/80 hover:bg-white transition-all duration-200 flex flex-col justify-between opacity-85 hover:opacity-100"
                >
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xl font-bold text-slate-700 tracking-tight line-through decoration-slate-400">
                            {v.name}
                          </h4>
                          <span className="px-2 py-0.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-full border border-slate-200">
                            Inactive
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Created {new Date(v.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          title="Reactivate version"
                          onClick={() => handleToggleActive(v)}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          title="Permanently Delete version"
                          onClick={() => handleDeleteVersion(v)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-sm text-slate-500 line-clamp-2 min-h-[40px]">
                      {v.description || 'No description provided.'}
                    </p>

                    {/* Stats counts */}
                    <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center text-slate-500">
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="text-xs font-medium">Class Types</div>
                        <div className="text-base font-bold mt-0.5">{v.class_types_count}</div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="text-xs font-medium">QP Patterns</div>
                        <div className="text-base font-bold mt-0.5">{v.qp_patterns_count}</div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="text-xs font-medium">Cycles</div>
                        <div className="text-base font-bold mt-0.5">{v.cycles_count}</div>
                      </div>
                    </div>

                    {/* Mapped Academic Years */}
                    <div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Mapped Academic Years ({v.academic_years.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
                        {v.academic_years.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">No academic years mapped</span>
                        ) : (
                          v.academic_years.map((ay) => (
                            <span
                              key={ay.id}
                              className="text-[11px] px-2 py-0.5 rounded-md font-medium border bg-slate-100 border-slate-200 text-slate-500"
                            >
                              {ay.name} ({ay.parity})
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="p-4 bg-slate-50/70 border-t border-slate-100 rounded-b-2xl flex items-center justify-between gap-3">
                    <button
                      onClick={() => handleToggleActive(v)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Reactivate Version
                    </button>

                    <button
                      onClick={() => handleOpenController(v.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition"
                    >
                      <span>View Controller</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: Add / Clone Version */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-100 overflow-hidden">
            <form onSubmit={handleCreateVersion}>
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Create New Configuration Version</h3>
                      <p className="text-xs text-slate-500">Define version name and map academic years exclusively</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Version Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Version Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. OCT2026, 2026-PATTERN-A"
                    value={newVersionName}
                    onChange={(e) => setNewVersionName(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono uppercase"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Suggested format: Month &amp; Year (e.g., SEPT2026, OCT2026) or Regulation name.
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Provide details on curriculum revisions, QP structure changes, etc."
                    value={newVersionDescription}
                    onChange={(e) => setNewVersionDescription(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                {/* Clone From Source */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Clone Configurations From
                  </label>
                  <select
                    value={cloneSourceId}
                    onChange={(e) => setCloneSourceId(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    <option value="">-- Do not clone (Start with empty configs) --</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.class_types_count} class types, {v.qp_patterns_count} QP patterns)
                        {v.is_default ? ' [Current Default]' : ''} {!v.is_active ? ' [Inactive]' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Cloning duplicates all class types, question paper patterns, and cycles from the selected version.
                  </p>
                </div>

                {/* Mapped Academic Years (Strict 1-to-1) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Map Academic Years (One Version per Academic Year)
                    </label>
                    <span className="text-[11px] text-indigo-600 font-semibold">
                      {selectedYearIds.length} selected
                    </span>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl mb-2 flex items-start gap-2 text-[11px] text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      An Academic Year belongs to <strong>one version only</strong>. If you select an academic year that is currently mapped to another version, it will automatically move to this version.
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3 max-h-52 overflow-y-auto space-y-1.5 bg-slate-50">
                    {academicYears.length === 0 ? (
                      <div className="text-xs text-slate-400 py-2 text-center">No academic years found.</div>
                    ) : (
                      academicYears.map((ay) => {
                        const isChecked = selectedYearIds.includes(ay.id);
                        const currentOwner = yearOwnerMap.get(ay.id);

                        return (
                          <label
                            key={ay.id}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition text-xs border ${
                              isChecked
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                                : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedYearIds([...selectedYearIds, ay.id]);
                                  } else {
                                    setSelectedYearIds(selectedYearIds.filter((id) => id !== ay.id));
                                  }
                                }}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                              />
                              <div>
                                <span>{ay.name} ({ay.parity})</span>
                                {ay.is_active && (
                                  <span className="ml-2 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded">
                                    Current Live
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Show current assignment status */}
                            <div>
                              {isChecked && currentOwner ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                  <ArrowRightLeft className="w-2.5 h-2.5" />
                                  Moves from {currentOwner.name}
                                </span>
                              ) : currentOwner ? (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
                                  In {currentOwner.name}
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                                  Available
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Make Default Checkbox */}
                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={setAsDefault}
                      onChange={(e) => setSetAsDefault(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Set as active default version immediately
                    </span>
                  </label>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md shadow-indigo-200 disabled:opacity-50"
                >
                  {submitting ? 'Creating Version...' : 'Create Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Edit Mappings */}
      {/* ========================================================================= */}
      {editingVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-100 overflow-hidden">
            <form onSubmit={handleSaveEditModal}>
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        Edit Version Mappings: {editingVersion.name}
                      </h3>
                      <p className="text-xs text-slate-500">Update academic years and description</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingVersion(null)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                {/* Mapped Academic Years (Strict 1-to-1) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Exclusive Mapped Academic Years
                    </label>
                    <span className="text-[11px] text-indigo-600 font-semibold">
                      {editYearIds.length} selected
                    </span>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl mb-2 flex items-start gap-2 text-[11px] text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      An Academic Year belongs to <strong>one version only</strong>. Selecting a year mapped to another version will reassign it exclusively to <strong>{editingVersion.name}</strong>.
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3 max-h-56 overflow-y-auto space-y-1.5 bg-slate-50">
                    {academicYears.map((ay) => {
                      const isChecked = editYearIds.includes(ay.id);
                      const currentOwner = yearOwnerMap.get(ay.id);
                      const isOwnedByOther = currentOwner && currentOwner.id !== editingVersion.id;

                      return (
                        <label
                          key={ay.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition text-xs border ${
                            isChecked
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                              : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditYearIds([...editYearIds, ay.id]);
                                } else {
                                  setEditYearIds(editYearIds.filter((id) => id !== ay.id));
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            />
                            <div>
                              <span>{ay.name} ({ay.parity})</span>
                              {ay.is_active && (
                                <span className="ml-2 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded">
                                  Current Live
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Ownership indicator */}
                          <div>
                            {isChecked && isOwnedByOther ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                <ArrowRightLeft className="w-2.5 h-2.5" />
                                Moves from {currentOwner.name}
                              </span>
                            ) : isOwnedByOther ? (
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
                                In {currentOwner.name}
                              </span>
                            ) : isChecked ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                <Check className="w-2.5 h-2.5" />
                                Mapped to this version
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                                Available
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingVersion(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md shadow-indigo-200 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
