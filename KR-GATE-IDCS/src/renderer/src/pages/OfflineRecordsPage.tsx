import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { uploadGatepassOfflineRecords } from '../services/idscan'
import { useConnectivity } from '../state/connectivity'
import { clearSynced, listOfflineRecords, markSyncError, markSynced } from '../storage/offlineRecords'

export default function OfflineRecordsPage(): JSX.Element {
  const nav = useNavigate()
  const { isOnline } = useConnectivity()
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const records = useMemo(() => {
    void refresh
    return listOfflineRecords()
  }, [refresh])

  const pending = records.filter((r) => !r.synced_at)

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  const sync = async () => {
    setError(null)
    setBusy(true)
    try {
      const batches = chunk(pending, 200)
      for (const batch of batches) {
        try {
          await uploadGatepassOfflineRecords({
            device_label: 'KR-GATE-IDCS',
            records: batch.map((rec) => ({
              uid: rec.uid,
              direction: rec.direction,
              recorded_at: rec.recorded_at,
            })),
          })
          for (const rec of batch) markSynced(rec.id)
        } catch (e: any) {
          const msg = e?.message || 'Sync failed'
          for (const rec of batch) markSyncError(rec.id, msg)
        }
        setRefresh((v) => v + 1)
      }
    } catch (e: any) {
      setError(e?.message || 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-full bg-gray-50">
      <AppHeader />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-gray-900">OFFLINE Records</div>
            <div className="text-sm text-gray-500">Stored locally and synced when ONLINE.</div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!isOnline || busy || pending.length === 0}
              onClick={sync}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 text-sm font-semibold"
            >
              {busy ? 'Sending…' : 'Send to Database'}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                clearSynced()
                setRefresh((v) => v + 1)
              }}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold"
            >
              Clear Synced
            </button>
            <button
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold"
              onClick={() => nav('/welcome')}
            >
              Back
            </button>
          </div>
        </div>

        {!isOnline && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            App is OFFLINE. Records will sync when ONLINE.
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {records.length === 0 ? (
            <div className="p-5 text-sm text-gray-500">No offline records.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3">Time</th>
                    <th className="text-left px-4 py-3">UID</th>
                    <th className="text-left px-4 py-3">IN/OUT</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(r.recorded_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono">{r.uid}</td>
                      <td className="px-4 py-3">{r.direction}</td>
                      <td className="px-4 py-3">
                        {r.synced_at ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border bg-green-50 text-green-800 border-green-200">SYNCED</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-50 text-amber-800 border-amber-200">PENDING</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-600">{r.sync_error || ''}</td>
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
