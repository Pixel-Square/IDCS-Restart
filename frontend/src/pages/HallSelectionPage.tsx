import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { kvHydrate, kvSave } from '../utils/coeKvStore';

type HallSelectionRow = {
  id: number;
  hallNumber: string;
  building: string;
  floor: string;
  rows: number;
  cols: number;
  pattern?: string;
  notes?: string;
};

type FacultySelection = {
  hallId: number;
  hallNumber: string;
  building: string;
  floor: string;
  selectedByEmail: string;
  selectedByName: string;
  selectedAt: string;
};

type HallSelectionPageProps = {
  user: { email?: string; username?: string; roles?: string[] } | null;
};

const PLAN_STORAGE_KEY = 'coe-hall-allocation-plan';
const FINALIZED_STORAGE_KEY = 'coe-hall-allocation-finalized';
const FACULTY_SELECTIONS_KEY = 'coe-faculty-hall-selections';

function readSavedPlan(): { rows?: HallSelectionRow[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { rows?: HallSelectionRow[] };
  } catch {
    return null;
  }
}

function readFinalized(): boolean {
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

export default function HallSelectionPage({ user }: HallSelectionPageProps) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<HallSelectionRow[]>([]);
  const [selections, setSelections] = useState<FacultySelection[]>([]);
  const [isFinalized, setIsFinalized] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rolesUpper = useMemo(
    () => (user?.roles || []).map((role) => (role || '').toString().toUpperCase()),
    [user?.roles],
  );

  const isAdmin = rolesUpper.includes('ADMIN') || rolesUpper.includes('IQAC') || rolesUpper.includes('HOD');
  const currentEmail = String(user?.email || '').toLowerCase().trim();
  const currentName = String(user?.username || '').trim();

  useEffect(() => {
    let mounted = true;

    const refreshState = async () => {
      try {
        const [backendPlan, backendFinalized, backendSelections] = await Promise.all([
          kvHydrate(PLAN_STORAGE_KEY),
          kvHydrate(FINALIZED_STORAGE_KEY),
          kvHydrate(FACULTY_SELECTIONS_KEY),
        ]);

        if (!mounted) return;

        const savedPlan = backendPlan ?? readSavedPlan();
        setRows(savedPlan?.rows ?? []);
        setSelections(backendSelections ?? readFacultySelections());
        setIsFinalized(
          Boolean(backendFinalized === true) || readFinalized() || Boolean(savedPlan?.rows?.length),
        );
      } catch {
        if (!mounted) return;
        const savedPlan = readSavedPlan();
        setRows(savedPlan?.rows ?? []);
        setSelections(readFacultySelections());
        setIsFinalized(readFinalized());
      }
    };

    refreshState();

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === FINALIZED_STORAGE_KEY ||
        event.key === PLAN_STORAGE_KEY ||
        event.key === FACULTY_SELECTIONS_KEY
      ) {
        refreshState();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      mounted = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const currentSelection = useMemo(
    () => selections.find((selection) => selection.selectedByEmail.toLowerCase() === currentEmail),
    [selections, currentEmail],
  );

  const selectedHallIds = useMemo(() => selections.map((selection) => selection.hallId), [selections]);

  const floorLocks = useMemo(
    () => new Set(selections.map((selection) => selection.floor)),
    [selections],
  );

  const availableRows = useMemo(
    () => rows.map((row) => ({
      ...row,
      capacity: row.rows * row.cols,
      selectedBy: selections.find((sel) => sel.hallId === row.id),
    })),
    [rows, selections],
  );

  const saveSelections = (nextSelections: FacultySelection[]) => {
    setSelections(nextSelections);
    writeFacultySelections(nextSelections);
  };

  const handleSelectHall = (row: HallSelectionRow) => {
    if (!isFinalized) {
      setMessage('Hall selection is not available until COE finalizes the hall list.');
      return;
    }

    const alreadySelectedOnFloor = selections.some((item) => item.floor === row.floor && item.selectedByEmail !== currentEmail);
    if (alreadySelectedOnFloor) {
      setMessage(`Another faculty member already selected a hall on floor ${row.floor}. Please choose a different floor.`);
      return;
    }

    const existingHallSelection = selections.find((item) => item.hallId === row.id);
    if (existingHallSelection && existingHallSelection.selectedByEmail !== currentEmail) {
      setMessage(`Hall ${row.hallNumber} is already assigned to ${existingHallSelection.selectedByName || existingHallSelection.selectedByEmail}.`);
      return;
    }

    const nextSelection: FacultySelection = {
      hallId: row.id,
      hallNumber: row.hallNumber,
      building: row.building,
      floor: row.floor,
      selectedByEmail: currentEmail,
      selectedByName: currentName || currentEmail,
      selectedAt: new Date().toISOString(),
    };

    const nextSelections = [
      ...selections.filter((item) => item.hallId !== row.id && item.selectedByEmail !== currentEmail),
      nextSelection,
    ];

    saveSelections(nextSelections);
    setMessage(`Selected ${row.hallNumber} on ${row.floor}.`);
  };

  const clearMySelection = () => {
    const nextSelections = selections.filter((item) => item.selectedByEmail.toLowerCase() !== currentEmail);
    saveSelections(nextSelections);
    setMessage('Your hall selection has been cleared.');
  };

  const handleRemoveSelection = (hallId: number) => {
    const nextSelections = selections.filter((item) => item.hallId !== hallId);
    saveSelections(nextSelections);
    setMessage('Selection removed.');
  };

  const handleReassign = async (hallId: number) => {
    const nextSelections = [...selections];
    const index = nextSelections.findIndex((item) => item.hallId === hallId);
    if (index === -1) return;

    const current = nextSelections[index];
    const assignee = window.prompt('Enter faculty email or username to assign this hall to:', current.selectedByEmail || current.selectedByName);
    if (!assignee) {
      return;
    }

    const normalized = assignee.trim();
    if (!normalized) return;

    nextSelections[index] = {
      ...current,
      selectedByEmail: normalized.toLowerCase(),
      selectedByName: normalized,
      selectedAt: new Date().toISOString(),
    };
    saveSelections(nextSelections);
    setMessage(`Hall ${current.hallNumber} reassigned to ${normalized}.`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-4 px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-[#d9dfe5] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Hall Selection</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Choose one hall for your invigilation duties. Each faculty may select only one hall, and no two selections are allowed on the same floor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to Dashboard
          </button>
        </div>

        {message ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            {message}
          </div>
        ) : null}
      </div>

      {!isFinalized ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-slate-800 shadow-sm">
          Hall selection will open once the COE hall list is finalized.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Your Selection</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your selection is stored locally in the browser. If you are an admin, you can manage all faculty selections below.
          </p>
          <div className="mt-4">
            {currentSelection ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-700"><strong>Hall:</strong> {currentSelection.hallNumber}</p>
                <p className="mt-1 text-sm text-slate-700"><strong>Building:</strong> {currentSelection.building}</p>
                <p className="mt-1 text-sm text-slate-700"><strong>Floor:</strong> {currentSelection.floor}</p>
                <p className="mt-1 text-sm text-slate-700"><strong>Selected at:</strong> {new Date(currentSelection.selectedAt).toLocaleString()}</p>
                <button
                  type="button"
                  onClick={clearMySelection}
                  className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Clear My Selection
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                No hall selected yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Assigned Halls</h2>
              <p className="mt-2 text-sm text-slate-600">Current selections by faculty.</p>
            </div>
            <div className="text-right text-sm text-slate-500">
              {selections.length} selection{selections.length === 1 ? '' : 's'}
            </div>
          </div>

          {selections.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              No halls have been assigned yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm text-slate-700">
                <thead>
                  <tr className="text-left text-slate-900">
                    <th className="px-3 py-2">Hall</th>
                    <th className="px-3 py-2">Building</th>
                    <th className="px-3 py-2">Floor</th>
                    <th className="px-3 py-2">Faculty</th>
                    <th className="px-3 py-2">Assigned At</th>
                    {isAdmin ? <th className="px-3 py-2">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {selections.map((selection) => (
                    <tr key={`${selection.hallId}-${selection.selectedByEmail}`} className="border-t border-slate-200">
                      <td className="px-3 py-2">{selection.hallNumber}</td>
                      <td className="px-3 py-2">{selection.building}</td>
                      <td className="px-3 py-2">{selection.floor}</td>
                      <td className="px-3 py-2">{selection.selectedByName || selection.selectedByEmail}</td>
                      <td className="px-3 py-2">{new Date(selection.selectedAt).toLocaleString()}</td>
                      {isAdmin ? (
                        <td className="px-3 py-2 space-x-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveSelection(selection.hallId)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReassign(selection.hallId)}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Reassign
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Available Halls</h2>
            <p className="mt-2 text-sm text-slate-600">Select one hall from the list. Floor restrictions apply.</p>
          </div>
          <div className="text-sm font-medium text-slate-700">
            Floor lock: {Array.from(floorLocks).join(', ') || 'None'}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">
            No hall list is available yet. Please wait for COE to finalize the hall allocation and save the plan.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm text-slate-700">
              <thead>
                <tr className="text-left text-slate-900">
                  <th className="px-3 py-2">Hall</th>
                  <th className="px-3 py-2">Building</th>
                  <th className="px-3 py-2">Floor</th>
                  <th className="px-3 py-2">Capacity</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {availableRows.map((row) => {
                  const selection = row.selectedBy;
                  const isMyHall = selection?.selectedByEmail.toLowerCase() === currentEmail;
                  const isTaken = Boolean(selection) && !isMyHall;
                  const blockedByFloor = Boolean(selections.some((item) => item.floor === row.floor && item.selectedByEmail.toLowerCase() !== currentEmail));
                  return (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="px-3 py-2">{row.hallNumber}</td>
                      <td className="px-3 py-2">{row.building}</td>
                      <td className="px-3 py-2">{row.floor}</td>
                      <td className="px-3 py-2">{row.capacity}</td>
                      <td className="px-3 py-2">
                        {isMyHall ? 'Selected by you' : isTaken ? `Assigned to ${selection?.selectedByName || selection?.selectedByEmail}` : 'Open'}
                      </td>
                      <td className="px-3 py-2">
                        {isMyHall ? (
                          <button
                            type="button"
                            onClick={clearMySelection}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Clear
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!isFinalized || isTaken || blockedByFloor}
                            onClick={() => handleSelectHall(row)}
                            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                          >
                            {isTaken ? 'Taken' : blockedByFloor ? 'Floor Blocked' : 'Select'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
