import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../services/fetchAuth';
import { kvHydrate, kvSave } from '../../utils/coeKvStore';

type HallSelectionRow = {
  id: number;
  hallNumber: string;
  building: string;
  floor: string;
  rows: number;
  cols: number;
  pattern: string;
  notes: string;
};

type FacultySelection = {
  hallId: number;
  hallNumber: string;
  building: string;
  floor: string;
  selectedByStaffId?: string;
  selectedByName?: string;
  selectedByEmail?: string;
  selectedAt: string;
};

type StaffMember = {
  id: number;
  staffId: string;
  name: string;
  display: string;
  departmentCode: string;
  departmentName: string;
  academicYear: string;
};

const PLAN_STORAGE_KEY = 'coe-hall-allocation-plan';
const FINALIZED_STORAGE_KEY = 'coe-hall-allocation-finalized';
const FACULTY_SELECTIONS_KEY = 'coe-faculty-hall-selections';

function readSavedPlan(): { rows?: Array<HallSelectionRow> } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { rows?: Array<HallSelectionRow> };
  } catch {
    return null;
  }
}

function readFinalized() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(FINALIZED_STORAGE_KEY) === 'true';
}

function readFacultySelections(): FacultySelection[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FACULTY_SELECTIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FacultySelection[];
  } catch {
    return [];
  }
}

function writeFacultySelections(items: FacultySelection[]) {
  if (typeof window === 'undefined') return;
  kvSave(FACULTY_SELECTIONS_KEY, items);
}

async function lookupFacultyUser(identifier: string): Promise<{ staffId: string; display: string; name: string } | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  try {
    const res = await fetchWithAuth('/api/academics/all-staff/');
    if (!res.ok) return null;

    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];
    const normalized = trimmed.toLowerCase();

    const faculty = results.find((item: any) => {
      const staffId = String(item.staff_id || '').trim();
      const user = item.user || {};
      const firstName = String(user.first_name || '').trim();
      const lastName = String(user.last_name || '').trim();
      const username = String(user.username || '').trim();
      const name = [firstName, lastName].filter(Boolean).join(' ') || username || staffId;
      const display = [staffId, name ? `• ${name}` : ''].filter(Boolean).join(' ');
      const candidates = [staffId, username, name, display].map((value) => String(value || '').toLowerCase().trim());
      return candidates.some((value) => value === normalized);
    });

    if (!faculty) return null;

    const staffId = String(faculty.staff_id || '').trim();
    const firstName = String(faculty.user?.first_name || '').trim();
    const lastName = String(faculty.user?.last_name || '').trim();
    const username = String(faculty.user?.username || '').trim();
    const name = [firstName, lastName].filter(Boolean).join(' ') || username || staffId;
    const deptCode = String(faculty.current_department?.short_name || faculty.current_department?.code || '').trim();
    const year = String(faculty.department_roles?.[0]?.academic_year || '').trim();
    const prefix = [deptCode, year].filter(Boolean).join(' ');
    const displayStaff = staffId ? `${staffId}` : '';
    const displayName = displayStaff ? `${displayStaff}${name ? ` • ${name}` : ''}` : name;
    const display = prefix ? `${prefix} ${displayName}`.trim() : displayName;

    if (!staffId && !name) return null;

    return {
      staffId: staffId || normalized,
      display,
      name,
    };
  } catch {
    return null;
  }
}

