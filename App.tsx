import React, { useCallback, useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-500">
          <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
          <pre className="bg-red-50 p-4 rounded overflow-auto text-sm">{this.state.error?.stack}</pre>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const THEME_DARK_STORAGE_KEY = 'xerocode_ai_ui_dark_mode';
const SAVED_APPS_STORAGE_KEY = 'xerocode_ai_saved_app_builder_apps_v1';
const LEGACY_SAVED_APPS_STORAGE_KEY = 'saved_app_builder_apps_v1';
const STUDIO_DASHBOARDS_STORAGE_KEY = 'xerocode_ai_saved_studio_dashboards_v1';
const LEGACY_STUDIO_DASHBOARDS_STORAGE_KEY = 'saved_studio_dashboards_v1';

const readStoredDarkMode = (): boolean => {
  try {
    const raw = localStorage.getItem(THEME_DARK_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return false;
};
import {
  AiStudioLanding,
  COPILOT_LLM_PROVIDERS,
  COPILOT_MODELS_BY_PROVIDER,
  type CopilotLlmProviderId,
  dashboardSidebarCopyFromBuild,
  type DashboardBuildContext,
  type StudioUserMenuIntent,
} from './components/AiStudioLanding';
import { LoginPage } from './components/LoginPage';
import { Dashboard } from './components/Dashboard';
import { BuilderStudioScreen } from './components/BuilderStudioScreen';
import { PublicAppPage } from './components/PublicAppPage';
import { PublicDesignStudioPreviewPage } from './components/PublicDesignStudioPreviewPage';
import { apiUrl, readApiJson, studioFetch } from './lib/apiBase';
import { DESIGN_STUDIO_REMOTE_PAYLOAD_KIND } from './lib/designStudioSavedDashboards';
import type { SavedStudioAgentRow } from './components/AgentPlatformScreen';

const App: React.FC = () => {
  type SavedApp = {
    id: string;
    name: string;
    prompt: string;
    dataSourceName: string;
    llmProvider: CopilotLlmProviderId;
    llmModel: string;
    schemaConnectionId?: number;
    connectorType?: 'mysql' | 'sqlserver' | 'postgresql' | 'excel' | 'mongodb';
    selectedTables: string[];
    lastState?: {
      applicationName?: string;
      activeTable?: string;
      selectedTables?: string[];
      pageByTable?: Record<string, number>;
      columnsByTable?: Record<string, string[]>;
      rowsByTable?: Record<string, Array<{ __rowId: string; [key: string]: string }>>;
      totalByTable?: Record<string, number>;
      chatMessages?: Array<{ role: 'user' | 'assistant'; text: string }>;
      previewMode?: 'table' | 'dashboard';
      webpageTemplate?: 'landing' | 'admin' | 'ecommerce';
      activeDashboardId?: string;
      dashboards?: Array<{
        id: string;
        name: string;
        buildContext?: DashboardBuildContext;
        webpageSpec?: {
          title: string;
          subtitle: string;
          sections: Array<{ heading: string; description: string; cta?: string }>;
        };
      }>;
    };
    updatedAt: number;
  };
  type View = 'login' | 'studio' | 'builderStudio' | 'dashboard';
  const [view, setView] = useState<View>('login');
  const [isDarkMode, setIsDarkModeState] = useState<boolean>(() => readStoredDarkMode());

  const setIsDarkMode = useCallback((update: boolean | ((prev: boolean) => boolean)) => {
    setIsDarkModeState((prev) => {
      const next = typeof update === 'function' ? update(prev) : update;
      try {
        localStorage.setItem(THEME_DARK_STORAGE_KEY, next ? 'true' : 'false');
      } catch {
        /* best-effort persistence */
      }
      return next;
    });
  }, []);
  const [dashboardBuild, setDashboardBuild] = useState<DashboardBuildContext | null>(null);
  const [studioUserMenuIntent, setStudioUserMenuIntent] = useState<StudioUserMenuIntent | null>(null);
  const [aiBuilderFocusToken, setAiBuilderFocusToken] = useState(0);
  const [builderStudioCtx, setBuilderStudioCtx] = useState<{
    prompt: string;
    dataSourceName: string;
    llmProvider: CopilotLlmProviderId;
    llmModel: string;
    llmProviderLabel: string;
    llmModelLabel: string;
    schemaConnectionId?: number;
    connectorType?: 'mysql' | 'sqlserver' | 'postgresql' | 'excel' | 'mongodb';
    selectedTables?: string[];
    initialState?: SavedApp['lastState'];
  } | null>(null);
  const [savedApps, setSavedApps] = useState<SavedApp[]>(() => {
    try {
      let raw = localStorage.getItem(SAVED_APPS_STORAGE_KEY);
      if (raw == null) {
        raw = localStorage.getItem(LEGACY_SAVED_APPS_STORAGE_KEY);
        if (raw != null) {
          localStorage.setItem(SAVED_APPS_STORAGE_KEY, raw);
          localStorage.removeItem(LEGACY_SAVED_APPS_STORAGE_KEY);
        }
      }
      const parsed = raw ? (JSON.parse(raw) as SavedApp[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  type SavedStudioDashboard = {
    id: string;
    name: string;
    buildContext: DashboardBuildContext;
    updatedAt: number;
  };

  const [savedStudioDashboards, setSavedStudioDashboards] = useState<SavedStudioDashboard[]>(() => {
    try {
      let raw = localStorage.getItem(STUDIO_DASHBOARDS_STORAGE_KEY);
      if (raw == null) {
        raw = localStorage.getItem(LEGACY_STUDIO_DASHBOARDS_STORAGE_KEY);
        if (raw != null) {
          localStorage.setItem(STUDIO_DASHBOARDS_STORAGE_KEY, raw);
          localStorage.removeItem(LEGACY_STUDIO_DASHBOARDS_STORAGE_KEY);
        }
      }
      const parsed = raw ? (JSON.parse(raw) as SavedStudioDashboard[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [savedStudioAgents, setSavedStudioAgents] = useState<SavedStudioAgentRow[]>([]);

  const savedStudioDashboardsRef = useRef<SavedStudioDashboard[]>(savedStudioDashboards);
  savedStudioDashboardsRef.current = savedStudioDashboards;

  const getAuthHeaders = useCallback(() => {
    try {
      const raw = localStorage.getItem('active_user_profile');
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
  }, []);

  const loadSavedFromApi = useCallback(async () => {
    const headers = getAuthHeaders();
    if (!headers['x-user-email']) return;
    try {
      const [appsRes, dashRes, agentsRes] = await Promise.all([
        studioFetch(apiUrl('/api/apps'), { headers }),
        studioFetch(apiUrl('/api/dashboards'), { headers }),
        studioFetch(apiUrl('/api/agents'), { headers }),
      ]);
      const appsPayload = await readApiJson<any>(appsRes).catch(() => ({}));
      const dashPayload = await readApiJson<any>(dashRes).catch(() => ({}));
      const agentsPayload = await readApiJson<any>(agentsRes).catch(() => ({}));
      if (appsRes.ok && appsPayload?.ok && Array.isArray(appsPayload.apps)) {
        setSavedApps(
          appsPayload.apps
            .map((r: any) => {
              const payload = r?.payload || {};
              const selectedTables = Array.isArray(payload.selectedTables)
                ? payload.selectedTables
                : Array.isArray(payload?.lastState?.selectedTables)
                  ? payload.lastState.selectedTables
                  : [];
              return {
                ...payload,
                id: r.id,
                selectedTables: selectedTables.filter((t: unknown) => typeof t === 'string' && t.trim() !== ''),
                lastState: {
                  ...(payload?.lastState || {}),
                  selectedTables: selectedTables.filter((t: unknown) => typeof t === 'string' && t.trim() !== ''),
                },
                updatedAt: Number(r.updatedAt || r.updated_at || Date.now()),
              };
            })
            .filter((x: any) => x && typeof x.id === 'string')
        );
      }
      if (dashRes.ok && dashPayload?.ok && Array.isArray(dashPayload.dashboards)) {
        setSavedStudioDashboards(
          dashPayload.dashboards
            .filter((r: any) => r?.payload?.kind !== DESIGN_STUDIO_REMOTE_PAYLOAD_KIND)
            .map((r: any) => ({
              id: String(r.id),
              name: String(r.name || r.payload?.name || 'Dashboard'),
              buildContext: r.payload?.buildContext || r.payload || {},
              updatedAt: Number(r.updatedAt || r.updated_at || Date.now()),
            }))
            .filter((x: any) => x.id)
        );
      }
      if (agentsRes.ok && agentsPayload?.ok && Array.isArray(agentsPayload.agents)) {
        setSavedStudioAgents(
          agentsPayload.agents
            .map((r: any) => {
              const p = r?.payload || {};
              const agentKind = p.agentKind === 'managerial' ? 'managerial' : 'standalone';
              return {
                id: String(r.id),
                name: String(r.name || p.workflowName || 'Agent'),
                updatedAt: Number(r.updatedAt || r.updated_at || Date.now()),
                payload: {
                  agentKind,
                  workflowName: String(p.workflowName || r.name || 'Agent workflow'),
                  nodes: Array.isArray(p.nodes) ? p.nodes : [],
                  edges: Array.isArray(p.edges) ? p.edges : [],
                },
              } satisfies SavedStudioAgentRow;
            })
            .filter((x: SavedStudioAgentRow) => x.id)
        );
      }
    } catch {
      // fallback to local cache already loaded
    }
  }, [getAuthHeaders]);

  const persistSavedApps = (apps: SavedApp[]) => {
    setSavedApps(apps);
    try {
      localStorage.setItem(SAVED_APPS_STORAGE_KEY, JSON.stringify(apps));
    } catch {
      // best-effort local cache
    }
  };

  useEffect(() => {
    if (view === 'login') return;
    void loadSavedFromApi();
  }, [view, loadSavedFromApi]);

  const dashboardSidebar = dashboardSidebarCopyFromBuild(dashboardBuild);
  const publicDesignStudioMatch =
    typeof window !== 'undefined'
      ? /^\/public-design-studio\/([^/?#]+)/.exec(window.location.pathname)
      : null;
  const publicDesignStudioSlug = publicDesignStudioMatch?.[1]
    ? decodeURIComponent(publicDesignStudioMatch[1])
    : '';

  if (publicDesignStudioSlug) {
    return (
      <ErrorBoundary>
        <PublicDesignStudioPreviewPage slug={publicDesignStudioSlug} />
      </ErrorBoundary>
    );
  }

  let publicAppId = '';
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    const longMatch = /^\/public-app\/([^/?#]+)/.exec(pathname);
    if (longMatch?.[1]) {
      publicAppId = decodeURIComponent(longMatch[1]);
    }
    const shortMatch = /^\/p\/([^/?#]+)/.exec(pathname);
    if (!publicAppId && shortMatch?.[1]) {
      publicAppId = decodeURIComponent(shortMatch[1]);
    }
  }

  if (publicAppId) {
    return (
      <ErrorBoundary>
        <PublicAppPage appId={publicAppId} />
      </ErrorBoundary>
    );
  }

  if (view === 'login') {
    return <LoginPage onLoginSuccess={() => setView('studio')} />;
  }

  return (
    <ErrorBoundary>
      <div className={`relative min-h-screen ${isDarkMode ? 'dark-black-theme' : ''}`}>
      {/* Stay mounted while on the dashboard so “Back to start” returns to the exact screen (nav, schema explorer, forms, etc.). */}
      <div
        className={view === 'studio' ? 'min-h-screen' : 'hidden'}
        aria-hidden={view !== 'studio'}
      >
        <AiStudioLanding
          isDarkMode={isDarkMode}
          onDarkModeChange={setIsDarkMode}
          forceAiBuilderFocusToken={aiBuilderFocusToken}
          studioUserMenuIntent={studioUserMenuIntent}
          onStudioUserMenuIntentHandled={() => setStudioUserMenuIntent(null)}
          onBuildClick={(ctx) => {
            setDashboardBuild(ctx ?? null);
            setView('dashboard');
          }}
          savedDashboards={savedStudioDashboards.map((d) => ({ id: d.id, name: d.name }))}
          onOpenSavedDashboard={(dashboardId) => {
            const found = savedStudioDashboardsRef.current.find((d) => d.id === dashboardId);
            if (!found) return;
            setDashboardBuild(found.buildContext);
            setView('dashboard');
          }}
          onDeleteSavedDashboard={(dashboardId) => {
            const headers = getAuthHeaders();
            if (headers['x-user-email']) {
              void studioFetch(apiUrl(`/api/dashboards/${encodeURIComponent(dashboardId)}`), {
                method: 'DELETE',
                headers,
              });
            }
            setSavedStudioDashboards((prev) => {
              const next = prev.filter((d) => d.id !== dashboardId);
              try {
                localStorage.setItem(STUDIO_DASHBOARDS_STORAGE_KEY, JSON.stringify(next));
              } catch {
                /* best-effort */
              }
              return next;
            });
          }}
          onSignOut={() => {
            setView('login');
            setDashboardBuild(null);
          }}
          onOpenBuilderStudioScreen={(ctx) => {
            setBuilderStudioCtx(ctx);
            setView('builderStudio');
          }}
          onOpenSavedApplication={(appId) => {
            const app = savedApps.find((item) => item.id === appId);
            if (!app) return;
            const providerLabel =
              COPILOT_LLM_PROVIDERS.find((p) => p.id === app.llmProvider)?.label ?? app.llmProvider;
            const modelLabel =
              COPILOT_MODELS_BY_PROVIDER[app.llmProvider].find((m) => m.value === app.llmModel)?.label ??
              app.llmModel;
            setBuilderStudioCtx({
              prompt: app.prompt,
              dataSourceName: app.dataSourceName,
              llmProvider: app.llmProvider,
              llmModel: app.llmModel,
              llmProviderLabel: providerLabel,
              llmModelLabel: modelLabel,
              schemaConnectionId: app.schemaConnectionId,
              connectorType: app.connectorType ?? 'mysql',
              selectedTables:
                (Array.isArray(app.selectedTables) && app.selectedTables.length > 0
                  ? app.selectedTables
                  : app.lastState?.selectedTables) ?? [],
              initialState: app.lastState,
            });
            setView('builderStudio');
          }}
          onDeleteSavedApplication={(appId) => {
            const headers = getAuthHeaders();
            if (headers['x-user-email']) {
              void studioFetch(apiUrl(`/api/apps/${encodeURIComponent(appId)}`), {
                method: 'DELETE',
                headers,
              });
            }
            persistSavedApps(savedApps.filter((item) => item.id !== appId));
          }}
          savedStudioAgents={savedStudioAgents}
          onDeleteSavedStudioAgent={(agentId) => {
            const headers = getAuthHeaders();
            if (headers['x-user-email']) {
              void studioFetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}`), {
                method: 'DELETE',
                headers,
              });
            }
            setSavedStudioAgents((prev) => prev.filter((a) => a.id !== agentId));
          }}
          onAgentStudioSaved={() => {
            void loadSavedFromApi();
          }}
          savedApps={savedApps.map((app) => ({
            id: app.id,
            name: app.name,
            prompt: app.prompt,
            dataSourceName: app.dataSourceName,
          }))}
        />
      </div>

      {view === 'builderStudio' && (
        <BuilderStudioScreen
          isDarkMode={isDarkMode}
          onDarkModeChange={setIsDarkMode}
          onBack={() => setView('studio')}
          prompt={builderStudioCtx?.prompt ?? ''}
          dataSourceName={builderStudioCtx?.dataSourceName ?? 'No datasource selected'}
          llmProvider={builderStudioCtx?.llmProvider ?? 'google'}
          llmModel={builderStudioCtx?.llmModel ?? 'gemini-2.0-flash'}
          llmProviderLabel={builderStudioCtx?.llmProviderLabel ?? 'LLM'}
          llmModelLabel={builderStudioCtx?.llmModelLabel ?? 'Model'}
          schemaConnectionId={builderStudioCtx?.schemaConnectionId}
          connectorType={builderStudioCtx?.connectorType ?? 'mysql'}
          selectedTables={builderStudioCtx?.selectedTables ?? []}
          initialState={builderStudioCtx?.initialState}
          onGenerateDashboard={(ctx) => {
            setDashboardBuild(ctx);
          }}
          onSaveApplication={(app) => {
            const normalizedSelectedTables = Array.isArray(app.selectedTables)
              ? app.selectedTables.filter((t) => typeof t === 'string' && t.trim() !== '')
              : [];
            const normalizedName = String(app.name || '').trim().toLowerCase();
            const existingByName = savedApps.find(
              (item) => String(item.name || '').trim().toLowerCase() === normalizedName
            );
            const entry: SavedApp = {
              id: existingByName?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: app.name,
              prompt: app.prompt,
              dataSourceName: app.dataSourceName,
              llmProvider: app.llmProvider,
              llmModel: app.llmModel,
              schemaConnectionId: app.schemaConnectionId,
              connectorType: app.connectorType,
              selectedTables: normalizedSelectedTables,
              lastState: app.lastState,
              updatedAt: Date.now(),
            };
            persistSavedApps([entry, ...savedApps.filter((item) => item.id !== entry.id)].slice(0, 100));
            const headers = getAuthHeaders();
            if (headers['x-user-email']) {
              void studioFetch(apiUrl('/api/apps'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({
                  id: entry.id,
                  name: entry.name,
                  visibility: 'private',
                  updatedAt: entry.updatedAt,
                  payload: entry,
                }),
              });
            }
          }}
        />
      )}

      {view === 'dashboard' && (
        <Dashboard
          isDarkMode={isDarkMode}
          onDarkModeChange={setIsDarkMode}
          onBackToStart={() => {
            setAiBuilderFocusToken((v) => v + 1);
            setView('studio');
            setDashboardBuild(null);
          }}
          sessionDescription={dashboardSidebar.description}
          sessionMeta={dashboardSidebar.meta}
          dataSourceName={dashboardSidebar.dataSourceName}
          buildContext={dashboardBuild}
          onBuildDashboard={(ctx) => setDashboardBuild(ctx)}
          onUserMenuAction={(action) => {
            setAiBuilderFocusToken((v) => v + 1);
            setStudioUserMenuIntent(action);
            setView('studio');
          }}
        />
      )}
    </div>
    </ErrorBoundary>
  );
};

export default App;
