/**
 * PosterMakerPage.tsx
 *
 * Dynamic Canva Brand Template poster maker.
 *
 * Flow:
 *   1. Load live Canva Brand Templates that support autofill datasets
 *   2. User selects one Brand Template
 *   3. IDCS renders inputs directly from the template's Canva dataset fields
 *   4. Entered values are sent straight into Canva autofill via Django → n8n → Canva
 *   5. User downloads the generated poster or opens it in Canva
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Info,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  getBrandTemplateDataset,
  listUserBrandTemplates,
  type CanvaBrandTemplateItem,
} from '../../services/canva/CanvaTemplateService';
import fetchWithAuth from '../../services/fetchAuth';
import { buildDocUrl } from '../../services/proposalService';

type Step = 'select-template' | 'fill-form' | 'event-form' | 'generating' | 'result';
type CanvaDatasetField = { type: 'text' | 'image' | 'chart' | string };

type PosterMakerPageProps = {
  embedded?: boolean;
  staffMode?: boolean;
};

type PosterResult = {
  design_id: string;
  export_url: string;
  dataUrl: string;
  canva_edit_url: string;
  proposal_docx_url?: string;
  proposal_docx_name?: string;
  warning?: string;
};

type DepartmentOption = {
  id: number;
  code: string;
  name: string;
  short_name?: string;
};

type ExpenseLineKey =
  | 'chief_guest_honorarium'
  | 'travelling_allowance'
  | 'refreshment_chief_guest'
  | 'refreshment_external_participants'
  | 'lunch_chief_guest'
  | 'lunch_external_participants'
  | 'prize_award'
  | 'local_travel'
  | 'decorations'
  | 'welcome_kit'
  | 'certificates'
  | 'miscellaneous';

type BudgetLine = {
  category: string;
  subType: string;
  unitPrice: string;
  qty: string;
  total: string;
  notes: string;
};

type IncomeLine = {
  source: string;
  unitPrice: string;
  qty: string;
  total: string;
};

type ProposalOfficeForm = {
  modeOfEvent: string;
  expertCategory: string;
  isEventRepeated: string;
  addressedPOs: string[];
  copoAttainment: string;
  remarks: string;
  approvedBudget: string;
};

const PROPOSAL_NATURE_OPTIONS = [
  'FDP',
  'Seminar',
  'Guest Lecture',
  'Workshop',
  'Symposium',
  'Conference',
  'Others',
];

const PROPOSAL_PARTICIPANT_OPTIONS = [
  'Faculty – Internal',
  'Faculty – External',
  'Faculty – Internal / External',
  'Students – Internal',
  'Students – External',
  'Students – Internal / External',
  'Faculty – Internal / External; Students – Internal / External',
  'Faculty – Internal; Students – Internal',
  'Faculty – External; Students – External',
  'Faculty – Internal / External; Students – Internal',
  'Faculty – Internal; Students – Internal / External',
];

const MODE_OF_EVENT_OPTIONS = ['Online', 'Offline'];
const YES_NO_OPTIONS = ['Yes', 'No'];
const PO_OPTIONS = Array.from({ length: 12 }, (_, i) => `PO${i + 1}`);

const PROPOSAL_MIRRORED_FIELDS = new Set(['organizer_department', 'event_type', 'participants']);

const HONORARIUM_GROUPS = [
  { value: 'A', label: 'A — Rs. 5000 per session', unitPrice: '5000.00', hint: 'Experts from centrally funded institutions, national labs, Fortune 500, and top NIRF institutions.' },
  { value: 'B', label: 'B — Rs. 2500 per session', unitPrice: '2500.00', hint: 'Other academics, industry HR/rank leaders, and professional societies.' },
  { value: 'C', label: 'C — Rs. 1000 per session', unitPrice: '1000.00', hint: 'Industry cadres, skilled staff, alumni, inter/intra department lecturers, and similar categories.' },
];

const TRAVEL_GROUPS = [
  { value: 'A', label: 'A — Approval based (max Rs. 5000)', hint: 'Flight, train II-tier AC, car at Rs. 6/km, or bus reimbursement based on approval.' },
  { value: 'B', label: 'B — Lump-sum', hint: 'Trichy District/within 50 km: Rs. 300. Above 50 km: Rs. 6 per km.' },
  { value: 'C', label: 'C — No TA', hint: 'No travelling allowance will be provided.' },
];

const TRAVEL_SUB_TYPES = [
  { value: 'within_50', label: 'Within 50 km — Rs. 300', unitPrice: '300.00' },
  { value: 'above_50', label: 'Above 50 km — Rs. 6 per km', unitPrice: '6.00' },
  { value: 'custom', label: 'Custom approved amount', unitPrice: '' },
];

const BUDGET_LINE_META: Array<{
  key: ExpenseLineKey;
  label: string;
  description?: string;
  supportsCategory?: 'honorarium' | 'travel';
  totalReadOnly?: boolean;
}> = [
  { key: 'chief_guest_honorarium', label: 'Chief Guest Honorarium', description: 'Select the A/B/C expert category from the guidelines.', supportsCategory: 'honorarium' },
  { key: 'travelling_allowance', label: 'Travelling Allowance', description: 'Select the A/B/C travel rule based on the guideline page.', supportsCategory: 'travel' },
  { key: 'refreshment_chief_guest', label: 'Refreshment (Chief Guest)', totalReadOnly: true },
  { key: 'refreshment_external_participants', label: 'Refreshment (External Participants)', totalReadOnly: true },
  { key: 'lunch_chief_guest', label: 'Lunch (Chief Guest)', totalReadOnly: true },
  { key: 'lunch_external_participants', label: 'Lunch (External Participants)', totalReadOnly: true },
  { key: 'prize_award', label: 'Prize/Award to Participants (per event)', totalReadOnly: true },
  { key: 'local_travel', label: 'Local Travel', totalReadOnly: true },
  { key: 'decorations', label: 'Decorations (Only College level events)', totalReadOnly: true },
  { key: 'welcome_kit', label: 'Welcome Kit', totalReadOnly: true },
  { key: 'certificates', label: 'Certificates', totalReadOnly: true },
  { key: 'miscellaneous', label: 'Miscellaneous', description: 'Enter a custom total or notes if an extra approved expense is needed.' },
];

function createDefaultBudgetLines(): Record<ExpenseLineKey, BudgetLine> {
  return {
    chief_guest_honorarium: { category: '', subType: '', unitPrice: '', qty: '', total: '', notes: '' },
    travelling_allowance: { category: '', subType: '', unitPrice: '', qty: '', total: '', notes: '' },
    refreshment_chief_guest: { category: '', subType: '', unitPrice: '300.00', qty: '', total: '', notes: '' },
    refreshment_external_participants: { category: '', subType: '', unitPrice: '20.00', qty: '', total: '', notes: '' },
    lunch_chief_guest: { category: '', subType: '', unitPrice: '500.00', qty: '', total: '', notes: '' },
    lunch_external_participants: { category: '', subType: '', unitPrice: '100.00', qty: '', total: '', notes: '' },
    prize_award: { category: '', subType: '', unitPrice: '750.00', qty: '', total: '', notes: '' },
    local_travel: { category: '', subType: '', unitPrice: '300.00', qty: '', total: '', notes: '' },
    decorations: { category: '', subType: '', unitPrice: '2000.00', qty: '', total: '', notes: '' },
    welcome_kit: { category: '', subType: '', unitPrice: '40.00', qty: '', total: '', notes: '' },
    certificates: { category: '', subType: '', unitPrice: '20.00', qty: '', total: '', notes: '' },
    miscellaneous: { category: '', subType: '', unitPrice: '', qty: '', total: '', notes: '' },
  };
}

function createDefaultIncomeLines(): IncomeLine[] {
  return [
    { source: '', unitPrice: '', qty: '', total: '' },
    { source: '', unitPrice: '', qty: '', total: '' },
  ];
}

function createDefaultProposalOffice(): ProposalOfficeForm {
  return {
    modeOfEvent: '',
    expertCategory: '',
    isEventRepeated: '',
    addressedPOs: [],
    copoAttainment: '',
    remarks: '',
    approvedBudget: '',
  };
}

function deriveExpertCategoryFromNature(nature: string): string {
  const value = nature.trim().toLowerCase();
  if (!value) return '';
  if (value.includes('workshop') || value.includes('fdp') || value.includes('seminar')) return 'Academic / Skill Development';
  if (value.includes('guest lecture')) return 'Guest Lecture';
  if (value.includes('symposium') || value.includes('conference')) return 'Institution / Conference Event';
  return nature;
}

function deriveExpertCategoryFromHonorarium(category: string): string {
  const value = category.trim().toUpperCase();
  return ['A', 'B', 'C'].includes(value) ? value : '';
}

function parseMoney(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function autoTotal(unitPrice: string, qty: string): string {
  const unit = parseMoney(unitPrice);
  const quantity = parseMoney(qty);
  if (unit == null || quantity == null) return '';
  return formatMoney(unit * quantity);
}

function normalizeBudgetLine(key: ExpenseLineKey, line: BudgetLine): BudgetLine {
  const next = { ...line };
  if (key === 'travelling_allowance') {
    if (next.category !== 'B') {
      next.subType = '';
    }
  }

  if (key === 'miscellaneous') {
    return next;
  }

  next.total = autoTotal(next.unitPrice, next.qty);
  return next;
}

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  organizer_department: 'Organizer Department',
  event_type: 'Nature of Event',
  event_name: 'Title of Event',
  event_title: 'Title of Event',
  title: 'Title of Event',
  start_day: 'Event Start Day',
  end_day: 'Event End Day',
  start_month: 'Event Month',
  year: 'Event Year',
  event_date: 'Event Date',
  event_time: 'Event Time',
  venue_location: 'Venue',
  participants: 'Participants',
  committee_member_1_name: 'Coordinator',
  committee_member_1_role: 'Coordinator Role',
  committee_member_2_name: 'Co-Coordinator',
  committee_member_2_role: 'Co-Coordinator Role',
  chief_guest_name: 'Resource Person',
  chief_guest_position: 'Designation',
  chief_guest_company: 'Affiliation / Organization',
  chief_guest_location: 'Affiliation / Location',
  website_text: 'Website / Notes',
  instagram_handle: 'Instagram Handle',
};

const FIELD_ORDER: Record<string, number> = {
  organizer_department: 1,
  event_type: 2,
  event_name: 3,
  event_title: 3,
  title: 3,
  start_day: 4,
  end_day: 5,
  start_month: 6,
  year: 7,
  event_date: 8,
  participants: 9,
  committee_member_1_name: 10,
  committee_member_1_role: 10.5,
  committee_member_2_name: 11,
  committee_member_2_role: 11.5,
  chief_guest_name: 12,
  chief_guest_position: 13,
  chief_guest_company: 14,
  chief_guest_location: 15,
  venue_location: 16,
  event_time: 17,
};

function humanizeFieldKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function getFieldLabel(fieldKey: string): string {
  return FIELD_LABEL_OVERRIDES[fieldKey] || humanizeFieldKey(fieldKey);
}

function buildDepartmentPosterValue(name: string): string {
  return `DEPARTMENT OF ${name.trim().toUpperCase()}`;
}

function stripDepartmentPrefix(value: string): string {
  return value.replace(/^DEPARTMENT OF\s+/i, '').trim();
}

function normalizeFieldToken(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isDepartmentMappedField(fieldKey: string): boolean {
  const token = normalizeFieldToken(fieldKey);
  if (!token) return false;
  if (token === 'organizerdepartment') return true;
  return token.includes('department') || /^dept\d*$/.test(token);
}

function isEventDateMappedField(fieldKey: string): boolean {
  const token = normalizeFieldToken(fieldKey);
  if (!token) return false;
  return token.includes('eventdate') || token === 'date' || token.endsWith('date');
}

function isEventTimeMappedField(fieldKey: string): boolean {
  const token = normalizeFieldToken(fieldKey);
  if (!token) return false;
  return token.includes('eventtime') || token === 'time' || token.endsWith('time');
}

function formatLongDateFromIso(isoDate: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  if (!year || !month || !day) return '';
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dateObj.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateObj);
}

function buildPrefixedEventTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `From ${trimmed} onwards`;
}

function buildPlaceholder(fieldKey: string, type: string): string {
  const label = getFieldLabel(fieldKey);
  if (type === 'image') return `Upload image for ${label}`;
  return `Enter ${label}`;
}

async function uploadImageToMedia(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetchWithAuth('/api/canva/upload-media', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Failed to upload image');
  const data = await res.json() as { url: string };
  return data.url;
}

export default function PosterMakerPage({ embedded = false, staffMode = false }: PosterMakerPageProps) {
  const [step, setStep] = useState<Step>('select-template');
  const [templates, setTemplates] = useState<CanvaBrandTemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CanvaBrandTemplateItem | null>(null);
  const [templateDataset, setTemplateDataset] = useState<Record<string, CanvaDatasetField>>({});
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({});
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [genProgress, setGenProgress] = useState('');
  const [result, setResult] = useState<PosterResult | null>(null);
  const [error, setError] = useState('');
  const [format, setFormat] = useState<'png' | 'pdf'>('png');
  const [canvaEditMode, setCanvaEditMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedBack, setUploadedBack] = useState(false);
  const [proposalFrom, setProposalFrom] = useState('');
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [departmentsError, setDepartmentsError] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedEventDateIso, setSelectedEventDateIso] = useState('');
  const [selectedEventTimeRaw, setSelectedEventTimeRaw] = useState('');
  const [proposalBudget, setProposalBudget] = useState<Record<ExpenseLineKey, BudgetLine>>(() => createDefaultBudgetLines());
  const [proposalIncome, setProposalIncome] = useState<IncomeLine[]>(() => createDefaultIncomeLines());
  const [proposalOffice, setProposalOffice] = useState<ProposalOfficeForm>(() => createDefaultProposalOffice());
  const [forwardingToBranding, setForwardingToBranding] = useState(false);
  const [forwardedToBranding, setForwardedToBranding] = useState(false);
  const [forwardError, setForwardError] = useState('');
  const uploadEditRef = useRef<HTMLInputElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const canvaPopupRef = useRef<Window | null>(null);

  const datasetEntries = Object.entries(templateDataset);
  const textFields = datasetEntries.filter(([, def]) => def.type === 'text');
  const imageFields = datasetEntries.filter(([, def]) => def.type === 'image');
  const chartFields = datasetEntries.filter(([, def]) => def.type === 'chart');
  const sortedTextFields = [...textFields].sort(([a], [b]) => {
    const left = FIELD_ORDER[a] ?? Number.MAX_SAFE_INTEGER;
    const right = FIELD_ORDER[b] ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return getFieldLabel(a).localeCompare(getFieldLabel(b));
  });
  const mappedDepartmentFieldKeys = textFields
    .map(([key]) => key)
    .filter((key) => isDepartmentMappedField(key));
  const mappedEventDateFieldKeys = textFields
    .map(([key]) => key)
    .filter((key) => isEventDateMappedField(key));
  const mappedEventTimeFieldKeys = textFields
    .map(([key]) => key)
    .filter((key) => isEventTimeMappedField(key));
  const hasDepartmentMapping = mappedDepartmentFieldKeys.length > 0;
  const hasEventDateMapping = mappedEventDateFieldKeys.length > 0;
  const hasEventTimeMapping = mappedEventTimeFieldKeys.length > 0;
  const hasRequiredMappings =
    (!hasDepartmentMapping || !!selectedDepartmentId) &&
    (!hasEventDateMapping || !!selectedEventDateIso) &&
    (!hasEventTimeMapping || !!selectedEventTimeRaw);
  const supportedFieldCount = textFields.length + imageFields.length;
  const hasFilledFields =
    textFields.some(([key]) => (fieldValues[key] ?? '').trim()) ||
    imageFields.some(([key]) => !!imageFiles[key]);
  const methodTitle = 'Canva poster making';
  const resultTitle = selectedTemplate?.title || methodTitle;

  const clearDynamicState = () => {
    Object.values(imagePreviews).forEach((url) => URL.revokeObjectURL(url));
    setTemplateDataset({});
    setFieldValues({});
    setImageFiles({});
    setImagePreviews({});
    setDatasetError('');
    setSelectedEventDateIso('');
    setSelectedEventTimeRaw('');
  };

  const loadDepartments = async () => {
    setDepartmentsLoading(true);
    setDepartmentsError('');
    try {
      const [deptRes, myInfoRes] = await Promise.all([
        fetchWithAuth('/api/canva/department-options', { method: 'GET' }),
        fetchWithAuth('/api/academic-calendar/proposals/my-department-info/', { method: 'GET' }),
      ]);
      const deptData = await deptRes.json() as { results?: DepartmentOption[] };
      const depts: DepartmentOption[] = Array.isArray(deptData.results) ? deptData.results : [];
      setDepartments(depts);

      // Auto-select the staff's own department so the proposal is always tagged correctly
      if (myInfoRes.ok) {
        const myInfo = await myInfoRes.json() as { department_id?: number | null; department_name?: string };
        if (myInfo.department_id) {
          const matched = depts.find((d) => d.id === myInfo.department_id);
          if (matched) {
            setSelectedDepartmentId(matched.id);
          }
        }
      }
    } catch (e: unknown) {
      setDepartmentsError(e instanceof Error ? e.message : 'Failed to load departments.');
      setDepartments([]);
    } finally {
      setDepartmentsLoading(false);
    }
  };

  const selectedDepartment = departments.find((item) => item.id === selectedDepartmentId) ?? null;
  const totalBudgetAmount = Object.values(proposalBudget).reduce((sum, line) => sum + (parseMoney(line.total) ?? 0), 0);
  const totalIncomeAmount = proposalIncome.reduce((sum, line) => sum + (parseMoney(line.total) ?? 0), 0);
  const amountRequestedFromInstitute = Math.max(totalBudgetAmount - totalIncomeAmount, 0);

  const setMappedDepartmentValue = (departmentName: string) => {
    const mappedValue = buildDepartmentPosterValue(departmentName);
    setFieldValues((prev) => {
      const next = { ...prev };
      mappedDepartmentFieldKeys.forEach((fieldKey) => {
        next[fieldKey] = mappedValue;
      });
      return next;
    });
  };

  const setMappedEventDateValue = (isoDate: string) => {
    const formattedDate = formatLongDateFromIso(isoDate);
    setFieldValues((prev) => {
      const next = { ...prev };
      mappedEventDateFieldKeys.forEach((fieldKey) => {
        next[fieldKey] = formattedDate;
      });
      return next;
    });
  };

  const setMappedEventTimeValue = (timeValue: string) => {
    const prefixedTime = buildPrefixedEventTime(timeValue);
    setFieldValues((prev) => {
      const next = { ...prev };
      mappedEventTimeFieldKeys.forEach((fieldKey) => {
        next[fieldKey] = prefixedTime;
      });
      return next;
    });
  };

  const handleEventDateChange = (isoDate: string) => {
    setSelectedEventDateIso(isoDate);
    setMappedEventDateValue(isoDate);
  };

  const handleEventTimeChange = (timeValue: string) => {
    setSelectedEventTimeRaw(timeValue);
    setMappedEventTimeValue(timeValue);
  };

  const handleDepartmentSelect = (idValue: string) => {
    const id = Number(idValue);
    const next = departments.find((item) => item.id === id) ?? null;
    setSelectedDepartmentId(next?.id ?? null);
    if (next) {
      setMappedDepartmentValue(next.name);
    } else {
      setFieldValues((prev) => {
        const updated = { ...prev };
        mappedDepartmentFieldKeys.forEach((fieldKey) => {
          updated[fieldKey] = '';
        });
        return updated;
      });
    }
  };

  const updateBudgetLine = (key: ExpenseLineKey, patch: Partial<BudgetLine>) => {
    setProposalBudget((prev) => ({
      ...prev,
      [key]: normalizeBudgetLine(key, { ...prev[key], ...patch }),
    }));
  };

  const updateIncomeLine = (index: number, patch: Partial<IncomeLine>) => {
    setProposalIncome((prev) => prev.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      next.total = autoTotal(next.unitPrice, next.qty);
      return next;
    }));
  };

  const updateOfficeField = (key: keyof ProposalOfficeForm, value: string) => {
    setProposalOffice((prev) => ({ ...prev, [key]: value }));
  };

  const toggleAddressedPO = (po: string) => {
    setProposalOffice((prev) => {
      const exists = prev.addressedPOs.includes(po);
      return {
        ...prev,
        addressedPOs: exists
          ? prev.addressedPOs.filter((item) => item !== po)
          : [...prev.addressedPOs, po],
      };
    });
  };

  useEffect(() => {
    if (!selectedDepartment || !mappedDepartmentFieldKeys.length) return;
    setMappedDepartmentValue(selectedDepartment.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartmentId, mappedDepartmentFieldKeys.join('|')]);

  useEffect(() => {
    if (!selectedEventDateIso || !mappedEventDateFieldKeys.length) return;
    setMappedEventDateValue(selectedEventDateIso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventDateIso, mappedEventDateFieldKeys.join('|')]);

  useEffect(() => {
    if (!selectedEventTimeRaw || !mappedEventTimeFieldKeys.length) return;
    setMappedEventTimeValue(selectedEventTimeRaw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventTimeRaw, mappedEventTimeFieldKeys.join('|')]);

  const loadTemplates = async (query = '') => {
    setTemplatesLoading(true);
    setTemplatesError('');
    setSelectedTemplate(null);
    clearDynamicState();
    try {
      const items = await listUserBrandTemplates(query);
      const hydratedItems = await Promise.all(
        items.map(async (item) => {
          const thumbUrl = item.thumbnail?.url;
          if (!thumbUrl || thumbUrl.startsWith('data:')) return item;

          try {
            const res = await fetch(`/api/canva/thumbnail-proxy/?url=${encodeURIComponent(thumbUrl)}`);
            if (!res.ok) return item;
            const payload = await res.json().catch(() => ({} as { dataUrl?: string }));
            if (payload?.dataUrl) {
              return {
                ...item,
                thumbnail: { url: payload.dataUrl },
              };
            }
          } catch {
            // keep original thumbnail URL
          }

          return item;
        }),
      );
      setTemplates(hydratedItems);
    } catch (e: unknown) {
      setTemplatesError(e instanceof Error ? e.message : 'Failed to load Brand Templates.');
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    void loadDepartments();
    return () => {
      Object.values(imagePreviews).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadTemplates(searchQuery.trim());
  };

  const handleTemplateSelect = async (tpl: CanvaBrandTemplateItem) => {
    setSelectedTemplate(tpl);
    setStep('fill-form');
    setError('');
    setResult(null);
    clearDynamicState();
    setDatasetLoading(true);
    try {
      const dataset = await getBrandTemplateDataset(tpl.id);
      setTemplateDataset(dataset);
      if (!Object.keys(dataset).length) {
        setDatasetError('This Brand Template has no autofill dataset fields. Add data fields in Canva first.');
      }
    } catch (e: unknown) {
      setDatasetError(e instanceof Error ? e.message : 'Failed to load template dataset.');
    } finally {
      setDatasetLoading(false);
    }
  };

  const setFieldValue = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageChange = (key: string, file?: File) => {
    if (!file) return;
    if (imagePreviews[key]) URL.revokeObjectURL(imagePreviews[key]);
    setImageFiles((prev) => ({ ...prev, [key]: file }));
    setImagePreviews((prev) => ({ ...prev, [key]: URL.createObjectURL(file) }));
  };

  const removeImage = (key: string) => {
    if (imagePreviews[key]) URL.revokeObjectURL(imagePreviews[key]);
    setImageFiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setImagePreviews((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function handleGenerate() {
    if (!selectedTemplate) {
      setError('Please select a Brand Template first.');
      return;
    }
    if (!supportedFieldCount) {
      setError('This Brand Template has no supported text or image autofill fields.');
      return;
    }
    if (!hasFilledFields) {
      setError('Enter at least one field value before generating the poster.');
      return;
    }

    const mappedDepartmentValue = mappedDepartmentFieldKeys
      .map((fieldKey) => (fieldValues[fieldKey] ?? '').trim())
      .find((value) => !!value) || '';
    const mappedEventDateValue = mappedEventDateFieldKeys
      .map((fieldKey) => (fieldValues[fieldKey] ?? '').trim())
      .find((value) => !!value) || '';
    const departmentDocValue = selectedDepartment?.name || stripDepartmentPrefix(mappedDepartmentValue);
    if (!proposalFrom.trim()) {
      setError('Enter the "From" name for the Event Proposal document.');
      return;
    }
    if (!departmentDocValue) {
      setError('Select the Organizer Department before generating.');
      return;
    }
    if (hasDepartmentMapping && !selectedDepartmentId) {
      setError('Department mapping is mandatory for this template. Please select a department.');
      return;
    }
    if (hasEventDateMapping && !selectedEventDateIso) {
      setError('Event date mapping is mandatory. Please select an event date.');
      return;
    }
    if (hasEventTimeMapping && !selectedEventTimeRaw) {
      setError('Event time mapping is mandatory. Please enter the event time.');
      return;
    }
    if (!(fieldValues.event_type ?? '').trim()) {
      setError('Select the Nature for the Event Proposal document.');
      return;
    }
    if (!(fieldValues.participants ?? '').trim()) {
      setError('Select the Participants for the Event Proposal document.');
      return;
    }

    setStep('generating');
    setError('');
    setResult(null);

    try {
      const proposalData = {
        ...fieldValues,
        from_name: proposalFrom.trim(),
        organizer_department: mappedDepartmentValue,
        organizer_department_raw: departmentDocValue,
        organizer_department_doc: departmentDocValue,
        event_type: (fieldValues.event_type ?? '').trim(),
        event_title: (fieldValues.event_name ?? fieldValues.event_title ?? fieldValues.title ?? '').trim(),
        start_day: (fieldValues.start_day ?? '').trim(),
        end_day: (fieldValues.end_day ?? '').trim(),
        start_month: (fieldValues.start_month ?? '').trim(),
        year: (fieldValues.year ?? '').trim(),
        event_date: mappedEventDateValue,
        participants: (fieldValues.participants ?? '').trim(),
        coordinator: (fieldValues.committee_member_1_name ?? '').trim(),
        co_coordinator: (fieldValues.committee_member_2_name ?? '').trim(),
        resource_person: (fieldValues.chief_guest_name ?? '').trim(),
        designation: (fieldValues.chief_guest_position ?? '').trim(),
        resource_person_affiliation: [fieldValues.chief_guest_company, fieldValues.chief_guest_location].filter(Boolean).join(', '),
        budget: proposalBudget,
        income: proposalIncome,
        office: {
          ...proposalOffice,
          expertCategory: deriveExpertCategoryFromHonorarium(proposalBudget.chief_guest_honorarium.category) || proposalOffice.expertCategory,
          addressedPOs: proposalOffice.addressedPOs.join(', '),
          remarks: '',
          approvedBudget: proposalOffice.approvedBudget || formatMoney(totalBudgetAmount),
        },
        total_budget_amount: formatMoney(totalBudgetAmount),
        total_income_amount: formatMoney(totalIncomeAmount),
        amount_requested_from_institute: formatMoney(amountRequestedFromInstitute),
      };

      const fields: Record<string, { type: string; text?: string; url?: string }> = {};

      setGenProgress('Preparing Brand Template autofill fields…');
      for (const [fieldKey] of textFields) {
        const value = (fieldValues[fieldKey] ?? '').trim();
        if (value) fields[fieldKey] = { type: 'text', text: value };
      }

      if (imageFields.length > 0) {
        setGenProgress('Uploading images to server…');
      }
      for (const [fieldKey] of imageFields) {
        const file = imageFiles[fieldKey];
        if (!file) continue;
        const url = await uploadImageToMedia(file);
        fields[fieldKey] = { type: 'image', url };
      }

      if (!Object.keys(fields).length) {
        throw new Error('No autofill values were provided.');
      }

      setGenProgress('Sending exact Brand Template fields to Canva via n8n ⚡…');
      const res = await fetchWithAuth('/api/canva/poster-maker', {
        method: 'POST',
        body: JSON.stringify({
          brand_template_id: selectedTemplate.id,
          format,
          fields,
          proposal_data: proposalData,
        }),
      });

      const data = await res.json() as {
        design_id?: string;
        export_url?: string;
        dataUrl?: string;
        canva_edit_url?: string;
        proposal_docx_url?: string;
        proposal_docx_name?: string;
        warning?: string;
        detail?: string;
      };

      if (!res.ok || data.detail) {
        throw new Error(data.detail ?? `Server error (${res.status})`);
      }

      setGenProgress('Poster ready!');
      setResult({
        design_id: data.design_id ?? '',
        export_url: data.export_url ?? '',
        dataUrl: data.dataUrl ?? '',
        canva_edit_url: data.canva_edit_url ?? '',
        proposal_docx_url: data.proposal_docx_url ?? '',
        proposal_docx_name: data.proposal_docx_name ?? 'Event Proposal Format.docx',
        warning: data.warning,
      });
      setStep('result');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
      setStep('fill-form');
    }
  }

  async function handleDownload() {
    if (!result) return;
    if (result.dataUrl) {
      const a = document.createElement('a');
      a.href = result.dataUrl;
      a.download = `poster_${Date.now()}.${format}`;
      a.click();
    } else if (result.export_url) {
      window.open(result.export_url, '_blank');
    }
  }

  function handleUploadBack(file: File) {
    const objectUrl = URL.createObjectURL(file);
    setResult((prev) => {
      if (!prev) return prev;
      if (prev.dataUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.dataUrl);
      return { ...prev, dataUrl: objectUrl, export_url: '', canva_edit_url: prev.canva_edit_url };
    });
    setUploadedBack(true);
  }

  function reset() {
    setStep('select-template');
    setSelectedTemplate(null);
    clearDynamicState();
    setResult(null);
    setError('');
    setGenProgress('');
    setCanvaEditMode(false);
    setUploadedBack(false);
    setProposalFrom('');
    setSelectedDepartmentId(null);
    setProposalBudget(createDefaultBudgetLines());
    setProposalIncome(createDefaultIncomeLines());
    setProposalOffice(createDefaultProposalOffice());
    if (canvaPopupRef.current && !canvaPopupRef.current.closed) canvaPopupRef.current.close();
    canvaPopupRef.current = null;
  }

  // ── Staff: Forward to Branding ──────────────────────────────────────
  /** Try to build an ISO yyyy-MM-dd from the various date parts in fieldValues */
  function resolveIsoDate(primary?: string): string {
    // If already ISO
    if (primary && /^\d{4}-\d{2}-\d{2}$/.test(primary)) return primary;
    // Try to parse start_day / start_month / year from fieldValues
    const day = (fieldValues['start_day'] || '').replace(/\D/g, '');
    const monthRaw = (fieldValues['start_month'] || '').trim();
    const year = (fieldValues['year'] || '').trim();
    if (day && monthRaw && year) {
      const attempt = new Date(`${day} ${monthRaw} ${year}`);
      if (!isNaN(attempt.getTime())) return attempt.toISOString().slice(0, 10);
    }
    // Try parsing the primary string itself
    if (primary) {
      const attempt = new Date(primary);
      if (!isNaN(attempt.getTime())) return attempt.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }

  async function handleForwardToBranding() {
    if (!result || forwardingToBranding) return;
    setForwardingToBranding(true);
    setForwardError('');
    try {
      let posterUrl = result.export_url || '';
      let posterDataUrl = result.dataUrl || '';

      async function blobUrlToDataUrl(url: string): Promise<string> {
        try {
          const resp = await fetch(url);
          if (!resp.ok) return '';
          const blob = await resp.blob();
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.readAsDataURL(blob);
          });
        } catch {
          return '';
        }
      }

      // If the user imported a file back from Canva, we may have a blob: URL.
      // Blob URLs are not shareable across users/sessions, so convert to data: now.
      if (posterDataUrl.startsWith('blob:')) {
        const converted = await blobUrlToDataUrl(posterDataUrl);
        if (converted) posterDataUrl = converted;
      }

      // Canva export URLs can be short-lived; try storing a durable data-URL for previews.
      if (!posterDataUrl && posterUrl && format === 'png' && !posterUrl.startsWith('data:')) {
        try {
          const resp = await fetch(`/api/canva/thumbnail-proxy/?url=${encodeURIComponent(posterUrl)}`);
          if (resp.ok) {
            const j = await resp.json() as { dataUrl?: string };
            if (j.dataUrl) posterDataUrl = j.dataUrl;
          }
        } catch {
          // non-fatal; fall back to storing the URL only
        }
      }

      const dept = selectedDepartment;
      const mappedDepartmentValue = mappedDepartmentFieldKeys
        .map((fieldKey) => (fieldValues[fieldKey] ?? '').trim())
        .find((value) => !!value) || '';
      const mappedEventDateValue = mappedEventDateFieldKeys
        .map((fieldKey) => (fieldValues[fieldKey] ?? '').trim())
        .find((value) => !!value) || '';
      const startDate = selectedEventDateIso || resolveIsoDate(mappedEventDateValue);
      const endDate = (() => {
        const day = (fieldValues['end_day'] || fieldValues['start_day'] || '').replace(/\D/g, '');
        const monthRaw = (fieldValues['start_month'] || '').trim();
        const year = (fieldValues['year'] || '').trim();
        if (day && monthRaw && year) {
          const attempt = new Date(`${day} ${monthRaw} ${year}`);
          if (!isNaN(attempt.getTime())) return attempt.toISOString().slice(0, 10);
        }
        return startDate;
      })();
      const proposalPayload = {
        title: fieldValues['event_name'] || fieldValues['event_title'] || fieldValues['title'] || 'Untitled Event',
        department_id: dept?.id ?? null,
        department_name: dept?.name || stripDepartmentPrefix(mappedDepartmentValue),
        event_type: fieldValues['event_type'] || '',
        start_date: startDate,
        end_date: endDate,
        venue: fieldValues['venue_location'] || '',
        mode: proposalOffice.modeOfEvent || '',
        expert_category: proposalOffice.expertCategory || '',
        is_repeated: proposalOffice.isEventRepeated === 'Yes',
        participants: fieldValues['participants'] || '',
        coordinator_name: fieldValues['committee_member_1_name'] || '',
        co_coordinator_name: fieldValues['committee_member_2_name'] || '',
        chief_guest_name: fieldValues['chief_guest_name'] || '',
        chief_guest_designation: fieldValues['chief_guest_position'] || '',
        chief_guest_affiliation: fieldValues['chief_guest_company'] || '',
        poster_url: posterUrl,
        poster_data_url: posterDataUrl,
        proposal_doc_url: result.proposal_docx_url || '',
        proposal_doc_name: result.proposal_docx_name || '',
        canva_design_id: result.design_id || '',
        canva_edit_url: result.canva_edit_url || '',
        proposal_data: {
          ...fieldValues,
          proposalFrom,
          budget: proposalBudget,
          income: proposalIncome,
          office: proposalOffice,
          selectedDepartmentId,
        },
      };
      const res = await fetchWithAuth('/api/academic-calendar/proposals/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalPayload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.detail || `Server error (${res.status})`);
      }
      setForwardedToBranding(true);
    } catch (e: unknown) {
      setForwardError(e instanceof Error ? e.message : 'Failed to forward to Branding team. Please try again.');
    } finally {
      setForwardingToBranding(false);
    }
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gray-50'}>
      <div className={`${embedded ? 'rounded-3xl border border-violet-100 bg-white shadow-sm overflow-hidden' : ''}`}>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-violet-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Create Event</h1>
            <p className="text-sm text-gray-500">
              {embedded
                ? 'Create event posters from live Canva Brand Templates without leaving this workspace.'
                : 'Create event posters using live Canva Brand Templates from the same event workflow.'}
            </p>
          </div>
          {step !== 'select-template' && (
            <button
              onClick={reset}
              className="ml-auto flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" /> Start Over
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-6 text-sm">
          {(['select-template', 'fill-form', 'event-form', 'generating', 'result'] as Step[]).map((s, i) => {
            const labels: Record<Step, string> = {
              'select-template': '1. Poster Method',
              'fill-form': '2. Template Fields',
              'event-form': '3. Event Form',
              'generating': '4. Live Preview…',
              'result': '5. Preview & Download',
            };
            const isActive = step === s;
            const isDone = (['select-template', 'fill-form', 'event-form', 'generating', 'result'] as Step[]).indexOf(step) > i;
            return (
              <span
                key={s}
                className={`flex items-center gap-1.5 font-medium ${isActive ? 'text-violet-600' : isDone ? 'text-green-600' : 'text-gray-400'}`}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : null}
                {labels[s]}
              </span>
            );
          })}
        </div>
      </div>

      <div className={`${canvaEditMode ? 'max-w-screen-2xl' : 'max-w-5xl'} mx-auto px-6 py-8`}>
        {step === 'select-template' && (
          <div>
            <div className="mb-8 grid grid-cols-1 gap-5">
              <button
                type="button"
                className="rounded-3xl border-2 p-5 text-left transition-all border-violet-500 bg-violet-50 shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-gray-900">Canva poster making</p>
                    <p className="text-sm text-gray-500 mt-1">Keeps the current live Canva Brand Template → n8n → Canva automation exactly as it is.</p>
                  </div>
                  <div className="shrink-0 rounded-2xl bg-violet-100 p-3 text-violet-600">
                    <LayoutTemplate className="w-6 h-6" />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-violet-700">
                  <span className="rounded-full bg-violet-100 px-3 py-1">Live brand templates</span>
                  <span className="rounded-full bg-violet-100 px-3 py-1">n8n enabled</span>
                  <span className="rounded-full bg-violet-100 px-3 py-1">Canva editable</span>
                </div>
              </button>
            </div>

            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Choose a poster method</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Only live Canva Brand Templates with autofill datasets are shown here.
                </p>
              </div>
              <button
                onClick={() => loadTemplates(searchQuery.trim())}
                className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2 mb-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your Canva Brand Templates…"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
              >
                Search
              </button>
            </form>

            {templatesLoading && (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading Brand Templates…
              </div>
            )}

            {templatesError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 flex items-start gap-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Failed to load Brand Templates</p>
                  <p className="text-sm mt-0.5">{templatesError}</p>
                </div>
              </div>
            )}

            {!templatesLoading && templates.length === 0 && !templatesError && (
              <div className="text-center py-20">
                <LayoutTemplate className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-700">No Brand Templates found</p>
                <p className="text-sm text-gray-500 mt-1">
                  Publish Brand Templates in Canva Brand Kit, then refresh this page.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => { void handleTemplateSelect(tpl); }}
                  className="group rounded-xl border-2 border-gray-200 hover:border-violet-400 bg-white overflow-hidden transition-all text-left focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <div className="aspect-[3/4] bg-gray-100 relative overflow-hidden">
                    {tpl.thumbnail?.url ? (
                      <img
                        src={tpl.thumbnail.url.startsWith('data:')
                          ? tpl.thumbnail.url
                          : `/api/canva/thumbnail-proxy/?raw=1&url=${encodeURIComponent(tpl.thumbnail.url)}`}
                        alt={tpl.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={async (e) => {
                          const img = e.currentTarget;
                          const fallbackStage = img.dataset.fallbackStage || 'raw';

                          if (fallbackStage === 'raw') {
                            img.dataset.fallbackStage = 'json';
                            try {
                              const res = await fetch(`/api/canva/thumbnail-proxy/?url=${encodeURIComponent(tpl.thumbnail.url)}`);
                              if (res.ok) {
                                const data = await res.json().catch(() => ({} as { dataUrl?: string }));
                                if (data?.dataUrl) {
                                  img.src = data.dataUrl;
                                  return;
                                }
                              }
                            } catch {
                              // fall through to direct URL fallback
                            }
                            img.src = tpl.thumbnail.url;
                            return;
                          }

                          if (fallbackStage === 'json') {
                            img.dataset.fallbackStage = 'direct';
                            img.src = tpl.thumbnail.url;
                            return;
                          }

                          img.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-10 h-10 text-gray-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                        Select
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-800 truncate">{tpl.title}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">Brand Template</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'fill-form' && selectedTemplate && (
          <div>
            <div className="flex items-start gap-4 mb-6">
              <button onClick={() => setStep('select-template')} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">Fill Template Fields</h2>
                <p className="text-sm text-gray-500">
                  Brand Template: <strong className="text-violet-700">{selectedTemplate.title}</strong>
                  {' · '}
                  <button onClick={() => setStep('select-template')} className="text-violet-600 hover:underline text-xs">
                    Change
                  </button>
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Format:</span>
                {(['png', 'pdf'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`px-3 py-1 rounded-full font-medium border transition-colors ${
                      format === f ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-200 text-gray-600 hover:border-violet-300'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 p-3 text-blue-700 flex items-start gap-2 text-xs">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                The IDCS form below is generated directly from the Canva Brand Template dataset. Entered values are sent straight into the matching Canva autofill fields, then a live Canva-rendered preview is shown before download.
              </span>
            </div>

            {datasetLoading && (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-500 bg-white rounded-xl border border-gray-200">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading Brand Template fields…
              </div>
            )}

            {!datasetLoading && datasetError && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800 mb-4">
                <p className="font-medium">Could not load autofill fields</p>
                <p className="text-sm mt-1">{datasetError}</p>
                <p className="text-xs mt-2">If you just enabled new Canva scopes, reconnect the Canva account once and refresh.</p>
              </div>
            )}

            {!datasetLoading && !datasetError && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Autofill Dataset</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {supportedFieldCount} supported field{supportedFieldCount !== 1 ? 's' : ''}
                      {chartFields.length ? ` · ${chartFields.length} chart field${chartFields.length !== 1 ? 's' : ''} not shown` : ''}
                    </p>
                  </div>
                  {selectedTemplate.create_url && (
                    <a
                      href={selectedTemplate.create_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-violet-600 hover:text-violet-800 inline-flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-4 h-4" /> Open template in Canva
                    </a>
                  )}
                </div>

                {(hasDepartmentMapping || hasEventDateMapping || hasEventTimeMapping) && (
                  <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                    <h4 className="text-sm font-semibold text-violet-900 mb-3">Mandatory Template Mappings</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {hasDepartmentMapping && (
                        <SelectField
                          label="Department (mandatory)"
                          value={selectedDepartmentId ? String(selectedDepartmentId) : ''}
                          onChange={handleDepartmentSelect}
                          options={departments.map((item) => ({
                            value: String(item.id),
                            label: `${item.code} - ${item.name}`,
                          }))}
                          placeholder={departmentsLoading ? 'Loading departments…' : 'Select organizer department'}
                          disabled={departmentsLoading || departments.length === 0}
                          hint={selectedDepartment ? `Stored as ${buildDepartmentPosterValue(selectedDepartment.name)}` : 'Applied with prefix DEPARTMENT OF for all mapped department fields.'}
                        />
                      )}

                      {hasEventDateMapping && (
                        <label className="block">
                          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Event Date (mandatory)</span>
                          <input
                            type="date"
                            value={selectedEventDateIso}
                            onChange={(e) => handleEventDateChange(e.target.value)}
                            className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-shadow"
                          />
                          <p className="mt-1 text-[11px] text-gray-500">
                            {selectedEventDateIso ? `Stored as: ${formatLongDateFromIso(selectedEventDateIso)}` : 'Stored format: 13 March 2026'}
                          </p>
                        </label>
                      )}

                      {hasEventTimeMapping && (
                        <label className="block">
                          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Event Time (mandatory)</span>
                          <input
                            type="time"
                            value={selectedEventTimeRaw}
                            onChange={(e) => handleEventTimeChange(e.target.value)}
                            className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-shadow"
                          />
                          <p className="mt-1 text-[11px] text-gray-500">
                            {selectedEventTimeRaw ? `Stored as: ${buildPrefixedEventTime(selectedEventTimeRaw)}` : 'Stored format: From 10:00 onwards'}
                          </p>
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {!supportedFieldCount && (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
                    This Brand Template has no text or image autofill fields that IDCS can render.
                  </div>
                )}

                {textFields.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">Text Fields</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {sortedTextFields.map(([fieldKey]) => (
                        PROPOSAL_MIRRORED_FIELDS.has(fieldKey)
                          || isDepartmentMappedField(fieldKey)
                          || isEventDateMappedField(fieldKey)
                          || isEventTimeMappedField(fieldKey)
                          ? null
                          : (
                          <Field
                            key={fieldKey}
                            label={getFieldLabel(fieldKey)}
                            value={fieldValues[fieldKey] ?? ''}
                            onChange={(v) => setFieldValue(fieldKey, v)}
                            placeholder={buildPlaceholder(fieldKey, 'text')}
                          />
                        )
                      ))}
                    </div>
                  </div>
                )}

                {imageFields.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">Image Fields</h4>
                    <div className="space-y-4">
                      {imageFields.map(([fieldKey]) => (
                        <ImageUploadField
                          key={fieldKey}
                          label={humanizeFieldKey(fieldKey)}
                          hint={buildPlaceholder(fieldKey, 'image')}
                          preview={imagePreviews[fieldKey]}
                          file={imageFiles[fieldKey]}
                          onChange={(file) => handleImageChange(fieldKey, file)}
                          onRemove={() => removeImage(fieldKey)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {chartFields.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800 text-xs">
                    Chart autofill fields are present in this template but are not rendered in IDCS yet:
                    <div className="mt-2 flex flex-wrap gap-2">
                      {chartFields.map(([fieldKey]) => (
                        <span key={fieldKey} className="px-2 py-1 rounded-full bg-amber-100 border border-amber-200">
                          {getFieldLabel(fieldKey)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setStep('event-form')}
                disabled={datasetLoading || !!datasetError || !supportedFieldCount || !hasFilledFields || !hasRequiredMappings}
                className="flex items-center gap-2 px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Event Form
              </button>
            </div>
          </div>
        )}

        {step === 'event-form' && selectedTemplate && (
          <div>
            <div className="flex items-start gap-4 mb-6">
              <button onClick={() => setStep('fill-form')} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">Event Form</h2>
                <p className="text-sm text-gray-500">
                  <>Complete the proposal document details and budget for <strong className="text-violet-700">{selectedTemplate.title}</strong>.</>
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-violet-200 p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-violet-900">Event Proposal Document</h3>
                  <p className="text-sm text-violet-700 mt-1">These details are used to generate the proposal DOCX and also mirror shared Canva fields where applicable.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="From"
                    value={proposalFrom}
                    onChange={setProposalFrom}
                    placeholder="Enter the name below 'From' in the proposal"
                  />
                  <SelectField
                    label="Organizer Department"
                    value={selectedDepartmentId ? String(selectedDepartmentId) : ''}
                    onChange={handleDepartmentSelect}
                    options={departments.map((item) => ({ value: String(item.id), label: `${item.code} - ${item.name}` }))}
                    placeholder={departmentsLoading ? 'Loading departments…' : 'Select organizer department'}
                    disabled={departmentsLoading || departments.length === 0}
                    hint={selectedDepartment ? `Stored for Canva as ${buildDepartmentPosterValue(selectedDepartment.name)}` : 'Department is pulled from the college database and prefixed automatically.'}
                  />
                  <SelectField
                    label="Nature"
                    value={fieldValues.event_type ?? ''}
                    onChange={(v) => setFieldValue('event_type', v)}
                    options={PROPOSAL_NATURE_OPTIONS.map((item) => ({ value: item, label: item }))}
                    placeholder="Select event nature"
                  />
                  <SelectField
                    label="Participants"
                    value={fieldValues.participants ?? ''}
                    onChange={(v) => setFieldValue('participants', v)}
                    options={PROPOSAL_PARTICIPANT_OPTIONS.map((item) => ({ value: item, label: item }))}
                    placeholder="Select participants"
                  />
                </div>
                {departmentsError && <p className="mt-3 text-xs text-red-600">{departmentsError}</p>}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Budget Planner</h3>
                    <p className="text-sm text-gray-500 mt-1">Fill the proposal’s expense and income table. Chief Guest Honorarium and Travelling Allowance react to the guideline group you pick.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center min-w-[320px]">
                    <div className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-violet-600 font-semibold">Budget</p>
                      <p className="text-lg font-bold text-violet-900">₹ {formatMoney(totalBudgetAmount)}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-600 font-semibold">Income</p>
                      <p className="text-lg font-bold text-emerald-900">₹ {formatMoney(totalIncomeAmount)}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">Requested</p>
                      <p className="text-lg font-bold text-amber-900">₹ {formatMoney(amountRequestedFromInstitute)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {BUDGET_LINE_META.map((item) => {
                    const line = proposalBudget[item.key];
                    const honorariumHint = item.supportsCategory === 'honorarium'
                      ? HONORARIUM_GROUPS.find((group) => group.value === line.category)?.hint
                      : '';
                    const travelHint = item.supportsCategory === 'travel'
                      ? TRAVEL_GROUPS.find((group) => group.value === line.category)?.hint
                      : '';

                    return (
                      <div key={item.key} className="rounded-2xl border border-gray-200 p-4 bg-gray-50/70">
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                          <div className="xl:col-span-4">
                            <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                            {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
                            {honorariumHint && <p className="text-xs text-violet-700 mt-2">{honorariumHint}</p>}
                            {travelHint && <p className="text-xs text-violet-700 mt-2">{travelHint}</p>}
                          </div>

                          {item.supportsCategory === 'honorarium' && (
                            <div className="xl:col-span-3">
                              <SelectField
                                label="Type"
                                value={line.category}
                                onChange={(v) => updateBudgetLine(item.key, { category: v })}
                                options={HONORARIUM_GROUPS.map((group) => ({ value: group.value, label: group.label }))}
                                placeholder="Select A / B / C"
                              />
                            </div>
                          )}

                          {item.supportsCategory === 'travel' && (
                            <>
                              <div className="xl:col-span-3">
                                <SelectField
                                  label="Type"
                                  value={line.category}
                                  onChange={(v) => updateBudgetLine(item.key, { category: v, subType: v === 'B' ? line.subType : '' })}
                                  options={TRAVEL_GROUPS.map((group) => ({ value: group.value, label: group.label }))}
                                  placeholder="Select A / B / C"
                                />
                              </div>
                              {line.category === 'B' && (
                                <div className="xl:col-span-3">
                                  <SelectField
                                    label="Travel Mode"
                                    value={line.subType}
                                    onChange={(v) => updateBudgetLine(item.key, { subType: v })}
                                    options={TRAVEL_SUB_TYPES.map((group) => ({ value: group.value, label: group.label }))}
                                    placeholder="Select B sub-type"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          <div className="xl:col-span-2">
                            <Field
                              label="Unit Price (₹)"
                              value={line.unitPrice}
                              onChange={(v) => updateBudgetLine(item.key, { unitPrice: v })}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="xl:col-span-1">
                            <Field
                              label="Qty"
                              value={line.qty}
                              onChange={(v) => updateBudgetLine(item.key, { qty: v })}
                              placeholder="0"
                            />
                          </div>
                          <div className="xl:col-span-2">
                            <Field
                              label="Total (₹)"
                              value={line.total}
                              onChange={(v) => updateBudgetLine(item.key, { total: v })}
                              placeholder="0.00"
                              disabled={item.totalReadOnly ?? item.key !== 'miscellaneous'}
                            />
                          </div>
                        </div>
                        {item.key === 'miscellaneous' && (
                          <div className="mt-3">
                            <Field
                              label="Notes"
                              value={line.notes}
                              onChange={(v) => updateBudgetLine(item.key, { notes: v })}
                              placeholder="Describe the miscellaneous expense"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <h4 className="text-sm font-semibold text-emerald-900 mb-3">Nature of Income</h4>
                    <div className="space-y-4">
                      {proposalIncome.map((line, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <Field label={`Source ${index + 1}`} value={line.source} onChange={(v) => updateIncomeLine(index, { source: v })} placeholder="Sponsorship / Registration / Other" />
                          <Field label="Unit Price (₹)" value={line.unitPrice} onChange={(v) => updateIncomeLine(index, { unitPrice: v })} placeholder="0.00" />
                          <Field label="Qty" value={line.qty} onChange={(v) => updateIncomeLine(index, { qty: v })} placeholder="0" />
                          <Field label="Total (₹)" value={line.total} onChange={(v) => updateIncomeLine(index, { total: v })} placeholder="0.00" disabled />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Office Use / Notes</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SelectField label="Mode of Event" value={proposalOffice.modeOfEvent} onChange={(v) => updateOfficeField('modeOfEvent', v)} options={MODE_OF_EVENT_OPTIONS.map((item) => ({ value: item, label: item }))} placeholder="Select mode" />
                      <Field label="Expert Category" value={deriveExpertCategoryFromHonorarium(proposalBudget.chief_guest_honorarium.category) || proposalOffice.expertCategory} onChange={(v) => updateOfficeField('expertCategory', v)} placeholder="Auto-filled from Chief Guest Honorarium" disabled />
                      <SelectField label="Is Event Repeated" value={proposalOffice.isEventRepeated} onChange={(v) => updateOfficeField('isEventRepeated', v)} options={YES_NO_OPTIONS.map((item) => ({ value: item, label: item }))} placeholder="Select yes or no" />
                      <Field label="CO-PO Attainment" value={proposalOffice.copoAttainment} onChange={(v) => updateOfficeField('copoAttainment', v)} placeholder="Expected attainment" />
                      <Field label="Approved Budget" value={proposalOffice.approvedBudget || formatMoney(totalBudgetAmount)} onChange={(v) => updateOfficeField('approvedBudget', v)} placeholder="0.00" />
                    </div>
                    <div className="mt-3">
                      <CheckboxGroup
                        label="Addressed POs"
                        options={PO_OPTIONS}
                        selected={proposalOffice.addressedPOs}
                        onToggle={toggleAddressedPO}
                        hint="Select one or more programme outcomes addressed by the event."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={datasetLoading || !!datasetError || !supportedFieldCount || !hasFilledFields}
                className="flex items-center gap-2 px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                Generate Live Preview
              </button>
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-violet-500" />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-800">Generating Live Canva Preview</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">
                {genProgress || 'Processing through n8n → Canva Autofill API…'}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Brand Template field mapping is being sent to n8n and Canva
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Waiting for Canva to process the autofill (30–90 s typical)
              </div>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className={canvaEditMode ? 'flex gap-4 items-start' : 'max-w-2xl mx-auto'}>

            {/* ── Left panel: preview + upload-back + buttons ── */}
            <div className={canvaEditMode ? 'w-[400px] flex-shrink-0' : ''}>
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
                  <CheckCircle2 className="w-4 h-4" />
                  Live Preview Ready!
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{resultTitle}</h2>
                {result.warning && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    {result.warning}
                  </p>
                )}
              </div>

              <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-lg mb-6">
                {result.dataUrl ? (
                  <img src={result.dataUrl} alt="Generated poster" className="w-full object-contain max-h-[600px]" />
                ) : result.export_url ? (
                  <img
                    src={result.export_url}
                    alt="Generated poster"
                    className="w-full object-contain max-h-[600px]"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : (
                  <div className="bg-gray-50 p-8 text-center">
                    <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="text-gray-600 text-sm">Poster created! Open it in Canva to view and download.</p>
                  </div>
                )}
              </div>

              {/* Upload-back zone — shown once Canva iframe is open */}
              {canvaEditMode && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleUploadBack(file);
                  }}
                  onClick={() => uploadEditRef.current?.click()}
                  className={`mb-6 rounded-2xl border-2 border-dashed cursor-pointer transition-colors p-6 text-center ${
                    isDragOver
                      ? 'border-violet-500 bg-violet-50'
                      : uploadedBack
                      ? 'border-green-400 bg-green-50'
                      : 'border-gray-300 bg-gray-50 hover:border-violet-400 hover:bg-violet-50/40'
                  }`}
                >
                  {uploadedBack ? (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-green-500" />
                      <p className="font-semibold text-green-700 text-sm">Edited poster uploaded!</p>
                      <p className="text-xs text-gray-500">Preview updated. Click Download to save it.</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setUploadedBack(false); uploadEditRef.current?.click(); }}
                        className="mt-1 text-xs text-violet-600 hover:underline"
                      >
                        Upload a different file
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-violet-400" />
                      <p className="font-semibold text-gray-700 text-sm">
                        {isDragOver ? 'Drop your edited poster here' : 'Upload your edited poster back into IDCS'}
                      </p>
                      <p className="text-xs text-gray-400">
                        In Canva: edit → Share → Download → drop the file here (PNG or PDF)
                      </p>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={uploadEditRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadBack(file);
                  e.target.value = '';
                }}
              />

              {/* ── Staff: Forward to Branding ── */}
              {staffMode && !forwardedToBranding && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                  <p className="text-sm text-blue-800 mb-3 font-medium">
                    Your poster and proposal documents are ready. Forward them to the Branding team for review.
                  </p>
                  <button
                    type="button"
                    disabled={forwardingToBranding}
                    onClick={handleForwardToBranding}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-xl shadow transition-colors"
                  >
                    {forwardingToBranding ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
                    ) : (
                      <><Send className="w-5 h-5" /> Forward to Branding</>
                    )}
                  </button>
                  {forwardError && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-red-700 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {forwardError}
                    </div>
                  )}
                </div>
              )}
              {staffMode && forwardedToBranding && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-green-800 font-medium">
                    Your event proposal has been forwarded to the Branding team for review!
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    You'll be notified when it progresses through the approval chain.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 justify-center">
                {(result.dataUrl || result.export_url) && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl shadow transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Download {format.toUpperCase()}
                  </button>
                )}
                {result.proposal_docx_url && (
                  <button
                    type="button"
                    onClick={() => window.open(buildDocUrl(result.proposal_docx_url), '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-violet-200 hover:border-violet-400 text-violet-700 font-semibold rounded-xl shadow-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    {result.proposal_docx_name || 'Download Event Proposal Format.docx'}
                  </button>
                )}
                {result.canva_edit_url && (
                  <button
                    type="button"
                    onClick={() => {
                      const w = 1280, h = 860;
                      const left = Math.round((window.screen.width - w) / 2);
                      const top = Math.round((window.screen.height - h) / 2);
                      const popup = window.open(
                        result.canva_edit_url,
                        'canva-editor',
                        `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
                      );
                      canvaPopupRef.current = popup;
                      setCanvaEditMode(true);
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 hover:border-violet-400 text-gray-700 hover:text-violet-700 font-semibold rounded-xl shadow-sm transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {canvaEditMode ? 'Reopen Canva Window' : 'Open in Canva'}
                  </button>
                )}
                <button
                  onClick={reset}
                  className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 font-medium rounded-xl transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Make Another
                </button>
              </div>

              {result.design_id && (
                <p className="text-center text-xs text-gray-400 mt-4">Canva Design ID: {result.design_id}</p>
              )}
            </div>

            {/* ── Right panel: Canva editing status + upload-back ── */}
            {canvaEditMode && result.canva_edit_url && (
              <div className="flex-1 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-lg flex flex-col" style={{ minHeight: '85vh' }}>
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-violet-100">
                  <div className="relative">
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-400 animate-ping opacity-75"></div>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">Canva Editor is open</p>
                    <p className="text-xs text-gray-500">Editing in a separate window</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (canvaPopupRef.current && !canvaPopupRef.current.closed) canvaPopupRef.current.focus(); }}
                    className="ml-auto flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium bg-violet-100 hover:bg-violet-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Bring to front
                  </button>
                </div>

                {/* Steps */}
                <div className="px-6 py-6 flex-1">
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-gray-700 mb-3">How to edit &amp; import back:</p>
                    <ol className="space-y-3">
                      {[
                        { step: '1', text: 'Edit your poster in the Canva window that just opened' },
                        { step: '2', text: 'Click Share → Download → choose PNG or PDF' },
                        { step: '3', text: 'Drop the downloaded file into the upload zone below' },
                      ].map(({ step, text }) => (
                        <li key={step} className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step}</span>
                          <span className="text-sm text-gray-600">{text}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Upload-back zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleUploadBack(file);
                    }}
                    onClick={() => uploadEditRef.current?.click()}
                    className={`rounded-2xl border-2 border-dashed cursor-pointer transition-all p-8 text-center ${
                      isDragOver
                        ? 'border-violet-500 bg-violet-100 scale-[1.02]'
                        : uploadedBack
                        ? 'border-green-400 bg-green-50'
                        : 'border-violet-300 bg-white hover:border-violet-500 hover:bg-violet-50'
                    }`}
                  >
                    {uploadedBack ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                          <CheckCircle2 className="w-8 h-8 text-green-500" />
                        </div>
                        <p className="font-semibold text-green-700">Edited poster uploaded!</p>
                        <p className="text-sm text-gray-500">Left panel preview is updated. Click Download to save.</p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setUploadedBack(false); uploadEditRef.current?.click(); }}
                          className="mt-2 text-xs text-violet-600 hover:underline"
                        >
                          Upload a different file
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
                          <Upload className="w-7 h-7 text-violet-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-700">
                            {isDragOver ? 'Drop your file here!' : 'Drop your edited Canva poster here'}
                          </p>
                          <p className="text-sm text-gray-400 mt-1">PNG, JPEG, WebP or PDF • click to browse</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <a ref={downloadRef} className="hidden" />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const cls =
    'w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 ' +
    'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500 ' +
    'transition-shadow';
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cls}
        disabled={disabled}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const cls =
    'w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 ' +
    'focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-shadow bg-white';
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls} disabled={disabled}>
        <option value="">{placeholder || `Select ${label}`}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </label>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onToggle,
  hint,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</span>
      <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <label
              key={option}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${checked ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(option)}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function ImageUploadField({
  label,
  hint,
  preview,
  file,
  onChange,
  onRemove,
}: {
  label: string;
  hint: string;
  preview?: string;
  file?: File;
  onChange: (f: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50">
      <div
        className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 bg-white flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-violet-400 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-6 h-6 text-gray-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
        {file && <p className="text-xs text-violet-600 mt-1 truncate">{file.name}</p>}
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium"
          >
            <Upload className="w-3.5 h-3.5" />
            {file ? 'Change' : 'Upload'}
          </button>
          {file && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