export default function HallSelectionPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<HallSelectionRow[]>([]);
  const [selectedHallId, setSelectedHallId] = useState<number | null>(null);
  const [selections, setSelections] = useState<FacultySelection[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(readFinalized());
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedFacultyStaffId, setSelectedFacultyStaffId] = useState('');
  const [loadingStaff, setLoadingStaff] = useState(false);

  useEffect(() => {
    const refreshState = async () => {
      try {
        const [backendSelections] = await Promise.all([
          kvHydrate(FACULTY_SELECTIONS_KEY),
        ]);

        const savedPlan = readSavedPlan();
        const savedRows = savedPlan?.rows || [];
        setRows(savedRows.map((row) => ({ ...row, pattern: row.pattern || 'Straight' })));
        setIsFinalized(readFinalized());
        setSelections(backendSelections ?? readFacultySelections());
      } catch {
        const savedPlan = readSavedPlan();
        const savedRows = savedPlan?.rows || [];
        setRows(savedRows.map((row) => ({ ...row, pattern: row.pattern || 'Straight' })));
        setIsFinalized(readFinalized());
        setSelections(readFacultySelections());
      }
    };

    refreshState();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === FACULTY_SELECTIONS_KEY || event.key === PLAN_STORAGE_KEY || event.key === FINALIZED_STORAGE_KEY) {
        refreshState();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    const loadStaffList = async () => {
      setLoadingStaff(true);
      try {
        const res = await fetchWithAuth('/api/academics/all-staff/');
        if (!res.ok) return;

        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];

        const parsed: StaffMember[] = results.map((item: any) => {
          const staffId = String(item.staff_id || '').trim();
          const firstName = String(item.user?.first_name || '').trim();
          const lastName = String(item.user?.last_name || '').trim();
          const username = String(item.user?.username || '').trim();
          const name = [firstName, lastName].filter(Boolean).join(' ') || username || staffId;
          const display = staffId ? `${staffId}${name ? ` • ${name}` : ''}` : name;
          const departmentCode = String(item.current_department?.short_name || item.current_department?.code || '').trim();
          const departmentName = String(item.current_department?.name || '').trim();
          const academicYear = String(item.department_roles?.[0]?.academic_year || '').trim();

          return {
            id: Number(item.id || 0),
            staffId,
            name,
            display,
            departmentCode,
            departmentName,
            academicYear,
          };
        });

        setStaffList(parsed);
      } catch {
        setStaffList([]);
      } finally {
        setLoadingStaff(false);
      }
    };

    loadStaffList();
  }, []);

  const departmentOptions = useMemo(() => {
    const departments = new Set<string>();
    staffList.forEach((staff) => {
      if (staff.departmentCode) departments.add(staff.departmentCode);
    });
    return Array.from(departments).sort();
  }, [staffList]);

  const facultyOptions = useMemo(() => {
    return staffList
      .filter((staff) => staff.departmentCode === selectedDepartment)
      .sort((a, b) => a.staffId.localeCompare(b.staffId));
  }, [staffList, selectedDepartment]);

  const selectedFaculty = useMemo(() => {
    return staffList.find((staff) => staff.staffId === selectedFacultyStaffId) ?? null;
  }, [staffList, selectedFacultyStaffId]);

  const handleSelectHall = async (row: HallSelectionRow) => {
    if (!isFinalized) {
      setMessage('Hall selection is not available until COE finalizes the hall list.');
      return;
    }

    const alreadyAssigned = selections.find((item) => item.hallId === row.id);
    if (alreadyAssigned) {
      setMessage(`Hall ${row.hallNumber} is already assigned to ${alreadyAssigned.selectedByName || alreadyAssigned.selectedByEmail || alreadyAssigned.selectedByStaffId}.`);
      return;
    }

    if (!selectedFacultyStaffId || !selectedFaculty) {
      window.alert('Please select a department and faculty before assigning a hall.');
      return;
    }

    const nextSelection: FacultySelection = {
      hallId: row.id,
      hallNumber: row.hallNumber,
      building: row.building,
      floor: row.floor,
      selectedByStaffId: selectedFaculty.staffId,
      selectedByName: selectedFaculty.display,
      selectedAt: new Date().toISOString(),
    };

    const nextSelections = [
      ...selections.filter((item) => item.hallId !== row.id),
      nextSelection,
    ];

    writeFacultySelections(nextSelections);
    setSelections(nextSelections);
    setSelectedHallId(row.id);
    setMessage(`Hall ${row.hallNumber} assigned to ${selectedFaculty?.name || selectedFaculty?.display || selectedFacultyStaffId}.`);
  };

  const clearSelection = () => {
    const nextSelections = selections.filter((item) => item.hallId !== selectedHallId);
    writeFacultySelections(nextSelections);
    setSelections(nextSelections);
    setSelectedHallId(null);
    setMessage('Your hall selection was cleared.');
  };

  const handleRemoveSelection = (hallId: number) => {
    const nextSelections = selections.filter((item) => item.hallId !== hallId);
    writeFacultySelections(nextSelections);
    setSelections(nextSelections);
    if (selectedHallId === hallId) {
      setSelectedHallId(null);
    }
    setMessage('Faculty assignment removed.');
  };

  const handleReassignSelection = async (hallId: number) => {
    const index = selections.findIndex((item) => item.hallId === hallId);
    if (index === -1) return;

    const current = selections[index];
    if (!selectedFacultyStaffId || !selectedFaculty) {
      window.alert('Please select a department and faculty before reassigning.');
      return;
    }

    const nextSelections = [...selections];
    nextSelections[index] = {
      ...current,
      selectedByStaffId: selectedFaculty.staffId,
      selectedByName: selectedFaculty.display,
      selectedByEmail: undefined,
      selectedAt: new Date().toISOString(),
    };

    writeFacultySelections(nextSelections);
    setSelections(nextSelections);
    setMessage(`Hall ${current.hallNumber} reassigned to ${selectedFaculty?.name || selectedFaculty?.display || selectedFacultyStaffId}.`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-2">
      <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_30px_45px_-30px_rgba(111,29,52,0.55)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#5b1a30]">Hall Selection</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#6a4a40]">
              Select one hall to take charge as an invigilator. Once you choose a hall on a floor, you cannot select another hall from that same floor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/coe')}
            className="rounded-lg border border-[#d8a791] bg-white px-4 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fbeee8]"
          >
            Back to Portal
          </button>
        </div>

        {message ? (
          <div className="mt-4 rounded-lg border border-[#efd7cc] bg-[#fff9f4] px-3 py-2 text-sm text-[#7a2038]">
            {message}
          </div>
        ) : null}
      </div>

      {!isFinalized ? (
        <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-5 text-sm text-[#7a2038] shadow-sm">
          Hall selection will open after COE finalizes the hall list.
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#ead7d0] bg-white/95 p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm font-semibold text-[#5b1a30]">Department</span>
            <select
              value={selectedDepartment}
              onChange={(event) => {
                setSelectedDepartment(event.target.value);
                setSelectedFacultyStaffId('');
              }}
              disabled={departmentOptions.length === 0}
              className="mt-2 w-full rounded-lg border border-[#d8a791] bg-white px-3 py-2 text-sm text-[#5b1a30] disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="">Select department</option>
              {departmentOptions.map((deptOption) => (
                <option key={deptOption} value={deptOption}>
                  {deptOption}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-[#5b1a30]">Faculty</span>
            <select
              value={selectedFacultyStaffId}
              onChange={(event) => setSelectedFacultyStaffId(event.target.value)}
              disabled={!selectedDepartment || loadingStaff}
              className="mt-2 w-full rounded-lg border border-[#d8a791] bg-white px-3 py-2 text-sm text-[#5b1a30] disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="">Select faculty</option>
              {facultyOptions.map((faculty) => (
                <option key={faculty.staffId} value={faculty.staffId}>
                  {faculty.display}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-3 text-sm text-[#6a4a40]">
          Choose a department, then a faculty staff ID with name before assigning or reassigning halls.
        </p>

        {loadingStaff ? (
          <div className="mt-4 rounded-lg border border-[#efd7cc] bg-[#fff9f4] px-3 py-2 text-sm text-[#7a2038]">
            Loading faculty list...
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[#ead7d0] bg-white/95 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#5b1a30]">Faculty Selections</h2>
            <p className="mt-2 text-sm text-[#6a4a40]">Current halls selected by faculty members. COE can remove or reassign any selection.</p>
          </div>
          <div className="text-sm font-medium text-[#7a2038]">{selections.length} assignment{selections.length === 1 ? '' : 's'}</div>
        </div>

        {selections.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[#d8a791] bg-[#fff9f4] p-4 text-sm text-[#7a2038]">
            No faculty selections have been made yet.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm text-[#5b1a30]">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2">Hall</th>
                  <th className="px-3 py-2">Building</th>
                  <th className="px-3 py-2">Floor</th>
                  <th className="px-3 py-2">Faculty</th>
                  <th className="px-3 py-2">Selected At</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {selections.map((selection) => (
                  <tr key={`${selection.hallId}-${selection.selectedByEmail || selection.selectedByName}-${selection.selectedAt}`} className="border-t border-[#f0e3dd]">
                    <td className="px-3 py-2">{selection.hallNumber}</td>
                    <td className="px-3 py-2">{selection.building}</td>
                    <td className="px-3 py-2">{selection.floor}</td>
                    <td className="px-3 py-2">{selection.selectedByName || selection.selectedByStaffId || selection.selectedByEmail || 'Unknown'}</td>
                    <td className="px-3 py-2">{new Date(selection.selectedAt).toLocaleString()}</td>
                    <td className="px-3 py-2 space-x-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveSelection(selection.hallId)}
                        className="rounded-lg border border-[#d8a791] bg-white px-3 py-2 text-xs font-semibold text-[#7a2038] hover:bg-[#f7e3db]"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReassignSelection(selection.hallId)}
                        className="rounded-lg border border-[#d8a791] bg-white px-3 py-2 text-xs font-semibold text-[#7a2038] hover:bg-[#f7e3db]"
                      >
                        Reassign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-4 shadow-sm sm:p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-[#7a2038]">
                <th className="px-3 py-2">Hall</th>
                <th className="px-3 py-2">Building</th>
                <th className="px-3 py-2">Floor</th>
                <th className="px-3 py-2">Capacity</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const alreadyAssigned = selections.some((item) => item.hallId === row.id);
                const isSelected = selectedHallId === row.id;
                return (
                  <tr key={row.id} className="rounded-lg bg-[#fcf7f4]">
                    <td className="px-3 py-2">{row.hallNumber}</td>
                    <td className="px-3 py-2">{row.building}</td>
                    <td className="px-3 py-2">{row.floor}</td>
                    <td className="px-3 py-2">{row.rows * row.cols}</td>
                    <td className="px-3 py-2">
                      {isSelected ? (
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="rounded-lg border border-[#d8a791] px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#f7e3db]"
                        >
                          Clear
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!isFinalized || alreadyAssigned}
                          onClick={() => handleSelectHall(row)}
                          className="rounded-lg bg-[#3c6a5a] px-3 py-2 text-sm font-semibold text-white hover:bg-[#2f5649] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {alreadyAssigned ? 'Assigned' : 'Assign'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
