import React, { useState } from 'react';
import { Save, ArrowLeft } from 'lucide-react';

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
  columns: Column[];
  rows: Row[];
  createdAt: string;
}

interface TimetableData {
  [key: string]: string;
}

interface TimetableCreatorProps {
  templates: TimetableTemplate[];
}

const PERIODS = [
  'Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5',
  'Period 6', 'Period 7', 'Period 8', 'Period 9', 'Period 10',
  'Period 11', 'Period 12', 'Period 13', 'Period 14', 'Period 15',
];

// Helper function to extract period number
const getPeriodNumber = (periodStr: string): number => {
  const match = periodStr.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

// Helper function to normalize template periods
const normalizeTemplateColumns = (columns: Column[]): Column[] => {
  return columns.map((col, index) => {
    const periodIndex = Math.min(index, PERIODS.length - 1);
    return {
      ...col,
      period: PERIODS[periodIndex],
    };
  });
};

// Helper function to sort columns by period number
const sortColumnsByPeriod = (columns: Column[]): Column[] => {
  return [...columns].sort((a, b) => getPeriodNumber(a.period) - getPeriodNumber(b.period));
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

export default function TimetableCreator({ templates }: TimetableCreatorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TimetableTemplate | null>(null);
  const [timetableData, setTimetableData] = useState<TimetableData>({});
  const [timetableName, setTimetableName] = useState('');

  const handleTemplateSelect = (template: TimetableTemplate) => {
    // Normalize columns to ensure they start from Period 1
    const normalizedTemplate = {
      ...template,
      columns: normalizeTemplateColumns(template.columns),
    };
    setSelectedTemplate(normalizedTemplate);
    setTimetableData({});
    setTimetableName('');
  };

  const handleCellChange = (rowId: string, colId: string, value: string) => {
    const key = `${rowId}-${colId}`;
    setTimetableData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveTimetable = () => {
    if (!timetableName.trim()) {
      alert('Please enter a timetable name');
      return;
    }

    const timetable = {
      id: `timetable-${Date.now()}`,
      name: timetableName,
      template: selectedTemplate,
      data: timetableData,
      createdAt: new Date().toISOString(),
    };

    console.log('Saving timetable:', timetable);
    alert(`Timetable "${timetableName}" saved successfully!`);
    
    // Reset form
    setSelectedTemplate(null);
    setTimetableData({});
    setTimetableName('');
  };

  if (!selectedTemplate) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Select Template to Create Timetable</h2>

        {templates.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg mb-4">No templates available.</p>
            <p className="text-gray-600">
              Please create templates in the <strong>Config</strong> section first.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow cursor-pointer hover:border-blue-500 border-2 border-transparent"
              >
                <h3 className="font-bold text-lg text-gray-900 mb-2">{template.name}</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Columns: {template.columns.length} | Rows: {template.rows.length}
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Created: {new Date(template.createdAt).toLocaleDateString()}
                </p>

                {/* Template Preview */}
                <div className="bg-gray-50 p-3 rounded mb-4 text-xs border border-gray-200">
                  <div className="font-semibold mb-2 text-gray-900">Structure:</div>
                  <div className="space-y-2">
                    <div>
                      <div className="font-bold text-gray-700 mb-1">Days ({template.rows.length}):</div>
                      <div className="flex flex-wrap gap-1">
                        {template.rows.map((r) => (
                          <span key={r.id} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                            {r.day}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-gray-700 mb-1">Periods ({getUniquePeriods(template.columns).length}):</div>
                      <div className="flex flex-wrap gap-1">
                        {getUniquePeriods(template.columns).map((c) => (
                          <span key={c.id} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                            {c.period}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleTemplateSelect(template)}
                  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors font-semibold"
                >
                  Use This Template
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setSelectedTemplate(null)}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold"
        >
          <ArrowLeft size={20} />
          Back to Templates
        </button>
      </div>

      <div className="mb-8 pb-8 border-b">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Timetable from: {selectedTemplate.name}</h2>
        <p className="text-gray-600">
          Template Configuration: {selectedTemplate.columns.length} periods × {selectedTemplate.rows.length} days
        </p>
      </div>

      {/* Timetable Name */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Timetable Name</label>
        <input
          type="text"
          value={timetableName}
          onChange={(e) => setTimetableName(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., First Year Batch A"
        />
      </div>

      {/* Timetable Grid */}
      <div className="mb-8 pb-8 border-b">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Fill in the Timetable</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gradient-to-b from-blue-600 to-blue-700 text-white px-0 py-0 font-bold text-sm w-24 relative overflow-hidden" style={{ height: '80px' }}>
                  {/* Diagonal divider from top-left to bottom-right */}
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <line x1="0" y1="0" x2="100" y2="100" stroke="white" strokeWidth="1.5" opacity="0.5" />
                  </svg>
                  
                  {/* Period text - top right */}
                  <div className="absolute top-2 right-3 text-xs font-bold text-white">Period</div>
                  
                  {/* Day text - bottom left */}
                  <div className="absolute bottom-2 left-2 text-xs font-bold text-white">Day</div>
                </th>
                {sortColumnsByPeriod(selectedTemplate.columns).map((col) => (
                  <th
                    key={col.id}
                    className="border border-gray-300 bg-gradient-to-b from-blue-500 to-blue-600 text-white px-4 py-3 font-bold text-sm min-w-40"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div className="font-bold text-base">{col.period}</div>
                      <div className="text-xs font-semibold text-blue-100 border-t border-blue-400 pt-1 w-full text-center">
                        {col.timing || 'No timing set'}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedTemplate.rows.map((row, rowIndex) => (
                <tr key={row.id}>
                  <td className="border border-gray-300 bg-blue-50 px-4 py-3 font-bold text-sm text-gray-800">
                    {row.day}
                  </td>
                  {sortColumnsByPeriod(selectedTemplate.columns).map((col) => {
                    const key = `${row.id}-${col.id}`;
                    return (
                      <td key={col.id} className="border border-gray-300 p-2">
                        <input
                          type="text"
                          value={timetableData[key] || ''}
                          onChange={(e) => handleCellChange(row.id, col.id, e.target.value)}
                          className="w-full h-24 p-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                          placeholder={`${row.day}\n${col.period}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => setSelectedTemplate(null)}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveTimetable}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
        >
          <Save size={20} />
          Save Timetable
        </button>
      </div>
    </div>
  );
}
