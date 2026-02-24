// Simple localStorage helpers for JSON values
export function lsGet<T = unknown>(key: string): T | null {
  try {
    const val = window.localStorage.getItem(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function lsRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
