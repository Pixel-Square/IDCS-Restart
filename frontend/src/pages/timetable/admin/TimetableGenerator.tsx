import React, { useState, useEffect } from 'react';
import { ChevronLeft, Copy, ChevronDown, Pin, Search, X, Check, AlertCircle, RotateCcw, Users, Trash2, Move } from 'lucide-react';
import { SearchableDropdown } from '../../../components/ui/SearchableDropdown';
import fetchWithAuth from '../../../services/fetchAuth';
import { fetchDepartmentStaff } from '../../../services/staff';
import TeachingAssignSection from './TeachingAssignSection';
import GroupAllocationModal, { GroupAllocation } from './GroupAllocationModal';
import SpecialPeriodModal, { SpecialPeriodAllocation } from './SpecialPeriodModal';
import VenueAllocationModal from './VenueAllocationModal';
import CreditBasedAllocationModal, { ClassTypeExceptionRule, CourseExceptionRule } from './CreditBasedAllocationModal';


const DEPARTMENT_OPTIONS = [
  { label: 'CIVIL Engineering', value: 'civil' },
  { label: 'Mechanical Engineering', value: 'mech' },
  { label: 'Electronics & Communication Engineering', value: 'ece' },
  { label: 'Electrical & Electronics Engineering', value: 'eee' },
  { label: 'Computer Science Engineering', value: 'cse' },
  { label: 'Information Technology', value: 'it' },
  { label: 'Artificial Intelligence and Data Science', value: 'ai_ds' },
  { label: 'Artificial Intelligence and Machine Learning', value: 'ai_ml' },
];

const COURSE_OPTIONS = [
  { label: 'B.Tech - Civil Engineering', value: 'btech_civil' },
  { label: 'M.Tech - Structural Engineering', value: 'mtech_struct' },
  { label: 'B.Tech - Mechanical Engineering', value: 'btech_mech' },
  { label: 'B.Tech - Electronics & Communication Engineering', value: 'btech_ece' },
  { label: 'B.Tech - Electrical & Electronics Engineering', value: 'btech_eee' },
  { label: 'B.Tech - Computer Science Engineering', value: 'btech_cse' },
  { label: 'M.Tech - Computer Science Engineering', value: 'mtech_cse' },
  { label: 'B.Tech - Information Technology', value: 'btech_it' },
  { label: 'B.Tech - Artificial Intelligence and Data Science', value: 'btech_aids' },
  { label: 'B.Tech - Artificial Intelligence and Machine Learning', value: 'btech_aiml' },
  { label: 'Master of Computer Applications (MCA)', value: 'mca' },
  { label: 'Master of Business Administration (MBA)', value: 'mba' }
];

// (Removed placeholder global faculty options. Faculty list is fetched dynamically per department.)

type SectionSnapshot = {
  sectionKey: string;
  sectionId: number;
  sectionName: string;
  subjects: any[];
  assignments: any[];
  advisors: any[];
  subjectStaff: any[];
  year?: number | null;
  semester?: number | null;
  department?: string;
};

type GeneratedCell = {
  subject: string;
  faculty: string;
  kind: 'theory' | 'lab';
  note?: string;
  colSpan?: number;
  isBlockSecondSlot?: boolean;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  isPinned?: boolean;
};

export type PinnedSlot = {
  subject: string;
  faculty: string;
  kind: 'theory' | 'lab';
  code?: string;
  classType?: string;
  credits?: number;
  isElective?: boolean;
  note?: string;
  bgColor?: string;
};

export type UnfilledPeriodItem = {
  id: string;
  subject: string;
  faculty: string;
  kind: 'theory' | 'lab';
  code?: string;
  note?: string;
  bgColor?: string;
  isPair?: boolean;
  colSpan?: number;
  reason?: 'no_slots' | 'deleted' | 'unallocated';
  sourceCellKey?: string;
};

type GeneratedSectionTimetable = {
  sectionKey: string;
  sectionName: string;
  year: number | null;
  department: string;
  cells: Record<string, GeneratedCell>;
  warnings: string[];
  unfilledPeriods?: UnfilledPeriodItem[];
};

const normalizeText = (value: any) => String(value || '').trim();
const normalizeClassType = (value: any, row?: any) => {
  const normalized = normalizeText(value).toUpperCase();
  if (!normalized) return 'THEORY';

  if (/^\d+$/.test(normalized)) {
    const l = Number(row?.l ?? 0) || 0;
    const t = Number(row?.t ?? 0) || 0;
    const p = Number(row?.p ?? 0) || 0;
    const s = Number(row?.s ?? 0) || 0;
    if (p > 0 || s > 0) {
      return l > 0 || t > 0 ? 'TCPL' : 'LAB';
    }
    return 'THEORY';
  }

  if (normalized.includes('TCPR')) return 'TCPR';
  if (normalized.includes('TCPL')) return 'TCPL';
  return normalized;
};

const getFacultyNames = (row: any) => {
  const assigned = Array.isArray(row?.assigned_staff) ? row.assigned_staff : [];
  const names = assigned
    .map((staff: any) => normalizeText(staff?.name || staff?.staff_id || staff?.username))
    .filter(Boolean);
  return Array.from(new Set(names));
};

const getFacultyKey = (staff: any) => normalizeText(staff?.id || staff?.staff_id || staff?.username);
const getSubjectCode = (row: any) => normalizeText(row?.course_code || row?.code || row?.mnemonic);
const getSubjectName = (row: any) => normalizeText(row?.course_name || row?.name);
const subjectLooksLikeLab = (row: any) => /\b(LAB|LABORATORY)\b/.test(getSubjectLabel(row).toUpperCase());
const getLectureHours = (row: any) => toNonNegativeNumber(row?.l) + toNonNegativeNumber(row?.t);
const getPracticalHours = (row: any) => {
  const pHours = toNonNegativeNumber(row?.p);
  if (pHours > 0) return pHours;

  const explicitLabHours = toNonNegativeNumber(row?.lab_hours);
  if (explicitLabHours > 0) return explicitLabHours;

  const effectiveHours = toNonNegativeNumber(row?.effective_class_hours);
  const totalHours = toNonNegativeNumber(row?.total_hours);
  const nonPracticalHours = getLectureHours(row) + toNonNegativeNumber(row?.s);
  const inferredFromEffective = Math.max(0, effectiveHours - nonPracticalHours);
  if (inferredFromEffective > 0) return inferredFromEffective;

  const inferredFromTotal = Math.max(0, totalHours - nonPracticalHours);
  return inferredFromTotal;
};

const getSubjectLabel = (row: any) => {
  const code = getSubjectCode(row);
  const name = getSubjectName(row);
  if (code && name) return `${code} - ${name}`;
  return code || name || 'Unnamed Subject';
};

const buildCellText = (row: any, _slotKind: 'theory' | 'lab', _label: string) => {
  const subject = getSubjectLabel(row);
  const credits = Number(row?.c ?? row?.credits ?? 0);
  const creditText = credits > 0 ? ` (${credits} ${credits === 1 ? 'Credit' : 'Credits'})` : '';
  return `${subject}${creditText}`;
};

const buildFacultyText = (row: any) => getFacultyNames(row).join(' / ');

const isPureLabSubject = (row: any) => {
  const type = normalizeClassType(row?.class_type, row);
  if (subjectLooksLikeLab(row) && getPracticalHours(row) > 0) {
    return true;
  }
  return type === 'LAB' || type === 'PRACTICAL' || type === 'PURE_LAB';
};

const isHybridLabSubject = (row: any) => {
  const type = normalizeClassType(row?.class_type, row);
  if (subjectLooksLikeLab(row)) {
    return false;
  }
  return type === 'TCPL' || type === 'TCPR';
};

const getLabSubjectKey = (row: any) => {
  const subjectCode = getSubjectCode(row);
  const subjectName = getSubjectName(row);
  if (subjectCode) return `code:${subjectCode.toUpperCase()}`;
  if (subjectName) return `name:${subjectName.toLowerCase()}`;
  return `label:${getSubjectLabel(row).toLowerCase()}`;
};

const mergeAssignedStaff = (existing: any[], incoming: any[]) => {
  const merged = [...existing, ...incoming];
  return Array.from(new Map(merged.map((staff) => [getFacultyKey(staff), staff])).values()).filter(Boolean);
};

const compactLabSubjects = (labSubjects: any[]) => {
  const map = new Map<string, any>();
  for (const subject of labSubjects) {
    const key = getLabSubjectKey(subject);
    if (map.has(key)) {
      const existing = map.get(key);
      const existingStaff = Array.isArray(existing?.assigned_staff) ? existing.assigned_staff : [];
      const incomingStaff = Array.isArray(subject?.assigned_staff) ? subject.assigned_staff : [];
      map.set(key, {
        ...existing,
        assigned_staff: mergeAssignedStaff(existingStaff, incomingStaff),
      });
    } else {
      map.set(key, subject);
    }
  }
  return Array.from(map.values());
};

const buildPairedLabText = (pair: any[]) => {
  const subjects = Array.from(new Set(pair.map((row) => getSubjectLabel(row)).filter(Boolean)));
  if (subjects.length === 0) return 'Lab';
  if (subjects.length === 1) return subjects[0];
  return `[${subjects.join(' / ')}]`;
};

const buildPairedLabFacultyText = (pair: any[]) => {
  const facultyNames = pair.flatMap((row) => getFacultyNames(row));
  return Array.from(new Set(facultyNames)).join(' / ');
};

const toNonNegativeNumber = (value: any) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
};

const getRequiredLabBlocks = (row: any) => {
  const overrideBlocks = toNonNegativeNumber(row?._requiredLabBlocksOverride);
  if (overrideBlocks > 0) {
    return Math.max(1, Math.ceil(overrideBlocks));
  }

  const classType = normalizeClassType(row?.class_type, row);
  if (!['LAB', 'PRACTICAL', 'PURE_LAB', 'TCPL', 'TCPR'].includes(classType) && !subjectLooksLikeLab(row)) {
    return 0;
  }

  const weeklyHours = getPracticalHours(row) || 2;
  const baseBlocks = Math.max(1, Math.ceil(weeklyHours / 2));
  const labRowMultiplier = Math.max(1, Math.floor(toNonNegativeNumber(row?.lab_row_multiplier) || 1));
  // Multiplier values above 2 usually come from shared-curriculum expansion and
  // can flood the timetable with labs. Treat those as non-multiplying rows.
  const effectiveMultiplier = labRowMultiplier > 2 ? 1 : labRowMultiplier;

  if (classType === 'LAB' || classType === 'PRACTICAL' || classType === 'PURE_LAB' || subjectLooksLikeLab(row)) {
    return baseBlocks * effectiveMultiplier;
  }

  return baseBlocks;
};

const consolidatePureLabSubjects = (labSubjects: any[]) => {
  const map = new Map<string, any>();

  for (const subject of labSubjects) {
    const key = getLabSubjectKey(subject);
    const requiredBlocks = getRequiredLabBlocks(subject);

    if (map.has(key)) {
      const existing = map.get(key);
      const existingStaff = Array.isArray(existing?.assigned_staff) ? existing.assigned_staff : [];
      const incomingStaff = Array.isArray(subject?.assigned_staff) ? subject.assigned_staff : [];
      map.set(key, {
        ...existing,
        assigned_staff: mergeAssignedStaff(existingStaff, incomingStaff),
        _requiredLabBlocksOverride: toNonNegativeNumber(existing?._requiredLabBlocksOverride) + requiredBlocks,
      });
      continue;
    }

    map.set(key, {
      ...subject,
      _requiredLabBlocksOverride: requiredBlocks,
    });
  }

  return Array.from(map.values());
};

const buildLabPairs = (labSubjects: any[]) => {
  const expandedLabs = labSubjects.flatMap((subject) => {
    const requiredBlocks = getRequiredLabBlocks(subject);
    return Array.from({ length: requiredBlocks }, (_, index) => ({
      ...subject,
      _labInstance: index + 1,
      _labSubjectKey: getLabSubjectKey(subject),
    }));
  });

  const instancesByKey = new Map<string, any[]>();
  expandedLabs.forEach((subject) => {
    const key = subject._labSubjectKey;
    const existing = instancesByKey.get(key) || [];
    existing.push(subject);
    instancesByKey.set(key, existing);
  });

  const pairs: any[][] = [];
  while (instancesByKey.size > 0) {
    const orderedKeys = Array.from(instancesByKey.keys()).sort((leftKey, rightKey) => {
      const leftItems = instancesByKey.get(leftKey) || [];
      const rightItems = instancesByKey.get(rightKey) || [];
      const countDiff = rightItems.length - leftItems.length;
      if (countDiff !== 0) return countDiff;
      return getSubjectLabel(leftItems[0]).localeCompare(getSubjectLabel(rightItems[0]));
    });

    const firstKey = orderedKeys[0];
    const firstQueue = instancesByKey.get(firstKey) || [];
    const first = firstQueue.shift();
    if (!first) {
      instancesByKey.delete(firstKey);
      continue;
    }
    if (firstQueue.length === 0) {
      instancesByKey.delete(firstKey);
    } else {
      instancesByKey.set(firstKey, firstQueue);
    }

    const secondKey = orderedKeys.find((key) => key !== firstKey && (instancesByKey.get(key) || []).length > 0);
    if (!secondKey) {
      pairs.push([first]);
      continue;
    }

    const secondQueue = instancesByKey.get(secondKey) || [];
    const second = secondQueue.shift();
    if (!second) {
      pairs.push([first]);
      continue;
    }
    if (secondQueue.length === 0) {
      instancesByKey.delete(secondKey);
    } else {
      instancesByKey.set(secondKey, secondQueue);
    }

    pairs.push([first, second]);
  }
  return pairs;
};

const getLabPairKey = (pair: any[]) => pair.map((subject) => getSubjectCode(subject) || getSubjectLabel(subject)).join('|');

const mapToStandardDept = (deptName: string): string => {
  const norm = String(deptName || '').toLowerCase().trim();
  if (!norm) return 'OTHER';

  if (norm.includes('science and humanities') || norm.includes('s&h') || norm.includes('sh') || norm.includes('science & humanities')) return 'S&H';
  if (norm.includes('information technology') || norm === 'it') return 'IT';
  if (norm.includes('artificial intelligence') && (norm.includes('data science') || norm.includes('ds') || norm.includes('aids'))) return 'AI&DS';
  if (norm.includes('artificial intelligence') && (norm.includes('machine learning') || norm.includes('ml') || norm.includes('aiml'))) return 'AIML';
  if (norm.includes('computer science') || norm === 'cse' || norm === 'cs') return 'CSE';
  if (norm.includes('electronics and communication') || norm === 'ece') return 'ECE';
  if (norm.includes('electrical and electronics') || norm === 'eee') return 'EEE';
  if (norm.includes('mechanical') || norm === 'mech' || norm === 'me') return 'MECH';
  if (norm.includes('civil') || norm === 'ce') return 'CIVIL';

  return deptName.toUpperCase();
};

const createSeededRng = (seed: number) => {
  let state = Math.floor(seed) % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const shuffleWithRng = <T,>(items: T[], rng: () => number) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
import { CreditAllocationMap } from './CreditBasedAllocationModal';

const getRequiredSlotPlan = (row: any, creditAllocations?: Record<number, number>) => {
  const credits = Number(row?.c ?? row?.credits ?? 0) || 0;

  // 1. Check if credit-based period allocation override exists for this Credit rating (C)
  if (credits > 0 && creditAllocations && creditAllocations[credits] !== undefined) {
    const configuredSlots = Math.max(1, Number(creditAllocations[credits]));
    return Array.from({ length: configuredSlots }, (_, index) => ({
      kind: 'theory' as const,
      label: `Period ${index + 1}`
    }));
  }

  // 2. Default to credit count (C) if > 0
  if (credits > 0) {
    return Array.from({ length: credits }, (_, index) => ({
      kind: 'theory' as const,
      label: `Period ${index + 1}`
    }));
  }

  // 3. Fallback for 0-credit subjects in department curriculum: allocate periods based on L+T+P+S, class hours, or at least 1 period
  const l = Number(row?.l ?? 0);
  const t = Number(row?.t ?? 0);
  const p = Number(row?.p ?? 0);
  const s = Number(row?.s ?? 0);
  const rawHours = Number(row?.effective_class_hours ?? row?.total_hours ?? 0);
  const weeklyHours = (l + t + p + s) || ((rawHours > 0 && rawHours <= 10) ? rawHours : 0) || 1;
  const periodCount = Math.max(1, Math.ceil(weeklyHours));

  return Array.from({ length: periodCount }, (_, index) => ({
    kind: 'theory' as const,
    label: `Period ${index + 1}`
  }));
};

const getTemplateSlots = (template: SemesterTemplate) => {
  return template.rows.flatMap((row) =>
    template.columns
      .filter((col) => col.period !== 'Break' && col.period !== 'Lunch')
      .map((col) => ({
        key: `${row.id}-${col.id}`,
        day: row.day,
        period: col.period,
        timing: col.timing,
      }))
  );
};

const getTemplateLabBlocks = (template: SemesterTemplate) => {
  return template.rows.flatMap((row) => {
    const blocks: Array<{ keys: string[]; day: string; slots: Array<{ key: string; day: string; rowId: string; columnId: string; period: string }> }> = [];
    for (let idx = 0; idx < template.columns.length - 1; idx += 1) {
      const current = template.columns[idx];
      const next = template.columns[idx + 1];
      if ([current.period, next.period].every((period) => period !== 'Break' && period !== 'Lunch')) {
        blocks.push({
          keys: [`${row.id}-${current.id}`, `${row.id}-${next.id}`],
          day: row.day,
          slots: [
            { key: `${row.id}-${current.id}`, day: row.day, rowId: row.id, columnId: current.id, period: current.period },
            { key: `${row.id}-${next.id}`, day: row.day, rowId: row.id, columnId: next.id, period: next.period },
          ],
        });
      }
    }
    return blocks;
  });
};

const getConsecutiveBlocksForTemplate = (template: SemesterTemplate, blockSize: number) => {
  const blocks: Array<{ keys: string[]; day: string }> = [];
  template.rows.forEach((row) => {
    const validCols = template.columns.filter((c) => c.period !== 'Break' && c.period !== 'Lunch');
    for (let i = 0; i <= validCols.length - blockSize; i += 1) {
      const window = validCols.slice(i, i + blockSize);
      const firstIdx = template.columns.indexOf(window[0]);
      const lastIdx = template.columns.indexOf(window[window.length - 1]);
      if (lastIdx - firstIdx === blockSize - 1) {
        blocks.push({
          keys: window.map((c) => `${row.id}-${c.id}`),
          day: row.day,
        });
      }
    }
  });
  return blocks;
};

const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
};

