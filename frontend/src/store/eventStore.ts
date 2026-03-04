/**
 * eventStore.ts
 *
 * Centralised in-memory + localStorage store for HOD-created college events.
 * Both the HOD creation module and the Branding approval module share this
 * store so that status changes are immediately visible to both roles.
 */

const STORAGE_KEY = 'idcs_college_events';
const CLEANUP_KEY = 'idcs_college_events_cleanup_v2';

export type EventStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';

export interface GuestInfo {
  name: string;
  imageDataUrl?: string; // base64 data URL previewed in poster
}

export interface CollegeEvent {
  id: string;
  title: string;
  venue: string;
  dateTime: string;         // ISO string
  coordinatorCount: number;
  hasChiefGuest: boolean;
  chiefGuests: GuestInfo[];
  status: EventStatus;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;        // username of the HOD who created it
  createdByName?: string;   // display name of the HOD who created it
  department?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function load(): CollegeEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    let items: CollegeEvent[] = Array.isArray(parsed) ? (parsed as CollegeEvent[]) : [];

    // One-time cleanup: remove the specific old local test entry created during testing.
    const didCleanup = localStorage.getItem(CLEANUP_KEY) === '1';
    if (!didCleanup && items.length) {
      const kept = items.filter((e) => {
        const createdBy = String((e as any)?.createdBy || '').trim().toLowerCase();
        const title = String((e as any)?.title || '').trim().toLowerCase();
        // Matches the visible test card: title 'Avudaiappan resign day' and HOD shown as 'hod'.
        const isTargetTestEntry = createdBy === 'hod' && title === 'avudaiappan resign day';
        return !isTargetTestEntry;
      });
      if (kept.length !== items.length) {
        items = kept;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }
      localStorage.setItem(CLEANUP_KEY, '1');
    }

    return items;
  } catch {
    return [];
  }
}

function save(events: CollegeEvent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all events (newest first). */
export function getAllEvents(): CollegeEvent[] {
  return load().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Return events visible in the Branding approval queue (non-Draft). */
export function getBrandingEvents(): CollegeEvent[] {
  return getAllEvents().filter((e) => e.status !== 'Draft');
}

/** Return events created by a specific user. */
export function getEventsByCreator(username: string): CollegeEvent[] {
  return getAllEvents().filter((e) => e.createdBy === username);
}

/** Create a new event and persist it. Returns the created event. */
export function createEvent(
  data: Omit<CollegeEvent, 'id' | 'createdAt' | 'updatedAt'>,
): CollegeEvent {
  const now = new Date().toISOString();
  const event: CollegeEvent = {
    ...data,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  const events = load();
  events.unshift(event);
  save(events);
  return event;
}

/** Update fields on an existing event. */
export function updateEvent(id: string, patch: Partial<CollegeEvent>): CollegeEvent | null {
  const events = load();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  events[idx] = { ...events[idx], ...patch, updatedAt: new Date().toISOString() };
  save(events);
  return events[idx];
}

/** Change status of an event. */
export function setEventStatus(
  id: string,
  status: EventStatus,
  reviewNote?: string,
): CollegeEvent | null {
  return updateEvent(id, { status, ...(reviewNote !== undefined ? { reviewNote } : {}) });
}

/** Delete an event permanently. */
export function deleteEvent(id: string): void {
  const events = load().filter((e) => e.id !== id);
  save(events);
}
