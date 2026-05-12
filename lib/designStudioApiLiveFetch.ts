import {
  expandSavedApiEndpoints,
  type SavedApi,
  type SavedEndpoint,
} from './savedApis';
import {
  jsonParamRowsToBodyString,
  type ExternalApiDefinition,
  type ExternalApiKeyValue,
} from './externalApis';
import { apiUrl, getStudioAuthHeaders, persistPublicApiBearerJwt, readApiJson, readSavedPublicApiBearerJwt, studioFetch } from './apiBase';

export function normalizePayloadToRecords(payload: unknown): Record<string, unknown>[] {
  if (payload === null || payload === undefined) return [];
  if (Array.isArray(payload)) {
    const objects = payload.filter(
      (x): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)
    );
    if (objects.length > 0) return objects;
    return payload.map((val, i) => ({ index: i, value: val })) as Record<string, unknown>[];
  }
  if (typeof payload !== 'object') return [];
  const o = payload as Record<string, unknown>;
  for (const k of ['data', 'items', 'results', 'records', 'rows', 'value'] as const) {
    const v = o[k];
    if (Array.isArray(v)) {
      const objects = v.filter(
        (x): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)
      );
      if (objects.length > 0) return objects;
      if (v.length > 0)
        return v.map((val, i) => ({ index: i, value: val })) as Record<string, unknown>[];
    }
  }
  return [o];
}

function buildUrlWithQuery(baseUrl: string, rows: ExternalApiKeyValue[]): string {
  const u = baseUrl.trim();
  if (!u) return '';
  try {
    const url = new URL(u.includes('://') ? u : `https://${u}`);
    rows.forEach((r) => {
      const k = r.key.trim();
      if (!k) return;
      url.searchParams.append(k, r.value);
    });
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    rows.forEach((r) => {
      const k = r.key.trim();
      if (!k) return;
      params.append(k, r.value);
    });
    const qs = params.toString();
    if (!qs) return u;
    return `${u}${u.includes('?') ? '&' : '?'}${qs}`;
  }
}

function headersFromExternal(rows: ExternalApiKeyValue[], auth: ExternalApiDefinition['authType'], bearer: string): Headers {
  const h = new Headers();
  rows.forEach((r) => {
    const k = r.key.trim();
    if (!k) return;
    h.set(k, r.value);
  });
  if (auth === 'bearer' && bearer.trim()) {
    h.set('Authorization', `Bearer ${bearer.trim()}`);
  }
  return h;
}

/** Prefer collection GET (no path placeholders). */
export function pickBlueprintListEndpoint(api: SavedApi): SavedEndpoint | null {
  const eps = expandSavedApiEndpoints(api);
  const noParams = eps.filter((e) => e.method === 'GET' && e.pathParams.length === 0);
  if (noParams.length > 0) return noParams[0];
  const anyGet = eps.find((e) => e.method === 'GET');
  return anyGet ?? null;
}

export function computeBlueprintRunUrl(publicBaseUrl: string, ep: SavedEndpoint): string {
  let p = ep.path;
  ep.pathParams.forEach((param) => {
    const placeholder =
      /id$/i.test(param) || /^(id|pk)$/i.test(param) ? '1' : '';
    p = p.replace(`:${param}`, encodeURIComponent(placeholder || '1'));
  });
  const params = new URLSearchParams();
  const qs = params.toString();
  const base = (publicBaseUrl || '').trim().replace(/\/+$/, '');
  const path = p.startsWith('/') ? p : `/${p}`;
  const root = base || '';
  return qs ? `${root}${path}?${qs}` : `${root}${path}`;
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`Expected JSON from API (HTTP ${res.status}).`);
  }
}

export async function fetchExternalSavedApi(ex: ExternalApiDefinition): Promise<unknown> {
  const url = buildUrlWithQuery(ex.url, ex.queryParams).trim();
  if (!url) throw new Error('External API URL is empty.');
  const headers = headersFromExternal(ex.headers, ex.authType, ex.bearerToken);
  let body: string | undefined;
  if (ex.method === 'POST' || ex.method === 'PUT' || ex.method === 'PATCH') {
    if (ex.bodyKind === 'json') {
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      body = ex.bodyRaw;
    } else if (ex.bodyKind === 'json-params') {
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      body = jsonParamRowsToBodyString(ex.bodyJsonParams);
    } else if (ex.bodyKind === 'urlencoded') {
      const params = new URLSearchParams();
      ex.bodyFormFields.forEach((r) => {
        const k = r.key.trim();
        if (!k) return;
        params.append(k, r.value);
      });
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
      }
      body = params.toString();
    }
  }

  const res = await fetch(url, {
    method: ex.method,
    headers,
    body,
    mode: 'cors',
  });
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`);
  }
  return parseJsonResponse(res);
}

export async function fetchBlueprintSavedList(api: SavedApi): Promise<unknown> {
  const ep = pickBlueprintListEndpoint(api);
  if (!ep) throw new Error('No callable GET route found for this blueprint API.');
  const url = computeBlueprintRunUrl(api.publicBaseUrl || '', ep);
  if (!url || url === '/') throw new Error('Blueprint base URL is not configured.');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...getStudioAuthHeaders(),
  };
  const bearer = readSavedPublicApiBearerJwt().trim();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  let bodyToSend: string | undefined;
  if (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') {
    headers['Content-Type'] = 'application/json';
    bodyToSend = ep.payloadSample || '{}';
  }

  const res = await fetch(url, {
    method: ep.method,
    headers,
    body: bodyToSend,
    mode: 'cors',
  });
  if (!res.ok) {
    throw new Error(`Blueprint API returned HTTP ${res.status}. Issue a Bearer JWT from API Builder → Run if routes are protected.`);
  }
  return parseJsonResponse(res);
}

/** Try to refresh bearer JWT for blueprint calls (same datasource as Run drawer). */
export async function tryIssueBlueprintBearerJwt(connectionId: number): Promise<void> {
  const hdrs = getStudioAuthHeaders();
  if (!hdrs['x-user-email']) return;
  try {
    const res = await studioFetch(apiUrl('/api/public-api-token/issue'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...hdrs },
      body: JSON.stringify({ connectionId, expiresInHours: 24 }),
    });
    const data = await readApiJson<{ ok?: boolean; token?: string; message?: string }>(res);
    if (!res.ok || !data?.ok || !data.token) {
      return;
    }
    persistPublicApiBearerJwt(data.token);
  } catch {
    /* ignore — user may already have a saved JWT */
  }
}
