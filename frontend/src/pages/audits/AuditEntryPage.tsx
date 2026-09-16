import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle2, ClipboardList, Loader2, PenLine, Save, Send,
  AlertCircle, FileText, Lock, ShieldCheck, AlertTriangle,
} from 'lucide-react'
import {
  AuditAssignment, AuditAssignmentDetail, AuditRubric,
  fetchAuditAssignmentDetail, fetchAuditAssignments,
  fetchAuditRubrics, getAuditRubricDownloadUrl, saveAuditScores,
} from '../../services/audits'
import fetchWithAuth from '../../services/fetchAuth'
import ErrorToast from '../../components/ErrorToast'

type Draft = { marks: string; comments: string }

export default function AuditEntryPage() {
  const [searchParams] = useSearchParams()
  const [assignments, setAssignments] = useState<AuditAssignment[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AuditAssignmentDetail | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [errorPopup, setErrorPopup] = useState('')
  // Rubrics (latest PDF reference button)
  const [rubrics, setRubrics] = useState<AuditRubric[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  const canEdit = detail ? (detail.can_edit ?? (detail.status !== 'SUBMITTED' || Boolean(detail.is_iqac))) : true
  const canEditRef = useRef(canEdit)
  canEditRef.current = canEdit

  const loadAssignments = async () => {
    setLoading(true)
    try {
      const list = await fetchAuditAssignments(undefined, 'auditor')
      setAssignments(list)
      const paramId = searchParams.get('assignmentId') || searchParams.get('id')
      if (paramId && list.some((a) => a.id === Number(paramId))) {
        setSelectedId(Number(paramId))
      } else if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
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
      const d = await fetchAuditAssignmentDetail(selectedId)
      setDetail(d)
      if (d) {
        const next: Record<number, Draft> = {}
        for (const q of d.questions) {
          next[q.question_id] = { marks: q.marks ?? '', comments: q.comments || '' }
        }
        setDrafts(next)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  /** Open the most recent reference PDF (rubric uploaded by IQAC) in a new tab. */
  const openReferencePdf = async () => {
    // Open the tab synchronously (inside the user gesture) so popup blockers allow it.
    const win = window.open('', '_blank')
    try {
      let list = rubrics
      if (list.length === 0) {
        list = await fetchAuditRubrics()
        setRubrics(list)
      }
      if (list.length === 0) {
        win?.close()
        setErrorPopup('No reference PDF has been uploaded yet. Please contact IQAC.')
        return
      }
      // Rubrics are ordered newest-first (uploaded_at desc).
      const latest = list[0]
      const res = await fetchWithAuth(getAuditRubricDownloadUrl(latest.id))
      if (!res.ok) throw new Error('Could not open the reference PDF.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (win) {
        win.location.href = url
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      // Keep the object URL alive long enough for the new tab to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e: any) {
      win?.close()
      setErrorPopup(e?.message || 'Could not open the reference PDF.')
    }
  }

  const persist = async (submit: boolean) => {
    if (!detail) return
    if (!canEditRef.current && !submit) return

    // Check for over-max marks before saving/submitting
    const overMaxQuestions = detail.questions.filter((q) => {
      const m = draftsRef.current[q.question_id]?.marks
      if (m === '' || m === undefined) return false
      return Number(m) > Number(q.max_marks)
    })
    if (overMaxQuestions.length > 0) {
      setErrorPopup(
        `The following question(s) have marks exceeding the maximum allowed:\n\n` +
        overMaxQuestions.map((q) => `• Q${q.sl_no}: ${Number(draftsRef.current[q.question_id]?.marks)} > ${q.max_marks} (max)`).join('\n') +
        `\n\nPlease correct them before saving.`
      )
      return
    }

    const scores = Object.entries(draftsRef.current).map(([qid, d]) => ({
      question_id: Number(qid),
      marks: d.marks === '' ? null : Number(d.marks),
      comments: d.comments,
    }))
    setSaving(true)
    setSaveState('saving')
    try {
      await saveAuditScores(detail.id, { scores, submit })
      setSaveState('saved')
      setMsg(submit ? 'Audit submitted successfully.' : 'Saved.')
      // refresh detail totals
      const d = await fetchAuditAssignmentDetail(detail.id)
      setDetail(d)
    } catch (e: any) {
      setSaveState('error')
      const errMsg = e?.message || 'Save failed'
      setMsg(errMsg)
      setErrorPopup(errMsg)
    } finally {
      setSaving(false)
    }
  }

  const autoSave = () => {
    if (!canEditRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      persist(false)
    }, 1200)
  }

  const updateDraft = (questionId: number, patch: Partial<Draft>) => {
    if (!canEdit) return
    setDrafts((prev) => {
      const cur = prev[questionId] || { marks: '', comments: '' }
      const next = { ...cur, ...patch }
      return { ...prev, [questionId]: next }
    })
    autoSave()
  }

  const totals = useMemo(() => {
    if (!detail) return { total: 0, max: 0, pct: 0, below: 0, overMax: 0 }
    let total = 0
    let max = 0
    let below = 0
    let overMax = 0
    for (const q of detail.questions) {
      const m = drafts[q.question_id]?.marks
      const marks = m === '' || m === undefined ? 0 : Number(m)
      const qmax = Number(q.max_marks) || 0
      max += qmax
      total += Math.min(marks, qmax)
      if (marks < qmax * 0.6) below += 1
      if (marks > qmax) overMax += 1
    }
    const pct = max ? Math.round((total / max) * 1000) / 10 : 0
    return { total, max, pct, below, overMax }
  }, [detail, drafts])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading audit entry…
      </div>
    )
  }

  if (assignments.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="border rounded-xl p-10 text-center text-gray-500">
          <ClipboardList className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="font-medium text-gray-600">No audit assignments for you.</p>
          <p className="text-sm mt-1">You have not been assigned as an auditor for any department yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Error Popup */}
      {errorPopup && <ErrorToast message={errorPopup} onClose={() => setErrorPopup('')} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Audit Entry</h1>
          <p className="text-sm text-gray-500">
            {canEdit ? 'Enter marks and comments. Scores auto-save as you type.' : 'View audit marks and comments (Locked).'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openReferencePdf}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
            title="Open the latest reference PDF uploaded by IQAC"
          >
            <FileText size={16} /> Reference PDF
          </button>
        </div>
      </div>

      {/* Assignment selector */}
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
      </div>

      {detail && (
        <>
          {/* Status banners */}
          {!canEdit && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-900">
              <Lock className="shrink-0 text-amber-600" size={20} />
              <div className="text-sm">
                <span className="font-semibold">Audit Submitted & Finalized</span> — Scores and comments are locked in read-only mode for auditors. Only IQAC can make further changes.
              </div>
            </div>
          )}

          {detail.is_iqac && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 text-blue-900">
              <ShieldCheck className="shrink-0 text-blue-600" size={20} />
              <div className="text-sm">
                <span className="font-semibold">IQAC Edit Mode</span> — You have administrative access to edit scores and comments even after submission.
              </div>
            </div>
          )}

          {/* Over-max warning banner */}
          {totals.overMax > 0 && (
            <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 flex items-center gap-3 text-orange-900">
              <AlertTriangle className="shrink-0 text-orange-500" size={20} />
              <div className="text-sm">
                <span className="font-semibold">{totals.overMax} question(s) exceed the maximum marks.</span>{' '}
                Please reduce the marks to within the allowed range before saving.
              </div>
            </div>
          )}

          {/* Header summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded-xl p-4">
              <div className="text-xs text-gray-500">Department</div>
              <div className="font-semibold">{detail.department_code} - {detail.department_name}</div>
            </div>
            <div className="border rounded-xl p-4">
              <div className="text-xs text-gray-500">Cycle</div>
              <div className="font-semibold">{detail.cycle_label || `Cycle ${detail.cycle_number}`}</div>
            </div>
            <div className="border rounded-xl p-4">
              <div className="text-xs text-gray-500">Status</div>
              <div className="font-semibold flex items-center gap-1.5">
                {detail.status.replace('_', ' ')}
                {detail.status === 'SUBMITTED' && <Lock size={14} className="text-green-600" />}
              </div>
            </div>
            <div className="border rounded-xl p-4 bg-blue-50">
              <div className="text-xs text-gray-500">Score</div>
              <div className="font-semibold">{totals.total} / {totals.max} <span className="text-blue-600">({totals.pct}%)</span></div>
            </div>
          </div>

          {/* Question Set badge */}
          {detail.question_set_name && (
            <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2">
              <FileText size={15} />
              <span>Question Set: <strong>{detail.question_set_name}</strong></span>
            </div>
          )}

          {/* Save bar */}
          <div className="flex items-center gap-3 sticky top-0 z-10 bg-white/90 backdrop-blur border rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              {saveState === 'saving' && <><Loader2 className="animate-spin text-blue-600" size={16} /> <span className="text-blue-600">Saving…</span></>}
              {saveState === 'saved' && <><CheckCircle2 className="text-green-600" size={16} /> <span className="text-green-600">Saved</span></>}
              {saveState === 'error' && <><AlertCircle className="text-red-600" size={16} /> <span className="text-red-600">{msg}</span></>}
              {saveState === 'idle' && canEdit && <span className="text-gray-400">Auto-save enabled</span>}
              {saveState === 'idle' && !canEdit && <span className="text-amber-700 flex items-center gap-1"><Lock size={14} /> Read-only mode</span>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => persist(false)}
                disabled={saving || !canEdit || totals.overMax > 0}
                className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} /> Save
              </button>
              <button
                onClick={() => persist(true)}
                disabled={saving || !canEdit || detail.status === 'SUBMITTED' || totals.overMax > 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={16} /> {detail.status === 'SUBMITTED' ? 'Submitted' : 'Submit Audit'}
              </button>
            </div>
          </div>

          {/* Questions table */}
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 w-16">S.No</th>
                  <th className="text-left px-4 py-2">Details</th>
                  <th className="text-left px-4 py-2 w-16">Max</th>
                  <th className="text-left px-4 py-2 w-40">Marks Awarded</th>
                  <th className="text-left px-4 py-2 w-[38%]">Auditor's Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.questions.map((q) => {
                  const draft = drafts[q.question_id] || { marks: '', comments: '' }
                  const max = Number(q.max_marks) || 10
                  const marksNum = draft.marks === '' ? null : Number(draft.marks)
                  const below = marksNum !== null && !isNaN(marksNum) && marksNum < max * 0.6
                  const overMax = marksNum !== null && !isNaN(marksNum) && marksNum > max
                  return (
                    <tr key={q.question_id} className={`align-top ${overMax ? 'bg-orange-50/50' : below ? 'bg-red-50/40' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-semibold">{q.sl_no}</div>
                      </td>
                      <td className="px-4 py-3 min-w-[240px]">
                        <div className="font-medium text-gray-800">{q.details}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          <span className="font-medium">Checklist:</span> {q.documents_checklist}
                        </div>
                        {q.detailed_description && (
                          <div className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{q.detailed_description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{max}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          max={max}
                          step={0.5}
                          value={draft.marks}
                          disabled={!canEdit}
                          onChange={(e) => updateDraft(q.question_id, { marks: e.target.value })}
                          className={`w-28 border rounded-lg px-3 py-2 text-sm ${
                            overMax ? 'border-orange-400 bg-orange-50' : below ? 'border-red-300 bg-red-50' : ''
                          } ${!canEdit ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''}`}
                        />
                        {overMax && (
                          <div className="flex items-center gap-1 text-xs text-orange-600 mt-1 font-medium">
                            <AlertTriangle size={12} /> Exceeds max ({max})
                          </div>
                        )}
                        {!overMax && below && <div className="text-xs text-red-600 mt-1">Below 60% — ATR</div>}
                      </td>
                      <td className="px-4 py-3">
                        <textarea
                          value={draft.comments}
                          disabled={!canEdit}
                          onChange={(e) => updateDraft(q.question_id, { comments: e.target.value })}
                          rows={2}
                          className={`w-full border rounded-lg px-3 py-2 text-sm ${
                            !canEdit ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''
                          }`}
                          placeholder={canEdit ? 'Add your comment…' : 'No comments added'}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom save bar */}
          <div className="flex items-center gap-3 border rounded-xl px-4 py-3 bg-white">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <PenLine size={16} /> {totals.below} parameter(s) below 60% — these will require an ATR from the department HOD.
              {totals.overMax > 0 && (
                <span className="ml-2 text-orange-600 font-medium flex items-center gap-1">
                  <AlertTriangle size={14} /> {totals.overMax} over max
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => persist(false)}
                disabled={saving || !canEdit || totals.overMax > 0}
                className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} /> Save
              </button>
              <button
                onClick={() => persist(true)}
                disabled={saving || !canEdit || detail.status === 'SUBMITTED' || totals.overMax > 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={16} /> {detail.status === 'SUBMITTED' ? 'Submitted' : 'Submit Audit'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
