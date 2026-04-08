/**
 * Write-through cache utility for COE key-value data.
 *
 * Pattern:
 *   • kvHydrate(key) — fetch from DB → localStorage (on mount).
 *     If DB is empty but localStorage has data, syncs UP to DB.
 *   • kvSave(key, data) — write to localStorage + async POST to DB.
 *   • kvRemove(key) — delete from localStorage + async DELETE in DB.
 */

import fetchWithAuth from '../services/fetchAuth';

/* ---- hydrate (DB → localStorage) ---- */

export async function kvHydrate(key: string): Promise<any> {
  try {
    const res = await fetchWithAuth(
      `/api/coe/kv-store/?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return null;
    const json = await res.json();

    if (json.data !== null && json.data !== undefined) {
      // DB has data — push into localStorage
      window.localStorage.setItem(key, JSON.stringify(json.data));
      return json.data;
    }

    // DB is empty — DO NOT sync localStorage up to DB!
    // Just return null and do not POST anything.
    return null;
  } catch {
    return null;
  }
}

/* ---- save (localStorage + DB) ---- */

export function kvSave(key: string, data: any): void {
  if (data === null || data === undefined) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, JSON.stringify(data));
  }
  fetchWithAuth('/api/coe/kv-store/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data }),
  }).catch(() => {});
}

/* ---- remove (localStorage + DB) ---- */

export function kvRemove(key: string): void {
  window.localStorage.removeItem(key);
  fetchWithAuth(`/api/coe/kv-store/?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  }).catch(() => {});
}
