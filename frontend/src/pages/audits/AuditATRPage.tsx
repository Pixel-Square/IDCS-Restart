import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, ChevronLeft, Download, FileText, Loader2, PenLine, Save, Send,
} from 'lucide-react'
import {
  AuditAssignment, AuditATRRow, fetchAuditAssignments, fetchAuditATR, fetchAuditReport, saveAuditATR,
} from '../../services/audits'
import { downloadAuditReportPdf } from '../../utils/auditReportPdf'

export default function AuditATRPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<AuditAssignment[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [atrRows, setAtrRows] = useState<AuditATRRow[]>([])
  const [assignment, setAssignment] = useState<AuditAssignment | null>(null)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  // Once every ATR row has been submitted, the Save/Submit buttons deactivate.
  const allSubmitted = atrRows.length > 0 && atrRows.every((r) => r.status === 'SUBMITTED')
  const allSubmittedRef = useRef(allSubmitted)
  allSubmittedRef.current = allSubmitted

  const loadAssignments = async () => {
    setLoading(true)
    try {
      const list = await fetchAuditAssignments(undefined, 'hod')
      setAssignments(list)
      if (!selectedId && list.length > 0) setSelectedId(list[0].id)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedId) return
    ;(async () => {
      const data = await fetchAuditATR(selectedId)
      if (data) {
        setAtrRows(data.atr_questions)
        setAssignment(data.assignment)
        const next: Record<number, string> = {}
        for (const r of data.atr_questions) next[r.question_id] = r.action_taken || ''
        setDrafts(next)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const persist = async (submit: boolean) => {
    if (!selectedId) return
    // Once the ATR is submitted, block any further (auto-)saves that would
    // flip the status back to PENDING.
    if (!submit && allSubmittedRef.current) return
    const atrs = Object.entries(draftsRef.current).map(([qid, action]) => ({
      question_id: Number(qid),
      action_taken: action,
    }))
    setSaving(true)
    setSaveState('saving')
    try {
      const res = await saveAuditATR(selectedId, { atrs, submit })
      setSaveState('saved')
      setMsg(submit ? 'ATR submitted successfully.' : 'ATR saved.')
      const data = await fetchAuditATR(selectedId)
      if (data) setAtrRows(data.atr_questions)
    } catch (e: any) {
      setSaveState('error')
      setMsg(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const autoSave = () => {
    if (allSubmittedRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => persist(false), 1200)
  }

  const updateDraft = (qid: number, value: string) => {
    setDrafts((prev) => ({ ...prev, [qid]: value }))
    autoSave()
  }

  const downloadPdf = async () => {
    if (!selectedId) return
    try {
      const report = await fetchAuditReport(selectedId)
      if (!report) {
        alert('Could not load the report.')
        return
      }
      downloadAuditReportPdf(report)
    } catch (e: any) {
      alert(e?.message || 'Could not download the PDF.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading ATR…
      </div>
    )
  }

  return (
    <div className={`${embedded ? 'max-w-none' : 'max-w-5xl'} mx-auto p-4 md:p-6 space-y-6`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Action Taken Report (ATR)</h1>
          <p className="text-sm text-gray-500">Fill action taken for parameters that scored below 60%.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadPdf}
            disabled={!selectedId}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Download the full audit report including the ATR"
          >
            <Download size={16} /> Download Full Report
          </button>
          {!embedded && (
            <button onClick={() => navigate('/audits')} className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
              <ChevronLeft size={16} /> Audit Entry
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {assignments.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            className={`px-4 py-2 rounded-lg border text-sm ${
              selectedId === a.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {a.department_code} · {a.cycle_label || `Cycle ${a.cycle_number}`}
          </button>
        ))}
        {assignments.length === 0 && <p className="text-gray-400 text-sm">No department assignments available for ATR.</p>}
      </div>

      {/* Audit info header */}
      {assignment && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-xl p-4">
            <div className="text-xs text-gray-500">Department</div>
            <div className="font-semibold text-gray-800">{assignment.department_code} - {assignment.department_name}</div>
          </div>
          <div className="border rounded-xl p-4">
            <div className="text-xs text-gray-500">Cycle</div>
            <div className="font-semibold text-gray-800">{assignment.cycle_label || `Cycle ${assignment.cycle_number}`}</div>
          </div>
          <div className="border rounded-xl p-4">
            <div className="text-xs text-gray-500">Auditor(s)</div>
            <div className="space-y-1">
              {assignment.auditors?.length ? (
                assignment.auditors.map((au) => (
                  <div key={au.id ?? au.staff_id} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-800">{au.name}</span>
                    {au.department && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                        {au.department.short_name || au.department.code || au.department.name}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <span className="text-gray-400 text-sm">—</span>
              )}
            </div>
          </div>
        </div>
      )}

      {assignment && atrRows.length === 0 && (
        <div className="border rounded-xl p-10 text-center text-gray-500">
          <CheckCircle2 className="mx-auto mb-3 text-green-500" size={40} />
          <p className="font-medium text-gray-600">No ATR required.</p>
          <p className="text-sm mt-1">All parameters scored at or above 60%.</p>
        </div>
      )}

      {assignment && atrRows.length > 0 && (
        <>
          <div className="flex items-center gap-3 border rounded-xl px-4 py-3 bg-white">
            <div className="flex items-center gap-2 text-sm">
              {saveState === 'saving' && <><Loader2 className="animate-spin text-blue-600" size={16} /> <span className="text-blue-600">Saving…</span></>}
              {saveState === 'saved' && <><CheckCircle2 className="text-green-600" size={16} /> <span className="text-green-600">{msg}</span></>}
              {saveState === 'error' && <><AlertCircle className="text-red-600" size={16} /> <span className="text-red-600">{msg}</span></>}
              {saveState === 'idle' && allSubmitted && <><CheckCircle2 className="text-green-600" size={16} /> <span className="text-green-600">ATR submitted — editing disabled</span></>}
              {saveState === 'idle' && !allSubmitted && <span className="text-gray-400">Auto-save enabled</span>}
            </div>
            <div className="ml-auto flex gap-2">
              <button onClick={() => persist(false)} disabled={saving || allSubmitted} className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                <Save size={16} /> Save
              </button>
              <button onClick={() => persist(true)} disabled={saving || allSubmitted} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                <Send size={16} /> {allSubmitted ? 'Submitted' : 'Submit ATR'}
              </button>
            </div>
          </div>

          {allSubmitted && (
            <div className="border rounded-xl p-4 bg-green-50 border-green-200 flex flex-wrap items-center gap-3">
              <CheckCircle2 className="text-green-600 shrink-0" size={20} />
              <div className="flex-1 text-sm text-green-800 min-w-[200px]">
                <span className="font-semibold">ATR submitted.</span> The full audit report (marks + ATR) is ready to download.
              </div>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
              >
                <Download size={16} /> Download Full Report
              </button>
            </div>
          )}

          <div className="space-y-4">
            {atrRows.map((r) => {
              const max = Number(r.max_marks) || 10
              const marks = Number(r.marks) || 0
              const pct = max ? Math.round((marks / max) * 100) : 0
              return (
                <div key={r.question_id} className="border border-red-200 rounded-xl p-4 bg-red-50/40">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 shrink-0 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-semibold">{r.sl_no}</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{r.details}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Score: <span className="font-semibold text-red-600">{r.marks} / {r.max_marks} ({pct}%)</span>
                        {r.comments && <span className="ml-2 italic">Auditor: “{r.comments}”</span>}
                      </div>
                    </div>
                    {r.status === 'SUBMITTED' && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Submitted</span>}
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-gray-500 flex items-center gap-1"><PenLine size={12} /> Action Taken</label>
                    <textarea
                      value={drafts[r.question_id] || ''}
                      onChange={(e) => updateDraft(r.question_id, e.target.value)}
                      readOnly={allSubmitted}
                      rows={2}
                      className={`w-full border rounded-lg px-3 py-2 text-sm mt-1 ${allSubmitted ? 'bg-gray-100 text-gray-500' : ''}`}
                      placeholder="Describe the corrective action taken…"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
