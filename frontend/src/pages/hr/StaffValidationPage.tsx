import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, UserCheck, X, Search } from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';
import { getApiBase } from '../../services/apiBase';
import {
  getStaffValidationOverview,
  getStaffValidationCalendar,
  getHrTemplatesForStaff,
  hrApplyRequest,
} from '../../services/staffRequests';
import type { RequestTemplate } from '../../types/staffRequests';
import DynamicFormRenderer from '../staff-requests/DynamicFormRenderer';

type StaffValidationRow = {
  s_no: number;
  staff_user_id: number;
  staff_id: string;
  staff_name: string;
  department: { id: number | null; name: string };
  present_days: number;
  absent_days: number;
  balances: {
    lop: number;
    cl: number;
    col: number;
    od: number;
    others: number;
    late_entry_permission: number;
  };
};

type CalendarRecord = {
  date: string;
  status: string | null;
  fn_status: string | null;
  an_status: string | null;
  morning_in: string | null;
  evening_out: string | null;
};

function statusPill(status?: string | null) {
  const token = String(status || '').toLowerCase();
  if (token === 'present') return 'bg-green-100 text-green-700';
  if (token === 'absent') return 'bg-red-100 text-red-700';
  if (token === 'partial' || token === 'half_day') return 'bg-amber-100 text-amber-700';
  if (token) return 'bg-indigo-100 text-indigo-700';
  return 'bg-slate-100 text-slate-500';
}

