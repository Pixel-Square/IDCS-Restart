import React, { useState, useEffect } from 'react';
import { ChevronLeft, Copy, ChevronDown } from 'lucide-react';
import { SearchableDropdown } from '../../../components/ui/SearchableDropdown';
import fetchWithAuth from '../../../services/fetchAuth';
import { fetchDepartmentStaff } from '../../../services/staff';
import TeachingAssignSection from './TeachingAssignSection';

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
const normalizeClassType = (value: any) => normalizeText(value).toUpperCase();

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

const getSubjectLabel = (row: any) => {
  const code = getSubjectCode(row);
  const name = getSubjectName(row);
  if (code && name) return `${code} - ${name}`;
  return code || name || 'Unnamed Subject';
};

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

const getRequiredSlotPlan = (row: any) => {
  const classType = normalizeClassType(row?.class_type);
  const credits = Number(row?.c ?? row?.credits ?? 0) || 0;
  
  // Weekly hours components
  const l = Number(row?.l ?? 0);
  const t = Number(row?.t ?? 0);
  const p = Number(row?.p ?? 0);
  const s = Number(row?.s ?? 0);
  
  // Detect if effective_class_hours or total_hours is semester total (> 10) or weekly (<= 10)
  const rawHours = Number(row?.effective_class_hours ?? row?.total_hours ?? 0);
  const weeklyHoursFallback = (rawHours > 0 && rawHours <= 10) ? rawHours : 0;

  if (classType === 'TCPL' || classType === 'TCPR') {
    return [
      { kind: 'theory' as const, label: 'Theory 1' },
      { kind: 'theory' as const, label: 'Theory 2' },
      { kind: 'theory' as const, label: 'Theory 3' },
      { kind: 'lab' as const, label: 'Lab 1' },
      { kind: 'lab' as const, label: 'Lab 2' },
    ];
  }

  if (classType === 'LAB' || classType === 'PRACTICAL' || classType === 'PURE_LAB') {
    // For lab, use p (practical hours per week) if available, else fallback
    const weeklyLabHours = p || weeklyHoursFallback || credits || 2;
    const labSlots = Math.max(1, Math.ceil(weeklyLabHours / 2));
    return Array.from({ length: labSlots }, (_, index) => ({ kind: 'lab' as const, label: `Lab ${index + 1}` }));
  }

  // For theory:
  const weeklyTheoryHours = (l + t) || weeklyHoursFallback || credits || 3;
  const theorySlots = Math.max(1, weeklyTheoryHours);
  return Array.from({ length: theorySlots }, (_, index) => ({ kind: 'theory' as const, label: `Theory ${index + 1}` }));
};

const buildCellText = (row: any, slotKind: 'theory' | 'lab', label: string) => {
  const subject = getSubjectLabel(row);
  if (slotKind === 'lab') {
    const tag = normalizeClassType(row?.class_type) === 'TCPL' || normalizeClassType(row?.class_type) === 'TCPR'
      ? `${subject} ${label}`
      : subject;
    return `[${tag} / ${tag}]`;
  }
  return `${subject}${label ? ` (${label})` : ''}`;
};

const buildFacultyText = (row: any) => getFacultyNames(row).join(' / ');

const getTemplateSlots = (template: SemesterTemplate) => {
  return template.rows.flatMap((row) =>
    template.columns
      .filter((column) => column.period !== 'Break' && column.period !== 'Lunch')
      .map((column) => ({
        key: `${row.id}-${column.id}`,
        day: row.day,
        rowId: row.id,
        columnId: column.id,
        period: column.period,
      }))
  );
};

