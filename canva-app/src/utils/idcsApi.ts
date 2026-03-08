/**
 * idcsApi.ts
 *
 * Lightweight client for the IDCS Django REST API.
 * All requests go through the Vite proxy (/api → CANVA_BACKEND_HOST).
 *
 * Note: Inside the Canva iframe there is no active IDCS session cookie.
 * These calls use public/read-only endpoints or an API key if configured.
 */

export interface IDCSEvent {
  id: string;
  title: string;
  venue: string;
  dateTime: string;
  coordinatorCount: number;
  status: string;
  createdByName?: string;
  chiefGuests?: string[];
}

/**
 * Fetch approved/pending events from IDCS that are waiting for poster design.
 * Returns an empty array if the API is unreachable (Canva preview mode).
 */
export async function fetchPendingEvents(): Promise<IDCSEvent[]> {
  try {
    const res = await fetch('/api/events/?status=Pending+Approval&ordering=-created_at&limit=20', {
      headers: { Accept: 'application/json' },
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: IDCSEvent[] } | IDCSEvent[];
    return Array.isArray(data) ? data : (data.results ?? []);
  } catch {
    // Backend unreachable or no auth — return empty gracefully.
    return [];
  }
}

/**
 * Fetch a single event by ID.
 */
export async function fetchEvent(id: string): Promise<IDCSEvent | null> {
  try {
    const res = await fetch(`/api/events/${id}/`, {
      headers: { Accept: 'application/json' },
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json() as IDCSEvent;
  } catch {
    return null;
  }
}
