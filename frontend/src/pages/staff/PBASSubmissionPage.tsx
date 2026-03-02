import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalPortal } from '../../components/ModalPortal'
import {
  College,
  PBASCustomDepartment,
  PBASNode,
  PBASSubmissionReport,
  PBASViewer,
  createSubmissionLink,
  createSubmissionUpload,
  forwardTicketToMentor,
  getDepartmentNodes,
  getSubmissionReport,
  listColleges,
  listCustomDepartments,
} from '../../services/pbas'

type Props = {
  viewer: PBASViewer
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif']

function normalizeStr(v: any): string {
  return String(v ?? '').trim().toLowerCase()
}

function shuffleOnce<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function collegeLabel(c: College): string {
  const code = String(c.code || '').trim()
  const name = String(c.name || '').trim()
  if (code && name) return `${code} - ${name}`
  return code || name || `College ${c.id}`
}

function fileExt(name: string): string {
  const n = String(name || '')
  const idx = n.lastIndexOf('.')
  if (idx < 0) return ''
  return n.slice(idx + 1).trim().toLowerCase()
}

function validateEvidenceFile(f: File | null): string | null {
  if (!f) return 'Please select a file to upload.'
  if (f.size > MAX_UPLOAD_BYTES) return 'File too large. Max 10 MB.'

  const ext = fileExt(f.name)
  const mime = String((f as any).type || '').toLowerCase()

  const extOk = ext ? ALLOWED_EXTS.includes(ext) : false
  const mimeOk = mime ? (mime === 'application/pdf' || mime.startsWith('image/')) : false
  if (!extOk && !mimeOk) return 'Invalid file type. Allowed: PDF/images.'
  return null
}

function isLeaf(node: PBASNode | null | undefined): boolean {
  if (!node) return false
  return !node.children || node.children.length === 0
}

function findNodeByPath(roots: PBASNode[], path: string[]): PBASNode | null {
  let cur: PBASNode | null = null
  let nodes = roots
  for (const id of path) {
    const next = nodes.find((n) => n.id === id)
    if (!next) return null
    cur = next
    nodes = next.children || []
  }
  return cur
}

export default function PBASSubmissionPage({ viewer }: Props) {
  const navigate = useNavigate()
  const isStudent = viewer === 'student'
  const pageTitle = isStudent ? 'My Progress' : 'PBAS Submission'
  const deptLabel = isStudent ? 'Department' : 'Custom Department'
  const nodeLabel = isStudent ? 'Progress Item' : 'PBAS Node'
  const noDeptsText = isStudent ? 'No departments available.' : 'No PBAS departments available.'
  const noItemsText = isStudent ? 'No items for this department.' : 'No PBAS items for this department.'
  const [departments, setDepartments] = useState<PBASCustomDepartment[]>([])
  const [deptId, setDeptId] = useState<string>('')
  const [roots, setRoots] = useState<PBASNode[]>([])
  const [path, setPath] = useState<string[]>([])

  const [colleges, setColleges] = useState<College[]>([])
  const [collegeId, setCollegeId] = useState<string>('')
  const [collegeQuery, setCollegeQuery] = useState('')
  const [collegeOpen, setCollegeOpen] = useState(false)
  const [collegeSuggested, setCollegeSuggested] = useState<College[]>([])

  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  const [successOpen, setSuccessOpen] = useState(false)
  const [redirectIn, setRedirectIn] = useState(3)

  const [reportOpen, setReportOpen] = useState(false)
  const [reportSlide, setReportSlide] = useState(0)
  const [report, setReport] = useState<PBASSubmissionReport | null>(null)
  const [forwardBusy, setForwardBusy] = useState(false)

  const selectedNode = useMemo(() => findNodeByPath(roots, path), [roots, path])
  const leaf = useMemo(() => isLeaf(selectedNode), [selectedNode])

  useEffect(() => {
    let cancelled = false
    setError('')
    setSuccess('')

    listCustomDepartments(viewer)
      .then((d) => {
        if (cancelled) return
        setDepartments(d)
        if (d.length === 1) setDeptId(d[0].id)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message || 'Failed to load departments')
      })

    return () => {
      cancelled = true
    }
  }, [viewer])

  useEffect(() => {
    if (!successOpen) return
    setRedirectIn(3)

    const tick = window.setInterval(() => {
      setRedirectIn((s) => Math.max(0, s - 1))
    }, 1000)

    const t = window.setTimeout(() => {
      navigate('/dashboard')
    }, 3000)

    return () => {
      window.clearInterval(tick)
      window.clearTimeout(t)
    }
  }, [successOpen, navigate])

  useEffect(() => {
    let cancelled = false
    setRoots([])
    setPath([])
    setLink('')
    setFile(null)
    setCollegeId('')
    setCollegeQuery('')
    setCollegeOpen(false)
    setError('')
    setSuccess('')
    setSuccessOpen(false)
    setReportOpen(false)
    setReportSlide(0)
    setReport(null)

    if (!deptId) return

    getDepartmentNodes(deptId, viewer)
      .then((data) => {
        if (cancelled) return
        setRoots(data)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message || (isStudent ? 'Failed to load items' : 'Failed to load PBAS nodes'))
      })

    return () => {
      cancelled = true
    }
  }, [deptId, viewer])

  useEffect(() => {
    if (!leaf || !selectedNode?.college_required) return
    if (colleges.length) return

    listColleges()
      .then((c) => {
        setColleges(c)
        setCollegeSuggested(shuffleOnce(c).slice(0, 10))
      })
      .catch(() => {
        /* ignore */
      })
  }, [leaf, selectedNode, colleges.length])

  const selectedCollege = useMemo(() => {
    if (!collegeId) return null
    const idNum = Number(collegeId)
    if (!Number.isFinite(idNum)) return null
    return colleges.find((c) => c.id === idNum) || null
  }, [collegeId, colleges])

  useEffect(() => {
    if (!selectedNode?.college_required) return
    if (!collegeId) {
      setCollegeQuery('')
      return
    }
    if (selectedCollege) setCollegeQuery(collegeLabel(selectedCollege))
  }, [collegeId, selectedCollege, selectedNode])

  const collegeMatches = useMemo(() => {
    const q = normalizeStr(collegeQuery)
    if (!q) return collegeSuggested

    const scored = colleges
      .map((c) => {
        const code = normalizeStr(c.code)
        const name = normalizeStr(c.name)
        const starts = (code && code.startsWith(q)) || (name && name.startsWith(q))
        const includes = (code && code.includes(q)) || (name && name.includes(q))
        let score = 99
        if (starts) score = 0
        else if (includes) score = 1
        return { c, score }
      })
      .filter((x) => x.score < 99)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score
        return collegeLabel(a.c).localeCompare(collegeLabel(b.c))
      })

    return scored.slice(0, 12).map((x) => x.c)
  }, [collegeQuery, colleges, collegeSuggested])

  const levels = useMemo(() => {
    const out: { options: PBASNode[]; selected: string }[] = []
    let options = roots

    for (let i = 0; i < Math.max(1, path.length + 1); i++) {
      const selected = path[i] || ''
      out.push({ options, selected })
      const next = options.find((n) => n.id === selected)
      if (!next) break
      options = next.children || []
      if (!options.length) break
    }

    return out
  }, [roots, path])

  function setLevelSelection(levelIndex: number, nodeId: string) {
    setError('')
    setSuccess('')
    setLink('')
    setFile(null)
    setCollegeId('')
    setCollegeQuery('')
    setCollegeOpen(false)

    const nextPath = path.slice(0, levelIndex)
    if (nodeId) nextPath[levelIndex] = nodeId
    setPath(nextPath)
  }

  async function onSubmit() {
    setError('')
    setSuccess('')
    if (!selectedNode || !leaf) {
      setError('Select a leaf node to submit evidence.')
      return
    }

    const college = collegeId ? Number(collegeId) : null
    if (selectedNode.college_required && !collegeId) {
      setError('Please select a college.')
      return
    }

    setBusy(true)
    try {
      let created: any = null
      if (selectedNode.input_mode === 'link') {
        if (!link.trim()) {
          setError('Please enter a link.')
          return
        }
        created = await createSubmissionLink({ node: selectedNode.id, link: link.trim(), college })
        setPath([])
        setCollegeId('')
        setCollegeQuery('')
        setLink('')
        setFile(null)
        setSuccess('Submission successful.')
        if (!isStudent) {
          setSuccessOpen(true)
        }
      } else {
        const fileErr = validateEvidenceFile(file)
        if (fileErr) {
          setError(fileErr)
          return
        }
        created = await createSubmissionUpload({ node: selectedNode.id, file, college })
        setPath([])
        setCollegeId('')
        setCollegeQuery('')
        setLink('')
        setFile(null)
        setSuccess('Submission successful.')
        if (!isStudent) {
          setSuccessOpen(true)
        }
      }

      if (isStudent && created?.id) {
        try {
          const rep = await getSubmissionReport(String(created.id))
          setReport(rep)
          setReportSlide(0)
          setReportOpen(true)
        } catch (e: any) {
          // fall back to existing success flow
          setSuccessOpen(true)
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  async function onForwardToMentor() {
    if (!report?.ticket?.id) {
      setError('Mentor ticket not available.')
      return
    }
    setError('')
    setForwardBusy(true)
    try {
      await forwardTicketToMentor(report.ticket.id)
      setReportOpen(false)
      setSuccess('Forwarded to mentor.')
      setSuccessOpen(true)
    } catch (e: any) {
      setError(e?.message || 'Forward failed')
    } finally {
      setForwardBusy(false)
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{pageTitle}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {isStudent
                ? 'Select a department and navigate to a final item to submit evidence.'
                : 'Select a department and navigate to a leaf node to submit evidence.'}
            </p>
          </div>
        </div>

        {error ? <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div> : null}
        {success ? <div className="mt-4 p-3 rounded-md border border-green-200 bg-green-50 text-green-800 text-sm">{success}</div> : null}

        {reportOpen && report ? (
          <ModalPortal>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={() => setReportOpen(false)} />
              <div className="relative w-full max-w-xl mx-4 bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-500">My Progress Report</div>
                    <div className="text-lg font-semibold text-gray-900">Submission Summary</div>
                  </div>
                  <button className="text-gray-500 hover:text-gray-700" onClick={() => setReportOpen(false)} type="button">
                    ✕
                  </button>
                </div>

                {reportSlide === 0 ? (
                  <div className="mt-4 space-y-4">
                    <div className="border rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-800">Student</div>
                      <div className="text-sm text-gray-700 mt-1">
                        <div>Name: {report.student?.username || '—'}</div>
                        <div>Reg No: {report.student?.reg_no || '—'}</div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-800">Submission</div>
                      <div className="text-sm text-gray-700 mt-1 space-y-1">
                        <div>Department: {report.department?.title || '—'}</div>
                        <div>Item: {report.submission?.node?.label || '—'}</div>
                        {report.submission?.college ? (
                          <div>
                            College: {(report.submission.college.code ? report.submission.college.code + ' - ' : '') + (report.submission.college.name || '')}
                          </div>
                        ) : null}
                        {report.submission?.submission_type === 'link' ? (
                          <div>
                            Link:{' '}
                            <a className="text-blue-600 hover:underline" href={report.submission.link || '#'} target="_blank" rel="noreferrer">
                              {report.submission.link || '—'}
                            </a>
                          </div>
                        ) : (
                          <div>
                            Upload:{' '}
                            {report.submission.file_url ? (
                              <a className="text-blue-600 hover:underline" href={report.submission.file_url} target="_blank" rel="noreferrer">
                                {report.submission.file_name || 'View file'}
                              </a>
                            ) : (
                              <span>{report.submission.file_name || '—'}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-800">Department Incharge / Access Staff</div>
                      <div className="mt-2 space-y-1">
                        {(report.department?.access_staffs || []).length ? (
                          report.department.access_staffs.map((s, idx) => (
                            <div key={idx} className="text-sm text-gray-700">
                              {(s.username ? s.username + ' • ' : '') + (s.staff_id || '—')}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500">No access staff configured.</div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button className="px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50" onClick={() => setReportOpen(false)}>
                        Close
                      </button>
                      <button className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={() => setReportSlide(1)}>
                        Next
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="border rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-800">Mentor</div>
                      <div className="text-sm text-gray-700 mt-1">
                        <div>Name: {report.mentor?.username || '—'}</div>
                        <div>Staff ID: {report.mentor?.staff_id || '—'}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50"
                        onClick={() => setReportSlide(0)}
                        disabled={forwardBusy}
                      >
                        Back
                      </button>
                      <button
                        className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                        onClick={onForwardToMentor}
                        disabled={forwardBusy}
                      >
                        {forwardBusy ? 'Forwarding…' : 'Forward'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ModalPortal>
        ) : null}

        <div className="mt-4 bg-white border rounded-lg p-4 space-y-4">
          <label className="block">
            <div className="text-sm font-medium text-gray-700">{deptLabel}</div>
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 bg-white"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
            >
              <option value="">-- Select department --</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            {!departments.length ? (
              <div className="mt-2 text-sm text-gray-600">{noDeptsText}</div>
            ) : null}
          </label>

          {deptId ? (
            <div>
              <div className="text-sm font-medium text-gray-700">{nodeLabel}</div>
              <div className="text-xs text-gray-500 mt-1">Choose step-by-step until you reach the final item.</div>

              {!roots.length ? (
                <div className="mt-3 text-sm text-gray-600">{noItemsText}</div>
              ) : null}

              <div className="mt-2 space-y-3">
                {levels.map((lvl, idx) => (
                  <select
                    key={idx}
                    className="w-full border rounded-md px-3 py-2 bg-white"
                    value={lvl.selected}
                    onChange={(e) => setLevelSelection(idx, e.target.value)}
                    disabled={!lvl.options.length}
                  >
                    <option value="">Select</option>
                    {lvl.options.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label || '(Untitled)'}
                      </option>
                    ))}
                  </select>
                ))}
              </div>

              {selectedNode ? (
                <div className="mt-3 text-sm text-gray-700">
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Audience: {selectedNode.audience}</span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Mode: {selectedNode.input_mode}</span>
                    {selectedNode.college_required ? (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">College required</span>
                    ) : null}
                    {selectedNode.limit != null ? (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Limit: {selectedNode.limit}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {leaf && selectedNode ? (
                <div className="mt-4 border-t pt-4 space-y-4">
                  {selectedNode.college_required ? (
                    <label className="block">
                      <div className="text-sm font-medium text-gray-700">College</div>
                      <div className="relative">
                        <input
                          className="mt-1 w-full border rounded-md px-3 py-2 bg-white"
                          placeholder="Type college code or name"
                          value={collegeQuery}
                          onChange={(e) => {
                            setCollegeQuery(e.target.value)
                            setCollegeOpen(true)
                            setCollegeId('')
                          }}
                          onFocus={() => {
                            setCollegeOpen(true)
                          }}
                          onBlur={() => {
                            window.setTimeout(() => setCollegeOpen(false), 150)
                          }}
                          autoComplete="off"
                          disabled={busy}
                        />

                        {collegeOpen && collegeMatches.length ? (
                          <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-sm max-h-60 overflow-auto">
                            {collegeMatches.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={() => {
                                  setCollegeId(String(c.id))
                                  setCollegeQuery(collegeLabel(c))
                                  setCollegeOpen(false)
                                }}
                                disabled={busy}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-gray-900 truncate">{collegeLabel(c)}</div>
                                  {c.code ? (
                                    <div className="text-gray-500 font-mono text-xs">{String(c.code)}</div>
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">Click and type to search. Suggestions appear when empty.</div>
                    </label>
                  ) : null}

                  {selectedNode.input_mode === 'link' ? (
                    <label className="block">
                      <div className="text-sm font-medium text-gray-700">Evidence Link</div>
                      <input
                        className="mt-1 w-full border rounded-md px-3 py-2"
                        placeholder="https://..."
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                  ) : (
                    <label className="block">
                      <div className="text-sm font-medium text-gray-700">Upload Evidence</div>
                      <input
                        className="mt-1 w-full"
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        disabled={busy}
                      />
                      <div className="text-xs text-gray-500 mt-1">Allowed: PDF/images • Max: 10 MB</div>
                    </label>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50"
                      onClick={() => {
                        setError('')
                        setSuccess('')
                        setLink('')
                        setFile(null)
                        setCollegeId('')
                        setCollegeQuery('')
                        setCollegeOpen(false)
                      }}
                      disabled={busy}
                    >
                      Reset
                    </button>
                    <button
                      className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      onClick={onSubmit}
                      disabled={busy}
                    >
                      {busy ? 'Saving…' : 'Save submission'}
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedNode && !leaf ? (
                <div className="mt-4 text-sm text-gray-600">Select a child node to continue.</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {successOpen ? (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl border overflow-hidden">
              <div className="px-4 py-3 border-b">
                <div className="text-lg font-semibold text-gray-900">Submission successful</div>
                <div className="text-sm text-gray-600 mt-0.5">Redirecting to dashboard in {redirectIn}s…</div>
              </div>
              <div className="px-4 py-3 flex items-center justify-end gap-2">
                <button
                  className="px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50"
                  onClick={() => navigate('/dashboard')}
                >
                  Go now
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  )
}
