import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  CheckSquare,
  ChevronDown,
  CircleUserRound,
  Code2,
  Database,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  LayoutGrid,
  Leaf,
  Link2,
  Linkedin,
  Loader2,
  LogOut,
  Moon,
  PencilLine,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Sun,
  Search,
  Save,
  Sparkles,
  Square,
  Table2,
  Trash2,
  Twitter,
  Upload,
  UserRound,
  UserPlus,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import { apiUrl, readApiJson, studioFetch } from '../lib/apiBase';
import {
  canonicalWorkspaceDbConnector,
  formatAppDataDatasourceLabel,
  loadAppDataDatasourceList,
  type AppDataDatasourceItem,
} from '../lib/loadAppDataDatasourceList';
import { mergeTablesForDashboard } from '../lib/mergeDashboardTables';
import { parseExcelFilesToTables, type ExcelSheetModel } from '../lib/parseExcelFiles';
import { DASHBOARD_TEMPLATES } from '../lib/dashboardTemplates';
import { buildRecommendedDataUseCases } from '../lib/recommendedDataUseCases';
import { AgentPlatformScreen } from './AgentPlatformScreen';
import { GuardrailsCatalogProvider } from './guardrails/GuardrailsCatalogContext';
import { GuardrailsSettingsScreen } from './guardrails/GuardrailsSettingsScreen';
import { ApiBuilderScreen } from './ApiBuilderScreen';
import { ApiListScreen } from './ApiListScreen';
import { ApiSavedDetailScreen } from './ApiSavedDetailScreen';
import { ExternalApiEditorScreen } from './ExternalApiEditorScreen';
import { DashboardDesignStudioScreen } from './DashboardDesignStudioScreen';
import { DesignStudioLandingScreen, type DesignStudioLaunchPayload } from './DesignStudioLandingScreen';
import { StudioPopoverSelect, type StudioPopoverSelectSection } from './StudioPopoverSelect';
import type { SavedApi } from '../lib/savedApis';
import type { CopilotLlmProviderId } from '../lib/copilotLlmCatalog';
import { COPILOT_LLM_PROVIDERS, COPILOT_MODELS_BY_PROVIDER } from '../lib/copilotLlmCatalog';

export type { CopilotLlmProviderId };
export { COPILOT_LLM_PROVIDERS, COPILOT_MODELS_BY_PROVIDER };

const supportsSchemaExplorer = (connector: string | null | undefined) =>
  connector === 'mysql' || connector === 'sqlserver' || connector === 'postgresql';

/** Scroll still works; scrollbars are not shown (Firefox / IE legacy / WebKit). */
const hideScrollbars =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0';

function normalizeCommunityUrl(raw: string): string | null {
  const u = String(raw ?? '').trim();
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={14} height={14} aria-hidden fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.074.074 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

const EXCEL_SAVED_SCHEMAS_STORAGE_KEY = 'xerocode_ai_excel_saved_schemas_v1';

type SavedExcelSchema = {
  id: string;
  name: string;
  savedAt: number;
  tables: ExcelSheetModel[];
};

function readSavedExcelSchemasFromStorage(): SavedExcelSchema[] {
  try {
    const raw = localStorage.getItem(EXCEL_SAVED_SCHEMAS_STORAGE_KEY);
    const p = raw ? (JSON.parse(raw) as SavedExcelSchema[]) : [];
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x) =>
        x &&
        typeof x.id === 'string' &&
        typeof x.name === 'string' &&
        typeof x.savedAt === 'number' &&
        Array.isArray(x.tables)
    );
  } catch {
    return [];
  }
}

export type DashboardBuildContext = {
  prompt?: string;
  /** Custom header title on the dashboard (optional; otherwise derived from prompt/table). */
  dashboardTitle?: string;
  llmProvider?: string;
  llmModel?: string;
  /** Shown in the dashboard sidebar above the file list */
  dataSourceName?: string;
  /** Optional layout mockup from the dashboard Co-Pilot uploader */
  designLayoutFileName?: string;
  designLayoutDataUrl?: string;
  /** Optional multiple layout mockups from prompt attachments */
  designLayoutFiles?: Array<{ name: string; dataUrl: string }>;
  /** Live DB dashboard: fetch sample rows from this connection */
  schemaConnectionId?: number;
  connectorType?: 'mysql' | 'sqlserver' | 'postgresql' | 'excel' | 'mongodb';
  schemaTable?: string;
  /** Excel dashboard: embedded sample (no connection id) */
  excelDashboardSnapshot?: {
    columns: Array<{ name: string; type?: string }>;
    rows: string[][];
    fileLabel?: string;
    sheetLabel?: string;
  };
  /**
   * Preloaded merged rows for multi-table SQL builds (browser-combined); when set, the dashboard
   * does not re-fetch a single `schemaTable`.
   */
  embeddedDashboardData?: {
    columns: Array<{ name: string; type?: string }>;
    rows: string[][];
    previewLabel?: string;
  };
};

const LLM_PROVIDER_API_KEY_LINKS: Record<CopilotLlmProviderId, string> = {
  google: 'https://aistudio.google.com/app/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
};

export const COPILOT_RECOMMENDED_USE_CASES = [
  {
    title: 'Executive KPI dashboard',
    body: 'Revenue, orders, and conversion with week-over-week trends and top segments.',
  },
  {
    title: 'Sales funnel & pipeline',
    body: 'Stage breakdown, win rate, and forecast vs quota by owner or region.',
  },
  {
    title: 'Inventory & operations',
    body: 'Stock levels, reorder alerts, and supplier lead times in one view.',
  },
  {
    title: 'Customer cohort analysis',
    body: 'Retention, LTV, and behavior by signup cohort or acquisition channel.',
  },
] as const;

/** Labels for the generated dashboard sidebar from the last build action. */
export function dashboardSidebarCopyFromBuild(ctx?: DashboardBuildContext | null): {
  description: string;
  meta: string;
  dataSourceName: string;
} {
  const layoutMeta =
    ctx?.designLayoutFiles && ctx.designLayoutFiles.length > 1
      ? ` · Layouts: ${ctx.designLayoutFiles.length} images`
      : ctx?.designLayoutFileName
        ? ` · Layout: ${ctx.designLayoutFileName}`
        : '';
  const description =
    ctx?.dashboardTitle?.trim() || ctx?.prompt?.trim() || 'Generated data dashboard';
  const meta =
    ctx?.llmProvider && ctx?.llmModel
      ? `${COPILOT_LLM_PROVIDERS.find((p) => p.id === (ctx.llmProvider as CopilotLlmProviderId))?.label ?? ctx.llmProvider} · ${ctx.llmModel}${
          layoutMeta
        }`
      : `XeroCode.ai · Dashboard preview${layoutMeta}`;
  const dataSourceName = ctx?.dataSourceName?.trim() || 'Workspace';
  return { description, meta, dataSourceName };
}

export type StudioUserMenuIntent = 'profile' | 'change-password';

interface AiStudioLandingProps {
  onBuildClick?: (ctx?: DashboardBuildContext) => void;
  onOpenBuilderStudioScreen?: (ctx: {
    prompt: string;
    dataSourceName: string;
    llmProvider: CopilotLlmProviderId;
    llmModel: string;
    llmProviderLabel: string;
    llmModelLabel: string;
    schemaConnectionId?: number;
    connectorType?: 'mysql' | 'sqlserver' | 'postgresql' | 'excel' | 'mongodb';
    selectedTables?: string[];
  }) => void;
  onSignOut?: () => void;
  isDarkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
  forceAiBuilderFocusToken?: number;
  /** When set (e.g. after dashboard user menu), apply the same prompts as the header menu and clear. */
  studioUserMenuIntent?: StudioUserMenuIntent | null;
  onStudioUserMenuIntentHandled?: () => void;
  savedApps?: Array<{ id: string; name: string; prompt?: string; dataSourceName?: string }>;
  onOpenSavedApplication?: (appId: string) => void;
  onDeleteSavedApplication?: (appId: string) => void;
  /** Dashboards persisted locally (shown under main nav → Dashboards). */
  savedDashboards?: Array<{ id: string; name: string }>;
  onOpenSavedDashboard?: (dashboardId: string) => void;
  onDeleteSavedDashboard?: (dashboardId: string) => void;
  /** Agent Studio — persisted via GET/POST/DELETE `/api/agents`. */
  savedStudioAgents?: import('./AgentPlatformScreen').SavedStudioAgentRow[];
  onDeleteSavedStudioAgent?: (agentId: string) => void;
  onAgentStudioSaved?: () => void;
}

