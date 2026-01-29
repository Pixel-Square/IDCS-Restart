export function lsGet<T = any>(key: string): T | null {
  try {
    if (typeof window === 'undefined') return null as any;
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch (e) {
    return null;
  }
}

export function lsSet(key: string, value: any) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // ignore
  }
}

export function lsRemove(key: string) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  } catch (e) {}
}