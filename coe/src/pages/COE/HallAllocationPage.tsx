import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { kvHydrate, kvSave } from '../../utils/coeKvStore';

type SeatingPattern = 'Straight' | 'Zigzag' | 'Alternate Zigzag' | 'U-Shape' | 'Circle' | 'Clustered' | 'Mixed';

type HallAllocationRow = {
  id: number;
  hallNumber: string;
  building: string;
  floor: string;
  maxCapacity: number;
  rows: number;
  cols: number;
  pattern: SeatingPattern;
  notes: string;
};

const STORAGE_KEY = 'coe-hall-allocation-data';
const PATTERN_OPTIONS: SeatingPattern[] = ['Straight', 'Zigzag', 'Alternate Zigzag', 'U-Shape', 'Circle', 'Clustered', 'Mixed'];

const createRow = (overrides: Partial<HallAllocationRow> = {}): HallAllocationRow => {
  const row = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    hallNumber: '',
    building: '',
    floor: '',
    rows: 1,
    cols: 1,
    pattern: 'Straight' as SeatingPattern,
    notes: '',
    ...overrides,
  };

  const rowsValue = parseIntegerValue(row.rows);
  const colsValue = parseIntegerValue(row.cols);

  return {
    id: Number(row.id) || Date.now(),
    hallNumber: String(row.hallNumber || ''),
    building: String(row.building || ''),
    floor: String(row.floor || ''),
    rows: rowsValue,
    cols: colsValue,
    pattern: (row.pattern as SeatingPattern) || 'Straight',
    notes: String(row.notes || ''),
    maxCapacity: Math.max(0, rowsValue * colsValue),
  };
};

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const parsePattern = (value: unknown): SeatingPattern => {
  if (typeof value !== 'string') return 'Straight';
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('alternate') && normalized.includes('zig')) return 'Alternate Zigzag';
  if (normalized.includes('zig')) return 'Zigzag';
  if (normalized.includes('u') || normalized.includes('shape')) return 'U-Shape';
  if (normalized.includes('circle') || normalized.includes('round')) return 'Circle';
  if (normalized.includes('cluster')) return 'Clustered';
  if (normalized.includes('mixed')) return 'Mixed';
  return 'Straight';
};

const parseIntegerValue = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
};

const isDecimalInput = (value: unknown): boolean => {
  if (typeof value === 'number') return !Number.isInteger(value);
  if (typeof value === 'string') return /[.eE]/.test(value);
  return false;
};

const parseCapacity = (value: unknown, rowCount: number, colCount: number): number => {
  const rows = parseIntegerValue(rowCount);
  const cols = parseIntegerValue(colCount);
  if (rows > 0 && cols > 0) return rows * cols;
  return parseIntegerValue(value);
};

