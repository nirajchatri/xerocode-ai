/**
 * Build URL for REST calls.
 * - If `VITE_API_BASE_URL` is set, it wins (any mode).
 * - In the browser, defaults to same-origin paths like `/api/...` so Vite’s dev/preview proxy forwards
 *   to the Express API. Hardcoding `127.0.0.1:8787` breaks when you open the app via LAN IP or another host.
 * - Without `window` (SSR/scripts), falls back to `http://127.0.0.1:${VITE_API_PORT||8787}` in dev.
 */

/** Persisted datasource Bearer JWT (API Builder + Saved APIs Run). Sensitive — browser localStorage only. */
export const PUBLIC_API_BEARER_JWT_STORAGE_KEY = 'xerocode_public_api_bearer_jwt_v1';

export function normalizeBearerJwtInput(raw: string): string {
  let t = String(raw ?? '').trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
  return t;
}

export function readSavedPublicApiBearerJwt(): string {
  try {
    if (typeof window === 'undefined') return '';
    const s = window.localStorage.getItem(PUBLIC_API_BEARER_JWT_STORAGE_KEY);
    return s ? String(s).trim() : '';
  } catch {
    return '';
  }
}

/** Saves JWT raw token (no "Bearer " prefix). Clears storage when empty or placeholder. */
export function persistPublicApiBearerJwt(raw: string): void {
  try {
    if (typeof window === 'undefined') return;
    const t = normalizeBearerJwtInput(raw);
    if (!t || /^YOUR_BEARER_TOKEN$/i.test(t)) {
      window.localStorage.removeItem(PUBLIC_API_BEARER_JWT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PUBLIC_API_BEARER_JWT_STORAGE_KEY, t);
  } catch {
    /* ignore quota / private mode */
  }
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return `${configured.replace(/\/$/, '')}${p}`;
  }
  if (typeof window !== 'undefined') {
    return p;
  }
  if (import.meta.env.DEV) {
    const port = import.meta.env.VITE_API_PORT || '8787';
    return `http://127.0.0.1:${port}${p}`;
  }
  return p;
}

/**
 * Chrome aggressively caches same-origin GET responses (including /api JSON). Safari often bypasses this.
 * Use this instead of raw fetch() for workspace/API calls so lists (datasources, blueprints, etc.) stay fresh.
 */
export function studioFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    cache: init?.cache ?? 'no-store',
  });
}

/** Parse JSON from an API response; fail clearly if the body is HTML (e.g. Vite index.html). */
export async function readApiJson<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || trimmed.startsWith('<!')) {
    throw new Error(
      `The server returned HTML instead of JSON (URL: ${response.url || 'unknown'}, HTTP ${response.status}). Start the API (e.g. npm run dev:api or npm run dev:full), ensure Vite proxies /api, or set VITE_API_BASE_URL to your API origin.`
    );
  }
  if (!trimmed) {
    throw new Error(`Empty API response (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Invalid JSON from API (HTTP ${response.status}): ${trimmed.slice(0, 160)}${trimmed.length > 160 ? '…' : ''}`
    );
  }
}

/** Headers used by the API server to resolve tenant/user (`req.context`). */
export function getStudioAuthHeaders(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem('active_user_profile');
    const p = raw ? JSON.parse(raw) : null;
    const email = String(p?.email || '').trim().toLowerCase();
    const fullName = String(p?.fullName || '').trim();
    if (!email) return {};
    return {
      'x-user-email': email,
      'x-user-name': fullName || email,
    };
  } catch {
    return {};
  }
}
