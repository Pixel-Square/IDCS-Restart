import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Plus, 
  Layers, 
  Clock, 
  Calendar, 
  Trash2, 
  Pencil,
  Search, 
  Check, 
  X, 
  AlertCircle, 
  Users, 
  Sparkles,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';

import fetchWithAuth from '../../../services/fetchAuth';

interface SectionItem {
  id: number;
  name: string;
  label: string;
  batch_name?: string;
  semester?: string;
  department?: string;
}

interface BatchItem {
  id?: number;
  name?: string;
  start_time: string;
  end_time: string;
  days: string[];
}

interface ClassGroup {
  id: number;
  name: string;
  description: string;
  sections: { id: number; name: string; batch_name: string }[];
  batches: {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
    days: string;
  }[];
  created_at: string;
}

const ALL_DAYS = [
  { key: 'SUN', label: 'Sunday' },
  { key: 'MON', label: 'Monday' },
  { key: 'TUE', label: 'Tuesday' },
  { key: 'WED', label: 'Wednesday' },
  { key: 'THU', label: 'Thursday' },
  { key: 'FRI', label: 'Friday' },
  { key: 'SAT', label: 'Saturday' },
];

export default function BioSecureAdminPage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSections, setLoadingSections] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal Form State
  const [groupName, setGroupName] = useState<string>('');
  const [groupDescription, setGroupDescription] = useState<string>('');
  const [sectionSearch, setSectionSearch] = useState<string>('');
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([
    {
      name: 'Default Session',
      start_time: '08:45',
      end_time: '17:00',
      days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
  ]);

  const fetchData = async () => {
    setLoading(true);
    setLoadingSections(true);
    try {
      const [groupsRes, secRes] = await Promise.all([
        fetchWithAuth('/api/idscan/biosecure/groups/'),
        fetchWithAuth('/api/idscan/biosecure/sections/'),
      ]);

      if (groupsRes && groupsRes.ok) {
        const gData = await groupsRes.json();
        setGroups(gData.groups || []);
      }
      if (secRes && secRes.ok) {
        const sData = await secRes.json();
        const secList = Array.isArray(sData) ? sData : (sData.sections || []);
        setSections(secList);
      } else {
        console.error('Failed to load sections:', secRes?.status);
      }
    } catch (err: any) {
      console.error('Error loading biosecure data:', err);
    } finally {
      setLoading(false);
      setLoadingSections(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingGroupId(null);
    setGroupName('');
    setGroupDescription('');
    setSectionSearch('');
    setSelectedSectionIds([]);
    setBatches([
      {
        name: 'Default Session',
        start_time: '08:45',
        end_time: '17:00',
        days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      },
    ]);
    setShowCreateModal(true);
  };

  const handleOpenEditModal = (group: ClassGroup) => {
    setEditingGroupId(group.id);
    setGroupName(group.name || '');
    setGroupDescription(group.description || '');
    setSectionSearch('');
    setSelectedSectionIds((group.sections || []).map((s) => s.id));
    
    if (group.batches && group.batches.length > 0) {
      setBatches(
        group.batches.map((b) => ({
          id: b.id,
          name: b.name || '',
          start_time: b.start_time,
          end_time: b.end_time,
          days: (b.days || '').split(',').map((d) => d.trim()).filter(Boolean),
        }))
      );
    } else {
      setBatches([
        {
          name: 'Default Session',
          start_time: '08:45',
          end_time: '17:00',
          days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        },
      ]);
    }
    setShowCreateModal(true);
  };

  const handleToggleSection = (id: number) => {
    setSelectedSectionIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const handleAddBatch = () => {
    setBatches((prev) => [
      ...prev,
      {
        name: `Batch #${prev.length + 1}`,
        start_time: '09:00',
        end_time: '12:30',
        days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      },
    ]);
  };

  const handleRemoveBatch = (index: number) => {
    if (batches.length <= 1) {
      setToast({ type: 'error', text: 'At least one batch timing is required.' });
      return;
    }
    setBatches((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleBatchChange = (index: number, field: keyof BatchItem, value: any) => {
    setBatches((prev) =>
      prev.map((b, idx) => (idx === index ? { ...b, [field]: value } : b))
    );
  };

  const handleToggleDay = (batchIndex: number, dayKey: string) => {
    setBatches((prev) =>
      prev.map((b, idx) => {
        if (idx !== batchIndex) return b;
        const exists = b.days.includes(dayKey);
        const updatedDays = exists
          ? b.days.filter((d) => d !== dayKey)
          : [...b.days, dayKey];
        return { ...b, days: updatedDays };
      })
    );
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setToast({ type: 'error', text: 'Please enter a group name.' });
      return;
    }
    if (selectedSectionIds.length === 0) {
      setToast({ type: 'error', text: 'Please select at least one section.' });
      return;
    }
    if (batches.length === 0) {
      setToast({ type: 'error', text: 'Please configure at least one batch timing.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: groupName.trim(),
        description: groupDescription.trim(),
        section_ids: selectedSectionIds,
        batches: batches.map((b) => ({
          name: b.name || '',
          start_time: b.start_time,
          end_time: b.end_time,
          days: b.days.join(','),
        })),
      };
      if (editingGroupId) {
        payload.group_id = editingGroupId;
      }

      const res = await fetchWithAuth(
        editingGroupId
          ? `/api/idscan/biosecure/groups/${editingGroupId}/`
          : '/api/idscan/biosecure/groups/',
        {
          method: editingGroupId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        setToast({
          type: 'success',
          text: editingGroupId
            ? '🎉 BioSecure Class Group & Batches updated successfully!'
            : '🎉 BioSecure Class Group & Batches created successfully!',
        });
        setShowCreateModal(false);
        setEditingGroupId(null);
        setGroupName('');
        setGroupDescription('');
        setSelectedSectionIds([]);
        setBatches([
          {
            name: 'Default Session',
            start_time: '08:45',
            end_time: '17:00',
            days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          },
        ]);
        fetchData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setToast({ type: 'error', text: errData.detail || 'Failed to save group.' });
      }
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async (id: number) => {
    if (!window.confirm('Are you sure you want to deactivate this Class Group?')) return;
    try {
      const res = await fetchWithAuth(`/api/idscan/biosecure/groups/${id}/`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setToast({ type: 'success', text: 'Group deleted successfully.' });
        fetchData();
      }
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Error deleting group' });
    }
  };

  const filteredSections = sections.filter((s) => {
    const q = (sectionSearch || '').toLowerCase();
    if (!q) return true;
    const l = (s.label || '').toLowerCase();
    const n = (s.name || '').toLowerCase();
    const b = (s.batch_name || '').toLowerCase();
    const sem = (s.semester || '').toLowerCase();
    const d = (s.department || '').toLowerCase();
    return l.includes(q) || n.includes(q) || b.includes(q) || sem.includes(q) || d.includes(q);
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl shadow-xl border border-indigo-500/20 text-white">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2 border border-indigo-500/30">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              BioSecure Management
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Class Groups & Biometric Batches
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              Configure attendance class groups, map cohort sections, and schedule biometric verification batch timers.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-bold shadow-lg shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            Create Class Group
          </button>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div
            className={`mt-4 p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
              toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
              <span>{toast.text}</span>
            </div>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Group Cards Grid */}
        <div className="mt-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-sm font-medium text-slate-500">Loading BioSecure Class Groups...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-sm">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Layers className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No Class Groups Configured</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Start by creating your first Class Group to group department sections and set up live biometric attendance timing batches.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow transition"
              >
                <Plus className="w-4 h-4" />
                Create Class Group
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 mb-2">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Group #{group.id}
                        </span>
                        <h3 className="text-lg font-bold text-slate-900 leading-snug">{group.name}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(group)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="Edit Class Group"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Group"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {group.description && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2">{group.description}</p>
                    )}

                    {/* Mapped Sections */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                        <Users className="w-4 h-4 text-indigo-500" />
                        Mapped Sections ({group.sections.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {group.sections.map((sec) => (
                          <span
                            key={sec.id}
                            className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-medium"
                          >
                            {sec.batch_name ? `${sec.batch_name} - ` : ''}{sec.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Batches Schedule */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                        <Clock className="w-4 h-4 text-emerald-500" />
                        Attendance Batches ({group.batches.length})
                      </div>
                      <div className="space-y-2">
                        {group.batches.map((b) => (
                          <div
                            key={b.id}
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                          >
                            <div>
                              <p className="font-bold text-slate-800">{b.name || 'Batch'}</p>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                {b.start_time} → {b.end_time}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1 max-w-[120px] justify-end">
                              {(b.days || '').split(',').map((d) => (
                                <span
                                  key={d}
                                  className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded text-[9px] font-bold"
                                >
                                  {d.trim()}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Active Security Policy</span>
                    <span>{new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CREATE CLASS GROUP & BATCHES POPUP MODAL ── */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">
                      {editingGroupId ? 'Edit BioSecure Class Group' : 'Create BioSecure Class Group'}
                    </h2>
                    <p className="text-xs text-slate-300">
                      {editingGroupId ? 'Modify sections and batch timings' : 'Map sections and configure multi-batch schedules'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveGroup} className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* 1. Group Name & Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Group Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. AI&DS Year-2 Lab Batch"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mandatory biometric attendance policy for lab practicals"
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                </div>

                {/* 2. Main Two-Column Layout: Left = Section Selection, Right = Batches */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-slate-200">
                  {/* LEFT SIDE: Search & Multi-select Sections (6 cols) */}
                  <div className="lg:col-span-6 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Select Sections <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-xs font-bold text-indigo-600">
                        {selectedSectionIds.length} selected
                      </span>
                    </div>

                    {/* Search Input */}
                    <div className="relative mb-3">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search sections or departments..."
                        value={sectionSearch}
                        onChange={(e) => setSectionSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                      />
                    </div>

                    {/* Sections Multiselect List */}
                    <div className="border border-slate-200 rounded-2xl p-2.5 max-h-80 overflow-y-auto space-y-2 bg-slate-50/50">
                      {filteredSections.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6">No matching sections found.</p>
                      ) : (
                        filteredSections.map((sec) => {
                          const isSelected = selectedSectionIds.includes(sec.id);
                          return (
                            <div
                              key={sec.id}
                              onClick={() => handleToggleSection(sec.id)}
                              className={`flex items-start justify-between p-3 rounded-xl cursor-pointer transition text-xs select-none gap-3 ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-sm font-medium'
                                  : 'bg-white text-slate-700 hover:bg-indigo-50/80 border border-slate-100'
                              }`}
                            >
                              <div className="flex-1 whitespace-normal break-words leading-relaxed">
                                <p className="text-xs font-semibold">
                                  {sec.label}
                                </p>
                              </div>
                              <div
                                className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isSelected ? 'bg-white text-indigo-600' : 'border border-slate-300'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* RIGHT SIDE: Create Batches (6 cols) */}
                  <div className="lg:col-span-6 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Attendance Batches & Timings
                        </label>
                        <p className="text-[11px] text-slate-500">Configure start/end timings and active days</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddBatch}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create a Batch
                      </button>
                    </div>

                    {/* Batch List */}
                    <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                      {batches.map((batch, bIdx) => (
                        <div
                          key={bIdx}
                          className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm relative group space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <input
                              type="text"
                              placeholder={`Batch #${bIdx + 1} Name`}
                              value={batch.name || ''}
                              onChange={(e) => handleBatchChange(bIdx, 'name', e.target.value)}
                              className="font-bold text-xs text-slate-800 bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none"
                            />
                            {batches.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBatch(bIdx)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition"
                                title="Remove batch"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Timings: Start and End Time */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Start Time
                              </label>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                                <input
                                  type="time"
                                  required
                                  value={batch.start_time}
                                  onChange={(e) => handleBatchChange(bIdx, 'start_time', e.target.value)}
                                  className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                End Time
                              </label>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                                <input
                                  type="time"
                                  required
                                  value={batch.end_time}
                                  onChange={(e) => handleBatchChange(bIdx, 'end_time', e.target.value)}
                                  className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Multi-selectable Days: Sunday to Saturday */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                              Active Days
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {ALL_DAYS.map((d) => {
                                const isDayActive = batch.days.includes(d.key);
                                return (
                                  <button
                                    key={d.key}
                                    type="button"
                                    onClick={() => handleToggleDay(bIdx, d.key)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition select-none ${
                                      isDayActive
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {d.label.slice(0, 3)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {submitting ? 'Saving...' : editingGroupId ? 'Update Class Group & Batches' : 'Save Class Group & Batches'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
