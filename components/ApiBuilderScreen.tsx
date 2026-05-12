import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Download,
  FileJson,
  Globe,
  KeyRound,
  Leaf,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Search,
  Server,
  Shield,
  Table2,
  Zap,
} from 'lucide-react';
import {
  apiUrl,
  getStudioAuthHeaders,
  persistPublicApiBearerJwt,
  readApiJson,
  readSavedPublicApiBearerJwt,
  studioFetch,
} from '../lib/apiBase';
import { mergeBlueprintRoutesForPublish } from '../lib/blueprintRoutes';
import { canonicalWorkspaceDbConnector } from '../lib/loadAppDataDatasourceList';
import {
  readSavedApis,
  writeSavedApis,
  type SavedApi,
} from '../lib/savedApis';
import {
  fetchStoredPublicApiJwt,
  hasWorkspaceAuth,
  loadBlueprintApisWorkspace,
  migrateLocalBlueprintApisIfRemoteEmpty,
  mirrorBlueprintApisLocal,
  upsertBlueprintApiWorkspace,
} from '../lib/workspaceApis';
import { StudioPopoverSelect, type StudioPopoverSelectSection } from './StudioPopoverSelect';

type ConnectorType = 'mysql' | 'sqlserver' | 'postgresql' | 'mongodb';

type ConnectionRecord = {
  id: number;
  friendly_name: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  connector_type?: string;
  is_default?: boolean;
};

type ColumnDef = {
  name: string;
  type?: string;
  columnType?: string;
  key?: string;
};

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type TableApiConfig = {
  enabled: boolean;
  basePath: string;
  methods: Record<HttpMethod, boolean>;
  pathParams: string[];
  queryParams: string[];
  payloadFields: string[];
  responseFields: string[];
};

type CombinedTableSlice = {
  pathParams: string[];
  queryParams: string[];
  payloadFields: string[];
  responseFields: string[];
  joinColumn: string;
};

type CombinedApiConfig = {
  name: string;
  basePath: string;
  primaryTable: string;
  methods: Record<HttpMethod, boolean>;
  tables: Record<string, CombinedTableSlice>;
};

type ApiMode = 'separate' | 'combined';

type Props = {
  isDarkMode: boolean;
  onBack: () => void;
  editingApi?: SavedApi | null;
  onEditApplied?: () => void;
};

const CONNECTOR_META: Record<
  ConnectorType,
  { label: string; Icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  mysql: { label: 'MySQL', Icon: Database, color: 'text-orange-500' },
  sqlserver: { label: 'SQL Server', Icon: Server, color: 'text-rose-500' },
  postgresql: { label: 'PostgreSQL', Icon: Boxes, color: 'text-sky-500' },
  mongodb: { label: 'MongoDB', Icon: Leaf, color: 'text-emerald-500' },
};

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const slugifyTable = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'resource';

const guessIdColumn = (cols: ColumnDef[]): string | null => {
  if (cols.length === 0) return null;
  const explicit = cols.find((c) => (c.key || '').toLowerCase() === 'pri');
  if (explicit) return explicit.name;
  const named = cols.find((c) => /^id$/i.test(c.name));
  if (named) return named.name;
  const endsWithId = cols.find((c) => /id$/i.test(c.name));
  if (endsWithId) return endsWithId.name;
  return cols[0]?.name ?? null;
};

const defaultConfigFor = (table: string, cols: ColumnDef[]): TableApiConfig => {
  const id = guessIdColumn(cols);
  return {
    enabled: true,
    basePath: `/api/${slugifyTable(table)}`,
    methods: { GET: true, POST: true, PUT: true, PATCH: false, DELETE: true },
    pathParams: id ? [id] : [],
    queryParams: cols.slice(0, Math.min(cols.length, 4)).map((c) => c.name),
    payloadFields: cols
      .filter((c) => c.name && (!id || c.name !== id))
      .slice(0, Math.min(cols.length, 12))
      .map((c) => c.name),
    responseFields: cols.slice(0, Math.min(cols.length, 16)).map((c) => c.name),
  };
};

const defaultCombinedSliceFor = (cols: ColumnDef[]): CombinedTableSlice => {
  const id = guessIdColumn(cols);
  return {
    joinColumn: id || cols[0]?.name || '',
    pathParams: id ? [id] : [],
    queryParams: cols.slice(0, Math.min(cols.length, 3)).map((c) => c.name),
    payloadFields: cols
      .filter((c) => c.name && (!id || c.name !== id))
      .slice(0, Math.min(cols.length, 8))
      .map((c) => c.name),
    responseFields: cols.slice(0, Math.min(cols.length, 12)).map((c) => c.name),
  };
};

