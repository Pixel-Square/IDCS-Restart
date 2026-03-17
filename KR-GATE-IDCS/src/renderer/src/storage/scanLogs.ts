export type ScanMode = 'ONLINE' | 'OFFLINE'

export type ScanLogItem = {
  id: string
  uid: string
  recorded_at: string
  mode: ScanMode
  direction?: 'OUT' | 'IN'
  title: string
  subtitle?: string
}

const KEY = 'kr_gate_scan_logs_v1'
const MAX = 500

let cache: ScanLogItem[] | null = null
let writeTimer: number | null = null

function ensureLoaded(): ScanLogItem[] {
  if (cache) return cache
  try {
    const raw = window.localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    cache = Array.isArray(arr) ? (arr as ScanLogItem[]) : []
  } catch {
    cache = []
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
  }, 160)
}

function readAll(): ScanLogItem[] {
  return ensureLoaded()
}

function writeAll(items: ScanLogItem[]) {
  cache = items
  scheduleWrite()
}

export function listScanLogs(): ScanLogItem[] {
  // Return sorted copy; do not mutate cache order.
  return [...readAll()].sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1))
}

export function appendScanLog(item: Omit<ScanLogItem, 'id' | 'recorded_at'>) {
  const next: ScanLogItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    recorded_at: new Date().toISOString(),
    ...item,
  }
  const items = ensureLoaded()
  items.push(next)
  if (items.length > MAX) items.splice(0, items.length - MAX)
  scheduleWrite()
}
