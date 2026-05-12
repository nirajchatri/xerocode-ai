import { apiUrl, getStudioAuthHeaders, readApiJson, studioFetch } from './apiBase';

const EXCEL_SAVED_SCHEMAS_STORAGE_KEY = 'xerocode_ai_excel_saved_schemas_v1';

export type AppDataDatasourceItem = {
  id: string;
  friendly_name: string;
  host?: string;
  port?: number;
  database_name: string;
  username?: string;
  connector_type?: string;
  is_default?: boolean;
  connection_string?: string;
  kind?: 'db' | 'excel';
  excelSchemaId?: string;
};

type ExcelSchemaRow = {
  id: string;
  name: string;
  savedAt: number;
  tables: unknown[];
};

function readSavedExcelSchemasFromStorage(): ExcelSchemaRow[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(EXCEL_SAVED_SCHEMAS_STORAGE_KEY);
    const p = raw ? (JSON.parse(raw) as ExcelSchemaRow[]) : [];
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x) => x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.savedAt === 'number'
    );
  } catch {
    return [];
  }
}

/** Matches server-side connector normalization for filtering dropdowns by tab (mysql, postgresql, …). */
export function canonicalWorkspaceDbConnector(
  raw: string | undefined
): 'mysql' | 'sqlserver' | 'postgresql' | 'mongodb' {
  const c = String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '');
  if (c === 'postgres' || c === 'pgsql') return 'postgresql';
  if (c === 'mongo' || c === 'mongodb' || c === 'mongodb+srv') return 'mongodb';
  if (c === 'mssql' || c === 'microsoftsqlserver') return 'sqlserver';
  if (c === 'mariadb') return 'mysql';
  if (c === 'mysql') return 'mysql';
  if (c === 'sqlserver') return 'sqlserver';
  if (c === 'postgresql') return 'postgresql';
  if (c === 'mongodb') return 'mongodb';
  return 'mysql';
}

async function loadDbConnectionsPerConnector(): Promise<AppDataDatasourceItem[]> {
  const connectors: Array<'mysql' | 'sqlserver' | 'postgresql' | 'mongodb'> = [
    'mysql',
    'sqlserver',
    'postgresql',
    'mongodb',
  ];
  const collectedDb: AppDataDatasourceItem[] = [];

  for (const connector of connectors) {
    try {
      const listResponse = await studioFetch(apiUrl(`/api/connections/list?connector=${encodeURIComponent(connector)}`), {
        headers: getStudioAuthHeaders(),
      });
      const listData = await readApiJson<{
        ok?: boolean;
        connections?: Array<{
          id: number;
          friendly_name: string;
          host: string;
          port: number;
          database_name: string;
          username: string;
          connector_type?: string;
          is_default?: boolean;
          connection_string?: string;
        }>;
      }>(listResponse);
      if (listResponse.ok && listData?.ok && Array.isArray(listData.connections)) {
        collectedDb.push(
          ...listData.connections.map((item) => ({
            id: `db:${item.id}`,
            friendly_name: item.friendly_name,
            host: item.host,
            port: item.port,
            database_name: item.database_name,
            username: item.username,
            connector_type: item.connector_type,
            is_default: item.is_default,
            connection_string: item.connection_string,
            kind: 'db' as const,
          }))
        );
      }
    } catch {
      /* skip connector */
    }
  }

  return collectedDb;
}

/** Same visible label pattern as the App Data datasource dropdown on the home prompt card. */
export function formatAppDataDatasourceLabel(item: AppDataDatasourceItem): string {
  return item.connector_type === 'excel'
    ? `${item.friendly_name} (Excel schema)`
    : `${item.friendly_name} (${item.database_name})`;
}

/**
 * Loads DB connections (all supported connectors) plus saved Excel schemas.
 * Uses GET /api/connections/list-all when available (single round-trip, legacy tenant fixes).
 */
export async function loadAppDataDatasourceList(): Promise<AppDataDatasourceItem[]> {
  const merged = new Map<string, AppDataDatasourceItem>();

  try {
    const listResponse = await studioFetch(apiUrl('/api/connections/list-all'), {
      headers: getStudioAuthHeaders(),
    });
    const listData = await readApiJson<{
      ok?: boolean;
      connections?: Array<{
        id: number;
        friendly_name: string;
        host: string;
        port: number;
        database_name: string;
        username: string;
        connector_type?: string;
        is_default?: boolean;
        connection_string?: string;
      }>;
    }>(listResponse);
    if (listResponse.ok && listData?.ok && Array.isArray(listData.connections)) {
      for (const item of listData.connections) {
        const row: AppDataDatasourceItem = {
          id: `db:${item.id}`,
          friendly_name: item.friendly_name,
          host: item.host,
          port: item.port,
          database_name: item.database_name,
          username: item.username,
          connector_type: item.connector_type,
          is_default: item.is_default,
          connection_string: item.connection_string,
          kind: 'db',
        };
        merged.set(row.id, row);
      }
    }
  } catch {
    /* list-all unavailable or misconfigured — fill via per-connector below */
  }

  const perConnector = await loadDbConnectionsPerConnector();
  for (const item of perConnector) {
    if (!merged.has(item.id)) merged.set(item.id, item);
  }

  const excelItems: AppDataDatasourceItem[] = readSavedExcelSchemasFromStorage().map((schema) => ({
    id: `excel:${schema.id}`,
    friendly_name: schema.name,
    database_name: 'Excel schema',
    connector_type: 'excel',
    kind: 'excel',
    excelSchemaId: schema.id,
  }));

  const combined = [...merged.values(), ...excelItems];
  return Array.from(new Map(combined.map((item) => [item.id, item])).values());
}