export const ApiBuilderScreen: React.FC<Props> = ({ isDarkMode, onBack, editingApi, onEditApplied }) => {
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  const [activeConnection, setActiveConnection] = useState<ConnectionRecord | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState('');

  const [selectedTables, setSelectedTables] = useState<Set<string>>(() => new Set());
  const [columnsByTable, setColumnsByTable] = useState<Record<string, ColumnDef[]>>({});
  const [columnsLoadingByTable, setColumnsLoadingByTable] = useState<Record<string, boolean>>({});
  const [configByTable, setConfigByTable] = useState<Record<string, TableApiConfig>>({});
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  const [apiMode, setApiMode] = useState<ApiMode>('separate');
  const [combinedConfig, setCombinedConfig] = useState<CombinedApiConfig | null>(null);
  const [expandedCombinedTable, setExpandedCombinedTable] = useState<string | null>(null);

  const [publicBaseUrl, setPublicBaseUrl] = useState<string>(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('xerocode_api_public_base_url') : null;
      return stored || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'https://api.example.com');
    } catch {
      return 'https://api.example.com';
    }
  });
  const [bearerToken, setBearerToken] = useState<string>(() => readSavedPublicApiBearerJwt());
  const [docsExpandedFor, setDocsExpandedFor] = useState<Record<string, boolean>>({});
  const [savedApis, setSavedApis] = useState<SavedApi[]>(() => readSavedApis());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!hasWorkspaceAuth()) {
        setSavedApis(readSavedApis());
        return;
      }
      try {
        await migrateLocalBlueprintApisIfRemoteEmpty();
        const list = await loadBlueprintApisWorkspace();
        if (!cancelled) {
          mirrorBlueprintApisLocal(list);
          setSavedApis(list);
        }
      } catch {
        if (!cancelled) setSavedApis(readSavedApis());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [editingApiId, setEditingApiId] = useState<string | null>(null);
  const [issuingBearerToken, setIssuingBearerToken] = useState(false);
  /** While editing a saved API, list only tables saved on that API unless user expands the list. */
  const [showAllDatasourceTablesInEdit, setShowAllDatasourceTablesInEdit] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('xerocode_api_public_base_url', publicBaseUrl);
      }
    } catch {
      /* ignore */
    }
  }, [publicBaseUrl]);

  const bearerPersistBoot = useRef(true);
  useEffect(() => {
    if (bearerPersistBoot.current) {
      bearerPersistBoot.current = false;
      return;
    }
    persistPublicApiBearerJwt(bearerToken);
  }, [bearerToken]);

  const card = isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white';
  const subText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const heading = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const inputCls = `h-9 w-full rounded-md border px-2.5 text-xs outline-none ${
    isDarkMode
      ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-slate-500'
      : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-slate-400'
  }`;

  const loadConnections = useCallback(async () => {
    setConnectionsLoading(true);
    setConnectionsError(null);
    try {
      const merged = new Map<string, ConnectionRecord>();
      try {
        const res = await studioFetch(apiUrl('/api/connections/list-all'), {
          headers: getStudioAuthHeaders(),
        });
        const data = await readApiJson<{ ok?: boolean; connections?: ConnectionRecord[] }>(res);
        if (res.ok && data?.ok && Array.isArray(data.connections)) {
          for (const c of data.connections) {
            const canon = canonicalWorkspaceDbConnector(c.connector_type);
            merged.set(`${canon}-${c.id}`, { ...c, connector_type: canon });
          }
        }
      } catch {
        /* list-all failed — per-connector fetch below fills the map */
      }
      for (const connector of ['mysql', 'sqlserver', 'postgresql', 'mongodb'] as ConnectorType[]) {
        try {
          const res = await studioFetch(apiUrl(`/api/connections/list?connector=${encodeURIComponent(connector)}`), {
            headers: getStudioAuthHeaders(),
          });
          const data = await readApiJson<{ ok?: boolean; connections?: ConnectionRecord[] }>(res);
          if (res.ok && data?.ok && Array.isArray(data.connections)) {
            for (const c of data.connections) {
              const canon = canonicalWorkspaceDbConnector(c.connector_type || connector);
              const key = `${canon}-${c.id}`;
              if (!merged.has(key)) merged.set(key, { ...c, connector_type: canon });
            }
          }
        } catch {
          /* ignore single connector failure */
        }
      }
      setConnections(Array.from(merged.values()));
    } catch (e) {
      setConnectionsError(e instanceof Error ? e.message : 'Unable to load connections');
    } finally {
      setConnectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  /** Hydrate datasource Bearer JWT from control DB when the selected connection changes (signed-in users). */
  useEffect(() => {
    let cancelled = false;
    if (!hasWorkspaceAuth() || !activeConnection?.id) return undefined;
    void (async () => {
      try {
        const { token } = await fetchStoredPublicApiJwt(activeConnection.id);
        if (cancelled) return;
        if (token) {
          setBearerToken(token);
          persistPublicApiBearerJwt(token);
        }
      } catch {
        /* API unreachable — keep current JWT in the field */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeConnection?.id]);

  const loadTablesFor = useCallback(async (connection: ConnectionRecord) => {
    setTablesLoading(true);
    setTablesError(null);
    setTables([]);
    try {
      const res = await studioFetch(apiUrl(`/api/connections/${connection.id}/tables`), {
        headers: getStudioAuthHeaders(),
      });
      const data = await readApiJson<{ ok?: boolean; tables?: string[]; message?: string }>(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || `Failed to load tables (HTTP ${res.status})`);
      }
      setTables(Array.isArray(data.tables) ? data.tables : []);
    } catch (e) {
      setTablesError(e instanceof Error ? e.message : 'Unable to load tables');
    } finally {
      setTablesLoading(false);
    }
  }, []);

  const editingAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editingApi) return;
    if (editingAppliedRef.current === editingApi.id) return;
    if (connections.length === 0) return;
    editingAppliedRef.current = editingApi.id;

    const match =
      connections.find((c) => c.id === editingApi.connection.id) ||
      connections.find(
        (c) =>
          c.friendly_name === editingApi.connection.friendly_name &&
          c.database_name === editingApi.connection.database_name
      ) ||
      null;

    const tableNames = editingApi.tables.map((t) => t.table);
    setSelectedTables(new Set(tableNames));
    setColumnsByTable(() => {
      const out: Record<string, ColumnDef[]> = {};
      editingApi.tables.forEach((t) => {
        out[t.table] = t.columns;
      });
      if (editingApi.combinedApi?.columns) {
        Object.entries(editingApi.combinedApi.columns).forEach(([k, v]) => {
          out[k] = (v as ColumnDef[]) || [];
        });
      }
      return out;
    });
    setConfigByTable(() => {
      const out: Record<string, TableApiConfig> = {};
      editingApi.tables.forEach((t) => {
        out[t.table] = t.api;
      });
      return out;
    });
    setApiMode(editingApi.apiMode);
    if (editingApi.apiMode === 'combined' && editingApi.combinedApi) {
      const { columns: _omit, ...rest } = editingApi.combinedApi;
      setCombinedConfig(rest as CombinedApiConfig);
    } else {
      setCombinedConfig(null);
    }
    if (editingApi.publicBaseUrl) setPublicBaseUrl(editingApi.publicBaseUrl);
    setEditingApiId(editingApi.id);
    setSaveMessage(`Editing "${editingApi.name}". Make changes and click Save API to update.`);

    if (match) {
      setActiveConnection(match);
      void loadTablesFor(match);
    } else {
      setActiveConnection({
        id: editingApi.connection.id,
        friendly_name: editingApi.connection.friendly_name,
        connector_type: (editingApi.connection.connector_type as ConnectorType) || 'sqlserver',
        database_name: editingApi.connection.database_name,
        host: '',
        port: 0,
        username: '',
      });
    }

    if (onEditApplied) onEditApplied();
  }, [editingApi, connections, loadTablesFor, onEditApplied]);

  useEffect(() => {
    setShowAllDatasourceTablesInEdit(false);
  }, [editingApi?.id, editingApiId]);

  const handleSelectConnection = (c: ConnectionRecord) => {
    setActiveConnection(c);
    setShowAllDatasourceTablesInEdit(false);
    setSelectedTables(new Set());
    setColumnsByTable({});
    setConfigByTable({});
    setExpandedTable(null);
    setCombinedConfig(null);
    setApiMode('separate');
    setExpandedCombinedTable(null);
    setTableSearch('');
    void loadTablesFor(c);
  };

  const ensureColumnsLoaded = useCallback(
    async (connection: ConnectionRecord, table: string) => {
      if (columnsByTable[table]) return columnsByTable[table];
      setColumnsLoadingByTable((p) => ({ ...p, [table]: true }));
      try {
        const qs = new URLSearchParams({ table, limit: '1', offset: '0' });
        const res = await studioFetch(apiUrl(`/api/connections/${connection.id}/table-data?${qs}`), {
          headers: getStudioAuthHeaders(),
        });
        const data = await readApiJson<{
          ok?: boolean;
          columns?: Array<{ name?: string; type?: string; columnType?: string; key?: string }>;
        }>(res);
        const cols: ColumnDef[] = Array.isArray(data?.columns)
          ? data.columns
              .map((c) => ({
                name: String(c?.name || '').trim(),
                type: String(c?.type || '').trim(),
                columnType: String(c?.columnType || '').trim(),
                key: String(c?.key || '').trim(),
              }))
              .filter((c) => c.name)
          : [];
        setColumnsByTable((prev) => ({ ...prev, [table]: cols }));
        return cols;
      } catch {
        setColumnsByTable((prev) => ({ ...prev, [table]: [] }));
        return [];
      } finally {
        setColumnsLoadingByTable((p) => ({ ...p, [table]: false }));
      }
    },
    [columnsByTable]
  );

  const toggleTable = async (table: string) => {
    if (!activeConnection) return;
    const next = new Set(selectedTables);
    if (next.has(table)) {
      next.delete(table);
      setSelectedTables(next);
      setConfigByTable((prev) => {
        const copy = { ...prev };
        delete copy[table];
        return copy;
      });
      setCombinedConfig((prev) => {
        if (!prev || !prev.tables[table]) return prev;
        const tables = { ...prev.tables };
        delete tables[table];
        const remaining = Object.keys(tables);
        const primary = remaining.includes(prev.primaryTable)
          ? prev.primaryTable
          : remaining[0] || '';
        return { ...prev, tables, primaryTable: primary };
      });
      if (expandedTable === table) setExpandedTable(null);
      if (expandedCombinedTable === table) setExpandedCombinedTable(null);
      return;
    }
    next.add(table);
    setSelectedTables(next);
    const cols = await ensureColumnsLoaded(activeConnection, table);
    setConfigByTable((prev) =>
      prev[table] ? prev : { ...prev, [table]: defaultConfigFor(table, cols) }
    );
    setCombinedConfig((prev) => {
      if (!prev) return prev;
      if (prev.tables[table]) return prev;
      return {
        ...prev,
        tables: { ...prev.tables, [table]: defaultCombinedSliceFor(cols) },
        primaryTable: prev.primaryTable || table,
      };
    });
    setExpandedTable(table);
  };

  const filteredTables = useMemo(() => {
    const term = tableSearch.trim().toLowerCase();
    if (!term) return tables;
    return tables.filter((t) => t.toLowerCase().includes(term));
  }, [tables, tableSearch]);

  const isEditingSavedApi = Boolean(editingApiId || editingApi?.id);

  const savedApiTableNames = useMemo((): string[] => {
    if (editingApi?.tables?.length) return editingApi.tables.map((x) => x.table);
    return Array.from(selectedTables) as string[];
  }, [editingApi?.tables, selectedTables]);

  const tablesForLeftPanel = useMemo(() => {
    const term = tableSearch.trim().toLowerCase();
    const applySearch = (list: string[]) =>
      !term ? list : list.filter((t) => t.toLowerCase().includes(term));

    if (isEditingSavedApi && !showAllDatasourceTablesInEdit) {
      const onlyApi = [...savedApiTableNames].sort((a, b) => a.localeCompare(b));
      return applySearch(onlyApi);
    }
    return filteredTables;
  }, [
    isEditingSavedApi,
    showAllDatasourceTablesInEdit,
    savedApiTableNames,
    filteredTables,
    tableSearch,
  ]);

  const groupedConnections = useMemo(() => {
    const groups: Record<ConnectorType, ConnectionRecord[]> = {
      mysql: [],
      sqlserver: [],
      postgresql: [],
      mongodb: [],
    };
    connections.forEach((c) => {
      const k = (c.connector_type as ConnectorType) || 'mysql';
      if (!groups[k]) return;
      groups[k].push(c);
    });
    return groups;
  }, [connections]);

  const datasourcePopoverSections = useMemo((): StudioPopoverSelectSection[] => {
    const result: StudioPopoverSelectSection[] = [
      {
        options: [{ value: '', label: '— No datasource —' }],
      },
    ];
    (Object.keys(groupedConnections) as ConnectorType[]).forEach((connector) => {
      const list = groupedConnections[connector];
      if (!list?.length) return;
      const meta = CONNECTOR_META[connector];
      result.push({
        heading: meta.label,
        options: list.map((c) => ({
          value: `${c.connector_type}:${c.id}`,
          label: `${c.friendly_name} · ${c.database_name}${c.is_default ? ' (default)' : ''}`,
        })),
      });
    });
    return result;
  }, [groupedConnections]);

  const updateConfig = (table: string, updater: (prev: TableApiConfig) => TableApiConfig) => {
    setConfigByTable((prev) => ({ ...prev, [table]: updater(prev[table]) }));
  };

  const enableCombinedMode = () => {
    const tableList = Array.from(selectedTables) as string[];
    if (tableList.length < 2) return;
    setCombinedConfig((prev) => {
      if (prev) return prev;
      const slug = tableList.length <= 3
        ? tableList.map(slugifyTable).join('-')
        : `${slugifyTable(tableList[0])}-and-${tableList.length - 1}-more`;
      const tablesMap: Record<string, CombinedTableSlice> = {};
      tableList.forEach((t) => {
        tablesMap[t] = defaultCombinedSliceFor(columnsByTable[t] || []);
      });
      return {
        name: tableList.length <= 3 ? tableList.join(' + ') : `${tableList[0]} + ${tableList.length - 1} more`,
        basePath: `/api/${slug}`,
        primaryTable: tableList[0],
        methods: { GET: true, POST: true, PUT: true, PATCH: false, DELETE: true },
        tables: tablesMap,
      };
    });
    setApiMode('combined');
    setExpandedCombinedTable(tableList[0] || null);
  };

  const updateCombined = (updater: (prev: CombinedApiConfig) => CombinedApiConfig) => {
    setCombinedConfig((prev) => (prev ? updater(prev) : prev));
  };

  const updateCombinedSlice = (
    table: string,
    sliceUpdater: (prev: CombinedTableSlice) => CombinedTableSlice
  ) => {
    setCombinedConfig((prev) => {
      if (!prev) return prev;
      const current = prev.tables[table];
      if (!current) return prev;
      return { ...prev, tables: { ...prev.tables, [table]: sliceUpdater(current) } };
    });
  };

  const issueDatasourceBearerToken = useCallback(async () => {
    if (!activeConnection) return;
    const headers = getStudioAuthHeaders();
    if (!headers['x-user-email']) {
      window.alert('Sign in so the server can issue a Bearer JWT tied to your workspace and this datasource.');
      return;
    }
    setIssuingBearerToken(true);
    try {
      const res = await studioFetch(apiUrl('/api/public-api-token/issue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ connectionId: activeConnection.id, expiresInHours: 24 }),
      });
      const data = await readApiJson<{ ok?: boolean; token?: string; message?: string; expiresAt?: string }>(res);
      if (!res.ok || !data?.ok || !data.token) {
        throw new Error(data?.message || `Unable to issue token (HTTP ${res.status}).`);
      }
      setBearerToken(data.token);
      persistPublicApiBearerJwt(data.token);
      setSaveMessage(`Issued Bearer JWT for ${activeConnection.friendly_name || 'connection'} · expires ${data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'see response'}`);
      window.setTimeout(() => setSaveMessage(''), 5000);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not issue token.');
    } finally {
      setIssuingBearerToken(false);
    }
  }, [activeConnection]);

  const toggleField = (
    arr: string[],
    field: string
  ): string[] => (arr.includes(field) ? arr.filter((f) => f !== field) : [...arr, field]);

  const buildEndpointPreview = (table: string): string[] => {
    const cfg = configByTable[table];
    if (!cfg) return [];
    const lines: string[] = [];
    const idParam = cfg.pathParams[0];
    if (cfg.methods.GET) {
      lines.push(`GET    ${cfg.basePath}${cfg.queryParams.length > 0 ? `?${cfg.queryParams.map((q) => `${q}=...`).join('&')}` : ''}`);
      if (idParam) lines.push(`GET    ${cfg.basePath}/:${idParam}`);
    }
    if (cfg.methods.POST) lines.push(`POST   ${cfg.basePath}`);
    if (cfg.methods.PUT && idParam) lines.push(`PUT    ${cfg.basePath}/:${idParam}`);
    if (cfg.methods.PATCH && idParam) lines.push(`PATCH  ${cfg.basePath}/:${idParam}`);
    if (cfg.methods.DELETE && idParam) lines.push(`DELETE ${cfg.basePath}/:${idParam}`);
    return lines;
  };

  const sampleValueForCol = (col: ColumnDef): string => {
    const t = `${col.type || ''} ${col.columnType || ''}`.toLowerCase();
    if (t.includes('int') || t.includes('decimal') || t.includes('numeric') || t.includes('float') || t.includes('double')) return '0';
    if (t.includes('bool') || t.includes('bit')) return 'false';
    if (t.includes('date') || t.includes('time')) return '"2024-01-01T00:00:00Z"';
    if (t.includes('json')) return '{}';
    return '"string"';
  };

  const buildPayloadPreview = (table: string): string => {
    const cfg = configByTable[table];
    const cols = columnsByTable[table] || [];
    if (!cfg) return '{}';
    const obj = cfg.payloadFields
      .map((f) => {
        const col = cols.find((c) => c.name === f);
        return `  "${f}": ${col ? sampleValueForCol(col) : '"string"'}`;
      })
      .join(',\n');
    return obj ? `{\n${obj}\n}` : '{}';
  };

  const buildCombinedEndpointPreview = (): string[] => {
    if (!combinedConfig) return [];
    const lines: string[] = [];
    const primarySlice = combinedConfig.tables[combinedConfig.primaryTable];
    const idParam = primarySlice?.pathParams?.[0];
    const allQuery = (Object.values(combinedConfig.tables) as CombinedTableSlice[]).flatMap((s) => s.queryParams);
    const uniqueQuery = Array.from(new Set(allQuery));
    if (combinedConfig.methods.GET) {
      lines.push(
        `GET    ${combinedConfig.basePath}${
          uniqueQuery.length > 0 ? `?${uniqueQuery.map((q) => `${q}=...`).join('&')}` : ''
        }`
      );
      if (idParam) lines.push(`GET    ${combinedConfig.basePath}/:${idParam}`);
    }
    if (combinedConfig.methods.POST) lines.push(`POST   ${combinedConfig.basePath}`);
    if (combinedConfig.methods.PUT && idParam) lines.push(`PUT    ${combinedConfig.basePath}/:${idParam}`);
    if (combinedConfig.methods.PATCH && idParam) lines.push(`PATCH  ${combinedConfig.basePath}/:${idParam}`);
    if (combinedConfig.methods.DELETE && idParam) lines.push(`DELETE ${combinedConfig.basePath}/:${idParam}`);
    return lines;
  };

  const buildCombinedPayloadPreview = (): string => {
    if (!combinedConfig) return '{}';
    const sections: string[] = [];
    (Object.entries(combinedConfig.tables) as Array<[string, CombinedTableSlice]>).forEach(([table, slice]) => {
      const cols = columnsByTable[table] || [];
      const obj = slice.payloadFields
        .map((f) => {
          const col = cols.find((c) => c.name === f);
          return `    "${f}": ${col ? sampleValueForCol(col) : '"string"'}`;
        })
        .join(',\n');
      sections.push(`  "${table}": ${obj ? `{\n${obj}\n  }` : '{}'}`);
    });
    return sections.length > 0 ? `{\n${sections.join(',\n')}\n}` : '{}';
  };

  const copyToClipboard = (s: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(s).catch(() => {});
    }
  };

  const exportConfig = () => {
    if (!activeConnection) return;
    const out = {
      connection: {
        id: activeConnection.id,
        friendly_name: activeConnection.friendly_name,
        connector_type: activeConnection.connector_type,
        database_name: activeConnection.database_name,
      },
      apiMode,
      tables:
        apiMode === 'separate'
          ? (Array.from(selectedTables) as string[]).map((table: string) => ({
              table,
              columns: columnsByTable[table] || [],
              api: configByTable[table] || null,
            }))
          : [],
      combinedApi:
        apiMode === 'combined' && combinedConfig
          ? {
              ...combinedConfig,
              columns: Object.fromEntries(
                Object.keys(combinedConfig.tables).map((t) => [t, columnsByTable[t] || []])
              ),
            }
          : null,
    };
    const json = JSON.stringify(out, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-blueprint-${activeConnection.friendly_name || 'connection'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---------- Postman v2.1 collection generation ----------
  const trimBaseUrl = (u: string) => (u || '').replace(/\/$/, '');
  const splitPath = (p: string): string[] =>
    (p || '').replace(/^\//, '').split('/').filter(Boolean);

  const buildPostmanItemForTable = (table: string, cfg: TableApiConfig, cols: ColumnDef[]) => {
    const items: any[] = [];
    const idParam = cfg.pathParams[0];
    const queryArr = cfg.queryParams.map((q) => ({ key: q, value: '', disabled: false }));
    const headerArr = [
      { key: 'Authorization', value: 'Bearer {{bearer_token}}', type: 'text' },
      { key: 'Accept', value: 'application/json', type: 'text' },
    ];
    const bodyObj: Record<string, any> = {};
    cfg.payloadFields.forEach((f) => {
      const col = cols.find((c) => c.name === f);
      bodyObj[f] = col ? JSON.parse(sampleValueForCol(col).replace(/^"|"$/g, '"')) : '';
    });
    const pathSegments = splitPath(cfg.basePath);
    const pathWithId = idParam ? [...pathSegments, `:${idParam}`] : pathSegments;

    if (cfg.methods.GET) {
      items.push({
        name: `GET ${cfg.basePath}`,
        request: {
          method: 'GET',
          header: headerArr,
          url: {
            raw: `{{base_url}}${cfg.basePath}${queryArr.length ? '?' + queryArr.map((q) => `${q.key}=`).join('&') : ''}`,
            host: ['{{base_url}}'],
            path: pathSegments,
            query: queryArr,
          },
        },
      });
      if (idParam) {
        items.push({
          name: `GET ${cfg.basePath}/:${idParam}`,
          request: {
            method: 'GET',
            header: headerArr,
            url: {
              raw: `{{base_url}}${cfg.basePath}/:${idParam}`,
              host: ['{{base_url}}'],
              path: pathWithId,
              variable: [{ key: idParam, value: '' }],
            },
          },
        });
      }
    }
    if (cfg.methods.POST) {
      items.push({
        name: `POST ${cfg.basePath}`,
        request: {
          method: 'POST',
          header: headerArr,
          body: { mode: 'raw', raw: JSON.stringify(bodyObj, null, 2), options: { raw: { language: 'json' } } },
          url: { raw: `{{base_url}}${cfg.basePath}`, host: ['{{base_url}}'], path: pathSegments },
        },
      });
    }
    (['PUT', 'PATCH'] as HttpMethod[]).forEach((m) => {
      if (cfg.methods[m] && idParam) {
        items.push({
          name: `${m} ${cfg.basePath}/:${idParam}`,
          request: {
            method: m,
            header: headerArr,
            body: { mode: 'raw', raw: JSON.stringify(bodyObj, null, 2), options: { raw: { language: 'json' } } },
            url: {
              raw: `{{base_url}}${cfg.basePath}/:${idParam}`,
              host: ['{{base_url}}'],
              path: pathWithId,
              variable: [{ key: idParam, value: '' }],
            },
          },
        });
      }
    });
    if (cfg.methods.DELETE && idParam) {
      items.push({
        name: `DELETE ${cfg.basePath}/:${idParam}`,
        request: {
          method: 'DELETE',
          header: headerArr,
          url: {
            raw: `{{base_url}}${cfg.basePath}/:${idParam}`,
            host: ['{{base_url}}'],
            path: pathWithId,
            variable: [{ key: idParam, value: '' }],
          },
        },
      });
    }
    return { name: table, item: items };
  };

  const buildPostmanItemForCombined = (cfg: CombinedApiConfig) => {
    const items: any[] = [];
    const primarySlice = cfg.tables[cfg.primaryTable];
    const idParam = primarySlice?.pathParams?.[0];
    const allQuery = (Object.values(cfg.tables) as CombinedTableSlice[]).flatMap((s) => s.queryParams);
    const uniqueQuery = Array.from(new Set(allQuery));
    const queryArr = uniqueQuery.map((q) => ({ key: q, value: '', disabled: false }));
    const headerArr = [
      { key: 'Authorization', value: 'Bearer {{bearer_token}}', type: 'text' },
      { key: 'Accept', value: 'application/json', type: 'text' },
    ];
    const pathSegments = splitPath(cfg.basePath);
    const pathWithId = idParam ? [...pathSegments, `:${idParam}`] : pathSegments;
    const compositeBody: Record<string, any> = {};
    (Object.entries(cfg.tables) as Array<[string, CombinedTableSlice]>).forEach(([t, slice]) => {
      const cols = columnsByTable[t] || [];
      const obj: Record<string, any> = {};
      slice.payloadFields.forEach((f) => {
        const col = cols.find((c) => c.name === f);
        obj[f] = col ? JSON.parse(sampleValueForCol(col).replace(/^"|"$/g, '"')) : '';
      });
      compositeBody[t] = obj;
    });

    if (cfg.methods.GET) {
      items.push({
        name: `GET ${cfg.basePath}`,
        request: {
          method: 'GET',
          header: headerArr,
          url: {
            raw: `{{base_url}}${cfg.basePath}${queryArr.length ? '?' + queryArr.map((q) => `${q.key}=`).join('&') : ''}`,
            host: ['{{base_url}}'],
            path: pathSegments,
            query: queryArr,
          },
        },
      });
      if (idParam) {
        items.push({
          name: `GET ${cfg.basePath}/:${idParam}`,
          request: {
            method: 'GET',
            header: headerArr,
            url: {
              raw: `{{base_url}}${cfg.basePath}/:${idParam}`,
              host: ['{{base_url}}'],
              path: pathWithId,
              variable: [{ key: idParam, value: '' }],
            },
          },
        });
      }
    }
    if (cfg.methods.POST) {
      items.push({
        name: `POST ${cfg.basePath}`,
        request: {
          method: 'POST',
          header: headerArr,
          body: { mode: 'raw', raw: JSON.stringify(compositeBody, null, 2), options: { raw: { language: 'json' } } },
          url: { raw: `{{base_url}}${cfg.basePath}`, host: ['{{base_url}}'], path: pathSegments },
        },
      });
    }
    (['PUT', 'PATCH'] as HttpMethod[]).forEach((m) => {
      if (cfg.methods[m] && idParam) {
        items.push({
          name: `${m} ${cfg.basePath}/:${idParam}`,
          request: {
            method: m,
            header: headerArr,
            body: { mode: 'raw', raw: JSON.stringify(compositeBody, null, 2), options: { raw: { language: 'json' } } },
            url: {
              raw: `{{base_url}}${cfg.basePath}/:${idParam}`,
              host: ['{{base_url}}'],
              path: pathWithId,
              variable: [{ key: idParam, value: '' }],
            },
          },
        });
      }
    });
    if (cfg.methods.DELETE && idParam) {
      items.push({
        name: `DELETE ${cfg.basePath}/:${idParam}`,
        request: {
          method: 'DELETE',
          header: headerArr,
          url: {
            raw: `{{base_url}}${cfg.basePath}/:${idParam}`,
            host: ['{{base_url}}'],
            path: pathWithId,
            variable: [{ key: idParam, value: '' }],
          },
        },
      });
    }
    return { name: cfg.name || 'Combined API', item: items };
  };

  const buildPostmanCollection = () => {
    if (!activeConnection) return null;
    const collectionName = `${activeConnection.friendly_name || 'XeroCode'} APIs`;
    const folders: any[] = [];
    if (apiMode === 'separate') {
      (Array.from(selectedTables) as string[]).forEach((table) => {
        const cfg = configByTable[table];
        const cols = columnsByTable[table] || [];
        if (cfg) folders.push(buildPostmanItemForTable(table, cfg, cols));
      });
    } else if (combinedConfig) {
      folders.push(buildPostmanItemForCombined(combinedConfig));
    }
    return {
      info: {
        _postman_id: `xerocode-${Date.now()}`,
        name: collectionName,
        description: `Auto-generated REST collection for ${activeConnection.database_name} (${activeConnection.connector_type}). Set base_url and bearer_token variables before running.`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{bearer_token}}', type: 'string' }],
      },
      variable: [
        { key: 'base_url', value: trimBaseUrl(publicBaseUrl), type: 'string' },
        { key: 'bearer_token', value: bearerToken.trim() ? bearerToken.trim() : '', type: 'string' },
      ],
      item: folders,
    };
  };

  const downloadPostman = () => {
    const collection = buildPostmanCollection();
    if (!collection) return;
    const json = JSON.stringify(collection, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (activeConnection?.friendly_name || 'xerocode')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    a.download = `${slug}-postman.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  type SyncSlugRoutesResult =
    | { kind: 'skipped-no-auth' }
    | { kind: 'skipped-empty' }
    | { kind: 'ok'; synced: number; sampleSlug?: string; slugs: string[] }
    | { kind: 'error'; message: string }
    | { kind: 'network' };

  /** Merges GET routes from all saved APIs for this connection plus current builder UI, then POSTs sync. */
  const syncSlugRoutesToServer = useCallback(async (): Promise<SyncSlugRoutesResult> => {
    const hdr = getStudioAuthHeaders();
    if (!hdr['x-user-email'] || !activeConnection?.id) {
      return { kind: 'skipped-no-auth' };
    }
    const tableList = Array.from(selectedTables) as string[];
    const routes = mergeBlueprintRoutesForPublish({
      connectionId: activeConnection.id,
      savedApis,
      activeBuilderConnectionId: activeConnection.id,
      tableList,
      configByTable,
      apiMode,
      combinedConfig,
    });
    if (routes.length === 0) return { kind: 'skipped-empty' };
    try {
      const sr = await studioFetch(apiUrl('/api/api-builder/sync-slugs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hdr },
        body: JSON.stringify({ connectionId: activeConnection.id, routes }),
      });
      const data = await readApiJson<{ ok?: boolean; synced?: number; message?: string; slugs?: string[] }>(sr);
      if (!sr.ok || !data?.ok) {
        return { kind: 'error', message: data?.message || `HTTP ${sr.status}` };
      }
      const slugsFromServer = Array.isArray(data.slugs) ? data.slugs.filter(Boolean) : [];
      const slugs =
        slugsFromServer.length > 0 ? slugsFromServer : routes.map((row) => row.slug).filter(Boolean);
      return {
        kind: 'ok',
        synced: data.synced ?? routes.length,
        sampleSlug: routes[0]?.slug,
        slugs,
      };
    } catch {
      return { kind: 'network' };
    }
  }, [activeConnection?.id, savedApis, selectedTables, configByTable, apiMode, combinedConfig]);

  const handlePublishRoutes = async () => {
    if (!activeConnection) {
      window.alert('Pick a datasource connection first.');
      return;
    }
    setPublishBusy(true);
    try {
      const r = await syncSlugRoutesToServer();
      if (r.kind === 'skipped-no-auth') {
        window.alert('Sign in to publish GET /api/<slug> routes to the server.');
        return;
      }
      if (r.kind === 'skipped-empty') {
        setSaveMessage(
          'No GET blueprint routes for this connection. Enable GET and set Base path like /api/icl-invoice on your tables (or in Saved APIs), then try again.'
        );
        window.setTimeout(() => setSaveMessage(''), 9000);
        return;
      }
      if (r.kind === 'error') {
        window.alert(`Publish failed: ${r.message}`);
        return;
      }
      if (r.kind === 'network') {
        window.alert(
          `Could not reach the API server (${apiUrl('/api/api-builder/sync-slugs')}). Start npm run dev:api and try Publish routes again.`
        );
        return;
      }
      if (r.kind === 'ok') {
        const names = r.slugs.length ? r.slugs.join(', ') : r.sampleSlug || '';
        const verifyUrl = `${trimBaseUrl(apiUrl('/api/api-builder/published-routes'))}?connectionId=${activeConnection.id}`;
        setSaveMessage(
          `Published ${r.synced} blueprint GET route(s)${names ? `: ${names}` : ''}. Example: GET ${trimBaseUrl(publicBaseUrl)}/api/${r.sampleSlug || r.slugs[0] || 'your-slug'}. Verify list: ${verifyUrl}`
        );
        window.setTimeout(() => setSaveMessage(''), 10000);
      }
    } finally {
      setPublishBusy(false);
    }
  };

  const saveCurrentApi = () => {
    if (!activeConnection || selectedTables.size === 0) {
      window.alert('Pick at least one table to save.');
      return;
    }
    const tableList = Array.from(selectedTables) as string[];
    const friendly = activeConnection.friendly_name || 'API';
    const editingExisting = savedApis.find((a) => a.id === editingApiId);
    const defaultName =
      editingExisting?.name ||
      (apiMode === 'combined' && combinedConfig
        ? combinedConfig.name || `${friendly} (combined)`
        : tableList.length === 1
          ? `${friendly} · ${tableList[0]}`
          : `${friendly} (${tableList.length} tables)`);
    const name = (window.prompt(editingExisting ? 'Update API name:' : 'Save API as:', defaultName) || '').trim();
    if (!name) return;
    const record: SavedApi = {
      id: editingExisting ? editingExisting.id : `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: Date.now(),
      publicBaseUrl,
      apiMode,
      connection: {
        id: activeConnection.id,
        friendly_name: activeConnection.friendly_name,
        connector_type: activeConnection.connector_type,
        database_name: activeConnection.database_name,
      },
      tables: tableList.map((t) => ({
        table: t,
        columns: columnsByTable[t] || [],
        api: configByTable[t],
      })),
      combinedApi:
        apiMode === 'combined' && combinedConfig
          ? {
              ...combinedConfig,
              columns: Object.fromEntries(
                Object.keys(combinedConfig.tables).map((t) => [t, columnsByTable[t] || []])
              ),
            }
          : null,
    };
    const next = editingExisting
      ? savedApis.map((a) => (a.id === editingExisting.id ? record : a))
      : [record, ...savedApis].slice(0, 50);
    setSavedApis(next);
    const persistLocal = () => {
      writeSavedApis(next);
      mirrorBlueprintApisLocal(next);
    };
    if (hasWorkspaceAuth()) {
      void upsertBlueprintApiWorkspace(record)
        .then(() => {
          persistLocal();
        })
        .catch((err) => {
          window.alert(
            `Could not sync to server (${err instanceof Error ? err.message : String(err)}). Check API server and sign-in. Saved in this browser only.`
          );
          writeSavedApis(next);
        });
    } else {
      writeSavedApis(next);
    }
    setEditingApiId(record.id);
    setSaveMessage(
      editingExisting
        ? `Updated "${name}".${hasWorkspaceAuth() ? ' Syncing to your account…' : ' Stored in this browser.'}`
        : `Saved as "${name}".${hasWorkspaceAuth() ? ' Syncing to your account…' : ' Stored in this browser — sign in to sync across devices.'}`
    );
    window.setTimeout(() => setSaveMessage(''), 4000);

    const hdr = getStudioAuthHeaders();
    if (hdr['x-user-email']) {
      void (async () => {
        const intro = editingExisting ? `Updated "${name}".` : `Saved "${name}".`;
        const r = await syncSlugRoutesToServer();
        if (r.kind === 'skipped-no-auth') return;
        if (r.kind === 'skipped-empty') {
          setSaveMessage(
            `${intro} Local save OK. No GET blueprint routes to publish — enable GET and Base path like /api/icl-invoice, then use Publish routes.`
          );
          window.setTimeout(() => setSaveMessage(''), 9000);
          return;
        }
        if (r.kind === 'error') {
          setSaveMessage(`${intro} Server did not publish routes: ${r.message}.`);
          window.setTimeout(() => setSaveMessage(''), 7000);
          return;
        }
        if (r.kind === 'network') {
          setSaveMessage(
            `${intro} Could not reach API to publish routes (${apiUrl('/api/api-builder/sync-slugs')}). Start npm run dev:api and use Publish routes.`
          );
          window.setTimeout(() => setSaveMessage(''), 7000);
          return;
        }
        if (r.kind === 'ok') {
          const names = r.slugs.length ? r.slugs.join(', ') : '';
          const slug = r.sampleSlug || r.slugs[0];
          const verifyUrl = `${trimBaseUrl(apiUrl('/api/api-builder/published-routes'))}?connectionId=${activeConnection.id}`;
          setSaveMessage(
            `${intro} Published ${r.synced} blueprint GET route(s)${names ? `: ${names}` : ''}.${slug ? ` Example: GET ${trimBaseUrl(publicBaseUrl)}/api/${slug}` : ''} (Bearer JWT or studio headers). Verify list: ${verifyUrl}`
          );
          window.setTimeout(() => setSaveMessage(''), 10000);
        }
      })();
    }
  };

  // ---------- API Reference helpers ----------
  const buildExternalUrl = (basePath: string) => `${trimBaseUrl(publicBaseUrl)}${basePath}`;

  const inferResponseStructure = (
    cols: ColumnDef[],
    responseFields: string[]
  ): string => {
    const obj: string[] = [];
    responseFields.forEach((f) => {
      const col = cols.find((c) => c.name === f);
      const t = col ? `${col.type || ''} ${col.columnType || ''}`.toLowerCase() : '';
      let typeLabel = 'string';
      if (t.includes('int') || t.includes('decimal') || t.includes('numeric') || t.includes('float') || t.includes('double')) typeLabel = 'number';
      else if (t.includes('bool') || t.includes('bit')) typeLabel = 'boolean';
      else if (t.includes('date') || t.includes('time')) typeLabel = 'string (ISO date)';
      else if (t.includes('json')) typeLabel = 'object';
      obj.push(`    "${f}": ${JSON.stringify(typeLabel)}`);
    });
    if (obj.length === 0) return '{\n  "data": []\n}';
    return ['{', '  "ok": true,', '  "data": [', '    {', obj.join(',\n'), '    }', '  ]', '}'].join('\n');
  };

  type PublicReferenceArgs = {
    docKey: string;
    title: string;
    basePath: string;
    methods: Record<HttpMethod, boolean>;
    pathParams: string[];
    queryParams: string[];
    payloadFields: string[];
    responseFields: string[];
    cols: ColumnDef[];
    payloadPreviewJson: string;
    combinedResponseSpec?: {
      tables: Record<string, CombinedTableSlice>;
      columnsByTable: Record<string, ColumnDef[]>;
    };
  };

  const renderPublicApiReference = ({
    docKey,
    title,
    basePath,
    methods,
    pathParams,
    queryParams,
    responseFields,
    cols,
    payloadPreviewJson,
    combinedResponseSpec,
  }: PublicReferenceArgs): React.ReactNode => {
    const expanded = docsExpandedFor[docKey] !== false; // default open
    const externalUrl = buildExternalUrl(basePath);
    const idParam = pathParams[0];
    const enabledMethods = (Object.keys(methods) as HttpMethod[]).filter((m) => methods[m]);
    const responseSpec = combinedResponseSpec
      ? buildCombinedResponseStructure(combinedResponseSpec)
      : inferResponseStructure(cols, responseFields);
    const curlSnippet = `curl -X GET "${externalUrl}${queryParams.length ? '?' + queryParams.map((q) => `${q}=value`).join('&') : ''}" \\
  -H "Authorization: Bearer ${bearerToken.trim() || 'YOUR_BEARER_TOKEN'}" \\
  -H "Accept: application/json"`;

    return (
      <div className={`mt-5 rounded-lg border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
        <button
          type="button"
          onClick={() =>
            setDocsExpandedFor((prev) => ({ ...prev, [docKey]: !(prev[docKey] !== false) }))
          }
          className={`flex w-full items-center justify-between gap-2 rounded-t-lg px-3 py-2.5 text-left ${isDarkMode ? 'hover:bg-slate-900' : 'hover:bg-slate-100'}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen className={`h-4 w-4 ${isDarkMode ? 'text-violet-300' : 'text-violet-600'}`} />
            <p className={`truncate text-[12px] font-semibold ${heading}`}>{title}</p>
            <span className={`ml-1 rounded-sm px-1.5 text-[10px] font-bold uppercase ${isDarkMode ? 'bg-violet-500/15 text-violet-300' : 'bg-violet-100 text-violet-700'}`}>
              External
            </span>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {expanded && (
          <div className="space-y-4 px-4 py-4">
            <section>
              <div className="mb-1 flex items-center gap-2">
                <Globe className={`h-3.5 w-3.5 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`} />
                <p className={`text-[11px] font-semibold ${heading}`}>External endpoints</p>
              </div>
              <div className={`rounded-md ${isDarkMode ? 'bg-black/40' : 'bg-white'} p-2`}>
                <div className="mb-1 flex items-center justify-between">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>Base URL</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(externalUrl)}
                    className={`inline-flex items-center gap-1 text-[10px] ${subText} hover:opacity-80`}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <code className={`block break-all font-mono text-[11px] ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {externalUrl}
                </code>
              </div>
              <ul className="mt-2 space-y-1 text-[11px]">
                {enabledMethods.length === 0 && (
                  <li className={subText}>No methods enabled.</li>
                )}
                {enabledMethods.map((m) => {
                  const path =
                    (m === 'GET' && !idParam) || m === 'POST'
                      ? basePath
                      : idParam
                        ? `${basePath}/:${idParam}`
                        : basePath;
                  return (
                    <li key={`${docKey}-${m}`} className="flex items-center gap-2 font-mono">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        m === 'GET' ? 'bg-emerald-500/15 text-emerald-500'
                        : m === 'POST' ? 'bg-sky-500/15 text-sky-500'
                        : m === 'PUT' ? 'bg-amber-500/15 text-amber-500'
                        : m === 'PATCH' ? 'bg-violet-500/15 text-violet-500'
                        : 'bg-rose-500/15 text-rose-500'
                      }`}>{m}</span>
                      <span className={isDarkMode ? 'text-slate-200' : 'text-slate-800'}>
                        {trimBaseUrl(publicBaseUrl)}{path}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <div className="mb-1 flex items-center gap-2">
                <Shield className={`h-3.5 w-3.5 ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`} />
                <p className={`text-[11px] font-semibold ${heading}`}>Authentication · Bearer token</p>
              </div>
              <p className={`mb-1 text-[11px] ${subText}`}>
                Include an <code className="font-mono">Authorization</code> header on every request. Use{' '}
                <strong>Issue JWT</strong> below (Public endpoint settings) to mint a signed token bound to your workspace and this saved datasource profile — no database password is embedded.
              </p>
              <div className={`rounded-md ${isDarkMode ? 'bg-black/40' : 'bg-white'} p-2`}>
                <pre className={`whitespace-pre-wrap break-all font-mono text-[10px] leading-5 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
{`Authorization: Bearer ${bearerToken.trim() || 'YOUR_BEARER_TOKEN'}`}
                </pre>
              </div>
            </section>

            <section>
              <div className="mb-1 flex items-center gap-2">
                <KeyRound className={`h-3.5 w-3.5 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`} />
                <p className={`text-[11px] font-semibold ${heading}`}>Usage &amp; parameters</p>
              </div>
              <div className="overflow-hidden rounded-md border" style={{ borderColor: isDarkMode ? '#1e293b' : '#e2e8f0' }}>
                <table className="w-full text-left text-[11px]">
                  <thead className={isDarkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-700'}>
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Location</th>
                      <th className="px-2 py-1.5 font-semibold">Name</th>
                      <th className="px-2 py-1.5 font-semibold">Type</th>
                      <th className="px-2 py-1.5 font-semibold">Required</th>
                    </tr>
                  </thead>
                  <tbody className={isDarkMode ? 'text-slate-200' : 'text-slate-700'}>
                    {pathParams.map((p) => {
                      const c = cols.find((x) => x.name === p);
                      return (
                        <tr key={`${docKey}-pp-${p}`} className={isDarkMode ? 'border-t border-slate-800' : 'border-t border-slate-200'}>
                          <td className="px-2 py-1.5 font-mono text-[10px] uppercase text-sky-500">path</td>
                          <td className="px-2 py-1.5 font-mono">{p}</td>
                          <td className="px-2 py-1.5">{c?.type || 'string'}</td>
                          <td className="px-2 py-1.5">yes</td>
                        </tr>
                      );
                    })}
                    {queryParams.map((q) => {
                      const c = cols.find((x) => x.name === q);
                      return (
                        <tr key={`${docKey}-qp-${q}`} className={isDarkMode ? 'border-t border-slate-800' : 'border-t border-slate-200'}>
                          <td className="px-2 py-1.5 font-mono text-[10px] uppercase text-emerald-500">query</td>
                          <td className="px-2 py-1.5 font-mono">{q}</td>
                          <td className="px-2 py-1.5">{c?.type || 'string'}</td>
                          <td className="px-2 py-1.5">no</td>
                        </tr>
                      );
                    })}
                    {pathParams.length + queryParams.length === 0 && (
                      <tr>
                        <td colSpan={4} className={`px-2 py-2 text-[11px] ${subText}`}>No path or query parameters configured.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {(methods.POST || methods.PUT || methods.PATCH) && (
              <section>
                <div className="mb-1 flex items-center gap-2">
                  <FileJson className={`h-3.5 w-3.5 ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`} />
                  <p className={`text-[11px] font-semibold ${heading}`}>Request body</p>
                </div>
                <div className={`rounded-md ${isDarkMode ? 'bg-black/40' : 'bg-white'} p-2`}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>Sample JSON</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(payloadPreviewJson)}
                      className={`inline-flex items-center gap-1 text-[10px] ${subText} hover:opacity-80`}
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                  <pre className={`max-h-44 overflow-auto whitespace-pre rounded-sm font-mono text-[10px] leading-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
{payloadPreviewJson}
                  </pre>
                </div>
              </section>
            )}

            <section>
              <div className="mb-1 flex items-center gap-2">
                <Zap className={`h-3.5 w-3.5 ${isDarkMode ? 'text-violet-300' : 'text-violet-600'}`} />
                <p className={`text-[11px] font-semibold ${heading}`}>Response structure</p>
              </div>
              <div className={`rounded-md ${isDarkMode ? 'bg-black/40' : 'bg-white'} p-2`}>
                <div className="mb-1 flex items-center justify-between">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>Schema</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(responseSpec)}
                    className={`inline-flex items-center gap-1 text-[10px] ${subText} hover:opacity-80`}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <pre className={`max-h-52 overflow-auto whitespace-pre rounded-sm font-mono text-[10px] leading-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
{responseSpec}
                </pre>
              </div>
            </section>

            <section>
              <div className="mb-1 flex items-center gap-2">
                <Code2 className={`h-3.5 w-3.5 ${isDarkMode ? 'text-orange-300' : 'text-orange-600'}`} />
                <p className={`text-[11px] font-semibold ${heading}`}>Try it · cURL</p>
              </div>
              <div className={`rounded-md ${isDarkMode ? 'bg-black/40' : 'bg-white'} p-2`}>
                <div className="mb-1 flex items-center justify-between">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>Example</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(curlSnippet)}
                    className={`inline-flex items-center gap-1 text-[10px] ${subText} hover:opacity-80`}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <pre className={`overflow-auto whitespace-pre rounded-sm font-mono text-[10px] leading-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
{curlSnippet}
                </pre>
              </div>
            </section>
          </div>
        )}
      </div>
    );
  };

  const buildCombinedResponseStructure = (spec: {
    tables: Record<string, CombinedTableSlice>;
    columnsByTable: Record<string, ColumnDef[]>;
  }): string => {
    const sections: string[] = [];
    (Object.entries(spec.tables) as Array<[string, CombinedTableSlice]>).forEach(([t, slice]) => {
      const cols = spec.columnsByTable[t] || [];
      const inner = slice.responseFields
        .map((f) => {
          const col = cols.find((c) => c.name === f);
          const typ = col ? `${col.type || ''} ${col.columnType || ''}`.toLowerCase() : '';
          let typeLabel = 'string';
          if (typ.includes('int') || typ.includes('decimal') || typ.includes('numeric') || typ.includes('float') || typ.includes('double')) typeLabel = 'number';
          else if (typ.includes('bool') || typ.includes('bit')) typeLabel = 'boolean';
          else if (typ.includes('date') || typ.includes('time')) typeLabel = 'string (ISO date)';
          else if (typ.includes('json')) typeLabel = 'object';
          return `      "${f}": ${JSON.stringify(typeLabel)}`;
        })
        .join(',\n');
      sections.push(`    "${t}": ${inner ? `[\n      {\n${inner}\n      }\n    ]` : '[]'}`);
    });
    if (sections.length === 0) return '{\n  "ok": true,\n  "data": {}\n}';
    return ['{', '  "ok": true,', '  "data": {', sections.join(',\n'), '  }', '}'].join('\n');
  };

  const renderCombinedCard = (): React.ReactNode => {
    if (!combinedConfig) return null;
    const tableNames = Object.keys(combinedConfig.tables);
    return (
      <div className={`rounded-xl border ${card} shadow-sm`}>
        <div className={`flex items-start justify-between gap-3 rounded-t-xl border-b px-4 py-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isDarkMode ? 'bg-violet-500/15 text-violet-300' : 'bg-violet-50 text-violet-600'}`}>
              <Boxes className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${heading}`}>Combined API Configuration</p>
              <p className={`mt-0.5 truncate text-[11px] ${subText}`}>
                {tableNames.length} tables · primary <span className="font-mono">{combinedConfig.primaryTable || '—'}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${isDarkMode ? 'bg-violet-500/15 text-violet-200' : 'bg-violet-100 text-violet-700'}`}>
              SINGLE API
            </span>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div>
              <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${subText}`}>API name</label>
              <input
                type="text"
                className={inputCls}
                value={combinedConfig.name}
                onChange={(e) => updateCombined((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${subText}`}>Base path</label>
              <input
                type="text"
                className={inputCls}
                value={combinedConfig.basePath}
                onChange={(e) => updateCombined((prev) => ({ ...prev, basePath: e.target.value }))}
              />
            </div>
            <div>
              <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${subText}`}>Primary table</label>
              <div className="relative">
                <select
                  value={combinedConfig.primaryTable}
                  onChange={(e) => updateCombined((prev) => ({ ...prev, primaryTable: e.target.value }))}
                  className={`h-9 w-full appearance-none rounded-md border pl-2.5 pr-8 text-xs outline-none ${
                    isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {tableNames.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${subText}`} />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-wider ${subText}`}>Methods</p>
            <div className="flex flex-wrap gap-1.5">
              {HTTP_METHODS.map((m) => {
                const active = combinedConfig.methods[m];
                const tone =
                  m === 'GET'
                    ? 'emerald'
                    : m === 'POST'
                      ? 'sky'
                      : m === 'PUT'
                        ? 'amber'
                        : m === 'PATCH'
                          ? 'violet'
                          : 'rose';
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() =>
                      updateCombined((prev) => ({
                        ...prev,
                        methods: { ...prev.methods, [m]: !prev.methods[m] },
                      }))
                    }
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide ${
                      active
                        ? `bg-${tone}-500/15 text-${tone}-500 ring-1 ring-${tone}-500/40`
                        : isDarkMode
                          ? 'bg-slate-900 text-slate-500'
                          : 'bg-white text-slate-400 ring-1 ring-slate-200'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={`rounded-lg border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'} p-3`}>
              <div className="mb-2 flex items-center gap-2">
                <Link2 className={`h-3.5 w-3.5 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`} />
                <p className={`text-[11px] font-semibold ${heading}`}>Endpoint</p>
              </div>
              <div className={`rounded-md ${isDarkMode ? 'bg-black/40' : 'bg-white'} p-2`}>
                <div className="mb-1 flex items-center justify-between">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>Preview</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(buildCombinedEndpointPreview().join('\n'))}
                    className={`inline-flex items-center gap-1 text-[10px] ${subText} hover:opacity-80`}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <pre className={`max-h-40 overflow-auto whitespace-pre rounded-sm font-mono text-[10px] leading-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
{buildCombinedEndpointPreview().join('\n') || '(no methods enabled)'}
                </pre>
              </div>
            </div>
            <div className={`rounded-lg border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'} p-3`}>
              <div className="mb-2 flex items-center gap-2">
                <FileJson className={`h-3.5 w-3.5 ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`} />
                <p className={`text-[11px] font-semibold ${heading}`}>Combined payload</p>
              </div>
              <div className={`rounded-md ${isDarkMode ? 'bg-black/60' : 'bg-white'} p-2`}>
                <div className="mb-1 flex items-center justify-between">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>Request body</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(buildCombinedPayloadPreview())}
                    className={`inline-flex items-center gap-1 text-[10px] ${subText} hover:opacity-80`}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <pre className={`max-h-40 overflow-auto whitespace-pre rounded-sm font-mono text-[10px] leading-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
{buildCombinedPayloadPreview()}
                </pre>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>Per-table contributions</p>
            {tableNames.map((table) => {
              const cols = columnsByTable[table] || [];
              const slice = combinedConfig.tables[table];
              const isExpanded = expandedCombinedTable === table;
              const colsLoading = columnsLoadingByTable[table];
              return (
                <div key={`combined-${table}`} className={`rounded-lg border ${isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-white'}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedCombinedTable(isExpanded ? null : table)}
                    className={`flex w-full items-center justify-between gap-3 rounded-t-lg px-3 py-2.5 text-left ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Table2 className={`h-3.5 w-3.5 shrink-0 ${subText}`} />
                      <span className={`truncate font-mono text-[12px] ${heading}`}>{table}</span>
                      {table === combinedConfig.primaryTable && (
                        <span className={`rounded-sm px-1 text-[9px] font-bold uppercase ${isDarkMode ? 'bg-violet-500/15 text-violet-300' : 'bg-violet-100 text-violet-700'}`}>
                          primary
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] ${subText}`}>{cols.length} columns</span>
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className={`border-t px-3 py-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                      {colsLoading ? (
                        <div className={`flex items-center gap-2 text-[11px] ${subText}`}>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading columns…
                        </div>
                      ) : (
                        <>
                          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${subText}`}>Join column</label>
                              <div className="relative">
                                <select
                                  value={slice.joinColumn}
                                  onChange={(e) => updateCombinedSlice(table, (prev) => ({ ...prev, joinColumn: e.target.value }))}
                                  className={`h-9 w-full appearance-none rounded-md border pl-2.5 pr-8 text-xs outline-none ${
                                    isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-800'
                                  }`}
                                >
                                  <option value="">(none)</option>
                                  {cols.map((c) => (
                                    <option key={c.name} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
                                <ChevronDown className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${subText}`} />
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                            <FieldPickerBox
                              title="Path Params"
                              description="Used as :param in the URL"
                              Icon={KeyRound}
                              iconColor={isDarkMode ? 'text-sky-300' : 'text-sky-600'}
                              cols={cols}
                              selected={slice.pathParams}
                              onToggle={(name) =>
                                updateCombinedSlice(table, (prev) => ({ ...prev, pathParams: toggleField(prev.pathParams, name) }))
                              }
                              isDarkMode={isDarkMode}
                            />
                            <FieldPickerBox
                              title="Query Params"
                              description="Filter/sort fields appended to URL"
                              Icon={Search}
                              iconColor={isDarkMode ? 'text-emerald-300' : 'text-emerald-600'}
                              cols={cols}
                              selected={slice.queryParams}
                              onToggle={(name) =>
                                updateCombinedSlice(table, (prev) => ({ ...prev, queryParams: toggleField(prev.queryParams, name) }))
                              }
                              isDarkMode={isDarkMode}
                            />
                            <FieldPickerBox
                              title="Payload Fields"
                              description="Editable in request body"
                              Icon={FileJson}
                              iconColor={isDarkMode ? 'text-amber-300' : 'text-amber-600'}
                              cols={cols}
                              selected={slice.payloadFields}
                              onToggle={(name) =>
                                updateCombinedSlice(table, (prev) => ({ ...prev, payloadFields: toggleField(prev.payloadFields, name) }))
                              }
                              isDarkMode={isDarkMode}
                            />
                            <FieldPickerBox
                              title="Response Fields"
                              description="Returned in API responses"
                              Icon={Zap}
                              iconColor={isDarkMode ? 'text-violet-300' : 'text-violet-600'}
                              cols={cols}
                              selected={slice.responseFields}
                              onToggle={(name) =>
                                updateCombinedSlice(table, (prev) => ({ ...prev, responseFields: toggleField(prev.responseFields, name) }))
                              }
                              isDarkMode={isDarkMode}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {renderPublicApiReference({
            docKey: 'combined',
            title: `Public API Reference · ${combinedConfig.name || 'Combined'}`,
            basePath: combinedConfig.basePath,
            methods: combinedConfig.methods,
            pathParams: combinedConfig.tables[combinedConfig.primaryTable]?.pathParams || [],
            queryParams: Array.from(
              new Set(
                (Object.values(combinedConfig.tables) as CombinedTableSlice[]).flatMap((s) => s.queryParams)
              )
            ),
            payloadFields: [],
            responseFields: [],
            cols: columnsByTable[combinedConfig.primaryTable] || [],
            payloadPreviewJson: buildCombinedPayloadPreview(),
            combinedResponseSpec: {
              tables: combinedConfig.tables,
              columnsByTable,
            },
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex h-full min-h-[calc(100vh-48px)] w-full flex-col ${isDarkMode ? 'bg-black' : 'bg-slate-50'}`}>
      <div className={`flex items-center justify-between border-b px-4 py-3 ${isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center gap-2">
          <Code2 className={`h-5 w-5 ${isDarkMode ? 'text-orange-300' : 'text-orange-500'}`} />
          <div>
            <h1 className={`text-base font-semibold ${heading}`}>
              API Builder
              {editingApiId && savedApis.find((a) => a.id === editingApiId) && (
                <span
                  className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 align-middle text-[10px] font-medium ${
                    isDarkMode ? 'border-amber-500/50 bg-amber-500/15 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-700'
                  }`}
                >
                  Editing: {savedApis.find((a) => a.id === editingApiId)?.name}
                </span>
              )}
            </h1>
            <p className={`text-[11px] ${subText}`}>Configure REST endpoints from your data tables.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadConnections()}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] ${
              isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handlePublishRoutes()}
            disabled={!activeConnection || publishBusy}
            title="Publish GET /api/&lt;slug&gt; routes from all Saved APIs for this connection plus the builder"
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] disabled:opacity-50 ${
              isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {publishBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Publish routes
          </button>
          <button
            type="button"
            onClick={saveCurrentApi}
            disabled={selectedTables.size === 0}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold disabled:opacity-50 ${
              isDarkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            Save API
          </button>
          <button
            type="button"
            onClick={downloadPostman}
            disabled={selectedTables.size === 0}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold disabled:opacity-50 ${
              isDarkMode ? 'bg-orange-600 text-white hover:bg-orange-500' : 'bg-orange-600 text-white hover:bg-orange-500'
            }`}
            title="Download Postman v2.1 collection (importable into Postman)"
          >
            <Download className="h-3.5 w-3.5" />
            Postman
          </button>
          <button
            type="button"
            onClick={exportConfig}
            disabled={selectedTables.size === 0}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-semibold disabled:opacity-50 ${
              isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <FileJson className="h-3.5 w-3.5" />
            Blueprint
          </button>
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex h-8 items-center rounded-md px-3 text-[11px] ${
              isDarkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Back
          </button>
        </div>
      </div>

      {saveMessage && (
        <div
          className={`border-b px-4 py-2 text-[11px] ${
            isDarkMode ? 'border-slate-900 bg-emerald-900/20 text-emerald-300' : 'border-slate-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {saveMessage}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-0">
        <aside
          className={`col-span-12 lg:col-span-4 xl:col-span-3 flex h-full min-h-0 flex-col overflow-hidden border-r ${
            isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200 bg-white'
          }`}
        >
          <div className={`border-b px-3 py-3 ${isDarkMode ? 'border-slate-900' : 'border-slate-200'}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${subText}`}>Data Sources</p>
              {activeConnection && (
                <span className={`inline-flex items-center gap-1 text-[10px] ${subText}`}>
                  {(() => {
                    const meta = CONNECTOR_META[(activeConnection.connector_type as ConnectorType) || 'mysql'];
                    const Icon = meta.Icon;
                    return (
                      <>
                        <Icon className={`h-3 w-3 ${meta.color}`} />
                        {meta.label}
                      </>
                    );
                  })()}
                </span>
              )}
            </div>

            <StudioPopoverSelect
              ariaLabel="Saved datasource"
              isDarkMode={isDarkMode}
              disabled={connectionsLoading}
              value={activeConnection ? `${activeConnection.connector_type}:${activeConnection.id}` : ''}
              placeholder={
                connectionsLoading
                  ? 'Loading saved connections…'
                  : connections.length === 0
                    ? 'No saved connections — save one in App Data'
                    : 'Choose saved datasource…'
              }
              sections={datasourcePopoverSections}
              onMenuOpen={() => {
                void loadConnections();
              }}
              onChange={(value) => {
                if (!value) {
                  setActiveConnection(null);
                  setTables([]);
                  setSelectedTables(new Set());
                  setColumnsByTable({});
                  setConfigByTable({});
                  setExpandedTable(null);
                  return;
                }
                const [connector, idStr] = value.split(':');
                const id = Number(idStr);
                const match = connections.find(
                  (c) => c.id === id && (c.connector_type || 'mysql') === connector
                );
                if (match) handleSelectConnection(match);
              }}
              triggerClassName={`inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border pl-2.5 pr-2 text-left text-xs outline-none ${
                isDarkMode
                  ? 'border-slate-700 bg-slate-950 text-slate-100 disabled:opacity-60'
                  : 'border-slate-200 bg-white text-slate-800 disabled:opacity-60'
              }`}
            />

            {connectionsError && (
              <p className="mt-2 text-[11px] text-rose-500">{connectionsError}</p>
            )}
          </div>

          {activeConnection && (
            <div className={`flex min-h-0 flex-1 flex-col border-t px-3 py-3 ${isDarkMode ? 'border-slate-900' : 'border-slate-200'}`}>
              <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                <p className={`text-[10px] font-bold uppercase tracking-widest ${subText}`}>Tables</p>
                <span className={`text-[10px] ${subText}`}>
                  {isEditingSavedApi && !showAllDatasourceTablesInEdit
                    ? `${selectedTables.size} in this API`
                    : `${selectedTables.size} of ${tables.length} selected`}
                </span>
              </div>
              {isEditingSavedApi && (
                <div className="mb-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAllDatasourceTablesInEdit((v) => !v)}
                    className={`w-full rounded-md border px-2 py-1.5 text-left text-[10px] font-medium ${
                      isDarkMode
                        ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {showAllDatasourceTablesInEdit ? 'Show only tables in this API' : 'Show all datasource tables'}
                  </button>
                </div>
              )}
              <div className="relative mb-2 shrink-0">
                <Search className={`pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 ${subText}`} />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search tables..."
                  className={`${inputCls} pl-7`}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
                {tablesLoading ? (
                  <div className={`flex items-center gap-2 px-1 py-2 text-[11px] ${subText}`}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading tables...
                  </div>
                ) : tablesError ? (
                  <p className="px-1 py-2 text-[11px] text-rose-500">{tablesError}</p>
                ) : tablesForLeftPanel.length === 0 ? (
                  <p className={`px-1 py-2 text-[11px] ${subText}`}>
                    {editingApiId && !showAllDatasourceTablesInEdit && savedApiTableNames.length === 0
                      ? 'This API has no tables saved.'
                      : 'No tables match your search.'}
                  </p>
                ) : (
                  tablesForLeftPanel.map((t) => {
                    const checked = selectedTables.has(t);
                    return (
                      <label
                        key={t}
                        className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${
                          checked
                            ? isDarkMode
                              ? 'bg-slate-900 text-slate-100'
                              : 'bg-violet-50 text-violet-700'
                            : isDarkMode
                              ? 'text-slate-300 hover:bg-slate-900'
                              : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-violet-600"
                          checked={checked}
                          onChange={() => void toggleTable(t)}
                        />
                        <Table2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1 truncate">{t}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </aside>

        <main className="col-span-12 lg:col-span-8 xl:col-span-9 min-h-0 overflow-y-auto p-4 sm:p-6">
          {activeConnection && selectedTables.size > 0 && (
            <div className={`mb-4 rounded-xl border ${card} p-3 shadow-sm`}>
              <div className="mb-2 flex items-center gap-2">
                <Globe className={`h-4 w-4 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`} />
                <p className={`text-[12px] font-semibold ${heading}`}>Public endpoint settings</p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${subText}`}>Public base URL</label>
                  <input
                    type="text"
                    className={inputCls}
                    value={publicBaseUrl}
                    placeholder="https://api.your-domain.com"
                    onChange={(e) => setPublicBaseUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${subText} flex items-center gap-1`}>
                    <Lock className="h-3 w-3" /> Bearer token (docs &amp; Postman)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      className={`${inputCls} min-w-[160px] flex-1`}
                      value={bearerToken}
                      placeholder="Paste JWT or Issue… (saved in this browser)"
                      onChange={(e) => setBearerToken(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={issuingBearerToken}
                      onClick={() => void issueDatasourceBearerToken()}
                      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold ${
                        isDarkMode
                          ? 'border-violet-500/40 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25 disabled:opacity-50'
                          : 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-50'
                      }`}
                    >
                      {issuingBearerToken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                      Issue JWT
                    </button>
                  </div>
                  <p className={`mt-1 text-[10px] leading-snug ${subText}`}>
                    The API server verifies this JWT (HS256, same secret) on datasource routes{' '}
                    <code className="font-mono text-[10px]">/api/connections/&lt;id&gt;/…</code>. Tokens scoped to one connection id
                    require matching URLs when Bearer alone is used. Set{' '}
                    <code className="font-mono text-[10px]">PUBLIC_API_JWT_SECRET</code> in production.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!activeConnection ? (
            <div className={`flex h-full flex-col items-center justify-center rounded-xl border ${card} p-12 text-center`}>
              <Database className={`mb-3 h-8 w-8 ${subText}`} />
              <h2 className={`text-base font-semibold ${heading}`}>Select a data source</h2>
              <p className={`mt-1 max-w-md text-xs ${subText}`}>
                Choose a saved connection from the left panel to load its tables and start configuring REST API endpoints.
              </p>
            </div>
          ) : selectedTables.size === 0 ? (
            <div className={`flex h-full flex-col items-center justify-center rounded-xl border ${card} p-12 text-center`}>
              <Table2 className={`mb-3 h-8 w-8 ${subText}`} />
              <h2 className={`text-base font-semibold ${heading}`}>Pick tables to expose</h2>
              <p className={`mt-1 max-w-md text-xs ${subText}`}>
                Tick the tables you want to publish as REST endpoints. Each selected table will appear here as an
                editable API configuration card.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border ${card} p-3`}>
                <div className="min-w-0">
                  <p className={`text-[11px] font-semibold ${heading}`}>API generation mode</p>
                  <p className={`text-[11px] ${subText}`}>
                    {apiMode === 'combined'
                      ? 'All selected tables are merged into a single composite endpoint.'
                      : 'Each selected table generates its own REST endpoint.'}
                  </p>
                </div>
                <div className={`inline-flex shrink-0 rounded-lg p-0.5 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <button
                    type="button"
                    onClick={() => setApiMode('separate')}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                      apiMode === 'separate'
                        ? isDarkMode
                          ? 'bg-slate-950 text-slate-100 shadow'
                          : 'bg-white text-slate-900 shadow'
                        : isDarkMode
                          ? 'text-slate-400'
                          : 'text-slate-500'
                    }`}
                  >
                    Per table
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTables.size < 2) {
                        window.alert('Select at least two tables to combine into a single API.');
                        return;
                      }
                      enableCombinedMode();
                    }}
                    disabled={selectedTables.size < 2}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                      apiMode === 'combined'
                        ? isDarkMode
                          ? 'bg-slate-950 text-slate-100 shadow'
                          : 'bg-white text-slate-900 shadow'
                        : isDarkMode
                          ? 'text-slate-400'
                          : 'text-slate-500'
                    }`}
                  >
                    Single combined API
                  </button>
                </div>
              </div>

              {apiMode === 'combined' && combinedConfig
                ? renderCombinedCard()
                : (Array.from(selectedTables) as string[]).map((table: string) => {
                const cfg = configByTable[table];
                const cols = columnsByTable[table] || [];
                const colsLoading = columnsLoadingByTable[table];
                const isExpanded = expandedTable === table;
                if (!cfg) return null;
                return (
                  <div key={table} className={`rounded-xl border ${card} shadow-sm`}>
                    <button
                      type="button"
                      onClick={() => setExpandedTable(isExpanded ? null : table)}
                      className={`flex w-full items-center justify-between gap-3 rounded-t-xl px-4 py-3 text-left ${
                        isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isDarkMode ? 'bg-orange-500/15 text-orange-300' : 'bg-orange-50 text-orange-600'}`}>
                          <Code2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-semibold ${heading}`}>API Configuration</p>
                          <p className={`truncate text-[11px] ${subText}`}>
                            <span className="font-mono">{table}</span>
                            <span className="ml-2">·</span>
                            <span className="ml-2 font-mono">{cfg.basePath}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${subText}`}>{cols.length} columns</span>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className={`border-t px-4 py-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                        {colsLoading ? (
                          <div className={`flex items-center gap-2 text-[11px] ${subText}`}>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading columns…
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                              <div className={`rounded-lg border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'} p-3`}>
                                <div className="mb-2 flex items-center gap-2">
                                  <Link2 className={`h-3.5 w-3.5 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`} />
                                  <p className={`text-[11px] font-semibold ${heading}`}>Endpoint</p>
                                </div>
                                <label className={`mb-2 block text-[10px] font-bold uppercase tracking-wider ${subText}`}>
                                  Base path
                                </label>
                                <input
                                  type="text"
                                  className={inputCls}
                                  value={cfg.basePath}
                                  onChange={(e) =>
                                    updateConfig(table, (prev) => ({ ...prev, basePath: e.target.value }))
                                  }
                                />
                                <div className="mt-3">
                                  <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-wider ${subText}`}>
                                    Methods
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {HTTP_METHODS.map((m) => {
                                      const active = cfg.methods[m];
                                      const tone =
                                        m === 'GET'
                                          ? 'emerald'
                                          : m === 'POST'
                                            ? 'sky'
                                            : m === 'PUT'
                                              ? 'amber'
                                              : m === 'PATCH'
                                                ? 'violet'
                                                : 'rose';
                                      return (
                                        <button
                                          key={m}
                                          type="button"
                                          onClick={() =>
                                            updateConfig(table, (prev) => ({
                                              ...prev,
                                              methods: { ...prev.methods, [m]: !prev.methods[m] },
                                            }))
                                          }
                                          className={`rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide ${
                                            active
                                              ? `bg-${tone}-500/15 text-${tone}-500 ring-1 ring-${tone}-500/40`
                                              : isDarkMode
                                                ? 'bg-slate-900 text-slate-500'
                                                : 'bg-white text-slate-400 ring-1 ring-slate-200'
                                          }`}
                                        >
                                          {m}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className={`mt-3 rounded-md ${isDarkMode ? 'bg-black/40' : 'bg-white'} p-2`}>
                                  <div className="mb-1 flex items-center justify-between">
                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>
                                      Preview
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(buildEndpointPreview(table).join('\n'))}
                                      className={`inline-flex items-center gap-1 text-[10px] ${subText} hover:opacity-80`}
                                    >
                                      <Copy className="h-3 w-3" /> Copy
                                    </button>
                                  </div>
                                  <pre className={`max-h-40 overflow-auto whitespace-pre rounded-sm font-mono text-[10px] leading-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
{buildEndpointPreview(table).join('\n') || '(no methods enabled)'}
                                  </pre>
                                </div>
                              </div>

                              <div className={`rounded-lg border ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'} p-3`}>
                                <div className="mb-2 flex items-center gap-2">
                                  <FileJson className={`h-3.5 w-3.5 ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`} />
                                  <p className={`text-[11px] font-semibold ${heading}`}>Payload</p>
                                </div>
                                <p className={`mb-2 text-[10px] ${subText}`}>
                                  Sample JSON used for POST / PUT / PATCH bodies.
                                </p>
                                <div className={`rounded-md ${isDarkMode ? 'bg-black/60' : 'bg-white'} p-2`}>
                                  <div className="mb-1 flex items-center justify-between">
                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${subText}`}>
                                      Request body
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(buildPayloadPreview(table))}
                                      className={`inline-flex items-center gap-1 text-[10px] ${subText} hover:opacity-80`}
                                    >
                                      <Copy className="h-3 w-3" /> Copy
                                    </button>
                                  </div>
                                  <pre className={`max-h-40 overflow-auto whitespace-pre rounded-sm font-mono text-[10px] leading-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
{buildPayloadPreview(table)}
                                  </pre>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                              <FieldPickerBox
                                title="Path Params"
                                description="Used as :param in the URL (e.g. /:id)"
                                Icon={KeyRound}
                                iconColor={isDarkMode ? 'text-sky-300' : 'text-sky-600'}
                                cols={cols}
                                selected={cfg.pathParams}
                                onToggle={(name) =>
                                  updateConfig(table, (prev) => ({ ...prev, pathParams: toggleField(prev.pathParams, name) }))
                                }
                                isDarkMode={isDarkMode}
                              />
                              <FieldPickerBox
                                title="Query Params"
                                description="Filter / sort fields appended to the URL"
                                Icon={Search}
                                iconColor={isDarkMode ? 'text-emerald-300' : 'text-emerald-600'}
                                cols={cols}
                                selected={cfg.queryParams}
                                onToggle={(name) =>
                                  updateConfig(table, (prev) => ({ ...prev, queryParams: toggleField(prev.queryParams, name) }))
                                }
                                isDarkMode={isDarkMode}
                              />
                              <FieldPickerBox
                                title="Payload Fields"
                                description="Editable fields accepted in request body"
                                Icon={FileJson}
                                iconColor={isDarkMode ? 'text-amber-300' : 'text-amber-600'}
                                cols={cols}
                                selected={cfg.payloadFields}
                                onToggle={(name) =>
                                  updateConfig(table, (prev) => ({ ...prev, payloadFields: toggleField(prev.payloadFields, name) }))
                                }
                                isDarkMode={isDarkMode}
                              />
                              <FieldPickerBox
                                title="Response Fields"
                                description="Columns returned in API responses"
                                Icon={Zap}
                                iconColor={isDarkMode ? 'text-violet-300' : 'text-violet-600'}
                                cols={cols}
                                selected={cfg.responseFields}
                                onToggle={(name) =>
                                  updateConfig(table, (prev) => ({ ...prev, responseFields: toggleField(prev.responseFields, name) }))
                                }
                                isDarkMode={isDarkMode}
                              />
                            </div>

                            {renderPublicApiReference({
                              docKey: `t-${table}`,
                              title: `Public API Reference · ${table}`,
                              basePath: cfg.basePath,
                              methods: cfg.methods,
                              pathParams: cfg.pathParams,
                              queryParams: cfg.queryParams,
                              payloadFields: cfg.payloadFields,
                              responseFields: cfg.responseFields,
                              cols,
                              payloadPreviewJson: buildPayloadPreview(table),
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

type FieldPickerBoxProps = {
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  cols: ColumnDef[];
  selected: string[];
  onToggle: (name: string) => void;
  isDarkMode: boolean;
};

const FieldPickerBox: React.FC<FieldPickerBoxProps> = ({
  title,
  description,
  Icon,
  iconColor,
  cols,
  selected,
  onToggle,
  isDarkMode,
}) => {
  const heading = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const subText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  return (
    <div
      className={`rounded-lg border p-3 ${
        isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <p className={`text-[11px] font-semibold ${heading}`}>{title}</p>
        <span className={`ml-auto rounded-sm px-1.5 text-[10px] ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
          {selected.length}
        </span>
      </div>
      <p className={`mb-2 text-[10px] ${subText}`}>{description}</p>
      <div className={`max-h-44 overflow-y-auto rounded-md border ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        {cols.length === 0 ? (
          <p className={`px-2 py-2 text-[10px] ${subText}`}>No columns available.</p>
        ) : (
          cols.map((c) => {
            const checked = selected.includes(c.name);
            return (
              <label
                key={c.name}
                className={`flex cursor-pointer items-center gap-2 px-2 py-1 text-[11px] ${
                  checked
                    ? isDarkMode
                      ? 'bg-slate-900 text-slate-100'
                      : 'bg-violet-50 text-violet-700'
                    : isDarkMode
                      ? 'text-slate-300 hover:bg-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-violet-600"
                  checked={checked}
                  onChange={() => onToggle(c.name)}
                />
                <span className="min-w-0 flex-1 truncate font-mono">{c.name}</span>
                {c.type && (
                  <span className={`text-[10px] ${subText}`}>{c.type}</span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ApiBuilderScreen;
