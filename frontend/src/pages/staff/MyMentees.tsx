import React, { useEffect, useState } from 'react'
import { fetchMyMentees } from '../../services/mentor'
import { Users, Loader2, GraduationCap, Clock } from 'lucide-react'
import { ModalPortal } from '../../components/ModalPortal'
import { forwardTicketToDepartment, listMyVerifierTickets, PBASVerifierTicketItem } from '../../services/pbas'

type Mentee = {
  id: number
  reg_no: string
  username: string
  section_id: number | null
  section_name: string | null
}

type SectionGroup = {
  section_name: string
  section_id: number | null
  students: Mentee[]
}

export default function MyMentees() {
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(false)

  const [tickets, setTickets] = useState<PBASVerifierTicketItem[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketsError, setTicketsError] = useState<string>('')
  const [ticketOpen, setTicketOpen] = useState(false)
  const [ticketSlide, setTicketSlide] = useState(0)
  const [activeTicket, setActiveTicket] = useState<PBASVerifierTicketItem | null>(null)
  const [ticketForwardBusy, setTicketForwardBusy] = useState(false)

  useEffect(() => {
    load()
    loadTickets()
  }, [])

  async function load(){
    setLoading(true)
    try{
      const res = await fetchMyMentees()
      setMentees(res.results || [])
    }catch(e){
      console.error(e)
      alert('Failed to load mentees')
    }finally{ setLoading(false) }
  }

  async function loadTickets() {
    setTicketsLoading(true)
    setTicketsError('')
    try {
      const res = await listMyVerifierTickets()
      setTickets(res)
    } catch (e: any) {
      console.error(e)
      setTicketsError(e?.message || 'Failed to load verifier tickets')
    } finally {
      setTicketsLoading(false)
    }
  }

  function openTicket(t: PBASVerifierTicketItem) {
    setActiveTicket(t)
    setTicketSlide(0)
    setTicketOpen(true)
  }

  async function onForwardToDepartment() {
    if (!activeTicket?.id) return
    setTicketForwardBusy(true)
    try {
      const res = await forwardTicketToDepartment(activeTicket.id)
      const nextStatus = (res?.status as any) || 'dept_pending'
      setTickets(prev => prev.map(t => (t.id === activeTicket.id ? { ...t, status: nextStatus } : t)))
      setActiveTicket(prev => (prev ? { ...prev, status: nextStatus } : prev))
      setTicketOpen(false)
    } catch (e: any) {
      alert(e?.message || 'Forward failed')
    } finally {
      setTicketForwardBusy(false)
    }
  }

  // Group mentees by section
  const groupedBySection = mentees.reduce((acc, mentee) => {
    const sectionName = mentee.section_name || 'No Section'
    const sectionId = mentee.section_id || 0
    
    const existingGroup = acc.find(g => g.section_id === sectionId)
    if (existingGroup) {
      existingGroup.students.push(mentee)
    } else {
      acc.push({
        section_name: sectionName,
        section_id: sectionId,
        students: [mentee]
      })
    }
    return acc
  }, [] as SectionGroup[])

  // Sort sections alphabetically
  groupedBySection.sort((a, b) => a.section_name.localeCompare(b.section_name))

  // Sort students within each section by reg_no
  groupedBySection.forEach(group => {
    group.students.sort((a, b) => (a.reg_no || '').localeCompare(b.reg_no || ''))
  })

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-4 md:p-6 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl shadow-lg">
              <Users className="w-6 h-6 md:w-8 md:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 mb-1">My Mentees</h1>
              <p className="text-slate-600 text-xs md:text-sm">Students assigned to you as mentor</p>
            </div>
          </div>
          {!loading && mentees.length > 0 && (
            <div className="px-4 py-2 bg-gradient-to-r from-slate-100 to-indigo-100 rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 md:w-5 md:h-5 text-indigo-700" />
                <span className="text-xs md:text-sm font-semibold text-indigo-900">
                  Total: {mentees.length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pbas Verifier */}
      <div className="bg-white rounded-xl shadow-sm mb-6 p-4 md:p-6 border border-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-900">Pbas Verifier</h2>
            <p className="text-slate-600 text-xs md:text-sm">Submissions forwarded to you for verification</p>
          </div>
          <button
            type="button"
            className="px-3 py-2 text-xs md:text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
            onClick={loadTickets}
            disabled={ticketsLoading}
          >
            {ticketsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {ticketsError ? <div className="mt-3 text-sm text-red-600">{ticketsError}</div> : null}

        <div className="mt-4">
          {ticketsLoading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading verifier tickets…</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-sm text-slate-600">No verifier items.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tickets.map(t => {
                const rep = t.report
                const isPending = t.status === 'dept_pending'
                return (
                  <div key={t.id} className="relative border border-slate-200 rounded-xl p-4 hover:bg-slate-50 transition-colors">
                    {isPending ? (
                      <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pending
                      </div>
                    ) : null}

                    <div className="text-sm font-semibold text-slate-900">
                      {rep?.student?.username || 'Student'} ({rep?.student?.reg_no || '—'})
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Dept: {rep?.department?.title || '—'}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Item: {rep?.submission?.node?.label || '—'}
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="px-3 py-2 text-xs md:text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                        onClick={() => openTicket(t)}
                        disabled={ticketForwardBusy}
                      >
                        View
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <span className="ml-3 text-slate-600">Loading mentees...</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && mentees.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="bg-slate-100 p-4 rounded-full mb-4">
              <Users className="w-12 h-12 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">No Mentees Assigned</h3>
            <p className="text-slate-600 text-sm">You don't have any students assigned as mentees yet.</p>
          </div>
        </div>
      )}

      {/* Section-wise Display */}
      {!loading && mentees.length > 0 && (
        <div className="space-y-6">
          {groupedBySection.map((group) => (
            <div key={group.section_id || 'no-section'} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Section Header */}
              <div className="px-4 md:px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-white" />
                    <h2 className="text-base md:text-lg font-semibold text-white">
                      {group.section_name}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-white/20 text-white text-xs md:text-sm font-medium rounded-full">
                    {group.students.length} {group.students.length === 1 ? 'Student' : 'Students'}
                  </span>
                </div>
              </div>

              {/* Students Table - Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left py-3 px-6 text-sm font-semibold text-slate-700">
                        S.No
                      </th>
                      <th className="text-left py-3 px-6 text-sm font-semibold text-slate-700">
                        Reg No
                      </th>
                      <th className="text-left py-3 px-6 text-sm font-semibold text-slate-700">
                        Name
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {group.students.map((mentee, index) => (
                      <tr key={mentee.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-6">
                          <span className="text-sm text-slate-600">{index + 1}</span>
                        </td>
                        <td className="py-3 px-6">
                          <span className="text-sm font-medium text-slate-900">{mentee.reg_no}</span>
                        </td>
                        <td className="py-3 px-6">
                          <span className="text-sm text-slate-700">{mentee.username}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Students Cards - Mobile */}
              <div className="md:hidden divide-y divide-slate-200">
                {group.students.map((mentee, index) => (
                  <div key={mentee.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 mb-1">
                          {mentee.username}
                        </div>
                        <div className="text-xs text-slate-600">
                          Reg No: <span className="font-medium text-slate-900">{mentee.reg_no}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {ticketOpen && activeTicket ? (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setTicketOpen(false)} />
            <div className="relative w-full max-w-xl mx-4 bg-white rounded-xl shadow-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-500">Pbas Verifier</div>
                  <div className="text-lg font-semibold text-gray-900">Verification</div>
                </div>
                <button className="text-gray-500 hover:text-gray-700" onClick={() => setTicketOpen(false)} type="button">
                  ✕
                </button>
              </div>

              {ticketSlide === 0 ? (
                <div className="mt-4 space-y-4">
                  <div className="border rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-800">Student</div>
                    <div className="text-sm text-gray-700 mt-1">
                      <div>Name: {activeTicket.report.student?.username || '—'}</div>
                      <div>Reg No: {activeTicket.report.student?.reg_no || '—'}</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-800">Submission</div>
                    <div className="text-sm text-gray-700 mt-1 space-y-1">
                      <div>Department: {activeTicket.report.department?.title || '—'}</div>
                      <div>Item: {activeTicket.report.submission?.node?.label || '—'}</div>
                      {activeTicket.report.submission?.college ? (
                        <div>
                          College:{' '}
                          {(activeTicket.report.submission.college.code ? activeTicket.report.submission.college.code + ' - ' : '') +
                            (activeTicket.report.submission.college.name || '')}
                        </div>
                      ) : null}
                      {activeTicket.report.submission?.submission_type === 'link' ? (
                        <div>
                          Link:{' '}
                          <a
                            className="text-blue-600 hover:underline"
                            href={activeTicket.report.submission.link || '#'}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {activeTicket.report.submission.link || '—'}
                          </a>
                        </div>
                      ) : (
                        <div>
                          Upload:{' '}
                          {activeTicket.report.submission.file_url ? (
                            <a
                              className="text-blue-600 hover:underline"
                              href={activeTicket.report.submission.file_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {activeTicket.report.submission.file_name || 'View file'}
                            </a>
                          ) : (
                            <span>{activeTicket.report.submission.file_name || '—'}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      className="px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50"
                      onClick={() => setTicketOpen(false)}
                    >
                      Close
                    </button>
                    <button
                      className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => setTicketSlide(1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="border rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-800">Department Access Staff</div>
                    <div className="mt-2 space-y-1">
                      {(activeTicket.report.department?.access_staffs || []).length ? (
                        activeTicket.report.department.access_staffs.map((s, idx) => (
                          <div key={idx} className="text-sm text-gray-700">
                            {(s.username ? s.username + ' • ' : '') + (s.staff_id || '—')}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">No access staff configured.</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      className="px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50"
                      onClick={() => setTicketSlide(0)}
                      disabled={ticketForwardBusy}
                    >
                      Back
                    </button>
                    {activeTicket.status === 'dept_pending' ? (
                      <button className="px-4 py-2 rounded-md bg-slate-300 text-slate-700 flex items-center gap-2" disabled>
                        <Clock className="w-4 h-4" /> Pending
                      </button>
                    ) : (
                      <button
                        className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                        onClick={onForwardToDepartment}
                        disabled={ticketForwardBusy}
                      >
                        {ticketForwardBusy ? 'Forwarding…' : 'Forward'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  )
}
