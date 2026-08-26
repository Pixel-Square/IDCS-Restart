import React, { useState, useEffect } from 'react';
import { ChevronLeft, Copy, ChevronDown } from 'lucide-react';
import { SearchableDropdown } from '../../../components/ui/SearchableDropdown';
import fetchWithAuth from '../../../services/fetchAuth';
import { fetchDepartmentStaff } from '../../../services/staff';
import TeachingAssignSection from './TeachingAssignSection';
import GroupAllocationModal, { GroupAllocation } from './GroupAllocationModal';
import VenueAllocationModal from './VenueAllocationModal';

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
  department?: string;
};

type GeneratedCell = {
  subject: string;
  faculty: string;
  kind: 'theory' | 'lab';
  note?: string;
};

type GeneratedSectionTimetable = {
  sectionKey: string;
  sectionName: string;
  year: number | null;
  department: string;
  cells: Record<string, GeneratedCell>;
  warnings: string[];
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

import CreditBasedAllocationModal, { CreditAllocationMap, ClassTypeExceptionRule } from './CreditBasedAllocationModal';

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

  // 3. Fallback for 0-credit subjects: use (L + T + P + S) or total hours or 1 period
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
  classTypeExceptions: ClassTypeExceptionRule[] = []
): GeneratedSectionTimetable => {
  const cells: Record<string, GeneratedCell> = {};
  const warnings: string[] = [];
  const slots = getTemplateSlots(template);
  const occupied = new Set<string>();
  const runSeed = generationSeed + sectionIndex + 1;
  const rng = createSeededRng(runSeed);
  const consecutiveTwoBlocks = getConsecutiveBlocksForTemplate(template, 2);

  // Find Group Allocations that match this section / mixed section
  const matchingGroups = groupAllocations.filter((g) => {
    const secIdStr = String(snapshot.sectionId);
    const keyMatch = g.selectedSectionKeys.some((k) => k.includes(secIdStr) || k.includes(snapshot.sectionKey)) ||
                     g.selectedMixedSectionKeys.some((k) => k.includes(secIdStr) || k.includes(snapshot.sectionKey));
    if (keyMatch) return true;

    const yearMatch = !snapshot.year || g.selectedYears.includes(snapshot.year);
    const deptMatch = !snapshot.department || g.selectedDepartments.length === 0 ||
                      g.selectedDepartments.some((d) => (snapshot.department || '').toUpperCase().includes(d.toUpperCase()));
    return yearMatch && deptMatch && (g.selectedSectionKeys.length === 0 && g.selectedMixedSectionKeys.length === 0);
  });

  // Extract all Exception Courses from matching groups
  const allExceptionCourses = matchingGroups.flatMap((g) => g.exceptionCourses || []);

  // Pre-assign Group Allocations (Pair Periods & Individual Periods) consistently across sections & randomized per generation
  matchingGroups.forEach((g, gIdx) => {
    const groupSeed = hashString(`${generationSeed}-${g.id || g.groupName}-${gIdx}`);
    const groupRng = createSeededRng(groupSeed);

    const pairedCount = g.pairedPeriods !== undefined ? g.pairedPeriods : (g.blockPeriodEnabled ? (g.blockPeriodCount || 1) : 0);
    const individualCount = g.individualPeriods !== undefined ? g.individualPeriods : (pairedCount === 0 ? 1 : 0);

    // 1. Schedule Paired Periods (2-consecutive period block pairs)
    if (pairedCount > 0) {
      const available2Blocks = getConsecutiveBlocksForTemplate(template, 2);
      const shuffled2Blocks = shuffleWithRng(available2Blocks, groupRng);

      for (let p = 1; p <= pairedCount; p++) {
        const selectedBlock = shuffled2Blocks.find((b) => b.keys.every((k) => !occupied.has(k))) || shuffled2Blocks[0];
        if (selectedBlock) {
          selectedBlock.keys.forEach((key) => {
            occupied.add(key);
            cells[key] = {
              subject: g.groupName,
              faculty: 'Group Allocation',
              kind: 'theory',
              note: `Group: ${g.groupName} (Pair Period ${p})`,
            };
          });
        }
      }
    }

    // 2. Schedule Individual Single Periods
    if (individualCount > 0) {
      const available1Slots = shuffleWithRng(slots, groupRng);

      for (let i = 1; i <= individualCount; i++) {
        const selectedSlot = available1Slots.find((s) => !occupied.has(s.key)) || available1Slots[0];
        if (selectedSlot && !occupied.has(selectedSlot.key)) {
          occupied.add(selectedSlot.key);
          cells[selectedSlot.key] = {
            subject: g.groupName,
            faculty: 'Group Allocation',
            kind: 'theory',
            note: `Group: ${g.groupName} (Single Period ${i})`,
          };
        }
      }
    }
  });

  // Filter out Exception Courses and subjects with no staff assigned for this section
  const rawSubjects = [...(snapshot.subjectStaff || [])];
  const filteredSubjects = rawSubjects.filter((subject) => {
    if (!getSubjectLabel(subject)) return false;

    // Must have assigned staff for this section
    const assigned = Array.isArray(subject?.assigned_staff) ? subject.assigned_staff : [];
    const hasStaff = assigned.length > 0 || Boolean(subject?.staff);
    if (!hasStaff) return false;

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

  // Schedule ALL subjects based on Class Type Exceptions or Credit-Based Allocation
  const randomTieBreaker = new Map<any, number>();
  filteredSubjects.forEach((row) => {
    randomTieBreaker.set(row, rng());
  });

  const hasExceptionRule = (row: any) => {
    const type = normalizeClassType(row?.class_type, row).toUpperCase();
    return classTypeExceptions.some((rule) => (rule.classType || '').toUpperCase() === type);
  };

  const sortedSubjects = [...filteredSubjects].sort((a, b) => {
    const aExcept = hasExceptionRule(a) ? 0 : 1;
    const bExcept = hasExceptionRule(b) ? 0 : 1;
    if (aExcept !== bExcept) return aExcept - bExcept;

    const aCore = a?.is_dept_core ? 0 : 1;
    const bCore = b?.is_dept_core ? 0 : 1;
    if (aCore !== bCore) return aCore - bCore;
    return (randomTieBreaker.get(a) || 0) - (randomTieBreaker.get(b) || 0);
  });

  const subjectDayUsage: Record<string, Set<string>> = {};
  const getSubjectKey = (subject: any) => getSubjectCode(subject) || getSubjectName(subject) || getSubjectLabel(subject);

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

    for (const slot of slotOrder) {
      if (!canUseSlot(slot)) continue;
      occupied.add(slot.key);
      facultyIds.forEach((facultyId) => {
        if (!facultyId) return;
        if (!globalFacultyUsage[facultyId]) {
          globalFacultyUsage[facultyId] = new Set();
        }
        globalFacultyUsage[facultyId].add(slot.key);
      });
      if (!subjectDayUsage[subjectKey]) {
        subjectDayUsage[subjectKey] = new Set();
      }
      subjectDayUsage[subjectKey].add(slot.day);
      return { slot, conflict: false };
    }

    // Fallback if no slot on un-used day
    for (const slot of slotOrder) {
      if (occupied.has(slot.key)) continue;
      occupied.add(slot.key);
      facultyIds.forEach((facultyId) => {
        if (!facultyId) return;
        if (!globalFacultyUsage[facultyId]) {
          globalFacultyUsage[facultyId] = new Set();
        }
        globalFacultyUsage[facultyId].add(slot.key);
      });
      if (!subjectDayUsage[subjectKey]) {
        subjectDayUsage[subjectKey] = new Set();
      }
      subjectDayUsage[subjectKey].add(slot.day);
      return { slot, conflict: true };
    }

    return null;
  };

  const reserveBlockPair = (facultyIds: string[], subjectKey: string) => {
    const blockOrder = shuffleWithRng(consecutiveTwoBlocks, rng);

    const canUseBlock = (block: { keys: string[]; day: string }) => {
      if (block.keys.some((k) => occupied.has(k))) return false;
      if (subjectDayUsage[subjectKey]?.has(block.day)) return false;
      const facultyConflict = facultyIds.some((facultyId) => {
        if (!facultyId) return false;
        return block.keys.some((key) => globalFacultyUsage[facultyId]?.has(key));
      });
      return !facultyConflict;
    };

    for (const block of blockOrder) {
      if (!canUseBlock(block)) continue;
      block.keys.forEach((key) => occupied.add(key));
      facultyIds.forEach((facultyId) => {
        if (!facultyId) return;
        if (!globalFacultyUsage[facultyId]) {
          globalFacultyUsage[facultyId] = new Set();
        }
        block.keys.forEach((key) => globalFacultyUsage[facultyId].add(key));
      });
      if (!subjectDayUsage[subjectKey]) {
        subjectDayUsage[subjectKey] = new Set();
      }
      subjectDayUsage[subjectKey].add(block.day);
      return { block, conflict: false };
    }

    for (const block of blockOrder) {
      if (block.keys.some((k) => occupied.has(k))) continue;
      const facultyConflict = facultyIds.some((facultyId) => {
        if (!facultyId) return false;
        return block.keys.some((key) => globalFacultyUsage[facultyId]?.has(key));
      });
      block.keys.forEach((key) => occupied.add(key));
      facultyIds.forEach((facultyId) => {
        if (!facultyId) return;
        if (!globalFacultyUsage[facultyId]) {
          globalFacultyUsage[facultyId] = new Set();
        }
        block.keys.forEach((key) => globalFacultyUsage[facultyId].add(key));
      });
      if (!subjectDayUsage[subjectKey]) {
        subjectDayUsage[subjectKey] = new Set();
      }
      subjectDayUsage[subjectKey].add(block.day);
      return { block, conflict: facultyConflict };
    }

    return null;
  };

  for (const subject of sortedSubjects) {
    const facultyNames = getFacultyNames(subject);
    const facultyIds = Array.isArray(subject?.assigned_staff)
      ? subject.assigned_staff.map((staff: any) => getFacultyKey(staff)).filter(Boolean)
      : [];

    if (facultyNames.length === 0) {
      continue;
    }

    const subjectKey = getSubjectKey(subject);
    const sClassType = normalizeClassType(subject?.class_type, subject).toUpperCase();

    // Check if a Class Type Exception rule exists for this subject's class_type
    const exceptionRule = classTypeExceptions.find(
      (rule) => (rule.classType || '').toUpperCase() === sClassType
    );

    if (exceptionRule) {
      const individualCount = Math.max(0, Number(exceptionRule.individualPeriods || 0));
      const pairedCount = Math.max(0, Number(exceptionRule.pairedPeriods || 0));

      // 1. Schedule Paired Block Periods (2 consecutive slots per pair)
      for (let p = 1; p <= pairedCount; p++) {
        const blockResult = reserveBlockPair(facultyIds, subjectKey);
        if (!blockResult) {
          warnings.push(`No 2-period block available in the template for ${getSubjectLabel(subject)} (Paired Block ${p}).`);
          continue;
        }

        const { block, conflict } = blockResult;
        if (conflict) {
          warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (Paired Block ${p}) on ${block.day}.`);
        }

        block.keys.forEach((key) => {
          cells[key] = {
            subject: buildCellText(subject, 'theory', `Block Pair ${p}`),
            faculty: buildFacultyText(subject),
            kind: 'theory',
            note: (conflict ? '⚠️ Conflict! ' : '') + `Exception (${sClassType}) - Block Pair`,
          };
        });
      }

      // 2. Schedule Individual Single Periods
      for (let i = 1; i <= individualCount; i++) {
        const reserveResult = reserveSlot(facultyIds, subjectKey);
        if (!reserveResult) {
          warnings.push(`No single slot available in the template for ${getSubjectLabel(subject)} (Individual ${i}).`);
          continue;
        }

        const { slot, conflict } = reserveResult;
        if (conflict) {
          warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (Individual ${i}) at ${slot.day} ${slot.period}.`);
        }

        cells[slot.key] = {
          subject: buildCellText(subject, 'theory', `Single ${i}`),
          faculty: buildFacultyText(subject),
          kind: 'theory',
          note: (conflict ? '⚠️ Conflict! ' : '') + `Exception (${sClassType}) - Single Period`,
        };
      }
    } else {
      // Standard Credit-Based Allocation path
      const slotPlan = getRequiredSlotPlan(subject, creditAllocations);

      for (const entry of slotPlan) {
        const reserveResult = reserveSlot(facultyIds, subjectKey);
        if (!reserveResult) {
          warnings.push(`No unoccupied slot available in the template for ${getSubjectLabel(subject)} (${entry.label}).`);
          continue;
        }

        const { slot, conflict } = reserveResult;
        if (conflict) {
          warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (${entry.label}) at ${slot.day} ${slot.period}. Faculty may be double-booked.`);
        }

        const credits = Number(subject?.c ?? subject?.credits ?? 0);

        cells[slot.key] = {
          subject: buildCellText(subject, entry.kind, entry.label),
          faculty: buildFacultyText(subject),
          kind: 'theory',
          note: (conflict ? '⚠️ Conflict! ' : '') + `Credit (${credits}C) Allocation`,
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
}

export default function TimetableGenerator({ templates }: TimetableGeneratorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<SemesterTemplate | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'odd' | 'even'>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [facultyOptions, setFacultyOptions] = useState<{label: string, value: string}[]>([]);
  const [showTeachingAssign, setShowTeachingAssign] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [sectionSnapshots, setSectionSnapshots] = useState<Record<string, SectionSnapshot>>({});
  const [generatedSections, setGeneratedSections] = useState<GeneratedSectionTimetable[]>([]);
  
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
        grouped[y][d].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
      });
    });

    return grouped;
  };

  const handleGenerateNow = async () => {
    if (!selectedTemplate) {
      setGenerationMessage('Select a timetable template first.');
      return;
    }

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

            fetchedSnapshots.push({
              sectionKey: `${yearNum}-${sectionDept}-${sectionName}`,
              sectionId,
              sectionName: `${sectionDept}-${sectionName}`,
              subjects: subjectStaff,
              assignments: [],
              advisors: [],
              subjectStaff,
              year: yearNum,
              department: sectionDept,
            });
          } catch (err) {
            console.error('Failed to load section snapshot:', err);
          }
        }

        setProgressMessage('Generating timetables...');
        // Start from fresh backend snapshots and apply only current-session manual overrides.
        const snapshotMap = new Map<string, SectionSnapshot>();
        fetchedSnapshots.forEach((snapshot) => snapshotMap.set(snapshot.sectionKey, snapshot));

        Object.values(sectionSnapshots).forEach((snapshot) => {
          const fromFetch = snapshotMap.get(snapshot.sectionKey);
          const foundSection = sectionsList.find((s) => s.sectionKey === snapshot.sectionKey);
          snapshotMap.set(snapshot.sectionKey, {
            ...snapshot,
            year: snapshot.year || fromFetch?.year || foundSection?.year || null,
            department: snapshot.department || fromFetch?.department || foundSection?.department || 'SECTION',
          });
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

        // Load saved Group Allocations and Credit Allocations
        let groupAllocations: GroupAllocation[] = [];
        try {
          const storedAllocations = localStorage.getItem('iqac_timetable_group_allocations');
          if (storedAllocations) {
            const parsed = JSON.parse(storedAllocations);
            if (Array.isArray(parsed)) groupAllocations = parsed;
          }
        } catch (e) {
          console.error('Failed to load group allocations during generation:', e);
        }

        let creditAllocations: Record<number, number> = {};
        try {
          const storedCredits = localStorage.getItem('iqac_timetable_credit_allocations');
          if (storedCredits) {
            const parsed = JSON.parse(storedCredits);
            if (typeof parsed === 'object' && parsed !== null) creditAllocations = parsed;
          }
        } catch (e) {
          console.error('Failed to load credit allocations during generation:', e);
        }

        let classTypeExceptions: ClassTypeExceptionRule[] = [];
        try {
          const storedExceptions = localStorage.getItem('iqac_timetable_classtype_exceptions');
          if (storedExceptions) {
            const parsed = JSON.parse(storedExceptions);
            if (Array.isArray(parsed)) classTypeExceptions = parsed;
          }
        } catch (e) {
          console.error('Failed to load class type exceptions during generation:', e);
        }

        const results = workingSnapshots.map((snapshot, index) =>
          buildGeneratedSection(
            snapshot,
            selectedTemplate,
            globalFacultyUsage,
            generationSeed,
            index,
            groupAllocations,
            creditAllocations,
            classTypeExceptions
          )
        );

        setGeneratedSections(results);
        setIsGenerating(false);
        setProgressMessage('');
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

  if (selectedTemplate) {
    const selectedSection = sectionsList.find((s) => s.sectionKey === selectedSectionKey) || null;
    const activeGenerated = generatedSections.find((section) => section.sectionKey === selectedSectionKey) || null;

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
              onClick={() => {
                setSectionSnapshots({});
                setShowTeachingAssign(false);
                setIsGenerating(true);
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-bold text-sm shadow-xs"
            >
              🎯 Generate Timetable
            </button>
          </div>
        </div>

        <div className="mb-6">
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

        {isGenerating && (
          <div className="mt-6 p-6 bg-white rounded-lg shadow-md border-t-4 border-green-500 mb-6">
            <h3 className="text-xl font-bold mb-4 text-gray-800">Generate Options</h3>
            
            <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SearchableDropdown
                  label="Department"
                  placeholder="Select Department"
                  options={DEPARTMENT_OPTIONS}
                  value={selectedDepartment}
                  onChange={setSelectedDepartment}
                />
                <SearchableDropdown
                  label="Course"
                  placeholder="Select Course"
                  options={COURSE_OPTIONS}
                  value={selectedCourse}
                  onChange={setSelectedCourse}
                />
                <SearchableDropdown
                  label="Faculty Name"
                  placeholder="Select Faculty"
                  options={facultyOptions}
                  value={selectedFaculty}
                  onChange={setSelectedFaculty}
                />
              </div>
            </div>

            <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 mb-6 flex flex-wrap gap-4 items-center">
              <button 
                onClick={() => setShowTeachingAssign(!showTeachingAssign)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                {showTeachingAssign ? 'Hide Teaching Assign' : 'Teaching Assign'}
              </button>

              <button 
                onClick={() => setShowGroupModal(true)}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-semibold shadow-sm flex items-center gap-2"
              >
                🏢 Group Allocation
              </button>

              <button 
                onClick={() => setShowCreditModal(true)}
                className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-semibold shadow-sm flex items-center gap-2"
              >
                🎯 Credit Allocations
              </button>

              <button
                onClick={() => setShowVenueModal(true)}
                className="bg-sky-600 text-white px-6 py-2 rounded-lg hover:bg-sky-700 transition-colors font-semibold shadow-sm flex items-center gap-2"
              >
                🏛️ Venue Exceptions
              </button>

              {showTeachingAssign && (
                <div className="w-full mt-4">
                  <TeachingAssignSection facultyOptions={facultyOptions} onSectionSnapshot={handleSectionSnapshot} />
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button 
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 font-semibold transition-colors"
                onClick={() => {
                  setShowTeachingAssign(false);
                  setSectionSnapshots({});
                  setIsGenerating(false);
                }}
              >
                Cancel
              </button>
              <button 
                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 font-semibold transition-colors flex items-center gap-2"
                onClick={handleGenerateNow}
              >
                Generate Now
              </button>
            </div>
          </div>
        )}

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

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3 text-base flex items-center justify-between border-b border-gray-200 pb-2">
                <span>Sections Navigator</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">
                  {sectionsList.length} Sections
                </span>
              </h3>
              
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {[1, 2, 3, 4].map((year) => {
                  const yearGrouped = getGroupedSections()[year] || {};
                  const hasSections = Object.values(yearGrouped).some((arr) => arr.length > 0);
                  const isExpanded = expandedYears[year];

                  return (
                    <div key={year} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <button
                        onClick={() => setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }))}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 text-left font-semibold text-xs text-gray-700 transition-colors"
                      >
                        <span>{year === 1 ? '1st Year' : year === 2 ? '2nd Year' : year === 3 ? '3rd Year' : '4th Year'}</span>
                        <ChevronDown
                          size={14}
                          className={`transform transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                        />
                      </button>

                      {isExpanded && (
                        <div className="p-2 bg-white space-y-3">
                          {!hasSections ? (
                            <p className="text-[10px] text-gray-400 italic p-1">No sections</p>
                          ) : (
                            Object.entries(yearGrouped).map(([dept, secs]) => {
                              if (secs.length === 0) return null;
                              return (
                                <div key={dept} className="space-y-1">
                                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 border-b border-gray-100 pb-0.5">
                                    {dept}
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5 p-1">
                                    {secs.map((sec) => {
                                      const isSelected = selectedSectionKey === sec.sectionKey;
                                      const isGenerated = generatedSections.some((gs) => gs.sectionKey === sec.sectionKey);
                                      return (
                                        <button
                                          key={sec.sectionKey}
                                          onClick={() => setSelectedSectionKey(sec.sectionKey)}
                                          className={`px-2 py-1.5 rounded text-[11px] font-semibold text-left border flex items-center justify-between transition-all ${
                                            isSelected
                                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                              : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'
                                          }`}
                                        >
                                          <span className="truncate">{sec.name}</span>
                                          <span
                                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                              isGenerated
                                                ? isSelected ? 'bg-white' : 'bg-green-500'
                                                : 'bg-gray-300'
                                            }`}
                                            title={isGenerated ? 'Generated' : 'Not Generated'}
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                    Selected Section Timetable
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
                      {selectedTemplate.columns.map((col) => (
                        <td
                          key={`${row.id}-${col.id}`}
                          className={`border-r border-b border-gray-200 px-4 py-3 text-center min-w-[150px] ${
                            col.period === 'Break'
                              ? 'bg-red-50'
                              : col.period === 'Lunch'
                              ? 'bg-orange-50'
                              : ''
                          }`}
                        >
                          {col.period === 'Break' || col.period === 'Lunch' ? (
                            <div className="font-semibold text-gray-500 text-xs uppercase tracking-wider">{col.period}</div>
                          ) : activeGenerated ? (
                            (() => {
                              const generatedCell = activeGenerated.cells[`${row.id}-${col.id}`];
                              if (!generatedCell) {
                                return <div className="text-[11px] text-gray-400">Open slot</div>;
                              }

                              return (
                                <div className="space-y-1 text-left">
                                  <div className="text-xs font-bold text-gray-900 leading-snug whitespace-pre-line">
                                    {generatedCell.subject}
                                  </div>
                                  <div className="text-[10px] text-blue-700 font-semibold leading-tight whitespace-pre-line">
                                    {generatedCell.faculty}
                                  </div>
                                  <div className="text-[9px] uppercase tracking-wider text-gray-400 font-medium">
                                    {generatedCell.note}
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <input
                              type="text"
                              disabled
                              placeholder="Not generated"
                              className="w-full px-2 py-1 bg-gray-50 border border-gray-100 rounded text-center text-xs text-gray-400 cursor-not-allowed"
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
        </div>
        <GroupAllocationModal
          isOpen={showGroupModal}
          onClose={() => setShowGroupModal(false)}
        />
        <CreditBasedAllocationModal
          isOpen={showCreditModal}
          onClose={() => setShowCreditModal(false)}
        />
        <VenueAllocationModal
          isOpen={showVenueModal}
          onClose={() => setShowVenueModal(false)}
        />
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

      <CreditBasedAllocationModal
        isOpen={showCreditModal}
        onClose={() => setShowCreditModal(false)}
      />

      <VenueAllocationModal
        isOpen={showVenueModal}
        onClose={() => setShowVenueModal(false)}
      />
    </div>
  );
}
