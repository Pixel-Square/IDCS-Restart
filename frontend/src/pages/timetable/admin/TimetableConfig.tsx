import React, { useState } from 'react';
import { Trash2, Plus, Save, Edit2, X } from 'lucide-react';

interface Column {
  id: string;
  title: string;
  period: string;
  timing: string; // e.g., "9:00 AM - 10:00 AM"
}

interface Row {
  id: string;
  day: string;
}

interface TimetableTemplate {
  id: string;
  name: string;
  semesterType: 'odd' | 'even';
  columns: Column[];
  rows: Row[];
  createdAt: string;
}

interface TimetableConfigProps {
  templates: TimetableTemplate[];
  onSaveTemplate: (template: TimetableTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
}

const PERIODS = [
  'Period 1',
  'Period 2',
  'Period 3',
  'Period 4',
  'Period 5',
  'Period 6',
  'Period 7',
  'Period 8',
  'Period 9',
  'Period 10',
  'Period 11',
  'Period 12',
  'Period 13',
  'Period 14',
  'Period 15',
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Helper function to extract period number
const getPeriodNumber = (periodStr: string): number => {
  const match = periodStr.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

// Helper function to sort columns by period number
const sortColumnsByPeriod = (columns: Column[]): Column[] => {
  // Return columns in original order, don't sort - allow custom placement
  return [...columns];
};

// Helper function to get unique periods and remove duplicates for display
const getUniquePeriods = (columns: Column[]): Column[] => {
  const seen = new Set<number>();
  const unique: Column[] = [];
  
  for (const col of sortColumnsByPeriod(columns)) {
    const periodNum = getPeriodNumber(col.period);
    if (!seen.has(periodNum)) {
      seen.add(periodNum);
      unique.push(col);
    }
  }
  
  return unique;
};

export default function TimetableConfig({ templates, onSaveTemplate, onDeleteTemplate }: TimetableConfigProps) {
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [templateName, setTemplateName] = useState('');
  const [semesterType, setSemesterType] = useState<'odd' | 'even'>('odd');
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [nextColumnId, setNextColumnId] = useState(1);
  const [nextRowId, setNextRowId] = useState(1);

  const addColumn = () => {
    if (columns.length < 15) {
      const nextPeriodIndex = columns.length; // Auto-increment: 0->Period 1, 1->Period 2, etc.
      const newColumn: Column = {
        id: `col-${nextColumnId}`,
        title: `Column ${columns.length + 1}`,
        period: PERIODS[nextPeriodIndex],
        timing: '', // User must fill this in
      };
      setColumns([...columns, newColumn]);
      setNextColumnId(nextColumnId + 1);
    }
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
    setNextColumnId(1);
    setNextRowId(1);
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

    // Validate that all columns have timing information
    const missingTimings = columns.filter((col) => !col.timing.trim());
    if (missingTimings.length > 0) {
      alert(`⚠️ WARNING: Please fill in the timing for all ${missingTimings.length} column(s) that are missing timings before saving the template!`);
      return;
    }

    // Keep columns as-is without normalization - preserve user's selections
    // Break and Lunch will be kept as selected, periods will remain as selected
    const normalizedColumns = columns.map((col) => ({
      ...col,
    }));

    const template: TimetableTemplate = {
      id: editingTemplateId || `template-${Date.now()}`,
      name: templateName,
      semesterType,
      columns: normalizedColumns,
      rows,
      createdAt: new Date().toISOString(),
    };

    onSaveTemplate(template);
    alert(`Template "${templateName}" saved successfully!`);
    resetForm();
    setMode('list');
  };

  const handleEditTemplate = (template: TimetableTemplate) => {
    // Load columns as-is, preserving user's selections (Break, Lunch, periods)
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
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
          >
            <Plus size={20} />
            Create New Template
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">No templates created yet. Click "Create New Template" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow">
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
                    className="flex-1 flex items-center justify-center gap-1 bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 transition-colors text-sm"
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">{mode === 'create' ? 'Create New Template' : 'Edit Template'}</h2>
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

      {/* Template Name */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Template Name</label>
        <input
          type="text"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Template 1"
        />
      </div>

      {/* Semester Type Selection */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">Semester Type</label>
        <div className="flex gap-4">
          <button
            onClick={() => setSemesterType('odd')}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              semesterType === 'odd'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Odd Semester
          </button>
          <button
            onClick={() => setSemesterType('even')}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              semesterType === 'even'
                ? 'bg-orange-600 text-white shadow-lg'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Even Semester
          </button>
        </div>
      </div>
      <div className="mb-8 pb-8 border-b">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Columns (Periods)</h3>
          <span className="text-sm text-gray-600">
            {columns.length}/15
          </span>
        </div>

        {columns.length === 0 ? (
          <p className="text-gray-500 mb-4">No columns added yet.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {columns.map((column, index) => (
              <div 
                key={column.id} 
                className={`p-4 rounded-lg border ${
                  column.period === 'Break'
                    ? 'bg-red-50 border-red-200'
                    : column.period === 'Lunch'
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex gap-2 items-center mb-3">
                  <span className={`font-semibold w-12 ${
                    column.period === 'Break'
                      ? 'text-red-700'
                      : column.period === 'Lunch'
                      ? 'text-orange-700'
                      : 'text-gray-700'
                  }`}>
                    Col {index + 1}:
                  </span>
                  <select
                    value={column.period}
                    onChange={(e) => updateColumn(column.id, 'period', e.target.value)}
                    className={`flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 ${
                      column.period === 'Break'
                        ? 'bg-red-100 border-red-300 text-red-800 font-semibold focus:ring-red-500'
                        : column.period === 'Lunch'
                        ? 'bg-orange-100 border-orange-300 text-orange-800 font-semibold focus:ring-orange-500'
                        : 'border-gray-300 focus:ring-blue-500'
                    }`}
                  >
                    <option value="">-- Select Period --</option>
                    {PERIODS.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                    <option value="Break"> Break</option>
                    <option value="Lunch"> Lunch</option>
                  </select>
                  <button
                    onClick={() => removeColumn(column.id)}
                    className="bg-red-500 text-white p-2 rounded hover:bg-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="ml-12 flex gap-2 items-center">
                  <label className="text-sm font-medium text-gray-600 w-20">Timing:</label>
                  <input
                    type="text"
                    value={column.timing}
                    onChange={(e) => updateColumn(column.id, 'timing', e.target.value)}
                    placeholder="e.g., 9:00 AM - 10:00 AM"
                    className={`flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 ${
                      column.timing.trim()
                        ? 'border-gray-300 focus:ring-blue-500'
                        : 'border-red-300 focus:ring-red-500 bg-red-50'
                    }`}
                  />
                  {!column.timing.trim() && (
                    <span className="text-red-500 text-sm font-semibold">Required</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addColumn}
          disabled={columns.length >= 15}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-semibold ${
            columns.length >= 15
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          <Plus size={18} />
          Add Column
        </button>
      </div>

      {/* Rows Section */}
      <div className="mb-8 pb-8 border-b">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Rows (Days)</h3>
          <span className="text-sm text-gray-600">
            {rows.length}/7
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-gray-500 mb-4">No rows added yet.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {rows.map((row, index) => (
              <div key={row.id} className="flex gap-2 items-center bg-gray-50 p-3 rounded-lg">
                <span className="font-semibold text-gray-700 w-12">Row {index + 1}:</span>
                <input
                  type="text"
                  value={row.day}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded bg-gray-100 text-gray-700"
                />
                <button
                  onClick={() => removeRow(row.id)}
                  className="bg-red-500 text-white p-2 rounded hover:bg-red-600 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addRow}
          disabled={rows.length >= 7}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-semibold ${
            rows.length >= 7
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
        >
          <Plus size={18} />
          Add Row
        </button>
      </div>

      {/* Template Preview */}
      {columns.length > 0 && rows.length > 0 && (
        <div className="mb-8 pb-8 border-b">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Template Preview</h3>
          <div className="overflow-x-auto bg-gray-50 p-4 rounded-lg">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-300 bg-gray-200 px-3 py-2 font-bold text-sm">Day</th>
                  {columns.map((col) => (
                    <th 
                      key={col.id} 
                      className={`border border-gray-300 px-3 py-2 font-bold text-sm ${
                        col.period === 'Break'
                          ? 'bg-red-200 text-red-900'
                          : col.period === 'Lunch'
                          ? 'bg-orange-200 text-orange-900'
                          : 'bg-gray-200'
                      }`}
                    >
                      {col.period}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="border border-gray-300 bg-gray-100 px-3 py-2 font-bold text-sm">{row.day}</td>
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

      {/* Save Button */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => {
            resetForm();
            setMode('list');
          }}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveTemplate}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
        >
          <Save size={20} />
          Save Template
        </button>
      </div>
    </div>
  );
}
