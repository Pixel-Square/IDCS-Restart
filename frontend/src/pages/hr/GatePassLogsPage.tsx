import React, { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  fetchGatepassLogs,
  fetchGatepassOfflineRecords,
  fetchGatepassOfflineSecurityUsers,
  ignoreAllGatepassOfflineRecords,
  ignoreGatepassOfflineRecord,
  pullAllGatepassOfflineRecords,
  pullGatepassOfflineRecord,
} from '../../services/idscan'
import type {
  GatepassLogRow,
  FetchGatepassLogsParams,
  FetchGatepassOfflineRecordsParams,
  GatepassOfflineRecordRow,
  GatepassOfflineSecurityUser,
} from '../../services/idscan'
import { fetchDepartments } from '../../services/academics'
import type { DepartmentRow } from '../../services/academics'

function badgeClass(status: string): string {
  const s = String(status || '').toUpperCase()
  if (s === 'APPROVED') return 'bg-green-50 text-green-700 border-green-200'
  if (s === 'REJECTED') return 'bg-red-50 text-red-700 border-red-200'
  if (s === 'IN_REVIEW' || s === 'SUBMITTED') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (s === 'CANCELLED') return 'bg-gray-50 text-gray-700 border-gray-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

function chipClass(kind: 'good' | 'warn' | 'muted'): string {
  if (kind === 'good') return 'bg-green-50 text-green-700 border-green-200'
  if (kind === 'warn') return 'bg-amber-50 text-amber-800 border-amber-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

function fmtDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString()
  } catch {
    return '—'
  }
}

function normalizeBlockId(value: string): string {
  return String(value || '').trim().toUpperCase()
}

function initialsFromName(name?: string | null): string {
  const s = String(name || '').trim()
  if (!s) return '—'
  const parts = s.split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''
  return (a + b).toUpperCase() || '—'
}

