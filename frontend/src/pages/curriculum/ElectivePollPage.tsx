import React, { useRef, useState, useEffect, useMemo } from 'react';
import { X, Plus, ShieldAlert, Users, Trash2, Download, Upload, Check, LayoutDashboard, ClipboardList, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchDepartments, DepartmentRow } from '../../services/academics';
import { fetchDepartmentStaff, StaffMember } from '../../services/staff';
import { fetchBatchYears, fetchElectives, fetchDepartmentGroups, BatchYear, DepartmentGroup, fetchElectivePolls, createElectivePoll, updateElectivePollStatus, fetchActiveStudentPolls, submitElectiveChoice, ElectivePoll, fetchDeptRows, DeptRow, downloadElectivePollExport } from '../../services/curriculum';
import fetchWithAuth from '../../services/fetchAuth';
import { downloadExcel } from '../../utils/downloadFile';

function StudentElectiveChoosing() {
  const [activePolls, setActivePolls] = useState<ElectivePoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  const loadActivePolls = async () => {
    try {
      const polls = await fetchActiveStudentPolls();
      setActivePolls(polls);
      // Pre-populate already-submitted polls
      const initSelections: Record<number, string> = {};
      const initSubmitted: Record<number, boolean> = {};
      polls.forEach((poll: any) => {
        if (poll.your_choice_poll_subject_id) {
          initSelections[poll.id] = String(poll.your_choice_poll_subject_id);
          initSubmitted[poll.id] = true;
        }
      });
      setSelections(initSelections);
      setSubmitted(initSubmitted);
    } catch (err) {
      console.error('Failed to load active polls', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivePolls();
  }, []);

  const handleSubmit = async (poll: ElectivePoll) => {
    const selectedSubjectId = selections[poll.id];
    if (!selectedSubjectId) {
      setErrors(prev => ({ ...prev, [poll.id]: 'Please select a subject before submitting.' }));
      return;
    }
    setSubmitting(prev => ({ ...prev, [poll.id]: true }));
    setErrors(prev => ({ ...prev, [poll.id]: '' }));
    try {
      await submitElectiveChoice(poll.id, selectedSubjectId);
      setSubmitted(prev => ({ ...prev, [poll.id]: true }));
      await loadActivePolls();
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [poll.id]: err.message || 'Failed to submit choice.' }));
      await loadActivePolls();
    } finally {
      setSubmitting(prev => ({ ...prev, [poll.id]: false }));
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading your elective polls...</div>;
  }

  if (activePolls.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans">
        <div className="max-w-4xl mx-auto text-center mt-20">
          <div className="inline-flex bg-indigo-50 text-indigo-600 p-4 rounded-full mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No Active Polls</h2>
          <p className="text-slate-500">There are no elective polls currently active for your batch and department.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-xl font-bold text-slate-900">Choose Your Electives</h1>
          <p className="text-xs text-slate-500 mt-1">Select your preferred subjects for the upcoming term.</p>
        </div>
        <div className="space-y-4">
          {activePolls.map((poll) => {
            const isLocked = Boolean(submitted[poll.id]);
            return (
              <div key={poll.id} className="bg-white border border-indigo-100 rounded-xl shadow-sm overflow-hidden">
                <div className="bg-indigo-50/50 p-4 border-b border-indigo-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-indigo-900 text-base">{poll.parent_elective_name}</h3>
                    <p className="text-xs text-indigo-600/80 mt-1">
                      {isLocked ? 'Your choice is locked in.' : 'Please select one subject from below'}
                    </p>
                  </div>
                  {isLocked && (
                    <span className="flex items-center gap-1 bg-green-100 text-green-700 text-[11px] font-semibold px-2 py-1 rounded-full">
                      <Check className="w-3 h-3" /> Choice Locked
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(poll.poll_subjects || []).map((sub: any) => {
                      const isFull = sub.seats != null && Number(sub.seats) <= 0;
                      const isChosen = isLocked && selections[poll.id] === String(sub.id);
                      const isOther = isLocked && !isChosen;
                      const isDisabled = isLocked || isFull;
                      return (
                        <label
                          key={sub.id}
                          className={`relative border rounded-lg p-3 transition-all flex flex-col ${
                            isChosen
                              ? 'border-green-500 bg-green-50/60 ring-2 ring-green-300 cursor-default'
                              : isOther
                              ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                              : isFull
                              ? 'border-rose-200 bg-rose-50/60 opacity-60 cursor-not-allowed'
                              : selections[poll.id] === String(sub.id)
                              ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-300 cursor-pointer'
                              : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 cursor-pointer'
                          }`}
                        >
                          {isChosen ? (
                            <span className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-0.5">
                              <Check className="w-3 h-3" />
                            </span>
                          ) : (
                            <input
                              type="radio"
                              name={`poll-${poll.id}`}
                              className="absolute top-3 right-3 accent-indigo-600"
                              value={sub.id}
                              checked={selections[poll.id] === String(sub.id)}
                              disabled={isDisabled}
                              onChange={() => !isDisabled && setSelections(prev => ({ ...prev, [poll.id]: String(sub.id) }))}
                            />
                          )}
                          <div className={`font-semibold mb-1 pr-6 text-sm ${isChosen ? 'text-green-800' : 'text-slate-900'}`}>
                            {sub.course_name || '-'}
                            {isChosen && <span className="ml-2 text-[11px] font-medium text-green-600">Your Choice</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
                            <span className="font-mono">{sub.course_code || '-'}</span>
                            {isChosen && sub.your_rank && (
                              <span className="bg-indigo-600 text-white rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                {sub.total_seats ? `${sub.your_rank}/${sub.total_seats}` : `#${sub.your_rank}`}
                              </span>
                            )}
                          </div>
                          <div className="mt-auto pt-2 border-t border-slate-100 flex justify-between items-center text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {isFull ? 'Seats full' : sub.seats != null ? `${sub.seats} seats left` : 'Unlimited seats'}
                            </span>
                            <span>{sub.department_code || 'All'} Dept</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {!isLocked && (
                    <>
                      {errors[poll.id] && <p className="mt-2 text-xs text-red-600">{errors[poll.id]}</p>}
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => handleSubmit(poll)}
                          disabled={submitting[poll.id]}
                          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {submitting[poll.id] ? 'Submitting...' : 'Submit Choice'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ElectivePollPage({ user }: { user?: any }) {
  const hasStudentPermission = Array.isArray(user?.permissions) && user.permissions.includes('curriculum.choose_elective');

  if (hasStudentPermission) {
    return <StudentElectiveChoosing />;
  }

  const [view, setView] = useState<'dashboard' | 'create' | 'manage'>('dashboard');
  const [electivesForm, setElectivesForm] = useState([{ code: '', name: '', seats: '', staff: '', dept: '', blocked_depts: [] as number[] }]);
  const [departmentGroups, setDepartmentGroups] = useState<DepartmentGroup[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [batchYears, setBatchYears] = useState<BatchYear[]>([]);
  const [electivesData, setElectivesData] = useState<any[]>([]);
  const [curriculumElectives, setCurriculumElectives] = useState<DeptRow[]>([]);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Filters State
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedParent, setSelectedParent] = useState('');
  const uniqueSemesters = [1, 2, 3, 4, 5, 6, 7, 8];


  // Polls State
  const [polls, setPolls] = useState<ElectivePoll[]>([]); 
  const [isLoadingPolls, setIsLoadingPolls] = useState(false);
  const [expandedPolls, setExpandedPolls] = useState<Record<number, boolean>>({});
  const [downloading, setDownloading] = useState<Record<number, boolean>>({});

  const updateRow = (index: number, field: string, value: any) => {
    const newForm = [...electivesForm];
    newForm[index] = { ...newForm[index], [field]: value };
    // Auto-clear staff if department changes and the selected staff is not in the new department
    if (field === 'dept') {
      newForm[index].staff = '';
    }
    setElectivesForm(newForm);
  };

  const toggleBlockedDept = (index: number, deptId: number) => {
    const current = electivesForm[index].blocked_depts || [];
    const newBlocked = current.includes(deptId)
      ? current.filter(id => id !== deptId)
      : [...current, deptId];
    updateRow(index, 'blocked_depts', newBlocked);
  };

  const handleBlockProvidingDept = () => {
    const newForm = electivesForm.map(el => {
      if (!el.dept) return el;
      const deptId = Number(el.dept);
      const blocked = el.blocked_depts || [];
      return {
        ...el,
        blocked_depts: blocked.includes(deptId) ? blocked : [...blocked, deptId]
      };
    });
    setElectivesForm(newForm);
  };

  const handleBlockOutsideGroup = () => {
    if (!selectedGroup) {
      alert("Please select a Department Group first.");
      return;
    }
    const group = departmentGroups.find(g => g.id === Number(selectedGroup));
    if (!group) return;

    const allowedDepts = group.department_ids || [];
    const outsideDepts = departments.filter(d => !allowedDepts.includes(d.id)).map(d => d.id);

    const newForm = electivesForm.map(el => ({
      ...el,
      blocked_depts: outsideDepts
    }));
    setElectivesForm(newForm);
  };

  const handleClearAllBlocks = () => {
    const newForm = electivesForm.map(el => ({
      ...el,
      blocked_depts: []
    }));
    setElectivesForm(newForm);
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadExcel(
        '/api/curriculum/elective-polls/template/',
        'elective_poll_subjects_template.xlsx',
        fetchWithAuth,
      );
    } catch (err) {
      console.error('Failed to download template', err);
      alert('Failed to download template.');
    }
  };

  const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');

  const normalizeLabel = (value: string) => value.trim().toLowerCase();

  const parseSuffixToken = (value: any): string => {
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if (!text) return '';
    const match = text.match(/\(([^)]+)\)\s*$/);
    if (match) return match[1].trim();
    return '';
  };

  const resolveStaffId = (value: any): string => {
    const label = normalizeLabel(String(value || ''));
    const suffix = parseSuffixToken(value);
    const byId = staffList.find((s) => suffix && String(s.staff_id || '').toLowerCase() === suffix.toLowerCase());
    if (byId) return String(byId.id);
    const byName = staffList.find((s) => normalizeLabel(s.name || '') === label);
    return byName ? String(byName.id) : '';
  };

  const resolveDeptId = (value: any): string => {
    const label = normalizeLabel(String(value || ''));
    const suffix = parseSuffixToken(value);
    const byCode = departments.find((d) => suffix && String(d.short_name || d.code || '').toLowerCase() === suffix.toLowerCase());
    if (byCode) return String(byCode.id);
    const byName = departments.find((d) => normalizeLabel(d.name || d.short_name || d.code || '') === label);
    return byName ? String(byName.id) : '';
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: true });

      if (!rows.length) {
        alert('Template is empty.');
        return;
      }

      const headers = rows[0].map((h) => normalizeHeader(String(h || '')));
      const headerIndex = (key: string) => headers.findIndex((h) => h === key);

      const keyMap: Record<string, number> = {
        code: headerIndex('code') !== -1 ? headerIndex('code') : headerIndex('course_code'),
        name: headerIndex('name') !== -1 ? headerIndex('name') : headerIndex('course_name'),
        seats: headerIndex('seats') !== -1 ? headerIndex('seats') : headerIndex('total_seats'),
        staff: headerIndex('staff') !== -1 ? headerIndex('staff') : headerIndex('staff_id'),
        dept: headerIndex('dept') !== -1 ? headerIndex('dept') : headerIndex('dept_id'),
        block_rule: headerIndex('block_rule') !== -1 ? headerIndex('block_rule') : headerIndex('block_rule_name'),
      };

      const nextForm = rows.slice(1).reduce((acc: any[], row) => {
        if (!row.some((cell) => String(cell || '').trim())) return acc;

        const code = keyMap.code >= 0 ? String(row[keyMap.code] || '').trim() : '';
        const name = keyMap.name >= 0 ? String(row[keyMap.name] || '').trim() : '';
        const seatsRaw = keyMap.seats >= 0 ? row[keyMap.seats] : '';
        const seats = seatsRaw !== null && seatsRaw !== undefined && String(seatsRaw).trim() !== ''
          ? String(seatsRaw).trim()
          : '';
        const staffId = keyMap.staff >= 0 ? resolveStaffId(row[keyMap.staff]) : '';
        const deptId = keyMap.dept >= 0 ? resolveDeptId(row[keyMap.dept]) : '';
        const blockRule = keyMap.block_rule >= 0 ? String(row[keyMap.block_rule] || '').trim().toLowerCase() : '';

        let blocked: number[] = [];
        if (blockRule === 'block providing dept' && deptId) {
          blocked = [Number(deptId)];
        } else if (blockRule === 'block outside group') {
          if (!selectedGroup) {
            alert('Select a Department Group before using "Block outside group".');
          } else {
            const group = departmentGroups.find((g) => g.id === Number(selectedGroup));
            if (group) {
              const allowedDepts = group.department_ids || [];
              blocked = departments.filter((d) => !allowedDepts.includes(d.id)).map((d) => d.id);
            }
          }
        }

        acc.push({
          code,
          name,
          seats,
          staff: staffId,
          dept: deptId,
          blocked_depts: blocked,
        });
        return acc;
      }, []);

      if (!nextForm.length) {
        alert('No valid rows found in the template.');
        return;
      }

      setElectivesForm(nextForm);
      alert(`Imported ${nextForm.length} electives into the form.`);
    } catch (err) {
      console.error('Failed to import template', err);
      alert('Failed to import template. Please check the file format.');
    } finally {
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
    }
  };

  // Auto-block departments outside the group when the group selection changes
  useEffect(() => {
    if (selectedGroup && departmentGroups.length > 0 && departments.length > 0) {
      const group = departmentGroups.find(g => g.id === Number(selectedGroup));
      if (!group) return;

      const allowedDepts = group.department_ids || [];
      const outsideDepts = departments.filter(d => !allowedDepts.includes(d.id)).map(d => d.id);

      setElectivesForm(prev => prev.map(el => ({
        ...el,
        blocked_depts: outsideDepts
      })));
    }
  }, [selectedGroup, departmentGroups, departments]);

  useEffect(() => {
    async function loadData() {
      try {
        const [groups, depts, staffs, years, elects, currElects] = await Promise.all([
          fetchDepartmentGroups(),
          fetchDepartments(),
          fetchDepartmentStaff(),
          fetchBatchYears(),
          fetchElectives(),
          fetchDeptRows({ is_elective: true }),
        ]);
        setDepartmentGroups(groups);
        setDepartments(depts);
        setStaffList(staffs);
        setBatchYears(years);
        setElectivesData(Array.isArray(elects) ? elects : []);
        setCurriculumElectives(Array.isArray(currElects) ? currElects : []);
        
        // Load Polls
        try {
          const loadedPolls = await fetchElectivePolls();
          setPolls(loadedPolls);
        } catch (err) {
          console.error('Failed to load polls', err);
        }

      } catch (err) {
        console.error('Failed to load filters data', err);
      }
    }
    loadData();
  }, []);

  const uniqueParents = useMemo(() => {
    // 1. Get names from existing elective options (already created subjects)
    let fromOptions = electivesData;
    const namesFromOptions = fromOptions.map(e => e.parent_name).filter(Boolean);

    // 2. Get names from curriculum slots (subjects newly marked as electives)
    let fromCurriculum = curriculumElectives;
    const namesFromCurriculum = fromCurriculum.map(e => e.course_name).filter(Boolean);

    // 3. Combine and deduplicate
    return Array.from(new Set([...namesFromOptions, ...namesFromCurriculum])).sort();
  }, [electivesData, curriculumElectives]);

  const handleCreateElectives = async () => {
    if (!selectedParent) {
      alert("Please select a Parent Elective first.");
      return;
    }
    if (!selectedYear) {
      alert("Please select a batch year.");
      return;
    }
    const missingDept = electivesForm.findIndex(s => !s.dept);
    if (missingDept !== -1) {
      alert(`Please select a providing department for subject #${missingDept + 1}.`);
      return;
    }
    
    try {
      const payload = {
        parent_elective_name: selectedParent,
        batch_year: selectedYear,
        semester: selectedSemester,
        department_group: selectedGroup,
        subjects: electivesForm.map(s => ({
          code: s.code,
          name: s.name,
          seats: s.seats || null,
          staff_id: s.staff || null,
          dept_id: s.dept || null,
          blocked_departments: s.blocked_depts || []
        }))
      };
      
      const createdPoll = await createElectivePoll(payload as any);
      setPolls([createdPoll, ...polls]);
      
      // Reset form
      setElectivesForm([{ code: '', name: '', seats: '', staff: '', dept: '', blocked_depts: [] }]);
      setSelectedYear('');
      setSelectedSemester('');
      setSelectedGroup('');
      setSelectedParent('');
      
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to create elective poll.");
    }
  };

  const handleTogglePollStatus = async (pollId: number, currentStatus: boolean) => {
    try {
      const updated = await updateElectivePollStatus(pollId, !currentStatus);
      setPolls(polls.map(p => p.id === pollId ? updated : p));
    } catch (err) {
      console.error('Failed to toggle poll status', err);
      alert('Failed to update polling status');
    }
  };

  const handleDownloadPoll = async (pollId: number) => {
    setDownloading(prev => ({ ...prev, [pollId]: true }));
    try {
      await downloadElectivePollExport(pollId);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to download export.');
    } finally {
      setDownloading(prev => ({ ...prev, [pollId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Navigation */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            {view !== 'dashboard' ? (
              <button 
                onClick={() => setView('dashboard')}
                className="bg-slate-100 p-3 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
            ) : (
              <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600">
                <LayoutDashboard className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {view === 'dashboard' ? 'Elective Polling Admin' : view === 'create' ? 'Create Polling' : 'Manage Elective Polls'}
              </h1>
              <p className="text-sm text-slate-500">
                {view === 'dashboard' ? 'Select an action to manage elective subjects and polls' : 'Configure and launch new elective polls for students'}
              </p>
            </div>
          </div>
          {view !== 'dashboard' && (
            <button 
              onClick={() => setView('dashboard')}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>
          )}
        </div>

        {/* Dashboard View */}
        {view === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8">
            <button 
              onClick={() => setView('create')}
              className="group bg-white p-8 rounded-3xl border-2 border-slate-200 hover:border-indigo-500 hover:shadow-xl transition-all text-left">
              <div className="bg-indigo-100 text-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Plus className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Create Polling</h2>
              <p className="text-slate-500 leading-relaxed">
                Add new elective subjects, configure seats, assign staff, and launch new polls for specific batches and departments.
              </p>
              <div className="mt-8 flex items-center gap-2 text-indigo-600 font-bold">
                Get Started <ChevronLeft className="w-5 h-5 rotate-180" />
              </div>
            </button>

            <button 
              onClick={() => setView('manage')}
              className="group bg-white p-8 rounded-3xl border-2 border-slate-200 hover:border-indigo-500 hover:shadow-xl transition-all text-left">
              <div className="bg-emerald-100 text-emerald-600 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ClipboardList className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Manage Elective</h2>
              <p className="text-slate-500 leading-relaxed">
                Monitor active polls, toggle activation status, view participant counts, and manage existing elective configurations.
              </p>
              <div className="mt-8 flex items-center gap-2 text-emerald-600 font-bold">
                View Polls <ChevronLeft className="w-5 h-5 rotate-180" />
              </div>
            </button>
          </div>
        )}

        {/* Create View */}
        {view === 'create' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
              <button 
                onClick={() => {
                  setElectivesForm([{ code: '', name: '', seats: '', staff: '', dept: '', blocked_depts: [] }]);
                  setSelectedYear('');
                  setSelectedSemester('');
                  setSelectedGroup('');
                  setSelectedParent('');
                }}
                className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <X className="w-4 h-4" /> Reset form
              </button>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Year</label>
                  <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-indigo-500">
                    <option value="">Select year</option>
                    {batchYears.map(y => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Semester</label>
                  <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-indigo-500">
                    <option value="">Select semester</option>
                    {uniqueSemesters.map(s => (
                      <option key={s} value={s}>Semester {s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Department Group</label>
                  <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-indigo-500">
                    <option value="">(none)</option>
                    {departmentGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Parent Elective</label>
                  <select value={selectedParent} onChange={e => setSelectedParent(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-indigo-500">
                    <option value="">(none)</option>
                    {uniqueParents.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={handleBlockProvidingDept}
                  className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors">
                  <ShieldAlert className="w-4 h-4" /> Block providing dept
                </button>
                <button 
                  onClick={handleBlockOutsideGroup}
                  className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors">
                  <Users className="w-4 h-4" /> Block outside group
                </button>
                <button 
                  onClick={handleClearAllBlocks}
                  className="flex items-center gap-2 text-sm font-medium text-rose-600 bg-rose-50 px-4 py-2 rounded-lg hover:bg-rose-100 transition-colors">
                  <Trash2 className="w-4 h-4" /> Clear all blocks
                </button>
                <button
                  onClick={() => importFileInputRef.current?.click()}
                  className="flex items-center gap-2 text-sm font-medium text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg hover:bg-emerald-100 transition-colors">
                  <Upload className="w-4 h-4" /> Import
                </button>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 text-sm font-medium text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg hover:bg-emerald-100 transition-colors">
                  <Download className="w-4 h-4" /> Template
                </button>
              </div>
            </div>

            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFileChange}
              className="hidden"
            />

            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Elective Subjects</h2>
              <div className="space-y-4">
                {electivesForm.map((el, i) => (
                  <div key={i} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative">
                    <button 
                      onClick={() => setElectivesForm(electivesForm.filter((_, idx) => idx !== i))}
                      className="absolute top-4 right-4 text-rose-500 hover:text-rose-700">
                      <X className="w-5 h-5" />
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">Code</label>
                        <input type="text" placeholder="CS301" value={el.code} onChange={e => updateRow(i, 'code', e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">Subject Name</label>
                        <input type="text" placeholder="Advanced Machine Learning" value={el.name} onChange={e => updateRow(i, 'name', e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">Seats</label>
                        <input type="text" placeholder="60" value={el.seats} onChange={e => updateRow(i, 'seats', e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">Staff</label>
                        <select value={el.staff} onChange={e => updateRow(i, 'staff', e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500 text-slate-500">
                          <option value="">(none)</option>
                          {(el.dept ? staffList.filter(s => s.department?.id === Number(el.dept)) : staffList).map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.staff_id})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-6">
                      <div className="md:col-span-4">
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Blocked for Departments</label>
                        <div className="flex flex-wrap gap-2">
                          {departments.map(d => (
                            <label key={d.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                              <input 
                                type="checkbox" 
                                checked={(el.blocked_depts || []).includes(d.id)}
                                onChange={() => toggleBlockedDept(i, d.id)}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-xs font-medium text-slate-600">{d.short_name || d.code}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="md:col-start-5">
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Providing Department</label>
                        <select value={el.dept} onChange={e => updateRow(i, 'dept', e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500 text-slate-500">
                          <option value="">Select department</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name || d.short_name || d.code}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-center">
                <button 
                  onClick={() => setElectivesForm([...electivesForm, { code: '', name: '', seats: '', staff: '', dept: '', blocked_depts: [] }])}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors">
                  <Plus className="w-4 h-4" /> Add another elective
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-end">
              <button 
                onClick={handleCreateElectives}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors">
                <Check className="w-4 h-4" /> Create Electives
              </button>
            </div>
          </div>
        )}

        {/* Manage View */}
        {view === 'manage' && (
          <div className="space-y-6">
            {polls.length > 0 ? (
              <div className="space-y-6">
                {polls.map((poll) => (
                  <div key={poll.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 p-5 flex items-center justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-lg">{poll.parent_elective_name}</h3>
                          {poll.department_group_name && (
                            <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1">
                              {poll.department_group_name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          Year: {poll.batch_year_name || '-'} • 
                          Subjects: {poll.poll_subjects?.length || 0}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setExpandedPolls(prev => ({ ...prev, [poll.id]: !prev[poll.id] }))}
                          className="px-4 py-2 rounded-lg font-medium text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors inline-flex items-center gap-2"
                        >
                          {expandedPolls[poll.id] ? 'Hide Subjects' : 'View Subjects'}
                          {expandedPolls[poll.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDownloadPoll(poll.id)}
                          disabled={downloading[poll.id]}
                          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <Download className="w-4 h-4" />
                          {downloading[poll.id] ? 'Downloading...' : 'Download Excel'}
                        </button>
                        <button 
                          onClick={() => handleTogglePollStatus(poll.id, poll.is_active)}
                          className={`px-5 py-2 rounded-lg font-medium text-sm shadow-sm transition-colors ${
                            poll.is_active 
                              ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
                              : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          }`}>
                          {poll.is_active ? 'Deactivate Polling' : 'Activate Polling'}
                        </button>
                      </div>
                    </div>
                    {expandedPolls[poll.id] && (
                      <div className="p-5 overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-600 min-w-[600px]">
                          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-3 rounded-tl-lg">Code</th>
                              <th className="px-4 py-3">Subject Name</th>
                              <th className="px-4 py-3">Seats</th>
                              <th className="px-4 py-3">Staff</th>
                              <th className="px-4 py-3 rounded-tr-lg">Providing Dept</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(poll.poll_subjects || []).map((sub: any, idx: number) => (
                              <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-medium text-slate-900">{sub.course_code || '-'}</td>
                                <td className="px-4 py-3">{sub.course_name || '-'}</td>
                                <td className="px-4 py-3">{sub.seats || '-'}</td>
                                <td className="px-4 py-3">{sub.staff_name || '-'}</td>
                                <td className="px-4 py-3">{sub.department_code || sub.department_name || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-200 text-center">
                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <ClipboardList className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No polls found</h3>
                <p className="text-slate-500 mt-1">You haven't created any elective polls yet.</p>
                <button 
                  onClick={() => setView('create')}
                  className="mt-6 text-indigo-600 font-bold hover:underline">
                  Create your first poll &rarr;
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
