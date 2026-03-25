import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, FileText, Settings, DollarSign, Calculator, Table as TableIcon, Download, Send } from 'lucide-react';
import {
  downloadSalaryReportExcel,
  getDeductionTypes,
  getEarnTypes,
  getSalaryBankDeclarations,
  getSalaryReport,
  getMonthlySalarySheet,
  getPfConfig,
  getSalaryDeclarations,
  getSalaryFormulas,
  saveDeductionTypes,
  saveEarnTypes,
  saveMonthlySalarySheet,
  downloadMonthlySalarySheet,
  publishSalaryMonth,
  savePfConfig,
  saveSalaryBankDeclarations,
  saveSalaryDeclarations,
  saveSalaryFormulas,
  getEmiPlans,
  saveEmiPlans,
} from '../../services/staffSalary';

type DeclarationRow = {
  s_no: number;
  staff_user_id: number;
  staff_id: string;
  name: string;
  department: { id: number | null; name: string };
  basic_salary: number;
  allowance: number;
  pf_enabled: boolean;
  type2_pf_value: number;
  bank_id?: number | null;
  bank_name?: string;
  account_no?: string;
  ifsc_code?: string;
  is_new?: boolean;
};

type BankDeclarationRow = {
  id?: number;
  name: string;
  is_active: boolean;
  sort_order: number;
};

type SalaryReportType = 'payroll' | 'bank_staff';

type PayrollReportData = {
  month: string;
  earn_types: Array<{ id: number; name: string }>;
  deduction_types: Array<{ id: number; name: string; mode?: string }>;
  section1: {
    rows: Array<any>;
    grand_total: any;
  };
  section2: {
    bank_columns: string[];
    rows: Array<any>;
    grand_total: any;
  };
};

type BankStaffReportData = {
  month: string;
  bank_filter: string;
  bank_options: string[];
  rows: Array<any>;
  count: number;
};

