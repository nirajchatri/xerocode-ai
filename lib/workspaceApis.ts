import { apiUrl, getStudioAuthHeaders, readApiJson, studioFetch } from './apiBase';
import type { SavedApi } from './savedApis';
import { readSavedApis, writeSavedApis } from './savedApis';
import type { ExternalApiDefinition } from './externalApis';
import { normalizeExternalApi, readExternalApis, writeExternalApis } from './externalApis';

export function hasWorkspaceAuth(): boolean {
  return Boolean(getStudioAuthHeaders()['x-user-email']);
}

function studioFetchHeaders(includeJsonBody: boolean): Record<string, string> {
  return {
    Accept: 'application/json',
    ...(includeJsonBody ? { 'Content-Type': 'application/json' } : {}),
    ...getStudioAuthHeaders(),
  };
}

/** Latest datasource Bearer JWT stored for this user + connection (control DB). */
export async function fetchStoredPublicApiJwt(
  connectionId: number,
): Promise<{ token: string | null; expiresAt: string | null }> {
  const cid = Number(connectionId);
  if (!Number.isFinite(cid) || cid <= 0) return { token: null, expiresAt: null };
  const headers = studioFetchHeaders(false);
  const res = await fetch(
    apiUrl(`/api/workspace/public-api-token?connectionId=${encodeURIComponent(String(cid))}`),
    { headers },
  );
  const data = await readApiJson<{ ok?: boolean; token?: string | null; expiresAt?: string | null; message?: string }>(
    res,
  );
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  const token = data.token != null && String(data.token).trim() ? String(data.token).trim() : null;
  const expiresAt = data.expiresAt != null ? String(data.expiresAt) : null;
  return { token, expiresAt };
}

/** Push browser-only blueprint APIs into the DB once when the account has none (cross-device migration). */
export async function migrateLocalBlueprintApisIfRemoteEmpty(): Promise<void> {
  if (!hasWorkspaceAuth()) return;
  try {
    const res = await studioFetch(apiUrl('/api/workspace/blueprint-apis'), { headers: studioFetchHeaders(false) });
    const data = await readApiJson<{ ok?: boolean; apis?: unknown[] }>(res);
    if (!res.ok || !data.ok) return;
    const remote = Array.isArray(data.apis) ? data.apis.length : 0;
    if (remote > 0) return;
    const local = readSavedApis();
    for (const api of local) {
      await upsertBlueprintApiWorkspace(api);
    }
  } catch {
    /* offline / API down — keep local only */
  }
}

export async function migrateLocalExternalApisIfRemoteEmpty(): Promise<void> {
  if (!hasWorkspaceAuth()) return;
  try {
    const res = await studioFetch(apiUrl('/api/workspace/external-apis'), { headers: studioFetchHeaders(false) });
    const data = await readApiJson<{ ok?: boolean; externalApis?: unknown[] }>(res);
    if (!res.ok || !data.ok) return;
    const remote = Array.isArray(data.externalApis) ? data.externalApis.length : 0;
    if (remote > 0) return;
    const local = readExternalApis();
    for (const ex of local) {
      await upsertExternalApiWorkspace(ex);
    }
  } catch {
    /* ignore */
  }
}

export async function loadBlueprintApisWorkspace(): Promise<SavedApi[]> {
  const res = await studioFetch(apiUrl('/api/workspace/blueprint-apis'), { headers: studioFetchHeaders(false) });
  const data = await readApiJson<{ ok?: boolean; apis?: unknown[]; message?: string }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  const raw = Array.isArray(data.apis) ? data.apis : [];
  return raw.filter(Boolean) as SavedApi[];
}

export async function upsertBlueprintApiWorkspace(api: SavedApi): Promise<void> {
  const res = await studioFetch(apiUrl('/api/workspace/blueprint-apis'), {
    method: 'POST',
    headers: studioFetchHeaders(true),
    body: JSON.stringify({ api }),
  });
  const data = await readApiJson<{ ok?: boolean; message?: string }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
}

export async function deleteBlueprintApiWorkspace(id: string): Promise<void> {
  const res = await studioFetch(apiUrl(`/api/workspace/blueprint-apis/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: studioFetchHeaders(false),
  });
  const data = await readApiJson<{ ok?: boolean; message?: string }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
}

export async function loadExternalApisWorkspace(): Promise<ExternalApiDefinition[]> {
  const res = await studioFetch(apiUrl('/api/workspace/external-apis'), { headers: studioFetchHeaders(false) });
  const data = await readApiJson<{ ok?: boolean; externalApis?: unknown[]; message?: string }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  const raw = Array.isArray(data.externalApis) ? data.externalApis : [];
  return raw.map((row) => normalizeExternalApi(row));
}

export async function upsertExternalApiWorkspace(ext: ExternalApiDefinition): Promise<void> {
  const res = await studioFetch(apiUrl('/api/workspace/external-apis'), {
    method: 'POST',
    headers: studioFetchHeaders(true),
    body: JSON.stringify({ externalApi: ext }),
  });
  const data = await readApiJson<{ ok?: boolean; message?: string }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
}

export async function deleteExternalApiWorkspace(id: string): Promise<void> {
  const res = await studioFetch(apiUrl(`/api/workspace/external-apis/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: studioFetchHeaders(false),
  });
  const data = await readApiJson<{ ok?: boolean; message?: string }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
}

/** Mirror server list into localStorage so legacy reads stay consistent on this browser. */
export function mirrorBlueprintApisLocal(apis: SavedApi[]): void {
  writeSavedApis(apis);
}

export function mirrorExternalApisLocal(apis: ExternalApiDefinition[]): void {
  writeExternalApis(apis);
}
