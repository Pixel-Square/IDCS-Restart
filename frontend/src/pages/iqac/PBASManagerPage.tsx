import React, { useEffect, useMemo, useState } from 'react'
import { ModalPortal } from '../../components/ModalPortal'
import fetchWithAuth from '../../services/fetchAuth'
import {
  PBASCustomDepartment,
  PBASNode,
  createCustomDepartment,
  deleteCustomDepartment,
  getDepartmentTree,
  listCustomDepartments,
  patchCustomDepartment,
  updateDepartmentTree,
} from '../../services/pbas'

type StaffSuggestion = {
  staff_id: string
  username: string
}

function normalizeStr(s: any): string {
  return String(s ?? '').trim().toLowerCase()
}

function tokenAfterLastComma(value: string): string {
  const idx = value.lastIndexOf(',')
  return normalizeStr(idx >= 0 ? value.slice(idx + 1) : value)
}

function replaceTokenAfterLastComma(value: string, replacement: string): string {
  const idx = value.lastIndexOf(',')
  const prefix = idx >= 0 ? value.slice(0, idx + 1) : ''
  const trimmedPrefix = prefix.trimEnd()
  const needsSpace = trimmedPrefix.endsWith(',')
  const newPrefix = trimmedPrefix ? trimmedPrefix + (needsSpace ? ' ' : '') : ''
  return newPrefix + replacement
}

function sortStaffSuggestions(list: StaffSuggestion[], query: string): StaffSuggestion[] {
  const q = normalizeStr(query)
  const score = (s: StaffSuggestion) => {
    const id = normalizeStr(s.staff_id)
    const u = normalizeStr(s.username)
    if (!q) return 50
    if (id === q || u === q) return 0
    if (id.startsWith(q) || u.startsWith(q)) return 1
    if (id.includes(q) || u.includes(q)) return 2
    return 9
  }

  return [...list].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    if (sa !== sb) return sa - sb
    return normalizeStr(a.username || a.staff_id).localeCompare(normalizeStr(b.username || b.staff_id))
  })
}

function addStaffIdToAccessText(current: string, staffId: string): string {
  const merged = parseAccesses([current, staffId].filter(Boolean).join(', '))
  return merged.join(', ')
}