function monthToken(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type TabType = 'declaration' | 'bank_declaration' | 'pf' | 'deduction' | 'formula' | 'monthly' | 'salary_report';

const TAB_CONFIG: Record<TabType, { label: string; icon: React.ReactNode }> = {
  declaration: { label: 'Declaration', icon: <FileText className="w-5 h-5" /> },
  bank_declaration: { label: 'Bank Declaration', icon: <FileText className="w-5 h-5" /> },
  pf: { label: 'PF Config', icon: <Settings className="w-5 h-5" /> },
  deduction: { label: 'Deductions & EMI', icon: <DollarSign className="w-5 h-5" /> },
  formula: { label: 'Formulas', icon: <Calculator className="w-5 h-5" /> },
  monthly: { label: 'Monthly Sheet', icon: <TableIcon className="w-5 h-5" /> },
  salary_report: { label: 'Salary Report', icon: <TableIcon className="w-5 h-5" /> },
};

export default function StaffSalaryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('declaration');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [declarations, setDeclarations] = useState<DeclarationRow[]>([]);
  const [editingRows, setEditingRows] = useState<Record<number, boolean>>({});
  const [declSearchTerm, setDeclSearchTerm] = useState('');
  const [declDeptFilter, setDeclDeptFilter] = useState('');
  const [declCurrentPage, setDeclCurrentPage] = useState(1);
  const [bankOptions, setBankOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [bankDeclarations, setBankDeclarations] = useState<BankDeclarationRow[]>([]);

  const [pfConfig, setPfConfig] = useState<any>(null);
  const [deductionTypes, setDeductionTypes] = useState<any[]>([]);
  const [earnTypes, setEarnTypes] = useState<any[]>([]);
  const [emiPlans, setEmiPlans] = useState<any[]>([]);
  const [formulaConfig, setFormulaConfig] = useState<Record<string, string>>({});

  const [month, setMonth] = useState(monthToken());
  const [monthlySheet, setMonthlySheet] = useState<any>(null);
  const [monthlySearchTerm, setMonthlySearchTerm] = useState('');
  const [monthlyDeptFilter, setMonthlyDeptFilter] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [salaryReportType, setSalaryReportType] = useState<SalaryReportType>('payroll');
  const [salaryReportMonth, setSalaryReportMonth] = useState(monthToken());
  const [salaryReportBankFilter, setSalaryReportBankFilter] = useState('');
  const [salaryReportLoading, setSalaryReportLoading] = useState(false);
  const [payrollReport, setPayrollReport] = useState<PayrollReportData | null>(null);
  const [bankStaffReport, setBankStaffReport] = useState<BankStaffReportData | null>(null);

  const [newEmi, setNewEmi] = useState<any>({
    staff_user_id: '',
    deduction_type_id: '',
    total_amount: 0,
    months: 1,
    start_month: monthToken(),
  });

  const apiErrorText = (err: any) => {
    return (
      err?.response?.data?.error ||
      err?.response?.data?.detail ||
      err?.message ||
      'Unknown error'
    );
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [declRes, bankRes, pfRes, dedRes, earnRes, formulaRes, monthRes, emiRes] = await Promise.allSettled([
        getSalaryDeclarations(),
        getSalaryBankDeclarations(),
        getPfConfig(),
        getDeductionTypes(),
        getEarnTypes(),
        getSalaryFormulas(),
        getMonthlySalarySheet(month),
        getEmiPlans(),
      ]);
      const issues: string[] = [];

      if (declRes.status === 'fulfilled') {
        setDeclarations(declRes.value.results || []);
        setBankOptions(declRes.value.bank_options || []);
        // Auto-open edit mode for new declarations (first time)
        const newRows = declRes.value.results || [];
        const editMap: Record<number, boolean> = {};
        newRows.forEach((row: any) => {
          if (row.is_new) {
            editMap[row.staff_user_id] = true;
          }
        });
        if (Object.keys(editMap).length > 0) {
          setEditingRows(editMap);
        }
      } else {
        setDeclarations([]);
        setBankOptions([]);
        issues.push(`Declaration: ${apiErrorText(declRes.reason)}`);
      }

      if (bankRes.status === 'fulfilled') {
        setBankDeclarations(bankRes.value.results || []);
      } else {
        setBankDeclarations([]);
        issues.push(`Bank Declarations: ${apiErrorText(bankRes.reason)}`);
      }

      if (pfRes.status === 'fulfilled') {
        setPfConfig(pfRes.value);
      } else {
        setPfConfig({
          threshold_amount: 15000,
          fixed_pf_amount: 1800,
          percentage_rate: 12,
          type1_department_ids: [],
          type2_department_ids: [],
          departments: [],
        });
        issues.push(`PF Declaration: ${apiErrorText(pfRes.reason)}`);
      }

      if (dedRes.status === 'fulfilled') {
        setDeductionTypes(dedRes.value.results || []);
      } else {
        setDeductionTypes([]);
        issues.push(`Deduction Types: ${apiErrorText(dedRes.reason)}`);
      }

      if (earnRes.status === 'fulfilled') {
        setEarnTypes(earnRes.value.results || []);
      } else {
        setEarnTypes([]);
        issues.push(`Earn Types: ${apiErrorText(earnRes.reason)}`);
      }

      if (formulaRes.status === 'fulfilled') {
        setFormulaConfig(formulaRes.value.expressions || {});
      } else {
        setFormulaConfig({});
        issues.push(`Formulas: ${apiErrorText(formulaRes.reason)}`);
      }

      if (monthRes.status === 'fulfilled') {
        setMonthlySheet(monthRes.value);
      } else {
        setMonthlySheet({ month, earn_types: [], deduction_types: [], results: [] });
        issues.push(`Monthly Sheet: ${apiErrorText(monthRes.reason)}`);
      }

      if (emiRes.status === 'fulfilled') {
        setEmiPlans(emiRes.value.results || []);
      } else {
        setEmiPlans([]);
        issues.push(`EMI Plans: ${apiErrorText(emiRes.reason)}`);
      }

      if (issues.length > 0) {
        setError(`Some sections failed to load. ${issues.join(' | ')}`);
      }
    } catch (e: any) {
      setError(apiErrorText(e) || 'Failed to load salary page data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [month]);

  const handleSaveDeclaration = async (row: DeclarationRow) => {
    try {
      await saveSalaryDeclarations([row]);
      setEditingRows((p) => ({ ...p, [row.staff_user_id]: false }));
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save declaration');
    }
  };

  const handleSaveBankDeclarations = async () => {
    try {
      const items = bankDeclarations
        .map((row, idx) => ({
          id: row.id,
          name: String(row.name || '').trim(),
          is_active: Boolean(row.is_active),
          sort_order: Number(row.sort_order || idx + 1),
        }))
        .filter((row) => row.name);

      await saveSalaryBankDeclarations(items);
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save bank declarations');
    }
  };

  const handleDeclarationFieldChange = (staffUserId: number, patch: Partial<DeclarationRow>) => {
    setDeclarations((prev) => prev.map((r) => (r.staff_user_id === staffUserId ? { ...r, ...patch } : r)));
  };

  const handleSavePfConfig = async () => {
    try {
      await savePfConfig(pfConfig);
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save PF config');
    }
  };

  const handleSaveTypes = async () => {
    try {
      await Promise.all([
        saveDeductionTypes(deductionTypes),
        saveEarnTypes(earnTypes),
      ]);
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save declaration types');
    }
  };

  const handleSaveFormulas = async () => {
    try {
      await saveSalaryFormulas(formulaConfig);
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save formulas');
    }
  };

  const handleSaveMonthlyRow = async (row: any) => {
    try {
      await saveMonthlySalarySheet(month, [{
        staff_user_id: row.staff_user_id,
        include_in_salary: Boolean(row.include_in_salary),
        is_cash: Boolean(row.is_cash),
        earn_values: row.earn_values,
        deduction_values: row.deduction_values,
        od_new: row.od_new,
        others: row.others,
      }]);
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save monthly values');
    }
  };

  const loadSalaryReport = async () => {
    try {
      setSalaryReportLoading(true);
      setError(null);
      const payload = await getSalaryReport({
        month: salaryReportMonth,
        report_type: salaryReportType,
        bank: salaryReportType === 'bank_staff' ? salaryReportBankFilter : undefined,
      });

      if (payload?.report_type === 'payroll') {
        setPayrollReport(payload.report || null);
      } else {
        setBankStaffReport(payload.report || null);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load salary report');
    } finally {
      setSalaryReportLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'salary_report') return;
    loadSalaryReport();
  }, [activeTab, salaryReportMonth, salaryReportType, salaryReportBankFilter]);

  const handleToggleMonthlyInclude = async (row: any, checked: boolean) => {
    try {
      setMonthlySheet((prev: any) => {
        if (!prev?.results) return prev;
        return {
          ...prev,
          results: prev.results.map((x: any) =>
            x.staff_user_id === row.staff_user_id ? { ...x, include_in_salary: checked } : x,
          ),
        };
      });

      await saveMonthlySalarySheet(month, [{
        staff_user_id: row.staff_user_id,
        include_in_salary: checked,
        is_cash: Boolean(row.is_cash),
        earn_values: row.earn_values,
        deduction_values: row.deduction_values,
        od_new: row.od_new,
        others: row.others,
      }]);
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to update salary inclusion');
    }
  };

  const handleToggleMonthlyCash = async (row: any, checked: boolean) => {
    try {
      setMonthlySheet((prev: any) => {
        if (!prev?.results) return prev;
        return {
          ...prev,
          results: prev.results.map((x: any) =>
            x.staff_user_id === row.staff_user_id ? { ...x, is_cash: checked } : x,
          ),
        };
      });

      await saveMonthlySalarySheet(month, [{
        staff_user_id: row.staff_user_id,
        include_in_salary: Boolean(row.include_in_salary),
        is_cash: checked,
        earn_values: row.earn_values,
        deduction_values: row.deduction_values,
        od_new: row.od_new,
        others: row.others,
      }]);
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to update cash flag');
    }
  };

  const handleDownloadMonthlySheet = async () => {
    try {
      const response = await downloadMonthlySalarySheet(month, monthlyDeptFilter || undefined);
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `salary_monthly_sheet_${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to download monthly sheet');
    }
  };

  const handlePublishMonthlySheet = async () => {
    try {
      setPublishing(true);
      const nextState = !Boolean(monthlySheet?.published);
      await publishSalaryMonth(month, undefined, nextState);
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to update publish state');
    } finally {
      setPublishing(false);
    }
  };

  const handleDownloadSalaryReport = async () => {
    try {
      const response = await downloadSalaryReportExcel({
        month: salaryReportMonth,
        report_type: salaryReportType,
        bank: salaryReportType === 'bank_staff' ? salaryReportBankFilter : undefined,
      });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = salaryReportType === 'payroll'
        ? `salary_payroll_report_${salaryReportMonth}.xlsx`
        : `salary_bank_staff_report_${salaryReportMonth}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to download salary report');
    }
  };

  const departmentOptions = useMemo(() => pfConfig?.departments || [], [pfConfig]);

  const toggleDept = (listKey: 'type1_department_ids' | 'type2_department_ids', deptId: number) => {
    const existing: number[] = pfConfig?.[listKey] || [];
    const next = existing.includes(deptId)
      ? existing.filter((x) => x !== deptId)
      : [...existing, deptId];
    setPfConfig((p: any) => ({ ...p, [listKey]: next }));
  };

  const emiDeductionTypes = useMemo(
    () => deductionTypes.filter((d) => d.mode === 'emi' && d.is_active),
    [deductionTypes],
  );

  const addEmiPlan = async () => {
    if (!newEmi.staff_user_id || !newEmi.deduction_type_id) {
      setError('Select staff and EMI deduction type');
      return;
    }
    try {
      await saveEmiPlans([{
        ...newEmi,
        staff_user_id: Number(newEmi.staff_user_id),
        deduction_type_id: Number(newEmi.deduction_type_id),
        total_amount: Number(newEmi.total_amount || 0),
        months: Number(newEmi.months || 1),
      }]);
      setNewEmi({
        staff_user_id: '',
        deduction_type_id: '',
        total_amount: 0,
        months: 1,
        start_month: monthToken(),
      });
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save EMI plan');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header with filters */}
      <div className="sticky top-0 z-40 bg-white border-b">
        <div className="max-w-[95vw] mx-auto p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-sm text-slate-700">Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="block border rounded px-3 py-2" />
            </div>

            <button onClick={loadAll} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
            </button>
            <div className="text-sm text-slate-600">
              Loaded: <span className="font-semibold">{declarations.length}</span> staff
            </div>
          </div>
          {error && <div className="mt-3 p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b sticky top-16 z-30">
        <div className="max-w-[95vw] mx-auto flex gap-1 overflow-x-auto px-4">
          {(Object.entries(TAB_CONFIG) as [TabType, any][]).map(([tabKey, { label, icon }]) => (
            <button
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition whitespace-nowrap ${
                activeTab === tabKey
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-[95vw] mx-auto p-6">
        {/* Declaration Tab */}
        {activeTab === 'declaration' && (
          <section className="bg-white border rounded-xl p-4 overflow-auto">
            <h2 className="text-xl font-semibold mb-3">Staff Salary Declaration</h2>
            {loading && <div className="flex items-center gap-2 text-slate-600 mb-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading staff data...</div>}
            
            {/* Declaration Filters */}
            <div className="mb-4 flex flex-wrap gap-3 items-end bg-slate-50 p-3 rounded">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Search (Name/ID)</label>
                <input 
                  type="text" 
                  placeholder="Search staff..." 
                  value={declSearchTerm} 
                  onChange={(e) => setDeclSearchTerm(e.target.value)}
                  className="border rounded px-3 py-2 w-40"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Department</label>
                <select 
                  value={declDeptFilter} 
                  onChange={(e) => setDeclDeptFilter(e.target.value)}
                  className="border rounded px-3 py-2 min-w-[200px]"
                >
                  <option value="">All Departments</option>
                  {departmentOptions.map((d: any) => (
                    <option key={d.id} value={String(d.id)}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {declarations.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="mb-2">No staff members found to declare</p>
                <p className="text-sm">Select a department filter or click Refresh to load staff members</p>
              </div>
            ) : (
              <>
              <table className="min-w-[1400px] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">S.No</th>
                    <th className="px-2 py-2 text-left">Staff ID</th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Dept</th>
                    <th className="px-2 py-2 text-left">Bank</th>
                    <th className="px-2 py-2 text-left">A/C No</th>
                    <th className="px-2 py-2 text-left">IFSC CODE</th>
                    <th className="px-2 py-2 text-right">Basic Salary</th>
                    <th className="px-2 py-2 text-right">Allowance</th>
                    <th className="px-2 py-2 text-right">Type 2 PF Value</th>
                    <th className="px-2 py-2 text-center">PF Enabled</th>
                    <th className="px-2 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = declarations.filter((row) => {
                      const matchesSearch = declSearchTerm === '' || 
                        row.name.toLowerCase().includes(declSearchTerm.toLowerCase()) ||
                        row.staff_id.toLowerCase().includes(declSearchTerm.toLowerCase());
                      const matchesDept = declDeptFilter === '' || row.department.id === Number(declDeptFilter);
                      return matchesSearch && matchesDept;
                    });
                    const itemsPerPage = 20;
                    const totalPages = Math.ceil(filtered.length / itemsPerPage);
                    const startIdx = (declCurrentPage - 1) * itemsPerPage;
                    const paginatedData = filtered.slice(startIdx, startIdx + itemsPerPage);
                    
                    return paginatedData.map((row) => {
                    const editable = Boolean(editingRows[row.staff_user_id]);
                    const isNonTeaching = (pfConfig?.type2_department_ids || []).includes(row.department.id);
                    return (
                      <tr key={row.staff_user_id} className={`border-t ${editable ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-2 py-2">{row.s_no}</td>
                        <td className="px-2 py-2 font-medium">{row.staff_id}</td>
                        <td className="px-2 py-2">{row.name}</td>
                        <td className="px-2 py-2 text-sm text-slate-600">{row.department.name}</td>
                        <td className="px-2 py-2">
                          <select
                            disabled={!editable}
                            value={String(row.bank_id || '')}
                            onChange={(e) => handleDeclarationFieldChange(row.staff_user_id, { bank_id: e.target.value ? Number(e.target.value) : null })}
                            className="border rounded px-2 py-1 w-44 disabled:bg-slate-100"
                          >
                            <option value="">Select Bank</option>
                            {bankOptions.map((bank) => (
                              <option key={bank.id} value={bank.id}>{bank.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            disabled={!editable}
                            value={row.account_no || ''}
                            onChange={(e) => handleDeclarationFieldChange(row.staff_user_id, { account_no: e.target.value })}
                            className="border rounded px-2 py-1 w-44 disabled:bg-slate-100"
                            placeholder="Enter account number"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            disabled={!editable}
                            value={row.ifsc_code || ''}
                            onChange={(e) => handleDeclarationFieldChange(row.staff_user_id, { ifsc_code: e.target.value.toUpperCase() })}
                            className="border rounded px-2 py-1 w-36 uppercase disabled:bg-slate-100"
                            placeholder="IFSC code"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" disabled={!editable} value={row.basic_salary}
                            onChange={(e) => handleDeclarationFieldChange(row.staff_user_id, { basic_salary: Number(e.target.value) })}
                            className="border rounded px-2 py-1 w-32 text-right disabled:bg-slate-100" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" disabled={!editable} value={row.allowance}
                            onChange={(e) => handleDeclarationFieldChange(row.staff_user_id, { allowance: Number(e.target.value) })}
                            className="border rounded px-2 py-1 w-32 text-right disabled:bg-slate-100" />
                        </td>
                        {isNonTeaching && (
                          <td className="px-2 py-2 text-right">
                            <input type="number" disabled={!editable} value={row.type2_pf_value}
                              onChange={(e) => handleDeclarationFieldChange(row.staff_user_id, { type2_pf_value: Number(e.target.value) })}
                              className="border rounded px-2 py-1 w-32 text-right disabled:bg-slate-100" placeholder="Type 2 PF" />
                          </td>
                        )}
                        {!isNonTeaching && (
                          <td className="px-2 py-2"></td>
                        )}
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" disabled={!editable} checked={row.pf_enabled}
                            onChange={(e) => handleDeclarationFieldChange(row.staff_user_id, { pf_enabled: e.target.checked })} />
                        </td>
                        <td className="px-2 py-2 text-center space-x-2">
                          {!editable ? (
                            <button onClick={() => setEditingRows((p) => ({ ...p, [row.staff_user_id]: true }))} className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700">Edit</button>
                          ) : (
                            <button onClick={() => handleSaveDeclaration(row)} className="px-3 py-1 rounded bg-blue-600 text-white inline-flex items-center gap-1 hover:bg-blue-700"><Save className="w-3 h-3" />Save</button>
                          )}
                        </td>
                      </tr>
                    );
                    });
                  })()}
                </tbody>
              </table>
              
              {/* Pagination */}
              {(() => {
                const filtered = declarations.filter((row) => {
                  const matchesSearch = declSearchTerm === '' || 
                    row.name.toLowerCase().includes(declSearchTerm.toLowerCase()) ||
                    row.staff_id.toLowerCase().includes(declSearchTerm.toLowerCase());
                  const matchesDept = declDeptFilter === '' || row.department.id === Number(declDeptFilter);
                  return matchesSearch && matchesDept;
                });
                const itemsPerPage = 20;
                const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
                
                return (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-slate-600">
                      Showing {Math.min((declCurrentPage - 1) * itemsPerPage + 1, filtered.length)} to {Math.min(declCurrentPage * itemsPerPage, filtered.length)} of {filtered.length} staff
                    </div>
                    <div className="flex gap-1">
                      {totalPages <= 10 ? (
                        Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <button
                            key={page}
                            onClick={() => setDeclCurrentPage(page)}
                            className={`px-3 py-1 rounded border ${
                              declCurrentPage === page
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {page}
                          </button>
                        ))
                      ) : (
                        <>
                          {declCurrentPage > 1 && (
                            <button onClick={() => setDeclCurrentPage(1)} className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100">
                              1
                            </button>
                          )}
                          {declCurrentPage > 3 && <span className="px-2 py-1">...</span>}
                          {Array.from(
                            { length: Math.min(5, totalPages) },
                            (_, i) => Math.max(1, Math.min(declCurrentPage - 2 + i, totalPages - 4))
                          )
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .map((page) => (
                              <button
                                key={page}
                                onClick={() => setDeclCurrentPage(page)}
                                className={`px-3 py-1 rounded border ${
                                  declCurrentPage === page
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'border-slate-300 hover:bg-slate-100'
                                }`}
                              >
                                {page}
                              </button>
                            ))}
                          {declCurrentPage < totalPages - 2 && <span className="px-2 py-1">...</span>}
                          {declCurrentPage < totalPages && (
                            <button onClick={() => setDeclCurrentPage(totalPages)} className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100">
                              {totalPages}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
              </>
            )}
          </section>
        )}

        {/* Bank Declaration Tab */}
        {activeTab === 'bank_declaration' && (
          <section className="bg-white border rounded-xl p-4">
            <h2 className="text-xl font-semibold mb-3">Bank Declaration</h2>
            <p className="text-sm text-slate-600 mb-4">Define bank names that will be selectable in staff salary declaration rows.</p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2 px-3 py-2">
              <label className="text-xs font-semibold text-slate-700 uppercase">Bank Name</label>
              <label className="text-xs font-semibold text-slate-700 uppercase">Status</label>
              <label className="text-xs font-semibold text-slate-700 uppercase">Sort Order</label>
              <label className="text-xs font-semibold text-slate-700 uppercase">Actions</label>
            </div>

            <div className="space-y-2 mb-4">
              {bankDeclarations.map((b, idx) => (
                <div key={b.id || `bank-${idx}`} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input
                    value={b.name || ''}
                    onChange={(e) => setBankDeclarations((prev) => prev.map((x) => x === b ? { ...x, name: e.target.value } : x))}
                    className="border rounded px-3 py-2"
                    placeholder="Enter bank name"
                  />
                  <label className="inline-flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={Boolean(b.is_active)}
                      onChange={(e) => setBankDeclarations((prev) => prev.map((x) => x === b ? { ...x, is_active: e.target.checked } : x))}
                    />
                    {b.is_active ? 'Active' : 'Inactive'}
                  </label>
                  <input
                    type="number"
                    value={b.sort_order || idx + 1}
                    onChange={(e) => setBankDeclarations((prev) => prev.map((x) => x === b ? { ...x, sort_order: Number(e.target.value) } : x))}
                    className="border rounded px-3 py-2"
                    placeholder="1, 2, 3..."
                  />
                  <button
                    onClick={() => setBankDeclarations((prev) => prev.filter((x) => x !== b))}
                    className="px-3 py-2 border rounded border-red-200 text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setBankDeclarations((prev) => [...prev, { name: '', is_active: true, sort_order: prev.length + 1 }])}
                className="px-3 py-2 border rounded inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Bank
              </button>
              <button
                onClick={handleSaveBankDeclarations}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save Bank Declaration
              </button>
            </div>
          </section>
        )}

        {/* PF Config Tab */}
        {activeTab === 'pf' && (
          <section className="bg-white border rounded-xl p-4">
            <h2 className="text-xl font-semibold mb-4">PF Declaration Configuration</h2>
            
            {loading && <div className="flex items-center gap-2 text-slate-600 mb-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading configuration...</div>}
            
            <div className="space-y-6">
              {/* PF Settings */}
              <div>
                <h3 className="font-semibold text-slate-700 mb-3">PF Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Threshold Amount</label>
                    <input type="number" value={pfConfig?.threshold_amount || 0} onChange={(e) => setPfConfig((p: any) => ({ ...p, threshold_amount: Number(e.target.value) }))} className="w-full border rounded px-3 py-2 mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">PF Amount Greater than Threshhold </label>
                    <input type="number" value={pfConfig?.fixed_pf_amount || 0} onChange={(e) => setPfConfig((p: any) => ({ ...p, fixed_pf_amount: Number(e.target.value) }))} className="w-full border rounded px-3 py-2 mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Percentage Rate (%) Less than Threshold</label>
                    <input type="number" value={pfConfig?.percentage_rate || 0} onChange={(e) => setPfConfig((p: any) => ({ ...p, percentage_rate: Number(e.target.value) }))} className="w-full border rounded px-3 py-2 mt-1" />
                  </div>

                </div>
              </div>

              {/* Department Selection */}
              <div className="border-t pt-6">
                <h3 className="font-semibold text-slate-700 mb-3">PF Type by Department</h3>
                {departmentOptions.length === 0 ? (
                  <div className="text-slate-500 py-4">No departments available</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Type 1: Teaching */}
                    <div className="border rounded-lg p-4 bg-blue-50">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
                        Teaching Departments
                      </h4>
                      <div className="space-y-2 max-h-64 overflow-auto">
                        {(departmentOptions || []).map((d: any) => {
                          const isInType2 = (pfConfig?.type2_department_ids || []).includes(d.id);
                          return (
                            <label key={`t1-${d.id}`} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${isInType2 ? 'opacity-40 pointer-events-none' : 'hover:bg-blue-100'}`}>
                              <input 
                                type="checkbox" 
                                checked={(pfConfig?.type1_department_ids || []).includes(d.id)}
                                disabled={isInType2}
                                onChange={() => toggleDept('type1_department_ids', d.id)}
                                className="w-4 h-4"
                              />
                              <span className="text-sm text-slate-800">{d.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Type 2: Non-Teaching */}
                    <div className="border rounded-lg p-4 bg-green-50">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold">2</span>
                        Non-Teaching Departments
                      </h4>
                      <div className="space-y-2 max-h-64 overflow-auto">
                        {(departmentOptions || []).map((d: any) => {
                          const isInType1 = (pfConfig?.type1_department_ids || []).includes(d.id);
                          return (
                            <label key={`t2-${d.id}`} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${isInType1 ? 'opacity-40 pointer-events-none' : 'hover:bg-green-100'}`}>
                              <input 
                                type="checkbox" 
                                checked={(pfConfig?.type2_department_ids || []).includes(d.id)} 
                                disabled={isInType1}
                                onChange={() => toggleDept('type2_department_ids', d.id)}
                                className="w-4 h-4"
                              />
                              <span className="text-sm text-slate-800">{d.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="border-t pt-4 flex gap-2">
                <button onClick={handleSavePfConfig} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save PF Configuration
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Deduction & EMI Tab */}
        {activeTab === 'deduction' && (
          <section className="bg-white border rounded-xl p-4">
            <h2 className="text-xl font-semibold mb-3">Deduction Types</h2>
            <p className="text-sm text-slate-600 mb-3">Create deduction types, set mode to EMI for first 3 style, monthly for unique monthly values.</p>
            
            {/* Column Headers */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2 px-3 py-2">
              <label className="text-xs font-semibold text-slate-700 uppercase">Deduction Name</label>
              <label className="text-xs font-semibold text-slate-700 uppercase">Mode</label>
              <label className="text-xs font-semibold text-slate-700 uppercase">Status</label>
              <label className="text-xs font-semibold text-slate-700 uppercase">Sort Order</label>
            </div>
            
            <div className="space-y-2 mb-4">
              {deductionTypes.map((d, idx) => (
                <div key={d.id || `new-${idx}`} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input value={d.name || ''} onChange={(e) => setDeductionTypes((p) => p.map((x) => x === d ? { ...x, name: e.target.value } : x))} className="border rounded px-3 py-2" placeholder="Enter deduction name" />
                  <select value={d.mode || 'monthly'} onChange={(e) => setDeductionTypes((p) => p.map((x) => x === d ? { ...x, mode: e.target.value } : x))} className="border rounded px-3 py-2">
                    <option value="emi">EMI (Installment)</option>
                    <option value="monthly">Monthly (Fixed)</option>
                  </select>
                  <label className="inline-flex items-center gap-2 px-3 py-2"><input type="checkbox" checked={Boolean(d.is_active)} onChange={(e) => setDeductionTypes((p) => p.map((x) => x === d ? { ...x, is_active: e.target.checked } : x))} /> {d.is_active ? 'Active' : 'Inactive'}</label>
                  <input type="number" value={d.sort_order || idx + 1} onChange={(e) => setDeductionTypes((p) => p.map((x) => x === d ? { ...x, sort_order: Number(e.target.value) } : x))} className="border rounded px-3 py-2" placeholder="1, 2, 3..." />
                </div>
              ))}
            </div>
            <button onClick={() => setDeductionTypes((p) => [...p, { name: '', mode: 'monthly', is_active: true, sort_order: p.length + 1 }])} className="px-3 py-2 border rounded inline-flex items-center gap-2 mb-6">
              <Plus className="w-4 h-4" /> Add Deduction Type
            </button>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-3">EMI Plans</h3>
              
              {/* Column Headers */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2 px-3 py-2">
                <label className="text-xs font-semibold text-slate-700 uppercase">Select Staff</label>
                <label className="text-xs font-semibold text-slate-700 uppercase">EMI Type</label>
                <label className="text-xs font-semibold text-slate-700 uppercase">Total Amount</label>
                <label className="text-xs font-semibold text-slate-700 uppercase">Number of Months</label>
                <label className="text-xs font-semibold text-slate-700 uppercase">Start Month</label>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                <select value={newEmi.staff_user_id} onChange={(e) => setNewEmi((p: any) => ({ ...p, staff_user_id: e.target.value }))} className="border rounded px-3 py-2">
                  <option value="">Choose staff member</option>
                  {declarations.map((d) => <option key={d.staff_user_id} value={d.staff_user_id}>{d.staff_id} - {d.name}</option>)}
                </select>
                <select value={newEmi.deduction_type_id} onChange={(e) => setNewEmi((p: any) => ({ ...p, deduction_type_id: e.target.value }))} className="border rounded px-3 py-2">
                  <option value="">Choose EMI type</option>
                  {emiDeductionTypes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input type="number" value={newEmi.total_amount} onChange={(e) => setNewEmi((p: any) => ({ ...p, total_amount: Number(e.target.value) }))} className="border rounded px-3 py-2" placeholder="e.g., 50000" />
                <input type="number" value={newEmi.months} onChange={(e) => setNewEmi((p: any) => ({ ...p, months: Number(e.target.value) }))} className="border rounded px-3 py-2" placeholder="e.g., 12" />
                <input type="month" value={newEmi.start_month} onChange={(e) => setNewEmi((p: any) => ({ ...p, start_month: e.target.value }))} className="border rounded px-3 py-2" title="Select start month for EMI" />
              </div>
              <button onClick={addEmiPlan} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4" /> Save EMI Plan
              </button>

              <div className="max-h-48 overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr><th className="px-2 py-2 text-left">Staff</th><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-right">Months</th><th className="px-2 py-2 text-left">Start</th></tr>
                  </thead>
                  <tbody>
                    {emiPlans.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-2 py-2">{p.staff_id} - {p.staff_name}</td>
                        <td className="px-2 py-2">{p.deduction_type_name}</td>
                        <td className="px-2 py-2 text-right">{Number(p.total_amount).toFixed(2)}</td>
                        <td className="px-2 py-2 text-right">{p.months}</td>
                        <td className="px-2 py-2">{p.start_month}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t pt-6 mt-6">
              <h3 className="text-lg font-semibold mb-3">Earn Types</h3>
              
              {/* Column Headers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2 px-3 py-2">
                <label className="text-xs font-semibold text-slate-700 uppercase">Earn Type Name</label>
                <label className="text-xs font-semibold text-slate-700 uppercase">Status</label>
                <label className="text-xs font-semibold text-slate-700 uppercase">Sort Order</label>
              </div>
              
              <div className="space-y-2">
                {earnTypes.map((e, idx) => (
                  <div key={e.id || `new-earn-${idx}`} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input value={e.name || ''} onChange={(ev) => setEarnTypes((p) => p.map((x) => x === e ? { ...x, name: ev.target.value } : x))} className="border rounded px-3 py-2" placeholder="e.g., Bonus, Incentive, etc." />
                    <label className="inline-flex items-center gap-2 px-3 py-2"><input type="checkbox" checked={Boolean(e.is_active)} onChange={(ev) => setEarnTypes((p) => p.map((x) => x === e ? { ...x, is_active: ev.target.checked } : x))} /> {e.is_active ? 'Active' : 'Inactive'}</label>
                    <input type="number" value={e.sort_order || idx + 1} onChange={(ev) => setEarnTypes((p) => p.map((x) => x === e ? { ...x, sort_order: Number(ev.target.value) } : x))} className="border rounded px-3 py-2" placeholder="1, 2, 3..." />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setEarnTypes((p) => [...p, { name: '', is_active: true, sort_order: p.length + 1 }])} className="px-3 py-2 border rounded inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Earn Type
                </button>
                <button onClick={handleSaveTypes} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save All
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Formula Tab */}
        {activeTab === 'formula' && (
          <section className="bg-white border rounded-xl p-4">
            <h2 className="text-xl font-semibold mb-3">Salary Formulas</h2>
            <p className="text-sm text-slate-600 mb-4">Define custom formulas for computed columns in the monthly salary sheet.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(formulaConfig).map(([k, v]) => (
                <div key={k}>
                  <label className="text-sm font-semibold text-slate-700">{k}</label>
                  <input value={v} onChange={(e) => setFormulaConfig((p) => ({ ...p, [k]: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm font-mono" />
                </div>
              ))}
            </div>
            <button onClick={handleSaveFormulas} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Formulas
            </button>
          </section>
        )}

        {/* Monthly Sheet Tab */}
        {activeTab === 'monthly' && (
          <section className="bg-white border rounded-xl overflow-hidden shadow-md">
            <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-slate-900">Final Salary Sheet - {month}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {monthlySheet?.published && (
                    <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-semibold">
                      Published
                    </span>
                  )}
                  <button
                    onClick={handleDownloadMonthlySheet}
                    className="px-3 py-2 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" /> Download Excel
                  </button>
                  <button
                    onClick={handlePublishMonthlySheet}
                    disabled={publishing}
                    className={`px-3 py-2 rounded text-white disabled:bg-slate-400 inline-flex items-center gap-2 text-sm ${monthlySheet?.published ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {monthlySheet?.published ? 'Deactivate Publish' : 'Activate Publish'}
                  </button>
                </div>
              </div>
              
              {/* Monthly Sheet Filters */}
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Search (Name/ID)</label>
                  <input 
                    type="text" 
                    placeholder="Search staff..." 
                    value={monthlySearchTerm} 
                    onChange={(e) => setMonthlySearchTerm(e.target.value)}
                    className="border border-slate-300 rounded px-3 py-2 w-40 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Department</label>
                  <select 
                    value={monthlyDeptFilter} 
                    onChange={(e) => setMonthlyDeptFilter(e.target.value)}
                    className="border border-slate-300 rounded px-3 py-2 min-w-[200px] text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Departments</option>
                    {departmentOptions.map((d: any) => (
                      <option key={d.id} value={String(d.id)}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[72vh]">

            <table className="min-w-max w-full text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
                <tr>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700 sticky left-0 z-30 bg-slate-100 border-r border-slate-200 min-w-[70px]">Pay</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700 sticky left-[70px] z-30 bg-slate-100 border-r border-slate-200 min-w-[70px]">Cash</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-[140px] z-30 bg-slate-100 border-r border-slate-200 min-w-[60px]">S.No</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-[200px] z-30 bg-slate-100 border-r border-slate-200 min-w-[100px]">Staff ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-[300px] z-30 bg-slate-100 border-r border-slate-200 min-w-[150px]">Staff Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-[450px] z-30 bg-slate-100 border-r border-slate-200 min-w-[120px]">Dept</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[100px]">Basic salary</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[100px]">Allowance</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[80px]">Days</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[100px]">Gross salary</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[100px]">LOP amount</th>
                  {(monthlySheet?.earn_types || []).map((e: any) => <th key={`earn-${e.id}`} className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[90px]">{e.name}</th>)}
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[100px]">Total salary</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[100px]">PF amount</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[100px]">OD New</th>
                  {(monthlySheet?.deduction_types || []).map((d: any) => <th key={`ded-${d.id}`} className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[90px]">{d.name}</th>)}
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[100px]">Others</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 min-w-[110px]">Net salary</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700 min-w-[80px]">Save</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = (monthlySheet?.results || []).filter((r: any) => {
                    const matchesSearch = monthlySearchTerm === '' || 
                      r.staff_name.toLowerCase().includes(monthlySearchTerm.toLowerCase()) ||
                      r.staff_id.toLowerCase().includes(monthlySearchTerm.toLowerCase());
                    const matchesDept = monthlyDeptFilter === '' || r.department.id === Number(monthlyDeptFilter);
                    return matchesSearch && matchesDept;
                  });
                  
                  // Group by department
                  const grouped = filtered.reduce((acc: any, row: any) => {
                    const deptKey = row.department.id;
                    if (!acc[deptKey]) {
                      acc[deptKey] = { dept: row.department, rows: [] };
                    }
                    acc[deptKey].rows.push(row);
                    return acc;
                  }, {} as Record<number, any>);
                  
                  // Sort departments by name
                  const sortedDepts = Object.values(grouped).sort((a: any, b: any) => 
                    a.dept.name.localeCompare(b.dept.name)
                  );
                  
                  // Helper to sum numeric columns
                  const sumRows = (rows: any[], field: string) => 
                    rows.reduce((sum, r) => sum + Number(r[field] || 0), 0);
                  
                  const sumEarnValues = (rows: any[], earnId: string) =>
                    rows.reduce((sum, r) => sum + Number(r.earn_values?.[earnId] ?? 0), 0);
                  
                  const sumDeductionValues = (rows: any[], dedId: string) =>
                    rows.reduce((sum, r) => sum + Number(r.deduction_values?.[dedId] ?? 0), 0);
                  
                  let finalRowsToRender: any[] = [];
                  let grandTotals = {
                    basic_salary: 0, allowance: 0, days: 0, gross_salary: 0, lop_amount: 0,
                    earn_totals: {} as Record<string, number>,
                    total_salary: 0, pf_amount: 0, od_new: 0,
                    deduction_totals: {} as Record<string, number>,
                    others: 0, net_salary: 0
                  };
                  
                  sortedDepts.forEach((group: any) => {
                    // Add staff rows for this department
                    group.rows.forEach((r: any) => {
                      finalRowsToRender.push({ type: 'staff', data: r });
                    });
                    
                    // Calculate department totals
                    const deptTotals = {
                      basic_salary: sumRows(group.rows, 'basic_salary'),
                      allowance: sumRows(group.rows, 'allowance'),
                      days: sumRows(group.rows, 'days'),
                      gross_salary: sumRows(group.rows, 'gross_salary'),
                      lop_amount: sumRows(group.rows, 'lop_amount'),
                      earn_totals: (monthlySheet?.earn_types || []).reduce((acc: any, e: any) => {
                        acc[e.id] = sumEarnValues(group.rows, String(e.id));
                        return acc;
                      }, {}),
                      total_salary: sumRows(group.rows, 'total_salary'),
                      pf_amount: sumRows(group.rows, 'pf_amount'),
                      od_new: sumRows(group.rows, 'od_new'),
                      deduction_totals: (monthlySheet?.deduction_types || []).reduce((acc: any, d: any) => {
                        acc[d.id] = sumDeductionValues(group.rows, String(d.id));
                        return acc;
                      }, {}),
                      others: sumRows(group.rows, 'others'),
                      net_salary: sumRows(group.rows, 'net_salary')
                    };
                    
                    finalRowsToRender.push({ type: 'dept_total', dept: group.dept, totals: deptTotals });
                    
                    // Accumulate grand totals
                    grandTotals.basic_salary += deptTotals.basic_salary;
                    grandTotals.allowance += deptTotals.allowance;
                    grandTotals.days += deptTotals.days;
                    grandTotals.gross_salary += deptTotals.gross_salary;
                    grandTotals.lop_amount += deptTotals.lop_amount;
                    Object.entries(deptTotals.earn_totals).forEach(([id, val]) => {
                      grandTotals.earn_totals[id] = (grandTotals.earn_totals[id] || 0) + (val as number);
                    });
                    grandTotals.total_salary += deptTotals.total_salary;
                    grandTotals.pf_amount += deptTotals.pf_amount;
                    grandTotals.od_new += deptTotals.od_new;
                    Object.entries(deptTotals.deduction_totals).forEach(([id, val]) => {
                      grandTotals.deduction_totals[id] = (grandTotals.deduction_totals[id] || 0) + (val as number);
                    });
                    grandTotals.others += deptTotals.others;
                    grandTotals.net_salary += deptTotals.net_salary;
                  });
                  
                  // Add grand total row
                  finalRowsToRender.push({ type: 'grand_total', totals: grandTotals });
                  
                  let staffCounter = 0;
                  return finalRowsToRender.map((item: any, idx: number) => {
                    if (item.type === 'staff') {
                      staffCounter++;
                      const r = item.data;
                      return (
                        <tr key={`staff-${r.staff_user_id}`} className={`border-b border-slate-200 ${staffCounter % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}`}>
                          <td className="px-3 py-2 text-center sticky left-0 z-10 bg-inherit border-r border-slate-200">
                            <input
                              type="checkbox"
                              checked={Boolean(r.include_in_salary ?? true)}
                              onChange={(ev) => handleToggleMonthlyInclude(r, ev.target.checked)}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center sticky left-[70px] z-10 bg-inherit border-r border-slate-200">
                            <input
                              type="checkbox"
                              checked={Boolean(r.is_cash ?? false)}
                              onChange={(ev) => handleToggleMonthlyCash(r, ev.target.checked)}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-900 sticky left-[140px] z-10 bg-inherit border-r border-slate-200">{staffCounter}</td>
                          <td className="px-3 py-2 text-slate-900 sticky left-[200px] z-10 bg-inherit border-r border-slate-200">{r.staff_id}</td>
                          <td className="px-3 py-2 text-slate-900 sticky left-[300px] z-10 bg-inherit border-r border-slate-200">{r.staff_name}</td>
                          <td className="px-3 py-2 text-slate-700 sticky left-[450px] z-10 bg-inherit border-r border-slate-200">{r.department.name}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{Number(r.basic_salary).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{Number(r.allowance).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{Number(r.days).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{Number(r.gross_salary).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{Number(r.lop_amount).toFixed(2)}</td>
                          {(monthlySheet?.earn_types || []).map((e: any) => (
                            <td key={`earn-value-${r.staff_user_id}-${e.id}`} className="px-3 py-2 text-right">
                              <input type="number" value={r.earn_values?.[String(e.id)] ?? 0}
                                onChange={(ev) => setMonthlySheet((p: any) => ({ ...p, results: p.results.map((x: any) => x.staff_user_id === r.staff_user_id ? { ...x, earn_values: { ...x.earn_values, [String(e.id)]: Number(ev.target.value) } } : x) }))}
                                className="border border-slate-300 rounded px-2 py-1 w-24 text-right text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">{Number(r.total_salary).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{Number(r.pf_amount).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" value={r.od_new ?? 0}
                              onChange={(ev) => setMonthlySheet((p: any) => ({ ...p, results: p.results.map((x: any) => x.staff_user_id === r.staff_user_id ? { ...x, od_new: Number(ev.target.value) } : x) }))}
                              className="border border-slate-300 rounded px-2 py-1 w-24 text-right text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                          </td>
                          {(monthlySheet?.deduction_types || []).map((d: any) => {
                            const isEmi = d.mode === 'emi';
                            return (
                              <td key={`ded-value-${r.staff_user_id}-${d.id}`} className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  disabled={isEmi}
                                  value={r.deduction_values?.[String(d.id)] ?? 0}
                                  onChange={(ev) => setMonthlySheet((p: any) => ({ ...p, results: p.results.map((x: any) => x.staff_user_id === r.staff_user_id ? { ...x, deduction_values: { ...x.deduction_values, [String(d.id)]: Number(ev.target.value) } } : x) }))}
                                  className="border border-slate-300 rounded px-2 py-1 w-24 text-right text-xs disabled:bg-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed"
                                />
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right">
                            <input type="number" value={r.others ?? 0}
                              onChange={(ev) => setMonthlySheet((p: any) => ({ ...p, results: p.results.map((x: any) => x.staff_user_id === r.staff_user_id ? { ...x, others: Number(ev.target.value) } : x) }))}
                              className="border border-slate-300 rounded px-2 py-1 w-24 text-right text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">{Number(r.net_salary).toFixed(2)}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => handleSaveMonthlyRow(r)} className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-medium inline-flex items-center gap-1 hover:bg-blue-700 transition-colors">
                              <Save className="w-3 h-3" /> Save
                            </button>
                          </td>
                        </tr>
                      );
                    } else if (item.type === 'dept_total') {
                      const totals = item.totals;
                      const dept = item.dept;
                      return (
                        <tr key={`dept-total-${dept.id}`} className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50 font-semibold text-slate-800">
                          <td className="px-3 py-2 sticky left-0 z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[70px] z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[140px] z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[200px] z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[300px] z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[450px] z-10 bg-inherit border-r border-slate-200">{dept.name} Total</td>
                          <td className="px-3 py-2 text-right">{totals.basic_salary.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.allowance.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.days.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.gross_salary.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.lop_amount.toFixed(2)}</td>
                          {(monthlySheet?.earn_types || []).map((e: any) => (
                            <td key={`earn-total-${dept.id}-${e.id}`} className="px-3 py-2 text-right">
                              {(totals.earn_totals[e.id] || 0).toFixed(2)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right">{totals.total_salary.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.pf_amount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.od_new.toFixed(2)}</td>
                          {(monthlySheet?.deduction_types || []).map((d: any) => (
                            <td key={`ded-total-${dept.id}-${d.id}`} className="px-3 py-2 text-right">
                              {(totals.deduction_totals[d.id] || 0).toFixed(2)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right">{totals.others.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.net_salary.toFixed(2)}</td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      );
                    } else if (item.type === 'grand_total') {
                      const totals = item.totals;
                      return (
                        <tr key="grand-total" className="border-b bg-gradient-to-r from-green-50 to-green-100/50 font-bold text-slate-800">
                          <td className="px-3 py-2 sticky left-0 z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[70px] z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[140px] z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[200px] z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[300px] z-10 bg-inherit"></td>
                          <td className="px-3 py-2 sticky left-[450px] z-10 bg-inherit border-r border-slate-200">Final College Total</td>
                          <td className="px-3 py-2 text-right">{totals.basic_salary.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.allowance.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.days.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.gross_salary.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.lop_amount.toFixed(2)}</td>
                          {(monthlySheet?.earn_types || []).map((e: any) => (
                            <td key={`grand-earn-${e.id}`} className="px-3 py-2 text-right">
                              {(totals.earn_totals[e.id] || 0).toFixed(2)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right">{totals.total_salary.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.pf_amount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.od_new.toFixed(2)}</td>
                          {(monthlySheet?.deduction_types || []).map((d: any) => (
                            <td key={`grand-ded-${d.id}`} className="px-3 py-2 text-right">
                              {(totals.deduction_totals[d.id] || 0).toFixed(2)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right">{totals.others.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totals.net_salary.toFixed(2)}</td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      );
                    }
                  });
                })()}
              </tbody>
            </table>
            </div>
          </section>
        )}

        {activeTab === 'salary_report' && (
          <section className="bg-white border rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Month</label>
                <input
                  type="month"
                  value={salaryReportMonth}
                  onChange={(e) => setSalaryReportMonth(e.target.value)}
                  className="border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Report Type</label>
                <select
                  value={salaryReportType}
                  onChange={(e) => setSalaryReportType(e.target.value as SalaryReportType)}
                  className="border rounded px-3 py-2 min-w-[220px]"
                >
                  <option value="payroll">Pay Roll Report</option>
                  <option value="bank_staff">Bank-wise Staff Report</option>
                </select>
              </div>
              {salaryReportType === 'bank_staff' && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Bank</label>
                  <select
                    value={salaryReportBankFilter}
                    onChange={(e) => setSalaryReportBankFilter(e.target.value)}
                    className="border rounded px-3 py-2 min-w-[220px]"
                  >
                    <option value="">All Banks</option>
                    {(bankStaffReport?.bank_options || []).map((bankName) => (
                      <option key={bankName} value={bankName}>{bankName}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={loadSalaryReport}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2"
              >
                {salaryReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load Report'}
              </button>
              <button
                onClick={handleDownloadSalaryReport}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded hover:bg-slate-100 inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Download Excel
              </button>
            </div>

            {salaryReportType === 'payroll' && payrollReport && (
              <>
                <div className="border rounded-lg overflow-auto">
                  <div className="px-3 py-2 bg-slate-50 border-b text-sm font-semibold text-slate-800">Pay Roll Report - Section 1</div>
                  <table className="min-w-[1300px] w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-2 py-2 text-left">S.No</th>
                        <th className="px-2 py-2 text-left">Staff Type</th>
                        <th className="px-2 py-2 text-right">Salary</th>
                        <th className="px-2 py-2 text-right">LOP</th>
                        {(payrollReport.earn_types || []).map((e) => (
                          <th key={`rep-earn-${e.id}`} className="px-2 py-2 text-right">{e.name}</th>
                        ))}
                        <th className="px-2 py-2 text-right">Gross Salary</th>
                        <th className="px-2 py-2 text-right">P.F</th>
                        {(payrollReport.deduction_types || []).map((d) => (
                          <th key={`rep-ded-${d.id}`} className="px-2 py-2 text-right">{d.name}</th>
                        ))}
                        <th className="px-2 py-2 text-right">Total Deduction</th>
                        <th className="px-2 py-2 text-right">Net Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payrollReport.section1?.rows || []).map((row: any) => (
                        <tr key={`s1-${row.s_no}`} className="border-t">
                          <td className="px-2 py-2">{row.s_no}</td>
                          <td className="px-2 py-2">{row.staff_type}</td>
                          <td className="px-2 py-2 text-right">{Number(row.salary || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{Number(row.lop || 0).toFixed(2)}</td>
                          {(payrollReport.earn_types || []).map((e) => (
                            <td key={`s1-earn-${row.s_no}-${e.id}`} className="px-2 py-2 text-right">{Number((row.earn || {})[String(e.id)] || 0).toFixed(2)}</td>
                          ))}
                          <td className="px-2 py-2 text-right">{Number(row.gross_salary || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{Number(row.pf_amount || 0).toFixed(2)}</td>
                          {(payrollReport.deduction_types || []).map((d) => (
                            <td key={`s1-ded-${row.s_no}-${d.id}`} className="px-2 py-2 text-right">{Number((row.deduction || {})[String(d.id)] || 0).toFixed(2)}</td>
                          ))}
                          <td className="px-2 py-2 text-right">{Number(row.total_deduction || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{Number(row.net_salary || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {payrollReport.section1?.grand_total && (
                        <tr className="border-t bg-slate-100 font-semibold">
                          <td className="px-2 py-2"></td>
                          <td className="px-2 py-2">Grand Total</td>
                          <td className="px-2 py-2 text-right">{Number(payrollReport.section1.grand_total.salary || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{Number(payrollReport.section1.grand_total.lop || 0).toFixed(2)}</td>
                          {(payrollReport.earn_types || []).map((e) => (
                            <td key={`s1-grand-earn-${e.id}`} className="px-2 py-2 text-right">{Number((payrollReport.section1.grand_total.earn || {})[String(e.id)] || 0).toFixed(2)}</td>
                          ))}
                          <td className="px-2 py-2 text-right">{Number(payrollReport.section1.grand_total.gross_salary || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{Number(payrollReport.section1.grand_total.pf_amount || 0).toFixed(2)}</td>
                          {(payrollReport.deduction_types || []).map((d) => (
                            <td key={`s1-grand-ded-${d.id}`} className="px-2 py-2 text-right">{Number((payrollReport.section1.grand_total.deduction || {})[String(d.id)] || 0).toFixed(2)}</td>
                          ))}
                          <td className="px-2 py-2 text-right">{Number(payrollReport.section1.grand_total.total_deduction || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{Number(payrollReport.section1.grand_total.net_salary || 0).toFixed(2)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border rounded-lg overflow-auto">
                  <div className="px-3 py-2 bg-slate-50 border-b text-sm font-semibold text-slate-800">Pay Roll Report - Section 2</div>
                  <table className="min-w-[1100px] w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-2 py-2 text-left">S.No</th>
                        <th className="px-2 py-2 text-left">Staff Type</th>
                        {(payrollReport.section2?.bank_columns || []).map((bankName) => (
                          <React.Fragment key={`bhead-${bankName}`}>
                            <th className="px-2 py-2 text-right">{bankName} Total Request</th>
                            <th className="px-2 py-2 text-right">{bankName} Amount</th>
                          </React.Fragment>
                        ))}
                        <th className="px-2 py-2 text-right">Cash</th>
                        <th className="px-2 py-2 text-right">Total Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payrollReport.section2?.rows || []).map((row: any) => (
                        <tr key={`s2-${row.s_no}`} className="border-t">
                          <td className="px-2 py-2">{row.s_no}</td>
                          <td className="px-2 py-2">{row.staff_type}</td>
                          {(payrollReport.section2?.bank_columns || []).map((bankName) => (
                            <React.Fragment key={`s2-bank-${row.s_no}-${bankName}`}>
                              <td className="px-2 py-2 text-right">{Number((row.banks || {})[bankName]?.total_request || 0)}</td>
                              <td className="px-2 py-2 text-right">{Number((row.banks || {})[bankName]?.amount || 0).toFixed(2)}</td>
                            </React.Fragment>
                          ))}
                          <td className="px-2 py-2 text-right">{Number(row.cash || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{Number(row.total_salary || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {payrollReport.section2?.grand_total && (
                        <tr className="border-t bg-slate-100 font-semibold">
                          <td className="px-2 py-2"></td>
                          <td className="px-2 py-2">Grand Total</td>
                          {(payrollReport.section2?.bank_columns || []).map((bankName) => (
                            <React.Fragment key={`s2-grand-${bankName}`}>
                              <td className="px-2 py-2 text-right">{Number((payrollReport.section2.grand_total.banks || {})[bankName]?.total_request || 0)}</td>
                              <td className="px-2 py-2 text-right">{Number((payrollReport.section2.grand_total.banks || {})[bankName]?.amount || 0).toFixed(2)}</td>
                            </React.Fragment>
                          ))}
                          <td className="px-2 py-2 text-right">{Number(payrollReport.section2.grand_total.cash || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{Number(payrollReport.section2.grand_total.total_salary || 0).toFixed(2)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {salaryReportType === 'bank_staff' && bankStaffReport && (
              <div className="border rounded-lg overflow-auto">
                <div className="px-3 py-2 bg-slate-50 border-b text-sm font-semibold text-slate-800">
                  Bank-wise Staff Report ({bankStaffReport.count})
                </div>
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-2 py-2 text-left">S.No</th>
                      <th className="px-2 py-2 text-left">Staff ID</th>
                      <th className="px-2 py-2 text-left">Staff Name</th>
                      <th className="px-2 py-2 text-left">Department</th>
                      <th className="px-2 py-2 text-left">Bank</th>
                      <th className="px-2 py-2 text-left">A/C No</th>
                      <th className="px-2 py-2 text-left">IFSC Code</th>
                      <th className="px-2 py-2 text-right">Gross Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bankStaffReport.rows || []).map((row: any) => (
                      <tr key={`bank-staff-${row.staff_user_id}-${row.s_no}`} className="border-t">
                        <td className="px-2 py-2">{row.s_no}</td>
                        <td className="px-2 py-2">{row.staff_id}</td>
                        <td className="px-2 py-2">{row.staff_name}</td>
                        <td className="px-2 py-2">{row.department}</td>
                        <td className="px-2 py-2">{row.bank}</td>
                        <td className="px-2 py-2">{row.account_no || '-'}</td>
                        <td className="px-2 py-2">{row.ifsc_code || '-'}</td>
                        <td className="px-2 py-2 text-right">{Number(row.gross_salary || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {bankStaffReport.rows?.length === 0 && (
                      <tr>
                        <td className="px-2 py-6 text-center text-slate-500" colSpan={8}>No rows found for selected filter</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
