import React, { useState, useEffect } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Clock, Calendar, Trash2, Plus } from 'lucide-react';
import { getApiBase } from '../../services/apiBase';
import { apiClient } from '../../services/auth';

interface UploadResult {
  success: boolean;
  upload_date: string;
  processed_rows: number;
  success_count: number;
  error_count: number;
  errors: Array<{ user_id: string; error: string }>;
  upload_log_id: number;
}

interface PreviewRow {
  user_id: string;
  full_name: string;
  today_date: string;
  today_morning_in: string | null;
  today_evening_out: string | null;
  today_raw: string;
  yesterday_date: string;
  yesterday_morning_in: string | null;
  yesterday_evening_out: string | null;
  yesterday_raw: string;
  backfill_days_with_data: number;
}

interface PreviewData {
  dry_run: boolean;
  upload_date: string;
  today_column: string;
  yesterday_column: string | null;
  backfill_columns: string[];
  preview: PreviewRow[];
  total_rows: number;
}

interface Holiday {
  id: number;
  date: string;
  name: string;
  notes: string;
  created_by_name: string;
  created_at: string;
}

const StaffAttendanceUpload: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Holiday management states
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayNotes, setHolidayNotes] = useState('');
  const [holidayError, setHolidayError] = useState<string | null>(null);

  // Fetch holidays on component mount
  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      setLoadingHolidays(true);
      const response = await apiClient.get(`${getApiBase()}/api/staff-attendance/holidays/`);
      setHolidays(response.data);
    } catch (err: any) {
      console.error('Failed to fetch holidays:', err);
    } finally {
      setLoadingHolidays(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!holidayDate || !holidayName) {
      setHolidayError('Please provide date and holiday name');
      return;
    }

    try {
      await apiClient.post(`${getApiBase()}/api/staff-attendance/holidays/`, {
        date: holidayDate,
        name: holidayName,
        notes: holidayNotes
      });

      // Reset form and refresh list
      setHolidayDate('');
      setHolidayName('');
      setHolidayNotes('');
      setShowHolidayForm(false);
      setHolidayError(null);
      fetchHolidays();
    } catch (err: any) {
      const data = err.response?.data;
      const msg = data?.date?.[0] || data?.error || 'Failed to add holiday';
      setHolidayError(msg);
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    if (!confirm('Are you sure you want to delete this holiday?')) {
      return;
    }

    try {
      await apiClient.delete(`${getApiBase()}/api/staff-attendance/holidays/${id}/`);
      fetchHolidays();
    } catch (err: any) {
      alert('Failed to delete holiday');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setSelectedFile(file);
      setError(null);
      setResult(null);
      setPreviewData(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      setSelectedFile(file);
      setError(null);
      setResult(null);
      setPreviewData(null);
    } else {
      setError('Please drop a CSV file');
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);
    setResult(null);
    setPreviewData(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('dry_run', isDryRun ? 'true' : 'false');
      formData.append('overwrite_existing', overwriteExisting ? 'true' : 'false');

      const response = await apiClient.post(`${getApiBase()}/api/staff-attendance/csv-upload/upload/`, formData);

      if (isDryRun) {
        setPreviewData(response.data);
      } else {
        setResult(response.data);
      }
    } catch (err: any) {
      const data = err.response?.data
      const msg = data?.detail || data?.error || (data ? JSON.stringify(data) : null) || 'Upload failed'
      setError(msg)
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('dry_run', 'false');
      formData.append('overwrite_existing', overwriteExisting ? 'true' : 'false');

      const response = await apiClient.post(`${getApiBase()}/api/staff-attendance/csv-upload/upload/`, formData);

      setResult(response.data);
      setPreviewData(null);
    } catch (err: any) {
      const data = err.response?.data
      const msg = data?.detail || data?.error || (data ? JSON.stringify(data) : null) || 'Upload failed'
      setError(msg)
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Main Upload Section */}
      <div className="bg-white rounded-lg shadow-lg">
        <div className="border-b border-gray-200 px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Staff Attendance Upload</h1>
          <p className="text-gray-600 mt-2">
            Upload biometric CSV files to manage staff attendance records. Files are validated by upload date, not filename.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* File Upload Area */}
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors"
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                Drop your CSV file here or click to browse
              </p>
              <p className="text-sm text-gray-500 mb-4">
                CSV files with biometric attendance data (max 10MB)
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
              >
                <FileText className="h-4 w-4 mr-2" />
                Select CSV File
              </label>
            </div>

            {selectedFile && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <FileText className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-blue-900">{selectedFile.name}</span>
                  <span className="text-xs text-blue-600 ml-2">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Upload Options */}
          <div className="space-y-3">
            <div className="flex items-center">
              <input
                id="dry-run"
                type="checkbox"
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="dry-run" className="ml-2 block text-sm text-gray-900">
                Preview only (dry run) - Don't save to database
              </label>
            </div>

            <div className="flex items-center">
              <input
                id="overwrite"
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="overwrite" className="ml-2 block text-sm text-gray-900">
                Overwrite existing attendance records for the same date
              </label>
            </div>
          </div>

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Clock className="animate-spin -ml-1 mr-3 h-4 w-4" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="-ml-1 mr-3 h-4 w-4" />
                {isDryRun ? 'Preview Upload' : 'Upload File'}
              </>
            )}
          </button>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Upload Error</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Preview Display */}
          {previewData && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
                <h3 className="text-sm font-medium text-yellow-800">Preview — {previewData.total_rows} staff records</h3>
              </div>

              {/* Summary badges */}
              <div className="flex flex-wrap gap-2 mb-4 text-xs">
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  Today ({previewData.today_column}): morning entry
                </span>
                {previewData.yesterday_column && (
                  <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                    Yesterday ({previewData.yesterday_column}): deferred evening exit
                  </span>
                )}
                {previewData.backfill_columns.length > 0 && (
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                    Backfill {previewData.backfill_columns.join(', ')}: save missing days
                  </span>
                )}
              </div>

              <div className="bg-white rounded border max-h-72 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium text-gray-700 border-b">User ID</th>
                      <th className="px-2 py-1 text-left font-medium text-gray-700 border-b">Name</th>
                      <th className="px-2 py-1 text-left font-medium text-blue-700 border-b">Today ({previewData.today_column}) In</th>
                      <th className="px-2 py-1 text-left font-medium text-blue-700 border-b">Today Out</th>
                      {previewData.yesterday_column && (
                        <>
                          <th className="px-2 py-1 text-left font-medium text-orange-700 border-b">Yest ({previewData.yesterday_column}) In</th>
                          <th className="px-2 py-1 text-left font-medium text-orange-700 border-b">Yest Out</th>
                        </>
                      )}
                      <th className="px-2 py-1 text-left font-medium text-green-700 border-b">Backfill days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewData.preview.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1 font-mono">{r.user_id}</td>
                        <td className="px-2 py-1 max-w-[120px] truncate" title={r.full_name}>{r.full_name}</td>
                        <td className="px-2 py-1 text-blue-700">{r.today_morning_in ?? <span className="text-gray-400">-</span>}</td>
                        <td className="px-2 py-1 text-blue-700">{r.today_evening_out ?? <span className="text-gray-400">-</span>}</td>
                        {previewData.yesterday_column && (
                          <>
                            <td className="px-2 py-1 text-orange-700">{r.yesterday_morning_in ?? <span className="text-gray-400">-</span>}</td>
                            <td className="px-2 py-1 text-orange-700">{r.yesterday_evening_out ?? <span className="text-gray-400">-</span>}</td>
                          </>
                        )}
                        <td className="px-2 py-1 text-green-700">{r.backfill_days_with_data > 0 ? `${r.backfill_days_with_data} days` : <span className="text-gray-400">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.total_rows > 20 && (
                <p className="text-xs text-gray-500 mt-2">Showing first 20 of {previewData.total_rows} rows.</p>
              )}

              <div className="mt-4 flex space-x-3">
                <button
                  onClick={handleConfirmUpload}
                  disabled={uploading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Upload
                </button>
                <button
                  onClick={() => setPreviewData(null)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Success Result Display */}
          {result && (
            <div className={`border rounded-lg p-4 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex">
                {result.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <h3 className={`text-sm font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                    {result.success ? 'Upload Successful' : 'Upload Failed'}
                  </h3>
                  <div className={`text-sm mt-2 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                    <p><strong>Upload Date:</strong> {result.upload_date}</p>
                    <p><strong>Processed Rows:</strong> {result.processed_rows}</p>
                    <p><strong>Successful:</strong> {result.success_count}</p>
                    <p><strong>Errors:</strong> {result.error_count}</p>
                    {result.upload_log_id && (
                      <p><strong>Upload Log ID:</strong> {result.upload_log_id}</p>
                    )}

                    {result.errors && result.errors.length > 0 && (
                      <div className="mt-4">
                        <h4 className="font-medium mb-2">Error Details:</h4>
                        <div className="bg-white rounded border max-h-32 overflow-y-auto">
                          <table className="min-w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-1 text-left font-medium text-gray-900">User ID</th>
                                <th className="px-2 py-1 text-left font-medium text-gray-900">Error</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {result.errors.map((error, index) => (
                                <tr key={index}>
                                  <td className="px-2 py-1">{error.user_id}</td>
                                  <td className="px-2 py-1 text-red-600">{error.error}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Holiday Management Section */}
      <div className="bg-white rounded-lg shadow-lg">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                Holiday Management
              </h2>
              <p className="text-gray-600 mt-1 text-sm">
                Mark holidays to skip attendance processing for these dates during CSV upload
              </p>
            </div>
            <button
              onClick={() => setShowHolidayForm(!showHolidayForm)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Holiday
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Add Holiday Form */}
          {showHolidayForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Add New Holiday</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Holiday Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={holidayName}
                    onChange={(e) => setHolidayName(e.target.value)}
                    placeholder="e.g., Independence Day"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={holidayNotes}
                    onChange={(e) => setHolidayNotes(e.target.value)}
                    placeholder="Additional notes about this holiday"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {holidayError && (
                  <div className="text-sm text-red-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    {holidayError}
                  </div>
                )}

                <div className="flex space-x-2">
                  <button
                    onClick={handleAddHoliday}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Save Holiday
                  </button>
                  <button
                    onClick={() => {
                      setShowHolidayForm(false);
                      setHolidayDate('');
                      setHolidayName('');
                      setHolidayNotes('');
                      setHolidayError(null);
                    }}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Holidays List */}
          {loadingHolidays ? (
            <div className="text-center py-8">
              <Clock className="animate-spin h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Loading holidays...</p>
            </div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">No holidays marked yet</p>
              <p className="text-sm text-gray-400 mt-1">Add holidays to skip attendance processing for those dates</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-gray-600 mb-3">
                {holidays.length} holiday{holidays.length !== 1 ? 's' : ''} marked
              </div>
              {holidays.map((holiday) => (
                <div
                  key={holiday.id}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-gray-900">{holiday.name}</span>
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        <span className="font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          {new Date(holiday.date).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                      </div>
                      {holiday.notes && (
                        <p className="mt-2 text-sm text-gray-600">{holiday.notes}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Added by {holiday.created_by_name} on {new Date(holiday.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteHoliday(holiday.id)}
                      className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete holiday"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffAttendanceUpload;