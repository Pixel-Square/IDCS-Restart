import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  LineChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  ClipboardList, Download, FileSpreadsheet, Loader2, PlusCircle,
  RefreshCw, BarChart3, AlertCircle, CheckCircle2, Building2,
  Pencil, Trash2, X, Plus, Save, Lock, ShieldCheck, BookOpen,
  Upload, Layers, AlertTriangle, FileText, ChevronDown,
} from 'lucide-react'
import {
  AuditAssignment, AuditAssignmentDetail, AuditConsolidated, AuditCycle, AuditDepartment,
  AuditQuestion, AuditQuestionSet, AuditRubric, AuditStaff,
  createAuditAssignment, createAuditQuestion, createAuditQuestionSet,
  deleteAuditAssignment, deleteAuditQuestion, deleteAuditQuestionSet, deleteAuditRubric,
  fetchAuditAssignmentDetail, fetchAuditAssignments, fetchAuditConsolidated,
  fetchAuditCycles, fetchAuditDepartments, fetchAuditQuestions,
  fetchAuditQuestionSets, fetchAuditReport, fetchAuditRubrics,
  fetchAuditStaff, importAuditQuestions, initDefaultQuestionSet,
  removeAuditAuditor, saveAuditScores, updateAuditQuestion, updateAuditQuestionSet,
  uploadAuditRubric,
} from '../../services/audits'
import { downloadAuditReportPdf, downloadConsolidatedAuditPdf } from '../../utils/auditReportPdf'
import ErrorToast from '../../components/ErrorToast'
import { usePasswordConfirm } from '../../components/PasswordConfirm'
import AuditATRPage from './AuditATRPage'

type TabKey = 'assignments' | 'consolidated' | 'questions' | 'cycles' | 'atr'
type QSubTab = 'questions' | 'sets' | 'rubrics'

const formatPct = (n?: number) => (n === undefined || n === null ? '—' : `${n}%`)

export default function AuditManagementPage() {
  const [tab, setTab] = useState<TabKey>('assignments')
  const [qSubTab, setQSubTab] = useState<QSubTab>('questions')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorPopup, setErrorPopup] = useState('')
  const passwordConfirm = usePasswordConfirm()

  const [cycles, setCycles] = useState<AuditCycle[]>([])
  const [departments, setDepartments] = useState<AuditDepartment[]>([])
  const [staff, setStaff] = useState<AuditStaff[]>([])
  const [questions, setQuestions] = useState<AuditQuestion[]>([])
  const [questionSets, setQuestionSets] = useState<AuditQuestionSet[]>([])
  const [rubrics, setRubrics] = useState<AuditRubric[]>([])
  const [assignments, setAssignments] = useState<AuditAssignment[]>([])
  const [consolidated, setConsolidated] = useState<AuditConsolidated[]>([])

  // Cycles tab: expandable per-department marks sheet
  const [expandedDept, setExpandedDept] = useState<number | null>(null)
  const [deptDetails, setDeptDetails] = useState<Record<number, AuditAssignmentDetail>>({})
  const [deptLoadingId, setDeptLoadingId] = useState<number | null>(null)

  // Assignment creation form
  const [formOpen, setFormOpen] = useState(false)
  const [formCycle, setFormCycle] = useState<number | ''>('')
  const [formDept, setFormDept] = useState<number | ''>('')
  const [formAuditors, setFormAuditors] = useState<number[]>([])
  const [auditorDept, setAuditorDept] = useState<number | ''>('')
  const [formRemarks, setFormRemarks] = useState('')
  const [formQuestionSet, setFormQuestionSet] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [formMsg, setFormMsg] = useState('')

  // Question import
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  // Question create / edit
  const [addingQ, setAddingQ] = useState(false)
  const [editingQId, setEditingQId] = useState<number | null>(null)
  const [qForm, setQForm] = useState({
    sl_no: '', details: '', documents_checklist: '', detailed_description: '', max_marks: '',
  })
  const [qSaving, setQSaving] = useState(false)
  const [qMsg, setQMsg] = useState('')

  // Question Set create / edit
  const [addingSet, setAddingSet] = useState(false)
  const [editingSetId, setEditingSetId] = useState<number | null>(null)
  const [setForm, setSetForm] = useState({ name: '', description: '', question_ids: [] as number[] })
  const [setSaving2, setSetSaving2] = useState(false)
  const [setMsg, setSetMsg] = useState('')

  // Inline "add new question" inside the set editor
  const [setNewQOpen, setSetNewQOpen] = useState(false)
  const [setNewQForm, setSetNewQForm] = useState({
    sl_no: '', details: '', documents_checklist: '', detailed_description: '', max_marks: '',
  })
  const [setNewQSaving, setSetNewQSaving] = useState(false)
  const [setNewQMsg, setSetNewQMsg] = useState('')

  // Rubric upload
  const rubricInputRef = useRef<HTMLInputElement>(null)
  const [rubricUploading, setRubricUploading] = useState(false)
  const [rubricName, setRubricName] = useState('')
  const [rubricMsg, setRubricMsg] = useState('')

  // Auditor removal (consolidated)
  const [removingAuditor, setRemovingAuditor] = useState<{ assignmentId: number; staffId: number } | null>(null)

  // IQAC Audit Edit Modal
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null)
  const [editDetail, setEditDetail] = useState<AuditAssignmentDetail | null>(null)
  const [editDrafts, setEditDrafts] = useState<Record<number, { marks: string; comments: string }>>({})
  const [editStatus, setEditStatus] = useState<'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED'>('SUBMITTED')
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')
  const [editError, setEditError] = useState('')

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [c, d, s, q, qs, r, a, con] = await Promise.all([
        fetchAuditCycles(),
        fetchAuditDepartments(),
        fetchAuditStaff(),
        fetchAuditQuestions(),
        fetchAuditQuestionSets(),
        fetchAuditRubrics(),
        fetchAuditAssignments(),
        fetchAuditConsolidated(),
      ])
      setCycles(c)
      setDepartments(d)
      setStaff(s)
      setQuestions(q)
      setQuestionSets(qs)
      setRubrics(r)
      setAssignments(a)
      setConsolidated(con)
    } catch (e: any) {
      setError(e?.message || 'Failed to load audit data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredStaff = useMemo(() => {
    if (auditorDept === '') return staff
    return staff.filter((s) => s.department && s.department.id === Number(auditorDept))
  }, [staff, auditorDept])

  const toggleAuditor = (id: number) => {
    setFormAuditors((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const createAssignment = async () => {
    if (!formCycle || !formDept || formAuditors.length === 0) {
      setFormMsg('Please select cycle, department and at least one auditor.')
      return
    }
    setSaving(true)
    setFormMsg('')
    try {
      await createAuditAssignment({
        cycle_id: Number(formCycle),
        department_id: Number(formDept),
        auditor_ids: formAuditors,
        remarks: formRemarks,
        question_set_id: formQuestionSet !== '' ? Number(formQuestionSet) : null,
      })
      setFormOpen(false)
      setFormCycle('')
      setFormDept('')
      setFormAuditors([])
      setFormRemarks('')
      setFormQuestionSet('')
      await loadAll()
    } catch (e: any) {
      const msg = e?.message || 'Failed to create assignment'
      setFormMsg(msg)
      setErrorPopup(msg)
    } finally {
      setSaving(false)
    }
  }

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg('')
    try {
      const res = await importAuditQuestions(file)
      setImportMsg(`Imported ${res.imported} question(s). Total active: ${res.total_questions}.`)
      await loadAll()
    } catch (err: any) {
      const msg = err?.message || 'Import failed'
      setImportMsg(msg)
      setErrorPopup(msg)
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  const openAddQuestion = () => {
    setQForm({ sl_no: '', details: '', documents_checklist: '', detailed_description: '', max_marks: '' })
    setEditingQId(null)
    setQMsg('')
    setAddingQ(true)
  }

  const startEditQuestion = (q: AuditQuestion) => {
    setQForm({
      sl_no: String(q.sl_no),
      details: q.details,
      documents_checklist: q.documents_checklist || '',
      detailed_description: q.detailed_description || '',
      max_marks: String(q.max_marks),
    })
    setEditingQId(q.id)
    setAddingQ(false)
    setQMsg('')
  }

  const cancelQForm = () => {
    setAddingQ(false)
    setEditingQId(null)
    setQMsg('')
  }

  const saveQuestion = async () => {
    const sl_no = Number(qForm.sl_no)
    const maxMarks = Number(qForm.max_marks)
    if (!qForm.details.trim() || !sl_no) {
      setQMsg('Please fill S.No and Details.')
      return
    }
    setQSaving(true)
    setQMsg('')
    const payload = {
      sl_no,
      details: qForm.details.trim(),
      documents_checklist: qForm.documents_checklist,
      detailed_description: qForm.detailed_description,
      max_marks: Number.isFinite(maxMarks) ? maxMarks : 10,
    }
    try {
      if (editingQId !== null) {
        await updateAuditQuestion(editingQId, payload)
        setQMsg('Question updated.')
      } else {
        await createAuditQuestion(payload)
        setQMsg('Question added — it will now appear for the auditors.')
      }
      cancelQForm()
      await loadAll()
    } catch (e: any) {
      const msg = e?.message || 'Failed to save question'
      setQMsg(msg)
      setErrorPopup(msg)
    } finally {
      setQSaving(false)
    }
  }

  const removeQuestion = (q: AuditQuestion) => {
    passwordConfirm.ask({
      title: 'Delete Question',
      message: `Delete question "Q${q.sl_no}. ${q.details.slice(0, 60)}"?\n\nIt will be hidden from new audits (existing scores are kept).`,
      actionLabel: 'Delete Question',
      onConfirm: async (password) => {
        await deleteAuditQuestion(q.id, password)
        await loadAll()
      },
    })
  }

  // ── Question Set handlers ────────────────────────────────────────────────

  const openAddSet = () => {
    setSetForm({ name: '', description: '', question_ids: [] })
    setEditingSetId(null)
    setSetMsg('')
    setAddingSet(true)
  }

  const startEditSet = (qs: AuditQuestionSet) => {
    setSetForm({ name: qs.name, description: qs.description || '', question_ids: qs.question_ids })
    setEditingSetId(qs.id)
    setSetMsg('')
    setAddingSet(true)
  }

  const cancelSetForm = () => {
    setAddingSet(false)
    setEditingSetId(null)
    setSetMsg('')
    setSetNewQOpen(false)
    setSetNewQMsg('')
  }

  const toggleSetQuestion = (id: number) => {
    setSetForm((f) => ({
      ...f,
      question_ids: f.question_ids.includes(id)
        ? f.question_ids.filter((x) => x !== id)
        : [...f.question_ids, id],
    }))
  }

  /** Open the inline "add new question" form inside the set editor (prefills next S.No). */
  const openSetNewQ = () => {
    const nextSl = questions.length ? Math.max(...questions.map((q) => q.sl_no)) + 1 : 1
    setSetNewQForm({ sl_no: String(nextSl), details: '', documents_checklist: '', detailed_description: '', max_marks: '10' })
    setSetNewQMsg('')
    setSetNewQOpen(true)
  }

  /** Create a brand-new question and add it to the set currently being edited. */
  const saveSetNewQ = async () => {
    const sl_no = Number(setNewQForm.sl_no)
    if (!setNewQForm.details.trim() || !sl_no) {
      setSetNewQMsg('Please fill S.No and Details.')
      return
    }
    setSetNewQSaving(true)
    setSetNewQMsg('')
    try {
      const q = await createAuditQuestion({
        sl_no,
        details: setNewQForm.details.trim(),
        documents_checklist: setNewQForm.documents_checklist,
        detailed_description: setNewQForm.detailed_description,
        max_marks: Number(setNewQForm.max_marks) || 10,
      })
      setQuestions((prev) => [...prev, q].sort((a, b) => a.sl_no - b.sl_no))
      setSetForm((f) => ({
        ...f,
        question_ids: f.question_ids.includes(q.id) ? f.question_ids : [...f.question_ids, q.id],
      }))
      setSetNewQOpen(false)
      setSetNewQMsg('')
    } catch (e: any) {
      setSetNewQMsg(e?.message || 'Failed to add question')
    } finally {
      setSetNewQSaving(false)
    }
  }

  /** Delete a question (password-gated) from within the set editor and drop it from the set. */
  const removeSetQuestion = (q: AuditQuestion) => {
    passwordConfirm.ask({
      title: 'Delete Question',
      message: `Delete question "Q${q.sl_no}. ${q.details.slice(0, 60)}"?\n\nIt will be hidden from all question sets and new audits.`,
      actionLabel: 'Delete Question',
      onConfirm: async (password) => {
        await deleteAuditQuestion(q.id, password)
        setQuestions((prev) => prev.filter((x) => x.id !== q.id))
        setSetForm((f) => ({ ...f, question_ids: f.question_ids.filter((x) => x !== q.id) }))
      },
    })
  }

  const saveSet = async () => {
    if (!setForm.name.trim()) { setSetMsg('Please enter a name for the question set.'); return }
    if (setForm.question_ids.length === 0) { setSetMsg('Please select at least one question.'); return }
    setSetSaving2(true)
    setSetMsg('')
    try {
      if (editingSetId !== null) {
        await updateAuditQuestionSet(editingSetId, {
          name: setForm.name,
          description: setForm.description,
          question_ids: setForm.question_ids,
        })
        setSetMsg('Question set updated.')
      } else {
        await createAuditQuestionSet({
          name: setForm.name,
          description: setForm.description,
          question_ids: setForm.question_ids,
        })
        setSetMsg('Question set created.')
      }
      cancelSetForm()
      await loadAll()
    } catch (e: any) {
      const msg = e?.message || 'Failed to save question set'
      setSetMsg(msg)
      setErrorPopup(msg)
    } finally {
      setSetSaving2(false)
    }
  }

  const removeSet = (qs: AuditQuestionSet) => {
    passwordConfirm.ask({
      title: 'Delete Question Set',
      message: `Delete question set "${qs.name}"?\n\nIt will be hidden from new assignments.`,
      actionLabel: 'Delete Set',
      onConfirm: async (password) => {
        await deleteAuditQuestionSet(qs.id, password)
        await loadAll()
      },
    })
  }

  // ── Rubric handlers ───────────────────────────────────────────────────────

  const onRubricFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const name = rubricName.trim() || file.name
    setRubricUploading(true)
    setRubricMsg('')
    try {
      await uploadAuditRubric(name, file)
      setRubricMsg('Rubric uploaded successfully.')
      setRubricName('')
      await loadAll()
    } catch (err: any) {
      const msg = err?.message || 'Upload failed'
      setRubricMsg(msg)
      setErrorPopup(msg)
    } finally {
      setRubricUploading(false)
      if (rubricInputRef.current) rubricInputRef.current.value = ''
    }
  }

  const removeRubric = (r: AuditRubric) => {
    passwordConfirm.ask({
      title: 'Remove Rubric PDF',
      message: `Remove rubric "${r.name}"?\n\nIt will no longer be available to auditors.`,
      actionLabel: 'Remove',
      onConfirm: async (password) => {
        await deleteAuditRubric(r.id, password)
        await loadAll()
      },
    })
  }

  // ── Auditor removal ────────────────────────────────────────────────────────

  const removeAuditor = async (assignmentId: number, auditor: { id?: number; staff_id: string; name: string }) => {
    if (!auditor.id) return
    if (!window.confirm(`Remove auditor "${auditor.name}" from this assignment?`)) return
    setRemovingAuditor({ assignmentId, staffId: auditor.id })
    try {
      await removeAuditAuditor(assignmentId, auditor.id)
      await loadAll()
    } catch (e: any) {
      setErrorPopup(e?.message || 'Failed to remove auditor')
    } finally {
      setRemovingAuditor(null)
    }
  }

  const removeAssignment = (a: AuditAssignment) => {
    passwordConfirm.ask({
      title: 'Delete Audit Assignment',
      message: `Delete the audit for ${a.department_code} (${a.department_name}) · ${a.cycle_label || `Cycle ${a.cycle_number}`}?\n\nThis will permanently remove the audit, including all scores and ATR data. This action cannot be undone.`,
      actionLabel: 'Delete Audit',
      onConfirm: async (password) => {
        await deleteAuditAssignment(a.id, password)
        await loadAll()
      },
    })
  }

  const downloadReport = async (assignmentId: number) => {
    try {
      const report = await fetchAuditReport(assignmentId)
      if (!report) { setErrorPopup('Could not load the report.'); return }
      downloadAuditReportPdf(report)
    } catch (e: any) {
      setErrorPopup(e?.message || 'Failed to download report')
    }
  }

  const toggleDeptMarks = async (assignmentId: number) => {
    if (expandedDept === assignmentId) {
      setExpandedDept(null)
      return
    }
    setExpandedDept(assignmentId)
    if (!deptDetails[assignmentId]) {
      setDeptLoadingId(assignmentId)
      try {
        const d = await fetchAuditAssignmentDetail(assignmentId)
        if (d) setDeptDetails((prev) => ({ ...prev, [assignmentId]: d }))
      } catch (e: any) {
        setErrorPopup(e?.message || 'Could not load marks')
      } finally {
        setDeptLoadingId(null)
      }
    }
  }

  // ── IQAC Edit Modal ────────────────────────────────────────────────────────

  const openEditModal = async (assignmentId: number) => {
    setEditingAssignmentId(assignmentId)
    setEditLoading(true)
    setEditMsg('')
    setEditError('')
    try {
      const d = await fetchAuditAssignmentDetail(assignmentId)
      setEditDetail(d)
      if (d) {
        setEditStatus(d.status)
        const next: Record<number, { marks: string; comments: string }> = {}
        for (const q of d.questions) {
          next[q.question_id] = { marks: q.marks ?? '', comments: q.comments || '' }
        }
        setEditDrafts(next)
      }
    } catch (e: any) {
      setEditError(e?.message || 'Failed to load audit details')
    } finally {
      setEditLoading(false)
    }
  }

  const closeEditModal = () => {
    setEditingAssignmentId(null)
    setEditDetail(null)
    setEditDrafts({})
    setEditMsg('')
    setEditError('')
  }

  const updateEditDraft = (questionId: number, patch: Partial<{ marks: string; comments: string }>) => {
    setEditDrafts((prev) => {
      const cur = prev[questionId] || { marks: '', comments: '' }
      return { ...prev, [questionId]: { ...cur, ...patch } }
    })
  }

  const editTotals = useMemo(() => {
    if (!editDetail) return { total: 0, max: 0, pct: 0, below: 0, overMax: 0 }
    let total = 0; let max = 0; let below = 0; let overMax = 0
    for (const q of editDetail.questions) {
      const m = editDrafts[q.question_id]?.marks
      const marks = m === '' || m === undefined ? 0 : Number(m)
      const qmax = Number(q.max_marks) || 0
      max += qmax
      total += Math.min(marks, qmax)
      if (marks < qmax * 0.6) below += 1
      if (marks > qmax) overMax += 1
    }
    const pct = max ? Math.round((total / max) * 1000) / 10 : 0
    return { total: Math.round(total * 100) / 100, max: Math.round(max * 100) / 100, pct, below, overMax }
  }, [editDetail, editDrafts])

  const handleSaveEdit = async () => {
    if (!editingAssignmentId) return

    // Over-max check
    if (editDetail && editTotals.overMax > 0) {
      const over = editDetail.questions.filter((q) => {
        const m = editDrafts[q.question_id]?.marks
        return m !== '' && m !== undefined && Number(m) > Number(q.max_marks)
      })
      setErrorPopup(
        `Cannot save — the following question(s) exceed max marks:\n\n` +
        over.map((q) => `• Q${q.sl_no}: ${editDrafts[q.question_id]?.marks} > ${q.max_marks}`).join('\n')
      )
      return
    }

    setEditSaving(true)
    setEditMsg('')
    setEditError('')
    const scores = Object.entries(editDrafts).map(([qid, d]) => ({
      question_id: Number(qid),
      marks: d.marks === '' ? null : Number(d.marks),
      comments: d.comments,
    }))
    try {
      await saveAuditScores(editingAssignmentId, { scores, status: editStatus })
      setEditMsg('Audit scores and status updated successfully.')
      await loadAll()
      const updated = await fetchAuditAssignmentDetail(editingAssignmentId)
      setEditDetail(updated)
    } catch (e: any) {
      const msg = e?.message || 'Failed to save audit changes'
      setEditError(msg)
      setErrorPopup(msg)
    } finally {
      setEditSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading audits…
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Error Popup */}
      {errorPopup && <ErrorToast message={errorPopup} onClose={() => setErrorPopup('')} />}

      {/* Password confirmation modal */}
      {passwordConfirm.modal}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Academic Audit Management</h1>
          <p className="text-sm text-gray-500">Assign auditors, review consolidated scores and export reports.</p>
        </div>
        <button onClick={loadAll} className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="text-red-600 text-sm flex items-center gap-2"><AlertCircle size={16} />{error}</div>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b">
        {([
          ['assignments', 'Assignments', ClipboardList],
          ['consolidated', 'Consolidated Review', BarChart3],
          ['questions', 'Questions', FileSpreadsheet],
          ['cycles', 'Cycles', RefreshCw],
          ['atr', 'ATR', FileText],
        ] as [TabKey, string, any][]).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
              tab === key ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* ─── Assignments tab ─── */}
      {tab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <PlusCircle size={16} /> New Assignment
            </button>
          </div>

          {formOpen && (
            <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
              <h2 className="font-semibold text-gray-700">Create Audit Assignment</h2>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Cycle</label>
                  <select value={formCycle} onChange={(e) => setFormCycle(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="">Select cycle…</option>
                    {cycles.map((c) => <option key={c.id} value={c.id}>{c.label || `Cycle ${c.cycle}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Department</label>
                  <select value={formDept} onChange={(e) => setFormDept(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="">Select department…</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Question Set dropdown */}
              <div>
                <label className="text-xs text-gray-500">Question Set <span className="text-gray-400">(optional — leave blank to use all active questions)</span></label>
                <select
                  value={formQuestionSet}
                  onChange={(e) => setFormQuestionSet(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                >
                  <option value="">All active questions</option>
                  {questionSets.map((qs) => (
                    <option key={qs.id} value={qs.id}>{qs.name} ({qs.question_count} questions)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500">Auditors (multi-select)</label>
                <div className="flex items-center gap-2 mt-1">
                  <select
                    value={auditorDept}
                    onChange={(e) => setAuditorDept(e.target.value === '' ? '' : Number(e.target.value))}
                    className="border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
                  </select>
                  <span className="text-xs text-gray-500">Select a department to list its faculty</span>
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-lg bg-white p-2 mt-2 grid md:grid-cols-2 gap-1">
                  {filteredStaff.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm p-1 rounded hover:bg-blue-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formAuditors.includes(s.id)}
                        onChange={() => toggleAuditor(s.id)}
                        className="rounded"
                      />
                      <span>{s.name}</span>
                      <span className="text-xs text-gray-400">{s.staff_id}</span>
                      <span className="text-xs text-gray-400 ml-auto">{s.department?.short_name || s.department?.code || ''}</span>
                    </label>
                  ))}
                  {filteredStaff.length === 0 && <p className="text-sm text-gray-400 p-2">No staff found in this department.</p>}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500">Remarks</label>
                <textarea value={formRemarks} onChange={(e) => setFormRemarks(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" rows={2} />
              </div>

              {formMsg && <div className="text-sm text-red-600">{formMsg}</div>}
              <div className="flex gap-2">
                <button onClick={createAssignment} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {saving && <Loader2 className="animate-spin" size={16} />} Create
                </button>
                <button onClick={() => setFormOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Cycle</th>
                  <th className="text-left px-4 py-2">Department</th>
                  <th className="text-left px-4 py-2">Auditors</th>
                  <th className="text-left px-4 py-2">Q.Set</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Score</th>
                  <th className="text-left px-4 py-2">%</th>
                  <th className="text-left px-4 py-2">Below 60%</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{a.cycle_label || `Cycle ${a.cycle_number}`}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{a.department_code}</div>
                      <div className="text-xs text-gray-400">{a.department_name}</div>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {a.auditors?.map((au) => `${au.name} (${au.staff_id})`).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-indigo-700">
                      {a.question_set_name || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        a.status === 'SUBMITTED' ? 'bg-green-100 text-green-700'
                          : a.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>{a.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-2">{a.total_marks ?? 0} / {a.max_marks ?? 0}</td>
                    <td className="px-4 py-2">{formatPct(a.percentage)}</td>
                    <td className="px-4 py-2">{a.below_60_count ?? 0}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(a.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          title="Edit audit scores"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          onClick={() => downloadReport(a.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
                        >
                          <Download size={13} /> PDF
                        </button>
                        <button
                          onClick={() => removeAssignment(a)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete this audit assignment (requires password; removes scores and ATR data)"
                        >
                          <Trash2 size={13} /> Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No assignments yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Consolidated tab ─── */}
      {tab === 'consolidated' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-gray-500">Consolidated audit scores of all departments across cycles.</p>
            <button
              onClick={() => downloadConsolidatedAuditPdf(consolidated)}
              disabled={consolidated.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <Download size={16} /> Download Consolidated PDF
            </button>
          </div>
          {consolidated.map((c) => {
            const chartData = c.departments.map((d) => ({
              name: d.department_code,
              fullName: d.department_name,
              percentage: d.percentage,
              total: d.total_marks,
              max: d.max_marks,
              below: d.below_60_count,
            }))
            return (
            <div key={c.cycle_id} className="border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 font-semibold text-gray-700 flex items-center gap-2">
                <Building2 size={16} /> {c.label}
              </div>

              {chartData.length > 0 && (
                <div className="px-4 py-4 border-b">
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Department-wise Score Comparison (%)</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} angle={-20} textAnchor="end" height={44} interval={0} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, fontSize: 12 }}
                        formatter={(value: any) => [`${value}%`, 'Score']}
                        labelFormatter={(label: any, payload: any) => (payload?.[0]?.payload?.fullName || label)}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <ReferenceLine
                        y={60}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{ value: '60%', position: 'insideTopRight', fontSize: 11, fill: '#ef4444' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="percentage"
                        name="Score %"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props
                          const color = Number(payload?.percentage) >= 60 ? '#10b981' : '#ef4444'
                          return (
                            <circle
                              key={payload?.department_code || `${cx}-${cy}`}
                              cx={cx}
                              cy={cy}
                              r={4.5}
                              fill={color}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                            />
                          )
                        }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2">Department</th>
                      <th className="text-left px-4 py-2">Auditors</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-left px-4 py-2">Total</th>
                      <th className="text-left px-4 py-2">%</th>
                      <th className="text-left px-4 py-2">Below 60%</th>
                      <th className="text-left px-4 py-2">ATR (Done/Pending)</th>
                      <th className="text-right px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {c.departments.map((d) => (
                      <tr key={d.assignment_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="font-medium">{d.department_code}</div>
                          <div className="text-xs text-gray-400">{d.department_name}</div>
                        </td>
                        <td className="px-4 py-2">
                          {d.auditors.length === 0 ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {d.auditors.map((a) => (
                                <span key={a.staff_id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                                  {a.name}
                                  <button
                                    title="Remove auditor"
                                    onClick={() => removeAuditor(d.assignment_id, a)}
                                    disabled={removingAuditor?.assignmentId === d.assignment_id && removingAuditor.staffId === a.id}
                                    className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                                  >
                                    {removingAuditor?.assignmentId === d.assignment_id && removingAuditor.staffId === a.id
                                      ? <Loader2 className="animate-spin" size={12} />
                                      : <X size={12} />}
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            d.status === 'SUBMITTED' ? 'bg-green-100 text-green-700' : d.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                          }`}>{d.status.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-2">{d.total_marks} / {d.max_marks}</td>
                        <td className="px-4 py-2 font-medium">{formatPct(d.percentage)}</td>
                        <td className="px-4 py-2">{d.below_60_count}</td>
                        <td className="px-4 py-2 text-xs">
                          <span className="text-green-600">{d.atr_submitted} done</span> / <span className="text-amber-600">{d.atr_pending} pending</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(d.assignment_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              title="Edit audit scores"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              onClick={() => downloadReport(d.assignment_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <Download size={13} /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {c.departments.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No assignments in this cycle.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* ─── Questions tab ─── */}
      {tab === 'questions' && (
        <div className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-1 border-b pb-0">
            {([
              ['questions', 'Questions', FileSpreadsheet],
              ['sets', 'Question Sets', Layers],
              ['rubrics', 'Audit Rubrics', BookOpen],
            ] as [QSubTab, string, any][]).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setQSubTab(key)}
                className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg border-b-2 ${
                  qSubTab === key ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {/* ── Individual Questions ── */}
          {qSubTab === 'questions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-gray-500">{questions.length} active question(s).</p>
                <div className="flex items-center gap-2">
                  <input ref={importRef} type="file" accept=".xlsx" onChange={onImport} className="hidden" />
                  <button
                    onClick={() => importRef.current?.click()}
                    disabled={importing}
                    className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />} Import Excel
                  </button>
                  <button
                    onClick={openAddQuestion}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    <Plus size={16} /> Add Question
                  </button>
                </div>
              </div>
              {importMsg && <div className="text-sm text-blue-700 flex items-center gap-2"><CheckCircle2 size={16} />{importMsg}</div>}
              {qMsg && <div className="text-sm text-blue-700 flex items-center gap-2"><CheckCircle2 size={16} />{qMsg}</div>}
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2 w-16">S.No</th>
                      <th className="text-left px-4 py-2">Details</th>
                      <th className="text-left px-4 py-2">Documents Checklist</th>
                      <th className="text-left px-4 py-2 w-24">Max Marks</th>
                      <th className="text-right px-4 py-2 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {questions.map((q) =>
                      editingQId === q.id ? (
                        <tr key={q.id} className="bg-blue-50/50 align-top">
                          <td className="px-4 py-2">
                            <input type="number" min={1} value={qForm.sl_no} onChange={(e) => setQForm((f) => ({ ...f, sl_no: e.target.value }))} className="w-16 border rounded-lg px-2 py-1.5 text-sm" />
                          </td>
                          <td className="px-4 py-2">
                            <input value={qForm.details} onChange={(e) => setQForm((f) => ({ ...f, details: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="Question details…" />
                            <input value={qForm.detailed_description} onChange={(e) => setQForm((f) => ({ ...f, detailed_description: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1 text-gray-500" placeholder="Detailed description (optional)…" />
                          </td>
                          <td className="px-4 py-2">
                            <textarea value={qForm.documents_checklist} onChange={(e) => setQForm((f) => ({ ...f, documents_checklist: e.target.value }))} rows={2} className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="Documents checklist…" />
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" min={1} step={0.5} value={qForm.max_marks} onChange={(e) => setQForm((f) => ({ ...f, max_marks: e.target.value }))} className="w-24 border rounded-lg px-2 py-1.5 text-sm" />
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <button onClick={saveQuestion} disabled={qSaving} className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                              {qSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save
                            </button>
                            <button onClick={cancelQForm} className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg ml-1 hover:bg-gray-50">
                              <X size={14} /> Cancel
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={q.id} className="hover:bg-gray-50 align-top">
                          <td className="px-4 py-2">{q.sl_no}</td>
                          <td className="px-4 py-2">
                            <div className="font-medium">{q.details}</div>
                            {q.detailed_description && <div className="text-xs text-gray-400 mt-0.5">{q.detailed_description}</div>}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500">{q.documents_checklist}</td>
                          <td className="px-4 py-2">{q.max_marks}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <button onClick={() => startEditQuestion(q)} className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg text-blue-700 hover:bg-blue-50">
                              <Pencil size={14} /> Edit
                            </button>
                            <button onClick={() => removeQuestion(q)} className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-lg text-red-600 hover:bg-red-50 ml-1">
                              <Trash2 size={14} /> Delete
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add question form */}
              {addingQ && (
                <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
                  <h2 className="font-semibold text-gray-700">Add New Audit Question</h2>
                  <div className="grid md:grid-cols-[120px_1fr] gap-3">
                    <div>
                      <label className="text-xs text-gray-500">S.No</label>
                      <input type="number" min={1} value={qForm.sl_no} onChange={(e) => setQForm((f) => ({ ...f, sl_no: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Details</label>
                      <input value={qForm.details} onChange={(e) => setQForm((f) => ({ ...f, details: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="Question / parameter details…" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Detailed Description <span className="text-gray-400">(optional)</span></label>
                    <textarea value={qForm.detailed_description} onChange={(e) => setQForm((f) => ({ ...f, detailed_description: e.target.value }))} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Documents Checklist <span className="text-gray-400">(optional)</span></label>
                    <textarea value={qForm.documents_checklist} onChange={(e) => setQForm((f) => ({ ...f, documents_checklist: e.target.value }))} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  <div className="max-w-[160px]">
                    <label className="text-xs text-gray-500">Max Marks</label>
                    <input type="number" min={1} step={0.5} value={qForm.max_marks} onChange={(e) => setQForm((f) => ({ ...f, max_marks: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
                  </div>
                  {qMsg && <div className="text-sm text-red-600">{qMsg}</div>}
                  <div className="flex gap-2">
                    <button onClick={saveQuestion} disabled={qSaving} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                      {qSaving && <Loader2 className="animate-spin" size={16} />} Add Question
                    </button>
                    <button onClick={cancelQForm} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Question Sets ── */}
          {qSubTab === 'sets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-gray-500">
                  {questionSets.length} question set(s). Each set's questions are saved independently — editing "Set 1" never affects "Set 2". Sets can be selected when creating a new assignment.
                </p>
                <div className="flex items-center gap-2">
                  {questions.length > 0 && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await initDefaultQuestionSet()
                          setSetMsg(res.created ? `'Set 1' created with ${res.question_set.question_count} questions.` : `'Set 1' updated with ${res.question_set.question_count} questions.`)
                          await loadAll()
                        } catch (e: any) {
                          setErrorPopup(e?.message || 'Failed to initialise Set 1')
                        }
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg text-sm hover:bg-indigo-100"
                      title="Create 'Set 1' containing all currently active questions"
                    >
                      <Layers size={16} /> Init 'Set 1' with All Questions
                    </button>
                  )}
                  <button onClick={openAddSet} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                    <Plus size={16} /> New Question Set
                  </button>
                </div>
              </div>
              {setMsg && !addingSet && <div className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 size={16} />{setMsg}</div>}

              {/* Create / Edit set form */}
              {addingSet && (
                <div className="border rounded-xl p-4 bg-indigo-50/50 space-y-3">
                  <h2 className="font-semibold text-gray-700">{editingSetId ? 'Edit Question Set' : 'Create New Question Set'}</h2>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Name</label>
                      <input value={setForm.name} onChange={(e) => setSetForm((f) => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="e.g. Cycle 1 – CIA Audit Questions" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Description <span className="text-gray-400">(optional)</span></label>
                      <input value={setForm.description} onChange={(e) => setSetForm((f) => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="Brief description…" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-gray-500">Select Questions ({setForm.question_ids.length} selected)</label>
                      <button
                        onClick={setNewQOpen ? () => { setSetNewQOpen(false); setSetNewQMsg('') } : openSetNewQ}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-indigo-300 text-indigo-700 bg-white rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        {setNewQOpen ? <X size={13} /> : <Plus size={13} />}
                        {setNewQOpen ? 'Cancel New Question' : 'Add New Question'}
                      </button>
                    </div>

                    {/* Inline new-question form */}
                    {setNewQOpen && (
                      <div className="border rounded-lg bg-white p-3 mb-2 space-y-2">
                        <div className="text-xs font-semibold text-gray-600">Add a new question to this set</div>
                        <div className="grid md:grid-cols-[90px_1fr_90px] gap-2">
                          <div>
                            <label className="text-[11px] text-gray-500">S.No</label>
                            <input type="number" min={1} value={setNewQForm.sl_no} onChange={(e) => setSetNewQForm((f) => ({ ...f, sl_no: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500">Details</label>
                            <input value={setNewQForm.details} onChange={(e) => setSetNewQForm((f) => ({ ...f, details: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5" placeholder="Question / parameter details…" />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-500">Max Marks</label>
                            <input type="number" min={1} step={0.5} value={setNewQForm.max_marks} onChange={(e) => setSetNewQForm((f) => ({ ...f, max_marks: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500">Documents Checklist <span className="text-gray-400">(optional)</span></label>
                          <textarea value={setNewQForm.documents_checklist} onChange={(e) => setSetNewQForm((f) => ({ ...f, documents_checklist: e.target.value }))} rows={1} className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500">Detailed Description <span className="text-gray-400">(optional)</span></label>
                          <textarea value={setNewQForm.detailed_description} onChange={(e) => setSetNewQForm((f) => ({ ...f, detailed_description: e.target.value }))} rows={1} className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5" />
                        </div>
                        {setNewQMsg && <div className="text-sm text-red-600">{setNewQMsg}</div>}
                        <div className="flex gap-2">
                          <button onClick={saveSetNewQ} disabled={setNewQSaving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                            {setNewQSaving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />} Add to Set
                          </button>
                          <button onClick={() => { setSetNewQOpen(false); setSetNewQMsg('') }} className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                        </div>
                      </div>
                    )}

                    <div className="max-h-64 overflow-y-auto border rounded-lg bg-white divide-y">
                      {questions.map((q) => (
                        <div key={q.id} className="flex items-start gap-3 px-3 py-2 hover:bg-indigo-50 group">
                          <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={setForm.question_ids.includes(q.id)}
                              onChange={() => toggleSetQuestion(q.id)}
                              className="mt-0.5 rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold text-gray-600 mr-1">Q{q.sl_no}.</span>
                              <span className="text-sm text-gray-800">{q.details}</span>
                              <span className="ml-2 text-xs text-gray-400">Max: {q.max_marks}</span>
                            </div>
                          </label>
                          <button
                            onClick={() => removeSetQuestion(q)}
                            className="shrink-0 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete this question (removes it from all sets)"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {questions.length === 0 && <p className="text-sm text-gray-400 p-3">No active questions found. Add a new question above.</p>}
                    </div>
                  </div>
                  {setMsg && <div className="text-sm text-red-600">{setMsg}</div>}
                  <div className="flex gap-2">
                    <button onClick={saveSet} disabled={setSaving2} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                      {setSaving2 && <Loader2 className="animate-spin" size={16} />} {editingSetId ? 'Update Set' : 'Create Set'}
                    </button>
                    <button onClick={cancelSetForm} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                  </div>
                </div>
              )}

              {/* Question Sets list */}
              <div className="grid md:grid-cols-2 gap-4">
                {questionSets.map((qs) => (
                  <div key={qs.id} className="border rounded-xl p-4 space-y-2 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-gray-800">{qs.name}</div>
                        {qs.description && <div className="text-xs text-gray-500 mt-0.5">{qs.description}</div>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEditSet(qs)} className="p-1.5 text-xs border rounded-lg text-blue-700 hover:bg-blue-50"><Pencil size={13} /></button>
                        <button onClick={() => removeSet(qs)} className="p-1.5 text-xs border rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                        <Layers size={11} /> {qs.question_count} questions
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {qs.questions_detail.map((q) => (
                        <span key={q.id} className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">Q{q.sl_no}</span>
                      ))}
                    </div>
                  </div>
                ))}
                {questionSets.length === 0 && !addingSet && (
                  <div className="col-span-2 border rounded-xl p-8 text-center text-gray-400">
                    <Layers className="mx-auto mb-2 text-gray-300" size={32} />
                    <p>No question sets yet. Create one to group questions for specific audits.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Audit Rubrics ── */}
          {qSubTab === 'rubrics' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-gray-500">Upload audit rubric PDFs for auditors to reference during mark entry.</p>
                <div className="flex items-center gap-2">
                  <input
                    className="border rounded-lg px-3 py-2 text-sm w-48"
                    placeholder="Rubric name (optional)…"
                    value={rubricName}
                    onChange={(e) => setRubricName(e.target.value)}
                  />
                  <input ref={rubricInputRef} type="file" accept=".pdf" onChange={onRubricFile} className="hidden" />
                  <button
                    onClick={() => rubricInputRef.current?.click()}
                    disabled={rubricUploading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {rubricUploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} Upload PDF
                  </button>
                </div>
              </div>
              {rubricMsg && (
                <div className={`text-sm flex items-center gap-2 ${rubricMsg.includes('success') ? 'text-green-700' : 'text-red-600'}`}>
                  {rubricMsg.includes('success') ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {rubricMsg}
                </div>
              )}

              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2">Name</th>
                      <th className="text-left px-4 py-2">Uploaded By</th>
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="text-right px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rubrics.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <BookOpen size={15} className="text-red-500 shrink-0" />
                            <span className="font-medium text-gray-800">{r.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.uploaded_by_name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(r.uploaded_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {r.file_url && (
                              <a
                                href={r.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border rounded-lg text-gray-700 hover:bg-gray-100"
                              >
                                <Download size={13} /> Open
                              </a>
                            )}
                            <button onClick={() => removeRubric(r)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border rounded-lg text-red-600 hover:bg-red-50">
                              <Trash2 size={13} /> Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {rubrics.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No rubrics uploaded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Cycles tab ─── */}
      {tab === 'cycles' && (
        <div className="space-y-6">
          {cycles.map((c) => {
            const cycleAssignments = assignments.filter((a) => a.cycle_number === c.cycle)
            return (
              <div key={c.id} className="border rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 flex items-center gap-3 border-b">
                  <div className="w-8 h-8 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">{c.cycle}</div>
                  <div>
                    <div className="font-semibold text-gray-800">{c.label || c.name || `Cycle ${c.cycle}`}</div>
                    <div className="text-xs text-gray-500">{cycleAssignments.length} assignment(s)</div>
                  </div>
                </div>

                {cycleAssignments.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-400 text-sm">No assignments in this cycle.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-4 py-2">Department</th>
                          <th className="text-left px-4 py-2">Auditors</th>
                          <th className="text-left px-4 py-2">Status</th>
                          <th className="text-left px-4 py-2">Marks</th>
                          <th className="text-left px-4 py-2">%</th>
                          <th className="text-left px-4 py-2">Below 60%</th>
                          <th className="text-right px-4 py-2">Marks Sheet</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {cycleAssignments.map((a) => (
                          <Fragment key={a.id}>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-2">
                                <div className="font-medium text-gray-800">{a.department_code}</div>
                                <div className="text-xs text-gray-400">{a.department_name}</div>
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-700">
                                {a.auditors?.length ? (
                                  a.auditors.map((au) => (
                                    <div key={au.id ?? au.staff_id} className="flex flex-wrap items-center gap-1.5 py-0.5">
                                      <span>{au.name}</span>
                                      {au.department && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-medium">
                                          {au.department.short_name || au.department.code || au.department.name}
                                        </span>
                                      )}
                                    </div>
                                  ))
                                ) : '—'}
                              </td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  a.status === 'SUBMITTED' ? 'bg-green-100 text-green-700'
                                    : a.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>{a.status.replace('_', ' ')}</span>
                              </td>
                              <td className="px-4 py-2">{a.total_marks ?? 0} / {a.max_marks ?? 0}</td>
                              <td className="px-4 py-2 font-medium">{formatPct(a.percentage)}</td>
                              <td className="px-4 py-2">
                                {(a.below_60_count ?? 0) > 0
                                  ? <span className="text-red-600 font-medium">{a.below_60_count}</span>
                                  : <span className="text-gray-400">0</span>}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  onClick={() => toggleDeptMarks(a.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-lg text-blue-700 hover:bg-blue-50 transition-colors"
                                  title={expandedDept === a.id ? 'Hide question-wise marks' : 'Show question-wise marks'}
                                >
                                  <ChevronDown size={14} className={`transition-transform ${expandedDept === a.id ? 'rotate-180' : ''}`} />
                                  {expandedDept === a.id ? 'Hide Marks' : 'View Marks'}
                                </button>
                              </td>
                            </tr>
                            {expandedDept === a.id && (
                              <tr>
                                <td colSpan={7} className="px-4 py-3 bg-blue-50/30">
                                  {deptDetails[a.id] ? (
                                    <div className="overflow-x-auto border rounded-lg bg-white">
                                      <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-600">
                                          <tr>
                                            <th className="text-left px-3 py-2 w-14">S.No</th>
                                            <th className="text-left px-3 py-2">Details</th>
                                            <th className="text-left px-3 py-2 w-14">Max</th>
                                            <th className="text-left px-3 py-2 w-24">Score</th>
                                            <th className="text-left px-3 py-2 w-16">%</th>
                                            <th className="text-left px-3 py-2 w-[38%]">Auditor's Comment</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {deptDetails[a.id].questions.map((q) => {
                                            const max = Number(q.max_marks) || 0
                                            const rawMarks = q.marks === null || q.marks === undefined || q.marks === '' ? null : Number(q.marks)
                                            const pct = max && rawMarks !== null ? Math.round((rawMarks / max) * 100) : 0
                                            const below = q.below_60
                                            return (
                                              <tr key={q.question_id} className={`align-top ${below ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}>
                                                <td className="px-3 py-2">
                                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${below ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                                                    {q.sl_no}
                                                  </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                  <div className="font-medium text-gray-800">{q.details}</div>
                                                  {q.documents_checklist && (
                                                    <div className="text-xs text-gray-500 mt-0.5"><span className="font-medium">Checklist:</span> {q.documents_checklist}</div>
                                                  )}
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-600">{max}</td>
                                                <td className="px-3 py-2">
                                                  <span className={`font-semibold ${rawMarks === null ? 'text-gray-400' : below ? 'text-red-600' : 'text-gray-800'}`}>
                                                    {rawMarks === null ? '—' : rawMarks} / {max}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                  <span className={`font-medium ${rawMarks === null ? 'text-gray-400' : below ? 'text-red-600' : 'text-green-600'}`}>
                                                    {rawMarks === null ? '—' : `${pct}%`}
                                                  </span>
                                                  {rawMarks !== null && below && <div className="text-[10px] text-red-500 font-medium">ATR</div>}
                                                </td>
                                                <td className="px-3 py-2 text-xs text-gray-600">{q.comments || '—'}</td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center py-4 text-gray-400 text-sm">
                                      <Loader2 className="animate-spin mr-2" size={16} /> Loading marks…
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── ATR tab (embedded) ─── */}
      {tab === 'atr' && <AuditATRPage embedded />}

      {/* ─── IQAC Audit Edit Modal ─── */}
      {editingAssignmentId !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-blue-600" size={20} />
                  <h2 className="text-lg font-bold text-gray-800">
                    {editDetail ? `Edit Audit — ${editDetail.department_code} (${editDetail.department_name})` : 'Edit Audit'}
                  </h2>
                </div>
                {editDetail && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {editDetail.cycle_label || `Cycle ${editDetail.cycle_number}`} · Assigned Auditors: {editDetail.auditors?.map((a) => a.name).join(', ') || 'None'}
                    {editDetail.question_set_name && <span className="ml-2 text-indigo-600">· Set: {editDetail.question_set_name}</span>}
                  </p>
                )}
              </div>
              <button onClick={closeEditModal} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {editLoading && (
                <div className="flex items-center justify-center h-48 text-gray-500">
                  <Loader2 className="animate-spin mr-2" size={20} /> Loading audit data…
                </div>
              )}

              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} /> {editError}
                </div>
              )}

              {editMsg && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-3 rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={16} /> {editMsg}
                </div>
              )}

              {/* Over-max warning in modal */}
              {editTotals.overMax > 0 && (
                <div className="bg-orange-50 border border-orange-300 text-orange-900 text-sm p-3 rounded-xl flex items-center gap-2">
                  <AlertTriangle size={16} className="text-orange-500 shrink-0" />
                  <span><strong>{editTotals.overMax} question(s)</strong> have marks exceeding the maximum. Please correct before saving.</span>
                </div>
              )}

              {editDetail && !editLoading && (
                <>
                  {/* Status & Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="border rounded-xl p-3 bg-gray-50/50">
                      <label className="text-xs font-medium text-gray-500">Audit Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as any)}
                        className="w-full border rounded-lg px-2.5 py-1.5 text-sm mt-1 bg-white font-medium"
                      >
                        <option value="SUBMITTED">Submitted (Locked for Auditors)</option>
                        <option value="IN_PROGRESS">In Progress (Auditors Can Edit)</option>
                        <option value="NOT_STARTED">Not Started</option>
                      </select>
                    </div>
                    <div className="border rounded-xl p-3 bg-blue-50/50">
                      <div className="text-xs font-medium text-gray-500">Calculated Score</div>
                      <div className="text-lg font-bold text-blue-700 mt-0.5">
                        {editTotals.total} / {editTotals.max} <span className="text-sm font-semibold">({editTotals.pct}%)</span>
                      </div>
                    </div>
                    <div className={`border rounded-xl p-3 ${editTotals.below > 0 ? 'bg-amber-50/50 border-amber-200' : 'bg-green-50/50'}`}>
                      <div className="text-xs font-medium text-gray-500">Below 60% Parameters (ATR Required)</div>
                      <div className={`text-lg font-bold mt-0.5 ${editTotals.below > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                        {editTotals.below} parameter(s)
                      </div>
                    </div>
                  </div>

                  {/* Questions Table */}
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-3 py-2 w-14">S.No</th>
                          <th className="text-left px-3 py-2">Details & Description</th>
                          <th className="text-left px-3 py-2 w-16">Max</th>
                          <th className="text-left px-3 py-2 w-36">Marks</th>
                          <th className="text-left px-3 py-2 w-[38%]">Comments</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {editDetail.questions.map((q) => {
                          const draft = editDrafts[q.question_id] || { marks: '', comments: '' }
                          const max = Number(q.max_marks) || 10
                          const marksNum = draft.marks === '' ? null : Number(draft.marks)
                          const below = marksNum !== null && !isNaN(marksNum) && marksNum < max * 0.6
                          const overMax = marksNum !== null && !isNaN(marksNum) && marksNum > max
                          return (
                            <tr key={q.question_id} className={`align-top ${overMax ? 'bg-orange-50/40' : below ? 'bg-red-50/40' : 'hover:bg-gray-50'}`}>
                              <td className="px-3 py-2.5">
                                <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold">
                                  {q.sl_no}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 min-w-[220px]">
                                <div className="font-medium text-gray-800 text-xs md:text-sm">{q.details}</div>
                                {q.documents_checklist && (
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    <span className="font-medium">Checklist:</span> {q.documents_checklist}
                                  </div>
                                )}
                                {q.detailed_description && (
                                  <div className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{q.detailed_description}</div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600">{max}</td>
                              <td className="px-3 py-2.5">
                                <input
                                  type="number"
                                  min={0}
                                  max={max}
                                  step={0.5}
                                  value={draft.marks}
                                  onChange={(e) => updateEditDraft(q.question_id, { marks: e.target.value })}
                                  className={`w-24 border rounded-lg px-2.5 py-1.5 text-sm ${
                                    overMax ? 'border-orange-400 bg-orange-50' : below ? 'border-red-300 bg-red-50' : ''
                                  }`}
                                />
                                {overMax && (
                                  <div className="flex items-center gap-1 text-[11px] text-orange-600 font-medium mt-0.5">
                                    <AlertTriangle size={11} /> Exceeds max ({max})
                                  </div>
                                )}
                                {!overMax && below && <div className="text-[11px] text-red-600 font-medium mt-0.5">Below 60% — ATR</div>}
                              </td>
                              <td className="px-3 py-2.5">
                                <textarea
                                  value={draft.comments}
                                  onChange={(e) => updateEditDraft(q.question_id, { comments: e.target.value })}
                                  rows={2}
                                  className="w-full border rounded-lg px-2.5 py-1.5 text-xs"
                                  placeholder="Comments or notes…"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Total: <span className="font-semibold text-gray-800">{editTotals.total} / {editTotals.max}</span> ({editTotals.pct}%)
                {editTotals.overMax > 0 && <span className="ml-2 text-orange-600 font-medium">· {editTotals.overMax} over max</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={closeEditModal} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100 transition-colors">
                  Close
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving || editLoading || !editDetail || editTotals.overMax > 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {editSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