function AccessesTypeaheadInput(props: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  staffOptions: StaffSuggestion[]
  ensureLoaded: () => void
}) {
  const { value, onChange, disabled, placeholder, staffOptions, ensureLoaded } = props
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)

  const query = tokenAfterLastComma(value)
  const filtered = useMemo(() => {
    const sorted = sortStaffSuggestions(staffOptions, query)
    if (!query) return sorted.slice(0, 10)
    return sorted.filter((s) => {
      const id = normalizeStr(s.staff_id)
      const u = normalizeStr(s.username)
      return id.includes(query) || u.includes(query)
    }).slice(0, 10)
  }, [staffOptions, query])

  function selectSuggestion(s: StaffSuggestion) {
    const next = addStaffIdToAccessText(replaceTokenAfterLastComma(value, s.staff_id), s.staff_id)
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        className="mt-1 w-full border rounded-md px-3 py-2"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActiveIdx(0)
        }}
        onFocus={() => {
          ensureLoaded()
          setOpen(true)
        }}
        onBlur={() => {
          // Delay close to allow click selection.
          window.setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={(e) => {
          if (!open || !filtered.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIdx((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const chosen = filtered[activeIdx] || filtered[0]
            if (chosen) selectSuggestion(chosen)
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      {open && filtered.length ? (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-sm max-h-56 overflow-auto">
          {filtered.map((s, idx) => (
            <button
              key={s.staff_id}
              type="button"
              className={
                'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ' +
                (idx === activeIdx ? 'bg-gray-50' : '')
              }
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => selectSuggestion(s)}
              disabled={disabled}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-gray-900 truncate">{s.username || '(no username)'}</div>
                <div className="text-gray-500 font-mono text-xs">{s.staff_id}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

type NodeDraft = {
  label: string
  audience: 'faculty' | 'student' | 'both'
  input_mode: 'upload' | 'link'
  link: string
  uploaded_name: string
  limit: string
  college_required: boolean
  position: string
  children: NodeDraft[]
}

function toDraft(n: PBASNode): NodeDraft {
  return {
    label: n.label || '',
    audience: (n.audience || 'both') as any,
    input_mode: (n.input_mode || 'upload') as any,
    link: (n.link || '') as string,
    uploaded_name: (n.uploaded_name || '') as string,
    limit: n.limit == null ? '' : String(n.limit),
    college_required: Boolean(n.college_required),
    position: n.position == null ? '' : String(n.position),
    children: (n.children || []).map(toDraft),
  }
}

function draftToPayload(n: NodeDraft): any {
  return {
    label: n.label,
    audience: n.audience,
    input_mode: n.input_mode,
    link: n.link ? n.link : null,
    uploaded_name: n.uploaded_name ? n.uploaded_name : null,
    limit: n.limit === '' ? null : Number(n.limit),
    college_required: Boolean(n.college_required),
    position: n.position === '' ? null : Number(n.position),
    children: n.children.map(draftToPayload),
  }
}

function parseAccesses(raw: string): string[] {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // unique, preserve order
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

function accessesToText(accesses: any): string {
  if (!Array.isArray(accesses)) return ''
  return accesses.join(', ')
}

function updateAtPath(nodes: NodeDraft[], path: number[], fn: (n: NodeDraft) => NodeDraft): NodeDraft[] {
  if (!path.length) return nodes
  const [idx, ...rest] = path
  return nodes.map((n, i) => {
    if (i !== idx) return n
    if (!rest.length) return fn(n)
    return { ...n, children: updateAtPath(n.children, rest, fn) }
  })
}

function removeAtPath(nodes: NodeDraft[], path: number[]): NodeDraft[] {
  if (!path.length) return nodes
  const [idx, ...rest] = path
  if (!rest.length) return nodes.filter((_, i) => i !== idx)
  return nodes.map((n, i) => (i === idx ? { ...n, children: removeAtPath(n.children, rest) } : n))
}

function addChildAtPath(nodes: NodeDraft[], path: number[]): NodeDraft[] {
  const blank: NodeDraft = {
    label: '',
    audience: 'both',
    input_mode: 'upload',
    link: '',
    uploaded_name: '',
    limit: '',
    college_required: false,
    position: '',
    children: [],
  }

  if (!path.length) return [...nodes, blank]

  return updateAtPath(nodes, path, (n) => ({ ...n, children: [...n.children, blank] }))
}

const AUTHOR_PUBLISHER_OPTIONS = [
  'Tata McGraw-Hill',
  'Pearson',
  'PHI',
  'IEEE press',
  'Wiley',
  'Oxford',
  'Galgotia',
  'Cengage',
  'S.K. Kataria',
  'S.Chand',
  'Khanna',
  'Lakshmi Pvt Ltd',
  'Dhanpat Rai',
  'Other Books with ISBN (Hardbound)',
]

const R6_GROUP_A_PUBLISHERS = [
  'Tata McGraw-Hill',
  'Pearson',
  'PHI',
  'IEEE press',
  'Wiley',
  'Oxford',
  'Galgotia',
  'Cengage',
]

const R6_GROUP_B_PUBLISHERS = [
  'S.K. Kataria',
  'S.Chand',
  'Khanna',
  'Lakshmi Pvt Ltd',
  'Dhanpat Rai',
]

function makeNode(label: string, extra?: Partial<NodeDraft>): NodeDraft {
  return {
    label,
    audience: 'both',
    input_mode: 'upload',
    link: '',
    uploaded_name: '',
    limit: '',
    college_required: false,
    position: '',
    children: [],
    ...(extra || {}),
  }
}

function buildPartCTemplateTree(): NodeDraft[] {
  return [
    makeNode('Part C: Research & Development (30 Marks)', {
      limit: '30',
      children: [
        makeNode('R1 Publications', {
          limit: '20',
          children: [
            makeNode('R1.1 Journals (Collaborative publications within the KRGI-1 bonus credit) • Condition: Refer Annexure II • Actual Mark: Min 10 credits for Ph.D Holders & 6 credits for Non Ph.D'),
            makeNode('R1.2 Conference Proceedings indexed in Scopus • First/Cor Author: 1 • Co-author: 0.5'),
            makeNode('R1.3 Book chapters indexed in Scopus • First/Cor Author: 2 • Co-author: 1'),
          ],
        }),
        makeNode('R2 Patents & Copyrights', {
          limit: '10',
          children: [
            makeNode('R2.1 Patent Published (Institute Name) • each 2'),
            makeNode('R2.2 Patent Granted (Institute Name) • each 5'),
            makeNode('R2.3 Revenue generated from Patent (Rs. 10000) • 1'),
          ],
        }),
        makeNode('R3 Consultancy, Funding & Grants', {
          children: [
            makeNode('R3.1 Research Grant', {
              limit: '5',
              children: [
                makeNode('Applied • 0.5 per proposal'),
                makeNode('Received • Amount divided by 50K'),
              ],
            }),
            makeNode('R3.2 Research Project', {
              limit: '4',
              children: [
                makeNode('Submitted to Govt. Agency / Industry • 0.5 per proposal'),
                makeNode('Submitted with Industry / Institute (INI) partner (Interdisciplinary / Collaborative Project) • 1 per proposal'),
                makeNode('Fund received from the Govt. Agency / Industry • Amount divided by 1 lakh'),
                makeNode('Fund Received for Interdisciplinary / Collaborative Project • 2 additional credits'),
              ],
            }),
            makeNode('R3.4 Funds received for Start-ups (Internal incubation centre preferred) • Amount divided by 1 lakh', {
              limit: '5',
            }),
            makeNode('R3.5 Consultancy Received (bonus 2 credits if revenue > ₹2,00,000) • Amount divided by 10000'),
          ],
        }),
        makeNode('R4 Citation Impact of published work (For the particular calendar year from Scopus) • 1 citation 0.1 (or) h-index growth: +1 credit per 2-point increase', {
          limit: '5',
        }),
        makeNode('R5 Ph.D Guidance / Pursuing PhD', {
          children: [
            makeNode('R5.1 Research Supervisor - Recognition • 3 credits (Applicable in the year of recognition)'),
            makeNode('R5.2 Research Scholar - Registration (During Assessment year) • External: 1.5 per candidate • Internal: 2 per candidate • Full Time: 3 per candidate'),
            makeNode('R5.3 Research Scholar - Completion (During Assessment year) • Part Time: 4 per candidate • Full Time: 5 per candidate'),
            makeNode('R5.4 DC member / Viva Voce Examiners (During Assessment year) • 1 / candidate'),
          ],
        }),
        makeNode('R6 Book Publication', {
          limit: '15',
          children: [
            makeNode('R6.1 Author-6, Co-Author-3', {
              children: R6_GROUP_A_PUBLISHERS.map((name) => makeNode(name, { uploaded_name: name })),
            }),
            makeNode('R6.2 Author-4, Co-author-2', {
              children: R6_GROUP_B_PUBLISHERS.map((name) => makeNode(name, { uploaded_name: name })),
            }),
            makeNode('R6.3 Other Books with ISBN (Hardbound) • Author-2, Co-author-1', {
              uploaded_name: 'Other Books with ISBN (Hardbound)',
            }),
          ],
        }),
      ],
    }),
  ]
}

export default function PBASManagerPage() {
  const [departments, setDepartments] = useState<PBASCustomDepartment[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState<string>('')
  const [recentDeptIds, setRecentDeptIds] = useState<string[]>([])

  const selectedDept = useMemo(
    () => departments.find((d) => d.id === selectedDeptId) || null,
    [departments, selectedDeptId],
  )

  function deptLabel(d: PBASCustomDepartment) {
    return d.department_code
      ? `${d.department_code} ${d.department_short_name || ''} ${d.department_name || ''}`.trim()
      : d.title
  }

  function markRecent(deptId: string) {
    if (!deptId) return
    setRecentDeptIds((prev) => [deptId, ...prev.filter((x) => x !== deptId)].slice(0, 10))
  }

  const [newTitle, setNewTitle] = useState('')
  const [newAccessText, setNewAccessText] = useState('')

  const [editTitle, setEditTitle] = useState('')
  const [editAccessText, setEditAccessText] = useState('')

  const [treeOpen, setTreeOpen] = useState(false)
  const [treeDeptTitle, setTreeDeptTitle] = useState('')
  const [treeRoots, setTreeRoots] = useState<NodeDraft[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [staffOptions, setStaffOptions] = useState<StaffSuggestion[]>([])
  const [staffOptionsLoaded, setStaffOptionsLoaded] = useState(false)

  async function ensureStaffOptionsLoaded() {
    if (staffOptionsLoaded) return
    try {
      const res = await fetchWithAuth('/api/academics/staffs-page/')
      if (!res.ok) {
        setStaffOptionsLoaded(true)
        return
      }
      const data = await res.json().catch(() => null)
      const results = Array.isArray(data?.results) ? data.results : []
      const flattened: StaffSuggestion[] = []
      for (const dept of results) {
        const staffs = Array.isArray(dept?.staffs) ? dept.staffs : []
        for (const s of staffs) {
          const staff_id = String(s?.staff_id || '').trim()
          const username = String(s?.user?.username || '').trim()
          if (!staff_id) continue
          flattened.push({ staff_id, username })
        }
      }
      // Deduplicate by staff_id, keep first occurrence.
      const seen = new Set<string>()
      const uniq: StaffSuggestion[] = []
      for (const s of flattened) {
        if (seen.has(s.staff_id)) continue
        seen.add(s.staff_id)
        uniq.push(s)
      }
      setStaffOptions(uniq)
      setStaffOptionsLoaded(true)
    } catch {
      setStaffOptionsLoaded(true)
    }
  }

  function loadDepartments() {
    setError('')
    setSuccess('')
    return listCustomDepartments('faculty')
      .then((d) => {
        setDepartments(d)
        if (!d.length) {
          setSelectedDeptId('')
          return
        }
        if (!selectedDeptId) setSelectedDeptId(d[0].id)
      })
      .catch((e) => setError(e?.message || 'Failed to load departments'))
  }

  useEffect(() => {
    loadDepartments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedDept) return
    setEditTitle(selectedDept.title || '')
    setEditAccessText(accessesToText(selectedDept.accesses))
  }, [selectedDept])

  async function onCreateDept() {
    setError('')
    setSuccess('')

    setBusy(true)
    try {
      const title = newTitle.trim() || 'Untitled Department'
      const created = await createCustomDepartment({
        title,
        accesses: parseAccesses(newAccessText),
      })
      setNewTitle('')
      setNewAccessText('')
      setSelectedDeptId(created.id)
      markRecent(created.id)
      await loadDepartments()
      setSuccess('Department created.')
    } catch (e: any) {
      setError(e?.message || 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveDeptMeta() {
    if (!selectedDept) return
    setError('')
    setSuccess('')
    if (!editTitle.trim()) {
      setError('Title is required.')
      return
    }

    setBusy(true)
    try {
      await patchCustomDepartment(selectedDept.id, {
        title: editTitle.trim(),
        accesses: parseAccesses(editAccessText),
      })
      await loadDepartments()
      markRecent(selectedDept.id)
      setSuccess('Saved.')
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteDept() {
    if (!selectedDept) return
    setError('')
    setSuccess('')
    if (!confirm(`Delete ${selectedDept.title}? This will delete its PBAS tree.`)) return

    setBusy(true)
    try {
      await deleteCustomDepartment(selectedDept.id)
      setRecentDeptIds((prev) => prev.filter((x) => x !== selectedDept.id))
      setSelectedDeptId('')
      await loadDepartments()
      setSuccess('Deleted.')
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function openTreeEditor() {
    if (!selectedDept) return
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      const tree = await getDepartmentTree(selectedDept.id)
      setTreeDeptTitle(tree.title)
      setTreeRoots((tree.nodes || []).map(toDraft))
      setTreeOpen(true)
    } catch (e: any) {
      setError(e?.message || 'Failed to load tree')
    } finally {
      setBusy(false)
    }
  }

  async function saveTree() {
    if (!selectedDept) return
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      const payload = treeRoots.map(draftToPayload)
      await updateDepartmentTree(selectedDept.id, payload)
      setTreeOpen(false)
      setSuccess('Tree saved.')
    } catch (e: any) {
      setError(e?.message || 'Failed to save tree')
    } finally {
      setBusy(false)
    }
  }

  function onLoadPartCTemplate() {
    if (busy) return
    if (treeRoots.length) {
      const ok = confirm('This will replace the current tree with the Part C: Research & Development template. Continue?')
      if (!ok) return
    }
    setTreeRoots(buildPartCTemplateTree())
    setError('')
    setSuccess('Part C template loaded. Click Save to persist.')
  }

  function renderNode(n: NodeDraft, path: number[], depth: number) {
    const indent = depth * 18
    const matchedAuthorPublisher = AUTHOR_PUBLISHER_OPTIONS.find(
      (opt) => normalizeStr(opt) === normalizeStr(n.uploaded_name),
    )
    const authorPublisherChoice = matchedAuthorPublisher || (n.uploaded_name ? '__other__' : '')
    return (
      <div key={path.join('-')} className="border rounded-md p-3 bg-white" style={{ marginLeft: indent }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-xs font-medium text-gray-600">Label</div>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2"
              value={n.label}
              onChange={(e) => {
                setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, label: e.target.value })))
              }}
              disabled={busy}
            />
          </label>

          <label className="block">
            <div className="text-xs font-medium text-gray-600">Audience</div>
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 bg-white"
              value={n.audience}
              onChange={(e) => {
                setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, audience: e.target.value as any })))
              }}
              disabled={busy}
            >
              <option value="both">Both</option>
              <option value="faculty">Faculty</option>
              <option value="student">Student</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs font-medium text-gray-600">Input Mode</div>
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 bg-white"
              value={n.input_mode}
              onChange={(e) => {
                setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, input_mode: e.target.value as any })))
              }}
              disabled={busy}
            >
              <option value="upload">Upload</option>
              <option value="link">Link</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs font-medium text-gray-600">Points</div>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2"
              type="number"
              value={n.position}
              onChange={(e) => {
                setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, position: e.target.value })))
              }}
              disabled={busy}
            />
          </label>

          <label className="block">
            <div className="text-xs font-medium text-gray-600">Limit (optional)</div>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2"
              type="number"
              value={n.limit}
              onChange={(e) => {
                setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, limit: e.target.value })))
              }}
              disabled={busy}
            />
          </label>

          <label className="block">
            <div className="text-xs font-medium text-gray-600">Author / Publisher (optional)</div>
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 bg-white"
              value={authorPublisherChoice}
              onChange={(e) => {
                const v = e.target.value
                if (!v) {
                  setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, uploaded_name: '' })))
                  return
                }
                if (v === '__other__') {
                  if (AUTHOR_PUBLISHER_OPTIONS.some((opt) => normalizeStr(opt) === normalizeStr(n.uploaded_name))) {
                    setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, uploaded_name: '' })))
                  }
                  return
                }
                setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, uploaded_name: v })))
              }}
              disabled={busy}
            >
              <option value="">Select</option>
              {AUTHOR_PUBLISHER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              <option value="__other__">Others</option>
            </select>

            {authorPublisherChoice === '__other__' ? (
              <input
                className="mt-2 w-full border rounded-md px-3 py-2"
                placeholder="Enter author/publisher"
                value={n.uploaded_name}
                onChange={(e) => {
                  setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, uploaded_name: e.target.value })))
                }}
                disabled={busy}
              />
            ) : null}
          </label>

          <label className="block md:col-span-2">
            <div className="text-xs font-medium text-gray-600">Link (optional)</div>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2"
              placeholder="https://..."
              value={n.link}
              onChange={(e) => {
                setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, link: e.target.value })))
              }}
              disabled={busy}
            />
          </label>

          <label className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              checked={n.college_required}
              onChange={(e) => {
                setTreeRoots((prev) => updateAtPath(prev, path, (x) => ({ ...x, college_required: e.target.checked })))
              }}
              disabled={busy}
            />
            <span className="text-sm text-gray-700">College required</span>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={() => setTreeRoots((prev) => addChildAtPath(prev, path))}
            disabled={busy}
          >
            Add child
          </button>
          <button
            className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            onClick={() => setTreeRoots((prev) => removeAtPath(prev, path))}
            disabled={busy}
          >
            Delete
          </button>
        </div>

        {n.children.length ? <div className="mt-3 space-y-3">{n.children.map((c, i) => renderNode(c, [...path, i], depth + 1))}</div> : null}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900">PBAS Manager</h1>
        <p className="text-sm text-gray-600 mt-1">Create custom departments and manage their PBAS trees.</p>

        {error ? <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div> : null}
        {success ? <div className="mt-4 p-3 rounded-md border border-green-200 bg-green-50 text-green-800 text-sm">{success}</div> : null}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border rounded-lg p-4 md:col-span-1">
            <div className="text-sm font-semibold text-gray-900">Departments</div>
            <div className="mt-3 space-y-2">
              <select
                className="w-full border rounded-md px-3 py-2 bg-white"
                value={selectedDeptId}
                onChange={(e) => {
                  setSelectedDeptId(e.target.value)
                  setError('')
                  setSuccess('')
                }}
              >
                <option value="">Select</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {deptLabel(d)}
                  </option>
                ))}
              </select>
            </div>

            {recentDeptIds.length ? (
              <div className="mt-4">
                <div className="text-xs font-medium text-gray-600">Saved</div>
                <div className="mt-2 space-y-2 max-h-56 overflow-auto pr-1">
                  {recentDeptIds
                    .map((id) => departments.find((d) => d.id === id) || null)
                    .filter(Boolean)
                    .map((d: any) => (
                      <button
                        key={d.id}
                        type="button"
                        className={
                          'w-full text-left px-3 py-2 rounded-md border text-sm ' +
                          (d.id === selectedDeptId
                            ? 'border-blue-300 bg-blue-50 text-blue-900'
                            : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50')
                        }
                        onClick={() => {
                          setSelectedDeptId(d.id)
                          setError('')
                          setSuccess('')
                        }}
                        disabled={busy}
                      >
                        {deptLabel(d)}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-white border rounded-lg p-4 md:col-span-2">
            {selectedDept ? (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Edit Department</div>
                    <div className="text-xs text-gray-500 mt-1">Manage metadata and tree.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      onClick={onDeleteDept}
                      disabled={busy}
                    >
                      Delete
                    </button>
                    <button
                      className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      onClick={openTreeEditor}
                      disabled={busy}
                    >
                      Edit Tree
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-xs font-medium text-gray-600">Title</div>
                    <input
                      className="mt-1 w-full border rounded-md px-3 py-2"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      disabled={busy}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-gray-600">Accesses (staff_id, comma-separated)</div>
                    <AccessesTypeaheadInput
                      value={editAccessText}
                      onChange={setEditAccessText}
                      disabled={busy}
                      placeholder="Click to see staff suggestions…"
                      staffOptions={staffOptions}
                      ensureLoaded={ensureStaffOptionsLoaded}
                    />
                    <div className="text-xs text-gray-500 mt-1">Used for routing to department incharge/access staff in the report flow.</div>
                  </label>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    className="px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => {
                      setEditTitle(selectedDept.title || '')
                      setEditAccessText(accessesToText(selectedDept.accesses))
                      setError('')
                      setSuccess('')
                    }}
                    disabled={busy}
                  >
                    Reset
                  </button>
                  <button
                    className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    onClick={onSaveDeptMeta}
                    disabled={busy}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-gray-600">Select a department.</div>
            )}
          </div>
        </div>

        {treeOpen ? (
          <ModalPortal>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => { if (!busy) setTreeOpen(false) }} />
              <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl border max-h-[85vh] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">Edit Tree</div>
                    <div className="text-xs text-gray-500 mt-0.5">{treeDeptTitle}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      onClick={onLoadPartCTemplate}
                      disabled={busy}
                    >
                      Load Part C Template
                    </button>
                    <button
                      className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => setTreeRoots((prev) => addChildAtPath(prev, []))}
                      disabled={busy}
                    >
                      Add Root
                    </button>
                    <button
                      className="px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => { if (!busy) setTreeOpen(false) }}
                      disabled={busy}
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="p-4 overflow-auto max-h-[70vh]">
                  {treeRoots.length ? (
                    <div className="space-y-3">{treeRoots.map((n, i) => renderNode(n, [i], 0))}</div>
                  ) : (
                    <div className="text-gray-600">No nodes. Click “Add Root”.</div>
                  )}
                </div>

                <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
                  <button
                    className="px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => { if (!busy) setTreeOpen(false) }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    onClick={saveTree}
                    disabled={busy}
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        ) : null}
      </div>
    </div>
  )
}

