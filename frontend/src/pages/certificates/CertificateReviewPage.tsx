import React, { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileText, Loader2, RefreshCw, X } from 'lucide-react'
import { approveCertificate, fetchPendingReviews, rejectCertificate, CertificateRecord } from '../../services/certificates'

type Props = { user?: any }

const rejectionReasons = [
  { value: 'INVALID_FORMAT', label: 'Invalid document format' },
  { value: 'UNCLEAR', label: 'Certificate unclear' },
  { value: 'UNRECOGNISED_ORG', label: 'Organization not recognized' },
  { value: 'OUTSIDE_SCOPE', label: 'Outside scope' },
  { value: 'DUPLICATE', label: 'Already submitted' },
  { value: 'OTHER', label: 'Custom' },
]

export default function CertificateReviewPage({ user }: Props) {
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [pending, setPending] = useState<CertificateRecord[]>([])
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [rejecting, setRejecting] = useState<CertificateRecord | null>(null)
  const [rejectionReason, setRejectionReason] = useState('INVALID_FORMAT')
  const [rejectionMessage, setRejectionMessage] = useState('')
  const [message, setMessage] = useState('')

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetchPendingReviews()
      setPending(res.results || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const approve = async (certificate: CertificateRecord) => {
    setActionLoading(certificate.id)
    setMessage('')
    try {
      const res = await approveCertificate(certificate.id)
      if (!res.ok) throw new Error((await res.json().catch(() => ({} as any)))?.detail || 'Approval failed')
      setPending((prev) => prev.filter((item) => item.id !== certificate.id))
      setMessage(`Approved ${certificate.title}`)
    } catch (e: any) {
      setMessage(e?.message || 'Approval failed')
    } finally {
      setActionLoading(null)
    }
  }

  const submitRejection = async () => {
    if (!rejecting) return
    setActionLoading(rejecting.id)
    try {
      const res = await rejectCertificate(rejecting.id, { rejection_reason: rejectionReason, rejection_message: rejectionMessage })
      if (!res.ok) throw new Error((await res.json().catch(() => ({} as any)))?.detail || 'Rejection failed')
      setPending((prev) => prev.filter((item) => item.id !== rejecting.id))
      setRejecting(null)
      setRejectionReason('INVALID_FORMAT')
      setRejectionMessage('')
      setMessage(`Rejected ${rejecting.title}`)
    } catch (e: any) {
      setMessage(e?.message || 'Rejection failed')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Certificate Reviews</h1>
              <p className="text-slate-600 text-sm mt-1">Review certificate submissions from your mentees.</p>
            </div>
            <button onClick={loadData} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
          {message ? <div className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{message}</div> : null}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center text-slate-600 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading reviews...</div>
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center text-slate-500">No certificates pending review.</div>
        ) : (
          <div className="space-y-4">
            {pending.map((cert) => {
              const isOpen = Boolean(expanded[cert.id])
              return (
                <div key={cert.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <FileText className="w-4 h-4" /> Pending review
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900 mt-1">{cert.title}</h2>
                      <div className="text-sm text-slate-600 mt-1">
                        {cert.student_name || cert.student_reg_no} · {cert.issuing_organization} · {cert.certificate_type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Submitted on {cert.created_at?.slice(0, 10) || cert.issue_date}</div>
                      {isOpen ? (
                        <div className="mt-4 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4">
                          <div><span className="font-semibold">Issue date:</span> {cert.issue_date}</div>
                          {cert.expiry_date ? <div className="mt-1"><span className="font-semibold">Expiry date:</span> {cert.expiry_date}</div> : null}
                          {cert.file ? (
                            <a href={cert.file} target="_blank" rel="noreferrer" className="inline-flex mt-3 text-indigo-700 font-medium hover:underline">Open certificate file</a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 self-start">
                      <button onClick={() => setExpanded((prev) => ({ ...prev, [cert.id]: !prev[cert.id] }))} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50">
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Details
                      </button>
                      <button onClick={() => approve(cert)} disabled={actionLoading === cert.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        {actionLoading === cert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Approve
                      </button>
                      <button onClick={() => setRejecting(cert)} disabled={actionLoading === cert.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                        <X className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {rejecting ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900">Reject Certificate</h3>
            <p className="text-sm text-slate-500 mt-1">{rejecting.title}</p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <select value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200">
                  {rejectionReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea value={rejectionMessage} onChange={(e) => setRejectionMessage(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-xl border border-slate-200" placeholder="Add a short note for the student" />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setRejecting(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitRejection} disabled={actionLoading === rejecting.id} className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2">
                {actionLoading === rejecting.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Send Rejection
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
