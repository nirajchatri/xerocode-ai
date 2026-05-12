import type { SavedApi } from './savedApis';

export type BlueprintRouteRow = { slug: string; table: string; idColumn?: string | null };

/** First path segment after optional `/api/` — matches GET /api/<slug>. */
export function blueprintSlugFromBasePath(basePath: string): string | null {
  const t = basePath.trim().replace(/\/+$/, '');
  const after = t.replace(/^\/api(?:\/|$)/i, '/').replace(/^\//, '');
  const seg = after.split('/').filter(Boolean)[0];
  if (!seg || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(seg)) return null;
  return seg.toLowerCase();
}

/** Routes implied by saved APIs for one connection (GET + enabled + valid slug). */
export function collectRoutesFromSavedApisForConnection(
  apis: SavedApi[],
  connectionId: number
): BlueprintRouteRow[] {
  const map = new Map<string, BlueprintRouteRow>();
  for (const api of apis) {
    if (Number(api.connection?.id) !== Number(connectionId)) continue;
    if (api.apiMode === 'separate') {
      for (const row of api.tables) {
        const cfg = row.api;
        if (!cfg?.enabled || !cfg.methods?.GET) continue;
        const slug = blueprintSlugFromBasePath(cfg.basePath);
        if (!slug) continue;
        const idColumn = cfg.pathParams?.[0]?.trim();
        map.set(slug, { slug, table: row.table, ...(idColumn ? { idColumn } : {}) });
      }
    } else if (api.combinedApi?.methods?.GET && api.combinedApi.primaryTable) {
      const slug = blueprintSlugFromBasePath(api.combinedApi.basePath);
      const pt = api.combinedApi.primaryTable;
      const idColumn = api.combinedApi.tables?.[pt]?.pathParams?.[0]?.trim();
      if (slug) map.set(slug, { slug, table: pt, ...(idColumn ? { idColumn } : {}) });
    }
  }
  return [...map.values()];
}

type LooseTableCfg = {
  enabled?: boolean;
  methods?: Partial<Record<string, boolean>>;
  basePath: string;
  pathParams?: string[];
};

type LooseCombined = {
  methods?: Partial<Record<string, boolean>>;
  basePath: string;
  primaryTable: string;
  tables?: Record<string, { pathParams?: string[] }>;
};

/** Live builder selection for one connection (may include unsaved edits). */
export function collectRoutesFromBuilderState(options: {
  tableList: string[];
  configByTable: Record<string, LooseTableCfg>;
  apiMode: 'separate' | 'combined';
  combinedConfig: LooseCombined | null;
}): BlueprintRouteRow[] {
  const map = new Map<string, BlueprintRouteRow>();
  const { tableList, configByTable, apiMode, combinedConfig } = options;
  if (apiMode === 'separate') {
    tableList.forEach((t) => {
      const cfg = configByTable[t];
      if (!cfg?.enabled || !cfg.methods?.GET) return;
      const slug = blueprintSlugFromBasePath(cfg.basePath);
      if (!slug) return;
      const idColumn = cfg.pathParams?.[0]?.trim();
      map.set(slug, { slug, table: t, ...(idColumn ? { idColumn } : {}) });
    });
  } else if (combinedConfig?.methods?.GET && combinedConfig.primaryTable) {
    const slug = blueprintSlugFromBasePath(combinedConfig.basePath);
    const pt = combinedConfig.primaryTable;
    const idColumn = combinedConfig.tables?.[pt]?.pathParams?.[0]?.trim();
    if (slug) map.set(slug, { slug, table: pt, ...(idColumn ? { idColumn } : {}) });
  }
  return [...map.values()];
}

/** Disk + live overlay for the active datasource (live wins on slug collision). */
export function mergeBlueprintRoutesForPublish(options: {
  connectionId: number;
  /** Saved blueprint APIs from workspace DB / UI state */
  savedApis: SavedApi[];
  /** When set and equals connectionId, overlay builder state */
  activeBuilderConnectionId: number | null;
  tableList: string[];
  configByTable: Record<string, LooseTableCfg>;
  apiMode: 'separate' | 'combined';
  combinedConfig: LooseCombined | null;
}): BlueprintRouteRow[] {
  const {
    connectionId,
    savedApis,
    activeBuilderConnectionId,
    tableList,
    configByTable,
    apiMode,
    combinedConfig,
  } = options;
  const disk = collectRoutesFromSavedApisForConnection(savedApis, connectionId);
  const map = new Map<string, BlueprintRouteRow>();
  disk.forEach((r) => map.set(r.slug, r));
  if (Number(activeBuilderConnectionId) === Number(connectionId)) {
    collectRoutesFromBuilderState({
      tableList,
      configByTable,
      apiMode,
      combinedConfig,
    }).forEach((r) => map.set(r.slug, r));
  }
  return [...map.values()];
}
