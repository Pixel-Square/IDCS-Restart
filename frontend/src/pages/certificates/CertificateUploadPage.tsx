import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Award,
  CheckCircle2,
  FileUp,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import {
  CertificateRecord,
  fetchCertificateStats,
  fetchMyCertificates,
  uploadCertificate,
} from '../../services/certificates'

type Props = { user?: any }

const certificateTypes = [
  { value: 'COURSE_COMPLETION', label: 'Course Completion' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'SEMINAR', label: 'Seminar' },
  { value: 'HACKATHON', label: 'Hackathon' },
  { value: 'COMPETITION', label: 'Competition' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'ONLINE_COURSE', label: 'Online Course' },
  { value: 'CONFERENCE', label: 'Conference' },
  { value: 'CERTIFICATION', label: 'Professional Certification' },
  { value: 'AWARD', label: 'Award' },
  { value: 'OTHER', label: 'Other' },
]

export default function CertificateUploadPage({ user }: Props) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [myCertificates, setMyCertificates] = useState<CertificateRecord[]>([])
  const [stats, setStats] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 })
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    certificate_type: 'CERTIFICATION',
    title: '',
    issuing_organization: '',
    issue_date: '',
    expiry_date: '',
    custom_achievement: '',
  })

  const studentName = useMemo(() => {
    const profile = user?.student_profile || user?.profile || null
    return profile?.user?.username || user?.username || 'Student'
  }, [user])

  async function loadData() {
    setLoading(true)
    try {
      const [certs, counts] = await Promise.all([fetchMyCertificates(), fetchCertificateStats()])
      setMyCertificates(certs.results || [])
      setStats(counts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragActive(false)
    const dropped = event.dataTransfer.files?.[0] || null
    if (dropped) setFile(dropped)
  }

  const submit = async () => {
    if (!file) {
      setError('Please choose a certificate file.')
      return
    }
    if (!form.title.trim() || !form.issuing_organization.trim() || !form.issue_date) {
      setError('Please fill all required fields.')
      return
    }
    if (form.certificate_type === 'OTHER' && !form.custom_achievement.trim()) {
      setError('Please specify what kind of achievement you have earned.')
      return
    }
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const body = new FormData()
      body.append('certificate_type', form.certificate_type)
      const titleToSubmit =
        form.certificate_type === 'OTHER' && form.custom_achievement.trim()
          ? `${form.title.trim()} (${form.custom_achievement.trim()})`
          : form.title.trim()
      body.append('title', titleToSubmit)
      body.append('issuing_organization', form.issuing_organization.trim())
      body.append('issue_date', form.issue_date)
      if (form.expiry_date) body.append('expiry_date', form.expiry_date)
      body.append('file', file)

      const res = await uploadCertificate(body)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.detail || payload.error || 'Upload failed')
      }
      setSuccess('Certificate submitted for mentor review.')
      setFile(null)
      setForm({
        certificate_type: 'CERTIFICATION',
        title: '',
        issuing_organization: '',
        issue_date: '',
        expiry_date: '',
        custom_achievement: '',
      })
      await loadData()
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  const badgeClass = (status: string) => {
    if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (status === 'REJECTED') return 'bg-rose-100 text-rose-700 border-rose-200'
    return 'bg-amber-100 text-amber-700 border-amber-200'
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
                <Award className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">My Certificates</h1>
                <p className="text-slate-600 text-sm">Upload certificates and track mentor approval status.</p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              { label: 'Total', value: stats.total, tone: 'bg-slate-50 text-slate-800' },
              { label: 'Approved', value: stats.approved, tone: 'bg-emerald-50 text-emerald-800' },
              { label: 'Pending', value: stats.pending, tone: 'bg-amber-50 text-amber-800' },
              { label: 'Rejected', value: stats.rejected, tone: 'bg-rose-50 text-rose-800' },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl border border-slate-200 p-4 ${item.tone}`}>
                <div className="text-xs uppercase tracking-wide font-semibold opacity-80">{item.label}</div>
                <div className="text-2xl font-bold mt-1">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Upload Certificate</h2>
                <p className="text-sm text-slate-500">Mentor: {studentName}</p>
              </div>
              {file ? <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full">File selected</span> : null}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Certificate Type</label>
                <select
                  value={form.certificate_type}
                  onChange={(e) => setForm((p) => ({ ...p, certificate_type: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900"
                >
                  {certificateTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              {form.certificate_type === 'OTHER' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50/80 to-indigo-50/80 border border-indigo-200/80 shadow-sm space-y-2 transition-all duration-200">
                  <div className="flex items-center gap-2 text-indigo-950 font-semibold text-sm">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Achievement Type & Details</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Describe the specific achievement or recognition you have earned for mentor verification.
                  </p>
                  <input
                    type="text"
                    value={form.custom_achievement}
                    onChange={(e) => setForm((p) => ({ ...p, custom_achievement: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-indigo-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm shadow-sm"
                    placeholder="e.g. Patent Grant, Research Paper Publication, Fellowship, National Award..."
                  />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                  <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900" placeholder="React Bootcamp" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Issuing Organization</label>
                  <input value={form.issuing_organization} onChange={(e) => setForm((p) => ({ ...p, issuing_organization: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900" placeholder="Coursera / IEEE / ..." />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Issue Date</label>
                  <input type="date" value={form.issue_date} onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
                  <input type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900" />
                </div>
              </div>

              <label
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
              >
                <div className="p-3 rounded-full bg-white shadow-sm border border-slate-200">
                  <FileUp className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Drag and drop your certificate</div>
                  <div className="text-xs text-slate-500 mt-1">PDF, JPG, PNG up to 10 MB</div>
                </div>
                <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                {file ? <div className="text-sm text-indigo-700 font-medium">{file.name}</div> : null}
              </label>

              {error ? (
                <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
              {success ? (
                <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{success}</span>
                </div>
              ) : null}

              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow-sm disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Submit for review
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">My Submissions</h2>
                <p className="text-sm text-slate-500">Approved items are promoted to achievements automatically.</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-slate-600 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading...</div>
            ) : myCertificates.length === 0 ? (
              <div className="py-12 text-center text-slate-500">No certificates submitted yet.</div>
            ) : (
              <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
                {myCertificates.map((cert) => (
                  <div key={cert.id} className="rounded-2xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{cert.certificate_type.replace(/_/g, ' ')}</div>
                        <div className="text-base font-semibold text-slate-900 mt-1">{cert.title}</div>
                        <div className="text-sm text-slate-500 mt-1">{cert.issuing_organization} · {cert.issue_date}</div>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${badgeClass(cert.status)}`}>{cert.status.replace(/_/g, ' ')}</span>
                    </div>
                    {cert.status === 'REJECTED' && cert.rejection_message ? (
                      <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{cert.rejection_message}</div>
                    ) : null}
                    {cert.achievement ? (
                      <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        Verified achievement: {cert.achievement.title}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
