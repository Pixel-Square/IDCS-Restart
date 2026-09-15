import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Building2, Info, Layers, CheckSquare, Square, AlertCircle } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';

export interface VenueExceptionCourse {
  id: number | string;
  course_code: string;
  course_name: string;
}

export interface VenueExceptionRule {
  id: string;
  venueName: string;
  courses: VenueExceptionCourse[];       // kept for backward compat (unused in new flow)
  groupIds: string[];                     // new: which saved group IDs this venue applies to
  groupNames: string[];                   // display names of linked groups
  capacity: number;
  createdAt?: string;
}

interface SavedGroup {
  id: string;
  groupName: string;
  selectedYears: number[];
  selectedDepartments: string[];
  selectedSectionKeys: string[];
  selectedMixedSectionKeys: string[];
  exceptionCourses: any[];
  createdAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRulesUpdated?: (rules: VenueExceptionRule[]) => void;
}

export const VENUE_EXCEPTIONS_STORAGE_KEY = 'iqac_timetable_venue_exceptions';
const GROUP_ALLOCATIONS_STORAGE_KEY = 'iqac_timetable_group_allocations';

export default function VenueAllocationModal({ isOpen, onClose, onRulesUpdated }: Props) {
  const [rules, setRules] = useState<VenueExceptionRule[]>([]);

  // Form states
  const [venueName, setVenueName] = useState('');
  const [capacity, setCapacity] = useState<number>(1);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Saved groups loaded from localStorage
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>([]);

  // Load rules + groups from API whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        const [rulesRes, groupsRes] = await Promise.all([
          fetchWithAuth('/api/timetable/venue-exceptions/'),
          fetchWithAuth('/api/timetable/group-allocations/')
        ]);

        if (rulesRes.ok) {
          const rData = await rulesRes.json();
          const parsedRules = (rData.results || rData).map((item: any) => ({
            id: item.frontend_id,
            venueName: item.venue_name,
            courses: [],
            groupIds: item.group_ids || [],
            groupNames: [], // We'll map this below
            capacity: item.capacity,
            createdAt: item.created_at,
          }));
          
          if (groupsRes.ok) {
            const gData = await groupsRes.json();
            const parsedGroups = (gData.results || gData).map((item: any) => ({
              id: item.frontend_id,
              groupName: item.group_name,
              selectedYears: item.selected_years || [],
              selectedDepartments: item.selected_departments || [],
              selectedSectionKeys: item.selected_section_keys || [],
              selectedMixedSectionKeys: item.selected_mixed_section_keys || [],
              exceptionCourses: item.exception_courses || [],
              createdAt: item.created_at,
            }));
            setSavedGroups(parsedGroups);
            
            // Map group names to rules
            parsedRules.forEach((rule: any) => {
              rule.groupNames = parsedGroups
                .filter((g: any) => rule.groupIds.includes(g.id))
                .map((g: any) => g.groupName);
            });
          }
          setRules(parsedRules);
        }
      } catch (e) {
        console.error('Failed to load venue exceptions:', e);
      }
    };
    
    fetchData();
  }, [isOpen]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const handleAddRule = async () => {
    if (selectedGroupIds.length === 0) {
      alert('Please select at least one Saved Group for this venue exception.');
      return;
    }
    const cleanCap = Math.max(1, parseInt(String(capacity), 10) || 1);
    const linkedGroups = savedGroups.filter((g) => selectedGroupIds.includes(g.id));
    const autoName =
      venueName.trim() ||
      (linkedGroups.length === 1
        ? `${linkedGroups[0].groupName} Venue`
        : `Shared Venue (${linkedGroups.map((g) => g.groupName).join(', ')})`);

    const frontendId = `venue-${Date.now()}`;
    const payload = {
      frontend_id: frontendId,
      venue_name: autoName,
      group_ids: selectedGroupIds,
      capacity: cleanCap
    };

    try {
      await fetchWithAuth(`/api/timetable/venue-exceptions/`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      const newRule: VenueExceptionRule = {
        id: frontendId,
        venueName: autoName,
        courses: [],
        groupIds: selectedGroupIds,
        groupNames: linkedGroups.map((g) => g.groupName),
        capacity: cleanCap,
        createdAt: new Date().toISOString(),
      };

      const updated = [newRule, ...rules];
      setRules(updated);
      if (onRulesUpdated) onRulesUpdated(updated);
    } catch (e) {
      console.error("Failed to save venue rule", e);
    }

    // Reset
    setVenueName('');
    setCapacity(1);
    setSelectedGroupIds([]);
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await fetchWithAuth(`/api/timetable/venue-exceptions/${id}/`, {
        method: 'DELETE'
      });
      const updated = rules.filter((r) => r.id !== id);
      setRules(updated);
      if (onRulesUpdated) onRulesUpdated(updated);
    } catch(e) {
      console.error("Failed to delete venue rule", e);
    }
  };

  const handleCapacityChange = async (id: string, newCap: number) => {
    const val = Math.max(1, newCap || 1);
    try {
      await fetchWithAuth(`/api/timetable/venue-exceptions/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ capacity: val })
      });
      const updated = rules.map((r) => (r.id === id ? { ...r, capacity: val } : r));
      setRules(updated);
      if (onRulesUpdated) onRulesUpdated(updated);
    } catch (e) {
      console.error("Failed to update capacity", e);
    }
  };

  if (!isOpen) return null;

  // Groups already used in existing rules (to show as "already assigned")
  const usedGroupIds = new Set(rules.flatMap((r) => r.groupIds || []));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100">

        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-sky-800 via-blue-800 to-indigo-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Building2 size={22} className="text-sky-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Venue Exceptions &amp; Laboratory Capacity</h2>
              <p className="text-xs text-sky-100/90">
                Restrict how many saved groups can use the same lab venue simultaneously
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white/80 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* Info Banner */}
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-start gap-3">
            <Info size={20} className="text-sky-600 shrink-0 mt-0.5" />
            <div className="text-xs text-sky-900 leading-relaxed">
              <p className="font-bold text-sm mb-1 text-sky-950">How Venue Exceptions Work:</p>
              <p className="mb-1">
                Some subjects (e.g. Physics Lab, Computer Lab) share a single venue across multiple sections. Use this page to configure how many groups can use the same venue at the same time.
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li>
                  <strong>Create a Group</strong> (in Group Allocation) for each set of sections that shares a lab venue.
                </li>
                <li>
                  <strong>Select those groups here</strong> and set the venue capacity (how many can use it simultaneously).
                </li>
                <li>
                  Sections/groups <strong>NOT linked</strong> to any venue exception will get their timetable generated normally — no restriction.
                </li>
                <li>
                  If <strong>Capacity = 1</strong>: Only 1 group's section can be scheduled in that lab per period.
                  If <strong>Capacity = 4</strong>: Up to 4 groups can share the venue simultaneously.
                </li>
              </ul>
            </div>
          </div>

          {/* Add New Venue Exception Form */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Plus size={16} className="text-blue-600" />
              Add New Venue Exception Rule
            </h3>

            {/* Venue Name + Capacity */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Venue / Lab Name <span className="text-gray-400 font-normal">(Optional — auto-generated if blank)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Physics Laboratory / Computer Lab 1"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Venue Availability / Capacity (Integer) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white font-bold text-blue-900"
                />
                <span className="text-[10px] text-gray-500">Number of simultaneous groups/classes allowed</span>
              </div>
            </div>

            {/* Select Saved Groups */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Layers size={13} className="text-indigo-600" />
                Select Saved Group(s) using this Venue <span className="text-red-500">*</span>
              </label>

              {savedGroups.length === 0 ? (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-900">No Saved Groups Found</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Please close this modal and first create a Group Allocation (using the "Create New Group" tab) for the sections that share this lab/venue. Then come back here to configure the venue exception.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {savedGroups.map((group) => {
                    const isSelected = selectedGroupIds.includes(group.id);
                    const isAlreadyUsed = usedGroupIds.has(group.id);
                    return (
                      <div
                        key={group.id}
                        onClick={() => !isAlreadyUsed && toggleGroup(group.id)}
                        className={`px-4 py-3 flex items-start justify-between gap-3 transition-colors ${
                          isAlreadyUsed
                            ? 'bg-gray-50 cursor-not-allowed opacity-60'
                            : isSelected
                            ? 'bg-indigo-50 cursor-pointer'
                            : 'hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 shrink-0">
                            {isSelected ? (
                              <CheckSquare size={15} className="text-indigo-600" />
                            ) : (
                              <Square size={15} className="text-gray-400" />
                            )}
                          </div>
                          <div>
                            <p className={`text-xs font-bold ${isSelected ? 'text-indigo-900' : 'text-gray-800'}`}>
                              {group.groupName}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              Years: {group.selectedYears.join(', ')} &nbsp;·&nbsp;
                              Depts: {group.selectedDepartments.join(', ') || 'All'} &nbsp;·&nbsp;
                              Sections: {group.selectedSectionKeys.length + group.selectedMixedSectionKeys.length} selected
                              {group.exceptionCourses?.length > 0 && (
                                <> &nbsp;·&nbsp; {group.exceptionCourses.length} exception course(s)</>
                              )}
                            </p>
                          </div>
                        </div>
                        {isAlreadyUsed && (
                          <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-semibold shrink-0">
                            Already in a rule
                          </span>
                        )}
                        {isSelected && !isAlreadyUsed && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                            Selected
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected group chips */}
              {selectedGroupIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {savedGroups
                    .filter((g) => selectedGroupIds.includes(g.id))
                    .map((g) => (
                      <span
                        key={g.id}
                        className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 text-[11px] font-semibold px-2.5 py-1 rounded-md border border-indigo-200"
                      >
                        <Layers size={11} />
                        {g.groupName}
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className="hover:text-red-600 ml-0.5"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* Add Button */}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleAddRule}
                disabled={selectedGroupIds.length === 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs px-4 py-2 rounded-lg font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                Add Venue Exception Rule
              </button>
            </div>
          </div>

          {/* Configured Rules List */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3">
              Configured Venue Exceptions ({rules.length})
            </h3>

            {rules.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <Building2 size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-500 font-medium">No venue exceptions configured yet.</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Select saved groups above and set a capacity to add venue restriction rules.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-4 bg-white border border-sky-200 rounded-xl shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-sky-800 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200">
                          🏛️ {rule.venueName || 'Laboratory Venue'}
                        </span>
                        <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                          Capacity: {rule.capacity} group{rule.capacity > 1 ? 's' : ''} at a time
                        </span>
                      </div>

                      {/* Linked groups */}
                      {(rule.groupNames?.length > 0 || rule.groupIds?.length > 0) && (
                        <div>
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                            Linked Groups:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {(rule.groupNames || rule.groupIds || []).map((name, idx) => (
                              <span
                                key={idx}
                                className="bg-indigo-50 text-indigo-700 text-[10px] px-2 py-0.5 rounded font-semibold border border-indigo-200 flex items-center gap-1"
                              >
                                <Layers size={9} />
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {rule.createdAt && (
                        <p className="text-[10px] text-gray-400">
                          Created: {new Date(rule.createdAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-gray-600 font-semibold">Capacity:</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={rule.capacity}
                          onChange={(e) => handleCapacityChange(rule.id, parseInt(e.target.value, 10))}
                          className="w-16 text-xs px-2 py-1 border border-gray-300 rounded font-bold text-center bg-gray-50 focus:bg-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Rule"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            💡 Only groups linked to a venue exception are restricted. All other groups generate timetables normally.
          </p>
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-5 py-2.5 rounded-lg font-bold shadow-xs transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
