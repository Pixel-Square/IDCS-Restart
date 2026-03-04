/**
 * CanvaAuthService.ts
 *
 * OAuth 2.0 PKCE flow for the Canva Connect API.
 *
 * Setup (add to frontend/.env):
 *   VITE_CANVA_CLIENT_ID=<your-client-id>
 *
 * The redirect URI registered in the Canva Developer Portal must be:
 *   <your-origin>/branding/oauth-callback
 *
 * The token exchange is handled by the Django backend (/api/canva/oauth/token)
 * to keep client_secret off the browser.
 */

import {
  saveConnection,
  clearConnection,
  getConnection,
  type CanvaConnection,
} from '../../store/canvaStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVA_AUTH_URL   = 'https://www.canva.com/api/oauth/authorize';
const PKCE_VERIFIER_KEY = 'canva_pkce_verifier';
const OAUTH_STATE_KEY   = 'canva_oauth_state';

/** Space-separated Canva OAuth scopes required by this integration. */
const CANVA_SCOPES = [
  'design:content:read',
  'design:content:write',
  'asset:read',
  'asset:write',
].join(' ');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientId(): string {
  return (import.meta as any).env?.VITE_CANVA_CLIENT_ID ?? (window as any).__CANVA_CLIENT_ID__ ?? '';
}

function getRedirectUri(): string {
  return `${window.location.origin}/branding/oauth-callback`;
}

/** Cryptographically random base64url string. */
async function randomBase64Url(byteLength = 32): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** SHA-256 hash → base64url (for PKCE code_challenge). */
async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(hash))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the Canva OAuth flow.
 * Generates a PKCE code_verifier + code_challenge, stores the verifier in
 * sessionStorage, then redirects the user to Canva's authorisation endpoint.
 */
export async function initiateOAuth(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error(
      'VITE_CANVA_CLIENT_ID is not set. Add it to frontend/.env and restart the dev server.',
    );
  }

  const verifier  = await randomBase64Url(32);
  const challenge = await sha256Base64Url(verifier);
  const state     = await randomBase64Url(16);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          getRedirectUri(),
    scope:                 CANVA_SCOPES,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state,
  });

  window.location.href = `${CANVA_AUTH_URL}?${params.toString()}`;
}

/**
 * Complete the OAuth flow after Canva redirects back.
 * Sends the authorisation code + PKCE verifier to the backend proxy
 * (POST /api/canva/oauth/token) which performs the server-side token exchange.
 */
export async function handleCallback(
  code: string,
  returnedState: string,
): Promise<CanvaConnection> {
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const verifier      = sessionStorage.getItem(PKCE_VERIFIER_KEY);

  if (!verifier) {
    throw new Error('PKCE verifier not found. The session may have expired — please try connecting again.');
  }
  if (returnedState !== expectedState) {
    throw new Error('OAuth state mismatch. This may indicate a CSRF attempt.');
  }

  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  const res = await fetch('/api/canva/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      code,
      code_verifier: verifier,
      redirect_uri:  getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err.detail ?? `Token exchange failed (${res.status})`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user_id?: string;
    display_name?: string;
  };

  const connection: CanvaConnection = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + (data.expires_in ?? 3600) * 1000,
    userId:       data.user_id ?? '',
    displayName:  data.display_name ?? 'Canva User',
  };

  saveConnection(connection);
  return connection;
}

/**
 * Revoke the current token and remove the stored connection.
 * Safe to call even when no connection exists.
 */
export async function disconnect(): Promise<void> {
  const conn = getConnection();
  if (conn) {
    try {
      await fetch('/api/canva/oauth/revoke', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ access_token: conn.accessToken }),
      });
    } catch {
      // Ignore network errors during revocation; always clear locally.
    }
  }
  clearConnection();
}

export { getConnection };
