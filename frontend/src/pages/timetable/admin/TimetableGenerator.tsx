import React, { useState, useEffect } from 'react';
import { ChevronLeft, Copy } from 'lucide-react';
import { SearchableDropdown } from '../../../components/ui/SearchableDropdown';
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
              value: String(s.id)  // Use database pk, not staff_id!
            };
          });
          // Remove duplicates
          const uniqueOptions = Array.from(new Map(options.map(item => [item.value, item])).values());
          setFacultyOptions(uniqueOptions);
        }
      } catch (error) {
        console.error('Failed to fetch faculty:', error);
      }
    }
    loadStaff();
  }, []);

  const filteredTemplates = templates.filter((t) => {
    if (filterType === 'all') return true;
    return t.semesterType === filterType;
  });

  const oddTemplates = templates.filter((t) => t.semesterType === 'odd');
  const evenTemplates = templates.filter((t) => t.semesterType === 'even');

  if (selectedTemplate) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <button
          onClick={() => setSelectedTemplate(null)}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6 font-semibold"
        >
          <ChevronLeft size={20} />
          Back to Templates
        </button>

        <div className="mb-6 pb-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">{selectedTemplate.name}</h2>
              <p className="text-gray-600 mt-2">
                Semester Type:{' '}
                <span
                  className={`font-semibold ${
                    selectedTemplate.semesterType === 'odd'
                      ? 'text-purple-600'
                      : 'text-orange-600'
                  }`}
                >
                  {selectedTemplate.semesterType.toUpperCase()}
                </span>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Created: {new Date(selectedTemplate.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedTemplate, null, 2));
                  alert('Template copied to clipboard!');
                }}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Copy size={18} />
                Copy Template
              </button>
              <button
                onClick={() => setIsGenerating(true)}
                className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                🎯 Generate Timetable
              </button>
            </div>
          </div>
        </div>

        {/* Timetable Grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-2 border-gray-300">
                <th className="border-2 border-gray-300 px-4 py-3 text-left font-bold text-gray-900 bg-gray-200">
                  Day
                </th>
                {selectedTemplate.columns.map((col) => (
                  <th
                    key={col.id}
                    className={`border-2 border-gray-300 px-4 py-3 text-center font-bold min-w-[150px] ${
                      col.period === 'Break'
                        ? 'bg-red-100 text-red-900'
                        : col.period === 'Lunch'
                        ? 'bg-orange-100 text-orange-900'
                        : 'bg-blue-50 text-gray-900'
                    }`}
                  >
                    <div className="font-semibold">{col.period}</div>
                    <div className="text-xs font-normal">{col.timing}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedTemplate.rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="border-2 border-gray-300 px-4 py-3 font-semibold text-gray-900 bg-gray-100 text-center">
                    {row.day}
                  </td>
                  {selectedTemplate.columns.map((col) => (
                    <td
                      key={`${row.id}-${col.id}`}
                      className={`border-2 border-gray-300 px-4 py-3 text-center min-w-[150px] ${
                        col.period === 'Break'
                          ? 'bg-red-50'
                          : col.period === 'Lunch'
                          ? 'bg-orange-50'
                          : ''
                      }`}
                    >
                      {col.period === 'Break' || col.period === 'Lunch' ? (
                        <div className="font-semibold text-gray-600">{col.period}</div>
                      ) : (
                        <input
                          type="text"
                          placeholder={`Enter subject for ${row.day} - ${col.period}`}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Generate Options */}
        {isGenerating && (
          <div className="mt-6 p-6 bg-white rounded-lg shadow-md border-t-4 border-green-500">
            <h3 className="text-xl font-bold mb-4 text-gray-800">Generate Options</h3>
            
            {/* Box for Department, Course, Faculty */}
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

            {/* Box for Teaching Assign */}
            <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 mb-6">
              <button 
                onClick={() => setShowTeachingAssign(!showTeachingAssign)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                {showTeachingAssign ? 'Hide Teaching Assign' : 'Teaching Assign'}
              </button>

              {showTeachingAssign && (
                <TeachingAssignSection facultyOptions={facultyOptions} />
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
                onClick={() => {
                  alert('Timetable generated successfully!');
                  setIsGenerating(false);
                }}
              >
                Generate Now
              </button>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-gray-900 mb-2">Template Summary:</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-gray-600">Periods (Columns):</p>
              <p className="text-2xl font-bold text-blue-600">{selectedTemplate.columns.length}</p>
            </div>
            <div>
              <p className="text-gray-600">Days (Rows):</p>
              <p className="text-2xl font-bold text-blue-600">{selectedTemplate.rows.length}</p>
            </div>
            <div>
              <p className="text-gray-600">Total Cells:</p>
              <p className="text-2xl font-bold text-blue-600">
                {selectedTemplate.columns.length * selectedTemplate.rows.length}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Buttons */}
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

      {/* Templates List */}
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

              {/* Period Timings Preview */}
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
