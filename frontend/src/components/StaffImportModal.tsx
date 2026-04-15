import React, { useRef, useState } from 'react'
import { X, Download, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import fetchWithAuth from '../services/fetchAuth'

interface ImportError {
  row: number
  errors: string[]
}

interface ImportResult {
  imported: number
  total: number
  errors: ImportError[]
}

interface StaffImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function StaffImportModal({ isOpen, onClose, onSuccess }: StaffImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleDownloadTemplate = () => {
    import('xlsx').then((XLSX) => {
      const templateRows = [
        ['Staff ID', 'Username', 'Password', 'First Name', 'Last Name', 'Email', 'Designation', 'Department', 'Date of Join', 'Status'],
        ['312104', 'Oorkalan A', 'password123', 'Oorkalan', 'A', 'oorkalana.civil@krct.ac.in', 'HOD', '103 - CE', '2024-06-12', 'ACTIVE'],
        ['312105', '', '', '', '', '', '', '', '2025-01-03', ''],
      ]
      const ws = XLSX.utils.aoa_to_sheet(templateRows)

      // Set column widths
      ws['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 32 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Staff Template')
      XLSX.writeFile(wb, 'staff_import_template.xlsx')
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setGlobalError(null)
    setResult(null)

    if (file) {
      const name = file.name.toLowerCase()
      if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
        setGlobalError('Only .xlsx and .csv files are supported.')
        setSelectedFile(null)
        return
      }
    }
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setGlobalError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetchWithAuth('/api/academics/staffs/import/', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setGlobalError(data.detail || 'Upload failed. Please try again.')
      } else {
        setResult(data as ImportResult)
        if ((data as ImportResult).imported > 0) {
          onSuccess()
        }
      }
    } catch {
      setGlobalError('Network error. Please check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    setSelectedFile(null)
    setResult(null)
    setGlobalError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Import Staff</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">

          {/* Template download */}
          <div className="bg-indigo-50 rounded-lg p-4 flex items-start gap-3">
            <FileText className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-indigo-900">Step 1 — Download the template</p>
              <p className="text-xs text-indigo-700 mt-0.5 mb-3">
                Fill rows using <strong>Staff ID</strong> to match staff. You can update only the columns you provide
                (for example only <strong>Date of Join</strong>) and leave other columns empty.
              </p>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download Template
              </button>
            </div>
          </div>

          {/* File upload */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Step 2 — Upload filled file</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-3 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-medium
                file:bg-indigo-50 file:text-indigo-700
                hover:file:bg-indigo-100
                border border-gray-300 rounded-lg p-1 cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-1">Accepts .xlsx or .csv — max 5 MB</p>
          </div>

          {/* Global error */}
          {globalError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{globalError}</span>
            </div>
          )}

          {/* Result summary */}
          {result && (
            <div className="space-y-3">
              <div
                className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
                  result.imported > 0
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {result.imported > 0
                    ? `Staff imported successfully! ${result.imported} of ${result.total} record${result.total !== 1 ? 's' : ''} imported.`
                    : `No records imported (${result.total} row${result.total !== 1 ? 's' : ''} processed).`}
                </span>
              </div>

              {result.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-red-50 border-b border-red-200">
                    <p className="text-xs font-semibold text-red-700">
                      {result.errors.length} row error{result.errors.length !== 1 ? 's' : ''}:
                    </p>
                  </div>
                  <ul className="divide-y divide-red-100 max-h-44 overflow-y-auto">
                    {result.errors.map((e, idx) => (
                      <li key={idx} className="px-3 py-2 text-xs text-red-700">
                        <span className="font-semibold">Row {e.row}:</span>{' '}
                        {e.errors.join(' ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>

      </div>
    </div>
  )
}
