import { fetchWithAuth } from './fetchAuth';

export type CDAPFieldDefinition = {
  fieldCode: string;
  displayHeader: string;
  excelColumn: string;
  aliases: string[];
};

export interface CdapTemplate {
  id: string;
  key: string;
  name: string;
  headerRowLine: number;
  sheetNumber: number;
  fieldDefinitions: CDAPFieldDefinition[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const API_BASE = '/api/obe';

function normalizeTemplate(template: any): CdapTemplate {
  return {
    id: String(template.id || ''),
    key: String(template.key || '').trim(),
    name: String(template.name || '').trim(),
    headerRowLine: Number(template.header_row_line ?? template.headerRowLine ?? 12),
    sheetNumber: Number(template.sheet_number ?? template.sheetNumber ?? 1),
    fieldDefinitions: Array.isArray(template.field_definitions)
      ? template.field_definitions.map((field: any) => ({
          fieldCode: String(field.field_code || field.fieldCode || '').trim(),
          displayHeader: String(field.display_header || field.displayHeader || '').trim(),
          excelColumn: String(field.excel_column || field.excelColumn || '').trim(),
          aliases: Array.isArray(field.aliases) ? field.aliases.map(String) : String(field.aliases || '').split(',').map((item: string) => item.trim()).filter(Boolean),
        }))
      : [],
    isActive: Boolean(template.is_active ?? template.isActive),
    createdAt: template.created_at || template.createdAt,
    updatedAt: template.updated_at || template.updatedAt,
  };
}

function templateToPayload(template: Partial<CdapTemplate>) {
  return {
    key: template.key,
    name: template.name,
    header_row_line: template.headerRowLine,
    sheet_number: template.sheetNumber,
    field_definitions: template.fieldDefinitions?.map((field) => ({
      field_code: field.fieldCode,
      display_header: field.displayHeader,
      excel_column: field.excelColumn,
      aliases: field.aliases,
    })),
    is_active: template.isActive,
  };
}

function makeTemplateKey(name: string) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function fetchCdapTemplates(): Promise<CdapTemplate[]> {
  const response = await fetchWithAuth(`${API_BASE}/cdap-templates`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to load templates: ${response.statusText}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data.map(normalizeTemplate) : [];
}

export async function fetchCdapTemplate(templateId: string): Promise<CdapTemplate> {
  const response = await fetchWithAuth(`${API_BASE}/cdap-templates/${templateId}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to load template: ${response.statusText}`);
  }
  const data = await response.json();
  return normalizeTemplate(data);
}

export async function saveCdapTemplate(template: Partial<CdapTemplate>): Promise<CdapTemplate> {
  const payload = templateToPayload(template);
  const method = template.id ? 'PUT' : 'POST';
  const url = template.id ? `${API_BASE}/cdap-templates/${template.id}` : `${API_BASE}/cdap-templates`;
  const response = await fetchWithAuth(url, {
    method,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.clone().json().catch(() => null);
    throw new Error(data?.detail || `Failed to save template: ${response.statusText}`);
  }
  const data = await response.json();
  return normalizeTemplate(data);
}

export function createEmptyCdapTemplate(): CdapTemplate {
  return {
    id: '',
    key: '',
    name: '',
    headerRowLine: 12,
    sheetNumber: 1,
    fieldDefinitions: [
      { fieldCode: 'unit', displayHeader: 'Unit', excelColumn: 'A', aliases: ['UNIT', 'Unit', 'Module', 'Unit No'] },
      { fieldCode: 'unit_name', displayHeader: 'Syllabus (Unit Name)', excelColumn: 'B', aliases: ['SYLLABUS (UNIT NAME)', 'Unit Name', 'Module Title'] },
      { fieldCode: 'co_outcome', displayHeader: 'Outcome (CO)', excelColumn: 'C', aliases: ['OUTCOME (WRITE THE CO)', 'Course Outcome', 'CO'] },
      { fieldCode: 'content_type', displayHeader: 'Content Type', excelColumn: 'D', aliases: ['Content type', 'Type of Content', 'Theory/Lab'] },
      { fieldCode: 'part_no', displayHeader: 'Part No.', excelColumn: 'E', aliases: ['PART NO.', 'Part', 'Section No'] },
      { fieldCode: 'topics', displayHeader: 'Topics to be Covered', excelColumn: 'F', aliases: ['TOPICS TO BE COVERED (SYLLBUS TOPICS)', 'Topics', 'Syllabus Topics'] },
      { fieldCode: 'sub_topics', displayHeader: 'Sub Topics', excelColumn: 'G', aliases: ['SUB TOPICS (WHAT TO BE TAUGHT)', 'Sub topics', 'Subtopics'] },
      { fieldCode: 'bt_level', displayHeader: 'BT Level', excelColumn: 'H', aliases: ['BT LEVEL', 'BTL', "Bloom's Level"] },
      { fieldCode: 'po1', displayHeader: 'PO1 Engineering Knowledge', excelColumn: 'J', aliases: ['PO1 Engineering knowledge', 'PO1'] },
      { fieldCode: 'po2', displayHeader: 'PO2 Problem Analysis', excelColumn: 'K', aliases: ['PO2 Problem analysis', 'PO2'] },
      { fieldCode: 'po3', displayHeader: 'PO3 Design & Solutions', excelColumn: 'L', aliases: ['PO3 Design/development of solutions', 'PO3'] },
      { fieldCode: 'po4', displayHeader: 'PO4 Investigations', excelColumn: 'M', aliases: ['PO4 Conduct investigations of complex problems', 'PO4'] },
      { fieldCode: 'po5', displayHeader: 'PO5 Modern Tool Usage', excelColumn: 'N', aliases: ['PO5 Engineering tool usage', 'PO5'] },
      { fieldCode: 'po6', displayHeader: 'PO6 Engineer & World', excelColumn: 'O', aliases: ['PO6 Engineer and the World', 'PO6'] },
      { fieldCode: 'po7', displayHeader: 'PO7 Ethics', excelColumn: 'P', aliases: ['PO7 Ethics', 'PO7'] },
      { fieldCode: 'po8', displayHeader: 'PO8 Teamwork', excelColumn: 'Q', aliases: ['PO8 Individual and collaborative teamwork', 'PO8'] },
      { fieldCode: 'po9', displayHeader: 'PO9 Communication', excelColumn: 'R', aliases: ['PO9 Communication', 'PO9'] },
      { fieldCode: 'po10', displayHeader: 'PO10 Project Finance', excelColumn: 'S', aliases: ['PO10 Project management and finance', 'PO10'] },
      { fieldCode: 'po11', displayHeader: 'PO11 Life Long Learning', excelColumn: 'T', aliases: ['PO11 Life long learning', 'PO11'] },
      { fieldCode: 'pso1', displayHeader: 'PSO1', excelColumn: 'U', aliases: ['PSO1'] },
      { fieldCode: 'pso2', displayHeader: 'PSO2', excelColumn: 'V', aliases: ['PSO2'] },
      { fieldCode: 'pso3', displayHeader: 'PSO3', excelColumn: 'W', aliases: ['PSO3'] },
      { fieldCode: 'total_hours', displayHeader: 'Total Hours Required', excelColumn: 'X', aliases: ['TOTAL HOURS REQUIRED', 'Hours', 'Contact Hours'] },
      { fieldCode: 'material_ref', displayHeader: 'Material Reference', excelColumn: 'Y', aliases: ['MATERIAL REFERENCE (TEXT AND REF BOOKS)', 'References'] },
      { fieldCode: 'learning_support', displayHeader: 'Learning Support Links', excelColumn: 'Z', aliases: ['LEARNING SUPPORT (LINKS)', 'Links', 'Web Resources'] },
      { fieldCode: 'special_activity', displayHeader: 'Special Activity', excelColumn: 'AA', aliases: ['SPECIAL ACTIVITY', 'Seminar Topics'] },
      { fieldCode: 'ssa1', displayHeader: 'SSA 1 (Topics)', excelColumn: 'AB', aliases: ['SSA1 (Topics)', 'Self Study Assignment 1'] },
      { fieldCode: 'fa1', displayHeader: 'FA 1', excelColumn: 'AC', aliases: ['FA 1', 'Formative Assessment 1'] },
      { fieldCode: 'cia_bank', displayHeader: 'CIA Question Bank', excelColumn: 'AD', aliases: ['CIA Question bank', 'Question Bank', 'CIA'] },
      { fieldCode: 'ssa2', displayHeader: 'SSA 2 (Topics)', excelColumn: 'AE', aliases: ['SSA 2 (Topics)', 'Self Study Assignment 2'] },
      { fieldCode: 'fa2', displayHeader: 'FA 2', excelColumn: 'AF', aliases: ['FA 2', 'Formative Assessment 2'] },
      { fieldCode: 'activity', displayHeader: 'Activity', excelColumn: 'AG', aliases: ['ACTIVITY', 'Classroom Activity'] },
    ],
    isActive: false,
  };
}

export function buildTemplateKey(name: string): string {
  return makeTemplateKey(name);
}
