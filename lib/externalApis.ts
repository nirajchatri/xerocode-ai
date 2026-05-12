export type ExternalApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ExternalApiAuthType = 'none' | 'bearer';

export type ExternalApiBodyKind = 'none' | 'json' | 'json-params' | 'urlencoded';

export type ExternalApiKeyValue = { key: string; value: string };

export type ExternalApiDefinition = {
  id: string;
  name: string;
  method: ExternalApiHttpMethod;
  url: string;
  queryParams: ExternalApiKeyValue[];
  authType: ExternalApiAuthType;
  bearerToken: string;
  headers: ExternalApiKeyValue[];
  bodyKind: ExternalApiBodyKind;
  bodyRaw: string;
  /** Key/value rows → JSON object body (values parsed as JSON when valid: numbers, booleans, nested objects). */
  bodyJsonParams: ExternalApiKeyValue[];
  /** For urlencoded body — key/value rows */
  bodyFormFields: ExternalApiKeyValue[];
  savedAt: number;
};

export const EXTERNAL_APIS_STORAGE_KEY = 'xerocode_ai_external_apis_v1';

export const defaultExternalApiDraft = (): Omit<ExternalApiDefinition, 'id' | 'savedAt'> => ({
  name: 'Untitled request',
  method: 'GET',
  url: '',
  queryParams: [{ key: '', value: '' }],
  authType: 'none',
  bearerToken: '',
  headers: [
    { key: 'Accept', value: 'application/json' },
    { key: '', value: '' },
  ],
  bodyKind: 'none',
  bodyRaw: '',
  bodyJsonParams: [{ key: '', value: '' }],
  bodyFormFields: [{ key: '', value: '' }],
});

export function readExternalApis(): ExternalApiDefinition[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(EXTERNAL_APIS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeExternalApi);
  } catch {
    return [];
  }
}

function kvRow(x: unknown): ExternalApiKeyValue {
  const o = x as { key?: string; value?: string };
  return { key: String(o?.key ?? ''), value: String(o?.value ?? '') };
}

/** Build JSON request body from parameter rows (Postman-style key/value → JSON object). */
export function jsonParamRowsToBodyString(rows: ExternalApiKeyValue[]): string {
  const obj: Record<string, unknown> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    const v = r.value.trim();
    if (v === '') {
      obj[k] = '';
      continue;
    }
    try {
      obj[k] = JSON.parse(v) as unknown;
    } catch {
      obj[k] = v;
    }
  }
  return JSON.stringify(obj);
}

/** Parse JSON object string into editable parameter rows. */
export function parseJsonObjectStringToParamRows(json: string): ExternalApiKeyValue[] {
  try {
    const o = JSON.parse(json || '{}') as unknown;
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
      const entries = Object.entries(o as Record<string, unknown>);
      if (entries.length === 0) return [{ key: '', value: '' }];
      return entries.map(([key, value]) => ({
        key,
        value:
          value === undefined || value === null
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value),
      }));
    }
  } catch {
    /* ignore */
  }
  return [{ key: '', value: '' }];
}

export function normalizeExternalApi(row: unknown): ExternalApiDefinition {
  const r = row as Partial<ExternalApiDefinition>;
  const base = defaultExternalApiDraft();
  return {
    id: String(r.id || `ext-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    name: String(r.name || base.name),
    method: (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(r.method))
      ? r.method
      : 'GET') as ExternalApiHttpMethod,
    url: String(r.url ?? ''),
    queryParams: Array.isArray(r.queryParams) ? r.queryParams.map(kvRow) : base.queryParams,
    authType: r.authType === 'bearer' ? 'bearer' : 'none',
    bearerToken: String(r.bearerToken ?? ''),
    headers: Array.isArray(r.headers) ? r.headers.map(kvRow) : base.headers,
    bodyKind: ['none', 'json', 'json-params', 'urlencoded'].includes(String(r.bodyKind))
      ? (r.bodyKind as ExternalApiBodyKind)
      : 'none',
    bodyRaw: String(r.bodyRaw ?? ''),
    bodyJsonParams: Array.isArray(r.bodyJsonParams)
      ? r.bodyJsonParams.map(kvRow)
      : typeof r.bodyRaw === 'string' && r.bodyKind === 'json-params'
        ? parseJsonObjectStringToParamRows(r.bodyRaw)
        : base.bodyJsonParams,
    bodyFormFields: Array.isArray(r.bodyFormFields) ? r.bodyFormFields.map(kvRow) : base.bodyFormFields,
    savedAt: typeof r.savedAt === 'number' ? r.savedAt : Date.now(),
  };
}

export function writeExternalApis(apis: ExternalApiDefinition[]): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(EXTERNAL_APIS_STORAGE_KEY, JSON.stringify(apis));
  } catch {
    /* ignore */
  }
}

export function upsertExternalApi(api: ExternalApiDefinition): ExternalApiDefinition[] {
  const list = readExternalApis();
  const idx = list.findIndex((a) => a.id === api.id);
  const next = idx >= 0 ? [...list] : [api, ...list];
  if (idx >= 0) next[idx] = api;
  writeExternalApis(next);
  return next;
}

export function removeExternalApi(id: string): ExternalApiDefinition[] {
  const next = readExternalApis().filter((a) => a.id !== id);
  writeExternalApis(next);
  return next;
}

export function getExternalApiById(id: string): ExternalApiDefinition | null {
  return readExternalApis().find((a) => a.id === id) ?? null;
}