const buildGeneratedSection = (
  snapshot: SectionSnapshot,
  template: SemesterTemplate,
  globalFacultyUsage: Record<string, Set<string>>,
  generationSeed: number,
  sectionIndex: number,
  groupAllocations: GroupAllocation[] = [],
  creditAllocations: Record<number, number> = {},
  classTypeExceptions: ClassTypeExceptionRule[] = [],
  courseExceptions: CourseExceptionRule[] = [],
  groupSchedulePlan: Record<string, {
    pairBlocks: Array<{ keys: string[]; day: string }>;
    singleSlots: Array<{ key: string; day: string; period: string }>;
  }> = {},
  pinnedSlots: Record<string, PinnedSlot> = {},
  specialPeriodAllocations: SpecialPeriodAllocation[] = [],
  deletedSlots: string[] = []
): GeneratedSectionTimetable => {
  const cells: Record<string, GeneratedCell> = {};
  const warnings: string[] = [];
  const unfilledPeriods: UnfilledPeriodItem[] = [];
  const slots = getTemplateSlots(template);
  const occupied = new Set<string>();
  const runSeed = generationSeed + sectionIndex + 1;
  const rng = createSeededRng(runSeed);
  const consecutiveTwoBlocks = getConsecutiveBlocksForTemplate(template, 2);

  // Pre-occupy deleted slots so they remain unfilled if configured
  deletedSlots.forEach((k) => occupied.add(k));

  // 1. Pre-occupy and place all Pinned Slots for this section
  const pinnedKeysBySubject = new Map<string, string[]>();

  Object.entries(pinnedSlots).forEach(([cellKey, pin]) => {
    occupied.add(cellKey);
    const sKey = (pin.code || pin.subject).toUpperCase().trim();
    if (!pinnedKeysBySubject.has(sKey)) {
      pinnedKeysBySubject.set(sKey, []);
    }
    pinnedKeysBySubject.get(sKey)!.push(cellKey);

    cells[cellKey] = {
      subject: pin.subject,
      faculty: pin.faculty || 'Assigned Faculty',
      kind: pin.kind || 'theory',
      note: pin.note || '📌 Pinned Slot',
      bgColor: pin.bgColor || '#FEF3C7',
      isPinned: true,
    };
  });

  // Check for adjacent pinned slots of the same subject in each row to merge them as 2-period block pairs
  template.rows.forEach((row) => {
    const validCols = template.columns.filter((c) => c.period !== 'Break' && c.period !== 'Lunch');
    for (let i = 0; i < validCols.length - 1; i++) {
      const currentKey = `${row.id}-${validCols[i].id}`;
      const nextKey = `${row.id}-${validCols[i + 1].id}`;
      const pinCurrent = pinnedSlots[currentKey];
      const pinNext = pinnedSlots[nextKey];

      if (pinCurrent && pinNext && !cells[currentKey]?.isBlockSecondSlot && !cells[nextKey]?.isBlockSecondSlot) {
        const cCode = (pinCurrent.code || pinCurrent.subject).toUpperCase().trim();
        const nCode = (pinNext.code || pinNext.subject).toUpperCase().trim();
        if (cCode === nCode) {
          cells[currentKey].colSpan = 2;
          cells[currentKey].note = '📌 Pinned Block Pair (2 Periods)';
          cells[nextKey].isBlockSecondSlot = true;
          cells[nextKey].note = '📌 Pinned Block Pair (2 Periods)';
        }
      }
    }
  });

  // Helper to match section key or ID strictly
  const matchesSectionStrictly = (selectedKeys: string[], snapshot: SectionSnapshot) => {
    if (!selectedKeys || selectedKeys.length === 0) return false;
    const secIdStr = String(snapshot.sectionId);
    return selectedKeys.some((k) => {
      // Direct exact match of section key
      if (k === snapshot.sectionKey) return true;
      // Exact match with section ID at end or part of key (e.g. "3-IT-A-123" or "sec-123-IT-A")
      if (k.endsWith(`-${secIdStr}`) || k.startsWith(`sec-${secIdStr}-`) || k.startsWith(`mixed-${secIdStr}-`)) return true;
      const parts = k.split('-');
      if (parts[parts.length - 1] === secIdStr || parts[1] === secIdStr) return true;
      return false;
    });
  };

  // Helper to match department accurately
  const matchesDepartmentStrictly = (selectedDepts: string[], dept: string | null | undefined) => {
    if (!dept || selectedDepts.length === 0) return false;
    const dUpper = dept.toUpperCase().trim();
    return selectedDepts.some((sel) => {
      const selUpper = sel.toUpperCase().trim();
      if (selUpper === 'S&H') {
        return dUpper.includes('SCIENCE') || dUpper.includes('S&H') || dUpper.includes('SH') || dUpper.includes('HUMANIT');
      }
      if (selUpper === 'AI&DS') {
        return (dUpper.includes('AI') || dUpper.includes('ARTIFICIAL')) && (dUpper.includes('DS') || dUpper.includes('DATA'));
      }
      if (selUpper === 'AIML') {
        return (dUpper.includes('AI') || dUpper.includes('ARTIFICIAL')) && (dUpper.includes('ML') || dUpper.includes('MACHINE'));
      }
      if (selUpper === 'CIVIL') {
        return dUpper === 'CIVIL' || dUpper === 'CE' || dUpper === 'CIV' || dUpper.includes('CIVIL');
      }
      if (selUpper === 'MECH') {
        return dUpper === 'MECH' || dUpper === 'ME' || dUpper === 'MEC' || dUpper.includes('MECH') || dUpper.includes('MECHANICAL');
      }
      if (selUpper === 'CSE') {
        return dUpper === 'CSE' || dUpper === 'CS' || dUpper.includes('COMPUTER SCIENCE');
      }
      if (selUpper === 'IT') {
        return dUpper === 'IT' || dUpper.includes('INFORMATION TECH');
      }
      if (selUpper === 'ECE') {
        return dUpper === 'ECE' || dUpper === 'EC' || dUpper.includes('ELECTRONICS');
      }
      if (selUpper === 'EEE') {
        return dUpper === 'EEE' || dUpper === 'EE' || dUpper.includes('ELECTRICAL');
      }
      return dUpper === selUpper || dUpper.includes(selUpper) || selUpper.includes(dUpper);
    });
  };

  // Find Group Allocations that match this section / mixed section
  const matchingGroups = groupAllocations.filter((g) => {
    const hasExplicitSections = (g.selectedSectionKeys && g.selectedSectionKeys.length > 0) ||
                               (g.selectedMixedSectionKeys && g.selectedMixedSectionKeys.length > 0);

    if (hasExplicitSections) {
      return matchesSectionStrictly(g.selectedSectionKeys || [], snapshot) ||
             matchesSectionStrictly(g.selectedMixedSectionKeys || [], snapshot);
    }

    // If no explicit sections are selected, match by Year AND Department
    const yearMatch = snapshot.year !== null && snapshot.year !== undefined && g.selectedYears && g.selectedYears.includes(snapshot.year);
    const deptMatch = g.selectedDepartments && g.selectedDepartments.length > 0 &&
                      matchesDepartmentStrictly(g.selectedDepartments, snapshot.department);
    return yearMatch && deptMatch;
  });

  // Find Special Periods that match this section
  const matchingSpecialPeriods = specialPeriodAllocations.filter((sp) => {
    const hasExplicitSections = (sp.selectedSectionKeys && sp.selectedSectionKeys.length > 0) ||
                               (sp.selectedMixedSectionKeys && sp.selectedMixedSectionKeys.length > 0);

    if (hasExplicitSections) {
      return matchesSectionStrictly(sp.selectedSectionKeys || [], snapshot) ||
             matchesSectionStrictly(sp.selectedMixedSectionKeys || [], snapshot);
    }

    // Must match Department if departments are selected
    if (sp.selectedDepartments && sp.selectedDepartments.length > 0) {
      if (!matchesDepartmentStrictly(sp.selectedDepartments, snapshot.department)) {
        return false;
      }
    }

    // Must match Semester if semesters are selected
    const semestersOrYears = sp.selectedSemesters || sp.selectedYears || [];
    if (semestersOrYears.length > 0) {
      const semMatch = snapshot.semester !== undefined && snapshot.semester !== null
        ? semestersOrYears.includes(Number(snapshot.semester))
        : (snapshot.year !== undefined && snapshot.year !== null && (
            semestersOrYears.includes(Number(snapshot.year) * 2) ||
            semestersOrYears.includes(Number(snapshot.year) * 2 - 1)
          ));
      if (!semMatch) return false;
    }

    return true;
  });

  // Extract all Exception Courses from matching groups and special periods
  const allExceptionCourses = [
    ...matchingGroups.flatMap((g) => g.exceptionCourses || []),
    ...matchingSpecialPeriods.flatMap((sp) => sp.exceptionCourses || [])
  ];

  // Pre-assign Group Allocations using the synchronized global schedule plan so ALL mapped sections & interdepartments share the exact same slot
  matchingGroups.forEach((g) => {
    const groupKey = g.id || g.groupName;
    const plan = groupSchedulePlan[groupKey];

    if (plan) {
      // 1. Assign synchronized Paired Blocks
      plan.pairBlocks.forEach((selectedBlock, pIdx) => {
        const firstKey = selectedBlock.keys[0];
        const secondKey = selectedBlock.keys[1];

        selectedBlock.keys.forEach((key) => occupied.add(key));

        if (firstKey) {
          cells[firstKey] = {
            subject: g.groupName,
            faculty: 'Group Allocation',
            kind: 'theory',
            note: `Group: ${g.groupName} (Pair Period ${pIdx + 1})`,
            colSpan: selectedBlock.keys.length,
            bgColor: g.color || '#EFF6FF',
          };
        }
        if (secondKey) {
          cells[secondKey] = {
            subject: g.groupName,
            faculty: 'Group Allocation',
            kind: 'theory',
            note: `Group: ${g.groupName} (Pair Period ${pIdx + 1})`,
            isBlockSecondSlot: true,
            bgColor: g.color || '#EFF6FF',
          };
        }
      });

      // 2. Assign synchronized Single Slots
      plan.singleSlots.forEach((selectedSlot, sIdx) => {
        occupied.add(selectedSlot.key);
        cells[selectedSlot.key] = {
          subject: g.groupName,
          faculty: 'Group Allocation',
          kind: 'theory',
          note: `Group: ${g.groupName} (Single Period ${sIdx + 1})`,
          bgColor: g.color || '#EFF6FF',
        };
      });
    }
  });

  // Assign Special Periods RANDOMLY per section (No cross-department or cross-section slot locking)
  matchingSpecialPeriods.forEach((sp, spIdx) => {
    const spSeed = hashString(`${generationSeed}-${snapshot.sectionKey}-${sp.id || sp.title}-${spIdx}`);
    const spRng = createSeededRng(spSeed);

    const pairedCount = sp.pairedPeriods !== undefined ? sp.pairedPeriods : 0;
    const individualCount = sp.individualPeriods !== undefined ? sp.individualPeriods : 1;

    // 1. Assign Paired Blocks (2-consecutive periods each) randomly
    if (pairedCount > 0) {
      const shuffledBlocks = shuffleWithRng(consecutiveTwoBlocks, spRng);
      let allocatedPairs = 0;
      for (const block of shuffledBlocks) {
        if (allocatedPairs >= pairedCount) break;
        if (block.keys.every((k) => !occupied.has(k))) {
          block.keys.forEach((k) => occupied.add(k));
          const [firstKey, secondKey] = block.keys;
          if (firstKey) {
            cells[firstKey] = {
              subject: sp.title,
              faculty: 'Special Period',
              kind: 'theory',
              note: `Special: ${sp.title} (Pair Period ${allocatedPairs + 1})`,
              colSpan: block.keys.length,
              bgColor: sp.color || '#FDF2F8',
            };
          }
          if (secondKey) {
            cells[secondKey] = {
              subject: sp.title,
              faculty: 'Special Period',
              kind: 'theory',
              note: `Special: ${sp.title} (Pair Period ${allocatedPairs + 1})`,
              isBlockSecondSlot: true,
              bgColor: sp.color || '#FDF2F8',
            };
          }
          allocatedPairs++;
        }
      }

      // Record any unallocated paired blocks as unfilled
      for (let p = allocatedPairs + 1; p <= pairedCount; p++) {
        unfilledPeriods.push({
          id: `unfilled-sp-${sp.id || sp.title}-pair-${p}`,
          subject: sp.title,
          faculty: 'Special Period',
          kind: 'theory',
          note: `Special: ${sp.title} (Pair Period ${p})`,
          isPair: true,
          colSpan: 2,
          bgColor: sp.color || '#FDF2F8',
          reason: 'no_slots',
        });
      }
    }

    // 2. Assign Individual Single Slots (1 period each) randomly
    if (individualCount > 0) {
      const shuffledSlots = shuffleWithRng(slots, spRng);
      let allocatedSingles = 0;
      for (const slot of shuffledSlots) {
        if (allocatedSingles >= individualCount) break;
        if (!occupied.has(slot.key)) {
          occupied.add(slot.key);
          cells[slot.key] = {
            subject: sp.title,
            faculty: 'Special Period',
            kind: 'theory',
            note: `Special: ${sp.title} (Single Period ${allocatedSingles + 1})`,
            bgColor: sp.color || '#FDF2F8',
          };
          allocatedSingles++;
        }
      }

      // Record any unallocated single slots as unfilled
      for (let i = allocatedSingles + 1; i <= individualCount; i++) {
        unfilledPeriods.push({
          id: `unfilled-sp-${sp.id || sp.title}-single-${i}`,
          subject: sp.title,
          faculty: 'Special Period',
          kind: 'theory',
          note: `Special: ${sp.title} (Single Period ${i})`,
          isPair: false,
          colSpan: 1,
          bgColor: sp.color || '#FDF2F8',
          reason: 'no_slots',
        });
      }
    }
  });

  // Filter out Group Allocation Exception Courses. Subjects with no staff are NOT filtered out —
  // they will appear in the timetable with an ⚠️ UNASSIGNED marker so the admin
  // can see exactly which subjects are missing a faculty assignment.
  const rawSubjects = [...(snapshot.subjectStaff || [])];
  const filteredSubjects = rawSubjects.filter((subject) => {
    if (!getSubjectLabel(subject)) return false;

    // Warn (but still include) subjects with no assigned staff
    const assigned = Array.isArray(subject?.assigned_staff) ? subject.assigned_staff : [];
    const hasStaff = assigned.length > 0 || Boolean(subject?.staff);
    if (!hasStaff) {
      warnings.push(`⚠️ No staff assigned for "${getSubjectLabel(subject)}" — it will appear as UNASSIGNED in the timetable. Please assign a faculty in Teaching Assignments.`);
      // Still allow subject through so it appears in the timetable
    }

    if (allExceptionCourses.length === 0) return true;
    const sCode = getSubjectCode(subject).toUpperCase();
    const sName = getSubjectName(subject).toUpperCase();
    const isExcepted = allExceptionCourses.some((e) => {
      const eCode = (e.course_code || '').toUpperCase();
      const eName = (e.course_name || '').toUpperCase();
      return (eCode && sCode.includes(eCode)) || (eName && sName.includes(eName));
    });
    return !isExcepted;
  });

  // Schedule ALL subjects based on Priority 1: Course Exception, Priority 2: Class Type Exception, Priority 3: Credit-Based Allocation
  const randomTieBreaker = new Map<any, number>();
  filteredSubjects.forEach((row) => {
    randomTieBreaker.set(row, rng());
  });

  const getCourseExceptionRule = (row: any) => {
    const sCode = getSubjectCode(row).toUpperCase();
    const sName = getSubjectName(row).toUpperCase();
    const secIdStr = String(snapshot.sectionId);
    const secKey = snapshot.sectionKey || '';
    const snapDept = (snapshot.department || '').toUpperCase();
    const snapYear = snapshot.year ? Number(snapshot.year) : null;

    return courseExceptions.find((rule) => {
      // 1. Course Code / Name Match
      const rCode = (rule.course_code || '').toUpperCase();
      const rName = (rule.course_name || '').toUpperCase();
      const courseMatched = (rCode && sCode === rCode) || (rCode && sCode.includes(rCode)) || (rName && sName.includes(rName));
      if (!courseMatched) return false;

      // 2. Section Mapping Match
      const selectedSecKeys = rule.selected_section_keys || [];
      const selectedDepts = rule.selected_departments || [];
      const ruleSem = rule.semester !== null && rule.semester !== undefined ? Number(rule.semester) : null;

      // If specific section keys are selected:
      if (selectedSecKeys.length > 0) {
        return selectedSecKeys.some((k) => k.includes(secIdStr) || (secKey && k.includes(secKey)));
      }

      // If specific departments are selected:
      if (selectedDepts.length > 0) {
        const deptMatches = selectedDepts.some((d) => {
          const dUpper = d.toUpperCase();
          if (dUpper === 'S&H') return snapDept.includes('SCIENCE') || snapDept.includes('S&H') || snapDept.includes('SH') || snapDept.includes('HUMANIT');
          if (dUpper === 'AI&DS') return snapDept.includes('AI') && (snapDept.includes('DS') || snapDept.includes('DATA'));
          if (dUpper === 'AIML') return snapDept.includes('AI') && (snapDept.includes('ML') || snapDept.includes('MACHINE'));
          if (dUpper === 'CIVIL') return snapDept === 'CIVIL' || snapDept === 'CE' || snapDept === 'CIV' || snapDept.includes('CIVIL');
          if (dUpper === 'MECH') return snapDept === 'MECH' || snapDept === 'ME' || snapDept === 'MEC' || snapDept.includes('MECH') || snapDept.includes('MECHANICAL');
          return snapDept.includes(dUpper);
        });
        if (!deptMatches) return false;
      }

      // If semester is specified:
      if (ruleSem !== null) {
        // Map snapshot year to semester range or compare directly
        if (snapYear !== null) {
          const minSemForYear = (snapYear - 1) * 2 + 1;
          const maxSemForYear = snapYear * 2;
          const semMatches = ruleSem === minSemForYear || ruleSem === maxSemForYear;
          if (!semMatches) return false;
        }
      }

      return true;
    });
  };

  const hasClassTypeExceptionRule = (row: any) => {
    const type = normalizeClassType(row?.class_type, row).toUpperCase();
    return classTypeExceptions.some((rule) => (rule.classType || '').toUpperCase() === type);
  };

  const sortedSubjects = [...filteredSubjects].sort((a, b) => {
    // Priority 1: Exception Course
    const aCourseExcept = Boolean(getCourseExceptionRule(a)) ? 0 : 1;
    const bCourseExcept = Boolean(getCourseExceptionRule(b)) ? 0 : 1;
    if (aCourseExcept !== bCourseExcept) return aCourseExcept - bCourseExcept;

    // Priority 2: Class Type Exception
    const aTypeExcept = hasClassTypeExceptionRule(a) ? 0 : 1;
    const bTypeExcept = hasClassTypeExceptionRule(b) ? 0 : 1;
    if (aTypeExcept !== bTypeExcept) return aTypeExcept - bTypeExcept;

    // Priority 3: Core subjects tie breaker
    const aCore = a?.is_dept_core ? 0 : 1;
    const bCore = b?.is_dept_core ? 0 : 1;
    if (aCore !== bCore) return aCore - bCore;
    return (randomTieBreaker.get(a) || 0) - (randomTieBreaker.get(b) || 0);
  });

  const subjectDayUsage: Record<string, Set<string>> = {};
  const getSubjectKey = (subject: any) => getSubjectCode(subject) || getSubjectName(subject) || getSubjectLabel(subject);

  // Pre-seed day usage with existing pinned slots
  Object.entries(pinnedSlots).forEach(([cellKey, pin]) => {
    const pinSubKey = (pin.code || pin.subject).toUpperCase().trim();
    const rowId = cellKey.split('-')[0];
    const row = template.rows.find((r) => r.id === rowId);
    if (row) {
      if (!subjectDayUsage[pinSubKey]) subjectDayUsage[pinSubKey] = new Set();
      subjectDayUsage[pinSubKey].add(row.day);
    }
  });

  const reserveSlot = (facultyIds: string[], subjectKey: string) => {
    const slotOrder = shuffleWithRng(slots, rng);

    const canUseSlot = (slot: { key: string; day: string }) => {
      if (occupied.has(slot.key)) return false;
      if (subjectDayUsage[subjectKey]?.has(slot.day)) return false;
      const facultyConflict = facultyIds.some((facultyId) => {
        if (!facultyId) return false;
        return globalFacultyUsage[facultyId]?.has(slot.key) || false;
      });
      return !facultyConflict;
    };

    const preferredSlot = slotOrder.find(canUseSlot);
    if (preferredSlot) {
      occupied.add(preferredSlot.key);
      if (!subjectDayUsage[subjectKey]) subjectDayUsage[subjectKey] = new Set();
      subjectDayUsage[subjectKey].add(preferredSlot.day);
      facultyIds.forEach((fId) => {
        if (fId) {
          if (!globalFacultyUsage[fId]) globalFacultyUsage[fId] = new Set();
          globalFacultyUsage[fId].add(preferredSlot.key);
        }
      });
      return { slot: preferredSlot, conflict: false };
    }

    const fallbackSlot = slotOrder.find((s) => !occupied.has(s.key));
    if (fallbackSlot) {
      occupied.add(fallbackSlot.key);
      if (!subjectDayUsage[subjectKey]) subjectDayUsage[subjectKey] = new Set();
      subjectDayUsage[subjectKey].add(fallbackSlot.day);
      facultyIds.forEach((fId) => {
        if (fId) {
          if (!globalFacultyUsage[fId]) globalFacultyUsage[fId] = new Set();
          globalFacultyUsage[fId].add(fallbackSlot.key);
        }
      });
      return { slot: fallbackSlot, conflict: true };
    }

    return null;
  };

  const reserveBlockPair = (facultyIds: string[], subjectKey: string) => {
    const blockOrder = shuffleWithRng(consecutiveTwoBlocks, rng);

    const canUseBlock = (block: { day: string; keys: string[] }) => {
      if (block.keys.some((k) => occupied.has(k))) return false;
      if (subjectDayUsage[subjectKey]?.has(block.day)) return false;
      const facultyConflict = facultyIds.some((facultyId) => {
        if (!facultyId) return false;
        return block.keys.some((k) => globalFacultyUsage[facultyId]?.has(k));
      });
      return !facultyConflict;
    };

    const preferredBlock = blockOrder.find(canUseBlock);
    if (preferredBlock) {
      preferredBlock.keys.forEach((k) => occupied.add(k));
      if (!subjectDayUsage[subjectKey]) subjectDayUsage[subjectKey] = new Set();
      subjectDayUsage[subjectKey].add(preferredBlock.day);
      facultyIds.forEach((fId) => {
        if (fId) {
          if (!globalFacultyUsage[fId]) globalFacultyUsage[fId] = new Set();
          preferredBlock.keys.forEach((k) => globalFacultyUsage[fId].add(k));
        }
      });
      return { block: preferredBlock, conflict: false };
    }

    const fallbackBlock = blockOrder.find((b) => b.keys.every((k) => !occupied.has(k)));
    if (fallbackBlock) {
      fallbackBlock.keys.forEach((k) => occupied.add(k));
      if (!subjectDayUsage[subjectKey]) subjectDayUsage[subjectKey] = new Set();
      subjectDayUsage[subjectKey].add(fallbackBlock.day);
      facultyIds.forEach((fId) => {
        if (fId) {
          if (!globalFacultyUsage[fId]) globalFacultyUsage[fId] = new Set();
          fallbackBlock.keys.forEach((k) => globalFacultyUsage[fId].add(k));
        }
      });
      return { block: fallbackBlock, conflict: true };
    }

    return null;
  };

  // Helper to complete a pinned single slot into a paired period block using an adjacent empty slot (before or after)
  const tryPairWithPinnedSlot = (pinnedKeys: string[], facultyIds: string[], subjectKey: string) => {
    for (const pKey of pinnedKeys) {
      if (cells[pKey]?.colSpan === 2 || cells[pKey]?.isBlockSecondSlot) continue; // already paired
      const [rId, cId] = pKey.split('-');
      const row = template.rows.find((r) => r.id === rId);
      if (!row) continue;
      const validCols = template.columns.filter((c) => c.period !== 'Break' && c.period !== 'Lunch');
      const cIdx = validCols.findIndex((c) => c.id === cId);
      if (cIdx === -1) continue;

      // Check slot after
      if (cIdx + 1 < validCols.length) {
        const nextKey = `${rId}-${validCols[cIdx + 1].id}`;
        if (!occupied.has(nextKey)) {
          occupied.add(nextKey);
          facultyIds.forEach((fId) => {
            if (fId) {
              if (!globalFacultyUsage[fId]) globalFacultyUsage[fId] = new Set();
              globalFacultyUsage[fId].add(nextKey);
            }
          });
          cells[pKey].colSpan = 2;
          cells[pKey].note = '📌 Pinned + Auto-Paired Block (2 Periods)';
          cells[nextKey] = {
            subject: cells[pKey].subject,
            faculty: cells[pKey].faculty,
            kind: cells[pKey].kind,
            note: '📌 Pinned + Auto-Paired Block (2 Periods)',
            isBlockSecondSlot: true,
            isPinned: true,
          };
          return true;
        }
      }

      // Check slot before
      if (cIdx - 1 >= 0) {
        const prevKey = `${rId}-${validCols[cIdx - 1].id}`;
        if (!occupied.has(prevKey)) {
          occupied.add(prevKey);
          facultyIds.forEach((fId) => {
            if (fId) {
              if (!globalFacultyUsage[fId]) globalFacultyUsage[fId] = new Set();
              globalFacultyUsage[fId].add(prevKey);
            }
          });
          cells[prevKey] = {
            subject: cells[pKey].subject,
            faculty: cells[pKey].faculty,
            kind: cells[pKey].kind,
            note: '📌 Pinned + Auto-Paired Block (2 Periods)',
            colSpan: 2,
            isPinned: true,
          };
          cells[pKey].isBlockSecondSlot = true;
          cells[pKey].note = '📌 Pinned + Auto-Paired Block (2 Periods)';
          return true;
        }
      }
    }
    return false;
  };

  for (const subject of sortedSubjects) {
    const facultyNames = getFacultyNames(subject);
    const facultyIds = Array.isArray(subject?.assigned_staff)
      ? subject.assigned_staff.map((staff: any) => getFacultyKey(staff)).filter(Boolean)
      : [];

    // For unassigned subjects: schedule a placeholder slot so the subject is visible
    const isUnassigned = facultyNames.length === 0;
    const displayFaculty = isUnassigned ? '⚠️ UNASSIGNED' : facultyNames.join(' / ');
    const displayFacultyIds = isUnassigned ? [] : facultyIds;

    const subjectKey = getSubjectKey(subject);
    const sCode = getSubjectCode(subject).toUpperCase().trim();
    const sClassType = normalizeClassType(subject?.class_type, subject).toUpperCase();

    // Determine how many periods of this subject are ALREADY pinned
    const pinnedKeys = (sCode ? pinnedKeysBySubject.get(sCode) : undefined) ||
                       pinnedKeysBySubject.get(subjectKey.toUpperCase().trim()) || [];
    let pinnedPeriodCount = pinnedKeys.length;

    // Count already formed 2-period pinned pairs
    let pinnedPairsCount = 0;
    pinnedKeys.forEach((k) => {
      if (cells[k]?.colSpan === 2) {
        pinnedPairsCount += 1;
      }
    });

    // Priority 1: Exception Course Rule
    const courseRule = getCourseExceptionRule(subject);

    // Priority 2: Class Type Exception Rule
    const classTypeRule = !courseRule
      ? classTypeExceptions.find((rule) => (rule.classType || '').toUpperCase() === sClassType)
      : undefined;

    if (courseRule) {
      // Execute Exception Course Schedule
      const totalIndividualReq = Math.max(0, Number(courseRule.individual_periods ?? courseRule.individualPeriods ?? 0));
      const totalPairedReq = Math.max(0, Number(courseRule.paired_periods ?? courseRule.pairedPeriods ?? 0));

      let remainingPairedCount = Math.max(0, totalPairedReq - pinnedPairsCount);
      let remainingIndividualCount = totalIndividualReq;

      // If we still need paired blocks and have single pinned slots, try expanding them into pairs with adjacent slots
      if (remainingPairedCount > 0 && pinnedPeriodCount > pinnedPairsCount * 2) {
        while (remainingPairedCount > 0 && tryPairWithPinnedSlot(pinnedKeys, displayFacultyIds, subjectKey)) {
          remainingPairedCount -= 1;
          pinnedPairsCount += 1;
        }
      }

      // Remaining pinned slots that are not paired count towards individual slots
      const remainingPinnedSingleCount = Math.max(0, pinnedPeriodCount - pinnedPairsCount * 2);
      remainingIndividualCount = Math.max(0, totalIndividualReq - remainingPinnedSingleCount);

      // 1. Schedule Remaining Paired Block Periods
      for (let p = 1; p <= remainingPairedCount; p++) {
        const blockResult = reserveBlockPair(displayFacultyIds, subjectKey);
        if (!blockResult) {
          warnings.push(`No 2-period block available for course exception ${getSubjectLabel(subject)} (Paired Block ${p}).`);
          unfilledPeriods.push({
            id: `unfilled-course-${sCode || subjectKey}-pair-${p}`,
            subject: buildCellText(subject, 'theory', `Block Pair ${p}`),
            faculty: displayFaculty,
            kind: 'theory',
            code: sCode,
            note: `Course Exception (${courseRule.course_code || 'Custom'}) - Block Pair (No slot available)`,
            isPair: true,
            colSpan: 2,
            bgColor: '#FEF3C7',
            reason: 'no_slots',
          });
          continue;
        }

        const { block, conflict } = blockResult;
        if (conflict) {
          warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (Paired Block ${p}) on ${block.day}.`);
        }

        const firstKey = block.keys[0];
        const secondKey = block.keys[1];

        if (firstKey) {
          cells[firstKey] = {
            subject: buildCellText(subject, 'theory', `Block Pair ${p}`),
            faculty: displayFaculty,
            kind: 'theory',
            note: (isUnassigned ? '⚠️ No staff! ' : conflict ? '⚠️ Conflict! ' : '') + `Course Exception (${courseRule.course_code || 'Custom'}) - Block Pair`,
            colSpan: block.keys.length,
          };
        }
        if (secondKey) {
          cells[secondKey] = {
            subject: buildCellText(subject, 'theory', `Block Pair ${p}`),
            faculty: displayFaculty,
            kind: 'theory',
            note: (isUnassigned ? '⚠️ No staff! ' : conflict ? '⚠️ Conflict! ' : '') + `Course Exception (${courseRule.course_code || 'Custom'}) - Block Pair`,
            isBlockSecondSlot: true,
          };
        }
      }

      // 2. Schedule Remaining Individual Single Periods
      for (let i = 1; i <= remainingIndividualCount; i++) {
        const reserveResult = reserveSlot(displayFacultyIds, subjectKey);
        if (!reserveResult) {
          warnings.push(`No single slot available for course exception ${getSubjectLabel(subject)} (Individual ${i}).`);
          unfilledPeriods.push({
            id: `unfilled-course-${sCode || subjectKey}-single-${i}`,
            subject: buildCellText(subject, 'theory', `Single ${i}`),
            faculty: displayFaculty,
            kind: 'theory',
            code: sCode,
            note: `Course Exception (${courseRule.course_code || 'Custom'}) - Single Period (No slot available)`,
            isPair: false,
            colSpan: 1,
            bgColor: '#EFF6FF',
            reason: 'no_slots',
          });
          continue;
        }

        const { slot, conflict } = reserveResult;
        if (conflict) {
          warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (Individual ${i}) at ${slot.day} ${slot.period}.`);
        }

        cells[slot.key] = {
          subject: buildCellText(subject, 'theory', `Single ${i}`),
          faculty: displayFaculty,
          kind: 'theory',
          note: (isUnassigned ? '⚠️ No staff! ' : conflict ? '⚠️ Conflict! ' : '') + `Course Exception (${courseRule.course_code || 'Custom'}) - Single Period`,
        };
      }
    } else if (classTypeRule) {
      // Execute Class Type Exception Schedule
      const totalIndividualReq = Math.max(0, Number(classTypeRule.individualPeriods || 0));
      const totalPairedReq = Math.max(0, Number(classTypeRule.pairedPeriods || 0));

      let remainingPairedCount = Math.max(0, totalPairedReq - pinnedPairsCount);
      let remainingIndividualCount = totalIndividualReq;

      // If we still need paired blocks and have single pinned slots, try expanding them into pairs with adjacent slots
      if (remainingPairedCount > 0 && pinnedPeriodCount > pinnedPairsCount * 2) {
        while (remainingPairedCount > 0 && tryPairWithPinnedSlot(pinnedKeys, displayFacultyIds, subjectKey)) {
          remainingPairedCount -= 1;
          pinnedPairsCount += 1;
        }
      }

      // Remaining pinned slots that are not paired count towards individual slots
      const remainingPinnedSingleCount = Math.max(0, pinnedPeriodCount - pinnedPairsCount * 2);
      remainingIndividualCount = Math.max(0, totalIndividualReq - remainingPinnedSingleCount);

      // 1. Schedule Remaining Paired Block Periods (2 consecutive slots per pair)
      for (let p = 1; p <= remainingPairedCount; p++) {
        const blockResult = reserveBlockPair(displayFacultyIds, subjectKey);
        if (!blockResult) {
          warnings.push(`No 2-period block available in the template for ${getSubjectLabel(subject)} (Paired Block ${p}).`);
          unfilledPeriods.push({
            id: `unfilled-type-${sCode || subjectKey}-pair-${p}`,
            subject: buildCellText(subject, 'theory', `Block Pair ${p}`),
            faculty: displayFaculty,
            kind: 'theory',
            code: sCode,
            note: `Class Type Exception (${sClassType}) - Block Pair (No slot available)`,
            isPair: true,
            colSpan: 2,
            bgColor: '#FEF3C7',
            reason: 'no_slots',
          });
          continue;
        }

        const { block, conflict } = blockResult;
        if (conflict) {
          warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (Paired Block ${p}) on ${block.day}.`);
        }

        const firstKey = block.keys[0];
        const secondKey = block.keys[1];

        if (firstKey) {
          cells[firstKey] = {
            subject: buildCellText(subject, 'theory', `Block Pair ${p}`),
            faculty: displayFaculty,
            kind: 'theory',
            note: (isUnassigned ? '⚠️ No staff! ' : conflict ? '⚠️ Conflict! ' : '') + `Class Type Exception (${sClassType}) - Block Pair`,
            colSpan: block.keys.length,
          };
        }
        if (secondKey) {
          cells[secondKey] = {
            subject: buildCellText(subject, 'theory', `Block Pair ${p}`),
            faculty: displayFaculty,
            kind: 'theory',
            note: (isUnassigned ? '⚠️ No staff! ' : conflict ? '⚠️ Conflict! ' : '') + `Class Type Exception (${sClassType}) - Block Pair`,
            isBlockSecondSlot: true,
          };
        }
      }

      // 2. Schedule Remaining Individual Single Periods
      for (let i = 1; i <= remainingIndividualCount; i++) {
        const reserveResult = reserveSlot(displayFacultyIds, subjectKey);
        if (!reserveResult) {
          warnings.push(`No single slot available in the template for ${getSubjectLabel(subject)} (Individual ${i}).`);
          unfilledPeriods.push({
            id: `unfilled-type-${sCode || subjectKey}-single-${i}`,
            subject: buildCellText(subject, 'theory', `Single ${i}`),
            faculty: displayFaculty,
            kind: 'theory',
            code: sCode,
            note: `Class Type Exception (${sClassType}) - Single Period (No slot available)`,
            isPair: false,
            colSpan: 1,
            bgColor: '#EFF6FF',
            reason: 'no_slots',
          });
          continue;
        }

        const { slot, conflict } = reserveResult;
        if (conflict) {
          warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (Individual ${i}) at ${slot.day} ${slot.period}.`);
        }

        cells[slot.key] = {
          subject: buildCellText(subject, 'theory', `Single ${i}`),
          faculty: displayFaculty,
          kind: 'theory',
          note: (isUnassigned ? '⚠️ No staff! ' : conflict ? '⚠️ Conflict! ' : '') + `Class Type Exception (${sClassType}) - Single Period`,
        };
      }
    } else {
      // Priority 3: Standard Credit-Based Allocation path
      const slotPlan = getRequiredSlotPlan(subject, creditAllocations);
      const remainingSlotPlan = slotPlan.slice(pinnedPeriodCount);

      for (let idx = 0; idx < remainingSlotPlan.length; idx++) {
        const entry = remainingSlotPlan[idx];
        const reserveResult = reserveSlot(displayFacultyIds, subjectKey);
        const credits = Number(subject?.c ?? subject?.credits ?? 0);

        if (!reserveResult) {
          warnings.push(`No unoccupied slot available in the template for ${getSubjectLabel(subject)} (${entry.label}).`);
          unfilledPeriods.push({
            id: `unfilled-credit-${sCode || subjectKey}-${idx}-${entry.label}`,
            subject: buildCellText(subject, entry.kind, entry.label),
            faculty: displayFaculty,
            kind: 'theory',
            code: sCode,
            note: `Credit (${credits}C) Allocation - ${entry.label} (No slot available)`,
            isPair: false,
            colSpan: 1,
            bgColor: '#EFF6FF',
            reason: 'no_slots',
          });
          continue;
        }

        const { slot, conflict } = reserveResult;
        if (conflict) {
          warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (${entry.label}) at ${slot.day} ${slot.period}. Faculty may be double-booked.`);
        }

        cells[slot.key] = {
          subject: buildCellText(subject, entry.kind, entry.label),
          faculty: displayFaculty,
          kind: 'theory',
          note: (isUnassigned ? '⚠️ No staff! ' : conflict ? '⚠️ Conflict! ' : '') + `Credit (${credits}C) Allocation`,
        };
      }
    }
  }

  return {
    sectionKey: snapshot.sectionKey,
    sectionName: snapshot.sectionName,
    year: snapshot.year ?? null,
    department: snapshot.department ?? 'SECTION',
    cells,
    warnings,
    unfilledPeriods,
  };
};

const DEPARTMENT_FILTER_MAP: Record<string, string> = {
  civil: 'CIVIL',
  mech: 'MECH',
  ece: 'ECE',
  eee: 'EEE',
  cse: 'CSE',
  it: 'IT',
  ai_ds: 'AI&DS',
  ai_ml: 'AIML',
};

const inferSectionDepartmentLabel = (section: any) => {
  const raw = normalizeText(
    section?.department_short_name ||
    section?.department_code ||
    section?.department?.short_name ||
    section?.department?.code ||
    section?.department?.name ||
    section?.batch?.department?.short_name ||
    section?.batch?.department?.code ||
    section?.batch?.department?.name
  );
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper.includes('AI') && upper.includes('DS')) return 'AI&DS';
  if (upper.includes('AI') && upper.includes('ML')) return 'AIML';
  return upper;
};


interface Column {
  id: string;
  title: string;
  period: string;
  timing: string;
}

interface Row {
  id: string;
  day: string;
}

interface SemesterTemplate {
  id: string;
  name: string;
  semesterType: 'odd' | 'even';
  columns: Column[];
  rows: Row[];
  createdAt: string;
}

interface TimetableGeneratorProps {
  templates: SemesterTemplate[];
  initialView?: 'generator' | 'saved';
}

export default function TimetableGenerator({ templates, initialView = 'generator' }: TimetableGeneratorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<SemesterTemplate | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'odd' | 'even'>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [facultyOptions, setFacultyOptions] = useState<{label: string, value: string}[]>([]);
  const [showTeachingAssign, setShowTeachingAssign] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [sectionSnapshots, setSectionSnapshots] = useState<Record<string, SectionSnapshot>>({});
  const [generatedSections, setGeneratedSections] = useState<GeneratedSectionTimetable[]>([]);
  const [courseExceptions, setCourseExceptions] = useState<CourseExceptionRule[]>([]);
  const [classTypeExceptions, setClassTypeExceptions] = useState<ClassTypeExceptionRule[]>([]);
  const [creditAllocations, setCreditAllocations] = useState<Record<number, number>>({});
  const [groupAllocations, setGroupAllocations] = useState<GroupAllocation[]>([]);
  const [specialPeriodAllocations, setSpecialPeriodAllocations] = useState<SpecialPeriodAllocation[]>([]);

  // Slot Pinning State
  const [pinnedSlots, setPinnedSlots] = useState<Record<string, Record<string, PinnedSlot>>>({});
  const [slotPinModal, setSlotPinModal] = useState<{
    isOpen: boolean;
    rowId: string;
    colId: string;
    day: string;
    period: string;
    timing: string;
    sectionKey: string;
    sectionName: string;
    sectionId: number;
    year: number | null;
    department: string;
  } | null>(null);
  const [slotPinSearch, setSlotPinSearch] = useState('');
  const [slotPinFilter, setSlotPinFilter] = useState<'all' | 'regular' | 'elective'>('all');
  const [sectionCurriculumOptions, setSectionCurriculumOptions] = useState<any[]>([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [pinConfirmModal, setPinConfirmModal] = useState<{
    isOpen: boolean;
    pinnedCount: number;
  } | null>(null);

  const [sectionsList, setSectionsList] = useState<any[]>([]);
  const [selectedSectionKey, setSelectedSectionKey] = useState('');
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: false,
    4: false
  });

  const [generationMessage, setGenerationMessage] = useState('');
  const [progressMessage, setProgressMessage] = useState('');

  const [showTeachingModal, setShowTeachingModal] = useState(false);
  const [saveTemplatePromptModal, setSaveTemplatePromptModal] = useState(false);
  const [templateSaveName, setTemplateSaveName] = useState('');

  // Track deleted periods per sectionKey (array of cellKeys deleted by user)
  const [deletedPeriods, setDeletedPeriods] = useState<Record<string, string[]>>({});
  const [deletedPeriodDetails, setDeletedPeriodDetails] = useState<Record<string, UnfilledPeriodItem[]>>({});
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);
  const [activeNavSemester, setActiveNavSemester] = useState<number>(2);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    deletedCount: number;
  } | null>(null);

  // Drafts stored in localStorage
  const DRAFTS_STORAGE_KEY = 'iqac_saved_timetable_drafts';
  const [savedDrafts, setSavedDrafts] = useState<Array<{
    id: string;
    title: string;
    savedAt: string;
    template: SemesterTemplate;
    generatedSections: GeneratedSectionTimetable[];
    pinnedSlots: Record<string, Record<string, PinnedSlot>>;
    deletedPeriods: Record<string, string[]>;
  }>>(() => {
    try {
      const stored = localStorage.getItem('iqac_saved_timetable_drafts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveCurrentToDrafts = (customTitle?: string) => {
    if (!selectedTemplate) return;
    const title = customTitle || templateSaveName || `${selectedTemplate.name} - Draft`;
    const draftId = `draft-${Date.now()}`;
    const newDraft = {
      id: draftId,
      title,
      savedAt: new Date().toISOString(),
      template: selectedTemplate,
      generatedSections,
      pinnedSlots,
      deletedPeriods,
    };
    const updated = [newDraft, ...savedDrafts.filter(d => d.title !== title)];
    setSavedDrafts(updated);
    try {
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save draft to localStorage:', e);
    }
  };

  const loadedSnapshotCount = Object.keys(sectionSnapshots).length;
  const canGenerateTimetable = Boolean(selectedTemplate);

  useEffect(() => {
    async function loadStaff() {
      try {
        const staff = await fetchDepartmentStaff();
        if (staff && staff.length > 0) {
          const options = staff.map(s => {
            const deptLabel = s.department?.short_name || s.department?.code || s.department?.name;
            const displayName = deptLabel ? `${s.name} (${deptLabel})` : s.name;
            return {
              label: displayName,
              value: String(s.id)
            };
          });
          const uniqueOptions = Array.from(new Map(options.map(item => [item.value, item])).values());
          setFacultyOptions(uniqueOptions);
        }
      } catch (error) {
        console.error('Failed to fetch faculty:', error);
      }
    }
    loadStaff();
  }, []);

  useEffect(() => {
    async function loadSections() {
      try {
        const res = await fetchWithAuth('/api/academics/sections/?page_size=0');
        if (res.ok) {
          const data = await res.json();
          const raw = data.results || data || [];

          const mapped = raw.map((r: any) => {
            let batchStr = r.batch_name || r.batch || '';
            if (typeof batchStr === 'object' && batchStr !== null) {
              batchStr = batchStr.name || '';
            }
            const batchName = String(batchStr);
            let yearNum = null;
            if (r.semester !== undefined && r.semester !== null) {
              const sem = Number(r.semester);
              if (sem === 1 || sem === 2) yearNum = 1;
              else if (sem === 3 || sem === 4) yearNum = 2;
              else if (sem === 5 || sem === 6) yearNum = 3;
              else if (sem >= 7) yearNum = 4;
            }
            if (yearNum === null && r.year !== undefined && r.year !== null) {
              yearNum = Number(r.year);
            }
            if (yearNum === null) {
              if (batchName.includes('2025')) yearNum = 1;
              else if (batchName.includes('2024')) yearNum = 2;
              else if (batchName.includes('2023')) yearNum = 3;
              else if (batchName.includes('2022')) yearNum = 4;
              else if (batchName.includes('2021')) yearNum = 4;
            }

            const sectionName = normalizeText(r.section_name || r.name || r.label || `Section ${r.id}`);
            const sectionDept = inferSectionDepartmentLabel(r) || 'SECTION';
            const sKey = `${yearNum}-${sectionDept}-${sectionName}`;

            return {
              id: r.id || r.section_id,
              name: sectionName,
              label: r.label || r.name,
              year: yearNum,
              semester: r.semester,
              department: sectionDept,
              sectionKey: sKey,
              department_short_name: r.department_short_name || r.department_code || (r.department && r.department.code) || ''
            };
          });

          mapped.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
          setSectionsList(mapped);

          if (mapped.length > 0) {
            const preferred = mapped.find((s: any) => s.year === 1 && s.department === 'S&H' && s.name === 'A') || mapped[0];
            setSelectedSectionKey(preferred.sectionKey);
          }
        }
      } catch (err) {
        console.error('Failed to load sections:', err);
      }
    }
    loadSections();
  }, []);

  const filteredTemplates = templates.filter((t) => {
    if (filterType === 'all') return true;
    return t.semesterType === filterType;
  });

  const oddTemplates = templates.filter((t) => t.semesterType === 'odd');
  const evenTemplates = templates.filter((t) => t.semesterType === 'even');

  const handleSectionSnapshot = (snapshot: SectionSnapshot) => {
    setSectionSnapshots((prev) => ({
      ...prev,
      [snapshot.sectionKey]: snapshot,
    }));
  };

  const getGroupedSections = () => {
    const grouped: Record<number, Record<string, any[]>> = {
      1: {},
      2: {},
      3: {},
      4: {},
    };

    const otherDepts = ['IT', 'AI&DS', 'AIML', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];
    [2, 3, 4].forEach(y => {
      otherDepts.forEach(d => {
        grouped[y][d] = [];
      });
    });
    grouped[1]['S&H'] = [];

    sectionsList.forEach(sec => {
      const year = sec.year;
      if (year !== 1 && year !== 2 && year !== 3 && year !== 4) return;

      const stdDept = sec.department || 'OTHER';

      if (year === 1) {
        const nameUpper = String(sec.name).toUpperCase().trim();
        const allowedSecs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
        if (stdDept === 'S&H' && allowedSecs.includes(nameUpper)) {
          grouped[1]['S&H'].push(sec);
        }
      } else {
        if (!grouped[year][stdDept]) {
          grouped[year][stdDept] = [];
        }
        grouped[year][stdDept].push(sec);
      }
    });

    [1, 2, 3, 4].forEach(y => {
      Object.keys(grouped[y]).forEach(d => {
        grouped[y][d].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      });
    });

    return grouped;
  };

  const getSectionSemester = (sec: any): number => {
    if (sec.semester !== undefined && sec.semester !== null && Number(sec.semester) > 0) {
      return Number(sec.semester);
    }
    const year = sec.year || 1;
    return selectedTemplate?.semesterType === 'odd' ? year * 2 - 1 : year * 2;
  };

  const getSectionsForSemester = (semester: number) => {
    return sectionsList.filter((sec) => getSectionSemester(sec) === semester);
  };

  const getDepartmentsForSemester = (semester: number): [string, any[]][] => {
    const semSections = getSectionsForSemester(semester);
    const deptMap: Record<string, any[]> = {};

    semSections.forEach((sec) => {
      const dept = sec.department || 'OTHER';
      if (!deptMap[dept]) deptMap[dept] = [];
      deptMap[dept].push(sec);
    });

    const sortedEntries = Object.entries(deptMap).sort(([a], [b]) => {
      if (a === 'S&H') return -1;
      if (b === 'S&H') return 1;
      return a.localeCompare(b);
    });

    sortedEntries.forEach(([, secs]) => {
      secs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    });

    return sortedEntries;
  };

  const getSectionUnfilledItems = (sectionKey: string): UnfilledPeriodItem[] => {
    const secGen = generatedSections.find((s) => s.sectionKey === sectionKey);
    const result: UnfilledPeriodItem[] = [];
    const seenIds = new Set<string>();

    // 1. Unfilled periods detected during generation
    if (secGen?.unfilledPeriods) {
      secGen.unfilledPeriods.forEach((item) => {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          result.push(item);
        }
      });
    }

    // 2. Manually deleted period details
    const deletedForSec = deletedPeriodDetails[sectionKey] || [];
    deletedForSec.forEach((item) => {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        result.push(item);
      }
    });

    // 3. Dynamic check of required periods vs placed periods in chart
    const snapshot = sectionSnapshots[sectionKey];
    if (secGen && snapshot) {
      const placedCells = Object.values(secGen.cells);

      (snapshot.subjectStaff || []).forEach((subj: any) => {
        const sLabel = getSubjectLabel(subj);
        if (!sLabel) return;
        const sCode = (getSubjectCode(subj) || '').toUpperCase().trim();
        const sName = (getSubjectName(subj) || '').toUpperCase().trim();

        const matchingCells = placedCells.filter((c) => {
          const cSub = (c.subject || '').toUpperCase();
          return (sCode && cSub.includes(sCode)) || (sName && cSub.includes(sName));
        });

        const placedPairs = matchingCells.filter((c) => c.colSpan === 2).length;
        const placedSingles = matchingCells.filter((c) => !c.colSpan || c.colSpan === 1).length;
        const totalPlaced = placedPairs * 2 + placedSingles;

        const courseRule = courseExceptions.find((r) => {
          const rCode = (r.course_code || '').toUpperCase();
          const rName = (r.course_name || '').toUpperCase();
          return (rCode && sCode.includes(rCode)) || (rName && sName.includes(rName));
        });

        const sClassType = normalizeClassType(subj?.class_type, subj).toUpperCase();
        const classTypeRule = !courseRule
          ? classTypeExceptions.find((r) => (r.classType || '').toUpperCase() === sClassType)
          : undefined;

        let reqPairs = 0;
        let reqSingles = 0;

        if (courseRule) {
          reqPairs = Math.max(0, Number(courseRule.paired_periods ?? courseRule.pairedPeriods ?? 0));
          reqSingles = Math.max(0, Number(courseRule.individual_periods ?? courseRule.individualPeriods ?? 0));
        } else if (classTypeRule) {
          reqPairs = Math.max(0, Number(classTypeRule.pairedPeriods ?? 0));
          reqSingles = Math.max(0, Number(classTypeRule.individualPeriods ?? 0));
        } else {
          const reqPlan = getRequiredSlotPlan(subj, creditAllocations);
          reqSingles = reqPlan.length;
        }

        const missingPairs = Math.max(0, reqPairs - placedPairs);
        const missingSingles = Math.max(0, reqSingles - placedSingles);

        // Missing paired blocks
        for (let p = 1; p <= missingPairs; p++) {
          const pId = `missing-${sectionKey}-${sCode || sName}-pair-${p}`;
          const countInResult = result.filter(
            (r) => r.isPair && ((sCode && r.subject.toUpperCase().includes(sCode)) || (sName && r.subject.toUpperCase().includes(sName)))
          ).length;
          if (countInResult < missingPairs && !seenIds.has(pId)) {
            seenIds.add(pId);
            result.push({
              id: pId,
              subject: buildCellText(subj, 'theory', `Pair Block ${p}`),
              faculty: getFacultyNames(subj).join(' / ') || 'Assigned Faculty',
              kind: 'theory',
              code: sCode,
              note: `${courseRule ? 'Course Exception' : classTypeRule ? 'Class Type' : 'Pair'} (2 Periods Required)`,
              isPair: true,
              colSpan: 2,
              bgColor: '#FEF3C7',
              reason: 'no_slots',
            });
          }
        }

        // Missing single periods
        for (let s = 1; s <= missingSingles; s++) {
          const sId = `missing-${sectionKey}-${sCode || sName}-single-${s}`;
          const countInResult = result.filter(
            (r) => !r.isPair && ((sCode && r.subject.toUpperCase().includes(sCode)) || (sName && r.subject.toUpperCase().includes(sName)))
          ).length;
          if (countInResult < missingSingles && !seenIds.has(sId)) {
            seenIds.add(sId);
            result.push({
              id: sId,
              subject: buildCellText(subj, 'theory', `Single Period ${s}`),
              faculty: getFacultyNames(subj).join(' / ') || 'Assigned Faculty',
              kind: 'theory',
              code: sCode,
              note: `Period Required (${totalPlaced}/${reqPairs * 2 + reqSingles} Placed)`,
              isPair: false,
              colSpan: 1,
              bgColor: '#EFF6FF',
              reason: 'no_slots',
            });
          }
        }
      });
    }

    return result;
  };

  const getSectionUnfilledCount = (sectionKey: string): number => {
    return getSectionUnfilledItems(sectionKey).length;
  };

  const getDeptUnfilledCount = (semester: number, dept: string): number => {
    const semSecs = getSectionsForSemester(semester).filter((s) => (s.department || 'OTHER') === dept);
    return semSecs.reduce((sum, s) => sum + getSectionUnfilledCount(s.sectionKey), 0);
  };

  const getSemesterUnfilledCount = (semester: number): number => {
    const semSecs = getSectionsForSemester(semester);
    return semSecs.reduce((sum, s) => sum + getSectionUnfilledCount(s.sectionKey), 0);
  };

  // Fetch curriculum subjects for slot pinning when modal opens
  useEffect(() => {
    if (!slotPinModal?.sectionId) {
      setSectionCurriculumOptions([]);
      return;
    }

    let isMounted = true;
    async function fetchCurriculum() {
      setLoadingCurriculum(true);
      try {
        const [currRes, staffRes] = await Promise.all([
          fetchWithAuth(`/api/timetable/curriculum-for-section/?section_id=${slotPinModal?.sectionId}`),
          fetchWithAuth(`/api/timetable/section/${slotPinModal?.sectionId}/subjects-staff/`)
        ]);

        let combined: any[] = [];
        const staffByCode = new Map<string, any>();

        if (staffRes.ok) {
          const staffData = await staffRes.json();
          const staffList = staffData.results || staffData || [];
          staffList.forEach((s: any) => {
            const code = getSubjectCode(s).toUpperCase();
            if (code) staffByCode.set(code, s);
          });
        }

        if (currRes.ok) {
          const currData = await currRes.json();
          const currList = currData.results || currData || [];
          combined = currList.map((c: any) => {
            const code = getSubjectCode(c).toUpperCase();
            const staffObj = staffByCode.get(code);
            return {
              ...c,
              assigned_staff: staffObj?.assigned_staff || c?.assigned_staff || [],
              staff: staffObj?.staff || c?.staff
            };
          });
        }

        // If curriculum endpoint returned empty, fallback to subjects-staff
        if (combined.length === 0 && staffByCode.size > 0) {
          combined = Array.from(staffByCode.values());
        }

        if (isMounted) {
          setSectionCurriculumOptions(combined);
        }
      } catch (err) {
        console.error('Failed to load curriculum options for slot pin:', err);
      } finally {
        if (isMounted) setLoadingCurriculum(false);
      }
    }

    fetchCurriculum();
    return () => {
      isMounted = false;
    };
  }, [slotPinModal?.sectionId]);

  const executeGeneration = async (activePinned: Record<string, Record<string, PinnedSlot>>) => {
    setIsGenerating(true);
    setGeneratedSections([]);
    setGenerationMessage('Loading section data from the backend...');
    setProgressMessage('Loading sections list...');

    try {
      const res = await fetchWithAuth('/api/academics/sections/?page_size=0');
      if (res.ok) {
        let data: any;
        try {
          data = await res.json();
        } catch (parseError) {
          console.error('Failed to parse sections list response:', parseError);
          setGenerationMessage(`Failed to parse sections list response: ${String(parseError?.message || parseError)}`);
          setProgressMessage('');
          setIsGenerating(false);
          return;
        }
        const rawSections = data.results || data || [];
        const fetchedSnapshots: SectionSnapshot[] = [];
        const failedSectionLoads: Array<{ sectionId: number; sectionName: string; status?: number; message?: string }> = [];

        let count = 0;
        for (const section of rawSections) {
          count++;
          const sectionId = Number(section.id || section.section_id || 0);
          if (!sectionId) continue;

          const sectionName = normalizeText(section.section_name || section.name || section.label || `Section ${sectionId}`);
          const sectionDept = inferSectionDepartmentLabel(section) || 'SECTION';
          setProgressMessage(`Loading subjects and staff for section ${count} of ${rawSections.length}: ${sectionDept} - ${sectionName}...`);

          try {
            const subjectsRes = await fetchWithAuth(`/api/timetable/section/${sectionId}/subjects-staff/`);
            if (!subjectsRes.ok) {
              let errorMessage = `HTTP ${subjectsRes.status}`;
              try {
                const bodyText = await subjectsRes.text();
                if (bodyText) errorMessage += ` - ${bodyText}`;
              } catch (_) {
                // ignore parse errors
              }
              failedSectionLoads.push({ sectionId, sectionName, status: subjectsRes.status, message: errorMessage });
              continue;
            }
            const subjectsData = await subjectsRes.json();
            const subjectStaff = subjectsData.results || subjectsData || [];

            let batchStr = section.batch_name || section.batch || '';
            if (typeof batchStr === 'object' && batchStr !== null) {
              batchStr = batchStr.name || '';
            }
            const batchName = String(batchStr);
            let yearNum = null;
            if (section.semester !== undefined && section.semester !== null) {
              const sem = Number(section.semester);
              if (sem === 1 || sem === 2) yearNum = 1;
              else if (sem === 3 || sem === 4) yearNum = 2;
              else if (sem === 5 || sem === 6) yearNum = 3;
              else if (sem >= 7) yearNum = 4;
            }
            if (yearNum === null && section.year !== undefined && section.year !== null) {
              yearNum = Number(section.year);
            }
            if (yearNum === null) {
              if (batchName.includes('2025')) yearNum = 1;
              else if (batchName.includes('2024')) yearNum = 2;
              else if (batchName.includes('2023')) yearNum = 3;
              else if (batchName.includes('2022')) yearNum = 4;
              else if (batchName.includes('2021')) yearNum = 4;
            }

            const sKey = `${yearNum}-${sectionDept}-${sectionName}`;
            fetchedSnapshots.push({
              sectionKey: sKey,
              sectionId,
              sectionName: `${sectionDept}-${sectionName}`,
              subjects: subjectStaff,
              assignments: [],
              advisors: [],
              subjectStaff,
              year: yearNum,
              semester: section.semester !== undefined && section.semester !== null ? Number(section.semester) : null,
              department: sectionDept,
            });
          } catch (err) {
            console.error('Failed to load section snapshot:', err);
          }
        }

        setProgressMessage('Generating timetables...');
        const snapshotMap = new Map<string, SectionSnapshot>();
        // Only register distinct section snapshots loaded directly for this exact section
        fetchedSnapshots.forEach((snapshot) => {
          snapshotMap.set(snapshot.sectionKey, snapshot);
        });

        // Overlay manual snapshots if matching exact sectionKey and sectionId
        Object.values(sectionSnapshots).forEach((snapshot) => {
          const fromFetch = snapshotMap.get(snapshot.sectionKey);
          if (fromFetch && snapshot.sectionId === fromFetch.sectionId) {
            snapshotMap.set(snapshot.sectionKey, {
              ...snapshot,
              year: snapshot.year || fromFetch?.year || null,
              semester: snapshot.semester || fromFetch?.semester || null,
              department: snapshot.department || fromFetch?.department || 'SECTION',
              subjectStaff: snapshot.subjectStaff && snapshot.subjectStaff.length > 0 ? snapshot.subjectStaff : fromFetch.subjectStaff,
              subjects: snapshot.subjects && snapshot.subjects.length > 0 ? snapshot.subjects : fromFetch.subjects,
            });
          }
        });

        const workingSnapshots = Array.from(snapshotMap.values());

        if (workingSnapshots.length === 0) {
          setGeneratedSections([]);
          let failureMessage = 'No section data could be loaded.';
          if (rawSections.length === 0) {
            failureMessage += ' The section list endpoint returned no sections.';
          } else if (failedSectionLoads.length > 0) {
            failureMessage += ` Loaded ${rawSections.length} sections, but subjects/staff failed for ${failedSectionLoads.length} sections.`;
          } else {
            failureMessage += ' Verify the section API returns subjects and staff.';
          }
          setGenerationMessage(failureMessage);
          setProgressMessage('');
          return;
        }

        const globalFacultyUsage: Record<string, Set<string>> = {};
        const generationSeed = Date.now();

        // Fetch configurations from API
        let groupAllocations: GroupAllocation[] = [];
        let specialPeriodAllocations: SpecialPeriodAllocation[] = [];
        let creditAllocations: Record<number, number> = {};
        let classTypeExceptions: ClassTypeExceptionRule[] = [];
        let courseExceptions: CourseExceptionRule[] = [];
        let venueExceptions: any[] = [];

        try {
          const [groupRes, specialRes, creditRes, exceptionRes, courseRes, venueRes] = await Promise.all([
            fetchWithAuth('/api/timetable/group-allocations/?page_size=0'),
            fetchWithAuth('/api/timetable/special-periods/?page_size=0'),
            fetchWithAuth('/api/timetable/credit-allocations/?page_size=0'),
            fetchWithAuth('/api/timetable/class-type-exceptions/?page_size=0'),
            fetchWithAuth('/api/timetable/course-exceptions/?page_size=0'),
            fetchWithAuth('/api/timetable/venue-exceptions/?page_size=0')
          ]);

          if (groupRes.ok) {
            const gData = await groupRes.json();
            groupAllocations = (gData.results || gData).map((item: any) => ({
              id: item.frontend_id,
              groupName: item.group_name,
              color: item.color || '#EFF6FF',
              selectedYears: item.selected_years || [],
              selectedDepartments: item.selected_departments || [],
              selectedSectionKeys: item.selected_section_keys || [],
              selectedMixedSectionKeys: item.selected_mixed_section_keys || [],
              exceptionCourses: item.exception_courses || [],
              individualPeriods: item.individual_periods,
              pairedPeriods: item.paired_periods,
              blockPeriodEnabled: item.paired_periods > 0,
              blockPeriodCount: item.paired_periods,
            }));
          }

          if (specialRes.ok) {
            const spData = await specialRes.json();
            specialPeriodAllocations = (spData.results || spData).map((item: any) => ({
              id: item.frontend_id,
              title: item.title,
              color: item.color || '#FDF2F8',
              selectedYears: item.selected_years || [],
              selectedDepartments: item.selected_departments || [],
              selectedSectionKeys: item.selected_section_keys || [],
              selectedMixedSectionKeys: item.selected_mixed_section_keys || [],
              exceptionCourses: item.exception_courses || [],
              individualPeriods: item.individual_periods,
              pairedPeriods: item.paired_periods,
            }));
          }

          if (creditRes.ok) {
            const cData = await creditRes.json();
            (cData.results || cData).forEach((item: any) => {
              creditAllocations[item.credit_value] = item.periods;
            });
          }

          if (exceptionRes.ok) {
            const eData = await exceptionRes.json();
            classTypeExceptions = (eData.results || eData).map((item: any) => ({
              id: item.id,
              classType: item.class_type,
              individualPeriods: item.individual_periods,
              pairedPeriods: item.paired_periods,
            }));
          }

          if (courseRes.ok) {
            const crData = await courseRes.json();
            courseExceptions = (crData.results || crData).map((item: any) => ({
              id: item.id,
              course_id: item.course_id,
              course_code: item.course_code,
              course_name: item.course_name,
              semester: item.semester ?? null,
              selected_departments: item.selected_departments || [],
              selected_section_keys: item.selected_section_keys || [],
              individual_periods: item.individual_periods,
              paired_periods: item.paired_periods,
              individualPeriods: item.individual_periods,
              pairedPeriods: item.paired_periods,
            }));
          }

          if (venueRes.ok) {
            const vData = await venueRes.json();
            venueExceptions = (vData.results || vData).map((item: any) => ({
              id: item.frontend_id,
              venueName: item.venue_name,
              groupIds: item.group_ids || [],
              capacity: item.capacity
            }));
          }
        } catch (e) {
          console.error('Failed to load configurations from API during generation:', e);
        }

        // Precompute synchronized time slot schedules for each Group Allocation across all sections / departments
        const templateSlots = getTemplateSlots(selectedTemplate);
        const template2Blocks = getConsecutiveBlocksForTemplate(selectedTemplate, 2);

        // Helper to get matching section keys for a group allocation to avoid cross-department slot starvation
        const getGroupScopeKeys = (g: GroupAllocation) => {
          if (g.selectedSectionKeys?.length > 0 || g.selectedMixedSectionKeys?.length > 0) {
            return [...g.selectedSectionKeys, ...g.selectedMixedSectionKeys];
          }
          const years = g.selectedYears?.length > 0 ? g.selectedYears : [1, 2, 3, 4];
          const depts = g.selectedDepartments?.length > 0 ? g.selectedDepartments : ['ALL'];
          return years.flatMap(y => depts.map(d => `${y}-${d}`));
        };

        const groupSchedulePlan: Record<string, {
          pairBlocks: Array<{ keys: string[]; day: string }>;
          singleSlots: Array<{ key: string; day: string; period: string }>;
        }> = {};

        // Track occupied slots per scope key
        const scopeOccupiedSlots: Record<string, Set<string>> = {};

        groupAllocations.forEach((g, gIdx) => {
          const groupSeed = hashString(`${generationSeed}-${g.id || g.groupName}-${gIdx}`);
          const groupRng = createSeededRng(groupSeed);
          const scopes = getGroupScopeKeys(g);

          const isSlotOccupiedForGroup = (slotKey: string) => {
            return scopes.some(s => scopeOccupiedSlots[s]?.has(slotKey));
          };

          const isBlockOccupiedForGroup = (blockKeys: string[]) => {
            return blockKeys.some(k => isSlotOccupiedForGroup(k));
          };

          const markSlotOccupiedForGroup = (slotKey: string) => {
            scopes.forEach(s => {
              if (!scopeOccupiedSlots[s]) scopeOccupiedSlots[s] = new Set<string>();
              scopeOccupiedSlots[s].add(slotKey);
            });
          };

          const pairedCount = g.pairedPeriods !== undefined ? g.pairedPeriods : (g.blockPeriodEnabled ? (g.blockPeriodCount || 1) : 0);
          const individualCount = g.individualPeriods !== undefined ? g.individualPeriods : (pairedCount === 0 ? 1 : 0);

          const assignedPairBlocks: Array<{ keys: string[]; day: string }> = [];
          const assignedSingleSlots: Array<{ key: string; day: string; period: string }> = [];

          // 1. Assign Paired Blocks (2 consecutive periods each)
          if (pairedCount > 0) {
            const shuffledBlocks = shuffleWithRng(template2Blocks, groupRng);
            for (let p = 1; p <= pairedCount; p++) {
              const selectedBlock = shuffledBlocks.find((b) => !isBlockOccupiedForGroup(b.keys));
              if (selectedBlock) {
                selectedBlock.keys.forEach((k) => markSlotOccupiedForGroup(k));
                assignedPairBlocks.push(selectedBlock);
              }
            }
          }

          // 2. Assign Single Slots (1 individual period each)
          if (individualCount > 0) {
            const shuffledSlots = shuffleWithRng(templateSlots, groupRng);
            for (let i = 1; i <= individualCount; i++) {
              const selectedSlot = shuffledSlots.find((s) => !isSlotOccupiedForGroup(s.key));
              if (selectedSlot) {
                markSlotOccupiedForGroup(selectedSlot.key);
                assignedSingleSlots.push(selectedSlot);
              }
            }
          }

          const groupKey = g.id || g.groupName;
          groupSchedulePlan[groupKey] = {
            pairBlocks: assignedPairBlocks,
            singleSlots: assignedSingleSlots,
          };
          // Also map by groupName in case matching is keyed by name
          if (g.groupName) {
            groupSchedulePlan[g.groupName] = groupSchedulePlan[groupKey];
          }
        });

        const results = workingSnapshots.map((snapshot, index) => {
          const secPinned = activePinned[snapshot.sectionKey] || {};
          const secDeleted = deletedPeriods[snapshot.sectionKey] || [];
          return buildGeneratedSection(
            snapshot,
            selectedTemplate,
            globalFacultyUsage,
            generationSeed,
            index,
            groupAllocations,
            creditAllocations,
            classTypeExceptions,
            courseExceptions,
            groupSchedulePlan,
            secPinned,
            specialPeriodAllocations,
            secDeleted
          );
        });

        setGeneratedSections(results);
        setIsGenerating(false);
        setProgressMessage('');

        // Auto-save generated timetable draft to LocalStorage
        if (selectedTemplate) {
          const title = templateSaveName || `${selectedTemplate.name} - Generated (${new Date().toLocaleTimeString()})`;
          const draftId = `draft-${Date.now()}`;
          const newDraft = {
            id: draftId,
            title,
            savedAt: new Date().toISOString(),
            template: selectedTemplate,
            generatedSections: results,
            pinnedSlots: activePinned,
            deletedPeriods,
          };
          setSavedDrafts((prev) => [newDraft, ...prev.filter((d) => d.title !== title)]);
          try {
            const existingStored = localStorage.getItem('iqac_saved_timetable_drafts');
            const parsed = existingStored ? JSON.parse(existingStored) : [];
            localStorage.setItem('iqac_saved_timetable_drafts', JSON.stringify([newDraft, ...parsed.filter((d: any) => d.title !== title)]));
          } catch (e) {
            console.error('Failed to store draft:', e);
          }
        }

        if (failedSectionLoads.length > 0) {
          console.warn('Some sections failed to load subjects/staff:', failedSectionLoads);
        }

        const selectedResult = results.find((result) => result.sectionKey === selectedSectionKey);
        if (selectedResult) {
          setSelectedSectionKey(selectedResult.sectionKey);
        } else if (results.length > 0) {
          setSelectedSectionKey(results[0].sectionKey);
        }

        const warnings = results.flatMap((result) => result.warnings);
        setGenerationMessage(warnings.length > 0
          ? `Timetable generated with ${warnings.length} warnings. Select sections in the navigator to view details.`
          : 'Timetable generated successfully with faculty-conflict checks applied.');
      } else {
        let responseText = '';
        try {
          responseText = await res.text();
        } catch (_) {
          responseText = '';
        }
        setGenerationMessage(`Failed to load sections from backend (HTTP ${res.status})${responseText ? `: ${responseText}` : ''}`);
        setProgressMessage('');
      }
    } catch (error) {
      console.error('Auto-load failed:', error);
      setGenerationMessage(`Failed to load section data: ${String(error?.message || error)}`);
      setProgressMessage('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateNow = async () => {
    if (!selectedTemplate) {
      setGenerationMessage('Select a timetable template first.');
      return;
    }

    const totalDeletedCount = Object.values(deletedPeriods).reduce(
      (sum, sec) => sum + (sec || []).length,
      0
    );

    if (totalDeletedCount > 0) {
      setDeleteConfirmModal({
        isOpen: true,
        deletedCount: totalDeletedCount,
      });
      return;
    }

    // Check if any pinned slots exist
    const totalPinnedCount = Object.values(pinnedSlots).reduce(
      (sum, sec) => sum + Object.keys(sec || {}).length,
      0
    );

    if (totalPinnedCount > 0) {
      setPinConfirmModal({
        isOpen: true,
        pinnedCount: totalPinnedCount,
      });
      return;
    }

    await executeGeneration(pinnedSlots);
  };

  const handlePinSubjectToSlot = (subjectRow: any) => {
    if (!slotPinModal) return;
    const { sectionKey, rowId, colId } = slotPinModal;
    const cellKey = `${rowId}-${colId}`;

    const facultyNames = getFacultyNames(subjectRow);
    const code = getSubjectCode(subjectRow);
    const credits = Number(subjectRow?.c ?? subjectRow?.credits ?? 0);
    const classType = normalizeClassType(subjectRow?.class_type, subjectRow);
    const isElective = Boolean(subjectRow?.is_elective || subjectRow?.elective_type || String(subjectRow?.course_type || '').toLowerCase().includes('elective'));

    const newPin: PinnedSlot = {
      subject: buildCellText(subjectRow, 'theory', 'Pinned'),
      faculty: facultyNames.length > 0 ? facultyNames.join(' / ') : '⚠️ UNASSIGNED',
      kind: 'theory',
      code: code || '',
      classType: classType || '',
      credits: credits || 0,
      isElective,
      note: `📌 Pinned: ${slotPinModal.period} (${slotPinModal.day})`,
      bgColor: '#FEF3C7',
    };

    setPinnedSlots((prev) => ({
      ...prev,
      [sectionKey]: {
        ...(prev[sectionKey] || {}),
        [cellKey]: newPin,
      },
    }));

    // If active generated timetable exists, immediately reflect pinned slot in cells
    setGeneratedSections((prev) =>
      prev.map((sec) => {
        if (sec.sectionKey === sectionKey) {
          return {
            ...sec,
            cells: {
              ...sec.cells,
              [cellKey]: {
                subject: newPin.subject,
                faculty: newPin.faculty,
                kind: newPin.kind,
                note: newPin.note,
                bgColor: newPin.bgColor,
                isPinned: true,
                colSpan: 1,
              },
            },
          };
        }
        return sec;
      })
    );

    setSlotPinModal(null);
  };

  const handleDeleteCell = (sectionKey: string, cellKey: string) => {
    const targetSec = generatedSections.find((s) => s.sectionKey === sectionKey);
    const cellToDelete = targetSec?.cells[cellKey];
    let isPair = false;
    let otherKey: string | null = null;

    if (cellToDelete?.colSpan === 2 && selectedTemplate) {
      isPair = true;
      const [rId, cId] = cellKey.split('-');
      const validCols = selectedTemplate.columns.filter((c) => c.period !== 'Break' && c.period !== 'Lunch');
      const cIdx = validCols.findIndex((c) => c.id === cId);
      if (cIdx !== -1 && cIdx + 1 < validCols.length) {
        otherKey = `${rId}-${validCols[cIdx + 1].id}`;
      }
    } else if (cellToDelete?.isBlockSecondSlot && selectedTemplate) {
      isPair = true;
      const [rId, cId] = cellKey.split('-');
      const validCols = selectedTemplate.columns.filter((c) => c.period !== 'Break' && c.period !== 'Lunch');
      const cIdx = validCols.findIndex((c) => c.id === cId);
      if (cIdx > 0) {
        otherKey = `${rId}-${validCols[cIdx - 1].id}`;
      }
    }

    setGeneratedSections((prev) =>
      prev.map((sec) => {
        if (sec.sectionKey === sectionKey) {
          const updatedCells = { ...sec.cells };
          delete updatedCells[cellKey];
          if (otherKey) delete updatedCells[otherKey];
          return {
            ...sec,
            cells: updatedCells,
          };
        }
        return sec;
      })
    );

    // Save deleted period info into deletedPeriodDetails so it appears in the unfilled tray
    if (cellToDelete) {
      const primaryKey = cellToDelete.isBlockSecondSlot && otherKey ? otherKey : cellKey;
      const deletedItem: UnfilledPeriodItem = {
        id: `deleted-${sectionKey}-${primaryKey}-${Date.now()}`,
        subject: cellToDelete.subject,
        faculty: cellToDelete.faculty,
        kind: cellToDelete.kind || 'theory',
        note: `Deleted Period (was in ${cellKey})`,
        isPair: isPair,
        colSpan: isPair ? 2 : 1,
        bgColor: '#FEE2E2',
        reason: 'deleted',
        sourceCellKey: primaryKey,
      };

      setDeletedPeriodDetails((prev) => ({
        ...prev,
        [sectionKey]: [...(prev[sectionKey] || []).filter((d) => d.sourceCellKey !== primaryKey), deletedItem],
      }));
    }

    // Remove from pinned slots if pinned
    setPinnedSlots((prev) => {
      const secPinned = { ...(prev[sectionKey] || {}) };
      delete secPinned[cellKey];
      if (otherKey) delete secPinned[otherKey];
      return {
        ...prev,
        [sectionKey]: secPinned,
      };
    });

    // Track cell key in deletedPeriods
    setDeletedPeriods((prev) => {
      const existing = prev[sectionKey] || [];
      const keysToAdd = [cellKey, ...(otherKey ? [otherKey] : [])].filter((k) => !existing.includes(k));
      return {
        ...prev,
        [sectionKey]: [...existing, ...keysToAdd],
      };
    });

    setSlotPinModal(null);
  };

  const handlePlaceUnfilledCell = (sectionKey: string, targetCellKey: string, cellData: any) => {
    const isPair = Boolean(cellData.isPair || cellData.colSpan === 2);
    const [rowId, colId] = targetCellKey.split('-');

    // If it's a pair block, find next column if available
    let nextCellKey: string | null = null;
    if (isPair && selectedTemplate) {
      const validCols = selectedTemplate.columns.filter((c) => c.period !== 'Break' && c.period !== 'Lunch');
      const cIdx = validCols.findIndex((c) => c.id === colId);
      if (cIdx !== -1 && cIdx + 1 < validCols.length) {
        nextCellKey = `${rowId}-${validCols[cIdx + 1].id}`;
      } else {
        alert('Cannot place a 2-period pair block at the end of the day. Please choose an earlier slot.');
        return;
      }
    }

    setGeneratedSections((prev) =>
      prev.map((sec) => {
        if (sec.sectionKey === sectionKey) {
          const updatedCells = { ...sec.cells };

          if (isPair && nextCellKey) {
            updatedCells[targetCellKey] = {
              subject: cellData.subject,
              faculty: cellData.faculty,
              kind: cellData.kind || 'theory',
              colSpan: 2,
              note: `📌 Placed: ${cellData.note || 'Paired Block'}`,
              bgColor: cellData.bgColor || '#FEF3C7',
              isPinned: true,
            };
            updatedCells[nextCellKey] = {
              subject: cellData.subject,
              faculty: cellData.faculty,
              kind: cellData.kind || 'theory',
              isBlockSecondSlot: true,
              note: `📌 Placed: ${cellData.note || 'Paired Block'}`,
              bgColor: cellData.bgColor || '#FEF3C7',
              isPinned: true,
            };
          } else {
            updatedCells[targetCellKey] = {
              subject: cellData.subject,
              faculty: cellData.faculty,
              kind: cellData.kind || 'theory',
              colSpan: 1,
              note: `📌 Placed: ${cellData.note || 'Manual'}`,
              bgColor: cellData.bgColor || '#EFF6FF',
              isPinned: true,
            };
          }

          // Remove item from unfilledPeriods if matched by id
          const updatedUnfilled = (sec.unfilledPeriods || []).filter((u) => u.id !== cellData.id);

          return {
            ...sec,
            cells: updatedCells,
            unfilledPeriods: updatedUnfilled,
          };
        }
        return sec;
      })
    );

    // Remove from deletedPeriodDetails
    setDeletedPeriodDetails((prev) => {
      const list = prev[sectionKey] || [];
      return {
        ...prev,
        [sectionKey]: list.filter((item) => item.id !== cellData.id && item.sourceCellKey !== cellData.sourceCellKey),
      };
    });

    // Remove from deletedPeriods
    setDeletedPeriods((prev) => {
      const list = prev[sectionKey] || [];
      const keysToRemove = [targetCellKey, ...(nextCellKey ? [nextCellKey] : []), cellData.sourceCellKey].filter(Boolean);
      return {
        ...prev,
        [sectionKey]: list.filter((k) => !keysToRemove.includes(k)),
      };
    });

    // Also register in pinned slots
    setPinnedSlots((prev) => {
      const secPinned = { ...(prev[sectionKey] || {}) };
      secPinned[targetCellKey] = {
        subject: cellData.subject,
        faculty: cellData.faculty,
        kind: cellData.kind || 'theory',
        code: cellData.code || '',
        classType: '',
        credits: 0,
        isElective: false,
        note: `📌 Placed: ${cellData.note || ''}`,
        bgColor: cellData.bgColor || '#FEF3C7',
      };
      if (isPair && nextCellKey) {
        secPinned[nextCellKey] = {
          subject: cellData.subject,
          faculty: cellData.faculty,
          kind: cellData.kind || 'theory',
          code: cellData.code || '',
          classType: '',
          credits: 0,
          isElective: false,
          note: `📌 Placed: ${cellData.note || ''}`,
          bgColor: cellData.bgColor || '#FEF3C7',
        };
      }
      return {
        ...prev,
        [sectionKey]: secPinned,
      };
    });
  };

  const autoPlaceUnfilledItem = (item: UnfilledPeriodItem) => {
    if (!selectedSectionKey || !selectedTemplate) return;
    const targetSec = generatedSections.find((s) => s.sectionKey === selectedSectionKey);
    const occupiedCells = targetSec?.cells || {};
    const isPair = Boolean(item.isPair || item.colSpan === 2);
    const validCols = selectedTemplate.columns.filter((c) => c.period !== 'Break' && c.period !== 'Lunch');

    if (isPair) {
      for (const row of selectedTemplate.rows) {
        for (let i = 0; i < validCols.length - 1; i++) {
          const k1 = `${row.id}-${validCols[i].id}`;
          const k2 = `${row.id}-${validCols[i + 1].id}`;
          if (!occupiedCells[k1] && !occupiedCells[k2]) {
            handlePlaceUnfilledCell(selectedSectionKey, k1, item);
            return;
          }
        }
      }
      alert('No 2 consecutive open slots found in this section timetable chart to place this pair period.');
    } else {
      for (const row of selectedTemplate.rows) {
        for (const col of validCols) {
          const k = `${row.id}-${col.id}`;
          if (!occupiedCells[k]) {
            handlePlaceUnfilledCell(selectedSectionKey, k, item);
            return;
          }
        }
      }
      alert('No open slots found in this section timetable chart to place this period.');
    }
  };

  const handleUnpinSlot = (sectionKey: string, cellKey: string) => {
    setPinnedSlots((prev) => {
      const updatedSec = { ...(prev[sectionKey] || {}) };
      delete updatedSec[cellKey];
      return {
        ...prev,
        [sectionKey]: updatedSec,
      };
    });

    setGeneratedSections((prev) =>
      prev.map((sec) => {
        if (sec.sectionKey === sectionKey) {
          const updatedCells = { ...sec.cells };
          delete updatedCells[cellKey];
          return {
            ...sec,
            cells: updatedCells,
          };
        }
        return sec;
      })
    );

    setSlotPinModal(null);
  };

  if (selectedTemplate) {
    const selectedSection = sectionsList.find((s) => s.sectionKey === selectedSectionKey) || null;
    const activeGenerated = generatedSections.find((section) => section.sectionKey === selectedSectionKey) || null;
    const currentSectionPinned = pinnedSlots[selectedSectionKey] || {};
    const currentSectionPinnedCount = Object.keys(currentSectionPinned).length;

    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6 border-b pb-4">
          <button
            onClick={() => setSelectedTemplate(null)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold"
          >
            <ChevronLeft size={20} />
            Back to Templates
          </button>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowGroupModal(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold shadow-xs flex items-center gap-1.5"
            >
              🏢 Group Allocation
            </button>
            <button
              onClick={() => setShowSpecialModal(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold shadow-xs flex items-center gap-1.5"
            >
              ✨ Special Period
            </button>
            <button
              onClick={() => setShowCreditModal(true)}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold shadow-xs flex items-center gap-1.5"
            >
              🎯 Credit Allocations
            </button>
            <button
              onClick={() => setShowVenueModal(true)}
              className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors text-sm font-semibold shadow-xs flex items-center gap-1.5"
            >
              🏛️ Venue Exceptions
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(selectedTemplate, null, 2));
                alert('Template copied to clipboard!');
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold"
            >
              <Copy size={16} />
              Copy Template
            </button>
            <button
              onClick={() => setShowTeachingModal(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold shadow-xs"
            >
              <Users size={16} />
              Teaching Assignment
            </button>
            <button
              onClick={() => {
                setTemplateSaveName(selectedTemplate?.name ? `${selectedTemplate.name} (Generated)` : '');
                setSaveTemplatePromptModal(true);
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-bold text-sm shadow-xs"
            >
              🚀 Generate
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">{selectedTemplate.name}</h2>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                <p>
                  Semester Type:{' '}
                  <span className={`font-semibold ${selectedTemplate.semesterType === 'odd' ? 'text-purple-600' : 'text-orange-600'}`}>
                    {selectedTemplate.semesterType.toUpperCase()}
                  </span>
                </p>
                <p>•</p>
                <p>Created: {new Date(selectedTemplate.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {currentSectionPinnedCount > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-900 shadow-xs">
                <Pin size={14} className="text-amber-700 fill-amber-700" />
                <span>{currentSectionPinnedCount} Pinned Slot{currentSectionPinnedCount > 1 ? 's' : ''} for this Section</span>
                <button
                  onClick={() => {
                    setPinnedSlots((prev) => {
                      const updated = { ...prev };
                      delete updated[selectedSectionKey];
                      return updated;
                    });
                  }}
                  className="ml-2 text-[10px] text-red-600 hover:text-red-800 underline font-semibold"
                >
                  Clear Pins
                </button>
              </div>
            )}
          </div>
        </div>



        {progressMessage && (
          <div className="my-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
            <div className="text-sm font-semibold">{progressMessage}</div>
          </div>
        )}

        {generationMessage && (
          <div className={`my-4 p-3 rounded border font-semibold ${generatedSections.length > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {generationMessage}
          </div>
        )}

        {/* Top Section Navigator Bar (Semesters on Left, Departments & Sections on Right) */}
        {(() => {
          const activeSemesters = selectedTemplate.semesterType === 'odd' ? [1, 3, 5, 7] : [2, 4, 6, 8];
          const departmentsForActiveSem = getDepartmentsForSemester(activeNavSemester);

          return (
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs mb-6 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <span>Sections Navigator</span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">
                      {sectionsList.length} Sections
                    </span>
                  </h3>
                  <span className="text-xs text-gray-300 hidden sm:inline">|</span>
                  <span className="text-xs text-gray-600 font-medium">
                    Template: <span className="font-bold text-indigo-600 uppercase">{selectedTemplate.semesterType} Semesters</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
                    <span>Has Unfilled Periods</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span>All Filled</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Left Column: Active Semesters */}
                <div className="md:col-span-3 space-y-2 border-b md:border-b-0 md:border-r border-gray-200 pb-3 md:pb-0 md:pr-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1 px-1">
                    Active Semesters
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
                    {activeSemesters.map((sem) => {
                      const isSelected = activeNavSemester === sem;
                      const semSections = getSectionsForSemester(sem);
                      const semUnfilled = getSemesterUnfilledCount(sem);
                      const hasUnfilled = semUnfilled > 0;
                      const isAllGen = semSections.length > 0 && semSections.every(s => generatedSections.some(gs => gs.sectionKey === s.sectionKey));

                      return (
                        <button
                          key={sem}
                          type="button"
                          onClick={() => {
                            setActiveNavSemester(sem);
                            if (!semSections.some(s => s.sectionKey === selectedSectionKey) && semSections.length > 0) {
                              setSelectedSectionKey(semSections[0].sectionKey);
                            }
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border font-semibold text-xs transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? hasUnfilled
                                ? 'bg-red-50 border-red-500 text-red-900 shadow-sm ring-2 ring-red-400'
                                : 'bg-blue-600 border-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                              : hasUnfilled
                              ? 'bg-red-50/70 hover:bg-red-100 border-red-300 text-red-900'
                              : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold whitespace-nowrap">Semester {sem}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                              isSelected && !hasUnfilled ? 'bg-blue-500 text-white' : 'bg-gray-200/80 text-gray-700'
                            }`}>
                              {semSections.length}
                            </span>
                          </div>

                          {/* Red status indicator */}
                          {hasUnfilled ? (
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold flex items-center gap-1 shadow-2xs ${
                              isSelected ? 'bg-red-600 text-white animate-pulse' : 'bg-red-500 text-white'
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                              <span>{semUnfilled}</span>
                            </span>
                          ) : isAllGen ? (
                            <span className={`text-[10px] font-bold ${isSelected ? 'text-blue-100' : 'text-green-600'}`}>
                              ✓
                            </span>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-gray-300" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Departments & Sections for Active Semester */}
                <div className="md:col-span-9 space-y-3 max-h-[380px] overflow-y-auto pl-0 md:pl-1 pr-1">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-700">
                      Semester {activeNavSemester} Departments & Sections
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Click any section to view chart
                    </span>
                  </div>

                  {departmentsForActiveSem.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs italic bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      No sections mapped to Semester {activeNavSemester}
                    </div>
                  ) : (
                    departmentsForActiveSem.map(([dept, secs]) => {
                      const deptUnfilledCount = getDeptUnfilledCount(activeNavSemester, dept);
                      const hasDeptUnfilled = deptUnfilledCount > 0;

                      return (
                        <div
                          key={dept}
                          className={`p-3 rounded-xl border transition-all ${
                            hasDeptUnfilled ? 'bg-red-50/40 border-red-300 shadow-2xs' : 'bg-gray-50/60 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-extrabold uppercase tracking-wider ${
                                hasDeptUnfilled ? 'text-red-900' : 'text-gray-700'
                              }`}>
                                {dept}
                              </span>
                              <span className="text-[10px] text-gray-400 font-medium">({secs.length} Sec)</span>
                            </div>

                            {/* Red badge for department */}
                            {hasDeptUnfilled && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1 shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
                                <span>{deptUnfilledCount} Unfilled in {dept}</span>
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {secs.map((sec) => {
                              const isSelected = selectedSectionKey === sec.sectionKey;
                              const isGenerated = generatedSections.some((gs) => gs.sectionKey === sec.sectionKey);
                              const secPinnedCount = Object.keys(pinnedSlots[sec.sectionKey] || {}).length;
                              const secUnfilledCount = getSectionUnfilledCount(sec.sectionKey);
                              const hasSecUnfilled = secUnfilledCount > 0;

                              return (
                                <button
                                  key={sec.sectionKey}
                                  type="button"
                                  onClick={() => setSelectedSectionKey(sec.sectionKey)}
                                  className={`px-2.5 py-2 rounded-lg text-xs font-semibold text-left border flex flex-col justify-between gap-1 transition-all ${
                                    isSelected
                                      ? hasSecUnfilled
                                        ? 'bg-red-600 border-red-700 text-white shadow-md ring-2 ring-red-400'
                                        : 'bg-blue-600 border-blue-600 text-white shadow-md ring-2 ring-blue-400'
                                      : hasSecUnfilled
                                      ? 'bg-red-50 hover:bg-red-100 border-red-400 text-red-900 shadow-2xs'
                                      : isGenerated
                                      ? 'bg-white hover:bg-green-50/50 border-green-200 text-gray-800'
                                      : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-600'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <span className="font-bold text-sm">Sec {sec.name}</span>
                                    {hasSecUnfilled ? (
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold shadow-2xs ${
                                        isSelected ? 'bg-white text-red-700' : 'bg-red-600 text-white'
                                      }`}>
                                        {secUnfilledCount} Unfilled
                                      </span>
                                    ) : isGenerated ? (
                                      <span
                                        className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-green-300' : 'bg-green-500'}`}
                                        title="All slots filled"
                                      />
                                    ) : (
                                      <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" title="Not generated" />
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] w-full mt-0.5">
                                    <span className={isSelected ? 'text-blue-100' : 'text-gray-400'}>{dept}</span>
                                    {secPinnedCount > 0 && (
                                      <span className={`font-bold px-1 rounded ${isSelected ? 'bg-amber-400 text-gray-900' : 'bg-amber-100 text-amber-800'}`}>
                                        📌{secPinnedCount}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Main Timetable Area */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                  <span>Selected Section Timetable</span>
                  <span className="text-gray-400 font-normal">💡 Click any slot cell to change, pin, or delete a course</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mt-0.5">
                  {selectedSection
                    ? `${selectedSection.year === 1 ? '1st Year' : selectedSection.year === 2 ? '2nd Year' : selectedSection.year === 3 ? '3rd Year' : '4th Year'} - ${selectedSection.department} - Section ${selectedSection.name}`
                    : 'No Section Selected'}
                </h3>
              </div>

              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                activeGenerated
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                {activeGenerated ? '● Timetable Generated' : '○ Not Generated Yet'}
              </span>
            </div>

            {activeGenerated && activeGenerated.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  ⚠️ Slot allocation warnings for this section:
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  {activeGenerated.warnings.map((w, idx) => (
                    <li key={idx} className="leading-relaxed">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="border-r border-b border-gray-200 px-4 py-3 text-left font-bold text-gray-900 bg-gray-200 w-[100px]">
                    Day
                  </th>
                  {selectedTemplate.columns.map((col) => (
                    <th
                      key={col.id}
                      className={`border-r border-b border-gray-200 px-4 py-3 text-center font-bold min-w-[150px] ${
                        col.period === 'Break'
                          ? 'bg-red-100 text-red-900'
                          : col.period === 'Lunch'
                          ? 'bg-orange-100 text-orange-900'
                          : 'bg-blue-50 text-gray-900'
                      }`}
                    >
                      <div className="font-semibold">{col.period}</div>
                      <div className="text-[10px] font-normal text-gray-500 mt-0.5">{col.timing}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedTemplate.rows.map((row, rowIndex) => (
                  <tr
                    key={row.id}
                    className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                  >
                    <td className="border-r border-b border-gray-200 px-4 py-3 font-semibold text-gray-900 bg-gray-100 text-center">
                      {row.day}
                    </td>
                    {selectedTemplate.columns.map((col) => {
                      const cellKey = `${row.id}-${col.id}`;
                      const generatedCell = activeGenerated?.cells[cellKey];
                      const isPinned = Boolean(currentSectionPinned[cellKey] || generatedCell?.isPinned);

                      // Skip rendering the 2nd slot of a merged block pair so table columns align seamlessly
                      if (activeGenerated && generatedCell?.isBlockSecondSlot) {
                        return null;
                      }

                      const isMergedBlock = generatedCell && (generatedCell.colSpan || 1) > 1;
                      const cellBgColor = isPinned ? '#FEF3C7' : generatedCell?.bgColor;

                      const isBreakOrLunch = col.period === 'Break' || col.period === 'Lunch';

                      return (
                        <td
                          key={cellKey}
                          colSpan={generatedCell?.colSpan || 1}
                          style={cellBgColor ? { backgroundColor: cellBgColor } : undefined}
                          onDragOver={(e) => {
                            if (!isBreakOrLunch) {
                              e.preventDefault();
                              if (dragOverCellKey !== cellKey) setDragOverCellKey(cellKey);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverCellKey === cellKey) setDragOverCellKey(null);
                          }}
                          onDrop={(e) => {
                            setDragOverCellKey(null);
                            if (isBreakOrLunch || !selectedSection) return;
                            e.preventDefault();
                            try {
                              const rawData = e.dataTransfer.getData('text/plain');
                              if (rawData) {
                                const parsedCell = JSON.parse(rawData);
                                handlePlaceUnfilledCell(selectedSection.sectionKey, cellKey, parsedCell);
                              }
                            } catch (err) {
                              console.error('Failed to parse dropped cell data:', err);
                            }
                          }}
                          onClick={() => {
                            if (isBreakOrLunch) return;
                            if (!selectedSection) return;
                            setSlotPinModal({
                              isOpen: true,
                              rowId: row.id,
                              colId: col.id,
                              day: row.day,
                              period: col.period,
                              timing: col.timing,
                              sectionKey: selectedSection.sectionKey,
                              sectionName: selectedSection.name,
                              sectionId: selectedSection.id,
                              year: selectedSection.year,
                              department: selectedSection.department,
                            });
                            setSlotPinSearch('');
                            setSlotPinFilter('all');
                          }}
                          className={`border-r border-b border-gray-200 px-3 py-2.5 min-w-[150px] transition-all ${
                            dragOverCellKey === cellKey
                              ? 'bg-blue-100 ring-2 ring-blue-500 ring-dashed scale-[1.01]'
                              : isBreakOrLunch
                              ? col.period === 'Break'
                                ? 'bg-red-50 text-center cursor-not-allowed'
                                : 'bg-orange-50 text-center cursor-not-allowed'
                              : isPinned
                              ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 cursor-pointer shadow-xs relative group'
                              : isMergedBlock
                              ? 'text-center shadow-inner hover:bg-blue-50/70 cursor-pointer relative group'
                              : 'text-center hover:bg-blue-50/70 cursor-pointer relative group'
                          }`}
                          title={!isBreakOrLunch ? 'Click to Change, Pin, or Delete slot' : undefined}
                        >
                          {isBreakOrLunch ? (
                            <div className="font-semibold text-gray-500 text-xs uppercase tracking-wider">{col.period}</div>
                          ) : activeGenerated || currentSectionPinned[cellKey] ? (
                            (() => {
                              const displayCell = generatedCell || (currentSectionPinned[cellKey] ? {
                                subject: currentSectionPinned[cellKey].subject,
                                faculty: currentSectionPinned[cellKey].faculty,
                                kind: currentSectionPinned[cellKey].kind,
                                note: currentSectionPinned[cellKey].note,
                                isPinned: true
                              } : null);

                              if (!displayCell) {
                                return (
                                  <div className="text-[11px] text-gray-400 py-1 flex items-center justify-center gap-1">
                                    <span>Open slot</span>
                                    <span className="opacity-0 group-hover:opacity-100 text-blue-500 text-[10px] transition-opacity">📌 Pin</span>
                                  </div>
                                );
                              }

                              return (
                                <div className={`space-y-1 relative ${isMergedBlock ? 'text-center max-w-sm mx-auto' : 'text-left'}`}>
                                  {isPinned && (
                                    <div className="inline-flex items-center gap-1 text-[9px] font-bold uppercase bg-amber-200/90 text-amber-900 px-1.5 py-0.5 rounded-sm shadow-2xs">
                                      <Pin size={10} className="fill-amber-800 text-amber-800" />
                                      <span>Pinned Slot</span>
                                    </div>
                                  )}
                                  <div className="text-xs font-bold text-gray-900 leading-snug whitespace-pre-line">
                                    {displayCell.subject}
                                  </div>
                                  <div className="text-[10px] text-blue-700 font-semibold leading-tight whitespace-pre-line">
                                    {displayCell.faculty}
                                  </div>
                                  <div className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">
                                    {displayCell.note}
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="text-center py-1">
                              <span className="text-xs text-gray-400 group-hover:text-blue-600 font-medium transition-colors">
                                + Click to Pin
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section Unfilled / Deleted Periods Tray (Draggable periods) */}
          {selectedSection && (() => {
            const currentSectionUnfilledItems = getSectionUnfilledItems(selectedSection.sectionKey);
            const totalValidCols = selectedTemplate.columns.filter(c => c.period !== 'Break' && c.period !== 'Lunch');
            const totalPossibleSlots = selectedTemplate.rows.length * totalValidCols.length;
            const filledSlotsCount = activeGenerated ? Object.keys(activeGenerated.cells).length : 0;

            return (
              <div className={`p-4 rounded-xl border transition-all space-y-3 ${
                currentSectionUnfilledItems.length > 0
                  ? 'bg-red-50/40 border-red-300 shadow-2xs'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${currentSectionUnfilledItems.length > 0 ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      <Move size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-2">
                        <span>Unfilled / Deleted Periods for {selectedSection.department} - Section {selectedSection.name} (Drag & Drop to Chart)</span>
                        {currentSectionUnfilledItems.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white shadow-2xs">
                            {currentSectionUnfilledItems.length} Unfilled Period{currentSectionUnfilledItems.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {currentSectionUnfilledItems.length > 0
                          ? 'Drag any unfilled/deleted period card below into an open slot cell on the chart, or click "+ Auto Place".'
                          : 'All required courses, pair blocks, and special allocations are scheduled in the timetable grid.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 shadow-2xs">
                      {filledSlotsCount} / {totalPossibleSlots} Slots Filled
                    </span>
                  </div>
                </div>

                {currentSectionUnfilledItems.length === 0 ? (
                  <div className="p-3 bg-white rounded-lg border border-green-200 flex items-center gap-2 text-green-800 text-xs font-semibold">
                    <Check size={16} className="text-green-600 flex-shrink-0" />
                    <span>
                      {activeGenerated
                        ? `✅ All required periods (credit courses, pair blocks, special periods & group allocations) are fully filled for Section ${selectedSection.name}.`
                        : `Generate or pin courses to schedule periods for Section ${selectedSection.name}.`}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {currentSectionUnfilledItems.map((item) => {
                      const isPair = Boolean(item.isPair || item.colSpan === 2);

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', JSON.stringify({
                              id: item.id,
                              subject: item.subject,
                              faculty: item.faculty,
                              kind: item.kind,
                              isPair: isPair,
                              colSpan: isPair ? 2 : 1,
                              note: item.note,
                              bgColor: item.bgColor,
                              sourceCellKey: item.sourceCellKey,
                            }));
                          }}
                          className={`p-3 bg-white hover:bg-blue-50/70 border rounded-xl shadow-xs transition-all cursor-grab active:cursor-grabbing group relative flex flex-col justify-between ${
                            isPair ? 'border-purple-300 ring-1 ring-purple-200' : 'border-gray-300 hover:border-blue-400'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-1 mb-1.5">
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                isPair ? 'bg-purple-100 text-purple-800 font-extrabold' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {isPair ? '👥 Pair Period (2 Slots)' : '👤 Single Period (1 Slot)'}
                              </span>

                              {item.reason === 'deleted' ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-100 text-red-700">
                                  🗑️ Deleted
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                  ⚠️ No Slot
                                </span>
                              )}
                            </div>

                            <div className="font-bold text-xs text-gray-900 leading-snug line-clamp-2">
                              {item.subject}
                            </div>

                            <div className="text-[11px] font-semibold text-blue-700 mt-1 truncate">
                              {item.faculty || 'Assigned Faculty'}
                            </div>

                            {item.note && (
                              <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                                {item.note}
                              </div>
                            )}
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px]">
                            <span className="flex items-center gap-1 text-gray-400 group-hover:text-blue-600 font-medium">
                              <Move size={10} />
                              <span>Drag to chart</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => autoPlaceUnfilledItem(item)}
                              className="text-blue-600 hover:text-blue-800 font-bold hover:underline"
                              title="Place in first open slot"
                            >
                              + Auto Place
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 shadow-sm">
            <h4 className="font-bold text-blue-900 mb-2 text-sm">Template Grid Stats:</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white p-2.5 rounded border border-blue-100">
                <p className="text-xs text-gray-500 font-medium">Periods</p>
                <p className="text-xl font-bold text-blue-600 mt-0.5">{selectedTemplate.columns.length}</p>
              </div>
              <div className="bg-white p-2.5 rounded border border-blue-100">
                <p className="text-xs text-gray-500 font-medium">Days</p>
                <p className="text-xl font-bold text-blue-600 mt-0.5">{selectedTemplate.rows.length}</p>
              </div>
              <div className="bg-white p-2.5 rounded border border-blue-100">
                <p className="text-xs text-gray-500 font-medium">Total Slots</p>
                <p className="text-xl font-bold text-blue-600 mt-0.5">
                  {selectedTemplate.columns.length * selectedTemplate.rows.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SLOT PINNING MODAL */}
        {slotPinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-white/10 rounded-lg backdrop-blur-xs">
                    <Pin size={18} className="text-amber-300 fill-amber-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">
                      {slotPinModal.department} - Section {slotPinModal.sectionName} - Period Slot Change Pin
                    </h3>
                    <p className="text-xs text-blue-100 mt-0.5">
                      Target Slot: <span className="font-semibold text-white">{slotPinModal.day}</span> • <span className="font-semibold text-amber-200">{slotPinModal.period}</span> ({slotPinModal.timing})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSlotPinModal(null)}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {/* Check if slot is already pinned or has generated cell */}
                {(() => {
                  const cellKey = `${slotPinModal.rowId}-${slotPinModal.colId}`;
                  const currentPin = pinnedSlots[slotPinModal.sectionKey]?.[cellKey];
                  const currentGenCell = activeGenerated?.cells[cellKey];

                  if (!currentPin && !currentGenCell) return null;

                  return (
                    <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Pin size={18} className="text-amber-700 fill-amber-700 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-amber-900">
                            {currentPin ? 'Currently Pinned in this Slot:' : 'Generated Period in this Slot:'}
                          </div>
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {currentPin ? currentPin.subject : currentGenCell?.subject}
                          </div>
                          <div className="text-xs text-blue-700 truncate">
                            {currentPin ? currentPin.faculty : currentGenCell?.faculty}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {currentPin && (
                          <button
                            onClick={() => handleUnpinSlot(slotPinModal.sectionKey, cellKey)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-bold transition-colors shadow-2xs"
                          >
                            Unpin Slot
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteCell(slotPinModal.sectionKey, cellKey)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold transition-colors shadow-2xs flex items-center gap-1"
                        >
                          <Trash2 size={13} />
                          Delete Period
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Filter & Search Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Select Course / Elective Subject to Pin:
                    </label>
                    <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg text-xs font-semibold">
                      <button
                        onClick={() => setSlotPinFilter('all')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${slotPinFilter === 'all' ? 'bg-white text-blue-600 shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setSlotPinFilter('regular')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${slotPinFilter === 'regular' ? 'bg-white text-blue-600 shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        Core Courses
                      </button>
                      <button
                        onClick={() => setSlotPinFilter('elective')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${slotPinFilter === 'elective' ? 'bg-white text-purple-600 shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        Electives
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={slotPinSearch}
                      onChange={(e) => setSlotPinSearch(e.target.value)}
                      placeholder="Search course code, name, or faculty..."
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Subjects List */}
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto divide-y divide-gray-100 bg-white">
                  {loadingCurriculum ? (
                    <div className="p-8 text-center text-gray-500 space-y-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mx-auto" />
                      <p className="text-xs font-semibold">Loading subjects for this section...</p>
                    </div>
                  ) : sectionCurriculumOptions.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 space-y-1">
                      <AlertCircle size={24} className="mx-auto text-gray-300" />
                      <p className="text-sm font-semibold text-gray-600">No subjects found for this section.</p>
                      <p className="text-xs">Ensure subjects and teaching assignments are configured for Section {slotPinModal.sectionName}.</p>
                    </div>
                  ) : (() => {
                    const filtered = sectionCurriculumOptions.filter((s) => {
                      const label = getSubjectLabel(s).toLowerCase();
                      const code = getSubjectCode(s).toLowerCase();
                      const name = getSubjectName(s).toLowerCase();
                      const facultyText = buildFacultyText(s).toLowerCase();
                      const query = slotPinSearch.toLowerCase().trim();
                      const matchesQuery = !query || label.includes(query) || code.includes(query) || name.includes(query) || facultyText.includes(query);

                      const isElective = Boolean(s.is_elective || s.elective_type || String(s.course_type || '').toLowerCase().includes('elective'));
                      if (slotPinFilter === 'regular' && isElective) return false;
                      if (slotPinFilter === 'elective' && !isElective) return false;

                      return matchesQuery;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="p-6 text-center text-gray-400 text-xs">
                          No subjects matching "{slotPinSearch}".
                        </div>
                      );
                    }

                    return filtered.map((row, idx) => {
                      const code = getSubjectCode(row);
                      const name = getSubjectName(row);
                      const credits = Number(row?.c ?? row?.credits ?? 0);
                      const classType = normalizeClassType(row?.class_type, row);
                      const facultyNames = getFacultyNames(row);
                      const isElective = Boolean(row.is_elective || row.elective_type || String(row?.course_type || '').toLowerCase().includes('elective'));

                      return (
                        <div
                          key={idx}
                          onClick={() => handlePinSubjectToSlot(row)}
                          className="p-3 hover:bg-blue-50/80 cursor-pointer transition-colors flex items-center justify-between group"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 text-xs">
                                {code ? `${code} - ${name}` : name}
                              </span>
                              {isElective && (
                                <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                  Elective
                                </span>
                              )}
                              <span className="bg-gray-100 text-gray-600 text-[10px] font-semibold px-1.5 py-0.2 rounded">
                                {classType}
                              </span>
                              {credits > 0 && (
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                  {credits}C
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-1">
                              <span className="font-medium text-gray-700">Faculty:</span>
                              <span className={facultyNames.length > 0 ? 'text-blue-700 font-semibold' : 'text-amber-600 italic font-medium'}>
                                {facultyNames.length > 0 ? facultyNames.join(' / ') : '⚠️ Unassigned'}
                              </span>
                            </div>
                          </div>

                          <button className="opacity-0 group-hover:opacity-100 bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 shadow-2xs transition-all">
                            <Pin size={12} className="fill-white" />
                            Pin to Slot
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
                <button
                  onClick={() => setSlotPinModal(null)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DELETED PERIOD GENERATION CONFIRMATION MODAL */}
        {deleteConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-100 rounded-full text-red-700 flex-shrink-0">
                    <Trash2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Deleted Periods Detected</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      You have <span className="font-bold text-red-700">{deleteConfirmModal.deletedCount}</span> deleted period slot{deleteConfirmModal.deletedCount > 1 ? 's' : ''} across your sections.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1 leading-relaxed">
                  <p>• <strong>Continue with Deleted Periods:</strong> Keeps deleted slots empty for respective sections and auto-balances the remaining required periods in random generation.</p>
                  <p>• <strong>Reset Deleted Slots & Generate:</strong> Restores all deleted slots and fills the entire timetable grid fresh.</p>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => {
                      setDeleteConfirmModal(null);
                      const totalPinnedCount = Object.values(pinnedSlots).reduce(
                        (sum, sec) => sum + Object.keys(sec || {}).length,
                        0
                      );
                      if (totalPinnedCount > 0) {
                        setPinConfirmModal({
                          isOpen: true,
                          pinnedCount: totalPinnedCount,
                        });
                      } else {
                        executeGeneration(pinnedSlots);
                      }
                    }}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={16} />
                    Continue Generation with Deleted Periods Included
                  </button>

                  <button
                    onClick={() => {
                      setDeletedPeriods({});
                      setDeleteConfirmModal(null);
                      const totalPinnedCount = Object.values(pinnedSlots).reduce(
                        (sum, sec) => sum + Object.keys(sec || {}).length,
                        0
                      );
                      if (totalPinnedCount > 0) {
                        setPinConfirmModal({
                          isOpen: true,
                          pinnedCount: totalPinnedCount,
                        });
                      } else {
                        executeGeneration(pinnedSlots);
                      }
                    }}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={16} />
                    Reset Deleted Periods and Generate Fresh
                  </button>

                  <button
                    onClick={() => setDeleteConfirmModal(null)}
                    className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {pinConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-100 rounded-full text-amber-700 flex-shrink-0">
                    <Pin size={24} className="fill-amber-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Generate with Pinned Slots?</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      You currently have <span className="font-bold text-amber-800">{pinConfirmModal.pinnedCount}</span> pinned slot{pinConfirmModal.pinnedCount > 1 ? 's' : ''} locked in the timetable.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1 leading-relaxed">
                  <p>• <strong>Continue with Pinned Slots:</strong> All pinned subjects remain locked in their exact slots, and remaining periods/pairs are auto-balanced randomly.</p>
                  <p>• <strong>Clear Pinned & Generate:</strong> Removes all locked pins and runs a fresh 100% random allocation.</p>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => {
                      const count = pinConfirmModal.pinnedCount;
                      setPinConfirmModal(null);
                      executeGeneration(pinnedSlots);
                    }}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Pin size={16} className="fill-white" />
                    Continue Generation with Pinned Slots ({pinConfirmModal.pinnedCount})
                  </button>

                  <button
                    onClick={() => {
                      setPinnedSlots({});
                      setPinConfirmModal(null);
                      executeGeneration({});
                    }}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={16} />
                    Clear All Pinned Slots and Generate
                  </button>

                  <button
                    onClick={() => setPinConfirmModal(null)}
                    className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <GroupAllocationModal
          isOpen={showGroupModal}
          onClose={() => setShowGroupModal(false)}
        />
        <SpecialPeriodModal
          isOpen={showSpecialModal}
          onClose={() => setShowSpecialModal(false)}
        />
        <CreditBasedAllocationModal
          isOpen={showCreditModal}
          onClose={() => setShowCreditModal(false)}
        />
        <VenueAllocationModal
          isOpen={showVenueModal}
          onClose={() => setShowVenueModal(false)}
        />

        {/* Teaching Assignment Popup Modal */}
        {showTeachingModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <Users size={22} className="text-indigo-600" />
                  <h2 className="text-xl font-bold text-gray-900">Teaching Assignment Configuration</h2>
                </div>
                <button
                  onClick={() => setShowTeachingModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <TeachingAssignSection
                  facultyOptions={facultyOptions}
                  onSectionSnapshot={handleSectionSnapshot}
                />
              </div>
              <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-3 flex justify-end">
                <button
                  onClick={() => setShowTeachingModal(false)}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-semibold text-sm transition-colors shadow-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Template Prompt Modal before Generation */}
        {saveTemplatePromptModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100 space-y-4">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-lg">
                  💾
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Save Generated Timetable</h3>
                  <p className="text-xs text-gray-500">Provide a name to save this timetable configuration</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Template Save Name
                </label>
                <input
                  type="text"
                  value={templateSaveName}
                  onChange={(e) => setTemplateSaveName(e.target.value)}
                  placeholder="e.g. EVEN Sem 2026 - Final Draft"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSaveTemplatePromptModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setSaveTemplatePromptModal(false);
                    const totalDeletedCount = Object.values(deletedPeriods).reduce(
                      (sum, sec) => sum + (sec || []).length,
                      0
                    );
                    if (totalDeletedCount > 0) {
                      setDeleteConfirmModal({
                        isOpen: true,
                        deletedCount: totalDeletedCount,
                      });
                      return;
                    }
                    const totalPinnedCount = Object.values(pinnedSlots).reduce(
                      (sum, sec) => sum + Object.keys(sec || {}).length,
                      0
                    );
                    if (totalPinnedCount > 0) {
                      setPinConfirmModal({
                        isOpen: true,
                        pinnedCount: totalPinnedCount,
                      });
                    } else {
                      executeGeneration(pinnedSlots);
                    }
                  }}
                  className="px-5 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors shadow-xs"
                >
                  Save & Generate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full-Screen Non-Clickable Loading Overlay with Backdrop Blur */}
        {isGenerating && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center pointer-events-auto select-none">
            <div className="bg-white/95 p-8 rounded-3xl shadow-2xl border border-white/40 max-w-sm w-full text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-green-200 animate-ping opacity-25" />
                <div className="w-16 h-16 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-extrabold text-gray-900">Generating Timetable...</h3>
                <p className="text-xs font-semibold text-green-700 animate-pulse">
                  {progressMessage || 'Applying allocations, exceptions, and faculty constraints...'}
                </p>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-green-600 h-full w-full animate-pulse" />
              </div>
              <p className="text-[11px] text-gray-400">Please do not refresh or close the page.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (initialView === 'saved') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Saved Templates & Drafts</h2>
            <p className="text-xs text-gray-500 mt-1">Access auto-saved drafts and generated timetable configurations</p>
          </div>
        </div>

        {savedDrafts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-12 text-center">
            <p className="text-gray-500 font-semibold text-base">No saved timetable drafts yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              Generated timetables will automatically be saved here as drafts.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedDrafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 hover:shadow-md transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base text-gray-900">{draft.title}</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Saved: {new Date(draft.savedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded-md uppercase">
                    Draft
                  </span>
                </div>

                <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <p>• Template: <strong className="text-gray-900">{draft.template.name}</strong></p>
                  <p>• Generated Sections: <strong className="text-gray-900">{draft.generatedSections.length}</strong></p>
                  <p>• Pinned Slots: <strong className="text-amber-700">{Object.values(draft.pinnedSlots || {}).reduce((s, sec) => s + Object.keys(sec).length, 0)}</strong></p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      setSelectedTemplate(draft.template);
                      setGeneratedSections(draft.generatedSections || []);
                      setPinnedSlots(draft.pinnedSlots || {});
                      setDeletedPeriods(draft.deletedPeriods || {});
                    }}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-xs font-bold transition-colors shadow-2xs"
                  >
                    Open Draft & View Timetable
                  </button>
                  <button
                    onClick={() => {
                      const updated = savedDrafts.filter((d) => d.id !== draft.id);
                      setSavedDrafts(updated);
                      localStorage.setItem('iqac_saved_timetable_drafts', JSON.stringify(updated));
                    }}
                    className="px-2.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition-colors border border-red-200"
                    title="Delete Draft"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              filterType === 'all'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All Templates
          </button>
          <button
            onClick={() => setFilterType('odd')}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              filterType === 'odd'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Odd Semester ({oddTemplates.length})
          </button>
          <button
            onClick={() => setFilterType('even')}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              filterType === 'even'
                ? 'bg-orange-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Even Semester ({evenTemplates.length})
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowGroupModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2"
          >
            🏢 Group Allocation
          </button>
          <button
            onClick={() => setShowSpecialModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2"
          >
            ✨ Special Period
          </button>
          <button
            onClick={() => setShowCreditModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2"
          >
            🎯 Credit Allocations
          </button>
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">
            No {filterType === 'all' ? '' : `${filterType} semester `} templates created yet.
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Go to "Odd/Even Sem Timetable" to create templates first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => setSelectedTemplate(template)}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer hover:border-2 hover:border-blue-400"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg text-gray-900">{template.name}</h3>
                <span
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    template.semesterType === 'odd'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}
                >
                  {template.semesterType.toUpperCase()}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Periods:</span>
                  <span className="font-semibold text-gray-900">{template.columns.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Days:</span>
                  <span className="font-semibold text-gray-900">{template.rows.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="text-sm text-gray-500">
                    {new Date(template.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm">
                <p className="font-semibold text-gray-700 mb-2">Period Timings:</p>
                <div className="space-y-1">
                  {template.columns.slice(0, 3).map((col) => (
                    <div key={col.id} className="text-gray-600 text-xs">
                      <span className="font-medium">{col.period}:</span> {col.timing}
                    </div>
                  ))}
                  {template.columns.length > 3 && (
                    <div className="text-gray-500 text-xs italic">
                      +{template.columns.length - 3} more periods...
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTemplate(template);
                }}
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors font-semibold"
              >
                View & Fill Timetable
              </button>
            </div>
          ))}
        </div>
      )}

      <GroupAllocationModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
      />

      <SpecialPeriodModal
        isOpen={showSpecialModal}
        onClose={() => setShowSpecialModal(false)}
      />

      <CreditBasedAllocationModal
        isOpen={showCreditModal}
        onClose={() => setShowCreditModal(false)}
      />

      <VenueAllocationModal
        isOpen={showVenueModal}
        onClose={() => setShowVenueModal(false)}
      />

      {/* Teaching Assignment Popup Modal */}
      {showTeachingModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Users size={22} className="text-indigo-600" />
                <h2 className="text-xl font-bold text-gray-900">Teaching Assignment Configuration</h2>
              </div>
              <button
                onClick={() => setShowTeachingModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <TeachingAssignSection
                facultyOptions={facultyOptions}
                onSectionSnapshot={handleSectionSnapshot}
              />
            </div>
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-3 flex justify-end">
              <button
                onClick={() => setShowTeachingModal(false)}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-semibold text-sm transition-colors shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Template Prompt Modal before Generation */}
      {saveTemplatePromptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100 space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-lg">
                💾
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Save Generated Timetable</h3>
                <p className="text-xs text-gray-500">Provide a name to save this timetable configuration</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Template Save Name
              </label>
              <input
                type="text"
                value={templateSaveName}
                onChange={(e) => setTemplateSaveName(e.target.value)}
                placeholder="e.g. EVEN Sem 2026 - Final Draft"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSaveTemplatePromptModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSaveTemplatePromptModal(false);
                  const totalPinnedCount = Object.values(pinnedSlots).reduce(
                    (sum, sec) => sum + Object.keys(sec || {}).length,
                    0
                  );
                  if (totalPinnedCount > 0) {
                    setPinConfirmModal({
                      isOpen: true,
                      pinnedCount: totalPinnedCount,
                    });
                  } else {
                    executeGeneration(pinnedSlots);
                  }
                }}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors shadow-xs"
              >
                Save & Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Non-Clickable Loading Overlay with Backdrop Blur */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center pointer-events-auto select-none">
          <div className="bg-white/95 p-8 rounded-3xl shadow-2xl border border-white/40 max-w-sm w-full text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-green-200 animate-ping opacity-25" />
              <div className="w-16 h-16 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-gray-900">Generating Timetable...</h3>
              <p className="text-xs font-semibold text-green-700 animate-pulse">
                {progressMessage || 'Applying allocations, exceptions, and faculty constraints...'}
              </p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-green-600 h-full w-full animate-pulse" />
            </div>
            <p className="text-[11px] text-gray-400">Please do not refresh or close the page.</p>
          </div>
        </div>
      )}
    </div>
  );
}
