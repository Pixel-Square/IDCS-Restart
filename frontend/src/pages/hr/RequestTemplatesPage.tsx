import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, Save, RefreshCw, BarChart2, Calendar, Filter, Download } from 'lucide-react';
import { apiClient } from '../../services/auth';
import { getApiBase } from '../../services/apiBase';
import {
  getTemplates,
  deleteTemplate,
  patchTemplate,
  getVacationSettings,
  saveVacationSettings,
  searchStaffForBalanceEdit,
  getBalancesByUser,
  setBalanceForUser,
  recalculateLopBalances,
  recalculateAttendanceBalances,
  getLateEntryMonthlyByUser,
  deleteLateEntryRecord,
} from '../../services/staffRequests';
import type { RequestTemplate, VacationConfirmSlot, VacationEntitlementRule, VacationSemester, VacationSlot } from '../../types/staffRequests';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import TemplateEditorModal from './TemplateEditorModal';

interface DepartmentOption {
  id: number;
  code?: string;
  short_name?: string;
  name?: string;
}

export default function TemplateManagementPage() {
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RequestTemplate | null>(null);
  const [staffQuery, setStaffQuery] = useState('');
  const [staffResults, setStaffResults] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
  const [selectedStaffBalances, setSelectedStaffBalances] = useState<any[]>([]);
  const [balanceEdits, setBalanceEdits] = useState<Record<string, string>>({});
  const [searchingStaff, setSearchingStaff] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [savingBalanceKey, setSavingBalanceKey] = useState<string | null>(null);
  const [recalculatingLop, setRecalculatingLop] = useState(false);
  const [recalculatingAttendance, setRecalculatingAttendance] = useState(false);
  const [lateEntryMonth, setLateEntryMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [lateEntryStats, setLateEntryStats] = useState<any | null>(null);
  const [loadingLateEntry, setLoadingLateEntry] = useState(false);
  const [deletingLateRequestId, setDeletingLateRequestId] = useState<number | null>(null);
  const [activeConfigTab, setActiveConfigTab] = useState<'templates' | 'vacation' | 'vacation_analytics'>('templates');
  const [vacationRules, setVacationRules] = useState<VacationEntitlementRule[]>([]);
  const [vacationSemesters, setVacationSemesters] = useState<VacationSemester[]>([]);
  const [vacationSlots, setVacationSlots] = useState<VacationSlot[]>([]);
  const [vacationConfirmSlots, setVacationConfirmSlots] = useState<VacationConfirmSlot[]>([]);
  const [vacationDepartments, setVacationDepartments] = useState<DepartmentOption[]>([]);
  const [vacationLoading, setVacationLoading] = useState(false);
  const [vacationSaving, setVacationSaving] = useState(false);
  const [editingRuleRows, setEditingRuleRows] = useState<Record<number, boolean>>({});
  const [editingSlotRows, setEditingSlotRows] = useState<Record<number, boolean>>({});
  const [editingConfirmRows, setEditingConfirmRows] = useState<Record<number, boolean>>({});
  const [showCreateSemester, setShowCreateSemester] = useState(false);
  const [expandedSemesterName, setExpandedSemesterName] = useState<string | null>(null);
  const [newSemesterName, setNewSemesterName] = useState('');
  const [newSemesterFrom, setNewSemesterFrom] = useState('');
  const [newSemesterTo, setNewSemesterTo] = useState('');

  // Vacation Analytics state
  const [vaMonth, setVaMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; });
  const [vaDeptFilters, setVaDeptFilters] = useState<string[]>([]);
  const [vaStatusFilter, setVaStatusFilter] = useState('');
  const [vaRows, setVaRows] = useState<any[]>([]);
  const [vaLoading, setVaLoading] = useState(false);
  const [vaError, setVaError] = useState<string | null>(null);
  const [vaSearch, setVaSearch] = useState('');
  const [vaDeptStaffCounts, setVaDeptStaffCounts] = useState<Record<string, number>>({});

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (activeConfigTab === 'vacation' || activeConfigTab === 'vacation_analytics') {
      loadVacationSettings();
      loadVacationDepartments();
    }
  }, [activeConfigTab]);

  const handleCreate = () => {
    setEditingTemplate(null);
    setShowEditor(true);
  };

  const handleEdit = (template: RequestTemplate) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await deleteTemplate(id);
      setTemplates(templates.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete template');
    }
  };

  const handleToggleActive = async (template: RequestTemplate) => {
    try {
      const updated = await patchTemplate(template.id!, { is_active: !template.is_active });
      setTemplates(templates.map(t => t.id === updated.id ? updated : t));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update template');
    }
  };

  const handleSaved = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    loadTemplates();
  };

  const loadVacationSettings = async () => {
    try {
      setVacationLoading(true);
      const data = await getVacationSettings();
      setVacationRules((data.rules || []).map((rule: VacationEntitlementRule) => ({
        ...rule,
        condition: rule.condition || '>=',
      })));
      setVacationSemesters((data.semesters || []).map((sem: VacationSemester) => ({
        ...sem,
      })));
      setVacationSlots((data.slots || []).map((slot: VacationSlot) => ({
        ...slot,
        semester_from_date: slot.semester_from_date || null,
        semester_to_date: slot.semester_to_date || null,
      })));
      setVacationConfirmSlots((data.confirm_slots || []).map((slot: VacationConfirmSlot) => ({
        ...slot,
        slot_name: slot.slot_name || 'Compulsory Slot',
        department_ids: Array.isArray(slot.department_ids) ? slot.department_ids : [],
      })));
      setEditingRuleRows({});
      setEditingSlotRows({});
      setEditingConfirmRows({});
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to load vacation settings');
    } finally {
      setVacationLoading(false);
    }
  };

  const loadVacationDepartments = async () => {
    try {
      const res = await apiClient.get(`${getApiBase()}/api/staff-attendance/holidays/departments/`);
      const rows = res.data?.results || res.data || [];
      setVacationDepartments(Array.isArray(rows) ? rows : []);
    } catch {
      setVacationDepartments([]);
    }
  };

  const persistVacationSettings = async (
    payload?: {
      rules?: VacationEntitlementRule[];
      semesters?: VacationSemester[];
      slots?: VacationSlot[];
      confirm_slots?: VacationConfirmSlot[];
    },
    notify: boolean = true,
  ): Promise<boolean> => {
    const rules = payload?.rules || vacationRules;
    const semesters = payload?.semesters || vacationSemesters;
    const slots = payload?.slots || vacationSlots;
    const confirm_slots = payload?.confirm_slots || vacationConfirmSlots;

    try {
      setVacationSaving(true);
      await saveVacationSettings({
        rules,
        semesters,
        slots,
        confirm_slots,
      });
      if (notify) {
        alert('Saved successfully');
      }
      await loadVacationSettings();
      return true;
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to save vacation settings');
      return false;
    } finally {
      setVacationSaving(false);
    }
  };

  const startRuleEdit = (idx: number) => {
    setEditingRuleRows(prev => ({ ...prev, [idx]: true }));
  };

  const saveRuleRow = async (idx: number) => {
    const ok = await persistVacationSettings();
    if (ok) {
      setEditingRuleRows(prev => ({ ...prev, [idx]: false }));
    }
  };

  const startSlotEdit = (idx: number) => {
    setEditingSlotRows(prev => ({ ...prev, [idx]: true }));
  };

  const saveSlotRow = async (idx: number) => {
    const ok = await persistVacationSettings();
    if (ok) {
      setEditingSlotRows(prev => ({ ...prev, [idx]: false }));
    }
  };

  const startConfirmEdit = (idx: number) => {
    setEditingConfirmRows(prev => ({ ...prev, [idx]: true }));
  };

  const saveConfirmRow = async (idx: number) => {
    const ok = await persistVacationSettings();
    if (ok) {
      setEditingConfirmRows(prev => ({ ...prev, [idx]: false }));
    }
  };

  const handleCreateSemester = async () => {
    const name = newSemesterName.trim();
    if (!name || !newSemesterFrom || !newSemesterTo) {
      alert('Semester name, from date and to date are required');
      return;
    }
    if (newSemesterTo < newSemesterFrom) {
      alert('Semester to date must be on or after semester from date');
      return;
    }
    if (vacationSemesters.some(s => (s.name || '').toLowerCase() === name.toLowerCase())) {
      alert('Semester name already exists');
      return;
    }

    const nextSemesters = [
      ...vacationSemesters,
      { name, from_date: newSemesterFrom, to_date: newSemesterTo, is_active: true },
    ];
    const ok = await persistVacationSettings({ semesters: nextSemesters }, false);
    if (!ok) {
      return;
    }
    setExpandedSemesterName(name);
    setShowCreateSemester(false);
    setNewSemesterName('');
    setNewSemesterFrom('');
    setNewSemesterTo('');
  };

  const handleAddSlotForSemester = (semesterName: string) => {
    setVacationSlots(prev => ([
      ...prev,
      {
        semester: semesterName,
        slot_name: '',
        from_date: '',
        to_date: '',
        is_active: true,
      },
    ]));
  };

  const handleAddConfirmSlotForSemester = (semesterName: string) => {
    setVacationConfirmSlots(prev => ([
      ...prev,
      {
        semester: semesterName,
        slot_name: 'Compulsory Slot',
        from_date: '',
        to_date: '',
        department_ids: [],
        is_active: true,
      },
    ]));
  };

  const handleSearchStaff = async () => {
    try {
      setSearchingStaff(true);
      const data = await searchStaffForBalanceEdit(staffQuery);
      setStaffResults(data?.results || []);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to search staff');
    } finally {
      setSearchingStaff(false);
    }
  };

  const handleSelectStaff = async (staff: any) => {
    try {
      setSelectedStaff(staff);
      setLoadingBalances(true);
      const data = await getBalancesByUser(staff.id);
      const balances = data?.balances || [];
      setSelectedStaffBalances(balances);

      const nextEdits: Record<string, string> = {};
      balances.forEach((b: any) => {
        nextEdits[b.leave_type] = String(b.balance ?? 0);
      });
      setBalanceEdits(nextEdits);

      setLoadingLateEntry(true);
      const lateData = await getLateEntryMonthlyByUser(staff.id, lateEntryMonth);
      setLateEntryStats(lateData || null);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to load balances');
    } finally {
      setLoadingBalances(false);
      setLoadingLateEntry(false);
    }
  };

  const reloadSelectedStaffData = async () => {
    if (!selectedStaff) return;

    setLoadingBalances(true);
    setLoadingLateEntry(true);
    try {
      const [balancesData, lateData] = await Promise.all([
        getBalancesByUser(selectedStaff.id),
        getLateEntryMonthlyByUser(selectedStaff.id, lateEntryMonth),
      ]);

      const balances = balancesData?.balances || [];
      setSelectedStaffBalances(balances);
      const nextEdits: Record<string, string> = {};
      balances.forEach((b: any) => {
        nextEdits[b.leave_type] = String(b.balance ?? 0);
      });
      setBalanceEdits(nextEdits);
      setLateEntryStats(lateData || null);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to refresh staff data');
    } finally {
      setLoadingBalances(false);
      setLoadingLateEntry(false);
    }
  };

  const handleDeleteLateRecord = async (requestId: number) => {
    if (!selectedStaff) return;
    const ok = window.confirm(
      'Delete this approved late entry record? This will rollback attendance for that date/shift to absent and recalculate monthly counts.'
    );
    if (!ok) return;

    try {
      setDeletingLateRequestId(requestId);
      await deleteLateEntryRecord(requestId, lateEntryMonth);
      await reloadSelectedStaffData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete late entry record');
    } finally {
      setDeletingLateRequestId(null);
    }
  };

  const handleSaveBalance = async (leaveType: string) => {
    if (!selectedStaff) return;
    const key = `${selectedStaff.id}:${leaveType}`;
    const raw = balanceEdits[leaveType];
    const value = Number(raw);
    if (Number.isNaN(value)) {
      alert('Please enter a valid number');
      return;
    }

    try {
      setSavingBalanceKey(key);
      await setBalanceForUser(selectedStaff.id, leaveType, value);
      const refreshed = await getBalancesByUser(selectedStaff.id);
      const balances = refreshed?.balances || [];
      setSelectedStaffBalances(balances);
      const nextEdits: Record<string, string> = {};
      balances.forEach((b: any) => {
        nextEdits[b.leave_type] = String(b.balance ?? 0);
      });
      setBalanceEdits(nextEdits);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update balance');
    } finally {
      setSavingBalanceKey(null);
    }
  };

  const handleRecalculateLop = async () => {
    if (!window.confirm('Recalculate LOP for all staff using current attendance records?')) return;

    try {
      setRecalculatingLop(true);
      const res = await recalculateLopBalances();
      alert(
        `LOP recalculation completed. Processed: ${res?.processed_users ?? 0}, Updated: ${res?.updated_users ?? 0}`
      );

      if (selectedStaff) {
        await reloadSelectedStaffData();
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to recalculate LOP');
    } finally {
      setRecalculatingLop(false);
    }
  };

  const handleRecalculateAttendance = async () => {
    const now = new Date();
    const defaultYear = String(now.getFullYear());
    const defaultMonth = String(now.getMonth() + 1).padStart(2, '0');

    const yearInput = window.prompt('Enter year to recalculate attendance (YYYY):', defaultYear);
    if (yearInput === null) return;
    const monthInput = window.prompt('Enter month to recalculate attendance (1-12):', defaultMonth);
    if (monthInput === null) return;

    const year = Number(yearInput);
    const month = Number(monthInput);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      alert('Invalid year. Please enter a valid year between 2000 and 2100.');
      return;
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      alert('Invalid month. Please enter a value between 1 and 12.');
      return;
    }

    if (!window.confirm(`Recalculate attendance for ${year}-${String(month).padStart(2, '0')} only?`)) return;

    try {
      setRecalculatingAttendance(true);
      const res = await recalculateAttendanceBalances({ year, month });
      alert(
        `Attendance recalculation completed for ${res?.year ?? year}-${String(res?.month ?? month).padStart(2, '0')}. ` +
          `Processed: ${res?.processed_users ?? 0}, ` +
          `Absent rows created: ${res?.absent_rows_created ?? 0}, ` +
          `Attendance rows updated: ${res?.attendance_rows_updated ?? 0}, ` +
          `LOP balances updated: ${res?.lop_balances_updated ?? 0}`
      );

      if (selectedStaff) {
        await reloadSelectedStaffData();
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to recalculate attendance');
    } finally {
      setRecalculatingAttendance(false);
    }
  };

  useEffect(() => {
    if (!selectedStaff) return;

    const run = async () => {
      setLoadingLateEntry(true);
      try {
        const lateData = await getLateEntryMonthlyByUser(selectedStaff.id, lateEntryMonth);
        setLateEntryStats(lateData || null);
      } catch (err: any) {
        alert(err?.response?.data?.error || 'Failed to load late entry monthly data');
      } finally {
        setLoadingLateEntry(false);
      }
    };

    run();
  }, [lateEntryMonth, selectedStaff?.id]);

  // ── Vacation Analytics ──────────────────────────────────────────────────────
  const loadVacationAnalytics = async (overrideMonth?: string) => {
    const m = overrideMonth || vaMonth;
    if (!m) { setVaError('Please select a month'); return; }
    setVaLoading(true);
    setVaError(null);
    try {
      const targetForms = [
        'Vacation Cancellation Form - SPL',
        'Vacation Application - SPL',
        'Vacation Application',
        'Vacation Cancellation Form'
      ];
      const [year, month] = m.split('-').map(Number);
      
      // Fetch requests and settings concurrently
      const [res, settingsData] = await Promise.all([
        apiClient.get(`${getApiBase()}/api/staff-requests/requests/vacation_analytics/`, {
          params: { year, month },
        }),
        getVacationSettings().catch(() => ({ slots: [], confirm_slots: [], semesters: [] }))
      ]);

      const allRows = res.data?.results || res.data?.rows || res.data || [];
      const filteredRows = allRows.filter((r: any) => {
        const tName = r.template?.name || r.template_name;
        return targetForms.includes(tName);
      });
      
      const semesters = settingsData.semesters || [];
      const slots = settingsData.slots || [];
      const confirmSlots = settingsData.confirm_slots || [];

      // Build quick lookups
      const semMap = new Map(semesters.map((s: any) => [s.id, s.name]));
      const slotMap = new Map();
      slots.forEach((s: any) => {
        slotMap.set(s.id, {
          name: s.slot_name,
          from: s.from_date,
          to: s.to_date,
          semester: semMap.get(s.semester_id) || '-'
        });
      });
      confirmSlots.forEach((s: any) => {
        slotMap.set(s.id, {
          name: s.slot_name || 'Compulsory Slot',
          from: s.from_date,
          to: s.to_date,
          semester: 'Compulsory'
        });
      });

      const rows = filteredRows.map((r: any) => {
        // applicant can be a nested object
        const app = typeof r.applicant === 'object' && r.applicant !== null ? r.applicant : {};
        const dept = typeof app.department === 'object' && app.department !== null ? app.department.name : (app.department || r.applicant_department || '-');
        
        let fd = r.form_data || {};
        if (typeof fd === 'string') {
          try { fd = JSON.parse(fd); } catch (e) { fd = {}; }
        }
        r.form_data = fd; // Keep parsed version for the modal view
        
        // Try to map slot_id or slot_ids
        let mappedSlotName = '-';
        let mappedDateRange = '-';
        let mappedSemester = '-';

        // It could be an array of slot_ids or a single slot_id, or comma-separated string
        let sIds: any[] = [];
        if (fd.slot_ids && Array.isArray(fd.slot_ids)) sIds = fd.slot_ids;
        else if (fd.slot_ids) sIds = String(fd.slot_ids).split(',');
        else if (fd.slot_id) sIds = [fd.slot_id];
        
        if (sIds.length > 0) {
          const slotInfos = sIds.map((id: any) => slotMap.get(Number(id))).filter(Boolean);
          if (slotInfos.length > 0) {
            mappedSlotName = slotInfos.map(s => s.name).join(', ');
            mappedDateRange = slotInfos.map(s => `${s.from} → ${s.to}`).join(' | ');
            mappedSemester = Array.from(new Set(slotInfos.map(s => s.semester))).join(', ');
          }
        }

        // Fallbacks to raw form data if slot map fails
        const fromD = fd.from_date || fd.start_date || fd.date;
        const toD = fd.to_date || fd.end_date || fd.date;

        if (mappedSlotName === '-') mappedSlotName = fd.slot_name || fd.slot || '-';
        if (mappedDateRange === '-') {
          mappedDateRange = fromD && toD && fromD !== toD
            ? `${fromD} → ${toD}`
            : (fromD || toD || '-');
        }
        if (mappedSemester === '-') mappedSemester = fd.semester || '-';

        return {
          ...r,
          staff_name: app.name || app.full_name || app.username || r.applicant_name || (typeof r.applicant === 'string' ? r.applicant : '-'),
          staff_id: app.staff_id || r.applicant_staff_id || (typeof r.applicant_id === 'string' || typeof r.applicant_id === 'number' ? r.applicant_id : '-'),
          department: dept,
          slot_name: mappedSlotName,
          slot_date_range: mappedDateRange,
          status: r.status || '-',
          applied_on: r.created_at ? r.created_at.slice(0, 10) : '-',
          semester: mappedSemester,
        };
      });
      setVaRows(rows);
      setVaDeptStaffCounts(res.data?.dept_staff_counts || {});
    } catch (err: any) {
      setVaError(err?.response?.data?.detail || err?.message || 'Failed to load vacation analytics');
    } finally {
      setVaLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {activeConfigTab === 'templates' ? 'Request Templates'
                  : activeConfigTab === 'vacation' ? 'Vacation Settings'
                  : 'Vacation Analytics'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {activeConfigTab === 'templates'
                  ? 'Create and manage dynamic forms for staff requests (Leaves, ODs, Permissions)'
                  : activeConfigTab === 'vacation'
                  ? 'Configure common vacation eligibility and slot windows for all staff'
                  : 'Monthly overview: which staff applied to which vacation slot and their request status'}
              </p>
            </div>
            {activeConfigTab === 'templates' ? (
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                Create Template
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveConfigTab('templates')}
              className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                activeConfigTab === 'templates'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Request Templates
            </button>
            <button
              onClick={() => { setActiveConfigTab('vacation'); }}
              className={`py-3 px-4 font-medium border-b-2 transition-colors ${
                activeConfigTab === 'vacation'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Vacation Settings
            </button>
            <button
              onClick={() => { setActiveConfigTab('vacation_analytics'); loadVacationAnalytics(); }}
              className={`py-3 px-4 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeConfigTab === 'vacation_analytics'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <BarChart2 size={16} />
              Vacation Analytics
            </button>
          </div>
        </div>

        {error && activeConfigTab === 'templates' && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="p-6">
          {activeConfigTab === 'templates' ? (
            templates.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="mb-4">No templates created yet.</p>
                <button
                  onClick={handleCreate}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Create your first template
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {template.name}
                          </h3>
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${
                              template.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {template.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {template.description || 'No description'}
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                          <div>
                            <span className="font-medium">Form Fields:</span> {template.form_schema?.length || 0}
                          </div>
                          <div>
                            <span className="font-medium">Approval Steps:</span> {template.total_steps || 0}
                          </div>
                          <div>
                            <span className="font-medium">Allowed Roles:</span>{' '}
                            {template.allowed_roles?.length > 0
                              ? template.allowed_roles.join(', ')
                              : 'All'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleToggleActive(template)}
                          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                          title={template.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {template.is_active ? (
                            <ToggleRight size={20} className="text-green-600" />
                          ) : (
                            <ToggleLeft size={20} />
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(template)}
                          className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit2 size={20} />
                        </button>
                        <button
                          onClick={() => handleDelete(template.id!)}
                          className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : activeConfigTab === 'vacation_analytics' ? (
            <VacationAnalyticsPanel
              vaMonth={vaMonth}
              setVaMonth={setVaMonth}
              vaDeptFilters={vaDeptFilters}
              setVaDeptFilters={setVaDeptFilters}
              vaStatusFilter={vaStatusFilter}
              setVaStatusFilter={setVaStatusFilter}
              vaSearch={vaSearch}
              setVaSearch={setVaSearch}
              vaRows={vaRows}
              vaLoading={vaLoading}
              vaError={vaError}
              onLoad={loadVacationAnalytics}
              vacationSemesters={vacationSemesters}
              vacationSlots={vacationSlots}
              vacationConfirmSlots={vacationConfirmSlots}
              vacationDepartments={vacationDepartments}
              vaDeptStaffCounts={vaDeptStaffCounts}
            />
          ) : vacationLoading ? (
            <div className="text-sm text-gray-600">Loading vacation settings...</div>
          ) : (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  These settings are shared for all staff vacation forms and do not vary per template.
                </p>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900">Eligibility Rules (By Experience)</h4>
                  <button
                    type="button"
                    onClick={() => setVacationRules(prev => ([...prev, { condition: '>=', min_years: 0, min_months: 0, entitled_days: 0, is_active: true }]))}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Add Rule
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide px-1">
                  <div className="col-span-2">Condition</div>
                  <div className="col-span-2">Years</div>
                  <div className="col-span-2">Months</div>
                  <div className="col-span-2">Vacation Days</div>
                  <div className="col-span-2">Notes</div>
                  <div className="col-span-2">Actions</div>
                </div>
                {vacationRules.map((rule, idx) => {
                  const rowEditing = !!editingRuleRows[idx];
                  return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center border rounded p-2">
                    {rowEditing ? (
                      <>
                        <select
                          value={rule.condition || '>='}
                          onChange={(e) => {
                            const v = e.target.value as VacationEntitlementRule['condition'];
                            setVacationRules(prev => prev.map((r, i) => i === idx ? { ...r, condition: v } : r));
                          }}
                          className="col-span-2 px-2 py-1.5 border border-gray-300 rounded"
                        >
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                          <option value="=">=</option>
                          <option value=">=">&gt;=</option>
                          <option value="<=">&lt;=</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={rule.min_years}
                          onChange={(e) => {
                            const v = parseInt(e.target.value || '0', 10);
                            setVacationRules(prev => prev.map((r, i) => i === idx ? { ...r, min_years: Number.isNaN(v) ? 0 : v } : r));
                          }}
                          className="col-span-2 px-2 py-1.5 border border-gray-300 rounded"
                        />
                        <input
                          type="number"
                          min={0}
                          max={11}
                          value={rule.min_months}
                          onChange={(e) => {
                            const v = parseInt(e.target.value || '0', 10);
                            setVacationRules(prev => prev.map((r, i) => i === idx ? { ...r, min_months: Number.isNaN(v) ? 0 : Math.min(11, Math.max(0, v)) } : r));
                          }}
                          className="col-span-2 px-2 py-1.5 border border-gray-300 rounded"
                        />
                        <input
                          type="number"
                          min={0}
                          value={rule.entitled_days}
                          onChange={(e) => {
                            const v = parseInt(e.target.value || '0', 10);
                            setVacationRules(prev => prev.map((r, i) => i === idx ? { ...r, entitled_days: Number.isNaN(v) ? 0 : v } : r));
                          }}
                          className="col-span-2 px-2 py-1.5 border border-gray-300 rounded"
                        />
                        <input
                          type="text"
                          value={rule.notes || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setVacationRules(prev => prev.map((r, i) => i === idx ? { ...r, notes: v } : r));
                          }}
                          className="col-span-2 px-2 py-1.5 border border-gray-300 rounded"
                          placeholder="Optional"
                        />
                        <div className="col-span-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveRuleRow(idx)}
                            className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setVacationRules(prev => prev.filter((_, i) => i !== idx))}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-2 text-sm text-gray-800">{rule.condition || '>='}</div>
                        <div className="col-span-2 text-sm text-gray-800">{rule.min_years}</div>
                        <div className="col-span-2 text-sm text-gray-800">{rule.min_months}</div>
                        <div className="col-span-2 text-sm text-gray-800">{rule.entitled_days}</div>
                        <div className="col-span-2 text-sm text-gray-600 truncate" title={rule.notes || ''}>{rule.notes || '-'}</div>
                        <div className="col-span-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startRuleEdit(idx)}
                            className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setVacationRules(prev => prev.filter((_, i) => i !== idx))}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )})}
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900">Vacation Semesters & Slots</h4>
                  <button
                    type="button"
                    onClick={() => setShowCreateSemester(prev => !prev)}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    {showCreateSemester ? 'Close' : 'Create Semester'}
                  </button>
                </div>
                {showCreateSemester && (
                  <div className="border rounded-md p-3 bg-gray-50 grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <label className="block text-xs text-gray-600 mb-1">Semester Name</label>
                      <input
                        type="text"
                        value={newSemesterName}
                        onChange={(e) => setNewSemesterName(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded"
                        placeholder="Sem 1"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-600 mb-1">Semester From</label>
                      <input
                        type="date"
                        value={newSemesterFrom}
                        onChange={(e) => setNewSemesterFrom(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-600 mb-1">Semester To</label>
                      <input
                        type="date"
                        value={newSemesterTo}
                        onChange={(e) => setNewSemesterTo(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded"
                      />
                    </div>
                    <div className="col-span-2">
                      <button
                        type="button"
                        onClick={handleCreateSemester}
                        className="w-full px-2 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                )}

                {vacationSemesters.length === 0 ? (
                  <div className="text-sm text-gray-500">No semesters configured yet. Click Create Semester first.</div>
                ) : (
                  <div className="space-y-3">
                    {vacationSemesters.map((sem) => {
                      const isExpanded = expandedSemesterName === sem.name;
                      const semSlots = vacationSlots
                        .map((slot, idx) => ({ slot, idx }))
                        .filter(({ slot }) => (slot.semester || '').toLowerCase() === (sem.name || '').toLowerCase());
                      const semConfirmSlots = vacationConfirmSlots
                        .map((slot, idx) => ({ slot, idx }))
                        .filter(({ slot }) => (slot.semester || '').toLowerCase() === (sem.name || '').toLowerCase());

                      return (
                        <div key={sem.name} className="border rounded-lg">
                          <button
                            type="button"
                            onClick={() => setExpandedSemesterName(isExpanded ? null : sem.name)}
                            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50"
                          >
                            <div>
                              <div className="font-semibold text-gray-900">{sem.name}</div>
                              <div className="text-xs text-gray-600">{sem.from_date} to {sem.to_date}</div>
                            </div>
                            <span className="text-xs text-gray-500">{isExpanded ? 'Hide Slots' : 'Manage Slots'}</span>
                          </button>

                          {isExpanded && (
                            <div className="border-t p-3 space-y-2">
                              <div className="flex justify-end">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleAddSlotForSemester(sem.name)}
                                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                  >
                                    Add Slot in {sem.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAddConfirmSlotForSemester(sem.name)}
                                    className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                  >
                                    Add Compulsory Slot
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide px-1">
                                <div className="col-span-4">Slot Name</div>
                                <div className="col-span-3">Slot From</div>
                                <div className="col-span-3">Slot To</div>
                                <div className="col-span-2">Actions</div>
                              </div>

                              {semSlots.length === 0 ? (
                                <div className="text-sm text-gray-500 px-1">No slots created under this semester.</div>
                              ) : semSlots.map(({ slot, idx }) => {
                                const rowEditing = !!editingSlotRows[idx];
                                return (
                                  <div key={`${sem.name}-${idx}`} className="grid grid-cols-12 gap-2 items-center border rounded p-2">
                                    {rowEditing ? (
                                      <>
                                        <input
                                          type="text"
                                          value={slot.slot_name || ''}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setVacationSlots(prev => prev.map((s, i) => i === idx ? { ...s, slot_name: v } : s));
                                          }}
                                          className="col-span-4 px-2 py-1.5 border border-gray-300 rounded"
                                          placeholder="Slot 1"
                                        />
                                        <input
                                          type="date"
                                          value={slot.from_date || ''}
                                          min={sem.from_date}
                                          max={sem.to_date}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setVacationSlots(prev => prev.map((s, i) => i === idx ? { ...s, from_date: v } : s));
                                          }}
                                          className="col-span-3 px-2 py-1.5 border border-gray-300 rounded"
                                        />
                                        <input
                                          type="date"
                                          value={slot.to_date || ''}
                                          min={sem.from_date}
                                          max={sem.to_date}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setVacationSlots(prev => prev.map((s, i) => i === idx ? { ...s, to_date: v } : s));
                                          }}
                                          className="col-span-3 px-2 py-1.5 border border-gray-300 rounded"
                                        />
                                        <div className="col-span-2 flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => saveSlotRow(idx)}
                                            className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                                          >
                                            Save
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setVacationSlots(prev => prev.filter((_, i) => i !== idx))}
                                            className="text-xs text-red-600 hover:text-red-700"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="col-span-4 text-sm text-gray-800">{slot.slot_name || '-'}</div>
                                        <div className="col-span-3 text-sm text-gray-800">{slot.from_date || '-'}</div>
                                        <div className="col-span-3 text-sm text-gray-800">{slot.to_date || '-'}</div>
                                        <div className="col-span-2 flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => startSlotEdit(idx)}
                                            className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setVacationSlots(prev => prev.filter((_, i) => i !== idx))}
                                            className="text-xs text-red-600 hover:text-red-700"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })}

                              <div className="pt-2 mt-2 border-t border-dashed">
                                <div className="text-sm font-semibold text-gray-800 mb-2">Compulsory Slots (Auto Vacation by Department)</div>
                                <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide px-1">
                                  <div className="col-span-2">Compulsory Slot</div>
                                  <div className="col-span-2">Slot From</div>
                                  <div className="col-span-2">Slot To</div>
                                  <div className="col-span-5">Departments</div>
                                  <div className="col-span-1">Actions</div>
                                </div>

                                {semConfirmSlots.length === 0 ? (
                                  <div className="text-sm text-gray-500 px-1">No confirm slots under this semester.</div>
                                ) : semConfirmSlots.map(({ slot, idx }) => {
                                  const rowEditing = !!editingConfirmRows[idx];
                                  return (
                                    <div key={`${sem.name}-confirm-${idx}`} className="grid grid-cols-12 gap-2 items-start border rounded p-2 mt-2">
                                      {rowEditing ? (
                                        <>
                                          <input
                                            type="text"
                                            value={slot.slot_name || ''}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              setVacationConfirmSlots(prev => prev.map((s, i) => i === idx ? { ...s, slot_name: v } : s));
                                            }}
                                            className="col-span-2 px-2 py-1.5 border border-gray-300 rounded"
                                            placeholder="Compulsory Slot"
                                          />
                                          <input
                                            type="date"
                                            value={slot.from_date || ''}
                                            min={sem.from_date}
                                            max={sem.to_date}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              setVacationConfirmSlots(prev => prev.map((s, i) => i === idx ? { ...s, from_date: v } : s));
                                            }}
                                            className="col-span-2 px-2 py-1.5 border border-gray-300 rounded"
                                          />
                                          <input
                                            type="date"
                                            value={slot.to_date || ''}
                                            min={sem.from_date}
                                            max={sem.to_date}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              setVacationConfirmSlots(prev => prev.map((s, i) => i === idx ? { ...s, to_date: v } : s));
                                            }}
                                            className="col-span-2 px-2 py-1.5 border border-gray-300 rounded"
                                          />
                                          <div className="col-span-5 border border-gray-200 rounded p-2 max-h-28 overflow-y-auto">
                                            <div className="grid grid-cols-2 gap-1">
                                              {vacationDepartments.map((dept) => {
                                                const did = Number(dept.id);
                                                const checked = (slot.department_ids || []).includes(did);
                                                return (
                                                  <label key={`${idx}-${did}`} className="text-xs text-gray-700 flex items-center gap-1">
                                                    <input
                                                      type="checkbox"
                                                      checked={checked}
                                                      onChange={(e) => {
                                                        setVacationConfirmSlots(prev => prev.map((s, i) => {
                                                          if (i !== idx) return s;
                                                          const existing = Array.isArray(s.department_ids) ? [...s.department_ids] : [];
                                                          const next = e.target.checked
                                                            ? Array.from(new Set([...existing, did]))
                                                            : existing.filter(x => x !== did);
                                                          return { ...s, department_ids: next };
                                                        }));
                                                      }}
                                                    />
                                                    <span>{dept.short_name || dept.code || dept.name}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                          <div className="col-span-1 flex items-center justify-end gap-1">
                                            <button
                                              type="button"
                                              onClick={() => saveConfirmRow(idx)}
                                              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                            >
                                              Save
                                            </button>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="col-span-2 text-sm text-gray-900">{slot.slot_name || 'Compulsory Slot'}</div>
                                          <div className="col-span-2 text-sm text-gray-700">{slot.from_date || '-'}</div>
                                          <div className="col-span-2 text-sm text-gray-700">{slot.to_date || '-'}</div>
                                          <div className="col-span-5 text-xs text-gray-700">
                                            {(slot.department_ids || []).length === 0
                                              ? 'No departments selected'
                                              : (slot.department_ids || [])
                                                .map((did) => {
                                                  const dept = vacationDepartments.find(d => Number(d.id) === Number(did));
                                                  return dept ? (dept.short_name || dept.code || dept.name || String(did)) : String(did);
                                                })
                                                .join(', ')}
                                          </div>
                                          <div className="col-span-1 flex items-center justify-end gap-1">
                                            <button
                                              type="button"
                                              onClick={() => startConfirmEdit(idx)}
                                              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                            >
                                              Edit
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Semester is declared once. Then add all slot ranges inside the expanded semester section.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Staff Leave Balance Editor</h3>
              <p className="text-sm text-gray-600 mt-1">
                HR can search staff and edit balances directly (CL, OD, COL, LOP, Others, etc.)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRecalculateAttendance}
                disabled={recalculatingAttendance}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <RefreshCw size={16} className={recalculatingAttendance ? 'animate-spin' : ''} />
                {recalculatingAttendance ? 'Recalculating...' : 'Recalculate attendance'}
              </button>
              <button
                type="button"
                onClick={handleRecalculateLop}
                disabled={recalculatingLop}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
              >
                <RefreshCw size={16} className={recalculatingLop ? 'animate-spin' : ''} />
                {recalculatingLop ? 'Recalculating...' : 'Recalculate LOP'}
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <input
              value={staffQuery}
              onChange={(e) => setStaffQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearchStaff();
              }}
              placeholder="Search by name, username, or staff ID"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <button
              type="button"
              onClick={handleSearchStaff}
              disabled={searchingStaff}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Search size={16} />
              {searchingStaff ? 'Searching...' : 'Search'}
            </button>
          </div>

          {staffResults.length > 0 && (
            <div className="border rounded-md max-h-56 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Staff</th>
                    <th className="px-3 py-2 text-left">Username</th>
                    <th className="px-3 py-2 text-left">Staff ID</th>
                    <th className="px-3 py-2 text-left">Department</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {staffResults.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">{s.full_name || s.username}</td>
                      <td className="px-3 py-2">{s.username}</td>
                      <td className="px-3 py-2">{s.staff_id || '-'}</td>
                      <td className="px-3 py-2">{s.department?.code || '-'}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleSelectStaff(s)}
                          className="px-2 py-1 text-xs rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          Edit Balances
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedStaff && (
            <div className="border rounded-md p-4 bg-gray-50">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                Editing balances for {selectedStaff.full_name || selectedStaff.username} ({selectedStaff.username})
              </p>

              {loadingBalances ? (
                <p className="text-sm text-gray-500">Loading balances...</p>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm bg-white border rounded-md">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Leave Type</th>
                        <th className="px-3 py-2 text-left">Current</th>
                        <th className="px-3 py-2 text-left">New Value</th>
                        <th className="px-3 py-2 text-left">Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStaffBalances.map((b) => {
                        const saveKey = `${selectedStaff.id}:${b.leave_type}`;
                        return (
                          <tr key={b.leave_type} className="border-t">
                            <td className="px-3 py-2 font-medium">{b.leave_type}</td>
                            <td className="px-3 py-2">{b.balance}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.5"
                                value={balanceEdits[b.leave_type] ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setBalanceEdits((prev) => ({ ...prev, [b.leave_type]: v }));
                                }}
                                className="w-32 px-2 py-1 border border-gray-300 rounded-md"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => handleSaveBalance(b.leave_type)}
                                disabled={savingBalanceKey === saveKey}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                              >
                                <Save size={14} />
                                {savingBalanceKey === saveKey ? 'Saving...' : 'Save'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-6 border rounded-md bg-white">
                <div className="px-4 py-3 border-b bg-amber-50 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Late Entry Count Editor (Monthly)</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Counts are derived from approved Late Entry forms. Delete a record to rollback attendance to absent and recalculate counts.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-700" htmlFor="lateEntryMonth">
                      Month
                    </label>
                    <input
                      id="lateEntryMonth"
                      type="month"
                      value={lateEntryMonth}
                      onChange={(e) => setLateEntryMonth(e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>

                <div className="p-4">
                  {loadingLateEntry ? (
                    <p className="text-sm text-gray-500">Loading late entry data...</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div className="rounded-md border bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">10 mins</div>
                          <div className="text-xl font-bold text-gray-900">{lateEntryStats?.ten_mins ?? 0}</div>
                        </div>
                        <div className="rounded-md border bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">1 hr</div>
                          <div className="text-xl font-bold text-gray-900">{lateEntryStats?.one_hr ?? 0}</div>
                        </div>
                        <div className="rounded-md border bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">Total</div>
                          <div className="text-xl font-bold text-gray-900">{lateEntryStats?.total ?? 0}</div>
                        </div>
                      </div>

                      <div className="overflow-auto border rounded-md">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left">Date</th>
                              <th className="px-3 py-2 text-left">Shift</th>
                              <th className="px-3 py-2 text-left">Duration</th>
                              <th className="px-3 py-2 text-left">Template</th>
                              <th className="px-3 py-2 text-left">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(lateEntryStats?.records || []).length === 0 ? (
                              <tr>
                                <td className="px-3 py-4 text-gray-500" colSpan={5}>
                                  No approved late entry records found for this month.
                                </td>
                              </tr>
                            ) : (
                              (lateEntryStats?.records || []).map((row: any) => (
                                <tr key={`${row.request_id}:${row.date}:${row.shift}`} className="border-t">
                                  <td className="px-3 py-2">{row.date}</td>
                                  <td className="px-3 py-2">{row.shift || 'FULL'}</td>
                                  <td className="px-3 py-2">{row.late_duration}</td>
                                  <td className="px-3 py-2">{row.template_name}</td>
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteLateRecord(row.request_id)}
                                      disabled={deletingLateRequestId === row.request_id}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                                    >
                                      <Trash2 size={14} />
                                      {deletingLateRequestId === row.request_id ? 'Deleting...' : 'Delete'}
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template Editor Modal */}
      {showEditor && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => {
            setShowEditor(false);
            setEditingTemplate(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ── Vacation Analytics Panel ──────────────────────────────────────────────────
interface VacationAnalyticsPanelProps {
  vaMonth: string;
  setVaMonth: (m: string) => void;
  vaDeptFilters: string[];
  setVaDeptFilters: (d: string[]) => void;
  vaStatusFilter: string;
  setVaStatusFilter: (s: string) => void;
  vaSearch: string;
  setVaSearch: (s: string) => void;
  vaRows: any[];
  vaLoading: boolean;
  vaError: string | null;
  onLoad: (month?: string) => void;
  vacationSemesters: VacationSemester[];
  vacationSlots: VacationSlot[];
  vacationConfirmSlots: VacationConfirmSlot[];
  vacationDepartments: any[];
  vaDeptStaffCounts: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 border-green-200',
  pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

function VacationAnalyticsPanel({
  vaMonth, setVaMonth,
  vaDeptFilters, setVaDeptFilters,
  vaStatusFilter, setVaStatusFilter,
  vaSearch, setVaSearch,
  vaRows, vaLoading, vaError, onLoad,
  vacationSemesters,
  vacationSlots,
  vacationConfirmSlots,
  vacationDepartments,
  vaDeptStaffCounts,
}: VacationAnalyticsPanelProps) {
  const [selectedForm, setSelectedForm] = useState<any>(null);

  // Active Semester Calculations
  const activeSemester = React.useMemo(() => {
    return vacationSemesters.find(sem => sem.is_active);
  }, [vacationSemesters]);

  const semSlots = React.useMemo(() => {
    if (!activeSemester) return [];
    return vacationSlots.filter(s => (s.semester || '').toLowerCase() === (activeSemester.name || '').toLowerCase());
  }, [vacationSlots, activeSemester]);

  const semConfirmSlots = React.useMemo(() => {
    if (!activeSemester) return [];
    return vacationConfirmSlots.filter(s => (s.semester || '').toLowerCase() === (activeSemester.name || '').toLowerCase());
  }, [vacationConfirmSlots, activeSemester]);

  // Export handlers
  const downloadExcel = () => {
    // 1. Department Summary Sheet
    const summaryData = deptBreakdown.map(d => ({
      'Department': d.dept,
      'Total Applications': d.total,
      'Slot Name': d.slotsList,
      'Approved': d.approved,
      'Pending': d.pending,
      'Rejected': d.rejected,
      'Approval Rate': d.total ? `${Math.round((d.approved / d.total) * 100)}%` : '0%'
    }));
    
    // 2. Staff Applications Sheet
    const appsData = filtered.map((r) => ({
      'Staff Name': r.staff_name,
      'Staff ID': r.staff_id,
      'Department': r.department,
      'Slot Name': r.slot_name,
      'Semester': r.semester,
      'Applied On': r.applied_on,
      'Status': r.status,
    }));
    
    const wb = (XLSX as any).utils.book_new();
    
    const wsSummary = (XLSX as any).utils.json_to_sheet(summaryData);
    (XLSX as any).utils.book_append_sheet(wb, wsSummary, 'Department Summary');
    
    const wsApps = (XLSX as any).utils.json_to_sheet(appsData);
    (XLSX as any).utils.book_append_sheet(wb, wsApps, 'Staff Applications');
    
    (XLSX as any).writeFile(wb, `vacation_analytics_${vaMonth}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    // Title
    doc.setFontSize(16);
    doc.setTextColor(31, 41, 55);
    doc.text(`Vacation Analytics Report - ${vaMonth}`, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Exported: ${new Date().toLocaleDateString()}`, 14, 21);

    // Section 1: Department Summary Table
    doc.setFontSize(12);
    doc.setTextColor(55, 65, 81);
    doc.text(`1. Department-wise Summary`, 14, 30);

    const summaryHeaders = [['Department', 'Total', 'Slot Name', 'Approved', 'Pending', 'Rejected', 'Approval %']];
    const summaryBody = deptBreakdown.map(d => [
      d.dept,
      d.total,
      d.slotsList,
      d.approved,
      d.pending,
      d.rejected,
      d.total ? `${Math.round((d.approved / d.total) * 100)}%` : '-'
    ]);

    autoTable(doc, {
      head: summaryHeaders,
      body: summaryBody,
      startY: 34,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] }, // Indigo matching UI
      styles: { fontSize: 8, cellPadding: 2.5 },
    });

    const firstTableBottom = (doc as any).lastAutoTable?.finalY ?? 100;

    // Section 2: Staff Applications Table
    doc.setFontSize(12);
    doc.setTextColor(55, 65, 81);
    doc.text(`2. Staff Vacation Applications`, 14, firstTableBottom + 12);

    const appsHeaders = [['Staff', 'Department', 'Slot / Semester', 'Applied On', 'Status']];
    const appsBody = filtered.map(r => [
      `${r.staff_name}\n(${r.staff_id})`,
      r.department,
      `${r.slot_name}${r.semester && r.semester !== '-' ? `\n${r.semester}` : ''}`,
      r.applied_on,
      r.status.toUpperCase()
    ]);

    autoTable(doc, {
      head: appsHeaders,
      body: appsBody,
      startY: firstTableBottom + 16,
      theme: 'striped',
      headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255] }, // Purple matching UI
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 40 },
        2: { cellWidth: 45 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 }
      }
    });

    doc.save(`vacation_analytics_${vaMonth}.pdf`);
  };

  // Derived dept list from rows
  const depts = React.useMemo(() => {
    const s = new Set<string>();
    vaRows.forEach(r => r.department && s.add(r.department));
    return Array.from(s).sort();
  }, [vaRows]);

  // Filtered rows
  const filtered = React.useMemo(() => {
    return vaRows.filter(r => {
      if (vaDeptFilters.length > 0 && !vaDeptFilters.includes(r.department)) return false;
      if (vaStatusFilter && (r.status || '').toLowerCase() !== vaStatusFilter.toLowerCase()) return false;
      if (vaSearch) {
        const q = vaSearch.toLowerCase();
        return (
          String(r.staff_name || '').toLowerCase().includes(q) ||
          String(r.staff_id || '').toLowerCase().includes(q) ||
          String(r.department || '').toLowerCase().includes(q) ||
          String(r.slot_name || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [vaRows, vaDeptFilters, vaStatusFilter, vaSearch]);

  // Summary counts
  const total = filtered.length;
  const approved = filtered.filter(r => (r.status || '').toLowerCase() === 'approved').length;
  const pending  = filtered.filter(r => (r.status || '').toLowerCase() === 'pending').length;
  const rejected = filtered.filter(r => (r.status || '').toLowerCase() === 'rejected').length;

  // Dept-wise breakdown
  const deptBreakdown = React.useMemo(() => {
    const map: Record<string, { dept: string; total: number; approved: number; pending: number; rejected: number; slots: Set<string>; approvedStaff: Set<string> }> = {};
    filtered.forEach(r => {
      const d = r.department || 'N/A';
      if (!map[d]) {
        map[d] = {
          dept: d,
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          slots: new Set<string>(),
          approvedStaff: new Set<string>()
        };
      }
      map[d].total++;
      if (r.slot_name && r.slot_name !== '-') {
        map[d].slots.add(r.slot_name);
      }
      const st = (r.status || '').toLowerCase();
      if (st === 'approved') {
        map[d].approved++;
        if (r.staff_id && r.staff_id !== '-') {
          map[d].approvedStaff.add(r.staff_id);
        }
      }
      else if (st === 'pending') map[d].pending++;
      else if (st === 'rejected') map[d].rejected++;
    });
    return Object.values(map).map(item => {
      const totalStaff = vaDeptStaffCounts[item.dept] || 0;
      const approvedUnique = item.approvedStaff.size;
      const rate = totalStaff > 0
        ? Math.round((approvedUnique / totalStaff) * 100)
        : (item.total ? Math.round((item.approved / item.total) * 100) : 0);
        
      return {
        ...item,
        slotsList: Array.from(item.slots).join(', ') || '-',
        rate,
        totalStaff
      };
    }).sort((a, b) => b.total - a.total);
  }, [filtered, vaDeptStaffCounts]);

  return (
    <div className="space-y-6">
      {/* Active Semester Details Display Box */}
      {activeSemester ? (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-purple-100 text-purple-800 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Current Semester</span>
            <h3 className="text-base font-bold text-gray-800">{activeSemester.name}</h3>
            <span className="text-xs text-gray-500">({activeSemester.from_date} to {activeSemester.to_date})</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Regular Slots */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Vacation Slots</h4>
              {semSlots.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No regular slots configured</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {semSlots.map((s, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm text-xs flex flex-col">
                      <span className="font-semibold text-gray-800">{s.slot_name}</span>
                      <span className="text-gray-500 text-[10px] mt-0.5">{s.from_date} to {s.to_date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Compulsory Slots */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Compulsory Slots (Auto Vacation by Department)</h4>
              {semConfirmSlots.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No compulsory slots configured</p>
              ) : (
                <div className="space-y-2">
                  {semConfirmSlots.map((s, idx) => {
                    const deptNames = (s.department_ids || []).map((did: any) => {
                      const dept = vacationDepartments.find(d => Number(d.id) === Number(did));
                      return dept ? dept.name : `Dept #${did}`;
                    }).join(', ');
                    
                    return (
                      <div key={idx} className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm text-xs flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-800">{s.slot_name || 'Compulsory Slot'}</span>
                          <span className="text-gray-500 text-[10px]">{s.from_date} to {s.to_date}</span>
                        </div>
                        {deptNames && (
                          <div className="text-[10px] text-gray-500 border-t pt-1 mt-1 truncate" title={deptNames}>
                            <strong>Departments:</strong> {deptNames}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center text-sm text-gray-500">
          No active semester configured. Define an active semester in the <span className="font-semibold text-purple-600">Vacation Settings</span> tab.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Month</label>
          <input
            type="month"
            value={vaMonth}
            onChange={e => setVaMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Department</label>
          <div className="relative group min-w-[160px]">
            <div className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white cursor-pointer hover:border-gray-400 h-[38px] flex items-center">
              <span className="text-gray-600 block truncate">
                {vaDeptFilters.length === 0 ? 'All Departments' : `${vaDeptFilters.length} selected`}
              </span>
            </div>
            <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 hidden group-hover:block max-h-60 overflow-y-auto p-2">
              <label className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer border-b border-gray-100 mb-1">
                <input
                  type="checkbox"
                  checked={vaDeptFilters.length === 0}
                  onChange={() => setVaDeptFilters([])}
                  className="rounded border-gray-300 text-purple-500 focus:ring-purple-400"
                />
                <span className="text-sm font-medium text-gray-700">Clear All</span>
              </label>
              {depts.map((d) => (
                <label key={d} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vaDeptFilters.includes(d)}
                    onChange={(e) => {
                      if (e.target.checked) setVaDeptFilters([...vaDeptFilters, d]);
                      else setVaDeptFilters(vaDeptFilters.filter(x => x !== d));
                    }}
                    className="rounded border-gray-300 text-purple-500 focus:ring-purple-400"
                  />
                  <span className="text-sm text-gray-700">{d}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Status</label>
          <select
            value={vaStatusFilter}
            onChange={e => setVaStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-600">Search</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Name / Staff ID / Department..."
              value={vaSearch}
              onChange={e => setVaSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onLoad(vaMonth)}
            disabled={vaLoading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            <RefreshCw size={14} className={vaLoading ? 'animate-spin' : ''} />
            {vaLoading ? 'Loading…' : 'Load Data'}
          </button>
          {filtered.length > 0 && (
            <>
              <button
                onClick={downloadExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
              >
                <Download size={14} />
                Excel
              </button>
              <button
                onClick={downloadPDF}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
              >
                <Download size={14} />
                PDF
              </button>
            </>
          )}
        </div>
      </div>

      {vaError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{vaError}</div>
      )}

      {vaRows.length === 0 && !vaLoading && !vaError ? (
        <div className="text-center py-16 text-gray-400">
          <BarChart2 size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a month and click <span className="font-medium text-purple-600">Load Data</span></p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Applications', value: total, color: 'bg-purple-50 text-purple-700 border-purple-200' },
              { label: 'Approved', value: approved, color: 'bg-green-50 text-green-700 border-green-200' },
              { label: 'Pending', value: pending, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
              { label: 'Rejected', value: rejected, color: 'bg-red-50 text-red-700 border-red-200' },
            ].map(c => (
              <div key={c.label} className={`rounded-lg border p-4 ${c.color}`}>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs mt-0.5 opacity-80">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Dept-wise breakdown */}
          {deptBreakdown.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Department-wise Summary</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
                      <th className="text-left px-4 py-2">Department</th>
                      <th className="text-right px-4 py-2">Total</th>
                      <th className="text-left px-4 py-2">Slot Name</th>
                      <th className="text-right px-4 py-2 text-green-700">Approved</th>
                      <th className="text-right px-4 py-2 text-yellow-700">Pending</th>
                      <th className="text-right px-4 py-2 text-red-700">Rejected</th>
                      <th className="text-right px-4 py-2 text-gray-500">Approval %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptBreakdown.map(d => (
                      <tr key={d.dept} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-900">{d.dept}</td>
                        <td className="px-4 py-2 text-right font-semibold">{d.total}</td>
                        <td className="px-4 py-2 text-left text-gray-600">{d.slotsList}</td>
                        <td className="px-4 py-2 text-right text-green-700 font-medium">{d.approved}</td>
                        <td className="px-4 py-2 text-right text-yellow-700 font-medium">{d.pending}</td>
                        <td className="px-4 py-2 text-right text-red-700 font-medium">{d.rejected}</td>
                        <td className="px-4 py-2 text-right text-gray-500">
                          {d.rate !== undefined ? `${d.rate}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Employee-wise table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                Staff Vacation Applications ({filtered.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                    <th className="text-left px-4 py-2">Staff</th>
                    <th className="text-left px-4 py-2">Department</th>
                    <th className="text-left px-4 py-2">Slot / Semester</th>
                    <th className="text-left px-4 py-2">Applied On</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">No records match the filters</td></tr>
                  ) : filtered.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">{r.staff_name}</div>
                        <div className="text-xs text-gray-500">{r.staff_id}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{r.department}</td>
                      <td className="px-4 py-2">
                        <div className="text-gray-900">{r.slot_name}</div>
                        {r.semester && r.semester !== '-' && (
                          <div className="text-xs text-gray-500">{r.semester}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{r.applied_on}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_COLORS[(r.status || '').toLowerCase()] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {r.status || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => setSelectedForm(r)}
                          className="px-3 py-1 bg-white border border-gray-200 rounded text-xs font-medium hover:bg-gray-50 text-purple-600 transition-colors shadow-sm"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white rounded-t-lg">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedForm.template_name || 'Request Form'}</h3>
                <p className="text-sm text-gray-500">Applicant: {selectedForm.staff_name} ({selectedForm.staff_id})</p>
              </div>
              <button
                onClick={() => setSelectedForm(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Form Fields</h4>
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                  {Object.entries(selectedForm.form_data || {}).map(([key, value]) => {
                    if (value === null || value === undefined) return null;
                    
                    const label = key
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, c => c.toUpperCase());
                      
                    let formattedValue = '';
                    if (Array.isArray(value)) {
                      formattedValue = value.map(v => String(v)).join(', ');
                    } else if (typeof value === 'boolean') {
                      formattedValue = value ? 'Yes' : 'No';
                    } else {
                      formattedValue = String(value);
                    }
                    
                    return (
                      <div key={key} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm hover:bg-gray-100/50 transition-colors">
                        <span className="font-semibold text-gray-500 col-span-1">
                          {label}
                        </span>
                        <span className="text-gray-800 col-span-2 break-words font-medium">
                          {formattedValue || '-'}
                        </span>
                      </div>
                    );
                  })}
                  {(!selectedForm.form_data || Object.keys(selectedForm.form_data).length === 0) && (
                    <div className="p-4 text-center text-gray-400 italic">No details submitted.</div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm mt-6">
                <div>
                  <span className="text-gray-500 block">Status</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize mt-1 ${STATUS_COLORS[(selectedForm.status || '').toLowerCase()] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                    {selectedForm.status || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Applied On</span>
                  <span className="font-medium text-gray-900 mt-1 block">{selectedForm.applied_on}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
