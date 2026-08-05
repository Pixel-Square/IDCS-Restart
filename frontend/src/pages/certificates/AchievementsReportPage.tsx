import React, { useEffect, useState } from 'react'
import { Activity, AlertCircle, BarChart3, Download, Loader2, RefreshCw, ScrollText, ShieldCheck } from 'lucide-react'
import { exportCertificateReports, fetchCertificateReports } from '../../services/certificates'

type Props = { user?: any }

export default function AchievementsReportPage({ user }: Props) {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<any>(null)
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchCertificateReports()
      setReport(data)
    } catch (e: any) {
      setError(e?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const summary = report?.summary || {}

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-lg">
              <BarChart3 className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Achievement Reports</h1>
              <p className="text-slate-600 text-sm">Institution-wide certificate analytics, audit trail, and exports.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button
              onClick={async () => {
                const res = await exportCertificateReports()
                if (!res.ok) return
                const blob = await res.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'certificate_reports.csv'
                a.click()
                window.URL.revokeObjectURL(url)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        {error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 inline-flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : null}

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-20 text-center text-slate-600 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading reports...</div>
        ) : report ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              {[
                { label: 'Certificates', value: summary.certificates || 0, icon: ScrollText, tone: 'bg-slate-900 text-white' },
                { label: 'Approved', value: summary.approved || 0, icon: ShieldCheck, tone: 'bg-emerald-600 text-white' },
                { label: 'Pending', value: summary.pending || 0, icon: Activity, tone: 'bg-amber-500 text-white' },
                { label: 'Rejected', value: summary.rejected || 0, icon: AlertCircle, tone: 'bg-rose-600 text-white' },
                { label: 'Achievements', value: summary.achievements || 0, icon: BarChart3, tone: 'bg-indigo-600 text-white' },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className={`rounded-2xl p-4 shadow-sm ${item.tone}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs uppercase tracking-wide opacity-80 font-semibold">{item.label}</div>
                        <div className="text-2xl font-bold mt-1">{item.value}</div>
                      </div>
                      <Icon className="w-6 h-6 opacity-90" />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Certificate Types</h2>
                <div className="space-y-3">
                  {(summary.top_certificate_types || []).map((row: any) => (
                    <div key={row.certificate_type} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                      <span className="text-sm font-medium text-slate-800">{String(row.certificate_type || '').replace(/_/g, ' ')}</span>
                      <span className="text-sm font-semibold text-slate-900">{row.total}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Audit Trail</h2>
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {(report.recent_audit_logs || []).map((log: any) => (
                    <div key={log.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{log.action}</span>
                        <span className="text-xs text-slate-500">{log.created_at?.slice(0, 19).replace('T', ' ')}</span>
                      </div>
                      <div className="text-slate-600 mt-1">{log.actor_username}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Achievements</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(report.recent_achievements || []).slice(0, 12).map((item: any) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{String(item.achievement_type || '').replace(/_/g, ' ')}</div>
                    <div className="font-semibold text-slate-900 mt-1">{item.title}</div>
                    <div className="text-sm text-slate-600 mt-1">{item.student_name || item.student_reg_no}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
