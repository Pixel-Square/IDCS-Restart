import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Save, Edit2, X } from 'lucide-react';

function TimePickerDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmpm] = useState('AM');

  useEffect(() => {
    if (value) {
      const match = value.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        setHour(parseInt(match[1], 10).toString());
        setMinute(match[2]);
        setAmpm(match[3].toUpperCase());
      }
    }
  }, [value]);

  const handleChange = (h: string, m: string, ap: string) => {
    setHour(h);
    setMinute(m);
    setAmpm(ap);
    onChange(`${h}:${m} ${ap}`);
  };

  return (
    <div className="flex gap-1 items-center bg-white border border-gray-300 rounded-lg px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500 w-full sm:w-auto">
      <select value={hour} onChange={e => handleChange(e.target.value, minute, ampm)} className="bg-transparent text-sm text-gray-700 outline-none appearance-none cursor-pointer">
        {Array.from({length: 12}, (_, i) => i + 1).map(h => <option key={h} value={h.toString()}>{h}</option>)}
      </select>
      <span className="text-gray-500 font-medium">:</span>
      <select value={minute} onChange={e => handleChange(hour, e.target.value, ampm)} className="bg-transparent text-sm text-gray-700 outline-none appearance-none cursor-pointer">
        {Array.from({length: 60}, (_, i) => i).map(m => {
          const mStr = m.toString().padStart(2, '0');
          return <option key={mStr} value={mStr}>{mStr}</option>;
        })}
      </select>
      <select value={ampm} onChange={e => handleChange(hour, minute, e.target.value)} className="bg-transparent text-sm text-gray-700 outline-none appearance-none cursor-pointer ml-1">
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

function TimingSelector({ timing, onChange }: { timing: string, onChange: (val: string) => void }) {
  const [start, setStart] = useState('12:00 AM');
  const [end, setEnd] = useState('12:00 AM');

  useEffect(() => {
    if (timing) {
      const parts = timing.split('-');
      if (parts.length === 2) {
        setStart(parts[0].trim());
        setEnd(parts[1].trim());
      }
    }
  }, [timing]);

  const handleStartChange = (val: string) => {
    setStart(val);
    onChange(`${val} - ${end}`);
  };
  
  const handleEndChange = (val: string) => {
    setEnd(val);
    onChange(`${start} - ${val}`);
  };

  return (
    <div className="flex gap-2 items-center">
      <TimePickerDropdown value={start} onChange={handleStartChange} />
      <span className="text-gray-500 font-medium">to</span>
      <TimePickerDropdown value={end} onChange={handleEndChange} />
    </div>
  );
}

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

interface OddEvenSemTimetableProps {
  templates: SemesterTemplate[];
  onSaveTemplate: (template: SemesterTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
}

const PERIODS: string[] = Array.from({ length: 15 }, (_, i) => `Period ${i + 1}`);
const COLUMN_MAX = 10;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function OddEvenSemTimetable({ templates, onSaveTemplate, onDeleteTemplate }: OddEvenSemTimetableProps) {
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [templateName, setTemplateName] = useState('');
  const [semesterType, setSemesterType] = useState<'odd' | 'even'>('odd');
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [nextRowId, setNextRowId] = useState(1);

  // Column builder state
  const [newColumnPeriod, setNewColumnPeriod] = useState<string>('Period 1');
  const [newColumnTiming, setNewColumnTiming] = useState<string>('09:00 AM - 10:00 AM');

  const handleSemesterTypeChange = (newType: 'odd' | 'even') => {
    setSemesterType(newType);
  };

  const removeColumn = (id: string) => {
    setColumns(columns.filter((col) => col.id !== id));
  };

  const updateColumn = (id: string, field: keyof Column, value: string) => {
    setColumns(columns.map((col) => (col.id === id ? { ...col, [field]: value } : col)));
  };

  const addRow = () => {
    if (rows.length < 7) {
      const dayIndex = rows.length;
      const newRow: Row = {
        id: `row-${nextRowId}`,
        day: DAYS[dayIndex] || `Day ${dayIndex + 1}`,
      };
      setRows([...rows, newRow]);
      setNextRowId(nextRowId + 1);
    }
  };

  const removeRow = (id: string) => {
    setRows(rows.filter((row) => row.id !== id));
  };

  const resetForm = () => {
    setTemplateName('');
    setSemesterType('odd');
    setColumns([]);
    setRows([]);
    setEditingTemplateId(null);
    setNextRowId(1);
    setNewColumnPeriod('Period 1');
    setNewColumnTiming('09:00 AM - 10:00 AM');
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    if (columns.length === 0 || rows.length === 0) {
      alert('Please add at least one column and one row');
      return;
    }

    const missingTimings = columns.filter((col) => !col.timing.trim());
    if (missingTimings.length > 0) {
      alert(
        `⚠️ WARNING: Please fill in the timing for all ${missingTimings.length} period(s) that are missing timings before saving the template!`
      );
      return;
    }

    const template: SemesterTemplate = {
      id: editingTemplateId || `sem-template-${Date.now()}`,
      name: templateName,
      semesterType,
      columns,
      rows,
      createdAt: new Date().toISOString(),
    };

    onSaveTemplate(template);
    alert(`${semesterType.toUpperCase()} Semester Template "${templateName}" saved successfully!`);
    resetForm();
    setMode('list');
  };

  const handleEditTemplate = (template: SemesterTemplate) => {
    setTemplateName(template.name);
    setSemesterType(template.semesterType);
    setColumns(template.columns);
    setRows(template.rows);
    setEditingTemplateId(template.id);
    setMode('edit');
  };

  const startCreateMode = () => {
    resetForm();
    setMode('create');
  };

  if (mode === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            onClick={startCreateMode}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold shadow-md"
          >
            <Plus size={20} />
            Create New Template
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center border border-gray-100">
            <p className="text-gray-500 text-lg">No semester templates created yet. Click "Create New Template" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow border border-gray-100">
                <div className="flex items-center justify-between mb-2">
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
                <p className="text-sm text-gray-600 mb-3">
                  Columns: {template.columns.length} | Rows: {template.rows.length}
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Created: {new Date(template.createdAt).toLocaleDateString()}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="flex-1 flex items-center justify-center gap-1 bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 transition-colors text-sm font-semibold"
                  >
                    <Edit2 size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete template "${template.name}"?`)) {
                        onDeleteTemplate(template.id);
                      }
                    }}
                    className="bg-red-500 text-white px-3 py-2 rounded hover:bg-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
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
    <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {mode === 'create' ? 'Create New Template' : 'Edit Template'}
        </h2>
        <button
          onClick={() => {
            resetForm();
            setMode('list');
          }}
          className="text-gray-500 hover:text-gray-700"
        >
          <X size={24} />
        </button>
      </div>

      {/* Semester Type Selection */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">Semester Type</label>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleSemesterTypeChange('odd')}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              semesterType === 'odd'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Odd Semester
          </button>
          <button
            type="button"
            onClick={() => handleSemesterTypeChange('even')}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              semesterType === 'even'
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-200'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Even Semester
          </button>
        </div>
      </div>

      {/* Template Name */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Template Name</label>
        <input
          type="text"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          placeholder="e.g., Template 1"
        />
      </div>

      {/* Columns Section */}
      <div className="mb-8 pb-8 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Columns (Periods / Break / Lunch)</h3>
          <span className="text-sm font-semibold text-gray-600">{columns.length}/{COLUMN_MAX} columns</span>
        </div>

        {/* Add Column */}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
          <h4 className="font-semibold text-gray-900 mb-3">Add Column (up to {COLUMN_MAX})</h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Column Type</label>
              <select
                value={newColumnPeriod}
                onChange={(e) => setNewColumnPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="Break">Break</option>
                <option value="Lunch">Lunch</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Timing</label>
              <TimingSelector
                timing={newColumnTiming}
                onChange={setNewColumnTiming}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (columns.length >= COLUMN_MAX) {
                    alert(`You can add maximum ${COLUMN_MAX} columns.`);
                    return;
                  }

                  if (!newColumnPeriod) {
                    alert('Please select a column type');
                    return;
                  }

                  const isPeriod = newColumnPeriod !== 'Break' && newColumnPeriod !== 'Lunch';
                  if (isPeriod) {
                    const alreadyExists = columns.some((c) => c.period === newColumnPeriod);
                    if (alreadyExists) {
                      alert(`${newColumnPeriod} already exists in this template. Period duplicates are not allowed.`);
                      return;
                    }
                  }

                  if (!newColumnTiming.trim()) {
                    alert('Please set timing (start and end) for the column before adding.');
                    return;
                  }

                  const newCol: Column = {
                    id: `col-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    title: `Column ${columns.length + 1}`,
                    period: newColumnPeriod,
                    timing: newColumnTiming,
                  };

                  setColumns((prev) => [...prev, newCol]);
                  setNewColumnPeriod('Period 1');
                  setNewColumnTiming('09:00 AM - 10:00 AM');
                }}
                disabled={columns.length >= COLUMN_MAX}
                className={`w-full md:w-auto px-5 py-2 rounded-lg font-semibold transition-colors shadow ${
                  columns.length >= COLUMN_MAX
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Plus size={18} className="inline-block mr-2" />
                Add
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500 italic">
            Tip: Add <b>Break</b> or <b>Lunch</b> at any position by ordering the columns list as you add them.
          </div>
        </div>

        {columns.length === 0 ? (
          <p className="text-gray-500 mb-4">No columns configured yet.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {columns.map((column, index) => (
              <div
                key={column.id}
                className={`p-4 rounded-lg border-2 ${
                  column.period === 'Break'
                    ? 'bg-red-50/50 border-red-200'
                    : column.period === 'Lunch'
                    ? 'bg-orange-50/50 border-orange-200'
                    : 'bg-gray-50/50 border-gray-200'
                }`}
              >
                <div className="flex gap-2 items-center mb-3">
                  <span className="font-semibold text-gray-700 w-16">Col {index + 1}:</span>
                  <span
                    className={`flex-1 px-3 py-2 font-semibold rounded ${
                      column.period === 'Break'
                        ? 'bg-red-100 text-red-800'
                        : column.period === 'Lunch'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {column.period}
                  </span>
                  <button
                    onClick={() => removeColumn(column.id)}
                    className="bg-red-500 text-white p-2 rounded hover:bg-red-600 transition-colors shadow-sm"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="ml-16 flex flex-wrap gap-2 items-center">
                  <label className="text-sm font-medium text-gray-600 w-20">Timing:</label>
                  <TimingSelector
                    timing={column.timing}
                    onChange={(val) => updateColumn(column.id, 'timing', val)}
                  />
                  {!column.timing.trim() && (
                    <span className="text-red-500 text-sm font-semibold">Required</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">ℹ️ Note:</span> Columns are manually configured.
            Add <b>Period 1..15</b>, <b>Break</b>, and <b>Lunch</b> in the order you want.
          </p>
        </div>
      </div>

      {/* Rows Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Rows (Days)</h3>
          <span className="text-sm font-semibold text-gray-600">{rows.length}/7</span>
        </div>

        {rows.length === 0 ? (
          <p className="text-gray-500 mb-4">No rows added yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {rows.map((row) => (
              <div key={row.id} className="flex gap-2 items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                <input
                  type="text"
                  value={row.day}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-100 text-gray-700"
                />
                <button
                  onClick={() => removeRow(row.id)}
                  className="bg-red-500 text-white p-2 rounded hover:bg-red-600 transition-colors shadow-sm"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= 7}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors shadow ${
            rows.length >= 7
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <Plus size={18} />
          Add Row
        </button>
      </div>

      {/* Template Preview */}
      {columns.length > 0 && rows.length > 0 && (
        <div className="mb-8 pb-8 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Template Preview</h3>
          <div className="overflow-x-auto bg-gray-50 p-4 rounded-lg border border-gray-200">
            <table className="border-collapse w-full min-w-[600px]">
              <thead>
                <tr>
                  <th className="border border-gray-300 bg-gray-200 px-3 py-2 font-bold text-sm text-left w-32">Day</th>
                  {columns.map((col) => (
                    <th 
                      key={col.id} 
                      className={`border border-gray-300 px-3 py-2 font-bold text-sm text-center ${
                        col.period === 'Break'
                          ? 'bg-red-200 text-red-900'
                          : col.period === 'Lunch'
                          ? 'bg-orange-200 text-orange-900'
                          : 'bg-gray-200'
                      }`}
                    >
                      <div>{col.period}</div>
                      <div className="text-[10px] text-gray-500 font-normal mt-0.5">{col.timing}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="border border-gray-300 bg-gray-100 px-3 py-2 font-bold text-sm text-left">{row.day}</td>
                    {columns.map((col) => (
                      <td 
                        key={col.id} 
                        className={`border border-gray-300 px-3 py-2 h-12 ${
                          col.period === 'Break'
                            ? 'bg-red-50'
                            : col.period === 'Lunch'
                            ? 'bg-orange-50'
                            : 'bg-white'
                        }`}
                      ></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Save / Cancel Buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => {
            resetForm();
            setMode('list');
          }}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveTemplate}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-semibold shadow-md"
        >
          <Save size={18} />
          Save Template
        </button>
      </div>
    </div>
  );
}