const buildGeneratedSection = (
  snapshot: SectionSnapshot,
  template: SemesterTemplate,
  globalFacultyUsage: Record<string, Set<string>>
): GeneratedSectionTimetable => {
  const cells: Record<string, GeneratedCell> = {};
  const warnings: string[] = [];
  const slots = getTemplateSlots(template);
  const occupied = new Set<string>();
  let cursor = 0;

  const subjects = [...(snapshot.subjectStaff || [])]
    .filter((row) => getSubjectLabel(row))
    .sort((a, b) => {
      const typePriority = (row: any) => {
        const type = normalizeClassType(row?.class_type);
        if (row?.is_dept_core) return 0;
        if (type === 'TCPL' || type === 'TCPR') return 1;
        if (type === 'LAB' || type === 'PRACTICAL' || type === 'PURE_LAB') return 2;
        return 3;
      };
      const priorityDiff = typePriority(a) - typePriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return getSubjectLabel(a).localeCompare(getSubjectLabel(b));
    });

  const reserveSlot = (facultyIds: string[]) => {
    // Pass 1: Try to find a slot with NO faculty conflict
    for (let offset = 0; offset < slots.length; offset += 1) {
      const slot = slots[(cursor + offset) % slots.length];
      if (occupied.has(slot.key)) continue;

      const facultyConflict = facultyIds.some((facultyId) => {
        if (!facultyId) return false;
        return globalFacultyUsage[facultyId]?.has(slot.key) || false;
      });
      if (facultyConflict) continue;

      occupied.add(slot.key);
      facultyIds.forEach((facultyId) => {
        if (!facultyId) return;
        if (!globalFacultyUsage[facultyId]) {
          globalFacultyUsage[facultyId] = new Set();
        }
        globalFacultyUsage[facultyId].add(slot.key);
      });
      cursor = (cursor + offset + 1) % slots.length;
      return { slot, conflict: false };
    }

    // Pass 2: Fallback - find ANY unoccupied slot in this section, even if there is a faculty conflict
    for (let offset = 0; offset < slots.length; offset += 1) {
      const slot = slots[(cursor + offset) % slots.length];
      if (occupied.has(slot.key)) continue;

      // Occupy it
      occupied.add(slot.key);
      facultyIds.forEach((facultyId) => {
        if (!facultyId) return;
        if (!globalFacultyUsage[facultyId]) {
          globalFacultyUsage[facultyId] = new Set();
        }
        globalFacultyUsage[facultyId].add(slot.key);
      });
      cursor = (cursor + offset + 1) % slots.length;
      return { slot, conflict: true };
    }

    return null;
  };

  for (const subject of subjects) {
    const facultyNames = getFacultyNames(subject);
    const facultyIds = Array.isArray(subject?.assigned_staff)
      ? subject.assigned_staff.map((staff: any) => getFacultyKey(staff)).filter(Boolean)
      : [];

    if (facultyNames.length === 0) {
      continue;
    }

    for (const entry of getRequiredSlotPlan(subject)) {
      const reserveResult = reserveSlot(facultyIds);
      if (!reserveResult) {
        warnings.push(`No unoccupied slot available in the template for ${getSubjectLabel(subject)} (${entry.label}).`);
        continue;
      }

      const { slot, conflict } = reserveResult;
      if (conflict) {
        warnings.push(`⚠️ Faculty conflict for ${getSubjectLabel(subject)} (${entry.label}) at ${slot.day} ${slot.period}. Faculty may be double-booked.`);
      }

      cells[slot.key] = {
        subject: buildCellText(subject, entry.kind, entry.label),
        faculty: buildFacultyText(subject),
        kind: entry.kind,
        note: (conflict ? '⚠️ Conflict! ' : '') + 
          (normalizeClassType(subject?.class_type) === 'TCPL' || normalizeClassType(subject?.class_type) === 'TCPR'
            ? '3 theory + 2 lab'
            : entry.kind === 'lab'
              ? 'Batch-wise lab'
              : 'Theory slot'),
      };
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
            const preferred = mapped.find((s: any) => s.year === 1 && s.name === 'A') || mapped[0];
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
        if (allowedSecs.includes(nameUpper)) {
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

    try {
      setGenerationMessage('Loading section data from the backend...');
      setProgressMessage('Loading sections list...');
      const res = await fetchWithAuth('/api/academics/sections/?page_size=0');
      if (res.ok) {
        const data = await res.json();
        const rawSections = data.results || data || [];
        const fetchedSnapshots: SectionSnapshot[] = [];
        
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
            if (!subjectsRes.ok) continue;
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
        const existingSnapshots = Object.values(sectionSnapshots);
        const snapshotMap = new Map<string, SectionSnapshot>();
        fetchedSnapshots.forEach((snapshot) => snapshotMap.set(snapshot.sectionKey, snapshot));
        existingSnapshots.forEach((snapshot) => {
          const foundSection = sectionsList.find(s => s.sectionKey === snapshot.sectionKey);
          snapshotMap.set(snapshot.sectionKey, {
            ...snapshot,
            year: snapshot.year || foundSection?.year || null,
            department: snapshot.department || foundSection?.department || 'SECTION'
          });
        });
        const workingSnapshots = Array.from(snapshotMap.values());

        if (workingSnapshots.length === 0) {
          setGeneratedSections([]);
          setGenerationMessage('No section data could be loaded. Verify the section API returns subjects and staff.');
          setProgressMessage('');
          return;
        }

        const globalFacultyUsage: Record<string, Set<string>> = {};
        const results = workingSnapshots.map((snapshot) => buildGeneratedSection(snapshot, selectedTemplate, globalFacultyUsage));

        setGeneratedSections(results);
        setIsGenerating(false);
        setProgressMessage('');

        if (selectedSectionKey) {
        } else if (results.length > 0) {
          setSelectedSectionKey(results[0].sectionKey);
        }

        const warnings = results.flatMap((result) => result.warnings);
        setGenerationMessage(warnings.length > 0
          ? `Timetable generated with ${warnings.length} warnings. Select sections in the navigator to view details.`
          : 'Timetable generated successfully with faculty-conflict checks applied.');
      } else {
        setGenerationMessage('Failed to load sections from backend.');
        setProgressMessage('');
      }
    } catch (error) {
      console.error('Auto-load failed:', error);
      setGenerationMessage('Failed to load section data.');
      setProgressMessage('');
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
          
          <div className="flex items-center gap-3">
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
              onClick={() => setIsGenerating(true)}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-bold text-sm shadow-sm"
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

            <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 mb-6">
              <button 
                onClick={() => setShowTeachingAssign(!showTeachingAssign)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                {showTeachingAssign ? 'Hide Teaching Assign' : 'Teaching Assign'}
              </button>

              {showTeachingAssign && (
                <TeachingAssignSection facultyOptions={facultyOptions} onSectionSnapshot={handleSectionSnapshot} />
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button 
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 font-semibold transition-colors"
                onClick={() => setIsGenerating(false)}
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
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
    </div>
  );
}