function HrApplyModal({
  open,
  onClose,
  row,
  fromDate,
  toDate,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  row: StaffValidationRow | null;
  fromDate: string;
  toDate: string;
  onApplied: () => void;
}) {
  const [calendarRows, setCalendarRows] = useState<CalendarRecord[]>([]);
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<RequestTemplate | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(fromDate);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setSelectedDate(fromDate);
  }, [open, row, fromDate]);

  useEffect(() => {
    if (!open || !row) return;

    const loadCalendar = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getStaffValidationCalendar({
          staff_user_id: row.staff_user_id,
          from_date: fromDate,
          to_date: toDate,
        });
        setCalendarRows(data.records || []);
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to load staff calendar');
      } finally {
        setLoading(false);
      }
    };

    loadCalendar();
  }, [open, row, fromDate, toDate]);

  useEffect(() => {
    if (!open || !row || !selectedDate) return;

    const loadTemplates = async () => {
      try {
        setError(null);
        const data = await getHrTemplatesForStaff({
          staff_user_id: row.staff_user_id,
          date: selectedDate,
        });
        setTemplates(data.templates || []);
        setSelectedTemplate(null);
        setFormData({});
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to load templates');
      }
    };

    loadTemplates();
  }, [open, row, selectedDate]);

  const handleTemplatePick = (template: RequestTemplate) => {
    setSelectedTemplate(template);
    const initialData: Record<string, any> = {};
    
    // Set first text field to '-' by default
    let firstTextFieldSet = false;
    
    template.form_schema.forEach((field) => {
      if (field.type === 'date' && (field.name === 'from_date' || field.name === 'date' || field.name === 'start_date')) {
        initialData[field.name] = selectedDate;
      } else if (!firstTextFieldSet && (field.type === 'text' || field.type === 'number' || field.type === 'textarea')) {
        initialData[field.name] = '-';
        firstTextFieldSet = true;
      }
    });
    setFormData(initialData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!row || !selectedTemplate?.id) return;

    const missing = selectedTemplate.form_schema
      .filter((f) => f.required && !formData[f.name])
      .map((f) => f.label);
    if (missing.length > 0) {
      setError(`Please fill required fields: ${missing.join(', ')}`);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await hrApplyRequest({
        staff_user_id: row.staff_user_id,
        template_id: selectedTemplate.id,
        form_data: formData,
      });
      onApplied();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to apply request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !row) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Apply For {row.staff_name}</h2>
            <p className="text-sm text-slate-500">{row.staff_id} • {row.department.name} • {fromDate} to {toDate}</p>
          </div>
          <button className="text-slate-500 hover:text-slate-800" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-y-auto">
          <div className="p-6 border-r">
            <h3 className="font-semibold text-slate-900 mb-3">Calendar (Range View)</h3>
            {loading ? (
              <div className="text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
            ) : (
              <div className="max-h-[60vh] overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">FN</th>
                      <th className="text-left px-3 py-2">AN</th>
                      <th className="text-left px-3 py-2">In / Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendarRows.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-4 text-slate-500">No attendance records in selected range.</td></tr>
                    ) : calendarRows.map((rec) => (
                      <tr key={rec.date} className="border-t">
                        <td className="px-3 py-2">{rec.date}</td>
                        <td className="px-3 py-2"><span className={`px-2 py-1 rounded-full text-xs ${statusPill(rec.status)}`}>{rec.status || 'N/A'}</span></td>
                        <td className="px-3 py-2">{rec.fn_status || 'N/A'}</td>
                        <td className="px-3 py-2">{rec.an_status || 'N/A'}</td>
                        <td className="px-3 py-2">{rec.morning_in || '-'} / {rec.evening_out || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-6">
            <h3 className="font-semibold text-slate-900 mb-3">Apply Form (Auto Approved)</h3>

            <div className="mb-4">
              <label className="text-sm font-medium text-slate-700">Request Date</label>
              <input
                type="date"
                value={selectedDate}
                min={fromDate}
                max={toDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2"
              />
            </div>

            {!selectedTemplate ? (
              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                {templates.length === 0 ? (
                  <div className="text-sm text-slate-500">No templates available for selected date.</div>
                ) : templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="w-full text-left border rounded-lg p-3 hover:border-blue-500"
                    onClick={() => handleTemplatePick(tpl)}
                  >
                    <div className="font-medium text-slate-900">{tpl.name}</div>
                    <div className="text-xs text-slate-500">{tpl.form_schema.length} fields</div>
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="mb-3 p-3 border rounded-lg bg-blue-50 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{selectedTemplate.name}</div>
                    <div className="text-xs text-slate-600">Applied by HR and auto-approved</div>
                  </div>
                  <button type="button" className="text-sm text-blue-700" onClick={() => setSelectedTemplate(null)}>Change</button>
                </div>

                <DynamicFormRenderer fields={selectedTemplate.form_schema} values={formData} onChange={setFormData} />

                {error && <div className="mt-3 p-2 text-sm rounded bg-red-50 text-red-700 border border-red-200">{error}</div>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-4 w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700 disabled:bg-slate-400"
                >
                  {submitting ? 'Applying...' : 'Apply And Auto Approve'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StaffValidationPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<StaffValidationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<StaffValidationRow | null>(null);

  const effectiveToDate = useMemo(() => toDate || fromDate, [toDate, fromDate]);

  useEffect(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    setFromDate(monthStart);
    setToDate(today);
  }, []);

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const response = await fetchWithAuth(`${getApiBase()}/api/staff-attendance/records/available_departments/`);
        const data = await response.json();
        setDepartments(data.departments || []);
      } catch {
        setDepartments([]);
      }
    };
    loadDepartments();
  }, []);

  const filteredRows = useMemo(() => {
    if (!search || search.trim() === '') return rows;
    const token = search.trim().toLowerCase();
    return rows.filter((r) => {
      return (
        String(r.staff_id).toLowerCase().includes(token) ||
        String(r.staff_name).toLowerCase().includes(token) ||
        String(r.department?.name || '').toLowerCase().includes(token)
      );
    });
  }, [rows, search]);

  const loadData = async () => {
    if (!fromDate) {
      setError('From date is required');
      return;
    }
    if (effectiveToDate && fromDate > effectiveToDate) {
      setError('From date must be before or equal to To date');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getStaffValidationOverview({
        from_date: fromDate,
        to_date: effectiveToDate,
        department_id: departmentId || undefined,
      });
      setRows(data.results || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load staff validation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!fromDate) return;
    loadData();
  }, [fromDate, toDate, departmentId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <UserCheck className="w-8 h-8 text-blue-700" />
            <h1 className="text-3xl font-bold text-slate-900">HR Staff Validation</h1>
          </div>
          <p className="text-slate-600">Validate staff attendance and apply requests on behalf of staff with immediate auto-approval.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-sm text-slate-700 mb-1"><Calendar className="w-4 h-4 inline mr-1" />From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1"><Calendar className="w-4 h-4 inline mr-1" />To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Search</label>
              <div className="relative">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by Staff ID, name, or dept"
                  className="w-full border rounded-lg px-3 py-2 pr-10"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {!search && <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />}
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Department</label>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={loadData} className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700">
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
          {error && <div className="mt-3 p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">{error}</div>}
        </div>

        <div className="bg-white rounded-xl border shadow-sm overflow-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">S.no</th>
                <th className="px-3 py-2 text-left">Staff ID</th>
                <th className="px-3 py-2 text-left">Staff Name</th>
                <th className="px-3 py-2 text-left">Dept</th>
                <th className="px-3 py-2 text-right">Present days</th>
                <th className="px-3 py-2 text-right">Absent days</th>
                <th className="px-3 py-2 text-right">CL</th>
                <th className="px-3 py-2 text-right">COL</th>
                <th className="px-3 py-2 text-right">OD</th>
                <th className="px-3 py-2 text-right">Others</th>
                <th className="px-3 py-2 text-right">Late Entry Permission</th>
                <th className="px-3 py-2 text-right">LOP</th>
                <th className="px-3 py-2 text-center">Apply</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                    {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading staff...</span> : 'No staff data for selected filters'}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500">No matching staff for search</td>
                </tr>
              ) : filteredRows.map((row) => (
                <tr key={row.staff_user_id} className="border-t hover:bg-blue-50/40">
                  <td className="px-3 py-2">{row.s_no}</td>
                  <td className="px-3 py-2 font-medium">{row.staff_id}</td>
                  <td className="px-3 py-2">{row.staff_name}</td>
                  <td className="px-3 py-2">{row.department.name}</td>
                  <td className="px-3 py-2 text-right">{row.present_days.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{row.absent_days.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{row.balances.cl.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{row.balances.col.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{row.balances.od.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{row.balances.others.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{row.balances.late_entry_permission.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{row.balances.lop.toFixed(1)}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => setSelectedRow(row)}
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <HrApplyModal
        open={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        row={selectedRow}
        fromDate={fromDate}
        toDate={effectiveToDate}
        onApplied={loadData}
      />
    </div>
  );
}
