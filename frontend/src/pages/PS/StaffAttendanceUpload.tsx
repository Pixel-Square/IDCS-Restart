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
  yesterday_date: string | null;
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
  department_ids: number[];
  departments_info: { id: number; name: string; code: string; short_name: string }[];
}

interface Department {
  id: number;
  code: string;
  name: string;
  short_name: string;
}

const StaffAttendanceUpload: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload date states
  const now = new Date();
  const [uploadMonth, setUploadMonth] = useState(now.getMonth() + 1); // 1-12
  const [uploadYear, setUploadYear] = useState(now.getFullYear());
  const [uploadDate, setUploadDate] = useState(now.getDate());

  // Bulk delete states
  const [deleteMonth, setDeleteMonth] = useState(now.getMonth() + 1);
  const [deleteYear, setDeleteYear] = useState(now.getFullYear());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePreview, setDeletePreview] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // Holiday management states
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayNotes, setHolidayNotes] = useState('');
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [holidayDeptIds, setHolidayDeptIds] = useState<number[]>([]);

  // Sunday management states
  const [sundayMonth, setSundayMonth] = useState(new Date().getMonth() + 1);
  const [sundayYear, setSundayYear] = useState(new Date().getFullYear());
  const [sundayLoading, setSundayLoading] = useState(false);

  // Attendance settings states
  const [inTimeLimit, setInTimeLimit] = useState('08:45');
  const [outTimeLimit, setOutTimeLimit] = useState('17:45');
  const [applyTimeLimits, setApplyTimeLimits] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // Fetch holidays on component mount
  useEffect(() => {
    fetchHolidays();
    fetchAttendanceSettings();
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await apiClient.get(`${getApiBase()}/api/staff-attendance/holidays/departments/`);
      setAllDepartments(response.data);
    } catch (err: any) {
      console.error('Failed to fetch departments:', err);
    }
  };

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
        notes: holidayNotes,
        department_ids: holidayDeptIds,
      });

      // Reset form and refresh list
      setHolidayDate('');
      setHolidayName('');
      setHolidayNotes('');
      setHolidayDeptIds([]);
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
      const errorMsg = err.response?.data?.error || 'Failed to delete holiday';
      alert(errorMsg);
    }
  };

  const handleGenerateSundays = async () => {
    if (!confirm(`Generate Sunday holidays for ${sundayMonth}/${sundayYear}?`)) {
      return;
    }

    setSundayLoading(true);
    try {
      const response = await apiClient.post(`${getApiBase()}/api/staff-attendance/holidays/generate_sundays/`, {
        year: sundayYear,
        month: sundayMonth
      });
      
      const data = response.data;
      alert(`Generated ${data.created} new Sunday holidays. ${data.already_exists} already existed.`);
      fetchHolidays();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to generate Sundays');
    } finally {
      setSundayLoading(false);
    }
  };

  const handleRemoveSundays = async () => {
    if (!confirm(`Remove all Sunday holidays for ${sundayMonth}/${sundayYear}?`)) {
      return;
    }

    setSundayLoading(true);
    try {
      const response = await apiClient.post(`${getApiBase()}/api/staff-attendance/holidays/remove_sundays/`, {
        year: sundayYear,
        month: sundayMonth
      });
      
      const data = response.data;
      alert(`Removed ${data.deleted_count} Sunday holidays.`);
      fetchHolidays();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to remove Sundays');
    } finally {
      setSundayLoading(false);
    }
  };

  const fetchAttendanceSettings = async () => {
    try {
      const response = await apiClient.get(`${getApiBase()}/api/staff-attendance/settings/current/`);
      const settings = response.data;
      
      // Convert time format from "HH:MM:SS" to "HH:MM"
      setInTimeLimit(settings.attendance_in_time_limit.substring(0, 5));
      setOutTimeLimit(settings.attendance_out_time_limit.substring(0, 5));
      setApplyTimeLimits(settings.apply_time_based_absence);
    } catch (err: any) {
      console.error('Failed to fetch attendance settings:', err);
    }
  };

  const handleSaveSettings = async () => {
    setLoadingSettings(true);
    try {
      await apiClient.patch(`${getApiBase()}/api/staff-attendance/settings/1/`, {
        attendance_in_time_limit: `${inTimeLimit}:00`,
        attendance_out_time_limit: `${outTimeLimit}:00`,
        apply_time_based_absence: applyTimeLimits
      });
      
      alert('Attendance settings saved successfully!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setLoadingSettings(false);
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
      formData.append('month', uploadMonth.toString());
      formData.append('year', uploadYear.toString());
      
      // Calculate upload_date from month, year, and date
      const uploadDateStr = `${uploadYear}-${uploadMonth.toString().padStart(2, '0')}-${uploadDate.toString().padStart(2, '0')}`;
      formData.append('upload_date', uploadDateStr);

      // Increase timeout to 5 minutes for large CSV uploads
      const response = await apiClient.post(`${getApiBase()}/api/staff-attendance/csv-upload/upload/`, formData, {
        timeout: 300000  // 5 minutes for processing large CSV files
      });

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
      formData.append('month', uploadMonth.toString());
      formData.append('year', uploadYear.toString());
      
      // Calculate upload_date from month, year, and date
      const uploadDateStr = `${uploadYear}-${uploadMonth.toString().padStart(2, '0')}-${uploadDate.toString().padStart(2, '0')}`;
      formData.append('upload_date', uploadDateStr);

      // Increase timeout to 5 minutes for large CSV uploads
      const response = await apiClient.post(`${getApiBase()}/api/staff-attendance/csv-upload/upload/`, formData, {
        timeout: 300000  // 5 minutes for processing large CSV files
      });

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

  const handleBulkDeletePreview = async () => {
    setDeleting(true);
    setDeletePreview(null);

    try {
      const response = await apiClient.post(`${getApiBase()}/api/staff-attendance/csv-upload/bulk_delete_month/`, {
        month: deleteMonth,
        year: deleteYear,
        confirm: false
      });
      setDeletePreview(response.data);
      setShowDeleteConfirm(true);
    } catch (err: any) {
      const data = err.response?.data;
      alert(data?.error || 'Failed to fetch preview');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    setDeleting(true);

    try {
      const response = await apiClient.post(`${getApiBase()}/api/staff-attendance/csv-upload/bulk_delete_month/`, {
        month: deleteMonth,
        year: deleteYear,
        confirm: true
      });
      alert(response.data.message || 'Records deleted successfully');
      setShowDeleteConfirm(false);
      setDeletePreview(null);
    } catch (err: any) {
      const data = err.response?.data;
      alert(data?.error || 'Failed to delete records');
    } finally {
      setDeleting(false);
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

          {/* Upload Date Selection */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Upload Date Configuration
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                <select
                  value={uploadYear}
                  onChange={(e) => setUploadYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {[...Array(5)].map((_, i) => {
                    const year = new Date().getFullYear() - 1 + i;
                    return <option key={year} value={year}>{year}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
                <select
                  value={uploadMonth}
                  onChange={(e) => setUploadMonth(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => (
                    <option key={i + 1} value={i + 1}>{month}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                <select
                  value={uploadDate}
                  onChange={(e) => setUploadDate(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {[...Array(31)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-600">
              Selected upload date: <strong>{uploadYear}-{uploadMonth.toString().padStart(2, '0')}-{uploadDate.toString().padStart(2, '0')}</strong>
            </p>
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

      {/* Sunday Management Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Sunday Holiday Management
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Generate or remove Sunday holidays for a specific month
          </p>
        </div>
        
        <div className="p-6">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Month
              </label>
              <select
                value={sundayMonth}
                onChange={(e) => setSundayMonth(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Year
              </label>
              <input
                type="number"
                value={sundayYear}
                onChange={(e) => setSundayYear(parseInt(e.target.value))}
                min="2020"
                max="2030"
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
              />
            </div>
            
            <button
              onClick={handleGenerateSundays}
              disabled={sundayLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4 mr-2" />
              {sundayLoading ? 'Generating...' : 'Generate Sundays'}
            </button>
            
            <button
              onClick={handleRemoveSundays}
              disabled={sundayLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {sundayLoading ? 'Removing...' : 'Remove Sundays'}
            </button>
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Use "Generate Sundays" to automatically mark all Sundays in the selected month as holidays.
              Use "Remove Sundays" to delete Sunday holidays if your college operates on specific Sundays.
            </p>
          </div>
        </div>
      </div>

      {/* Attendance Time Settings Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Attendance Time Limits
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure time-based absence rules for attendance processing
          </p>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                In Time Limit
              </label>
              <input
                type="time"
                value={inTimeLimit}
                onChange={(e) => setInTimeLimit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                If staff arrives after this time, mark as absent
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Out Time Limit
              </label>
              <input
                type="time"
                value={outTimeLimit}
                onChange={(e) => setOutTimeLimit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                If staff leaves before this time, mark as absent
              </p>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={applyTimeLimits}
                onChange={(e) => setApplyTimeLimits(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Apply time-based absence rules
              </span>
            </label>
            <p className="text-xs text-gray-500 ml-6 mt-1">
              When enabled, attendance will be marked as absent if time limits are violated during CSV upload
            </p>
          </div>
          
          <button
            onClick={handleSaveSettings}
            disabled={loadingSettings}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {loadingSettings ? 'Saving...' : 'Save Time Settings'}
          </button>
          
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> Time-based absence rules are applied during CSV upload processing.
              Existing attendance records are not affected. Default values are 8:45 AM for in time and 5:45 PM for out time.
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Delete Section */}
      <div className="bg-white rounded-lg shadow-lg border-2 border-red-200">
        <div className="border-b border-red-200 px-6 py-4 bg-red-50">
          <div className="flex items-center">
            <Trash2 className="h-5 w-5 mr-2 text-red-600" />
            <h2 className="text-xl font-bold text-red-900">Reset Monthly Attendance</h2>
          </div>
          <p className="text-red-700 mt-1 text-sm">
            <strong>Warning:</strong> This will permanently delete all attendance records for the selected month
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={deleteYear}
                onChange={(e) => setDeleteYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                {[...Array(5)].map((_, i) => {
                  const year = new Date().getFullYear() - 1 + i;
                  return <option key={year} value={year}>{year}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={deleteMonth}
                onChange={(e) => setDeleteMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => (
                  <option key={i + 1} value={i + 1}>{month}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleBulkDeletePreview}
            disabled={deleting}
            className="w-full flex items-center justify-center px-4 py-2 border border-red-600 rounded-md text-sm font-medium text-red-600 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? (
              <>
                <Clock className="animate-spin h-4 w-4 mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Preview Delete for {deleteYear}-{deleteMonth.toString().padStart(2, '0')}
              </>
            )}
          </button>

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && deletePreview && (
            <div className="mt-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
              <h3 className="text-lg font-bold text-red-900 mb-2">Confirm Deletion</h3>
              <p className="text-sm text-red-800 mb-3">
                Found <strong>{deletePreview.records_count}</strong> records for {deletePreview.year}-{deletePreview.month.toString().padStart(2, '0')}
              </p>
              <p className="text-sm text-red-700 mb-4">
                Are you sure you want to permanently delete all these records? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleBulkDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete All Records'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePreview(null);
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Cancel
                </button>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department Scope
                    <span className="ml-1 text-xs text-gray-500 font-normal">(leave all unchecked for a college-wide holiday)</span>
                  </label>
                  {allDepartments.length === 0 ? (
                    <p className="text-xs text-gray-400">Loading departments...</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto border border-gray-200 rounded-md p-2 bg-white">
                      {allDepartments.map((dept) => (
                        <label key={dept.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={holidayDeptIds.includes(dept.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setHolidayDeptIds(prev => [...prev, dept.id]);
                              } else {
                                setHolidayDeptIds(prev => prev.filter(id => id !== dept.id));
                              }
                            }}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                          />
                          <span className="text-gray-700" title={dept.name}>{dept.short_name || dept.code}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {holidayDeptIds.length > 0 && (
                    <p className="text-xs text-blue-700 mt-1">
                      Holiday applies to {holidayDeptIds.length} selected department{holidayDeptIds.length > 1 ? 's' : ''} only.
                    </p>
                  )}
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
                      setHolidayDeptIds([]);
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
                      {/* Department scope badge */}
                      {(holiday.departments_info?.length || 0) > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {holiday.departments_info.map(d => (
                            <span key={d.id} className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded">
                              {d.short_name || d.code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="mt-2 inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded">All departments</span>
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