export default function HallAllocationPage() {
  const [rows, setRows] = useState<HallAllocationRow[]>(() => {
    if (typeof window === 'undefined') return [createRow({ hallNumber: 'LHA303', rows: 7, cols: 2, pattern: 'Straight' })];

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as HallAllocationRow[];
        if (Array.isArray(parsed) && parsed.length) {
          return parsed.map((row) => createRow(row));
        }
      }
    } catch {
      // Ignore invalid local storage payloads and fall back to defaults.
    }

    return [createRow({ hallNumber: 'A101', rows: 7, cols: 2, pattern: 'Straight' })];
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const backendData = await kvHydrate(STORAGE_KEY);
        if (active && Array.isArray(backendData) && backendData.length > 0) {
          setRows(backendData.map((row: any) => createRow(row)));
        }
      } catch {
        // ignore errors
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      kvSave(STORAGE_KEY, rows);
    }
  }, [rows]);

  const summary = useMemo(() => {
    const totalCapacity = rows.reduce((sum, row) => sum + row.maxCapacity, 0);
    const patternCounts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.pattern] = (acc[row.pattern] || 0) + 1;
      return acc;
    }, {});

    return {
      hallCount: rows.length,
      totalCapacity,
      patternCounts,
    };
  }, [rows]);

  const updateRow = (id: number, field: keyof HallAllocationRow, value: string | number) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        if (field === 'rows' || field === 'cols') {
          const next = { ...row, [field]: parseIntegerValue(value) };
          return { ...next, maxCapacity: Math.max(0, next.rows * next.cols) };
        }
        return { ...row, [field]: value };
      })
    );
  };

  const addRow = () => setRows((current) => [...current, createRow()]);

  const removeRow = (id: number) => {
    setRows((current) => current.filter((row) => row.id !== id));
    setMessage('Removed the selected hall entry.');
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const parsedRows = rawRows
        .map((row, index) => {
          const hallNumberEntry = Object.entries(row).find(([key]) => normalizeKey(key) === 'hallnumber' || normalizeKey(key) === 'hallno' || normalizeKey(key) === 'hall');
          const buildingEntry = Object.entries(row).find(([key]) => normalizeKey(key) === 'building' || normalizeKey(key) === 'block' || normalizeKey(key) === 'buildingname');
          const floorEntry = Object.entries(row).find(([key]) => normalizeKey(key) === 'floor' || normalizeKey(key) === 'floorno' || normalizeKey(key) === 'level');
          const rowsEntry = Object.entries(row).find(([key]) => normalizeKey(key) === 'rows' || normalizeKey(key) === 'rowcount' || normalizeKey(key) === 'row');
          const colsEntry = Object.entries(row).find(([key]) => normalizeKey(key) === 'cols' || normalizeKey(key) === 'columns' || normalizeKey(key) === 'columncount' || normalizeKey(key) === 'col');
          const patternEntry = Object.entries(row).find(([key]) => normalizeKey(key) === 'seatingpattern' || normalizeKey(key) === 'allocationpattern' || normalizeKey(key) === 'pattern');

          const hallNumber = hallNumberEntry ? String(row[hallNumberEntry[0]] ?? '').trim() : '';
          const rowValue = rowsEntry ? row[rowsEntry[0]] : 0;
          const colValue = colsEntry ? row[colsEntry[0]] : 0;
          if (isDecimalInput(rowValue) || isDecimalInput(colValue)) {
            if (typeof window !== 'undefined') {
              window.alert('Rows and Columns cannot be decimal points.');
            }
            throw new Error('Invalid decimal values in rows or columns.');
          }
          const rowCount = parseIntegerValue(rowValue);
          const colCount = parseIntegerValue(colValue);
          const pattern = patternEntry ? parsePattern(row[patternEntry[0]]) : 'Straight';

          if (!hallNumber && (!rowCount || !colCount)) {
            return null;
          }

          return createRow({
            id: Date.now() + index,
            hallNumber,
            building: buildingEntry ? String(row[buildingEntry[0]] ?? '').trim() : '',
            floor: floorEntry ? String(row[floorEntry[0]] ?? '').trim() : '',
            rows: rowCount || 1,
            cols: colCount || 1,
            pattern,
            notes: `Imported from ${file.name}`,
          });
        })
        .filter((row): row is HallAllocationRow => Boolean(row));

      if (!parsedRows.length) {
        throw new Error('No valid hall rows were found in the selected file.');
      }

      setRows(parsedRows);
      setMessage(`Imported ${parsedRows.length} hall entries from ${file.name}.`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unable to import the selected Excel file.';
      setMessage(messageText);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const downloadTemplate = () => {
    const templateRows = [
['Hall Number', 'Building', 'Floor', 'Rows', 'Columns', 'Seating Pattern', 'Notes'],
    ['A101', 'Main Block', 'Ground Floor', 7, 2, 'Straight', 'Example hall'],
    ['B204', 'Annex', 'First Floor', 8, 3, 'Zigzag', 'Second example'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(templateRows);
    const workbook = XLSX.utils.book_new();

    const patternList = PATTERN_OPTIONS.join(',');
    worksheet['!dataValidation'] = [
      {
        sqref: 'F2:F100',
        type: 'list',
        formula1: `"${patternList}"`,
        showDropDown: true,
        allowBlank: true,
        showInputMessage: true,
        promptTitle: 'Seating Pattern',
        prompt: 'Choose a seating pattern from the dropdown list.',
      },
      {
        sqref: 'C2:C100',
        type: 'whole',
        operator: 'between',
        formula1: '1',
        formula2: '100',
        showInputMessage: true,
        promptTitle: 'Rows',
        prompt: 'Rows must be a whole number.',
      },
      {
        sqref: 'D2:D100',
        type: 'whole',
        operator: 'between',
        formula1: '1',
        formula2: '100',
        showInputMessage: true,
        promptTitle: 'Columns',
        prompt: 'Columns must be a whole number.',
      },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hall Allocation');
    XLSX.writeFile(workbook, 'hall-allocation-template.xlsx');
    setMessage('Downloaded a starter Excel template for hall allocation.');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-2">
      <div className="rounded-2xl border border-[#deb9ac] bg-white/95 p-6 shadow-[0_30px_45px_-30px_rgba(111,29,52,0.55)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#5b1a30]">Hall Allocation</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#6a4a40]">
              Upload a spreadsheet, download a ready-to-use template, or maintain the hall list manually. You can also select a seating pattern for each hall to guide exam placement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-[#6f1d34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#591729]">
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
              {isUploading ? 'Importing...' : 'Upload Excel'}
            </label>
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-lg border border-[#d8a791] bg-[#fff5ee] px-4 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fce8dc]"
            >
              Download Template
            </button>
            <button
              type="button"
              onClick={() => {
                setRows([createRow({ hallNumber: '', maxCapacity: 0, pattern: 'Straight' })]);
                setMessage('Reset to a single example hall entry.');
              }}
              className="rounded-lg border border-[#d8a791] bg-white px-4 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#fbeee8]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => navigate('/coe/hall-allocation/plan', { state: { rows } })}
              className="rounded-lg bg-[#3c6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f5649]"
            >
              Continue to Hall Plan
            </button>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-lg border border-[#efd7cc] bg-[#fff9f4] px-3 py-2 text-sm text-[#7a2038]">
            {message}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-5 shadow-sm">
          <p className="text-sm font-semibold text-[#5b1a30]">Total Halls</p>
          <p className="mt-2 text-3xl font-bold text-[#7a2038]">{summary.hallCount}</p>
        </div>
        <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-5 shadow-sm">
          <p className="text-sm font-semibold text-[#5b1a30]">Total Capacity</p>
          <p className="mt-2 text-3xl font-bold text-[#7a2038]">{summary.totalCapacity}</p>
        </div>
        <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-5 shadow-sm">
          <p className="text-sm font-semibold text-[#5b1a30]">Allocation Patterns</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(summary.patternCounts).map(([pattern, count]) => (
              <span key={pattern} className="rounded-full bg-[#f7e8df] px-3 py-1 text-sm font-medium text-[#7a2038]">
                {pattern}: {count}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#ead7d0] bg-white/95 p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#5b1a30]">Hall List</h2>
            <p className="text-sm text-[#6a4a40]">Add halls manually and choose a suitable seating arrangement.</p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg bg-[#b2472e] px-3 py-2 text-sm font-semibold text-white hover:bg-[#913925]"
          >
            Add Hall
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-[#7a2038]">
                <th className="px-3 py-2">Hall Number</th>
                <th className="px-3 py-2">Building</th>
                <th className="px-3 py-2">Floor</th>
                <th className="px-3 py-2">Rows</th>
                <th className="px-3 py-2">Columns</th>
                <th className="px-3 py-2">Maximum Capacity</th>
                <th className="px-3 py-2">Seating Pattern</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="rounded-lg bg-[#fcf7f4]">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.hallNumber}
                      onChange={(event) => updateRow(row.id, 'hallNumber', event.target.value)}
                      className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
                      placeholder="e.g. LHA303"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.building}
                      onChange={(event) => updateRow(row.id, 'building', event.target.value)}
                      className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
                      placeholder="e.g. Main Block"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.floor}
                      onChange={(event) => updateRow(row.id, 'floor', event.target.value)}
                      className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
                      placeholder="e.g. Ground Floor"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={row.rows}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw.includes('.') || raw.toLowerCase().includes('e')) {
                          setMessage('Rows and Columns cannot be in decimal points.');
                          return;
                        }
                        updateRow(row.id, 'rows', raw);
                      }}
                      onKeyDown={(event) => {
                        if (['e', 'E', '.', '+', '-'].includes(event.key)) {
                          event.preventDefault();
                        }
                      }}
                      className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
                      placeholder="1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={row.cols}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw.includes('.') || raw.toLowerCase().includes('e')) {
                          setMessage('Rows and Columns cannot be in decimal points.');
                          return;
                        }
                        updateRow(row.id, 'cols', raw);
                      }}
                      onKeyDown={(event) => {
                        if (['e', 'E', '.', '+', '-'].includes(event.key)) {
                          event.preventDefault();
                        }
                      }}
                      className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
                      placeholder="1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={row.maxCapacity}
                      className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
                      placeholder="0"
                      disabled
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.pattern}
                      onChange={(event) => updateRow(row.id, 'pattern', event.target.value)}
                      className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
                    >
                      {PATTERN_OPTIONS.map((pattern) => (
                        <option key={pattern} value={pattern}>
                          {pattern}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(event) => updateRow(row.id, 'notes', event.target.value)}
                      className="w-full rounded-lg border border-[#e1c6b8] bg-white px-3 py-2"
                      placeholder="Optional remarks"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded-lg border border-[#d8a791] px-3 py-2 text-sm font-semibold text-[#7a2038] hover:bg-[#f7e3db]"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
