import { apiClient } from './auth';
import { getApiBaseCandidates } from './apiBase';

function trimTrailingSlashes(value: string): string {
  return String(value || '').replace(/\/+$/, '');
}

function getSalaryBaseCandidates(): string[] {
  const roots: string[] = [];

  const addRootVariants = (base: string) => {
    const b = trimTrailingSlashes(base);
    if (!b) return;
    roots.push(`${b}/api/staff-salary/salary`);
  };

  // In local/dev setups, prefer the actively running Django server first.
  addRootVariants('http://127.0.0.1:8000');
  addRootVariants('http://localhost:8000');

  // Then try same-origin for reverse-proxy deployments.
  if (typeof window !== 'undefined' && window.location?.origin) {
    addRootVariants(window.location.origin);
  }

  // Finally, fall back to configured API candidates.
  const apiBases = getApiBaseCandidates();
  for (const b of apiBases) {
    addRootVariants(b);
  }

  // De-duplicate while preserving priority order.
  return Array.from(new Set(roots));
}

async function getWithFallback(path: string, config?: any) {
  const roots = getSalaryBaseCandidates();
  let lastError: any;
  for (const root of roots) {
    try {
      const res = await apiClient.get(`${root}${path}`, config);
      return res.data;
    } catch (err: any) {
      lastError = err;
      // Retry on path/base mismatch and similar transport errors.
      const status = err?.response?.status;
      if (status && status !== 404) {
        throw err;
      }
    }
  }
  throw lastError;
}

async function postWithFallback(path: string, payload?: any, config?: any) {
  const roots = getSalaryBaseCandidates();
  let lastError: any;
  for (const root of roots) {
    try {
      const res = await apiClient.post(`${root}${path}`, payload, config);
      return res.data;
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      if (status && status !== 404) {
        throw err;
      }
    }
  }
  throw lastError;
}

function isExcelDownloadResponse(res: any): boolean {
  const contentType = String(res?.headers?.['content-type'] || '').toLowerCase();
  const disposition = String(res?.headers?.['content-disposition'] || '').toLowerCase();

  if (contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
    return true;
  }

  if (disposition.includes('.xlsx') || disposition.includes('attachment')) {
    return true;
  }

  return false;
}

function isSalaryReportPayload(data: any): boolean {
  return !!data && typeof data === 'object' && typeof data.report_type === 'string' && !!data.report;
}

export async function getSalaryDeclarations(params?: { department_id?: string }) {
  return getWithFallback('/declarations/', { params });
}

export async function saveSalaryDeclarations(items: any[]) {
  return postWithFallback('/declarations/', { items });
}

export async function getSalaryBankDeclarations() {
  return getWithFallback('/bank_declarations/');
}

export async function saveSalaryBankDeclarations(items: any[]) {
  return postWithFallback('/bank_declarations/', { items });
}

export async function getPfConfig() {
  return getWithFallback('/pf_config/');
}

export async function savePfConfig(payload: any) {
  return postWithFallback('/pf_config/', payload);
}

export async function getDeductionTypes() {
  return getWithFallback('/deduction_types/');
}

export async function saveDeductionTypes(items: any[]) {
  return postWithFallback('/deduction_types/', { items });
}

export async function getEarnTypes() {
  return getWithFallback('/earn_types/');
}

export async function saveEarnTypes(items: any[]) {
  return postWithFallback('/earn_types/', { items });
}

export async function getEmiPlans(params?: { staff_user_id?: number }) {
  return getWithFallback('/emi_plans/', { params });
}

export async function saveEmiPlans(items: any[]) {
  return postWithFallback('/emi_plans/', { items });
}

export async function getSalaryFormulas() {
  return getWithFallback('/formulas/');
}

export async function saveSalaryFormulas(expressions: Record<string, string>) {
  return postWithFallback('/formulas/', { expressions });
}

export async function getMonthlySalarySheet(month: string, department_id?: string) {
  const params: any = { month };
  if (department_id) params.department_id = department_id;
  return getWithFallback('/monthly_sheet/', { params });
}

export async function saveMonthlySalarySheet(month: string, items: any[]) {
  return postWithFallback('/monthly_sheet/', { month, items });
}

export async function downloadMonthlySalarySheet(month: string, department_id?: string) {
  const params: any = { month };
  if (department_id) params.department_id = department_id;

  const roots = getSalaryBaseCandidates();
  let lastError: any;
  for (const root of roots) {
    try {
      const res = await apiClient.get(`${root}/monthly_sheet_download/`, {
        params,
        responseType: 'blob',
      });
      if (!isExcelDownloadResponse(res)) {
        lastError = new Error('Unexpected non-Excel response while downloading monthly sheet');
        continue;
      }
      return res;
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      if (status && status !== 404) {
        throw err;
      }
    }
  }
  throw lastError;
}

export async function publishSalaryMonth(month: string, department_id?: string, is_published?: boolean) {
  return postWithFallback('/publish_month/', { month, department_id, is_published });
}

export async function getSalaryReport(params: { month: string; report_type: 'payroll' | 'bank_staff'; bank?: string }) {
  const roots = getSalaryBaseCandidates();
  let lastError: any;
  for (const root of roots) {
    try {
      const res = await apiClient.get(`${root}/salary_reports/`, { params });
      if (!isSalaryReportPayload(res?.data)) {
        lastError = new Error('Unexpected salary report payload');
        continue;
      }
      return res.data;
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      if (status && status !== 404) {
        throw err;
      }
    }
  }
  throw lastError;
}

export async function downloadSalaryReportExcel(params: { month: string; report_type: 'payroll' | 'bank_staff'; bank?: string }) {
  const queryParams: any = { ...params, export: 'excel' };

  const roots = getSalaryBaseCandidates();
  let lastError: any;
  for (const root of roots) {
    try {
      const res = await apiClient.get(`${root}/salary_reports/`, {
        params: queryParams,
        responseType: 'blob',
      });
      if (!isExcelDownloadResponse(res)) {
        lastError = new Error('Unexpected non-Excel response while downloading salary report');
        continue;
      }
      return res;
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      if (status && status !== 404) {
        throw err;
      }
    }
  }
  throw lastError;
}

export async function getMySalaryReceipts(month?: string) {
  const params: any = {};
  if (month) params.month = month;
  return getWithFallback('/my_receipts/', { params });
}
