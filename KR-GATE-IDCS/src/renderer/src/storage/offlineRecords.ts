export type OfflineDirection = 'OUT' | 'IN'

export type OfflineScanRecord = {
  id: string
  uid: string
  direction: OfflineDirection
  recorded_at: string
  mode: 'OFFLINE'
  synced_at?: string | null
  sync_error?: string | null
}

const KEY = 'kr_gate_offline_records_v1'

let cache: OfflineScanRecord[] | null = null
let writeTimer: number | null = null
let lastDirectionByUid: Record<string, OfflineDirection> | null = null

function ensureLoaded(): OfflineScanRecord[] {
  if (cache) return cache
  try {
    const raw = window.localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    cache = Array.isArray(arr) ? (arr as OfflineScanRecord[]) : []
  } catch {
    cache = []
  }
  lastDirectionByUid = Object.create(null)
  for (const rec of cache) {
    if (rec?.uid && rec?.direction) (lastDirectionByUid as Record<string, OfflineDirection>)[rec.uid] = rec.direction
  }
  return cache
}

function flushWrite() {
  if (!cache) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // ignore
  }
}

function scheduleWrite() {
  if (writeTimer) return
  writeTimer = window.setTimeout(() => {
    writeTimer = null
    flushWrite()
  }, 120)
}

function readAll(): OfflineScanRecord[] {
  return ensureLoaded()
}

function writeAll(items: OfflineScanRecord[]) {
  cache = items
  // rebuild direction index for safety
  lastDirectionByUid = Object.create(null)
  for (const rec of items) {
    if (rec?.uid && rec?.direction) (lastDirectionByUid as Record<string, OfflineDirection>)[rec.uid] = rec.direction
  }
  scheduleWrite()
}

export function listOfflineRecords(): OfflineScanRecord[] {
  // Return a sorted copy (do not mutate cache order).
  return [...readAll()].sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1))
}

export function getNextDirection(uid: string): OfflineDirection {
  ensureLoaded()
  const last = lastDirectionByUid?.[uid]
  if (!last) return 'OUT'
  return last === 'OUT' ? 'IN' : 'OUT'
}

export function addOfflineRecord(uid: string): OfflineScanRecord {
  const direction = getNextDirection(uid)
  const rec: OfflineScanRecord = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    uid,
    direction,
    recorded_at: new Date().toISOString(),
    mode: 'OFFLINE',
    synced_at: null,
    sync_error: null,
  }
  const items = ensureLoaded()
  items.push(rec)
  if (lastDirectionByUid) lastDirectionByUid[uid] = direction
  scheduleWrite()
  return rec
}

export function markSynced(id: string) {
  const items = ensureLoaded()
  const idx = items.findIndex((r) => r.id === id)
  if (idx === -1) return
  items[idx] = { ...items[idx], synced_at: new Date().toISOString(), sync_error: null }
  scheduleWrite()
}

export function markSyncError(id: string, message: string) {
  const items = ensureLoaded()
  const idx = items.findIndex((r) => r.id === id)
  if (idx === -1) return
  items[idx] = { ...items[idx], sync_error: message || 'Sync failed' }
  scheduleWrite()
}

export function clearSynced() {
  const items = ensureLoaded().filter((r) => !r.synced_at)
  writeAll(items)
}
