function trimTrailingSlashes(value: string): string {
  return String(value || '').replace(/\/+$/, '');
}

function getFallbackFromEnvOrDefault(): string {
  const fromEnv = (import.meta as any)?.env?.VITE_API_BASE_FALLBACK;
  if (fromEnv) return trimTrailingSlashes(String(fromEnv));
  return 'https://db.krgi.co.in';
}

export function getApiBase(): string {
  const fromEnv = (import.meta as any)?.env?.VITE_API_BASE;
  if (fromEnv) return trimTrailingSlashes(String(fromEnv));

  if (typeof window !== 'undefined' && window.location) {
    const host = String(window.location.hostname || '').trim().toLowerCase();
    const port = String(window.location.port || '').trim();
    const protocol = String(window.location.protocol || 'http:').trim();

    if ((host === 'localhost' || host === '127.0.0.1') && (port === '' || port === '80' || port === '443')) {
      return trimTrailingSlashes(`${protocol}//${host}:8000`);
    }

    if (port === '5173' || port === '4173' || port === '3000') {
      return trimTrailingSlashes(`${protocol}//${host}:8000`);
    }

    if ((host === 'localhost' || host === '127.0.0.1') && (!port || port === '80' || port === '443')) {
      return trimTrailingSlashes(`${protocol}//${host}:8000`);
    }

    if (window.location.origin) return trimTrailingSlashes(String(window.location.origin));
  }

  return getFallbackFromEnvOrDefault();
}

export function getApiBaseCandidates(): string[] {
  const primary = trimTrailingSlashes(getApiBase());
  const fallback = trimTrailingSlashes(getFallbackFromEnvOrDefault());
  if (!fallback || fallback === primary) return [primary];
  return [primary, fallback];
}