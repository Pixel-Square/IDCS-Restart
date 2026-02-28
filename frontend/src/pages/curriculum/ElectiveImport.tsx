import React, { useState, useEffect } from 'react';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, Filter, Users } from 'lucide-react';
import fetchWithAuth from '../../services/fetchAuth';
import { fetchElectives } from '../../services/curriculum';

type Department = { id: number; code: string; name: string; short_name: string };
type Elective = {
  id: number;
  course_code: string;
  course_name: string;
  regulation: string;
  semester: number;
  department: Department;
  student_count: number;
};

export default function ElectiveImport() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  // Filters
  const [regulations, setRegulations] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<number[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedRegulation, setSelectedRegulation] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<number | ''>('');
  const [selectedDept, setSelectedDept] = useState<number | ''>('');
  
  // Electives data
  const [electives, setElectives] = useState<Elective[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadElectives();
  }, [selectedRegulation, selectedSemester, selectedDept]);

  // Load filter options from the full dataset once on mount so
  // filters don't get reduced by the currently selected filters.
  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadElectives = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedRegulation) params.regulation = selectedRegulation;
      if (selectedSemester) params.semester = selectedSemester;
      if (selectedDept) params.department_id = selectedDept;
      
      const data = await fetchElectives(params);
      setElectives(data || []);
    } catch (error) {
      console.error('Failed to load electives:', error);
      setElectives([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFilterOptions = async () => {
    try {
      const data = await fetchElectives();
      if (!data || !Array.isArray(data)) return;

      const uniqueRegs = [...new Set(data.map((e: Elective) => e.regulation))].filter(Boolean).sort() as string[];
      const uniqueSems = [...new Set(data.map((e: Elective) => e.semester))].filter(Boolean).sort((a, b) => (a as number) - (b as number)) as number[];
      const uniqueDepts = Array.from(
        new Map(data.map((e: Elective) => e.department).filter(Boolean).map((d: Department) => [d.id, d])).values()
      ).sort((a, b) => ((a as Department).code || '').localeCompare((b as Department).code || '')) as Department[];

      setRegulations(uniqueRegs);
      setSemesters(uniqueSems);
      setDepartments(uniqueDepts);
    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetchWithAuth('/api/curriculum/elective-choices/template/');
      if (!response.ok) {
        alert('Failed to download template');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'elective_choices_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download template');
    }
  };

  const downloadExcelTemplate = async () => {
    try {
      console.log('[Excel Download] Starting...');
      const response = await fetchWithAuth('/api/curriculum/elective-choices/template/?format=excel');
      console.log('[Excel Download] Response status:', response.status);
      console.log('[Excel Download] Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Excel Download] Error response:', errorText);
        alert(`Failed to download Excel template (${response.status}): ${errorText.substring(0, 100)}`);
        return;
      }

      const blob = await response.blob();
      console.log('[Excel Download] Blob size:', blob.size, 'type:', blob.type);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'elective_choices_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      console.log('[Excel Download] Complete!');
    } catch (error) {
      console.error('[Excel Download] Exception:', error);
      alert('Failed to download Excel template: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validExtensions = ['.csv', '.xlsx', '.xls'];
      const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      
      if (!hasValidExtension) {
        alert('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
        return;
      }
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('csv_file', selectedFile);

      const response = await fetchWithAuth('/api/curriculum/elective-choices/import/', {
        method: 'POST',
        body: formData,
      });

      // Handle authentication errors
      if (response.status === 401) {
        alert('Your session has expired. Please refresh the page and try again.');
        return;
      }

      // Try to parse response
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        alert('Import failed: Invalid response from server');
        return;
      }

      if (response.ok) {
        setResult(data);
        setSelectedFile(null);
        // Clear file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        // Reload electives to update counts
        loadElectives();
      } else {
        // Extract meaningful error message
        const errorMsg = data.error || data.detail || data.message || 'Import failed';
        alert(typeof errorMsg === 'string' ? errorMsg : 'Import failed: ' + JSON.stringify(errorMsg).substring(0, 200));
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file. Please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const filteredElectives = electives.filter(e => {
    if (selectedRegulation && e.regulation !== selectedRegulation) return false;
    if (selectedSemester && e.semester !== selectedSemester) return false;
    if (selectedDept && e.department?.id !== selectedDept) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 rounded-lg">
                <FileSpreadsheet className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Elective Import</h1>
                <p className="text-sm text-gray-600">Import student elective choices from CSV or Excel</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="h-5 w-5" />
                CSV Template
              </button>
              <button
                onClick={downloadExcelTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Download className="h-5 w-5" />
                Excel Template
              </button>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload File</h2>
          
          <div className="space-y-4">
            <div>
              <label
                htmlFor="file-input"
                className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex flex-col items-center justify-center">
                  <Upload className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    {selectedFile ? (
                      <span className="font-medium text-indigo-600">{selectedFile.name}</span>
                    ) : (
                      <>
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">CSV or Excel files (.csv, .xlsx, .xls)</p>
                </div>
                <input
                  id="file-input"
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 font-medium rounded-lg transition-colors ${
                !selectedFile || uploading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <Upload className="h-5 w-5" />
              {uploading ? 'Uploading...' : 'Upload and Import'}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className={`rounded-lg shadow-sm p-6 mb-6 ${result.errors && result.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-start gap-3">
              {result.errors && result.errors.length > 0 ? (
                <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h3 className={`text-lg font-semibold mb-2 ${result.errors && result.errors.length > 0 ? 'text-yellow-900' : 'text-green-900'}`}>
                  {result.message}
                </h3>
                <div className={`space-y-1 text-sm ${result.errors && result.errors.length > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                  <p><strong>Created:</strong> {result.created} entries</p>
                  <p><strong>Updated:</strong> {result.updated} entries</p>
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-3">
                      <p className="font-semibold text-red-700 mb-2">Errors ({result.errors.length}):</p>
                      <ul className="list-disc list-inside space-y-1 text-red-600 max-h-40 overflow-y-auto">
                        {result.errors.map((error: string, idx: number) => (
                          <li key={idx} className="text-xs">{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters and Electives List */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Elective Subjects</h2>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regulation</label>
              <select
                value={selectedRegulation}
                onChange={(e) => setSelectedRegulation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">All Regulations</option>
                {regulations.map(reg => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">All Semesters</option>
                {semesters.map(sem => (
                  <option key={sem} value={sem}>Semester {sem}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.code} - {dept.short_name || dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Electives Table */}
          {loading ? (
            <div className="text-center py-8 text-gray-600">Loading electives...</div>
          ) : filteredElectives.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No electives found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Course Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Course Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Regulation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Semester
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-4 w-4" />
                        Students
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredElectives.map((elective) => (
                    <tr key={elective.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {elective.course_code || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {elective.course_name || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {elective.regulation || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {elective.semester || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {elective.department?.code || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          elective.student_count > 0
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {elective.student_count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