export const AiStudioLanding: React.FC<AiStudioLandingProps> = ({
  onBuildClick,
  onOpenBuilderStudioScreen,
  onSignOut,
  isDarkMode,
  onDarkModeChange,
  forceAiBuilderFocusToken = 0,
  studioUserMenuIntent,
  onStudioUserMenuIntentHandled,
  savedApps = [],
  onOpenSavedApplication,
  onDeleteSavedApplication,
  savedDashboards = [],
  onOpenSavedDashboard,
  onDeleteSavedDashboard,
  savedStudioAgents = [],
  onDeleteSavedStudioAgent,
  onAgentStudioSaved,
}) => {
  type ConnectorType = 'mysql' | 'sqlserver' | 'postgresql' | 'mongodb' | 'excel';
  type ConnectionStep =
    | 'idle'
    | 'validating'
    | 'connecting'
    | 'creating_table'
    | 'saving_profile'
    | 'completed'
    | 'failed';

  const [prompt, setPrompt] = useState('');
  const [activeNav, setActiveNav] = useState('ai-builder');
  const [activeCollection, setActiveCollection] = useState('Data');
  const [activeItem, setActiveItem] = useState('CustomerOrder');
  const [navSectionOpen, setNavSectionOpen] = useState({
    data: false,
    dashboards: false,
    api: false,
    analytics: false,
  });
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeConnector, setActiveConnector] = useState<ConnectorType | null>(null);
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [saveConnectionMessage, setSaveConnectionMessage] = useState('');
  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('idle');
  const [savedConnections, setSavedConnections] = useState<
    Array<{
      id: number;
      friendly_name: string;
      host: string;
      port: number;
      database_name: string;
      username: string;
      connector_type?: string;
      is_default?: boolean;
      connection_string?: string;
    }>
  >([]);
  const [builderDatasourceList, setBuilderDatasourceList] = useState<AppDataDatasourceItem[]>([]);
  const [builderDatasourceListBusy, setBuilderDatasourceListBusy] = useState(false);
  const [selectedBuilderDatasourceId, setSelectedBuilderDatasourceId] = useState<string | null>(null);
  const [activeSchemaConnection, setActiveSchemaConnection] = useState<{
    id: number;
    friendly_name: string;
    host: string;
    port: number;
    database_name: string;
    username: string;
    is_default?: boolean;
    connection_string?: string;
    connector_type?: string;
  } | null>(null);
  const [activeSchemaTable, setActiveSchemaTable] = useState('');
  const [schemaTableSearch, setSchemaTableSearch] = useState('');
  const [schemaTableSelection, setSchemaTableSelection] = useState<Set<string>>(() => new Set());
  const [schemaDbTables, setSchemaDbTables] = useState<string[]>([]);
  const [buildPrepareBusy, setBuildPrepareBusy] = useState(false);
  const [isLoadingSchemaTables, setIsLoadingSchemaTables] = useState(false);
  const [schemaTablesError, setSchemaTablesError] = useState<string | null>(null);
  const [schemaTableColumns, setSchemaTableColumns] = useState<
    Array<{ name: string; type: string; columnType?: string; key?: string }>
  >([]);
  const [schemaTableRows, setSchemaTableRows] = useState<string[][]>([]);
  const [schemaTableTotal, setSchemaTableTotal] = useState(0);
  const [schemaTablePage, setSchemaTablePage] = useState(0);
  const [schemaTableRefreshKey, setSchemaTableRefreshKey] = useState(0);
  const [isLoadingTableData, setIsLoadingTableData] = useState(false);
  const [schemaTableDataError, setSchemaTableDataError] = useState<string | null>(null);
  const [schemaMidView, setSchemaMidView] = useState<'table' | 'json' | 'sql'>('table');
  const schemaPageSize = 50;
  const [schemaRightTab, setSchemaRightTab] = useState<'assistant' | 'source' | 'metadata'>('assistant');
  const [copilotLlmProvider, setCopilotLlmProvider] = useState<CopilotLlmProviderId>('google');
  const [copilotModel, setCopilotModel] = useState(
    () => COPILOT_MODELS_BY_PROVIDER.google[0]?.value ?? 'gemini-2.0-flash'
  );
  const [copilotNlPrompt, setCopilotNlPrompt] = useState('');
  const [schemaSourceChatMessages, setSchemaSourceChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string }>
  >([]);
  const [schemaSourceBuildAgentBusy, setSchemaSourceBuildAgentBusy] = useState(false);
  const schemaSourceLlmAbortRef = useRef<AbortController | null>(null);
  const [mainPanelMode, setMainPanelMode] = useState<
    | 'default'
    | 'profile'
    | 'llmConfig'
    | 'guardrailsSettings'
    | 'apiBuilder'
    | 'apiList'
    | 'apiDetail'
    | 'externalApiEditor'
    | 'designStudioLanding'
    | 'dashboardDesignStudio'
    | 'agentStudio'
  >('default');
  const [editingApi, setEditingApi] = useState<SavedApi | null>(null);
  const [detailViewApi, setDetailViewApi] = useState<SavedApi | null>(null);
  const [externalApiEditorId, setExternalApiEditorId] = useState<string | null>(null);
  const [designStudioBootstrap, setDesignStudioBootstrap] = useState<DesignStudioLaunchPayload | null>(null);
  const [designStudioSessionNonce, setDesignStudioSessionNonce] = useState(0);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState(() => {
    let cached: any = null;
    try {
      cached = JSON.parse(localStorage.getItem('active_user_profile') || 'null');
    } catch {
      cached = null;
    }
    return {
      fullName: String(cached?.fullName || ''),
      email: String(cached?.email || ''),
      phone: '',
      company: '',
      roleTitle: '',
      bio: '',
      avatarUrl: String(cached?.avatarUrl || ''),
      slackUrl: String(cached?.slackUrl || ''),
      discordUrl: String(cached?.discordUrl || ''),
      linkedinUrl: String(cached?.linkedinUrl || ''),
      xUrl: String(cached?.xUrl || ''),
    };
  });
  const [userBadge, setUserBadge] = useState(() => {
    let cached: any = null;
    try {
      cached = JSON.parse(localStorage.getItem('active_user_profile') || 'null');
    } catch {
      cached = null;
    }
    return {
      fullName: String(cached?.fullName || 'User'),
      email: String(cached?.email || ''),
      avatarUrl: String(cached?.avatarUrl || ''),
    };
  });
  const [llmConfigLoading, setLlmConfigLoading] = useState(false);
  const [llmConfigSaving, setLlmConfigSaving] = useState(false);
  const [llmConfigMsg, setLlmConfigMsg] = useState<string | null>(null);
  const [llmTestBusyByProvider, setLlmTestBusyByProvider] = useState<Record<CopilotLlmProviderId, boolean>>({
    google: false,
    openai: false,
    anthropic: false,
    deepseek: false,
  });
  const [llmTestMsgByProvider, setLlmTestMsgByProvider] = useState<Record<CopilotLlmProviderId, string>>({
    google: '',
    openai: '',
    anthropic: '',
    deepseek: '',
  });
  const [llmConfig, setLlmConfig] = useState<
    Record<CopilotLlmProviderId, { modelName: string; apiKey: string; baseUrl: string }>
  >({
    google: { modelName: 'gemini-2.0-flash', apiKey: '', baseUrl: '' },
    openai: { modelName: 'gpt-4o', apiKey: '', baseUrl: '' },
    anthropic: { modelName: 'claude-3-5-sonnet-20241022', apiKey: '', baseUrl: '' },
    deepseek: { modelName: 'deepseek-chat', apiKey: '', baseUrl: '' },
  });

  const getAuthHeaders = useCallback(() => {
    try {
      const raw = localStorage.getItem('active_user_profile');
      const profile = raw ? JSON.parse(raw) : null;
      const email = String(profile?.email || '').trim().toLowerCase();
      const fullName = String(profile?.fullName || '').trim();
      if (!email) return {};
      return {
        'x-user-email': email,
        'x-user-name': fullName || email,
      };
    } catch {
      return {};
    }
  }, []);

  const initialsFromName = (value: string) => {
    const parts = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) {
      return 'U';
    }
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  };
  const [copilotDesignAttachments, setCopilotDesignAttachments] = useState<
    Array<{ file: File; previewUrl: string }>
  >([]);
  const copilotDesignInputRef = useRef<HTMLInputElement>(null);
  const [excelExplorerOpen, setExcelExplorerOpen] = useState(false);
  const [excelSheetTables, setExcelSheetTables] = useState<ExcelSheetModel[]>([]);
  const [excelStagingFiles, setExcelStagingFiles] = useState<File[]>([]);
  const [excelWorkbookSchemaName, setExcelWorkbookSchemaName] = useState('');
  const [excelSchemaSaveToast, setExcelSchemaSaveToast] = useState<string | null>(null);
  const [savedExcelSchemas, setSavedExcelSchemas] = useState<SavedExcelSchema[]>(() =>
    readSavedExcelSchemasFromStorage()
  );
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  const tryPersistSavedExcelSchemas = useCallback((updater: (prev: SavedExcelSchema[]) => SavedExcelSchema[]) => {
    setSavedExcelSchemas((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(EXCEL_SAVED_SCHEMAS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        window.alert(
          'Could not store this schema in the browser. The workbook may be too large—try fewer rows or sheets.'
        );
        return prev;
      }
      return next;
    });
  }, []);

  const excelSchemaActive =
    activeConnector === 'excel' && excelExplorerOpen && excelSheetTables.length > 0;
  const schemaExplorerOpen =
    (supportsSchemaExplorer(activeConnector) && !!activeSchemaConnection) || excelSchemaActive;

  const schemaDbTablesKey = schemaDbTables.join('\0');

  useEffect(() => {
    if (schemaDbTables.length === 0) {
      setSchemaTableSelection(new Set());
      return;
    }
    setSchemaTableSelection((prev) => {
      const kept = [...prev].filter((k) => schemaDbTables.includes(k));
      if (kept.length > 0) {
        return new Set(kept);
      }
      return new Set([schemaDbTables[0]]);
    });
  }, [schemaDbTablesKey]);

  const filteredSchemaDbTables = useMemo(() => {
    const q = schemaTableSearch.trim().toLowerCase();
    if (!q) {
      return schemaDbTables;
    }
    return schemaDbTables.filter((tableKey) => {
      const label = excelSchemaActive
        ? excelSheetTables.find((t) => t.key === tableKey)?.label ?? tableKey
        : tableKey;
      return label.toLowerCase().includes(q);
    });
  }, [schemaDbTables, schemaTableSearch, excelSchemaActive, excelSheetTables]);

  const schemaSelectionSig = [...schemaTableSelection].sort().join('\u0001');

  const primarySchemaTableForBinding = useMemo(() => {
    if (schemaTableSelection.size === 0) {
      return activeSchemaTable;
    }
    if (schemaTableSelection.has(activeSchemaTable)) {
      return activeSchemaTable;
    }
    for (const k of schemaDbTables) {
      if (schemaTableSelection.has(k)) {
        return k;
      }
    }
    return activeSchemaTable;
  }, [activeSchemaTable, schemaDbTables, schemaSelectionSig]);

  const schemaContext = useMemo(() => {
    if (excelSchemaActive) {
      const uniqueFiles = [...new Set(excelSheetTables.map((t) => t.fileName))];
      return {
        friendly_name: 'Excel workbooks',
        host: uniqueFiles.length <= 2 ? uniqueFiles.join(', ') : `${uniqueFiles.length} files`,
        port: 0,
        database_name: 'Local',
        username: '',
        connector_type: 'excel',
      };
    }
    return activeSchemaConnection;
  }, [excelSchemaActive, excelSheetTables, activeSchemaConnection]);

  const recommendedDataFunctionalityUseCases = useMemo(() => {
    const tableLabels: string[] = [];
    for (const key of schemaTableSelection) {
      if (excelSchemaActive) {
        const lab = excelSheetTables.find((t) => t.key === key)?.label;
        if (lab) {
          tableLabels.push(lab);
        }
      } else if (schemaDbTables.includes(key)) {
        tableLabels.push(key);
      }
    }
    const columnNames = excelSchemaActive
      ? [
          ...new Set(
            [...schemaTableSelection].flatMap((key) => {
              const s = excelSheetTables.find((t) => t.key === key);
              return (s?.columns ?? []).map((c) => c.name);
            })
          ),
        ]
      : schemaTableColumns.map((c) => c.name);

    const dataSourceHint = schemaContext?.friendly_name
      ? `${schemaContext.friendly_name} ${schemaContext.database_name ?? ''}`.trim()
      : undefined;

    return buildRecommendedDataUseCases({
      connectorType: excelSchemaActive ? 'excel' : activeConnector,
      tableLabels,
      columnNames,
      multiTable: schemaTableSelection.size > 1,
      dataSourceHint,
    });
  }, [
    excelSchemaActive,
    excelSheetTables,
    schemaSelectionSig,
    schemaTableColumns,
    activeConnector,
    schemaContext?.friendly_name,
    schemaContext?.database_name,
    schemaDbTables,
  ]);

  const activeExcelTableLabel = useMemo(() => {
    if (!excelSchemaActive || !activeSchemaTable) {
      return activeSchemaTable || 'Table';
    }
    return excelSheetTables.find((t) => t.key === activeSchemaTable)?.label ?? activeSchemaTable;
  }, [excelSchemaActive, excelSheetTables, activeSchemaTable]);

  const copilotDataSourceSummary = useMemo(() => {
    const base = schemaContext?.friendly_name ?? 'Data source';
    const tableLabel =
      activeExcelTableLabel && activeExcelTableLabel !== activeSchemaTable
        ? activeExcelTableLabel
        : activeSchemaTable || '';
    if (tableLabel) {
      return `${base} · ${tableLabel}`;
    }
    return base;
  }, [schemaContext?.friendly_name, activeExcelTableLabel, activeSchemaTable]);

  const dashboardDataSourceLabel = useMemo(() => {
    if (selectedBuilderDatasourceId != null) {
      const selected = builderDatasourceList.find((item) => item.id === selectedBuilderDatasourceId);
      if (selected) {
        if (selected.connector_type === 'excel' || selected.kind === 'excel') {
          return `${selected.friendly_name} (Excel schema)`;
        }
        const ct = selected.connector_type ?? '';
        const typeLabel =
          ct === 'sqlserver'
            ? 'SQL Server'
            : ct === 'postgresql'
              ? 'PostgreSQL'
              : ct === 'mysql'
                ? 'MySQL'
                : ct === 'mongodb'
                  ? 'MongoDB'
                  : ct || 'Database';
        return `${selected.friendly_name} · ${selected.database_name} (${typeLabel})`;
      }
    }
    if (excelSchemaActive) {
      const uniqueFiles = [...new Set(excelSheetTables.map((t) => t.fileName))];
      if (uniqueFiles.length === 1) {
        return `Excel · ${uniqueFiles[0]}`;
      }
      if (uniqueFiles.length > 1) {
        return `Excel · ${uniqueFiles.length} files`;
      }
      return 'Excel workbooks';
    }
    if (activeSchemaConnection) {
      const ct = activeSchemaConnection.connector_type ?? '';
      const typeLabel =
        ct === 'sqlserver'
          ? 'SQL Server'
          : ct === 'postgresql'
            ? 'PostgreSQL'
            : ct === 'mysql'
              ? 'MySQL'
              : ct === 'mongodb'
                ? 'MongoDB'
                : ct || 'Database';
      return `${activeSchemaConnection.friendly_name} · ${activeSchemaConnection.database_name} (${typeLabel})`;
    }
    if (activeConnector === 'excel') {
      return 'Excel';
    }
    if (activeConnector === 'mysql') {
      return 'MySQL (no connection selected)';
    }
    if (activeConnector === 'sqlserver') {
      return 'SQL Server (no connection selected)';
    }
    if (activeConnector === 'postgresql') {
      return 'PostgreSQL (no connection selected)';
    }
    if (activeConnector === 'mongodb') {
      return 'MongoDB (no connection selected)';
    }
    return 'Workspace';
  }, [
    selectedBuilderDatasourceId,
    builderDatasourceList,
    excelSchemaActive,
    excelSheetTables,
    activeSchemaConnection,
    activeConnector,
  ]);

  /** Matches schema explorer / dashboard build (not the App Builder datasource picker). */
  const schemaWorkspaceDataSourceLabel = useMemo(() => {
    if (excelSchemaActive) {
      if (excelSheetTables.length === 0) {
        return 'Excel — add workbooks in the explorer';
      }
      const uniqueFiles = [...new Set(excelSheetTables.map((t) => t.fileName))];
      if (uniqueFiles.length === 1) {
        return `Excel · ${uniqueFiles[0]}`;
      }
      if (uniqueFiles.length > 1) {
        return `Excel · ${uniqueFiles.length} files`;
      }
      return 'Excel workbooks';
    }
    if (activeSchemaConnection) {
      const ct = activeSchemaConnection.connector_type ?? '';
      const typeLabel =
        ct === 'sqlserver'
          ? 'SQL Server'
          : ct === 'postgresql'
            ? 'PostgreSQL'
            : ct === 'mysql'
              ? 'MySQL'
              : ct === 'mongodb'
                ? 'MongoDB'
                : ct || 'Database';
      return `${activeSchemaConnection.friendly_name} · ${activeSchemaConnection.database_name} (${typeLabel})`;
    }
    if (activeConnector === 'mysql') {
      return 'MySQL — select a saved connection in App Data';
    }
    if (activeConnector === 'sqlserver') {
      return 'SQL Server — select a saved connection in App Data';
    }
    if (activeConnector === 'postgresql') {
      return 'PostgreSQL — select a saved connection in App Data';
    }
    if (activeConnector === 'mongodb') {
      return 'MongoDB — select a saved connection in App Data';
    }
    if (activeConnector === 'excel') {
      return 'Excel — open the Excel explorer';
    }
    return 'No datasource in use for this workspace';
  }, [excelSchemaActive, excelSheetTables, activeSchemaConnection, activeConnector]);

  const schemaExplorerTablesLabel = useMemo(() => {
    if (schemaTableSelection.size > 0) {
      return [...schemaTableSelection]
        .map((key) =>
          excelSchemaActive ? excelSheetTables.find((t) => t.key === key)?.label ?? key : key
        )
        .join(', ');
    }
    if (activeSchemaTable) {
      return excelSchemaActive
        ? excelSheetTables.find((t) => t.key === activeSchemaTable)?.label ?? activeSchemaTable
        : activeSchemaTable;
    }
    return schemaDbTables.slice(0, 15).join(', ') || '—';
  }, [
    schemaTableSelection,
    excelSchemaActive,
    excelSheetTables,
    activeSchemaTable,
    schemaDbTables,
  ]);

  /** Same table keys as `resolveDashboardBuildContext` (selection ∩ loaded schema list), explorer order. */
  const dashboardBuildTableLabels = useMemo(() => {
    const keys = schemaDbTables.filter((k) => schemaTableSelection.has(k));
    return keys.map((key) =>
      excelSchemaActive ? excelSheetTables.find((t) => t.key === key)?.label ?? key : key
    );
  }, [schemaDbTables, schemaSelectionSig, excelSchemaActive, excelSheetTables]);

  const requestSchemaSourceLlmReply = useCallback(
    async (text: string) => {
      if (schemaSourceLlmAbortRef.current) {
        schemaSourceLlmAbortRef.current.abort();
      }
      const controller = new AbortController();
      schemaSourceLlmAbortRef.current = controller;
      const res = await studioFetch(apiUrl('/api/llm/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider: copilotLlmProvider,
          model: copilotModel,
          userMessage: text,
          dataSourceName: dashboardDataSourceLabel,
          basePrompt: copilotNlPrompt.trim() || prompt,
          llmProviderLabel:
            COPILOT_LLM_PROVIDERS.find((p) => p.id === copilotLlmProvider)?.label ?? copilotLlmProvider,
          llmModelLabel:
            COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider].find((m) => m.value === copilotModel)?.label ??
            copilotModel,
        }),
      });
      try {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || 'Unable to generate response.');
        }
        return String(payload?.reply || '').trim() || 'No response generated.';
      } finally {
        schemaSourceLlmAbortRef.current = null;
      }
    },
    [copilotLlmProvider, copilotModel, dashboardDataSourceLabel, copilotNlPrompt, prompt]
  );

  const runSchemaSourceBuildAgent = useCallback(async () => {
    if (schemaSourceBuildAgentBusy) return;
    const userIntent =
      copilotNlPrompt.trim() ||
      prompt.trim() ||
      'Plan analytics and data components from the active datasource and selected tables.';
    const ds = dashboardDataSourceLabel;
    const tablesStr = schemaExplorerTablesLabel;
    setSchemaSourceBuildAgentBusy(true);
    setSchemaSourceChatMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: `Starting data workspace agent with ${
          COPILOT_LLM_PROVIDERS.find((p) => p.id === copilotLlmProvider)?.label ?? copilotLlmProvider
        } · ${
          COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider].find((m) => m.value === copilotModel)?.label ??
          copilotModel
        }`,
      },
    ]);
    try {
      const steps = [
        {
          title: 'Step 1/4 - Data & goal analysis',
          prompt: `You are a data workspace co-pilot. Analyze this request and summarize analytics goals in concise bullet points.\nRequest: ${userIntent}\nDatasource: ${ds}`,
        },
        {
          title: 'Step 2/4 - Metrics & dimensions',
          prompt: `From these tables/sheets: ${tablesStr}, suggest key metrics, dimensions, filters, and joins. Stay concise.\n\nContext: ${userIntent.slice(0, 600)}`,
        },
        {
          title: 'Step 3/4 - Dashboard & component plan',
          prompt:
            'Propose dashboard layout: charts, tables, KPIs, and drill-downs that fit the request. List in compact bullets.',
        },
        {
          title: 'Step 4/4 - Implementation checklist',
          prompt:
            'Give a checklist to implement in XeroCode.ai: data prep, components, validation. Mention acceptance checks.',
        },
      ];

      for (const step of steps) {
        setSchemaSourceChatMessages((prev) => [...prev, { role: 'assistant', text: step.title }]);
        const reply = await requestSchemaSourceLlmReply(step.prompt);
        setSchemaSourceChatMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
      }
      setSchemaSourceChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Data workspace agent run completed.' },
      ]);
    } catch (error) {
      setSchemaSourceChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text:
            error instanceof Error && error.name === 'AbortError'
              ? 'Agent stopped.'
              : error instanceof Error
                ? error.message
                : 'Agent failed.',
        },
      ]);
    } finally {
      setSchemaSourceBuildAgentBusy(false);
    }
  }, [
    schemaSourceBuildAgentBusy,
    copilotNlPrompt,
    prompt,
    dashboardDataSourceLabel,
    schemaExplorerTablesLabel,
    copilotLlmProvider,
    copilotModel,
    requestSchemaSourceLlmReply,
  ]);

  const stopSchemaSourceLlm = useCallback(() => {
    if (schemaSourceLlmAbortRef.current) {
      schemaSourceLlmAbortRef.current.abort();
      schemaSourceLlmAbortRef.current = null;
    }
    setSchemaSourceBuildAgentBusy(false);
  }, []);

  const dashboardSchemaBinding = useMemo((): Partial<DashboardBuildContext> => {
    if (excelSchemaActive && primarySchemaTableForBinding) {
      const sheet = excelSheetTables.find((s) => s.key === primarySchemaTableForBinding);
      if (!sheet?.rows?.length) {
        return {};
      }
      const maxRows = 500;
      return {
        connectorType: 'excel',
        schemaTable: sheet.label,
        excelDashboardSnapshot: {
          columns: sheet.columns.map((c) => ({ name: c.name, type: c.type })),
          rows: sheet.rows.slice(0, maxRows),
          fileLabel: sheet.fileName,
          sheetLabel: sheet.sheetName,
        },
      };
    }
    if (
      activeSchemaConnection?.id &&
      primarySchemaTableForBinding &&
      supportsSchemaExplorer(activeConnector)
    ) {
      return {
        schemaConnectionId: activeSchemaConnection.id,
        connectorType: activeConnector as 'mysql' | 'postgresql' | 'sqlserver',
        schemaTable: primarySchemaTableForBinding,
      };
    }
    return {};
  }, [
    excelSchemaActive,
    primarySchemaTableForBinding,
    excelSheetTables,
    activeSchemaConnection?.id,
    activeConnector,
  ]);

  const resolveDashboardBuildContext = useCallback(async (): Promise<Partial<DashboardBuildContext>> => {
    const selected = [...schemaTableSelection].filter((k) => schemaDbTables.includes(k));
    if (selected.length === 0) {
      return {};
    }

    if (excelSchemaActive) {
      const sheets = selected
        .map((k) => excelSheetTables.find((t) => t.key === k))
        .filter((x): x is ExcelSheetModel => !!x && (x.rows?.length ?? 0) > 0);
      if (sheets.length === 0) {
        return {};
      }
      if (sheets.length === 1) {
        const s = sheets[0];
        const maxRows = 500;
        return {
          connectorType: 'excel',
          schemaTable: s.label,
          excelDashboardSnapshot: {
            columns: s.columns.map((c) => ({ name: c.name, type: c.type })),
            rows: s.rows.slice(0, maxRows),
            fileLabel: s.fileName,
            sheetLabel: s.sheetName,
          },
        };
      }
      const merged = mergeTablesForDashboard(
        sheets.map((s) => ({
          label: s.label,
          columns: s.columns,
          rows: s.rows,
        })),
        { maxRowsPerTable: 400, maxTotalRows: 2500 }
      );
      const uniqueFiles = [...new Set(sheets.map((s) => s.fileName))];
      return {
        connectorType: 'excel',
        schemaTable: sheets.map((s) => s.sheetName || s.label).join(' + '),
        excelDashboardSnapshot: {
          columns: merged.columns,
          rows: merged.rows.slice(0, 500),
          fileLabel: uniqueFiles.join(', ') || 'Excel',
          sheetLabel: 'Multiple sheets',
        },
      };
    }

    if (
      activeSchemaConnection?.id &&
      supportsSchemaExplorer(activeConnector) &&
      selected.length > 0
    ) {
      if (selected.length === 1) {
        return {
          schemaConnectionId: activeSchemaConnection.id,
          connectorType: activeConnector as 'mysql' | 'postgresql' | 'sqlserver',
          schemaTable: selected[0],
        };
      }
      const fetched = await Promise.all(
        selected.map(async (table) => {
          const qs = new URLSearchParams({ table, limit: '500', offset: '0' });
          const res = await studioFetch(apiUrl(`/api/connections/${activeSchemaConnection.id}/table-data?${qs}`));
          const data = await readApiJson<{
            columns?: Array<{ name: string; type?: string }>;
            rows?: string[][];
            message?: string;
          }>(res);
          if (!res.ok) {
            throw new Error(
              typeof data?.message === 'string'
                ? `${table}: ${data.message}`
                : `Could not load ${table} (HTTP ${res.status})`
            );
          }
          return {
            label: table,
            columns: (data.columns ?? []).map((c) => ({ name: c.name, type: c.type })),
            rows: data.rows ?? [],
          };
        })
      );
      const merged = mergeTablesForDashboard(fetched, { maxRowsPerTable: 400, maxTotalRows: 2500 });
      return {
        schemaConnectionId: activeSchemaConnection.id,
        connectorType: activeConnector as 'mysql' | 'postgresql' | 'sqlserver',
        schemaTable: selected.join(' + '),
        embeddedDashboardData: {
          columns: merged.columns,
          rows: merged.rows,
          previewLabel: selected.join(', '),
        },
      };
    }

    return {};
  }, [
    excelSchemaActive,
    excelSheetTables,
    schemaSelectionSig,
    schemaDbTablesKey,
    activeSchemaConnection,
    activeConnector,
  ]);

  const [showSavedConnections, setShowSavedConnections] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<number | null>(null);
  const [dbForm, setDbForm] = useState({
    friendlyName: '',
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
    schemaHint: '',
  });

  const dbConnectionPreview = useMemo(() => {
    if (!activeConnector || activeConnector === 'excel') {
      return '';
    }
    const portDefaults: Record<Exclude<ConnectorType, 'excel'>, string> = {
      mysql: '3306',
      sqlserver: '1433',
      postgresql: '5432',
      mongodb: '27017',
    };
    const hostRaw = (dbForm.host || '').trim() || 'your-host';
    const portRaw = String(dbForm.port || portDefaults[activeConnector]).trim();
    const portNum = Number(portRaw);
    const port = Number.isFinite(portNum) && portNum > 0 ? portNum : portRaw;
    const user = encodeURIComponent((dbForm.username || 'username').trim() || 'username');
    const db = encodeURIComponent((dbForm.database || 'database').trim() || 'database');

    if (activeConnector === 'mysql') {
      return `mysql://${user}:***@${hostRaw}:${port}/${db}`;
    }
    if (activeConnector === 'postgresql') {
      return `postgresql://${user}:***@${hostRaw}:${port}/${db}`;
    }
    if (activeConnector === 'sqlserver') {
      return `sqlserver://${user}:***@${hostRaw}:${port};database=${db}`;
    }
    if (activeConnector === 'mongodb') {
      if (/^mongodb(\+srv)?:\/\//i.test(hostRaw)) {
        return hostRaw.replace(/\/\/([^:]+):[^@]+@/, '//***:***@');
      }
      return `mongodb://${user}:***@${hostRaw}:${port}/${db}`;
    }
    return '';
  }, [activeConnector, dbForm.host, dbForm.port, dbForm.database, dbForm.username]);

  const schemaMetadata = useMemo(() => {
    const colKeyBadge = (k?: string) => {
      if (k === 'PRI') {
        return 'PRIMARY KEY';
      }
      if (k === 'UNI') {
        return 'UNIQUE';
      }
      if (k === 'MUL') {
        return 'INDEXED';
      }
      return 'COLUMN';
    };

    if (schemaTableColumns.length > 0) {
      return schemaTableColumns.map((c) => ({
        field: c.name,
        type: c.columnType || c.type,
        badge: colKeyBadge(c.key),
      }));
    }

    const metaByTable: Record<string, Array<{ field: string; type: string; badge: string }>> = {
      Orders: [
        { field: 'id', type: 'BIGINT', badge: 'PRIMARY KEY' },
        { field: 'customer_id', type: 'INT', badge: 'INDEXED' },
        { field: 'order_date', type: 'DATE', badge: 'INDEXED' },
        { field: 'status', type: 'VARCHAR(32)', badge: 'ENUM-LIKE' },
        { field: 'total_amount', type: 'DECIMAL(10,2)', badge: 'MONETARY' },
        { field: 'payment_method', type: 'VARCHAR(24)', badge: 'STRING' },
      ],
      OrderItems: [
        { field: 'id', type: 'BIGINT', badge: 'PRIMARY KEY' },
        { field: 'order_id', type: 'BIGINT', badge: 'FOREIGN KEY' },
        { field: 'sku', type: 'VARCHAR(32)', badge: 'INDEXED' },
        { field: 'quantity', type: 'INT', badge: 'NUMERIC' },
        { field: 'unit_price', type: 'DECIMAL(10,2)', badge: 'MONETARY' },
      ],
      Products: [
        { field: 'id', type: 'BIGINT', badge: 'PRIMARY KEY' },
        { field: 'product_name', type: 'VARCHAR(120)', badge: 'STRING' },
        { field: 'category', type: 'VARCHAR(64)', badge: 'INDEXED' },
        { field: 'price', type: 'DECIMAL(10,2)', badge: 'MONETARY' },
        { field: 'stock', type: 'INT', badge: 'NUMERIC' },
      ],
      Inventory: [
        { field: 'id', type: 'BIGINT', badge: 'PRIMARY KEY' },
        { field: 'sku', type: 'VARCHAR(32)', badge: 'INDEXED' },
        { field: 'warehouse', type: 'VARCHAR(24)', badge: 'STRING' },
        { field: 'available', type: 'INT', badge: 'NUMERIC' },
        { field: 'reserved', type: 'INT', badge: 'NUMERIC' },
      ],
    };
  return (
      metaByTable[activeSchemaTable] || [
        { field: activeSchemaTable || 'table', type: 'Connect and select a table to inspect columns', badge: 'SCHEMA' },
      ]
    );
  }, [activeSchemaTable, schemaTableColumns]);

  const schemaPreviewSql = useMemo(() => {
    if (!activeSchemaTable) {
      return '';
    }
    const off = schemaTablePage * schemaPageSize;
    const t = activeSchemaTable.replace(/`/g, '');
    const bracket = (part: string) => `[${part.replace(/\]/g, '')}]`;
    const quotePg = (part: string) => `"${part.replace(/"/g, '""')}"`;
    if (activeConnector === 'sqlserver') {
      const dot = t.indexOf('.');
      if (dot >= 0) {
        const sch = t.slice(0, dot);
        const tbl = t.slice(dot + 1);
        return `SELECT * FROM ${bracket(sch)}.${bracket(tbl)} ORDER BY (SELECT NULL) OFFSET ${off} ROWS FETCH NEXT ${schemaPageSize} ROWS ONLY;`;
      }
      return `SELECT * FROM [dbo].${bracket(t)} ORDER BY (SELECT NULL) OFFSET ${off} ROWS FETCH NEXT ${schemaPageSize} ROWS ONLY;`;
    }
    if (activeConnector === 'postgresql') {
      const dot = t.indexOf('.');
      if (dot >= 0) {
        return `SELECT * FROM ${quotePg(t.slice(0, dot))}.${quotePg(t.slice(dot + 1))} LIMIT ${schemaPageSize} OFFSET ${off};`;
      }
      return `SELECT * FROM ${quotePg('public')}.${quotePg(t)} LIMIT ${schemaPageSize} OFFSET ${off};`;
    }
    if (activeConnector === 'excel') {
      const sheet = excelSheetTables.find((s) => s.key === activeSchemaTable);
      const safe = (sheet?.sheetName || activeSchemaTable).replace(/"/g, '""');
      return `SELECT * FROM "${safe}" LIMIT ${schemaPageSize} OFFSET ${off};`;
    }
    return `SELECT * FROM \`${t}\` LIMIT ${schemaPageSize} OFFSET ${off};`;
  }, [
    activeConnector,
    activeSchemaTable,
    schemaPageSize,
    schemaTablePage,
    excelSheetTables,
  ]);

  useEffect(() => {
    const list = COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider];
    setCopilotModel(list[0]?.value ?? '');
  }, [copilotLlmProvider]);

  useEffect(() => {
    return () => {
      for (const a of copilotDesignAttachments) {
        URL.revokeObjectURL(a.previewUrl);
      }
    };
  }, [copilotDesignAttachments]);

  useEffect(() => {
    if (activeConnector === 'excel' && excelExplorerOpen && activeSchemaTable) {
      const sheet = excelSheetTables.find((s) => s.key === activeSchemaTable);
      if (!sheet) {
        setSchemaTableColumns([]);
        setSchemaTableRows([]);
        setSchemaTableTotal(0);
        setSchemaTableDataError(null);
        setIsLoadingTableData(false);
        return;
      }
      const total = sheet.rows.length;
      const offset = schemaTablePage * schemaPageSize;
      setSchemaTableColumns(sheet.columns);
      setSchemaTableRows(sheet.rows.slice(offset, offset + schemaPageSize));
      setSchemaTableTotal(total);
      setSchemaTableDataError(null);
      setIsLoadingTableData(false);
      return;
    }

    if (!activeSchemaConnection?.id || !activeSchemaTable) {
      setSchemaTableColumns([]);
      setSchemaTableRows([]);
      setSchemaTableTotal(0);
      setSchemaTableDataError(null);
      setIsLoadingTableData(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoadingTableData(true);
      setSchemaTableDataError(null);
      try {
        const offset = schemaTablePage * schemaPageSize;
        const qs = new URLSearchParams({
          table: activeSchemaTable,
          limit: String(schemaPageSize),
          offset: String(offset),
        });
        const response = await studioFetch(apiUrl(`/api/connections/${activeSchemaConnection.id}/table-data?${qs}`));
        const data = await readApiJson<{
          ok?: boolean;
          message?: string;
          columns?: Array<{ name: string; type: string; columnType?: string; key?: string }>;
          rows?: string[][];
          total?: number;
        }>(response);
        if (cancelled) {
          return;
        }
        if (!response.ok || !data?.ok) {
          throw new Error(typeof data?.message === 'string' ? data.message : 'Failed to load table data.');
        }
        setSchemaTableColumns(Array.isArray(data.columns) ? data.columns : []);
        setSchemaTableRows(Array.isArray(data.rows) ? data.rows : []);
        setSchemaTableTotal(Number(data.total) || 0);
      } catch (e) {
        if (!cancelled) {
          setSchemaTableColumns([]);
          setSchemaTableRows([]);
          setSchemaTableTotal(0);
          setSchemaTableDataError(e instanceof Error ? e.message : 'Failed to load table data.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTableData(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    activeConnector,
    excelExplorerOpen,
    excelSheetTables,
    activeSchemaConnection?.id,
    activeSchemaTable,
    schemaTablePage,
    schemaTableRefreshKey,
    schemaPageSize,
  ]);

  const handleExcelFilesSelected = async (fileList: FileList | null) => {
    if (!fileList?.length) {
      return;
    }
    const maxBytes = 10 * 1024 * 1024;
    const picked = Array.from(fileList).filter(
      (f) => f.size <= maxBytes && /\.(xlsx|xls|csv)$/i.test(f.name)
    );
    if (!picked.length) {
      setSchemaTablesError('Add at least one .xlsx, .xls, or .csv file (max 10MB each).');
      return;
    }
    setIsLoadingSchemaTables(true);
    setSchemaTablesError(null);
    try {
      const tables = await parseExcelFilesToTables(picked);
      if (!tables.length) {
        setSchemaTablesError('No sheets with data found in the selected files.');
        setExcelExplorerOpen(false);
        setExcelSheetTables([]);
        setExcelStagingFiles([]);
        setSchemaDbTables([]);
        return;
      }
      setExcelStagingFiles(picked);
      setExcelSheetTables(tables);
      setSchemaDbTables(tables.map((t) => t.key));
      setActiveSchemaTable(tables[0].key);
      setExcelExplorerOpen(true);
      setExcelWorkbookSchemaName(
        [...new Set(picked.map((f) => f.name))].join(', ') || 'Excel workbook schema'
      );
      setSchemaTablePage(0);
      setSchemaMidView('table');
      setSchemaRightTab('assistant');
    } catch (e) {
      setSchemaTablesError(e instanceof Error ? e.message : 'Could not read spreadsheet files.');
      setExcelExplorerOpen(false);
      setExcelSheetTables([]);
      setExcelStagingFiles([]);
      setSchemaDbTables([]);
    } finally {
      setIsLoadingSchemaTables(false);
    }
  };

  const handleCopilotDesignFiles = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!picked.length) {
      return;
    }
    setCopilotDesignAttachments((prev) => {
      const next = [...prev];
      for (const f of picked) {
        next.push({ file: f, previewUrl: URL.createObjectURL(f) });
      }
      return next;
    });
  };

  const removeCopilotDesignAttachment = (index: number) => {
    setCopilotDesignAttachments((prev) => {
      const target = prev[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read design image.'));
      reader.readAsDataURL(file);
    });

  const assembleCopilotDashboardContext = useCallback(async (): Promise<DashboardBuildContext | null> => {
    const binding = await resolveDashboardBuildContext();
    if (
      !binding.schemaTable &&
      !binding.excelDashboardSnapshot &&
      !binding.embeddedDashboardData
    ) {
      return null;
    }
    const next = copilotNlPrompt.trim();
    const designLayoutFiles = await Promise.all(
      copilotDesignAttachments.map(async (a) => ({
        name: a.file.name,
        dataUrl: await readFileAsDataUrl(a.file),
      }))
    );
    return {
      prompt: next || prompt.trim() || undefined,
      llmProvider: copilotLlmProvider,
      llmModel: copilotModel,
      dataSourceName: dashboardDataSourceLabel,
      designLayoutFileName: designLayoutFiles[0]?.name,
      designLayoutDataUrl: designLayoutFiles[0]?.dataUrl,
      designLayoutFiles,
      ...binding,
    };
  }, [
    resolveDashboardBuildContext,
    copilotNlPrompt,
    copilotDesignAttachments,
    prompt,
    copilotLlmProvider,
    copilotModel,
    dashboardDataSourceLabel,
  ]);

  const saveCurrentExcelAsSchema = useCallback(() => {
    if (!excelSchemaActive || excelSheetTables.length === 0) {
      return;
    }
    const name = excelWorkbookSchemaName.trim();
    if (!name) {
      window.alert('Enter a name for this schema.');
      return;
    }
    const nameKey = name.toLowerCase();
    if (readSavedExcelSchemasFromStorage().some((s) => s.name.trim().toLowerCase() === nameKey)) {
      window.alert('A saved schema with this name already exists. Use a different name.');
      return;
    }
    const entry: SavedExcelSchema = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      savedAt: Date.now(),
      tables: JSON.parse(JSON.stringify(excelSheetTables)) as ExcelSheetModel[],
    };
    tryPersistSavedExcelSchemas((prev) => {
      if (prev.some((s) => s.name.trim().toLowerCase() === nameKey)) {
        return prev;
      }
      return [entry, ...prev].slice(0, 25);
    });
    setExcelSchemaSaveToast('Schema saved to library.');
    window.setTimeout(() => setExcelSchemaSaveToast(null), 2400);
  }, [excelSchemaActive, excelSheetTables, excelWorkbookSchemaName, tryPersistSavedExcelSchemas]);

  const loadSavedExcelSchema = useCallback(
    (saved: SavedExcelSchema) => {
      setMainPanelMode('default');
      setActiveConnector('excel');
      setExcelWorkbookSchemaName(saved.name);
      setExcelStagingFiles([]);
      setExcelSheetTables(JSON.parse(JSON.stringify(saved.tables)) as ExcelSheetModel[]);
      setSchemaDbTables(saved.tables.map((t) => t.key));
      setActiveSchemaTable(saved.tables[0]?.key ?? '');
      setExcelExplorerOpen(true);
      setSchemaTablePage(0);
      setSchemaMidView('table');
      setSchemaTablesError(null);
      setSchemaRightTab('assistant');
    },
    []
  );

  const deleteSavedExcelSchema = useCallback(
    (id: string) => {
      tryPersistSavedExcelSchemas((prev) => prev.filter((s) => s.id !== id));
    },
    [tryPersistSavedExcelSchemas]
  );

  const refreshExcelTables = async () => {
    if (!excelStagingFiles.length) {
      return;
    }
    setIsLoadingSchemaTables(true);
    setSchemaTablesError(null);
    try {
      const tables = await parseExcelFilesToTables(excelStagingFiles);
      setExcelSheetTables(tables);
      setSchemaDbTables(tables.map((t) => t.key));
      setActiveSchemaTable((prev) =>
        tables.some((t) => t.key === prev) ? prev : tables[0]?.key ?? ''
      );
    } catch (e) {
      setSchemaTablesError(e instanceof Error ? e.message : 'Could not refresh workbooks.');
    } finally {
      setIsLoadingSchemaTables(false);
    }
  };

  const loadConnectionTables = async (connectionId: number) => {
    setIsLoadingSchemaTables(true);
    setSchemaTablesError(null);
    try {
      const response = await studioFetch(apiUrl(`/api/connections/${connectionId}/tables`));
      const data = await readApiJson<{ ok?: boolean; message?: string; tables?: string[] }>(response);
      if (response.ok && data?.ok && Array.isArray(data.tables)) {
        setSchemaDbTables(data.tables);
        setActiveSchemaTable((prev) => {
          if (data.tables.length === 0) {
            return '';
          }
          return data.tables.includes(prev) ? prev : data.tables[0];
        });
      } else {
        setSchemaDbTables([]);
        setActiveSchemaTable('');
        setSchemaTablesError(
          typeof data?.message === 'string' ? data.message : 'Could not load tables from this connection.'
        );
      }
    } catch {
      setSchemaDbTables([]);
      setActiveSchemaTable('');
      setSchemaTablesError(
        'Could not reach the API. Start it with npm run dev:api (port 8787), restart npm run dev so the proxy applies, then refresh.'
      );
    } finally {
      setIsLoadingSchemaTables(false);
    }
  };

  const toggleSchemaTableSelected = (tableKey: string) => {
    setSchemaTableSelection((prev) => {
      const next = new Set(prev);
      if (next.has(tableKey)) {
        next.delete(tableKey);
        if (activeSchemaTable === tableKey) {
          const first = [...next][0];
          setActiveSchemaTable(first ?? tableKey);
        }
      } else {
        next.add(tableKey);
      }
      return next;
    });
  };

  const selectAllFilteredSchemaTables = () => {
    if (filteredSchemaDbTables.length === 0) {
      return;
    }
    setSchemaTableSelection(new Set(filteredSchemaDbTables));
    if (!filteredSchemaDbTables.includes(activeSchemaTable)) {
      setActiveSchemaTable(filteredSchemaDbTables[0]);
    }
    setSchemaTablePage(0);
  };

  const clearSchemaTableSelection = () => {
    setSchemaTableSelection(new Set());
  };

  const handleBuild = async () => {
    if (!prompt.trim()) {
      return;
    }
    setBuildPrepareBusy(true);
    try {
      const binding = await resolveDashboardBuildContext();
      if (
        !binding.schemaTable &&
        !binding.excelDashboardSnapshot &&
        !binding.embeddedDashboardData
      ) {
        window.alert('Select at least one table or sheet for the dashboard.');
        return;
      }
      onBuildClick?.({
        prompt: prompt.trim(),
        dataSourceName: dashboardDataSourceLabel,
        ...binding,
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not load selected tables.');
    } finally {
      setBuildPrepareBusy(false);
    }
  };

  const handleBuildInStudio = async () => {
    const selected = builderDatasourceList.find((item) => item.id === selectedBuilderDatasourceId);
    if (!selected) {
      window.alert('Select a datasource first.');
      return;
    }
    if (selected.connector_type === 'excel') {
      window.alert('Excel schemas are already supported via the main Build dashboard flow. App Builder currently requires a live database connection (MySQL, SQL Server, PostgreSQL, or MongoDB).');
      return;
    }
    const providerLabel =
      COPILOT_LLM_PROVIDERS.find((p) => p.id === copilotLlmProvider)?.label ?? copilotLlmProvider;
    const modelLabel =
      COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider].find((m) => m.value === copilotModel)?.label ??
      copilotModel;
    const selectedTables =
      activeSchemaConnection &&
      selected.kind === 'db' &&
      selected.id === `db:${activeSchemaConnection.id}`
        ? (schemaTableSelection.size > 0
            ? [...schemaTableSelection].filter((k) => schemaDbTables.includes(k))
            : [...schemaDbTables]
          ).slice(0, 25)
        : [];
    onOpenBuilderStudioScreen?.({
      prompt: prompt.trim(),
      dataSourceName: `${selected.friendly_name} · ${selected.database_name}`,
      llmProvider: copilotLlmProvider,
      llmModel: copilotModel,
      llmProviderLabel: providerLabel,
      llmModelLabel: modelLabel,
      schemaConnectionId:
        selected.kind === 'db' && selected.id.startsWith('db:')
          ? Number(selected.id.slice(3))
          : undefined,
      connectorType:
        selected.connector_type === 'sqlserver' || selected.connector_type === 'postgresql'
          ? selected.connector_type
          : selected.connector_type === 'mongodb'
            ? 'mongodb'
            : 'mysql',
      selectedTables,
    });
  };

  const selectSavedDatasource = (connection: {
    id: number;
    friendly_name: string;
    host: string;
    port: number;
    database_name: string;
    username: string;
    connector_type?: string;
  }) => {
    const normalized =
      connection.connector_type === 'sqlserver' ||
      connection.connector_type === 'postgresql' ||
      connection.connector_type === 'mongodb' ||
      connection.connector_type === 'excel'
        ? connection.connector_type
        : 'mysql';
    setActiveConnector(normalized);
    if (!supportsSchemaExplorer(normalized)) {
      return;
    }
    setActiveSchemaConnection(connection);
    setActiveSchemaTable('');
    setSchemaDbTables([]);
    setSchemaTablesError(null);
    setSchemaTablePage(0);
    setSchemaTableColumns([]);
    setSchemaTableRows([]);
    setSchemaTableTotal(0);
    setSchemaTableDataError(null);
    setSchemaMidView('table');
    loadConnectionTables(connection.id);
    setActiveCollection('Data');
    setActiveItem(connection.friendly_name || connection.database_name || 'Schema');
  };

  const handleLaunchDesignStudioFromLanding = useCallback((p: DesignStudioLaunchPayload) => {
    setPrompt(p.workspacePrompt);
    setCopilotLlmProvider(p.llmProvider);
    setCopilotModel(p.llmModel);
    setDesignStudioBootstrap(p);
    setDesignStudioSessionNonce((n) => n + 1);
    setMainPanelMode('dashboardDesignStudio');
  }, []);

  const handleSidebarClick = (key: string, collection: string, item: string) => {
    setMainPanelMode('default');
    setActiveNav(key);
    setActiveCollection(collection);
    setActiveItem(item);

    if (key === 'ai-builder') {
      // Ensure clicking Build Your APP always returns to builder canvas from connector/schema screens.
      setActiveConnector(null);
      setActiveSchemaConnection(null);
      setExcelExplorerOpen(false);
      setShowSavedConnections(false);
      return;
    }

    if (key === 'build-your-agent') {
      setMainPanelMode('agentStudio');
      setActiveConnector(null);
      setActiveSchemaConnection(null);
      setExcelExplorerOpen(false);
      setShowSavedConnections(false);
      return;
    }

    if (key === 'llm-config') {
      setMainPanelMode('llmConfig');
      return;
    }

    if (key === 'sales-management') {
      void (async () => {
        setBuildPrepareBusy(true);
        try {
          const binding = await resolveDashboardBuildContext();
          onBuildClick?.({
            prompt:
              'Sales Management — revenue tracking, pipeline stages, and sales team leaderboards.',
            dataSourceName: 'Sales Management (saved app)',
            ...binding,
          });
        } catch {
          onBuildClick?.({
            prompt:
              'Sales Management — revenue tracking, pipeline stages, and sales team leaderboards.',
            dataSourceName: 'Sales Management (saved app)',
            ...dashboardSchemaBinding,
          });
        } finally {
          setBuildPrepareBusy(false);
        }
      })();
      return;
    }

    if (key === 'build-api') {
      setEditingApi(null);
      setMainPanelMode('apiBuilder');
      setPrompt('Create REST APIs for customer orders, products, and sales performance metrics.');
      return;
    }

    if (key === 'api-list') {
      setDetailViewApi(null);
      setExternalApiEditorId(null);
      setMainPanelMode('apiList');
      return;
    }

    if (key === 'design-studio') {
      setMainPanelMode('designStudioLanding');
      return;
    }

    if (key === 'insights') {
      setPrompt('Generate analytics insights and KPI summary cards for this workspace.');
      return;
    }

    if (key === 'automations') {
      setPrompt('Set up automations for lead follow-up, low inventory alerts, and weekly reports.');
    }
  };

  const handleUserMenuAction = (action: 'profile' | 'change-password' | 'feedback') => {
    if (action === 'profile') {
      setMainPanelMode('profile');
      setIsUserMenuOpen(false);
      return;
    }
    if (action === 'change-password') {
      setPrompt('Open change password flow with current password and new password fields.');
    }
    if (action === 'feedback') {
      window.open('mailto:feedback@dashx.ai?subject=XeroCode.ai%20Feedback', '_blank');
    }
    setIsUserMenuOpen(false);
  };

  useEffect(() => {
    setActiveNav('ai-builder');
    setActiveCollection('Data');
  }, [forceAiBuilderFocusToken]);

  useEffect(() => {
    if (!studioUserMenuIntent) {
      return;
    }
    if (studioUserMenuIntent === 'profile') {
      setMainPanelMode('profile');
    }
    if (studioUserMenuIntent === 'change-password') {
      setPrompt('Open change password flow with current password and new password fields.');
    }
    onStudioUserMenuIntentHandled?.();
  }, [studioUserMenuIntent, onStudioUserMenuIntentHandled]);

  useEffect(() => {
    if (mainPanelMode !== 'profile') {
      return;
    }
    let cancelled = false;
    const loadProfile = async () => {
      try {
        setProfileLoading(true);
        setProfileError(null);
        const res = await studioFetch(apiUrl('/api/profile'));
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || payload?.error || 'Unable to load profile');
        }
        if (cancelled) {
          return;
        }
        const profile = payload?.profile ?? payload ?? {};
        setProfileDraft({
          fullName: profile?.fullName ?? '',
          email: profile?.email ?? '',
          phone: profile?.phone ?? '',
          company: profile?.company ?? '',
          roleTitle: profile?.roleTitle ?? '',
          bio: profile?.bio ?? '',
          avatarUrl: profile?.avatarUrl ?? '',
          slackUrl: profile?.slackUrl ?? '',
          discordUrl: profile?.discordUrl ?? '',
          linkedinUrl: profile?.linkedinUrl ?? '',
          xUrl: profile?.xUrl ?? '',
        });
        setUserBadge({
          fullName: profile?.fullName ?? 'User',
          email: profile?.email ?? '',
          avatarUrl: profile?.avatarUrl ?? '',
        });
        localStorage.setItem(
          'active_user_profile',
          JSON.stringify({
            fullName: profile?.fullName ?? 'User',
            email: profile?.email ?? '',
            avatarUrl: profile?.avatarUrl ?? '',
            slackUrl: profile?.slackUrl ?? '',
            discordUrl: profile?.discordUrl ?? '',
            linkedinUrl: profile?.linkedinUrl ?? '',
            xUrl: profile?.xUrl ?? '',
          })
        );
      } catch (e) {
        if (!cancelled) {
          setProfileError(e instanceof Error ? e.message : 'Unable to load profile');
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [mainPanelMode]);

  useEffect(() => {
    if (mainPanelMode !== 'llmConfig') {
      return;
    }
    void loadLlmConfig();
  }, [mainPanelMode]);

  const saveProfile = async () => {
    try {
      setProfileSaving(true);
      setProfileError(null);
      setProfileMsg(null);
      const res = await studioFetch(apiUrl('/api/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileDraft),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error || 'Unable to save profile');
      }
      setProfileMsg('Profile updated successfully.');
      setUserBadge({
        fullName: profileDraft.fullName || 'User',
        email: profileDraft.email,
        avatarUrl: profileDraft.avatarUrl,
      });
      localStorage.setItem(
        'active_user_profile',
        JSON.stringify({
          fullName: profileDraft.fullName || 'User',
          email: profileDraft.email || '',
          avatarUrl: profileDraft.avatarUrl || '',
          slackUrl: profileDraft.slackUrl || '',
          discordUrl: profileDraft.discordUrl || '',
          linkedinUrl: profileDraft.linkedinUrl || '',
          xUrl: profileDraft.xUrl || '',
        })
      );
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Unable to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const loadLlmConfig = async () => {
    try {
      setLlmConfigLoading(true);
      setLlmConfigMsg(null);
      const res = await studioFetch(apiUrl('/api/llm-config'));
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Unable to load LLM configuration');
      }
      const next = { ...llmConfig };
      const rows = Array.isArray(payload?.configs) ? payload.configs : [];
      rows.forEach((row: any) => {
        const provider = String(row?.provider || '') as CopilotLlmProviderId;
        if (!next[provider]) return;
        next[provider] = {
          modelName: String(row?.model_name || next[provider].modelName),
          apiKey: String(row?.api_key || ''),
          baseUrl: String(row?.base_url || ''),
        };
      });
      setLlmConfig(next);
    } catch (e) {
      setLlmConfigMsg(e instanceof Error ? e.message : 'Unable to load LLM configuration');
    } finally {
      setLlmConfigLoading(false);
    }
  };

  const saveLlmConfig = async () => {
    try {
      setLlmConfigSaving(true);
      setLlmConfigMsg(null);
      const providers: CopilotLlmProviderId[] = ['google', 'openai', 'anthropic', 'deepseek'];
      for (const provider of providers) {
        const conf = llmConfig[provider];
        const res = await studioFetch(apiUrl('/api/llm-config'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            modelName: conf.modelName,
            apiKey: conf.apiKey,
            baseUrl: conf.baseUrl,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || `Unable to save ${provider} config`);
        }
      }
      setLlmConfigMsg('LLM configuration saved.');
    } catch (e) {
      setLlmConfigMsg(e instanceof Error ? e.message : 'Unable to save LLM configuration');
    } finally {
      setLlmConfigSaving(false);
    }
  };

  const testLlmConfigConnection = async (provider: CopilotLlmProviderId) => {
    try {
      setLlmTestBusyByProvider((prev) => ({ ...prev, [provider]: true }));
      setLlmTestMsgByProvider((prev) => ({ ...prev, [provider]: '' }));
      const conf = llmConfig[provider];
      const res = await studioFetch(apiUrl('/api/llm-config/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: conf.modelName,
          apiKey: conf.apiKey,
          baseUrl: conf.baseUrl,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Connection test failed.');
      }
      setLlmTestMsgByProvider((prev) => ({ ...prev, [provider]: payload?.message || 'Connection successful.' }));
    } catch (e) {
      setLlmTestMsgByProvider((prev) => ({
        ...prev,
        [provider]: e instanceof Error ? e.message : 'Connection test failed.',
      }));
    } finally {
      setLlmTestBusyByProvider((prev) => ({ ...prev, [provider]: false }));
    }
  };
  const suggestedInquiries = [
    {
      title: 'Sales Management',
      description:
        'Build me a Sales Management Application with revenue tracking pipeline stages, and sales team leaderboards.',
      icon: Gauge,
    },
    {
      title: 'Customer Management',
      description:
        'Create a Customer Management Application (CRM) for tracking interactions, customer profiles, and satisfaction metrics.',
      icon: CircleUserRound,
    },
    {
      title: 'Inventory Management',
      description:
        'Design an Inventory Management system to monitor stock levels, supplier orders, and low-stock alerts.',
      icon: Database,
    },
    {
      title: 'Customer Loyalty',
      description:
        'Build a Customer Loyalty Program dashboard for managing points, rewards, and member engagement tiers.',
      icon: Sparkles,
    },
    {
      title: 'Employee Performance',
      description:
        'Create an Employee Performance dashboard with goal tracking, KPIs, and monthly performance reviews.',
      icon: WandSparkles,
    },
    {
      title: 'Fleet Tracking',
      description:
        'Design a Fleet Tracking System for vehicle maintenance logs, dispatch status, and route optimization metrics.',
      icon: Link2,
    },
  ];

  const connectorMeta: Record<ConnectorType, { title: string; fields: string[] }> = {
    mysql: {
      title: 'MySQL Connector',
      fields: ['Host', 'Port', 'Database Name', 'Username', 'Password', 'SSL Mode'],
    },
    sqlserver: {
      title: 'SQL Server Connector',
      fields: ['Server', 'Port', 'Database Name', 'Username', 'Password', 'Encrypt'],
    },
    postgresql: {
      title: 'PostgreSQL Connector',
      fields: ['Host', 'Port', 'Database Name', 'Schema', 'Username', 'Password'],
    },
    mongodb: {
      title: 'MongoDB Connector',
      fields: ['Connection URI', 'Database Name', 'Collection Name', 'Auth Source'],
    },
    excel: {
      title: 'Excel Connector',
      fields: ['File Path / URL', 'Worksheet Name', 'Header Row Index', 'Date Format'],
    },
  };

  const dbConnectorContent: Record<
    Exclude<ConnectorType, 'excel'>,
    {
      connectorLabel: string;
      hostLabel: string;
      hostPlaceholder: string;
      port: string;
      databaseLabel: string;
      usernamePlaceholder: string;
    }
  > = {
    mysql: {
      connectorLabel: 'CONFIGURATION FOR MYSQL',
      hostLabel: 'SERVER HOST',
      hostPlaceholder: 'e.g. database.example.com',
      port: '3306',
      databaseLabel: 'DATABASE / INSTANCE',
      usernamePlaceholder: 'root',
    },
    sqlserver: {
      connectorLabel: 'CONFIGURATION FOR SQL SERVER',
      hostLabel: 'SERVER HOST',
      hostPlaceholder: 'e.g. db.company.com, db\\INSTANCE, or db.company.com,1433',
      port: '1433',
      databaseLabel: 'DATABASE / INSTANCE',
      usernamePlaceholder: 'root',
    },
    postgresql: {
      connectorLabel: 'CONFIGURATION FOR POSTGRESQL',
      hostLabel: 'SERVER HOST',
      hostPlaceholder: 'e.g. database.example.com',
      port: '5432',
      databaseLabel: 'DATABASE / INSTANCE',
      usernamePlaceholder: 'root',
    },
    mongodb: {
      connectorLabel: 'CONFIGURATION FOR MONGODB',
      hostLabel: 'CONNECTION URI / HOST',
      hostPlaceholder: 'mongodb+srv://...',
      port: '27017',
      databaseLabel: 'DATABASE NAME',
      usernamePlaceholder: 'admin',
    },
  };

  const dbConnectionDefaults: Record<
    Exclude<ConnectorType, 'excel'>,
    {
      friendlyName: string;
      host: string;
      port: string;
      database: string;
      username: string;
      password: string;
      schemaHint: string;
    }
  > = {
    mysql: {
      friendlyName: 'MySQL Analytics',
      host: '',
      port: '3306',
      database: '',
      username: 'root',
      password: '',
      schemaHint: 'e.g. Table "users" has "id", "email", "created_at"...',
    },
    sqlserver: {
      friendlyName: 'SQL Server Analytics',
      host: '',
      port: '1433',
      database: '',
      username: 'root',
      password: '',
      schemaHint: 'e.g. Table "users" has "id", "email", "created_at"...',
    },
    postgresql: {
      friendlyName: 'PostgreSQL Analytics',
      host: '',
      port: '5432',
      database: '',
      username: 'root',
      password: '',
      schemaHint: 'e.g. Table "users" has "id", "email", "created_at"...',
    },
    mongodb: {
      friendlyName: 'MongoDB Analytics',
      host: '',
      port: '27017',
      database: '',
      username: 'admin',
      password: '',
      schemaHint: 'e.g. Collection "users" has "_id", "email", "createdAt"...',
    },
  };

  useEffect(() => {
    if (!activeConnector || activeConnector === 'excel') {
      return;
    }

    const defaults = dbConnectionDefaults[activeConnector];
    setDbForm({
      friendlyName: defaults.friendlyName,
      host: defaults.host,
      port: defaults.port,
      database: defaults.database,
      username: defaults.username,
      password: defaults.password,
      schemaHint: defaults.schemaHint,
    });
    setEditingConnectionId(null);
    // Keep non-MySQL connectors on the same Data Connections form layout.
    if (activeConnector !== 'mysql') {
      setActiveSchemaConnection(null);
    }
  }, [activeConnector]);

  const connectionStepMeta: Record<ConnectionStep, { label: string; stepText: string; progress: number }> = {
    idle: { label: 'Ready to connect', stepText: 'step 0/4', progress: 0 },
    validating: { label: 'Validating connection input...', stepText: 'step 1/4', progress: 25 },
    connecting: { label: 'Connecting to data source...', stepText: 'step 2/4', progress: 50 },
    creating_table: { label: 'Creating connection table...', stepText: 'step 3/4', progress: 75 },
    saving_profile: { label: 'Saving connection profile...', stepText: 'step 4/4', progress: 90 },
    completed: { label: 'Connection profile completed', stepText: 'step 4/4', progress: 100 },
    failed: { label: 'Connection failed', stepText: 'step 4/4', progress: 100 },
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const loadSavedConnections = async (connector: Exclude<ConnectorType, 'excel'>) => {
    try {
      const authHeaders = getAuthHeaders();
      const listResponse = await studioFetch(apiUrl('/api/connections/list-all'), { headers: authHeaders });
      const listData = await readApiJson<{ ok?: boolean; connections?: typeof savedConnections }>(listResponse);
      if (listResponse.ok && listData?.ok && Array.isArray(listData.connections)) {
        const filtered = listData.connections.filter((c) => canonicalWorkspaceDbConnector(c.connector_type) === connector);
        setSavedConnections(filtered);
        setShowSavedConnections(true);
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      const authHeaders = getAuthHeaders();
      const listResponse = await fetch(
        apiUrl(`/api/connections/list?connector=${encodeURIComponent(connector)}`),
        { headers: authHeaders }
      );
      const listData = await readApiJson<{ ok?: boolean; connections?: typeof savedConnections }>(listResponse);
      if (listResponse.ok && listData?.ok) {
        setSavedConnections(listData.connections ?? []);
        setShowSavedConnections(true);
        return;
      }
    } catch {
      /* fall through */
    }
    setSavedConnections([]);
    setShowSavedConnections(true);
  };

  const loadBuilderDatasourceList = useCallback(async () => {
    setBuilderDatasourceListBusy(true);
    try {
      const unique = await loadAppDataDatasourceList();
      setBuilderDatasourceList(unique);
      setSelectedBuilderDatasourceId((prev) => {
        if (prev != null && unique.some((item) => item.id === prev)) {
          return prev;
        }
        return unique[0]?.id ?? null;
      });
    } catch {
      setBuilderDatasourceList([]);
      setSelectedBuilderDatasourceId(null);
    } finally {
      setBuilderDatasourceListBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!activeConnector || activeConnector === 'excel') {
      setShowSavedConnections(false);
      return;
    }
    void loadSavedConnections(activeConnector);
  }, [activeConnector]);

  useEffect(() => {
    void loadBuilderDatasourceList();
  }, [loadBuilderDatasourceList]);

  const builderDatasourceMenuSections = useMemo((): StudioPopoverSelectSection[] => {
    return [
      {
        options: [
          { value: '', label: 'None — pick a datasource' },
          ...builderDatasourceList.map((item) => ({
            value: item.id,
            label: formatAppDataDatasourceLabel(item),
          })),
        ],
      },
    ];
  }, [builderDatasourceList]);

  const builderDsPlaceholder = builderDatasourceListBusy
    ? 'Loading saved datasources…'
    : builderDatasourceList.length === 0
      ? 'No saved datasources — save in App Data'
      : 'Choose saved datasource…';

  const builderDsTriggerCls = `inline-flex h-8 min-w-[168px] max-w-[240px] shrink-0 items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-[10px] font-normal outline-none disabled:opacity-60 ${
    isDarkMode
      ? 'border-slate-600 bg-slate-900 text-slate-100 hover:border-slate-500'
      : 'border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400'
  }`;

  const handleSaveConnection = async () => {
    if (!activeConnector || activeConnector === 'excel') {
      setSaveConnectionMessage('Choose a database connector first.');
      setConnectionStep('failed');
      return;
    }

    setIsSavingConnection(true);
    setSaveConnectionMessage('');
    setConnectionStep('saving_profile');

    try {
      const response = await fetch(
        editingConnectionId
          ? apiUrl(`/api/connections/${editingConnectionId}`)
          : apiUrl('/api/connections/save'),
        {
        method: editingConnectionId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          connectorType: activeConnector,
          friendlyName: dbForm.friendlyName,
          host: dbForm.host,
          port: dbForm.port,
          database: dbForm.database,
          username: dbForm.username,
          password: dbForm.password,
        }),
      });

      const data = await readApiJson<{ ok?: boolean; message?: string }>(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Failed to save connection.');
      }

      setConnectionStep('completed');
      setSaveConnectionMessage(
        editingConnectionId
          ? 'Connection updated successfully.'
          : 'Connection table created and details saved successfully.'
      );

      await loadSavedConnections(activeConnector);
      await loadBuilderDatasourceList();
      setEditingConnectionId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save connection.';
      setSaveConnectionMessage(message);
      setConnectionStep('failed');
    } finally {
      setIsSavingConnection(false);
    }
  };

  const handleDeleteConnection = async (connection: {
    id: number;
    friendly_name?: string;
    connector_type?: string;
    database_name?: string;
    is_default?: boolean;
  }) => {
    if (!activeConnector || activeConnector === 'excel') {
      return;
    }
    const isProtectedDefault = Boolean(connection.is_default);
    if (isProtectedDefault) {
      window.alert('The default xerocode SQL Server database cannot be deleted.');
      return;
    }
    const label = String(connection.friendly_name || connection.database_name || connection.id);
    const confirmed = window.confirm(`Delete connection "${label}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }
    try {
      const response = await studioFetch(apiUrl(`/api/connections/${connection.id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await readApiJson<{ ok?: boolean; message?: string }>(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Failed to delete connection.');
      }

      await loadSavedConnections(activeConnector);
      await loadBuilderDatasourceList();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete connection.';
      setSaveConnectionMessage(message);
    }
  };

  const handleTestConnection = async () => {
    if (!activeConnector || activeConnector === 'excel') {
      setSaveConnectionMessage('Choose a database connector first.');
      setConnectionStep('failed');
      return;
    }

    setIsSavingConnection(true);
    setConnectionStep('connecting');
    setSaveConnectionMessage('');

    try {
      const response = await studioFetch(apiUrl('/api/connections/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          connectorType: activeConnector,
          host: dbForm.host,
          port: dbForm.port,
          database: dbForm.database,
          username: dbForm.username,
          password: dbForm.password,
        }),
      });

      const data = await readApiJson<{ ok?: boolean; message?: string }>(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Test connection failed.');
      }

      setConnectionStep('completed');
      setSaveConnectionMessage('Connection test succeeded.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to test connection.';
      setConnectionStep('failed');
      setSaveConnectionMessage(message);
    } finally {
      setIsSavingConnection(false);
    }
  };

  const handleEditConnection = (connection: {
    id: number;
    friendly_name: string;
    host: string;
    port: number;
    database_name: string;
    username: string;
  }) => {
    setEditingConnectionId(connection.id);
    setShowSavedConnections(false);
    setDbForm({
      friendlyName: connection.friendly_name,
      host: connection.host,
      port: String(connection.port),
      database: connection.database_name,
      username: connection.username,
      password: '',
      schemaHint: '',
    });
    setConnectionStep('idle');
    setSaveConnectionMessage('Editing connection profile.');
  };

  return (
    <GuardrailsCatalogProvider getAuthHeaders={getAuthHeaders}>
      <div className={`min-h-screen flex ${isDarkMode ? 'bg-black text-slate-100' : 'bg-white text-slate-900'}`}>
      <aside
        className={`hidden lg:flex lg:flex-col w-[238px] border-r ${
          isDarkMode ? 'bg-black border-slate-900' : 'bg-white border-slate-200'
        }`}
      >
        <div className={`h-12 px-4 flex items-center text-[13px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
          <button type="button" onClick={() => window.location.reload()} className={isDarkMode ? 'hover:text-white' : 'hover:text-slate-900'}>
            XeroCode.ai
          </button>
        </div>

        <div className="px-3 pb-3">
          <label
            className={`flex items-center gap-2 h-9 rounded-md border px-2 text-xs ${
              isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-500' : 'border-slate-200 bg-white text-slate-400'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search"
              className={`w-full bg-transparent outline-none ${
                isDarkMode ? 'text-slate-300 placeholder:text-slate-600' : 'text-slate-600 placeholder:text-slate-400'
              }`}
              onChange={(e) => setPrompt(`Build a dashboard for "${e.target.value}"`)}
            />
          </label>
        </div>

        <nav className="px-3 space-y-3 text-[11px]">
          <section>
            <button
              type="button"
              onClick={() => handleSidebarClick('ai-builder', 'Data', 'CustomerOrder')}
              className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium ${
                activeNav === 'ai-builder'
                  ? isDarkMode
                    ? 'text-slate-100'
                    : 'bg-violet-100 text-violet-700'
                  : isDarkMode
                    ? 'text-slate-300 hover:text-slate-100'
                    : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-90" />
              Build Your APP
            </button>
            <button
              type="button"
              onClick={() => handleSidebarClick('build-your-agent', 'Agents', 'Build Your Agent')}
              className={`mt-2 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium ${
                activeNav === 'build-your-agent'
                  ? isDarkMode
                    ? 'text-slate-100'
                    : 'bg-violet-100 text-violet-700'
                  : isDarkMode
                    ? 'text-slate-300 hover:text-slate-100'
                    : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bot className="h-3.5 w-3.5 shrink-0 opacity-90" />
              Build Your Agent
            </button>
          </section>

          <section>
            <button
              type="button"
              onClick={() => setNavSectionOpen((s) => ({ ...s, data: !s.data }))}
              className={`mb-1 flex w-full items-center justify-between gap-1 rounded-md px-1 py-1 text-left text-[10px] font-bold uppercase tracking-[0.14em] ${
                isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Database className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">App Data</span>
              </span>
              <ChevronDown
                className={`h-3 w-3 shrink-0 transition-transform ${navSectionOpen.data ? 'rotate-180' : ''}`}
              />
            </button>
            {navSectionOpen.data && (
              <div
                className={`mt-1 ml-3 space-y-1 border-l pl-2 ${
                  isDarkMode ? 'border-slate-700/60' : 'border-slate-200'
                }`}
              >
                {(
                  [
                    { key: 'mysql' as const, label: 'MySQL', Icon: Database },
                    { key: 'sqlserver' as const, label: 'SQL Server', Icon: Server },
                    { key: 'postgresql' as const, label: 'PostgreSQL', Icon: Boxes },
                    { key: 'mongodb' as const, label: 'MongoDB', Icon: Leaf },
                    { key: 'excel' as const, label: 'Excel', Icon: FileSpreadsheet },
                  ] as const
                ).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setMainPanelMode('default');
                      setActiveNav(`app-data-${key}`);
                      setActiveCollection('App Data');
                      setActiveItem(label);
                      setActiveConnector(key);
                      if (key === 'excel') {
                        setShowSavedConnections(false);
                        setActiveSchemaTable('');
                        setExcelExplorerOpen(false);
                        setExcelSheetTables([]);
                        setExcelStagingFiles([]);
                        setSchemaDbTables([]);
                      } else {
                        setShowSavedConnections(true);
                        setExcelExplorerOpen(false);
                        setExcelSheetTables([]);
                        setExcelStagingFiles([]);
                        setSchemaDbTables([]);
                        setActiveSchemaTable('');
                      }
                    }}
                    className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${
                      activeNav === `app-data-${key}`
                        ? isDarkMode
                          ? 'text-slate-100'
                          : 'bg-violet-100 text-violet-700'
                        : isDarkMode
                          ? 'text-slate-400 hover:text-slate-100'
                          : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-3 w-3 shrink-0 opacity-85" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <button
              type="button"
              onClick={() => setNavSectionOpen((s) => ({ ...s, dashboards: !s.dashboards }))}
              className={`mb-1 flex w-full items-center justify-between gap-1 rounded-md px-1 py-1 text-left text-[10px] font-bold uppercase tracking-[0.14em] ${
                isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                <span className="truncate">Dashboards</span>
              </span>
              <ChevronDown
                className={`h-3 w-3 shrink-0 transition-transform ${navSectionOpen.dashboards ? 'rotate-180' : ''}`}
              />
            </button>
            {navSectionOpen.dashboards && (
              <div
                className={`mt-1 ml-3 space-y-1 border-l pl-2 ${
                  isDarkMode ? 'border-slate-700/60' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSidebarClick('design-studio', 'Dashboards', 'Design Studio')}
                  className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs ${
                    activeNav === 'design-studio'
                      ? isDarkMode
                        ? 'text-slate-100'
                        : 'bg-violet-100 text-violet-700'
                      : isDarkMode
                        ? 'text-slate-300 hover:text-slate-100'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0 opacity-90" />
                  Design Studio
                </button>
                {savedDashboards.map((d) => (
                  <div key={d.id} className="flex items-stretch gap-0.5">
                    <button
                      type="button"
                      onClick={() => onOpenSavedDashboard?.(d.id)}
                      className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 text-left text-xs ${
                        isDarkMode
                          ? 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Gauge className="h-3.5 w-3.5 shrink-0 opacity-90" />
                      <span className="truncate">{d.name}</span>
                    </button>
                    {onDeleteSavedDashboard ? (
                      <button
                        type="button"
                        onClick={() => onDeleteSavedDashboard(d.id)}
                        className={`flex shrink-0 items-center justify-center rounded-md px-1.5 ${
                          isDarkMode
                            ? 'text-slate-500 hover:bg-slate-900 hover:text-rose-400'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-rose-600'
                        }`}
                        title="Remove from menu"
                        aria-label={`Remove ${d.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <button
              type="button"
              onClick={() => setNavSectionOpen((s) => ({ ...s, api: !s.api }))}
              className={`mb-1 flex w-full items-center justify-between gap-1 rounded-md px-1 py-1 text-left text-[10px] font-bold uppercase tracking-[0.14em] ${
                isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Code2 className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                <span className="truncate">API</span>
              </span>
              <ChevronDown
                className={`h-3 w-3 shrink-0 transition-transform ${navSectionOpen.api ? 'rotate-180' : ''}`}
              />
          </button>
            {navSectionOpen.api && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleSidebarClick('build-api', 'API', 'Build API')}
                  className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs ${
                    activeNav === 'build-api'
                      ? isDarkMode
                        ? 'text-slate-100'
                        : 'bg-violet-100 text-violet-700'
                      : isDarkMode
                        ? 'text-slate-300 hover:text-slate-100'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5 shrink-0 opacity-90" />
                  Build API
                </button>
                <button
                  type="button"
                  onClick={() => handleSidebarClick('api-list', 'API', 'API List')}
                  className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs ${
                    activeNav === 'api-list'
                      ? isDarkMode
                        ? 'text-slate-100'
                        : 'bg-violet-100 text-violet-700'
                      : isDarkMode
                        ? 'text-slate-300 hover:text-slate-100'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-90" />
                  API List
                </button>
              </div>
            )}
          </section>

          <section>
            <button
              type="button"
              onClick={() => setNavSectionOpen((s) => ({ ...s, analytics: !s.analytics }))}
              className={`mb-1 flex w-full items-center justify-between gap-1 rounded-md px-1 py-1 text-left text-[10px] font-bold uppercase tracking-[0.14em] ${
                isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                <span className="truncate">Analytics</span>
              </span>
              <ChevronDown
                className={`h-3 w-3 shrink-0 transition-transform ${navSectionOpen.analytics ? 'rotate-180' : ''}`}
              />
          </button>
            {navSectionOpen.analytics && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleSidebarClick('insights', 'Analytics', 'Insights')}
                  className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs ${
                    activeNav === 'insights'
                      ? isDarkMode
                        ? 'text-slate-100'
                        : 'bg-violet-100 text-violet-700'
                      : isDarkMode
                        ? 'text-slate-300 hover:text-slate-100'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5 shrink-0 opacity-90" />
                  Insights
          </button>
                <button
                  type="button"
                  onClick={() => handleSidebarClick('automations', 'Analytics', 'Automations')}
                  className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs ${
                    activeNav === 'automations'
                      ? isDarkMode
                        ? 'text-slate-100'
                        : 'bg-violet-100 text-violet-700'
                      : isDarkMode
                        ? 'text-slate-300 hover:text-slate-100'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5 shrink-0 opacity-90" />
                  Automations
          </button>
              </div>
            )}
          </section>
        </nav>

        <div className="mt-auto p-3 space-y-2">
          <button
            type="button"
            onClick={() => {
              setMainPanelMode('llmConfig');
              setActiveNav('llm-config');
            }}
            className={`w-full h-8 rounded-md border text-xs inline-flex items-center justify-start gap-1.5 px-2.5 ${
              isDarkMode ? 'border-slate-700 bg-transparent text-slate-200' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            LLM Configuration
          </button>
          <button
            type="button"
            onClick={() => {
              setMainPanelMode('guardrailsSettings');
              setActiveNav('guardrails-settings');
              setActiveCollection('Settings');
              setActiveItem('Guardrails Settings');
            }}
            className={`w-full h-8 rounded-md border text-xs inline-flex items-center justify-start gap-1.5 px-2.5 ${
              activeNav === 'guardrails-settings'
                ? isDarkMode
                  ? 'border-rose-900/50 bg-rose-950/40 text-rose-200'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
                : isDarkMode
                  ? 'border-slate-700 bg-transparent text-slate-200'
                  : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Guardrails Settings
          </button>
          <div className={`h-8 rounded-md border text-[11px] flex items-center px-2.5 ${isDarkMode ? 'border-amber-900/50 bg-amber-950/40 text-amber-300' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
            Trial ends in 14 days
        </div>
          <button
            type="button"
            onClick={() => window.open('mailto:team@dashx.ai?subject=Invite%20to%20XeroCode.ai', '_blank')}
            className={`w-full h-8 rounded-md border text-xs inline-flex items-center justify-start gap-1.5 px-2.5 ${
              isDarkMode ? 'border-slate-700 bg-transparent text-slate-200' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite teammates
          </button>
          <button
            type="button"
            onClick={() => onSignOut?.()}
            className={`w-full h-8 rounded-md text-xs font-bold inline-flex items-center justify-start gap-1.5 px-2.5 ${
              isDarkMode
                ? 'bg-black text-red-500 border border-slate-800'
                : 'bg-white text-red-600 border border-slate-200'
            }`}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header
          className={`h-12 border-b pl-1.5 sm:pl-2 pr-4 sm:pr-6 flex items-center justify-between ${
            isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200/70 bg-white'
          }`}
        >
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <button className={`w-7 h-7 rounded-md border lg:hidden ${isDarkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'}`}>
              <LayoutGrid className="w-3.5 h-3.5 mx-auto" />
            </button>
            <span className={`font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{activeCollection}</span>
            <span>/</span>
            <span className={`font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{activeItem}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDarkModeChange(!isDarkMode)}
              className={`w-8 h-8 rounded-full border inline-flex items-center justify-center ${
                isDarkMode
                  ? 'border-slate-700 text-amber-300 hover:bg-slate-800'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((prev) => !prev)}
                className={`h-8 rounded-full border pl-1.5 pr-2 inline-flex items-center gap-2 ${
                  isDarkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'
                }`}
                title="User menu"
              >
                {userBadge.avatarUrl ? (
                  <img
                    src={userBadge.avatarUrl}
                    alt={userBadge.fullName || 'User'}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-[10px] font-semibold inline-flex items-center justify-center">
                    {initialsFromName(userBadge.fullName)}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isUserMenuOpen && (
                <div
                  className={`absolute right-0 top-10 w-60 rounded-xl border shadow-lg z-20 ${
                    isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className={`px-3 py-3 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                    <div className="flex items-center gap-2.5">
                      {userBadge.avatarUrl ? (
                        <img
                          src={userBadge.avatarUrl}
                          alt={userBadge.fullName || 'User'}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center">
                          {initialsFromName(userBadge.fullName)}
                        </span>
                      )}
                      <div>
                        <p className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>
                          {userBadge.fullName || 'User'}
                        </p>
                        <p className="text-[11px] text-slate-400">{userBadge.email || 'No email set'}</p>
        </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUserMenuAction('profile')}
                    className={`w-full text-left px-3 py-2.5 text-xs inline-flex items-center gap-2 ${
                      isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <UserRound className="w-3.5 h-3.5" />
                    Manage Your Profile
          </button>
                  <button
                    type="button"
                    onClick={() => handleUserMenuAction('change-password')}
                    className={`w-full text-left px-3 py-2.5 text-xs inline-flex items-center gap-2 ${
                      isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Change Password
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUserMenuAction('feedback')}
                    className={`w-full text-left px-3 py-2.5 text-xs inline-flex items-center gap-2 ${
                      isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <PencilLine className="w-3.5 h-3.5" />
                    Share Feedback
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className={`w-full mx-auto ${
            mainPanelMode === 'apiBuilder' ||
              mainPanelMode === 'apiList' ||
              mainPanelMode === 'apiDetail' ||
              mainPanelMode === 'externalApiEditor' ||
              mainPanelMode === 'designStudioLanding' ||
              mainPanelMode === 'dashboardDesignStudio' ||
              mainPanelMode === 'agentStudio'
              ? 'p-0 h-[calc(100vh-48px)]'
              : schemaExplorerOpen
                ? 'p-0 h-[calc(100vh-48px)]'
                : 'max-w-[1280px] pl-1.5 sm:pl-2 pr-4 sm:pr-6 py-8'
          }`}
        >
          {mainPanelMode === 'agentStudio' ? (
            <div className="h-full min-h-0 overflow-hidden">
              <AgentPlatformScreen
                isDarkMode={isDarkMode}
                onBackToWorkspace={() => {
                  setMainPanelMode('default');
                  setActiveNav('ai-builder');
                  setActiveCollection('Data');
                  setActiveItem('CustomerOrder');
                }}
                savedAgents={savedStudioAgents}
                onDeleteSavedAgent={onDeleteSavedStudioAgent}
                onAgentsSaved={onAgentStudioSaved}
              />
            </div>
          ) : mainPanelMode === 'designStudioLanding' ? (
            <div className={`h-full overflow-y-auto ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
              <DesignStudioLandingScreen
                isDarkMode={isDarkMode}
                workspaceLlmProvider={copilotLlmProvider}
                workspaceLlmModel={copilotModel}
                workspaceLlmProviderLabel={
                  COPILOT_LLM_PROVIDERS.find((p) => p.id === copilotLlmProvider)?.label ?? copilotLlmProvider
                }
                workspaceLlmModelLabel={
                  COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider].find((m) => m.value === copilotModel)?.label ??
                  copilotModel
                }
                onOpenStudio={handleLaunchDesignStudioFromLanding}
              />
            </div>
          ) : mainPanelMode === 'dashboardDesignStudio' ? (
            <DashboardDesignStudioScreen
              key={designStudioSessionNonce}
              isDarkMode={isDarkMode}
              llmProvider={copilotLlmProvider}
              llmModel={copilotModel}
              llmProviderLabel={COPILOT_LLM_PROVIDERS.find((p) => p.id === copilotLlmProvider)?.label ?? copilotLlmProvider}
              llmModelLabel={
                COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider].find((m) => m.value === copilotModel)?.label ??
                copilotModel
              }
              workspacePrompt={prompt}
              workspaceDataSourceLabel={
                designStudioBootstrap?.workspaceDataSourceLabel ?? dashboardDataSourceLabel
              }
              initialSuggestedApiRef={designStudioBootstrap?.suggestedApiRef}
              initialSelectedDatasourceKey={designStudioBootstrap?.initialSelectedDatasourceKey}
              initialComposeAttachments={designStudioBootstrap?.initialAttachments}
              autoStartBuild={designStudioBootstrap?.autoStartBuild === true}
              savedRemoteDashboardId={designStudioBootstrap?.savedRemoteDashboardId ?? undefined}
              initialProposalJson={designStudioBootstrap?.initialProposalJson ?? undefined}
              initialPublishedSlug={designStudioBootstrap?.initialPublishedSlug ?? undefined}
              onBack={() => {
                setDesignStudioBootstrap(null);
                setMainPanelMode('designStudioLanding');
                setActiveNav('design-studio');
                setActiveCollection('Dashboards');
                setActiveItem('Design Studio');
              }}
            />
          ) : mainPanelMode === 'apiBuilder' ? (
            <ApiBuilderScreen
              isDarkMode={isDarkMode}
              editingApi={editingApi}
              onEditApplied={() => setEditingApi(null)}
              onBack={() => {
                setEditingApi(null);
                setDetailViewApi(null);
                setExternalApiEditorId(null);
                setMainPanelMode('apiList');
                setActiveNav('api-list');
                setActiveCollection('API');
                setActiveItem('API List');
              }}
            />
          ) : mainPanelMode === 'apiDetail' && detailViewApi ? (
            <ApiSavedDetailScreen
              api={detailViewApi}
              isDarkMode={isDarkMode}
              onBack={() => {
                setDetailViewApi(null);
                setMainPanelMode('apiList');
              }}
              onEditApi={(api) => {
                setEditingApi(api);
                setActiveNav('build-api');
                setActiveCollection('API');
                setActiveItem('Build API');
                setMainPanelMode('apiBuilder');
              }}
            />
          ) : mainPanelMode === 'externalApiEditor' ? (
            <ExternalApiEditorScreen
              isDarkMode={isDarkMode}
              externalApiId={externalApiEditorId}
              onBack={() => {
                setExternalApiEditorId(null);
                setMainPanelMode('apiList');
              }}
            />
          ) : mainPanelMode === 'apiList' ? (
            <ApiListScreen
              isDarkMode={isDarkMode}
              onBack={() => {
                setMainPanelMode('default');
                setActiveNav('ai-builder');
                setActiveCollection('Data');
                setActiveItem('CustomerOrder');
              }}
              onCreateNew={() => {
                setEditingApi(null);
                setActiveNav('build-api');
                setActiveCollection('API');
                setActiveItem('Build API');
                setMainPanelMode('apiBuilder');
              }}
              onEditApi={(api) => {
                setEditingApi(api);
                setActiveNav('build-api');
                setActiveCollection('API');
                setActiveItem('Build API');
                setMainPanelMode('apiBuilder');
              }}
              onViewApi={(api) => {
                setDetailViewApi(api);
                setMainPanelMode('apiDetail');
              }}
              onAddExternalApi={() => {
                setExternalApiEditorId(null);
                setMainPanelMode('externalApiEditor');
              }}
              onOpenExternalApi={(id) => {
                setExternalApiEditorId(id);
                setMainPanelMode('externalApiEditor');
              }}
            />
          ) : mainPanelMode === 'profile' ? (
            <section className="mx-auto w-full max-w-4xl">
              <div className={`rounded-2xl border p-6 sm:p-8 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className={`text-2xl font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Profile</h2>
                    <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Manage your account details in this workspace panel.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMainPanelMode('default')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      isDarkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Back to workspace
                  </button>
                </div>

                {profileLoading ? (
                  <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading profile...
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input
                  type="text"
                        placeholder="Full name"
                        value={profileDraft.fullName}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={profileDraft.email}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, email: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="text"
                        placeholder="Phone"
                        value={profileDraft.phone}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="text"
                        placeholder="Company"
                        value={profileDraft.company}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, company: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="text"
                        placeholder="Role title"
                        value={profileDraft.roleTitle}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, roleTitle: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="url"
                        placeholder="Avatar URL"
                        value={profileDraft.avatarUrl}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="url"
                        placeholder="Slack app / workspace link"
                        value={profileDraft.slackUrl}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, slackUrl: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="url"
                        placeholder="Discord invite URL"
                        value={profileDraft.discordUrl}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, discordUrl: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="url"
                        placeholder="LinkedIn profile or company URL"
                        value={profileDraft.linkedinUrl}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input
                        type="url"
                        placeholder="X (Twitter) profile URL"
                        value={profileDraft.xUrl}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, xUrl: e.target.value }))}
                        className={`h-10 rounded-lg border px-3 text-sm outline-none sm:col-span-2 ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                      />
                    </div>
                    <textarea
                      rows={4}
                      placeholder="Bio"
                      value={profileDraft.bio}
                      onChange={(e) => setProfileDraft((prev) => ({ ...prev, bio: e.target.value }))}
                      className={`mt-4 w-full rounded-lg border px-3 py-2 text-sm outline-none ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'}`}
                    />
                    {profileError && (
                      <p className={`mt-3 text-sm ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>{profileError}</p>
                    )}
                    {profileMsg && (
                      <p className={`mt-3 text-sm ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{profileMsg}</p>
                    )}
                    <div className="mt-5 flex justify-end">
                <button
                  type="button"
                        onClick={() => void saveProfile()}
                        disabled={profileSaving}
                        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                        {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save profile
                </button>
              </div>
                  </>
                )}
              </div>
            </section>
          ) : mainPanelMode === 'llmConfig' ? (
            <section className="mx-auto w-full max-w-5xl">
              <div className={`rounded-2xl border p-6 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className={`text-2xl font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                      LLM Configuration
                    </h2>
                    <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Configure provider models, API keys, and base URLs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMainPanelMode('default')}
                    className={`rounded-md px-3 py-1.5 text-xs ${isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}
                  >
                    Back
                  </button>
                </div>
                {llmConfigLoading ? (
                  <div className={`inline-flex items-center gap-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading configuration...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(['google', 'openai', 'anthropic', 'deepseek'] as CopilotLlmProviderId[]).map((provider) => (
                      <div
                        key={provider}
                        className={`rounded-xl border p-4 ${isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-slate-50'}`}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                              {COPILOT_LLM_PROVIDERS.find((p) => p.id === provider)?.label ?? provider}
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                                !llmTestMsgByProvider[provider]
                                  ? isDarkMode
                                    ? 'bg-slate-800 text-slate-300'
                                    : 'bg-slate-200 text-slate-700'
                                  : llmTestMsgByProvider[provider].toLowerCase().includes('success')
                                    ? isDarkMode
                                      ? 'bg-emerald-950 text-emerald-300'
                                      : 'bg-emerald-100 text-emerald-700'
                                    : isDarkMode
                                      ? 'bg-rose-950 text-rose-300'
                                      : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  !llmTestMsgByProvider[provider]
                                    ? isDarkMode
                                      ? 'bg-slate-500'
                                      : 'bg-slate-500'
                                    : llmTestMsgByProvider[provider].toLowerCase().includes('success')
                                      ? 'bg-emerald-500'
                                      : 'bg-rose-500'
                                }`}
                              />
                              {!llmTestMsgByProvider[provider]
                                ? 'Not tested'
                                : llmTestMsgByProvider[provider].toLowerCase().includes('success')
                                  ? 'Connected'
                                  : 'Failed'}
                            </span>
                          </div>
                          <a
                            href={LLM_PROVIDER_API_KEY_LINKS[provider]}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center gap-1 text-xs ${isDarkMode ? 'text-sky-300 hover:text-sky-200' : 'text-sky-700 hover:text-sky-900'}`}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            API key page
                          </a>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <select
                            value={llmConfig[provider].modelName}
                            onChange={(e) =>
                              setLlmConfig((prev) => ({
                                ...prev,
                                [provider]: { ...prev[provider], modelName: e.target.value },
                              }))
                            }
                            className={`h-10 rounded-md border px-2 text-sm ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-200' : 'border-slate-200 bg-white text-slate-800'}`}
                          >
                            {COPILOT_MODELS_BY_PROVIDER[provider].map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="password"
                            value={llmConfig[provider].apiKey}
                            onChange={(e) =>
                              setLlmConfig((prev) => ({
                                ...prev,
                                [provider]: { ...prev[provider], apiKey: e.target.value },
                              }))
                            }
                            placeholder="API key"
                            className={`h-10 rounded-md border px-3 text-sm ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-200 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'}`}
                          />
                          <input
                            type="text"
                            value={llmConfig[provider].baseUrl}
                            onChange={(e) =>
                              setLlmConfig((prev) => ({
                                ...prev,
                                [provider]: { ...prev[provider], baseUrl: e.target.value },
                              }))
                            }
                            placeholder="Base URL (optional)"
                            className={`h-10 rounded-md border px-3 text-sm ${isDarkMode ? 'border-slate-700 bg-slate-950 text-slate-200 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'}`}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => void testLlmConfigConnection(provider)}
                            disabled={llmTestBusyByProvider[provider]}
                            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${
                              isDarkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                            } disabled:opacity-60`}
                          >
                            {llmTestBusyByProvider[provider] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Test Connection
                          </button>
                          {llmTestMsgByProvider[provider] && (
                            <p
                              className={`text-xs ${
                                llmTestMsgByProvider[provider].toLowerCase().includes('success')
                                  ? isDarkMode
                                    ? 'text-emerald-400'
                                    : 'text-emerald-700'
                                  : isDarkMode
                                    ? 'text-rose-400'
                                    : 'text-rose-700'
                              }`}
                            >
                              {llmTestMsgByProvider[provider]}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {llmConfigMsg && (
                      <p className={`text-sm ${llmConfigMsg.toLowerCase().includes('saved') ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-rose-400' : 'text-rose-600')}`}>
                        {llmConfigMsg}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void saveLlmConfig()}
                        disabled={llmConfigSaving}
                        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {llmConfigSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save configuration
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </section>
          ) : mainPanelMode === 'guardrailsSettings' ? (
            <div className={`min-h-0 flex-1 overflow-y-auto ${isDarkMode ? 'bg-black' : 'bg-slate-50'}`}>
              <GuardrailsSettingsScreen
                isDarkMode={isDarkMode}
                onBack={() => {
                  setMainPanelMode('default');
                  setActiveNav('ai-builder');
                  setActiveCollection('Data');
                  setActiveItem('CustomerOrder');
                }}
              />
            </div>
          ) : activeConnector ? (
            <>
              {activeConnector === 'excel' && !schemaExplorerOpen && (
                <section className="max-w-4xl mx-auto">
                  <input
                    ref={excelFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleExcelFilesSelected(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <div className="text-center mb-6">
                    <span
                      className={`w-10 h-10 mx-auto rounded-xl inline-flex items-center justify-center ${
                        isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                      }`}
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                    </span>
                    <h2 className={`mt-3 text-4xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                      Excel as Data Source
            </h2>
                    <p className={`mt-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Select one or more spreadsheets—each sheet becomes a table in the schema explorer.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-violet-600 p-px shadow-[0_0_16px_rgba(79,70,229,0.1)]">
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          excelFileInputRef.current?.click();
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleExcelFilesSelected(e.dataTransfer.files);
                      }}
                      onClick={() => excelFileInputRef.current?.click()}
                      className={`cursor-pointer rounded-[15px] px-6 py-10 text-center ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}
                    >
                      <div
                        className={`w-12 h-12 mx-auto rounded-2xl inline-flex items-center justify-center ${
                          isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Upload className="w-5 h-5" />
                      </div>
                      <h3 className={`mt-4 text-3xl font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        Drop files here or browse
                      </h3>
                      <p className={`mt-2 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        .xlsx, .xls, and .csv — up to 10MB per file. Multiple files supported.
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          excelFileInputRef.current?.click();
                        }}
                        className={`mt-6 rounded-xl px-6 py-2.5 text-sm font-semibold ${
                          isDarkMode
                            ? 'bg-white text-slate-900 shadow-[0_0_18px_rgba(255,255,255,0.2)]'
                            : 'bg-violet-600 text-white'
                        }`}
                      >
                        Browse Files
                      </button>
                    </div>
                  </div>
                  {schemaTablesError && activeConnector === 'excel' && !excelExplorerOpen && (
                    <p className={`mt-3 text-center text-sm ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>
                      {schemaTablesError}
                    </p>
                  )}

                  <div className="mt-6 grid md:grid-cols-3 gap-3">
                    {[
                      {
                        title: 'Instant DB',
                        description: 'Excel tables are converted to a queryable schema automatically.',
                      },
                      {
                        title: 'Automated Types',
                        description: 'Columns are intelligently typed for better SQL generation results.',
                      },
                      {
                        title: 'Export Ready',
                        description: 'Build dashboards on Excel data and export as dynamic assets.',
                      },
                    ].map((item) => (
                      <div
                        key={item.title}
                        className={`rounded-xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}
                      >
                        <span
                          className={`w-7 h-7 rounded-lg inline-flex items-center justify-center ${
                            isDarkMode ? 'bg-violet-500/20 text-violet-400' : 'bg-violet-100 text-violet-600'
                          }`}
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                        <h4 className={`mt-3 text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                          {item.title}
                        </h4>
                        <p className={`mt-1 text-xs leading-5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {item.description}
                  </p>
                </div>
              ))}
            </div>

                  {savedExcelSchemas.length > 0 && (
                    <div className="mt-12 w-full pb-8">
                      <h3
                        className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
                      >
                        Saved Excel schemas
                      </h3>
                      <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        Open to continue exploring or building dashboards.
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {savedExcelSchemas.map((s) => {
                          const files = [...new Set(s.tables.map((t) => t.fileName))];
                          return (
                            <div
                              key={s.id}
                              className={`rounded-xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`truncate font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
                                  >
                                    {s.name}
                                  </p>
                                  <p className={`mt-1 text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                                    {s.tables.length} sheet{s.tables.length === 1 ? '' : 's'} · {files.length} file
                                    {files.length === 1 ? '' : 's'}
                                  </p>
                                  <p className={`mt-0.5 text-[10px] ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                    Saved {new Date(s.savedAt).toLocaleString()}
                                  </p>
                                  <p
                                    className={`mt-1 line-clamp-2 text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
                                    title={files.join(', ')}
                                  >
                                    {files.join(', ')}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => loadSavedExcelSchema(s)}
                                    className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${isDarkMode ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-violet-600 text-white hover:bg-violet-500'}`}
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm(`Remove “${s.name}” from saved schemas?`)) {
                                        deleteSavedExcelSchema(s.id);
                                      }
                                    }}
                                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium ${isDarkMode ? 'text-slate-500 hover:bg-slate-800 hover:text-rose-400' : 'text-slate-500 hover:bg-slate-100 hover:text-rose-600'}`}
                                    aria-label={`Delete saved schema ${s.name}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
          </section>
              )}

              {(activeConnector !== 'excel' || schemaExplorerOpen) && (
              <section
                className={`w-full ml-0 mr-auto ${
                  schemaExplorerOpen ? 'h-full' : ''
                }`}
              >
                {(() => {
                  return (
                    <>
                {!schemaExplorerOpen && (
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className={`text-4xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Data Connections</h2>
                      <p className={`mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Manage your external database connections</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className={`h-9 rounded-lg border px-4 text-xs font-semibold inline-flex items-center gap-1.5 ${isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}>
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        Use Sample DB
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeConnector || activeConnector === 'excel') {
                            return;
                          }
                          const portDefault =
                            activeConnector === 'mysql'
                              ? '3306'
                              : activeConnector === 'sqlserver'
                                ? '1433'
                                : activeConnector === 'postgresql'
                                  ? '5432'
                                  : '27017';
                          setEditingConnectionId(null);
                          setShowSavedConnections(false);
                          setDbForm({
                            friendlyName: '',
                            host: '',
                            port: portDefault,
                            database: '',
                            username: '',
                            password: '',
                            schemaHint: '',
                          });
                        }}
                        className="h-9 rounded-lg bg-violet-600 text-white px-4 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Connection
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={
                    schemaExplorerOpen ? 'pt-0 h-full' : 'pt-1'
                  }
                >
                  {(activeSchemaConnection || excelSchemaActive) ? (
                          <div
                            className={`grid grid-cols-12 gap-0 h-full min-h-0 overflow-hidden rounded-none border ${
                              isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200 bg-white'
                            }`}
                          >
                            <aside
                              className={`col-span-12 lg:col-span-3 flex h-full min-h-0 flex-col overflow-hidden p-3 ${
                                isDarkMode ? 'bg-black border-b lg:border-b-0 lg:border-r border-slate-900' : 'bg-white border-b lg:border-b-0 lg:border-r border-slate-200'
                              }`}
                            >
                              <div className="mb-3 flex shrink-0 flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (excelSchemaActive) {
                                        setExcelExplorerOpen(false);
                                        setExcelSheetTables([]);
                                        setExcelStagingFiles([]);
                                        setExcelWorkbookSchemaName('');
                                        setSchemaDbTables([]);
                                        setSchemaTableColumns([]);
                                        setSchemaTableRows([]);
                                        setSchemaTableTotal(0);
                                        setSchemaTablePage(0);
                                        setSchemaTableDataError(null);
                                        setSchemaTablesError(null);
                                        setSchemaMidView('table');
                                        setActiveSchemaTable('');
                                        return;
                                      }
                                      setActiveSchemaConnection(null);
                                      setSchemaTablesError(null);
                                      setSchemaDbTables([]);
                                      setSchemaTableColumns([]);
                                      setSchemaTableRows([]);
                                      setSchemaTableTotal(0);
                                      setSchemaTablePage(0);
                                      setSchemaTableDataError(null);
                                      setSchemaMidView('table');
                                    }}
                                    className={`shrink-0 text-left text-[11px] ${isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                                  >
                                    {excelSchemaActive ? 'Back to upload' : 'Back to Connections'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (excelSchemaActive) {
                                        void refreshExcelTables();
                                        return;
                                      }
                                      if (activeSchemaConnection) {
                                        loadConnectionTables(activeSchemaConnection.id);
                                      }
                                    }}
                                    className={`h-6 w-6 shrink-0 rounded inline-flex items-center justify-center ${isDarkMode ? 'text-slate-400 hover:bg-slate-900 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                                    title="Refresh tables"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSchemaTables ? 'animate-spin' : ''}`} />
                                  </button>
                                </div>
                                <p className={`text-xl font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                                  Data sources
                      </p>
                    </div>
                              <div
                                className={`shrink-0 rounded-none border px-2.5 py-2 ${isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200 bg-slate-50'}`}
                              >
                                {excelSchemaActive ? (
                                  <div className="space-y-2">
                                    <div>
                                      <label
                                        htmlFor="excel-workbook-schema-name"
                                        className={`mb-1 block text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
                                      >
                                        Excel workbooks · schema name
                                      </label>
                                      <input
                                        id="excel-workbook-schema-name"
                                        type="text"
                                        value={excelWorkbookSchemaName}
                                        onChange={(e) => setExcelWorkbookSchemaName(e.target.value)}
                                        placeholder="Name this schema…"
                                        className={`h-8 w-full rounded-md border px-2 text-[11px] outline-none ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'}`}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => saveCurrentExcelAsSchema()}
                                      className={`flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-violet-600 text-white hover:bg-violet-500'}`}
                                    >
                                      <Save className="h-3 w-3" />
                                      Save as schema
                                    </button>
                                    {excelSchemaSaveToast ? (
                                      <p className="text-[10px] text-emerald-400">{excelSchemaSaveToast}</p>
                                    ) : null}
                                    <p className="text-[10px] text-emerald-400/90 uppercase tracking-[0.14em]">
                                      Loaded · {excelSheetTables.length} sheet{excelSheetTables.length === 1 ? '' : 's'}
                                    </p>
                                  </div>
                                ) : (
                                  <>
                                    <p className={`text-xs font-semibold truncate ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                                      {schemaContext?.friendly_name ?? ''}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-emerald-400 uppercase tracking-[0.14em]">
                                      Connected
                                    </p>
                                  </>
                                )}
                  </div>
                              <div
                                className={`mt-3 shrink-0 rounded-none border px-2 py-1.5 ${isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200 bg-slate-50'}`}
                              >
                                <label
                                  className={`mb-1 block text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
                                  htmlFor="schema-table-search"
                                >
                                  Search tables / sheets
                                </label>
                                <div className="relative">
                                  <Search
                                    className={`pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 ${
                                      isDarkMode ? 'text-slate-600' : 'text-slate-400'
                                    }`}
                                  />
                                  <input
                                    id="schema-table-search"
                                    type="search"
                                    value={schemaTableSearch}
                                    onChange={(e) => setSchemaTableSearch(e.target.value)}
                                    placeholder="Filter…"
                                    className={`h-8 w-full rounded-md border pl-7 pr-2 text-[11px] outline-none ${
                                      isDarkMode
                                        ? 'border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600'
                                        : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'
                                    }`}
                                  />
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    {schemaTableSelection.size} selected for dashboard
                                  </p>
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={clearSchemaTableSelection}
                                      disabled={schemaTableSelection.size === 0}
                                      className={`text-[10px] font-semibold disabled:opacity-40 ${
                                        isDarkMode
                                          ? 'text-slate-400 hover:text-slate-300'
                                          : 'text-slate-600 hover:text-slate-700'
                                      }`}
                                    >
                                      Unselect all
                                    </button>
                                    <button
                                      type="button"
                                      onClick={selectAllFilteredSchemaTables}
                                      disabled={filteredSchemaDbTables.length === 0}
                                      className={`text-[10px] font-semibold disabled:opacity-40 ${
                                        isDarkMode
                                          ? 'text-violet-400 hover:text-violet-300'
                                          : 'text-violet-700 hover:text-violet-600'
                                      }`}
                                    >
                                      Select all shown
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <div className={`mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5 ${hideScrollbars}`}>
                                {isLoadingSchemaTables && schemaDbTables.length === 0 ? (
                                  <p className={`text-xs py-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    {excelSchemaActive
                                      ? 'Reading spreadsheet files…'
                                      : 'Loading tables from the connected database…'}
                                  </p>
                                ) : schemaTablesError ? (
                                  <p className={`text-xs py-2 ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>
                                    {schemaTablesError}
                                  </p>
                                ) : schemaDbTables.length === 0 ? (
                                  <p className={`text-xs py-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    {excelSchemaActive
                                      ? 'No sheets found. Go back and choose .xlsx, .xls, or .csv files.'
                                      : 'No base tables found in this database schema.'}
                                  </p>
                                ) : filteredSchemaDbTables.length === 0 ? (
                                  <p className={`text-xs py-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    No tables match your search.
                                  </p>
                                ) : (
                                  filteredSchemaDbTables.map((tableKey) => {
                                    const tableLabel = excelSchemaActive
                                      ? excelSheetTables.find((t) => t.key === tableKey)?.label ?? tableKey
                                      : tableKey;
                                    const isSelected = schemaTableSelection.has(tableKey);
                                    const isActive = activeSchemaTable === tableKey;
                                    return (
                                      <div
                                        key={tableKey}
                                        className={`flex min-h-8 items-start gap-1 rounded-md px-1 py-0.5 ${
                                          isActive
                                            ? isDarkMode
                                              ? 'bg-slate-900 ring-1 ring-violet-500/50'
                                              : 'bg-violet-50 ring-1 ring-violet-200'
                                            : ''
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSchemaTableSelected(tableKey);
                                          }}
                                          className={`mt-0.5 shrink-0 rounded p-0.5 ${
                                            isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                                          }`}
                                          title={isSelected ? 'Remove from dashboard' : 'Include in dashboard'}
                                          aria-label={isSelected ? 'Deselect for dashboard' : 'Select for dashboard'}
                                        >
                                          {isSelected ? (
                                            <CheckSquare className="h-3.5 w-3.5" />
                                          ) : (
                                            <Square className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSchemaTablePage(0);
                                            setActiveSchemaTable(tableKey);
                                          }}
                                          className={`min-w-0 flex-1 text-left rounded-md px-1.5 py-1 text-xs ${
                                            isActive
                                              ? isDarkMode
                                                ? 'text-violet-200'
                                                : 'text-violet-900'
                                              : isDarkMode
                                                ? 'text-slate-300 hover:bg-slate-800'
                                                : 'text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          <span className="inline-flex items-start gap-2">
                                            <Table2 className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
                                            <span className="break-words">{tableLabel}</span>
                                          </span>
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                              <div
                                className={`mt-4 shrink-0 pt-3 border-t ${isDarkMode ? 'border-slate-900' : 'border-slate-200'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <p className={`text-[11px] uppercase tracking-[0.14em] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Hidden schemas
                                  </p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-100 text-slate-500'}`}>2</span>
                                </div>
                              </div>
                            </aside>
                            <section
                              className={`col-span-12 lg:col-span-6 flex h-full min-h-0 flex-col overflow-hidden p-3 ${
                                isDarkMode
                                  ? 'bg-black border-b lg:border-b-0 lg:border-r border-slate-900'
                                  : 'bg-white border-b lg:border-b-0 lg:border-r border-slate-200'
                              }`}
                            >
                              <div className="flex shrink-0 items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                      isDarkMode ? 'bg-violet-600/20 text-violet-400' : 'bg-violet-100 text-violet-700'
                                    }`}
                                  >
                                    <LayoutGrid className="h-5 w-5" />
                                  </span>
                                  <h3
                                    className={`truncate text-2xl font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
                                  >
                                    {activeExcelTableLabel}
                                  </h3>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {(['table', 'json', 'sql'] as const).map((view) => (
                                    <button
                                      key={view}
                                      type="button"
                                      onClick={() => setSchemaMidView(view)}
                                      className={`rounded px-2 py-1 text-[10px] font-semibold ${
                                        schemaMidView === view
                                          ? 'bg-violet-600 text-white'
                                          : isDarkMode
                                            ? 'border border-slate-900 bg-black text-slate-400'
                                            : 'bg-slate-100 text-slate-500'
                                      }`}
                                    >
                                      {view.toUpperCase()}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setSchemaTableRefreshKey((k) => k + 1)}
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded ${
                                      isDarkMode
                                        ? 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                                        : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                    title="Refresh data"
                                  >
                                    <RefreshCw className={`h-4 w-4 ${isLoadingTableData ? 'animate-spin' : ''}`} />
                                  </button>
                                </div>
                              </div>
                              <p
                                className={`mt-1 shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] ${
                                  isDarkMode ? 'text-slate-500' : 'text-slate-500'
                                }`}
                              >
                                {(schemaContext?.database_name || '').toUpperCase()} • {schemaTableRows.length}{' '}
                                records shown
                              </p>

                              <div className="mt-3 flex min-h-0 min-w-0 w-full flex-1 flex-col">
                                <div className={`min-h-0 w-full min-w-0 flex-1 overflow-x-auto overflow-y-auto ${hideScrollbars}`}>
                                  {schemaMidView === 'table' && (
                                    <>
                                      {schemaTableDataError ? (
                                        <p
                                          className={`py-4 text-xs ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}
                                        >
                                          {schemaTableDataError}
                                        </p>
                                      ) : isLoadingTableData && schemaTableRows.length === 0 ? (
                                        <p className={`py-4 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                          Loading rows…
                                        </p>
                                      ) : (
                                        <table
                                          className={`w-full min-w-max border-collapse border text-left text-xs tabular-nums ${
                                            isDarkMode ? 'border-slate-600' : 'border-slate-300'
                                          } ${excelSchemaActive ? 'font-sans' : 'font-mono'}`}
                                        >
                                          <thead>
                                            <tr>
                                              {schemaTableColumns.map((col, colIndex) => (
                                                <th
                                                  key={`hdr-${colIndex}-${col.name}`}
                                                  className={`sticky top-0 z-10 border px-2.5 py-2 text-left align-bottom text-[11px] font-semibold ${
                                                    isDarkMode
                                                      ? 'border-slate-700 bg-slate-900 text-slate-100'
                                                      : 'border-slate-300 bg-slate-100 text-slate-900'
                                                  } ${excelSchemaActive ? '' : 'whitespace-nowrap'}`}
                                                >
                                                  {excelSchemaActive ? col.name : `${col.name.toUpperCase()} (${col.type})`}
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {schemaTableRows.map((row, rowIndex) => (
                                              <tr
                                                key={`r-${schemaTablePage}-${rowIndex}`}
                                                className={
                                                  isDarkMode
                                                    ? rowIndex % 2 === 0
                                                      ? 'bg-black'
                                                      : 'bg-slate-950/90'
                                                    : rowIndex % 2 === 0
                                                      ? 'bg-white'
                                                      : 'bg-slate-50'
                                                }
                                              >
                                                {row.map((cell, cellIndex) => {
                                                  const colType = schemaTableColumns[cellIndex]?.type || '';
                                                  const t = colType.toLowerCase();
                                                  const moneyish =
                                                    !excelSchemaActive &&
                                                    (['decimal', 'float', 'double'].some((x) => t.includes(x)) ||
                                                      /^\$[\d.,]+$/.test(cell));
                                                  return (
                                                    <td
                                                      key={`c-${rowIndex}-${cellIndex}`}
                                                      className={`border px-2.5 py-1.5 align-top text-[13px] leading-snug ${
                                                        isDarkMode
                                                          ? 'border-slate-700 text-slate-200'
                                                          : 'border-slate-200 text-slate-800'
                                                      } ${
                                                        excelSchemaActive
                                                          ? 'min-w-[4rem] max-w-[20rem] break-words whitespace-pre-wrap'
                                                          : `whitespace-nowrap ${
                                                              moneyish
                                                                ? `font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`
                                                                : ''
                                                            }`
                                                      }`}
                                                    >
                                                      {cell}
                                                    </td>
                                                  );
                                                })}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </>
                                  )}
                                  {schemaMidView === 'json' && (
                                    <pre
                                      className={`break-all whitespace-pre-wrap px-1 py-2 text-[11px] ${
                                        isDarkMode ? 'text-slate-300' : 'text-slate-700'
                                      }`}
                                    >
                                      {schemaTableDataError
                                        ? schemaTableDataError
                                        : JSON.stringify(
                                            schemaTableRows.map((row) =>
                                              Object.fromEntries(
                                                schemaTableColumns.map((c, i) => [c.name, row[i] ?? null])
                                              )
                                            ),
                                            null,
                                            2
                                          )}
                                    </pre>
                                  )}
                                  {schemaMidView === 'sql' && (
                                    <pre
                                      className={`px-1 py-2 font-mono text-[11px] ${
                                        isDarkMode ? 'text-slate-300' : 'text-slate-700'
                                      }`}
                                    >
                                      {schemaPreviewSql}
                                    </pre>
                                  )}
                                </div>

                                <div
                                  className={`mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-2.5 ${
                                    isDarkMode ? 'border-slate-900' : 'border-slate-200'
                                  }`}
                                >
                                  <p
                                    className={`font-mono text-[10px] uppercase tracking-wide ${
                                      isDarkMode ? 'text-slate-500' : 'text-slate-500'
                                    }`}
                                  >
                                    Showing up to {schemaPageSize} results | {schemaTableRows.length} fetched ·{' '}
                                    {schemaTableTotal} total
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={schemaTablePage <= 0 || isLoadingTableData}
                                      onClick={() => setSchemaTablePage((p) => Math.max(0, p - 1))}
                                      className={`rounded px-3 py-1.5 text-[10px] font-semibold ${
                                        schemaTablePage <= 0 || isLoadingTableData
                                          ? isDarkMode
                                            ? 'cursor-not-allowed bg-slate-900 text-slate-600'
                                            : 'cursor-not-allowed bg-slate-100 text-slate-400'
                                          : isDarkMode
                                            ? 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                      }`}
                                    >
                                      PREV
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        isLoadingTableData ||
                                        schemaTablePage * schemaPageSize + schemaTableRows.length >= schemaTableTotal
                                      }
                                      onClick={() => setSchemaTablePage((p) => p + 1)}
                                      className={`rounded px-3 py-1.5 text-[10px] font-semibold ${
                                        isLoadingTableData ||
                                        schemaTablePage * schemaPageSize + schemaTableRows.length >= schemaTableTotal
                                          ? isDarkMode
                                            ? 'cursor-not-allowed bg-slate-900 text-slate-600'
                                            : 'cursor-not-allowed bg-slate-100 text-slate-400'
                                          : isDarkMode
                                            ? 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                      }`}
                                    >
                                      NEXT
                                    </button>
                                  </div>
                                </div>
            </div>
          </section>
                            <aside
                              className={`col-span-12 lg:col-span-3 flex h-full min-h-0 flex-col overflow-hidden p-3 ${
                                isDarkMode ? 'bg-black' : 'bg-white'
                              }`}
                            >
                              <div className="mb-3 flex shrink-0 items-center gap-1">
                                {[
                                  { key: 'assistant', label: 'AI ASSISTANT' },
                                  { key: 'source', label: 'DATASOURCE' },
                                  { key: 'metadata', label: 'METADATA' },
                                ].map((tab) => (
                                  <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setSchemaRightTab(tab.key as 'assistant' | 'source' | 'metadata')}
                                    className={`h-7 px-2 rounded text-[9px] tracking-[0.12em] font-semibold ${
                                      schemaRightTab === tab.key
                                        ? 'bg-violet-600 text-white'
                                        : isDarkMode
                                          ? 'text-slate-500 hover:text-slate-300'
                                          : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                  >
                                    {tab.label}
                                  </button>
                                ))}
                              </div>

                              <div className="min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden pr-0.5">
                              {schemaRightTab === 'assistant' && (
                                <div
                                  className={`min-h-0 flex-1 overflow-y-auto overflow-x-auto ${hideScrollbars}`}
                                >
                                <>
                                  <p className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                                    AI Data Assistant
                                  </p>
                                  <p className={`mt-1 text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Configure the model and describe what to build from the active dataset.
                                  </p>

                                  <div className="mt-4 space-y-3">
                                    <div>
                                      <p
                                        className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
                                      >
                                        Data source
                                      </p>
                                      <div
                                        className={`min-h-9 rounded-md border px-2.5 py-2 text-[11px] leading-snug ${isDarkMode ? 'border-slate-800 bg-black text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                                        title={copilotDataSourceSummary}
                                      >
                                        {copilotDataSourceSummary}
                                      </div>
                                    </div>

                                    <div>
                                      <p
                                        className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
                                      >
                                        LLM providers
                                      </p>
                                      <div className="relative">
                                        <select
                                          value={copilotLlmProvider}
                                          onChange={(e) => setCopilotLlmProvider(e.target.value as CopilotLlmProviderId)}
                                          className={`w-full h-9 appearance-none rounded-md border px-2.5 pr-8 text-[11px] outline-none ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-200' : 'border-slate-200 bg-white text-slate-800'}`}
                                        >
                                          {COPILOT_LLM_PROVIDERS.map((p) => (
                                            <option key={p.id} value={p.id}>
                                              {p.label}
                                            </option>
                                          ))}
                                        </select>
                                        <ChevronDown
                                          className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <p
                                        className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
                                      >
                                        Model
                                      </p>
                                      <div className="relative">
                                        <select
                                          value={copilotModel}
                                          onChange={(e) => setCopilotModel(e.target.value)}
                                          className={`w-full h-9 appearance-none rounded-md border px-2.5 pr-8 text-[11px] outline-none ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-200' : 'border-slate-200 bg-white text-slate-800'}`}
                                        >
                                          {COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider].map((m) => (
                                            <option key={m.value} value={m.value}>
                                              {m.label}
                                            </option>
                                          ))}
                                        </select>
                                        <ChevronDown
                                          className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <p
                                        className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}
                                      >
                                        Natural language prompt
                                      </p>
                                      <input
                                        ref={copilotDesignInputRef}
                                        type="file"
                                        multiple
                                        accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                                        className="hidden"
                                        onChange={(e) => {
                                          handleCopilotDesignFiles(e.target.files);
                                          e.target.value = '';
                                        }}
                                      />
                                      <div className="relative">
                                        {copilotDesignAttachments.length > 0 && (
                                          <div className="absolute left-2 top-2 z-10 flex max-w-[85%] items-center gap-1 overflow-x-auto rounded-md border border-slate-700/60 bg-black/40 p-1">
                                            {copilotDesignAttachments.map((a, i) => (
                                              <div key={`${a.file.name}-${i}`} className="relative shrink-0">
                                                <img
                                                  src={a.previewUrl}
                                                  alt="Attached design"
                                                  className="h-8 w-8 rounded object-cover"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => removeCopilotDesignAttachment(i)}
                                                  className={`absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full ${
                                                    isDarkMode ? 'bg-slate-900 text-slate-200' : 'bg-white text-slate-700'
                                                  }`}
                                                  title="Remove image"
                                                >
                                                  <X className="h-2.5 w-2.5" />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                <textarea
                                          value={copilotNlPrompt}
                                          onChange={(e) => setCopilotNlPrompt(e.target.value)}
                                          rows={4}
                                          placeholder="e.g. Build a revenue dashboard with monthly trend, top products table, and filters by region…"
                                          className={`w-full resize-none rounded-md border px-2.5 pb-9 pr-10 text-[11px] leading-relaxed outline-none ${
                                            copilotDesignAttachments.length > 0 ? 'pt-12' : 'pt-2'
                                          } ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'}`}
                                        />
                  <button
                    type="button"
                                          onClick={() => copilotDesignInputRef.current?.click()}
                                          className={`absolute bottom-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-md border ${
                                            isDarkMode
                                              ? 'border-slate-700 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                                              : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                          }`}
                                          title="Upload design image"
                                          aria-label="Upload design image"
                                        >
                                          <Upload className="h-3.5 w-3.5" />
                  </button>
                                      </div>
                                      {copilotDesignAttachments.length > 0 && (
                                        <p className={`mt-1 truncate text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                          Attached: {copilotDesignAttachments.length} image
                                          {copilotDesignAttachments.length > 1 ? 's' : ''}
                                        </p>
                                      )}
                                    </div>

                  <button
                    type="button"
                                      disabled={buildPrepareBusy}
                                      onClick={() => {
                                        void (async () => {
                                          const next = copilotNlPrompt.trim();
                                          if (next) {
                                            setPrompt(next);
                                          }
                                          setBuildPrepareBusy(true);
                                          try {
                                            const ctx = await assembleCopilotDashboardContext();
                                            if (!ctx) {
                                              window.alert('Select at least one table or sheet.');
                                              return;
                                            }
                                            onBuildClick?.(ctx);
                                          } catch (e) {
                                            window.alert(
                                              e instanceof Error ? e.message : 'Could not load tables.'
                                            );
                                          } finally {
                                            setBuildPrepareBusy(false);
                                          }
                                        })();
                                      }}
                                      className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-50"
                                    >
                                      <LayoutGrid className="h-4 w-4 shrink-0" />
                                      {buildPrepareBusy ? 'Preparing…' : 'Build Data Components'}
                  </button>
                </div>

                                  <div
                                    className={`mt-6 border-t pt-4 ${isDarkMode ? 'border-slate-800/80' : 'border-slate-200'}`}
                                  >
                                    <p
                                      className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
                                    >
                                      Dashboard templates
                                    </p>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                      {DASHBOARD_TEMPLATES.map((tpl) => (
                                        <button
                                          key={tpl.id}
                                          type="button"
                                          onClick={() => setCopilotNlPrompt(tpl.prompt)}
                                          className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                                            isDarkMode
                                              ? 'border-slate-800 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900'
                                              : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                                          }`}
                                          title={tpl.summary}
                                        >
                                          <p
                                            className={`text-[11px] font-semibold ${
                                              isDarkMode ? 'text-slate-200' : 'text-slate-800'
                                            }`}
                                          >
                                            {tpl.title}
                                          </p>
                                          <p
                                            className={`mt-0.5 text-[10px] ${
                                              isDarkMode ? 'text-slate-500' : 'text-slate-600'
                                            }`}
                                          >
                                            {tpl.summary}
                                          </p>
                                        </button>
                                      ))}
              </div>
                                  </div>

                                  <div
                                    className={`mt-6 border-t pt-4 ${isDarkMode ? 'border-slate-800/80' : 'border-slate-200'}`}
                                  >
                                    <p
                                      className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
                                    >
                                      Recommended data functionality use case
                                    </p>
                                    <ul className="mt-2 space-y-2">
                                      {recommendedDataFunctionalityUseCases.map((item) => (
                                        <li key={item.title}>
                <button
                  type="button"
                                            onClick={() => setCopilotNlPrompt(`${item.title}: ${item.body}`)}
                                            className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900' : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'}`}
                                          >
                                            <p className={`text-[11px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                              {item.title}
                                            </p>
                                            <p className={`mt-0.5 text-[10px] leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                                              {item.body}
                                            </p>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </>
                                </div>
                              )}

                              {schemaRightTab === 'source' && (
                                <div
                                  className={`flex min-h-0 flex-1 flex-col gap-3 text-xs ${
                                    isDarkMode ? 'text-slate-300' : 'text-slate-800'
                                  }`}
                                >
                                  <div className="shrink-0">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      Currently using
                                    </p>
                                    <div
                                      className={`mt-1 rounded-md border px-2.5 py-2 ${
                                        isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-slate-50'
                                      }`}
                                    >
                                      <p className="font-medium leading-snug">{schemaWorkspaceDataSourceLabel}</p>
                                      {activeSchemaConnection ? (
                                        <p className="mt-0.5 text-[10px] text-slate-500">
                                          ID: {activeSchemaConnection.id} · {activeSchemaConnection.host}:
                                          {activeSchemaConnection.port}
                                        </p>
                                      ) : excelSchemaActive ? (
                                        <p className={`mt-0.5 text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                          {excelSheetTables.length > 0
                                            ? `${excelSheetTables.length} sheet(s) · ${[...new Set(excelSheetTables.map((t) => t.fileName))].join(', ')}`
                                            : 'Add workbooks in the explorer.'}
                                        </p>
                                      ) : (
                                        <p className={`mt-0.5 text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                          Connect from App Data in the sidebar.
                                        </p>
                                      )}
                                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                        Tables for dashboard
                                      </p>
                                      <p
                                        className={`mt-0.5 text-[11px] leading-relaxed break-words ${
                                          isDarkMode ? 'text-slate-300' : 'text-slate-700'
                                        }`}
                                      >
                                        {dashboardBuildTableLabels.length > 0
                                          ? dashboardBuildTableLabels.join(', ')
                                          : 'None selected — include tables or sheets from the explorer.'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="shrink-0">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      Original brief
                                    </p>
                                    <p className={`mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                      {prompt || '—'}
                                    </p>
                                  </div>
                                  <div className="flex min-h-0 flex-1 flex-col">
                                    <p className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      Co-Pilot activity
                                    </p>
                                    <div
                                      className={`mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border p-2 text-[11px] [scrollbar-width:thin] ${
                                        isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'
                                      }`}
                                    >
                                      {schemaSourceChatMessages.length === 0 ? (
                                        <p className="text-slate-500">
                                          No runs yet. Append 4-step planning to log (uses AI Assistant model).
                                        </p>
                                      ) : (
                                        schemaSourceChatMessages.map((m, i) => (
                                          <div key={String(i)} className="mb-2 last:mb-0">
                                            <span className="font-semibold">{m.role === 'assistant' ? 'AI: ' : 'You: '}</span>
                                            <span className={isDarkMode ? 'text-slate-400' : 'text-slate-700'}>
                                              {m.text.slice(0, 400)}
                                              {m.text.length > 400 ? '…' : ''}
                                            </span>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                    <div className="mt-2 flex shrink-0 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void runSchemaSourceBuildAgent()}
                                        disabled={schemaSourceBuildAgentBusy || buildPrepareBusy}
                                        className={`min-w-0 flex-1 rounded-md border py-1.5 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50 ${
                                          isDarkMode
                                            ? 'border-slate-700 text-slate-300 hover:bg-slate-900'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                                        }`}
                                      >
                                        {schemaSourceBuildAgentBusy ? 'Planning…' : 'Append 4-step planning to log'}
                                      </button>
                                      {schemaSourceBuildAgentBusy ? (
                                        <button
                                          type="button"
                                          onClick={stopSchemaSourceLlm}
                                          className={`shrink-0 rounded-md border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                                            isDarkMode
                                              ? 'border-slate-700 text-slate-300 hover:bg-slate-900'
                                              : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                                          }`}
                                        >
                                          Stop
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {schemaRightTab === 'metadata' && (
                                <div
                                  className={`min-h-0 flex-1 overflow-y-auto overflow-x-auto pr-0.5 [scrollbar-width:thin] ${hideScrollbars}`}
                                >
                                <>
                                  <div className="flex items-center justify-between">
                                    <p className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Table Inspector</p>
                                    <button
                                      type="button"
                                      className={`text-[9px] px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-500'}`}
                                    >
                                      Back
                                    </button>
                                  </div>
                                  <p className={`mt-2 text-[10px] uppercase tracking-[0.14em] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Active Entity
                                  </p>
                                  <p className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>{activeExcelTableLabel}</p>
                                  <p className={`mt-3 text-[10px] uppercase tracking-[0.14em] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Schema Definitions
                                  </p>
                                  <div className="mt-2 space-y-2">
                                    {schemaMetadata.map((fieldMeta) => (
                                      <div
                                        key={fieldMeta.field}
                                        className={`rounded-md border px-2 py-1.5 ${isDarkMode ? 'border-slate-900 bg-black' : 'border-slate-200 bg-slate-50'}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className={`text-[10px] font-semibold uppercase ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                            {fieldMeta.field}
                                          </p>
                                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400">
                                            {fieldMeta.badge}
                                          </span>
                                        </div>
                                        <p className="text-[9px] text-slate-500">{fieldMeta.type}</p>
                                      </div>
                                    ))}
                                  </div>
                                </>
                                </div>
                              )}
                              </div>
                            </aside>
                          </div>
                  ) : showSavedConnections ? (
                    <div
                      className={
                        schemaExplorerOpen ? 'h-full' : 'space-y-3'
                      }
                    >
                      {savedConnections.length === 0 ? (
                        <div className="py-10 text-center">
                          <span className={`w-12 h-12 mx-auto rounded-2xl inline-flex items-center justify-center ${isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                            <Database className="w-5 h-5" />
                          </span>
                          <p className={`mt-4 text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                            No saved connections yet
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                            Click "Add Connection" to begin
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-start gap-3">
                          {savedConnections.map((connection) => {
                            const hostLine = `${String(connection.host).toUpperCase()}: ${connection.port}`;
                            const isDefault = (connection as any).is_default;
                            return (
                              <div
                                key={connection.id}
                  onClick={() => {
                                  if (!supportsSchemaExplorer(activeConnector)) {
                                    return;
                                  }
                                  setActiveSchemaConnection(connection);
                                  setActiveSchemaTable('');
                                  setSchemaDbTables([]);
                                  setSchemaTablesError(null);
                                  setSchemaTablePage(0);
                                  setSchemaTableColumns([]);
                                  setSchemaTableRows([]);
                                  setSchemaTableTotal(0);
                                  setSchemaTableDataError(null);
                                  setSchemaMidView('table');
                                  loadConnectionTables(connection.id);
                                  setActiveCollection('Data');
                                  setActiveItem(connection.friendly_name || connection.database_name || 'Schema');
                                }}
                                className={`relative min-w-0 w-full max-w-sm h-[150px] rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-violet-600 p-px shadow-[0_0_16px_rgba(79,70,229,0.1)] ${
                                  supportsSchemaExplorer(activeConnector) ? 'cursor-pointer' : ''
                                }`}
                              >
                                <div
                                  className={`group relative h-full overflow-hidden rounded-[11px] pl-3 pr-3 py-2.5 ${
                                    isDarkMode ? 'bg-slate-950' : 'bg-white'
                                  }`}
                                >
                                {/* Left gradient accent */}
                                <div
                                  className="pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] rounded-r-full bg-gradient-to-b from-sky-500 via-violet-500 to-violet-600 opacity-95 shadow-[0_0_8px_rgba(139,92,246,0.35)]"
                                  aria-hidden
                                />

                                {/* Header */}
                                <div className="flex items-start justify-between gap-2 pl-0.5">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <div className="relative shrink-0">
                                      <span
                                        className={`w-8 h-8 rounded-md inline-flex items-center justify-center ${
                                          isDarkMode
                                            ? 'bg-violet-600/90 text-white'
                                            : 'bg-violet-600 text-white'
                                        }`}
                                      >
                                        <Database className="w-4 h-4" strokeWidth={1.75} />
                                      </span>
                                      <span
                                        className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ${
                                          isDarkMode ? 'ring-slate-950' : 'ring-white'
                                        }`}
                                      />
                                    </div>
                                    <div className="min-w-0 pt-0.5">
                                      <p
                                        className={`text-xs font-bold leading-tight truncate ${
                                          isDarkMode ? 'text-white' : 'text-slate-900'
                                        }`}
                                      >
                                        {connection.friendly_name || 'CustomerOrder'}
                                      </p>
                                      {isDefault && (
                                        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-400">
                                          Default Database
                                        </p>
                                      )}
                                      <p
                                        className={`mt-0.5 text-[10px] leading-snug truncate font-mono tracking-wide ${
                                          isDarkMode ? 'text-slate-400' : 'text-slate-500'
                                        }`}
                                      >
                                        {hostLine}
                                      </p>
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border ${
                                      isDarkMode
                                        ? 'border-emerald-500/70 text-emerald-400 bg-emerald-950/30'
                                        : 'border-emerald-500 text-emerald-600 bg-emerald-50'
                                    }`}
                                  >
                                    VERIFIED
                                  </span>
                                </div>

                                {/* Divider */}
                                <div
                                  className={`my-2 h-px ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}
                                />

                                {/* Footer */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pl-0.5">
                                  <p
                                    className={`text-[10px] font-mono tracking-wide truncate min-w-0 max-w-[55%] ${
                                      isDarkMode ? 'text-slate-500' : 'text-slate-500'
                                    }`}
                                  >
                                    DB: {String(connection.database_name).toUpperCase()}
                                  </p>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                    <div
                                      className="flex items-center gap-1 opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                                    >
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditConnection(connection);
                                        }}
                                        title="Edit connection"
                                        className={`h-7 w-7 rounded-md border inline-flex items-center justify-center ${
                                          isDarkMode
                                            ? 'border-slate-700 text-slate-200 hover:bg-slate-800/80'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                                        }`}
                                      >
                                        <PencilLine className="w-3.5 h-3.5" />
                </button>
                                      {!isDefault && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteConnection(connection);
                                          }}
                                          title="Delete connection"
                                          className="h-7 w-7 rounded-md border border-rose-400/45 text-rose-400 hover:bg-rose-500/10 inline-flex items-center justify-center"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
              </div>
                                    <p
                                      title="Connected successfully"
                                      className={`text-[10px] font-medium whitespace-nowrap ${
                                        isDarkMode ? 'text-emerald-400' : 'text-violet-600'
                                      }`}
                                    >
                                      <span className="hidden min-[380px]:inline">Connected successfully</span>
                                      <span className="min-[380px]:hidden">OK</span>
                                    </p>
            </div>
                                </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                  <div className="rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-violet-600 p-px shadow-[0_0_16px_rgba(79,70,229,0.1)]">
                    <div className={`rounded-[15px] p-5 ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-6">
                      <p className={`text-[10px] uppercase tracking-[0.16em] font-bold mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Friendly Name</p>
                      <input
                        className={`w-full rounded-md border px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                        value={dbForm.friendlyName}
                        onChange={(e) => setDbForm((prev) => ({ ...prev, friendlyName: e.target.value }))}
                        placeholder="e.g. Production Analytics"
                      />
                    </div>
                    <div className="col-span-4 flex items-end pb-2">
                      <p className={`text-[10px] uppercase tracking-[0.16em] font-bold ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{dbConnectorContent[activeConnector].connectorLabel}</p>
                    </div>
                    <div className="col-span-2 flex items-end justify-end">
                      <button className={`text-[10px] px-2 py-1 rounded ${isDarkMode ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-100 text-violet-700'}`}>TRY WITH SAMPLE</button>
                    </div>

                    <div className="col-span-8">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-500 mb-1">{dbConnectorContent[activeConnector].hostLabel}</p>
                      <input
                        className={`w-full rounded-md border px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                        value={dbForm.host}
                        onChange={(e) => setDbForm((prev) => ({ ...prev, host: e.target.value }))}
                        placeholder={dbConnectorContent[activeConnector].hostPlaceholder}
                      />
                    </div>
                    <div className="col-span-4">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-500 mb-1">Port</p>
                      <input
                        className={`w-full rounded-md border px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                        value={dbForm.port || dbConnectorContent[activeConnector].port}
                        onChange={(e) => setDbForm((prev) => ({ ...prev, port: e.target.value }))}
                      />
                    </div>

                    <div className="col-span-6">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-500 mb-1">{dbConnectorContent[activeConnector].databaseLabel}</p>
                      <input
                        className={`w-full rounded-md border px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                        value={dbForm.database}
                        onChange={(e) => setDbForm((prev) => ({ ...prev, database: e.target.value }))}
                        placeholder=""
                      />
                    </div>
                    <div className="col-span-6">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-500 mb-1">Username</p>
                      <input
                        className={`w-full rounded-md border px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                        value={dbForm.username}
                        onChange={(e) => setDbForm((prev) => ({ ...prev, username: e.target.value }))}
                        placeholder={dbConnectorContent[activeConnector].usernamePlaceholder}
                      />
                    </div>

                    <div className="col-span-12">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-500 mb-1">Password</p>
                      <input
                        type="password"
                        className={`w-full rounded-md border px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                        value={dbForm.password}
                        onChange={(e) => setDbForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder=""
                      />
                    </div>

                    {activeConnector !== 'excel' && dbConnectionPreview && (
                      <div className="col-span-12">
                        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-500 mb-1">
                          Connection string (preview)
                        </p>
                        <p
                          className={`w-full rounded-md border px-3 py-2 text-[11px] font-mono break-all ${isDarkMode ? 'border-slate-800 bg-slate-950 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                        >
                          {dbConnectionPreview}
                        </p>
                      </div>
                    )}

                    <div className="col-span-12">
                      <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-500 mb-1">Optional Schema Hint</p>
                      <textarea
                        rows={3}
                        className={`w-full rounded-md border px-3 py-2 text-sm resize-none ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}
                        value={dbForm.schemaHint}
                        onChange={(e) => setDbForm((prev) => ({ ...prev, schemaHint: e.target.value }))}
                        placeholder={'e.g. Table "users" has "id", "email", "created_at"...'}
                      />
                    </div>
                  </div>

                  <div className={`mt-4 rounded-md border px-3 py-2 ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{connectionStepMeta[connectionStep].label.toUpperCase()}</span>
                      <span>{connectionStepMeta[connectionStep].stepText}</span>
                    </div>
                    <div className={`mt-2 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                      <div
                        className={`h-full rounded-full ${connectionStep === 'failed' ? 'bg-rose-500' : 'bg-violet-500'}`}
                        style={{ width: `${connectionStepMeta[connectionStep].progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setConnectionStep('idle');
                        setSaveConnectionMessage('');
                        setEditingConnectionId(null);
                        setShowSavedConnections(true);
                      }}
                      className={`text-sm ${isDarkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isSavingConnection}
                      className={`h-10 rounded-lg border px-4 text-sm ${
                        isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'
                      } disabled:opacity-60`}
                    >
                      {isSavingConnection && connectionStep === 'connecting' ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveConnection}
                      disabled={isSavingConnection}
                      className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white disabled:opacity-70"
                    >
                      {isSavingConnection
                        ? 'Saving...'
                        : editingConnectionId
                          ? 'Save Connection'
                          : 'Save Connection'}
                    </button>
                  </div>
                  {saveConnectionMessage && (
                    <p className={`mt-3 text-xs ${saveConnectionMessage.toLowerCase().includes('successfully') ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {saveConnectionMessage}
                    </p>
                  )}
                    </div>
                  </div>
                    </>
                  )}
                </div>
                    </>
                  );
                })()}
          </section>
              )}
            </>
          ) : (
            <>
              <section className="mx-auto">
                <h1 className={`text-center text-[34px] leading-tight font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  What do you want to build today?
                </h1>

                <div className={`mt-6 rounded-2xl border p-5 ${isDarkMode ? 'border-slate-800 bg-slate-900 shadow-[0_3px_10px_rgba(2,6,23,0.45)]' : 'border-slate-200 bg-white shadow-[0_3px_10px_rgba(15,23,42,0.04)]'}`}>
                  <textarea
                    rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                    placeholder="What would you like to build? Describe your dashboard components..."
                    className={`w-full resize-none bg-transparent text-sm border-none outline-none ${isDarkMode ? 'text-slate-200 placeholder:text-slate-500' : 'text-slate-700 placeholder:text-slate-400'}`}
                />

                  <div className="mt-4 flex flex-nowrap items-center gap-3 overflow-x-auto">
                    <div
                      className={`flex shrink-0 flex-nowrap items-center justify-start gap-3 overflow-x-auto ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                    >
                      <input
                        ref={copilotDesignInputRef}
                        type="file"
                        accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void handleCopilotDesignFilesSelected(e.target.files);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => copilotDesignInputRef.current?.click()}
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                          isDarkMode
                            ? 'border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            : 'border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        title="Upload design image"
                        aria-label="Upload design image"
                      >
                        <Upload className="h-4 w-4" />
                      </button>
                      <StudioPopoverSelect
                        ariaLabel="Saved datasource"
                        disabled={builderDatasourceListBusy}
                        isDarkMode={isDarkMode}
                        value={selectedBuilderDatasourceId ?? ''}
                        placeholder={builderDsPlaceholder}
                        sections={builderDatasourceMenuSections}
                        onMenuOpen={() => void loadBuilderDatasourceList()}
                        onChange={(raw) => {
                          if (!raw) {
                            setSelectedBuilderDatasourceId(null);
                            return;
                          }
                          setSelectedBuilderDatasourceId(raw);
                        }}
                        triggerClassName={builderDsTriggerCls}
                      />
                      <select
                        value={copilotLlmProvider}
                        onChange={(e) => setCopilotLlmProvider(e.target.value as CopilotLlmProviderId)}
                        className={`h-8 min-w-[108px] shrink-0 rounded-lg border px-2 text-[10px] outline-none ${
                          isDarkMode
                            ? 'border-slate-600 bg-slate-900 text-slate-100'
                            : 'border-slate-300 bg-white text-slate-800 shadow-sm'
                        }`}
                        title="LLM Provider"
                      >
                        {COPILOT_LLM_PROVIDERS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={copilotModel}
                        onChange={(e) => setCopilotModel(e.target.value)}
                        className={`h-8 min-w-[148px] shrink-0 rounded-lg border px-2 text-[10px] outline-none ${
                          isDarkMode
                            ? 'border-slate-600 bg-slate-900 text-slate-100'
                            : 'border-slate-300 bg-white text-slate-800 shadow-sm'
                        }`}
                        title="LLM Model"
                      >
                        {COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider].map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[12px] flex-1 shrink" aria-hidden />
                    <button
                      type="button"
                      disabled={buildPrepareBusy}
                      onClick={() => void handleBuildInStudio()}
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#6675ff] to-[#4f46e5] text-white ring-1 ring-[#7c87ff]/40 disabled:opacity-40"
                      title="Open Build Your APP"
                    >
                      <ArrowUp className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </section>

              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <p className={`text-[10px] uppercase tracking-[0.16em] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    Application which you have built
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {savedApps.length === 0 ? (
                    <div className={`rounded-xl border p-4 text-sm ${isDarkMode ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
                      No saved applications yet.
                    </div>
                  ) : (
                    savedApps.map((app) => (
                        <div
                          key={app.id}
                          className={`app-card-fade-in rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-0.5 ${isDarkMode ? 'border-slate-800 bg-slate-900 hover:shadow-sm hover:border-slate-700' : 'border-slate-200 bg-white hover:shadow-sm hover:border-slate-300'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                                setActiveNav(`saved-app-${app.id}`);
                                setActiveCollection('Saved Apps');
                                setActiveItem(app.name);
                                if (app.prompt?.trim()) setPrompt(app.prompt);
                                onOpenSavedApplication?.(app.id);
                              }}
                              className="min-w-0 text-left"
                              title={`Open ${app.name}`}
                            >
                              <div className={`inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                <Gauge className="w-3 h-3" />
                                <span>Application</span>
                              </div>
                              <p className={`mt-2 truncate text-[13px] leading-5 font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{app.name}</p>
                              <p className={`mt-1 text-[12px] leading-5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                {app.dataSourceName || 'Saved app'}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteSavedApplication?.(app.id)}
                              className="inline-flex items-center rounded p-1 text-rose-400 hover:text-rose-300"
                              title="Delete application"
                              aria-label="Delete application"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
                        </div>
                      ))
                  )}
            </div>
          </section>

              <section className="mt-8 w-full min-w-0">
                  <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div
                      className={`flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-3 ${
                        isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700">
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            Add XeroCode.ai to Slack
                          </p>
                          <p className={`text-[11px] leading-snug ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {normalizeCommunityUrl(profileDraft.slackUrl)
                              ? 'Chat with your data agent in Slack.'
                              : 'Add your Slack link under Profile.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!normalizeCommunityUrl(profileDraft.slackUrl)}
                        onClick={() => {
                          const href = normalizeCommunityUrl(profileDraft.slackUrl);
                          if (href) window.open(href, '_blank', 'noopener,noreferrer');
                        }}
                        className="h-8 w-full rounded-full bg-black text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Add to Slack
                      </button>
                    </div>

                    <div
                      className={`flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-3 ${
                        isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            isDarkMode ? 'bg-indigo-950 text-indigo-300' : 'bg-indigo-100 text-indigo-600'
                          }`}
                        >
                          <DiscordIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            Join the Discord
                          </p>
                          <p className={`text-[11px] leading-snug ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {normalizeCommunityUrl(profileDraft.discordUrl)
                              ? 'Hang out with the community and get help.'
                              : 'Add your Discord invite under Profile.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!normalizeCommunityUrl(profileDraft.discordUrl)}
                        onClick={() => {
                          const href = normalizeCommunityUrl(profileDraft.discordUrl);
                          if (href) window.open(href, '_blank', 'noopener,noreferrer');
                        }}
                        className={`h-8 w-full rounded-full text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                          isDarkMode ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        Join Discord
                      </button>
                    </div>

                    <div
                      className={`flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-3 ${
                        isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            isDarkMode ? 'bg-sky-950 text-sky-300' : 'bg-sky-100 text-sky-700'
                          }`}
                        >
                          <Linkedin className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            Follow us on LinkedIn
                          </p>
                          <p className={`text-[11px] leading-snug ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {normalizeCommunityUrl(profileDraft.linkedinUrl)
                              ? 'Product news and release notes.'
                              : 'Add your LinkedIn URL under Profile.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!normalizeCommunityUrl(profileDraft.linkedinUrl)}
                        onClick={() => {
                          const href = normalizeCommunityUrl(profileDraft.linkedinUrl);
                          if (href) window.open(href, '_blank', 'noopener,noreferrer');
                        }}
                        className={`h-8 w-full rounded-full border text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                          isDarkMode
                            ? 'border-sky-800 bg-slate-950 text-sky-200 hover:bg-slate-900'
                            : 'border-sky-200 bg-white text-sky-800 hover:bg-sky-50'
                        }`}
                      >
                        Follow on LinkedIn
                      </button>
                    </div>

                    <div
                      className={`flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-3 ${
                        isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-900 text-white'
                          }`}
                        >
                          <Twitter className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            Follow us on X
                          </p>
                          <p className={`text-[11px] leading-snug ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {normalizeCommunityUrl(profileDraft.xUrl)
                              ? 'Tips, launches, and behind the scenes.'
                              : 'Add your X profile URL under Profile.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!normalizeCommunityUrl(profileDraft.xUrl)}
                        onClick={() => {
                          const href = normalizeCommunityUrl(profileDraft.xUrl);
                          if (href) window.open(href, '_blank', 'noopener,noreferrer');
                        }}
                        className={`h-8 w-full rounded-full border text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                          isDarkMode
                            ? 'border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900'
                            : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        Follow on X
                      </button>
                    </div>
                  </div>
                </section>
            </>
          )}
        </main>
      </div>
    </div>
    </GuardrailsCatalogProvider>
  );
};


