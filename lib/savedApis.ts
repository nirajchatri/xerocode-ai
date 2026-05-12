export type ApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type SavedColumnDef = {
  name: string;
  type?: string;
  columnType?: string;
  key?: string;
};

export type SavedTableApiConfig = {
  enabled: boolean;
  basePath: string;
  methods: Record<ApiHttpMethod, boolean>;
  pathParams: string[];
  queryParams: string[];
  payloadFields: string[];
  responseFields: string[];
};

export type SavedCombinedTableSlice = {
  pathParams: string[];
  queryParams: string[];
  payloadFields: string[];
  responseFields: string[];
  joinColumn: string;
};

export type SavedCombinedApiConfig = {
  name: string;
  basePath: string;
  primaryTable: string;
  methods: Record<ApiHttpMethod, boolean>;
  tables: Record<string, SavedCombinedTableSlice>;
  columns?: Record<string, SavedColumnDef[]>;
};

export type SavedApiMode = 'separate' | 'combined';

export type SavedApiTableEntry = {
  table: string;
  columns: SavedColumnDef[];
  api: SavedTableApiConfig;
};

export type SavedApi = {
  id: string;
  name: string;
  savedAt: number;
  publicBaseUrl: string;
  apiMode: SavedApiMode;
  connection: {
    id: number;
    friendly_name: string;
    connector_type?: string;
    database_name: string;
  };
  tables: SavedApiTableEntry[];
  combinedApi: SavedCombinedApiConfig | null;
};

export const SAVED_APIS_STORAGE_KEY = 'xerocode_ai_saved_apis_v1';
export const SAVED_API_PUBLIC_BASE_KEY = 'xerocode_api_public_base_url';

export const readSavedApis = (): SavedApi[] => {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(SAVED_APIS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedApi[]) : [];
  } catch {
    return [];
  }
};

export const writeSavedApis = (apis: SavedApi[]): void => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SAVED_APIS_STORAGE_KEY, JSON.stringify(apis));
  } catch {
    /* ignore */
  }
};

export const upsertSavedApi = (api: SavedApi): SavedApi[] => {
  const list = readSavedApis();
  const idx = list.findIndex((a) => a.id === api.id);
  let next: SavedApi[];
  if (idx >= 0) {
    next = [...list];
    next[idx] = api;
  } else {
    next = [api, ...list];
  }
  writeSavedApis(next);
  return next;
};

export const removeSavedApi = (id: string): SavedApi[] => {
  const next = readSavedApis().filter((a) => a.id !== id);
  writeSavedApis(next);
  return next;
};

export type SavedEndpoint = {
  apiId: string;
  apiName: string;
  scope: string; // table name (separate mode) or combinedApi name (combined mode)
  method: ApiHttpMethod;
  path: string; // raw path with :param markers
  pathParams: string[];
  queryParams: string[];
  payloadFields: string[];
  responseFields: string[];
  combined: boolean;
  payloadSample: string;
  responseSchema: string;
};

const sampleValueForType = (type: string | undefined): unknown => {
  const t = (type || '').toLowerCase();
  if (t.includes('int') || t.includes('decimal') || t.includes('numeric') || t.includes('float') || t.includes('double')) return 0;
  if (t.includes('bool') || t.includes('bit')) return false;
  if (t.includes('date') || t.includes('time')) return '2024-01-01T00:00:00Z';
  if (t.includes('json')) return {};
  return 'string';
};

const buildPayloadSampleForFields = (
  fields: string[],
  cols: SavedColumnDef[]
): string => {
  if (fields.length === 0) return '{}';
  const obj: Record<string, unknown> = {};
  fields.forEach((f) => {
    const col = cols.find((c) => c.name === f);
    obj[f] = sampleValueForType(`${col?.type || ''} ${col?.columnType || ''}`);
  });
  return JSON.stringify(obj, null, 2);
};

const buildResponseSchemaForFields = (
  fields: string[],
  cols: SavedColumnDef[]
): string => {
  const obj: Record<string, string> = {};
  fields.forEach((f) => {
    const col = cols.find((c) => c.name === f);
    const t = `${col?.type || ''} ${col?.columnType || ''}`.toLowerCase();
    let typeLabel = 'string';
    if (t.includes('int') || t.includes('decimal') || t.includes('numeric') || t.includes('float') || t.includes('double')) typeLabel = 'number';
    else if (t.includes('bool') || t.includes('bit')) typeLabel = 'boolean';
    else if (t.includes('date') || t.includes('time')) typeLabel = 'string (ISO date)';
    else if (t.includes('json')) typeLabel = 'object';
    obj[f] = typeLabel;
  });
  return JSON.stringify({ ok: true, data: [obj] }, null, 2);
};

