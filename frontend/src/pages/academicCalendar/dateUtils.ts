export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1)
}

export function formatMonthTitle(d: Date): string {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

export function daysInMonthGrid(month: Date): Date[] {
  const first = startOfMonth(month)
  const last = endOfMonth(month)

  // Sunday-start grid (0=Sun)
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay())

  const gridEnd = new Date(last)
  gridEnd.setDate(last.getDate() + (6 - last.getDay()))

  const out: Date[] = []
  const cur = new Date(gridStart)
  while (cur <= gridEnd) {
    out.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