export default function GatePassLogsPage(): JSX.Element {
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<DepartmentRow[]>([])

  const [blockOpen, setBlockOpen] = useState(false)
  const [blockedIds, setBlockedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('gatepass_blocklist')
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.map((v) => normalizeBlockId(String(v))).filter(Boolean) : []
    } catch {
      return []
    }
  })
  const [blockDraft, setBlockDraft] = useState('')

  const [offlineOpen, setOfflineOpen] = useState(false)
  const [securityUsers, setSecurityUsers] = useState<GatepassOfflineSecurityUser[]>([])
  const [securityUserId, setSecurityUserId] = useState<number | ''>('')

  const [offlineDraft, setOfflineDraft] = useState<FetchGatepassOfflineRecordsParams>({
    role: '',
    department_id: '',
    direction: '',
    q: '',
    limit: 200,
  })
  const [offlineApplied, setOfflineApplied] = useState<FetchGatepassOfflineRecordsParams>(offlineDraft)
  const [offlineRows, setOfflineRows] = useState<GatepassOfflineRecordRow[]>([])
  const [offlineLoading, setOfflineLoading] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [offlineAction, setOfflineAction] = useState<number | 'pull-all' | 'ignore-all' | null>(null)

  const [draft, setDraft] = useState<FetchGatepassLogsParams>({
    role: '',
    department_id: '',
    status: '',
    out: '',
    in: '',
    from: '',
    to: '',
    q: '',
    limit: 200,
  })

  const [applied, setApplied] = useState<FetchGatepassLogsParams>(draft)

  const [rows, setRows] = useState<GatepassLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetchDepartments()
      .then((items) => {
        if (!mounted) return
        setDepartments(items)
      })
      .catch(() => {
        // ignore department load errors; filters still work without it
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    fetchGatepassLogs(applied)
      .then((data) => {
        if (!mounted) return
        setRows(data)
      })
      .catch((e: any) => {
        if (!mounted) return
        setError(e?.message || 'Failed to load gatepass logs')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [applied])

  const departmentOptions = useMemo(() => {
    return [...departments].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
  }, [departments])

  const securityUserOptions = useMemo(() => {
    return [...securityUsers].sort((a, b) => String(a?.username || '').localeCompare(String(b?.username || '')))
  }, [securityUsers])

  const handleApply = () => setApplied({ ...draft })

  const refreshLogs = () => setApplied((prev) => ({ ...prev }))

  const handleReset = () => {
    const next: FetchGatepassLogsParams = {
      role: '',
      department_id: '',
      status: '',
      out: '',
      in: '',
      from: '',
      to: '',
      q: '',
      limit: 200,
    }
    setDraft(next)
    setApplied(next)
  }

  useEffect(() => {
    try {
      localStorage.setItem('gatepass_blocklist', JSON.stringify(blockedIds))
    } catch {
      // ignore
    }
  }, [blockedIds])

  const isRowBlocked = (r: GatepassLogRow): boolean => {
    if (!blockedIds.length) return false
    const candidates = [r.uid, r.reg_no, r.staff_id].map((v) => (v ? normalizeBlockId(String(v)) : '')).filter(Boolean)
    if (!candidates.length) return false
    const set = new Set(blockedIds.map((v) => normalizeBlockId(v)).filter(Boolean))
    return candidates.some((c) => set.has(c))
  }

  const { visibleRows, blockedRows } = useMemo(() => {
    const v: GatepassLogRow[] = []
    const b: GatepassLogRow[] = []
    for (const r of rows) {
      if (isRowBlocked(r)) b.push(r)
      else v.push(r)
    }
    return { visibleRows: v, blockedRows: b }
  }, [rows, blockedIds])

  const addBlockedId = () => {
    const next = normalizeBlockId(blockDraft)
    if (!next) return
    setBlockedIds((prev) => {
      const set = new Set(prev.map((v) => normalizeBlockId(v)).filter(Boolean))
      set.add(next)
      return Array.from(set)
    })
    setBlockDraft('')
  }

  const removeBlockedId = (id: string) => {
    const target = normalizeBlockId(id)
    setBlockedIds((prev) => prev.filter((v) => normalizeBlockId(v) !== target))
  }

  useEffect(() => {
    if (!offlineOpen) return

    let mounted = true
    setOfflineError(null)

    fetchGatepassOfflineSecurityUsers()
      .then((items) => {
        if (!mounted) return
        setSecurityUsers(items)
      })
      .catch((e: any) => {
        if (!mounted) return
        setOfflineError(e?.message || 'Failed to load security users')
      })

    return () => {
      mounted = false
    }
  }, [offlineOpen])

  useEffect(() => {
    if (!offlineOpen) return

    let mounted = true
    setOfflineLoading(true)
    setOfflineError(null)
    fetchGatepassOfflineRecords(offlineApplied)
      .then((data) => {
        if (!mounted) return
        setOfflineRows(data)
      })
      .catch((e: any) => {
        if (!mounted) return
        setOfflineError(e?.message || 'Failed to load offline records')
      })
      .finally(() => {
        if (!mounted) return
        setOfflineLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [offlineOpen, offlineApplied])

  const handleOfflineApply = () => setOfflineApplied({ ...offlineDraft })

  const handleOfflineReset = () => {
    const next: FetchGatepassOfflineRecordsParams = {
      role: '',
      department_id: '',
      direction: '',
      q: '',
      limit: 200,
    }
    setOfflineDraft(next)
    setOfflineApplied(next)
    setOfflineError(null)
  }

  const handlePullOne = async (rec: GatepassOfflineRecordRow) => {
    if (!securityUserId) {
      setOfflineError('Select a SECURITY user to pull records')
      return
    }
    setOfflineAction(rec.id)
    setOfflineError(null)
    try {
      await pullGatepassOfflineRecord(rec.id, Number(securityUserId))
      setOfflineApplied((p) => ({ ...p }))
      refreshLogs()
    } catch (e: any) {
      setOfflineError(e?.message || 'Failed to pull record')
    } finally {
      setOfflineAction(null)
    }
  }

  const handleIgnoreOne = async (rec: GatepassOfflineRecordRow) => {
    setOfflineAction(rec.id)
    setOfflineError(null)
    try {
      await ignoreGatepassOfflineRecord(rec.id)
      setOfflineApplied((p) => ({ ...p }))
    } catch (e: any) {
      setOfflineError(e?.message || 'Failed to ignore record')
    } finally {
      setOfflineAction(null)
    }
  }

  const handlePullAll = async () => {
    if (!securityUserId) {
      setOfflineError('Select a SECURITY user to pull records')
      return
    }
    setOfflineAction('pull-all')
    setOfflineError(null)
    try {
      await pullAllGatepassOfflineRecords({
        security_user_id: Number(securityUserId),
        role: offlineApplied.role || '',
        department_id: offlineApplied.department_id || '',
        direction: offlineApplied.direction || '',
        q: offlineApplied.q || '',
        limit: offlineApplied.limit,
      })
      setOfflineApplied((p) => ({ ...p }))
      refreshLogs()
    } catch (e: any) {
      setOfflineError(e?.message || 'Failed to pull all')
    } finally {
      setOfflineAction(null)
    }
  }

  const handleIgnoreAll = async () => {
    setOfflineAction('ignore-all')
    setOfflineError(null)
    try {
      await ignoreAllGatepassOfflineRecords({
        role: offlineApplied.role || '',
        department_id: offlineApplied.department_id || '',
        direction: offlineApplied.direction || '',
        q: offlineApplied.q || '',
        limit: offlineApplied.limit,
      })
      setOfflineApplied((p) => ({ ...p }))
    } catch (e: any) {
      setOfflineError(e?.message || 'Failed to ignore all')
    } finally {
      setOfflineAction(null)
    }
  }

  return (
    <div className="w-full h-full p-4 md:p-6">
      <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col h-full min-h-0">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">GatePass Logs</h2>
              <p className="text-sm text-gray-600 mt-1">View gate pass scan activity with filters</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOfflineOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50"
              >
                OFFLINE RECORDS
              </button>
              <button
                onClick={() => setBlockOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50"
              >
                BLOCK LIST
              </button>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
              <button
                onClick={handleApply}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                <Search className="w-4 h-4" />
                Apply
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Role</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={draft.role || ''}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as any }))}
              >
                <option value="">All</option>
                <option value="STUDENT">Student</option>
                <option value="STAFF">Staff</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Department</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={draft.department_id || ''}
                onChange={(e) => {
                  const v = e.target.value
                  setDraft((d) => ({ ...d, department_id: v ? Number(v) : '' }))
                }}
              >
                <option value="">All</option>
                {departmentOptions.map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.short_name || dep.name || `#${dep.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={draft.status || ''}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
              >
                <option value="">All</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="IN_REVIEW">IN_REVIEW</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            <div className="lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Search</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="Name / Username / Reg No / Staff ID"
                value={draft.q || ''}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApply()
                }}
              />
            </div>

            <div className="lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Out</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={draft.out || ''}
                onChange={(e) => setDraft((d) => ({ ...d, out: e.target.value as any }))}
              >
                <option value="">All</option>
                <option value="EXITED">Exited</option>
                <option value="NOT_EXITED">Not Exited</option>
              </select>
            </div>

            <div className="lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">IN</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={draft.in || ''}
                onChange={(e) => setDraft((d) => ({ ...d, in: e.target.value as any }))}
              >
                <option value="">All</option>
                <option value="ON_TIME">On Time</option>
                <option value="LATE">Late</option>
                <option value="NOT_RETURNED">Not Returned</option>
              </select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">From</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={String(draft.from || '')}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">To</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={String(draft.to || '')}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <div className="text-xs text-gray-500">Dates apply only after you click Apply.</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        <div className="p-6 flex-1 min-h-0">
          {loading ? (
            <div className="text-gray-600">Loading logs...</div>
          ) : visibleRows.length === 0 ? (
            <div className="text-gray-500">No logs found.</div>
          ) : (
            <div className="overflow-auto border border-gray-200 rounded-lg w-full h-full">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">User</th>
                    <th className="text-left px-4 py-3 font-semibold">Gate</th>
                    <th className="text-left px-4 py-3 font-semibold">MODE</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Reason</th>
                    <th className="text-left px-4 py-3 font-semibold">Out</th>
                    <th className="text-left px-4 py-3 font-semibold">IN</th>
                    <th className="text-right px-4 py-3 font-semibold">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleRows.map((r) => {
                    const userTitle = r.user_name || r.user_username || '—'
                    const userMetaParts = [r.user_username ? `@${r.user_username}` : null, r.department_name || null, r.user_role || null].filter(Boolean)
                    const outText = r.out_status === 'EXITED' ? 'Exited' : 'Not Exited'
                    const outKind: 'good' | 'muted' = r.out_status === 'EXITED' ? 'good' : 'muted'

                    const inText =
                      r.in_status === 'ON_TIME' ? 'On Time' : r.in_status === 'LATE' ? 'Late' : 'Not Returned'
                    const inKind: 'good' | 'warn' | 'muted' =
                      r.in_status === 'ON_TIME' ? 'good' : r.in_status === 'LATE' ? 'warn' : 'muted'

                    const isOffline = String(r.mode || '').toUpperCase() === 'OFFLINE'
                    const avatarUrl = r.profile_image_url || null
                    const initials = initialsFromName(userTitle)
                    const canView = Number(r.application_id) > 0

                    return (
                      <tr key={r.application_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10">
                              <div className="w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-700 flex items-center justify-center text-xs font-semibold">
                                {initials}
                              </div>
                              {avatarUrl && (
                                <img
                                  src={avatarUrl}
                                  alt={userTitle}
                                  className="absolute inset-0 w-10 h-10 rounded-full object-cover border border-gray-200 bg-white"
                                  loading="lazy"
                                  onError={(e) => {
                                    try {
                                      e.currentTarget.style.display = 'none'
                                    } catch {}
                                  }}
                                />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{userTitle}</div>
                              {userMetaParts.length > 0 && (
                                <div className="text-xs text-gray-500 mt-0.5">{userMetaParts.join(' • ')}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{r.gate_username || '—'}</td>
                        <td className={`px-4 py-3 ${isOffline ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                          {(r.mode || 'ONLINE').toUpperCase()}
                        </td>
                        <td className="px-4 py-3">
                          {isOffline ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClass(
                                r.status,
                              )}`}
                            >
                              {String(r.status || '—').toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {isOffline ? (
                            <span className="text-red-600 font-semibold">OFFLINE</span>
                          ) : (
                            <span className="block truncate" title={r.reason || ''}>
                              {r.reason || '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${chipClass(
                                outKind,
                              )}`}
                            >
                              {outText}
                            </span>
                            {r.out_at && r.out_status === 'EXITED' && (
                              <div className="text-[11px] text-gray-500 mt-1">{fmtDateTime(r.out_at)}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${chipClass(
                                inKind,
                              )}`}
                            >
                              {inText}
                            </span>
                            {r.in_at && (r.in_status === 'ON_TIME' || r.in_status === 'LATE') && (
                              <div className="text-[11px] text-gray-500 mt-1">{fmtDateTime(r.in_at)}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            disabled={!canView}
                            onClick={() => {
                              if (!canView) return
                              navigate(`/applications/${r.application_id}`)
                            }}
                            className={
                              canView
                                ? 'inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700'
                                : 'inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs font-semibold cursor-not-allowed'
                            }
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {blockOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBlockOpen(false)} />

          <div className="absolute inset-0 p-4 md:p-6 flex items-start justify-center">
            <div className="bg-white rounded-lg shadow-md w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
              <div className="border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold text-gray-900">Block List</div>
                  <div className="text-sm text-gray-600 mt-1">Blocked users are hidden from the main logs.</div>
                </div>
                <button
                  onClick={() => setBlockOpen(false)}
                  className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Add RFID UID / Staff ID / Reg No</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={blockDraft}
                      onChange={(e) => setBlockDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addBlockedId()
                      }}
                      placeholder="e.g. 539EA5BB / KRGI1234 / 20CS001"
                    />
                  </div>
                  <div>
                    <button
                      onClick={addBlockedId}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {blockedIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {blockedIds
                      .slice()
                      .sort((a, b) => String(a).localeCompare(String(b)))
                      .map((id) => (
                        <button
                          key={id}
                          onClick={() => removeBlockedId(id)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-sm text-gray-900 hover:bg-gray-50"
                          title="Click to remove"
                        >
                          {id}
                          <span className="text-gray-400">×</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="p-6 flex-1 min-h-0">
                {blockedRows.length === 0 ? (
                  <div className="text-gray-500">No blocked logs.</div>
                ) : (
                  <div className="overflow-auto border border-gray-200 rounded-lg w-full h-full">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold">User</th>
                          <th className="text-left px-4 py-3 font-semibold">Gate</th>
                          <th className="text-left px-4 py-3 font-semibold">MODE</th>
                          <th className="text-left px-4 py-3 font-semibold">Status</th>
                          <th className="text-left px-4 py-3 font-semibold">Reason</th>
                          <th className="text-left px-4 py-3 font-semibold">Out</th>
                          <th className="text-left px-4 py-3 font-semibold">IN</th>
                          <th className="text-right px-4 py-3 font-semibold">View</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {blockedRows.map((r) => {
                          const userTitle = r.user_name || r.user_username || '—'
                          const userMetaParts = [
                            r.user_username ? `@${r.user_username}` : null,
                            r.department_name || null,
                            r.user_role || null,
                          ].filter(Boolean)
                          const outText = r.out_status === 'EXITED' ? 'Exited' : 'Not Exited'
                          const outKind: 'good' | 'muted' = r.out_status === 'EXITED' ? 'good' : 'muted'

                          const inText =
                            r.in_status === 'ON_TIME' ? 'On Time' : r.in_status === 'LATE' ? 'Late' : 'Not Returned'
                          const inKind: 'good' | 'warn' | 'muted' =
                            r.in_status === 'ON_TIME' ? 'good' : r.in_status === 'LATE' ? 'warn' : 'muted'

                          const isOffline = String(r.mode || '').toUpperCase() === 'OFFLINE'
                          const avatarUrl = r.profile_image_url || null
                          const initials = initialsFromName(userTitle)
                          const canView = Number(r.application_id) > 0

                          return (
                            <tr key={r.application_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="relative w-10 h-10">
                                    <div className="w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-700 flex items-center justify-center text-xs font-semibold">
                                      {initials}
                                    </div>
                                    {avatarUrl && (
                                      <img
                                        src={avatarUrl}
                                        alt={userTitle}
                                        className="absolute inset-0 w-10 h-10 rounded-full object-cover border border-gray-200 bg-white"
                                        loading="lazy"
                                        onError={(e) => {
                                          try {
                                            e.currentTarget.style.display = 'none'
                                          } catch {}
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-gray-900">{userTitle}</div>
                                    {userMetaParts.length > 0 && (
                                      <div className="text-xs text-gray-500 mt-0.5">{userMetaParts.join(' • ')}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-700">{r.gate_username || '—'}</td>
                              <td className={`px-4 py-3 ${isOffline ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                                {(r.mode || 'ONLINE').toUpperCase()}
                              </td>
                              <td className="px-4 py-3">
                                {isOffline ? (
                                  <span className="text-gray-400">—</span>
                                ) : (
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClass(
                                      r.status,
                                    )}`}
                                  >
                                    {String(r.status || '—').toUpperCase()}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {isOffline ? (
                                  <span className="text-red-600 font-semibold">OFFLINE</span>
                                ) : (
                                  <span className="block truncate" title={r.reason || ''}>
                                    {r.reason || '—'}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div>
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${chipClass(
                                      outKind,
                                    )}`}
                                  >
                                    {outText}
                                  </span>
                                  {r.out_at && r.out_status === 'EXITED' && (
                                    <div className="text-[11px] text-gray-500 mt-1">{fmtDateTime(r.out_at)}</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div>
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${chipClass(
                                      inKind,
                                    )}`}
                                  >
                                    {inText}
                                  </span>
                                  {r.in_at && (r.in_status === 'ON_TIME' || r.in_status === 'LATE') && (
                                    <div className="text-[11px] text-gray-500 mt-1">{fmtDateTime(r.in_at)}</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  disabled={!canView}
                                  onClick={() => {
                                    if (!canView) return
                                    navigate(`/applications/${r.application_id}`)
                                  }}
                                  className={
                                    canView
                                      ? 'inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700'
                                      : 'inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs font-semibold cursor-not-allowed'
                                  }
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {offlineOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOfflineOpen(false)} />

          <div className="absolute inset-0 p-4 md:p-6 flex items-start justify-center">
            <div className="bg-white rounded-lg shadow-md w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
              <div className="border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold text-gray-900">Offline Records</div>
                  <div className="text-sm text-gray-600 mt-1">Pull or ignore offline queued scans</div>
                </div>
                <button
                  onClick={() => setOfflineOpen(false)}
                  className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">SECURITY user</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={securityUserId === '' ? '' : String(securityUserId)}
                      onChange={(e) => {
                        const v = e.target.value
                        setSecurityUserId(v ? Number(v) : '')
                      }}
                    >
                      <option value="">Select</option>
                      {securityUserOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username ? `${u.username}` : `#${u.id}`}
                          {u.name ? ` — ${u.name}` : ''}
                          {u.department ? ` (${u.department})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Role</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={offlineDraft.role || ''}
                      onChange={(e) => setOfflineDraft((d) => ({ ...d, role: e.target.value as any }))}
                    >
                      <option value="">All</option>
                      <option value="STUDENT">Student</option>
                      <option value="STAFF">Staff</option>
                    </select>
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Direction</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={offlineDraft.direction || ''}
                      onChange={(e) => setOfflineDraft((d) => ({ ...d, direction: e.target.value as any }))}
                    >
                      <option value="">All</option>
                      <option value="OUT">OUT</option>
                      <option value="IN">IN</option>
                    </select>
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Department</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={offlineDraft.department_id || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setOfflineDraft((d) => ({ ...d, department_id: v ? Number(v) : '' }))
                      }}
                    >
                      <option value="">All</option>
                      {departmentOptions.map((dep) => (
                        <option key={dep.id} value={dep.id}>
                          {dep.short_name || dep.name || `#${dep.id}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-1">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Search</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      placeholder="UID / Username / Name"
                      value={offlineDraft.q || ''}
                      onChange={(e) => setOfflineDraft((d) => ({ ...d, q: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleOfflineApply()
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleOfflineReset}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleOfflineApply}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                    >
                      Apply
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePullAll}
                      disabled={offlineAction !== null}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      Pull All
                    </button>
                    <button
                      onClick={handleIgnoreAll}
                      disabled={offlineAction !== null}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                    >
                      Ignore All
                    </button>
                  </div>
                </div>
              </div>

              {offlineError && (
                <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {offlineError}
                </div>
              )}

              <div className="p-6 flex-1 min-h-0">
                {offlineLoading ? (
                  <div className="text-gray-600">Loading offline records...</div>
                ) : offlineRows.length === 0 ? (
                  <div className="text-gray-500">No offline records found.</div>
                ) : (
                  <div className="overflow-auto border border-gray-200 rounded-lg w-full h-full">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold">Recorded</th>
                          <th className="text-left px-4 py-3 font-semibold">UID</th>
                          <th className="text-left px-4 py-3 font-semibold">Role</th>
                          <th className="text-left px-4 py-3 font-semibold">User</th>
                          <th className="text-left px-4 py-3 font-semibold">Department</th>
                          <th className="text-left px-4 py-3 font-semibold">Direction</th>
                          <th className="text-left px-4 py-3 font-semibold">Device</th>
                          <th className="text-left px-4 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {offlineRows.map((r) => {
                          const title = r.user_name || r.user_username || '—'
                          const meta = [r.user_username ? `@${r.user_username}` : null, r.uid || null].filter(Boolean)
                          return (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                {r.recorded_at ? new Date(r.recorded_at).toLocaleString() : '—'}
                              </td>
                              <td className="px-4 py-3 text-gray-700 font-mono">{r.uid || '—'}</td>
                              <td className="px-4 py-3 text-gray-700">{r.user_role || '—'}</td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-gray-900">{title}</div>
                                {meta.length > 0 && <div className="text-xs text-gray-500 mt-0.5">{meta.join(' • ')}</div>}
                                {r.pull_error ? (
                                  <div className="text-xs text-red-600 mt-0.5" title={r.pull_error}>
                                    {r.pull_error}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-gray-700">{r.department_name || '—'}</td>
                              <td className="px-4 py-3 text-gray-700">{r.direction}</td>
                              <td className="px-4 py-3 text-gray-700">{r.device_label || '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handlePullOne(r)}
                                    disabled={offlineAction !== null}
                                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    Pull
                                  </button>
                                  <button
                                    onClick={() => handleIgnoreOne(r)}
                                    disabled={offlineAction !== null}
                                    className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Ignore
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
