import React, { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Calendar, Upload, Plus, Trash2, AlertCircle, Loader2, X, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ModalPortal } from '../../components/ModalPortal'
import { CalendarData, loadCalendars, saveCalendars } from './calendarTypes'

export default function AcademicCalendarAdmin() {
  const navigate = useNavigate()
  const [calendars, setCalendars] = useState<CalendarData[]>([])
  const [showCreatePopup, setShowCreatePopup] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarData | null>(null)
  const [calendarName, setCalendarName] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletePassword, setDeletePassword] = useState('')

  useEffect(() => { setCalendars(loadCalendars()) }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { setUploadedFile(e.target.files[0]); setError(null) }
  }

  const getCellStr = (sheet: XLSX.WorkSheet, col: string, row: number): string => {
    const cell = sheet[`${col}${row}`]
    if (!cell || cell.v === undefined || cell.v === null) return ''
    return String(cell.v)
  }

  const formatExcelDate = (value: any): string => {
    if (typeof value === 'number') {
      const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000))
      return `${jsDate.getUTCDate()}/${jsDate.getUTCMonth() + 1}/${jsDate.getUTCFullYear()}`
    }
    if (value instanceof Date) return `${value.getDate()}/${value.getMonth() + 1}/${value.getFullYear()}`
    return value?.toString() || ''
  }

  const parseExcelFile = (file: File): Promise<CalendarData> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target?.result, { type: 'binary', cellDates: false })
          const sheetName = workbook.SheetNames[2]
          if (!sheetName) throw new Error('Excel file must have at least 3 sheets')
          const sheet = workbook.Sheets[sheetName]

          const b2 = getCellStr(sheet, 'B', 2).toUpperCase()
          const semesterType: 'ODD' | 'EVEN' = b2.includes('ODD') ? 'ODD' : 'EVEN'
          const yearMatch = b2.match(/(\d{4}[-\u2013]\d{2,4})/i)
          const academicYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString()

          const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:M500')
          const maxRow = range.e.r + 1

          const dates: import('./calendarTypes').CalendarDate[] = []
          let consecutiveEmpty = 0

          for (let rowIndex = 4; rowIndex <= maxRow; rowIndex++) {
            const dateCell = sheet[`B${rowIndex}`]
            if (!dateCell || dateCell.v === undefined || dateCell.v === null || dateCell.v === '') {
              if (++consecutiveEmpty > 10) break
              continue
            }
            consecutiveEmpty = 0
            dates.push({
              date: formatExcelDate(dateCell.v),
              day: getCellStr(sheet, 'C', rowIndex),
              workingDays: getCellStr(sheet, 'D', rowIndex),
              counter: getCellStr(sheet, 'E', rowIndex),
              iiYearEvent: getCellStr(sheet, 'G', rowIndex),
              iiYearCount: getCellStr(sheet, 'H', rowIndex),
              iiiYearEvent: getCellStr(sheet, 'I', rowIndex),
              iiiYearCount: getCellStr(sheet, 'J', rowIndex),
              ivYearEvent: getCellStr(sheet, 'K', rowIndex),
              ivYearCount: getCellStr(sheet, 'L', rowIndex),
              iYearText: getCellStr(sheet, 'M', rowIndex),
            })
          }

          if (dates.length === 0)
            throw new Error('No data rows found. Ensure the Excel has data in the 3rd sheet starting from row 4 with dates in column B.')

          resolve({
            id: Date.now().toString(),
            name: calendarName || file.name.replace(/\.[^.]+$/, ''),
            semesterType,
            academicYear,
            uploadedAt: new Date().toISOString(),
            dates,
          })
        } catch (err: any) { reject(err) }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsBinaryString(file)
    })

  const handleCreateCalendar = async () => {
    if (!calendarName.trim()) { setError('Please enter a calendar name'); return }
    if (!uploadedFile) { setError('Please upload an Excel file'); return }
    setIsProcessing(true); setError(null)
    try {
      const data = await parseExcelFile(uploadedFile)
      const updated = [...calendars, data]
      saveCalendars(updated); setCalendars(updated)
      setCalendarName(''); setUploadedFile(null); setShowCreatePopup(false)
    } catch (err: any) { setError(err.message || 'Failed to process Excel file') }
    finally { setIsProcessing(false) }
  }

  const handleDeleteCalendar = () => {
    if (!selectedCalendar) return
    if (deletePassword !== 'admin') { setError('Incorrect password'); return }
    const updated = calendars.filter(c => c.id !== selectedCalendar.id)
    saveCalendars(updated); setCalendars(updated)
    setShowDeleteConfirm(false); setDeletePassword(''); setSelectedCalendar(null); setError(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Academic Calendar Admin</h1>
                <p className="text-sm text-gray-600">Manage academic year calendars</p>
              </div>
            </div>
            <button onClick={() => setShowCreatePopup(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-5 h-5" /> Create Calendar
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Academic Calendar History</h2>
          {calendars.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>No calendars uploaded yet</p>
              <p className="text-sm">Click "Create Calendar" to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {calendars.map((calendar) => (
                <div key={calendar.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{calendar.name}</h3>
                      <p className="text-sm text-gray-600">{calendar.academicYear}</p>
                    </div>
                    <button onClick={() => { setSelectedCalendar(calendar); setShowDeleteConfirm(true); setDeletePassword(''); setError(null) }} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1 text-sm mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Semester:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${calendar.semesterType === 'ODD' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {calendar.semesterType}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Entries:</span>
                      <span className="font-medium">{calendar.dates.length}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Uploaded: {new Date(calendar.uploadedAt).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => navigate(`/iqac/calendar/admin/view/${calendar.id}`)} className="w-full flex items-center justify-center gap-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg transition-colors">
                    <Eye className="w-4 h-4" /> View Calendar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreatePopup && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Create New Calendar</h3>
                <button onClick={() => { setShowCreatePopup(false); setCalendarName(''); setUploadedFile(null); setError(null) }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Calendar Name</label>
                  <input type="text" value={calendarName} onChange={(e) => setCalendarName(e.target.value)} placeholder="e.g., Academic Year 2025-26 Odd Sem" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Upload Excel File <span className="text-gray-400 font-normal">(data read from 3rd sheet)</span></label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" id="calendar-upload" />
                    <label htmlFor="calendar-upload" className="cursor-pointer flex flex-col items-center">
                      <Upload className="w-12 h-12 text-gray-400 mb-2" />
                      {uploadedFile ? <p className="text-sm font-medium text-gray-700">{uploadedFile.name}</p> : <><p className="text-sm font-medium text-gray-700">Click to upload</p><p className="text-xs text-gray-500">Excel file (.xlsx / .xls)</p></>}
                    </label>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => { setShowCreatePopup(false); setCalendarName(''); setUploadedFile(null); setError(null) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button onClick={handleCreateCalendar} disabled={isProcessing} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" />Processing...</> : 'Generate Calendar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showDeleteConfirm && selectedCalendar && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              <p className="text-gray-600 mb-4">Are you sure you want to delete "{selectedCalendar.name}"?</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Enter password to confirm</label>
                <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Password" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setSelectedCalendar(null); setError(null) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleDeleteCalendar} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
