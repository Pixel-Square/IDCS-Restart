import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { listScanLogs } from '../storage/scanLogs'

export default function GateLogsPage(): JSX.Element {
  const nav = useNavigate()
  const [refresh, setRefresh] = useState(0)
  const items = useMemo(() => {
    void refresh
    return listScanLogs()
  }, [refresh])

  return (
    <main className="min-h-full bg-gray-50">
      <AppHeader />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold text-gray-900">Gate Logs</div>
            <div className="text-sm text-gray-500">Local scan history (ONLINE + OFFLINE)</div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold" onClick={() => setRefresh((v) => v + 1)}>
              Refresh
            </button>
            <button className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold" onClick={() => nav('/welcome')}>
              Back
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {items.length === 0 ? (
            <div className="p-5 text-sm text-gray-500">No logs yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3">Time</th>
                    <th className="text-left px-4 py-3">UID</th>
                    <th className="text-left px-4 py-3">Mode</th>
                    <th className="text-left px-4 py-3">IN/OUT</th>
                    <th className="text-left px-4 py-3">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(r.recorded_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono">{r.uid}</td>
                      <td className="px-4 py-3">{r.mode}</td>
                      <td className="px-4 py-3">{r.direction || '—'}</td>
                      <td className="px-4 py-3">
                        {r.mode === 'OFFLINE' ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-extrabold">
                            {r.direction || r.title}
                          </span>
                        ) : (
                          <>
                            <div className="font-semibold text-gray-900">{r.title}</div>
                            {r.subtitle && <div className="text-xs text-gray-500">{r.subtitle}</div>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