/** Expand a saved API into its concrete callable endpoint list. */
export const expandSavedApiEndpoints = (api: SavedApi): SavedEndpoint[] => {
  const out: SavedEndpoint[] = [];
  const buildEndpointsForConfig = (
    scope: string,
    methods: Record<ApiHttpMethod, boolean>,
    basePath: string,
    pathParams: string[],
    queryParams: string[],
    payloadFields: string[],
    responseFields: string[],
    cols: SavedColumnDef[],
    combined: boolean,
    payloadSampleOverride?: string,
    responseSchemaOverride?: string
  ): void => {
    const idParam = pathParams[0];
    const payloadSample = payloadSampleOverride ?? buildPayloadSampleForFields(payloadFields, cols);
    const responseSchema = responseSchemaOverride ?? buildResponseSchemaForFields(responseFields, cols);
    const push = (method: ApiHttpMethod, path: string, withId: boolean) => {
      out.push({
        apiId: api.id,
        apiName: api.name,
        scope,
        method,
        path,
        pathParams: withId && idParam ? [idParam] : [],
        queryParams: method === 'GET' && !withId ? queryParams : [],
        payloadFields: method === 'POST' || method === 'PUT' || method === 'PATCH' ? payloadFields : [],
        responseFields,
        combined,
        payloadSample,
        responseSchema,
      });
    };
    if (methods.GET) {
      push('GET', basePath, false);
      if (idParam) push('GET', `${basePath}/:${idParam}`, true);
    }
    if (methods.POST) push('POST', basePath, false);
    if (methods.PUT && idParam) push('PUT', `${basePath}/:${idParam}`, true);
    if (methods.PATCH && idParam) push('PATCH', `${basePath}/:${idParam}`, true);
    if (methods.DELETE && idParam) push('DELETE', `${basePath}/:${idParam}`, true);
  };

  if (api.apiMode === 'separate') {
    api.tables.forEach((t) => {
      buildEndpointsForConfig(
        t.table,
        t.api.methods,
        t.api.basePath,
        t.api.pathParams,
        t.api.queryParams,
        t.api.payloadFields,
        t.api.responseFields,
        t.columns,
        false
      );
    });
  } else if (api.combinedApi) {
    const c = api.combinedApi;
    const primarySlice = c.tables[c.primaryTable];
    const allQuery = Array.from(
      new Set(Object.values(c.tables).flatMap((s) => s.queryParams))
    );
    const colsByTable = c.columns || {};
    // Composite payload: object keyed by table name.
    const compositePayload: Record<string, unknown> = {};
    Object.entries(c.tables).forEach(([t, slice]) => {
      const cols = colsByTable[t] || [];
      const inner: Record<string, unknown> = {};
      slice.payloadFields.forEach((f) => {
        const col = cols.find((cc) => cc.name === f);
        inner[f] = sampleValueForType(`${col?.type || ''} ${col?.columnType || ''}`);
      });
      compositePayload[t] = inner;
    });
    const compositeResponse: Record<string, unknown> = { ok: true, data: {} as Record<string, unknown> };
    Object.entries(c.tables).forEach(([t, slice]) => {
      const cols = colsByTable[t] || [];
      const inner: Record<string, string> = {};
      slice.responseFields.forEach((f) => {
        const col = cols.find((cc) => cc.name === f);
        const tp = `${col?.type || ''} ${col?.columnType || ''}`.toLowerCase();
        let typeLabel = 'string';
        if (tp.includes('int') || tp.includes('decimal') || tp.includes('numeric') || tp.includes('float') || tp.includes('double')) typeLabel = 'number';
        else if (tp.includes('bool') || tp.includes('bit')) typeLabel = 'boolean';
        else if (tp.includes('date') || tp.includes('time')) typeLabel = 'string (ISO date)';
        else if (tp.includes('json')) typeLabel = 'object';
        inner[f] = typeLabel;
      });
      (compositeResponse.data as Record<string, unknown>)[t] = [inner];
    });
    buildEndpointsForConfig(
      c.name || 'Combined API',
      c.methods,
      c.basePath,
      primarySlice?.pathParams || [],
      allQuery,
      [], // payload handled by override
      [], // response handled by override
      colsByTable[c.primaryTable] || [],
      true,
      JSON.stringify(compositePayload, null, 2),
      JSON.stringify(compositeResponse, null, 2)
    );
  }

  return out;
};
