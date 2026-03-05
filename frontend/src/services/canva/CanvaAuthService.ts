/**
 * CanvaAuthService.ts
 *
 * OAuth 2.0 PKCE flow for the Canva Connect API.
 *
 * Architecture (matching the ecommerce starter-kit pattern):
 *   1. Frontend calls initiateOAuth() → redirects browser to
 *      GET /api/canva/oauth/authorize?origin=<this-window-origin>
 *   2. Django backend generates PKCE, stores state+verifier in the server
 *      session (like the starter-kit's signed cookies), and redirects the
 *      browser to Canva's authorisation endpoint.
 *   3. User approves on Canva → Canva redirects back to
 *      /api/canva/oauth/callback  (the registered redirect URI)
 *   4. Django exchanges the code for tokens, stores them in the session,
 *      and redirects the browser to /branding/templates?canva_connected=1
 *   5. TemplatesListPage detects ?canva_connected=1 and calls
 *      loadConnectionFromBackend() to pull the tokens into localStorage.
 *
 * Redirect URI to register in the Canva Developer Portal:
 *   Dev  : http://localhost:5173/api/canva/oauth/callback  (via Vite proxy)
 *   Prod : https://idcs.krgi.co.in/api/canva/oauth/callback  (via Nginx)
 */

import {
  saveConnection,
  clearConnection,
  getConnection,
  type CanvaConnection,
} from '../../store/canvaStore';

// ── Server-side OAuth (primary flow) ─────────────────────────────────────────

/**
 * Start the Canva OAuth flow.
 * Redirects the browser to the Django backend /authorize endpoint,
 * which handles PKCE and redirects onward to Canva.
 */
export function initiateOAuth(): void {
  const origin = encodeURIComponent(window.location.origin);
  window.location.href = `/api/canva/oauth/authorize?origin=${origin}`;
}

/**
 * Fetch the current Canva connection from the Django session.
 * Called after a successful OAuth callback redirect (?canva_connected=1)
 * and on every page mount to restore a live session.
 *
 * Updates localStorage cache so getConnection() stays in sync.
 */
export async function loadConnectionFromBackend(): Promise<CanvaConnection | null> {
  try {
    const res = await fetch('/api/canva/oauth/connection', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json() as {
      connected: boolean;
      access_token?: string;
      expires_at?: number;
      user_id?: string;
      display_name?: string;
    };

    if (!data.connected || !data.access_token) {
      clearConnection();
      return null;
    }

    const conn: CanvaConnection = {
      accessToken:  data.access_token,
      refreshToken: undefined,
      expiresAt:    data.expires_at ?? Date.now() + 3_600_000,
      userId:       data.user_id ?? '',
      displayName:  data.display_name ?? 'Canva User',
    };
    saveConnection(conn);
    return conn;
  } catch {
    return null;
  }
}

/**
 * Revoke the current token on the backend and clear the local connection.
 */
export async function disconnect(): Promise<void> {
  try {
    await fetch('/api/canva/oauth/connection', {
      method:      'DELETE',
      credentials: 'include',
    });
  } catch {
    // Always clear locally even if revocation fails.
  }
  clearConnection();
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { getConnection };
export type { CanvaConnection };
