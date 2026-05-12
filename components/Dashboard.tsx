import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  KeyRound,
  Loader2,
  Moon,
  MoreHorizontal,
  PencilLine,
  Save,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { apiUrl, readApiJson, studioFetch } from '../lib/apiBase';
import { DASHBOARD_TEMPLATES } from '../lib/dashboardTemplates';
import { computeDynamicDashboard } from '../lib/dynamicDashboard';
import { buildRecommendedDataUseCases, parseTableLabelsFromSchemaTable } from '../lib/recommendedDataUseCases';
import {
  addSavedDashboard,
  deleteSavedDashboard,
  listSavedDashboards,
  type SavedDashboardRecord,
} from '../lib/savedDashboardsStorage';
import {
  BarTrendChart,
  CategoryDonut,
  HistogramBars,
  NumericChartBlock,
  SvgTrendChart,
} from './DashboardChartViews';
import {
  COPILOT_LLM_PROVIDERS,
  COPILOT_MODELS_BY_PROVIDER,
  type CopilotLlmProviderId,
  type DashboardBuildContext,
} from './AiStudioLanding';

export type DashboardUserMenuAction = 'profile' | 'change-password' | 'feedback';

type DashboardPanelId =
  | 'kpis'
  | 'trend'
  | 'category'
  | 'histogram'
  | 'secondary'
  | 'comparison'
  | 'dataTable';

function RemovableDashboardPanel({
  panelId,
  isDarkMode,
  onRemove,
  children,
  className = '',
}: {
  panelId: DashboardPanelId;
  isDarkMode: boolean;
  onRemove: (id: DashboardPanelId) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => onRemove(panelId)}
        className={`absolute right-2 top-2 z-10 rounded-md p-1.5 shadow-sm transition-colors ${
          isDarkMode
            ? 'bg-slate-800/90 text-slate-400 hover:bg-rose-950/90 hover:text-rose-300'
            : 'bg-white/90 text-slate-400 hover:bg-rose-50 hover:text-rose-600'
        }`}
        title="Remove from dashboard"
        aria-label="Remove from dashboard"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}

export interface DashboardProps {
  /** Return to main AI Studio landing */
  onBackToStart?: () => void;
  /** Full page (AI Studio) vs embedded in App Builder preview panel */
  layout?: 'page' | 'embedded';
  /** Shown under “Code assistant” — typically the user’s build prompt or goal */
  sessionDescription?: string;
  /** Second line, e.g. model / provider */
  sessionMeta?: string;
  /** Active connection / Excel / workspace label, shown above the file list */
  dataSourceName?: string;
  /** Matches AI Studio theme */
  isDarkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
  /** Profile / change-password: return to studio with the same prompts as the main header. Feedback is handled in-dashboard (mailto). */
  onUserMenuAction?: (action: Exclude<DashboardUserMenuAction, 'feedback'>) => void;
  /** Last build from studio or from this screen — used to sync Co-Pilot fields */
  buildContext?: DashboardBuildContext | null;
  /** Persist Co-Pilot build (updates Code assistant + session meta) */
  onBuildDashboard?: (ctx: DashboardBuildContext) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onBackToStart,
  layout = 'page',
  sessionDescription = 'Generated data dashboard',
  sessionMeta = 'XeroCode.ai · Preview',
  dataSourceName = 'Workspace',
  isDarkMode,
  onDarkModeChange,
  onUserMenuAction,
  buildContext,
  onBuildDashboard,
}) => {
  const isEmbedded = layout === 'embedded';
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [copilotLlmProvider, setCopilotLlmProvider] = useState<CopilotLlmProviderId>('google');
  const [copilotModel, setCopilotModel] = useState(
    () => COPILOT_MODELS_BY_PROVIDER.google[0]?.value ?? 'gemini-2.0-flash'
  );
  const [copilotNlPrompt, setCopilotNlPrompt] = useState('');
  /** null = use default name from table / context; string = user-edited display name */
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [savedListTick, setSavedListTick] = useState(0);
  const pendingDismissedRef = useRef<DashboardPanelId[] | null>(null);
  const dataSourceKeyRef = useRef<string | null>(null);
  const [designAttachments, setDesignAttachments] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const designInputRef = useRef<HTMLInputElement>(null);
  const [liveColumns, setLiveColumns] = useState<Array<{ name: string; type?: string }>>([]);
  const [liveRows, setLiveRows] = useState<string[][]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dismissedPanels, setDismissedPanels] = useState(() => new Set<DashboardPanelId>());

  const connId = buildContext?.schemaConnectionId;
  const schemaTable = buildContext?.schemaTable;
  const excelSnap = buildContext?.excelDashboardSnapshot;
  const embeddedSnap = buildContext?.embeddedDashboardData;

  useEffect(() => {
    if (embeddedSnap?.rows?.length) {
      setLiveColumns(embeddedSnap.columns ?? []);
      setLiveRows(embeddedSnap.rows);
      setDataError(null);
      setDataLoading(false);
      return;
    }
    if (excelSnap?.rows?.length) {
      setLiveColumns(excelSnap.columns ?? []);
      setLiveRows(excelSnap.rows);
      setDataError(null);
      setDataLoading(false);
      return;
    }
    if (!connId || !schemaTable) {
      setLiveColumns([]);
      setLiveRows([]);
      setDataError(null);
      setDataLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        const qs = new URLSearchParams({ table: schemaTable, limit: '500', offset: '0' });
        const res = await studioFetch(apiUrl(`/api/connections/${connId}/table-data?${qs}`));
        const data = await readApiJson<{
          columns?: Array<{ name: string; type?: string }>;
          rows?: string[][];
          message?: string;
        }>(res);
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          throw new Error(
            typeof data?.message === 'string' ? data.message : `Could not load data (HTTP ${res.status})`
          );
        }
        setLiveColumns(data.columns?.map((c) => ({ name: c.name, type: c.type })) ?? []);
        setLiveRows(data.rows ?? []);
      } catch (e) {
        if (!cancelled) {
          setLiveColumns([]);
          setLiveRows([]);
          setDataError(e instanceof Error ? e.message : 'Could not load table data');
        }
      } finally {
        if (!cancelled) {
          setDataLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connId, schemaTable, excelSnap, embeddedSnap]);

  const excelDataKey = useMemo(() => {
    if (!excelSnap?.rows?.length) {
      return '';
    }
    const cols = (excelSnap.columns ?? []).map((c) => c.name).join('\0');
    return `x:${cols}:${excelSnap.rows.length}`;
  }, [excelSnap]);

  const embeddedDataKey = useMemo(() => {
    if (!embeddedSnap?.rows?.length) {
      return '';
    }
    const cols = (embeddedSnap.columns ?? []).map((c) => c.name).join('\0');
    return `emb:${cols}:${embeddedSnap.rows.length}`;
  }, [embeddedSnap]);

  /** Hydrate Co-Pilot from studio only when this session actually changes (avoids clobbering edits if buildContext is a new object reference). */
  const copilotSessionKey = useMemo(() => {
    if (!buildContext) {
      return '';
    }
    return [
      connId ?? '',
      schemaTable ?? '',
      excelDataKey,
      embeddedDataKey,
      buildContext.prompt ?? '',
      buildContext.dashboardTitle ?? '',
      buildContext.llmProvider ?? '',
      buildContext.llmModel ?? '',
    ].join('\u0001');
  }, [buildContext, connId, schemaTable, excelDataKey, embeddedDataKey]);

  useEffect(() => {
    const k = `${connId ?? ''}|${schemaTable ?? ''}|${excelDataKey}|${embeddedDataKey}`;
    const pending = pendingDismissedRef.current;
    pendingDismissedRef.current = null;
    if (pending) {
      setDismissedPanels(new Set(pending));
      dataSourceKeyRef.current = k;
      return;
    }
    if (dataSourceKeyRef.current !== k) {
      dataSourceKeyRef.current = k;
      setDismissedPanels(new Set());
    }
  }, [connId, schemaTable, excelDataKey, embeddedDataKey]);

  const dismissPanel = useCallback((id: DashboardPanelId) => {
    setDismissedPanels((prev) => new Set(prev).add(id));
  }, []);

  const onNlPromptChange = useCallback((value: string) => {
    setCopilotNlPrompt(value);
  }, []);

  /** Bumps dashboard recompute when the user explicitly applies the prompt (covers edge cases; also sets prompt dirty). */
  const [layoutApplyTick, setLayoutApplyTick] = useState(0);
  const applyLayoutFromPrompt = useCallback(() => {
    setLayoutApplyTick((n) => n + 1);
    // Bring removed panels back so prompt changes are visible immediately.
    setDismissedPanels(new Set());
  }, []);

  // On-screen prompt for layout; embedded builder preview has no co-pilot panel, so fall back to build context.
  const effectivePrompt =
    copilotNlPrompt.trim() || (isEmbedded ? buildContext?.prompt?.trim() ?? '' : '');

  const dashboardView = useMemo(
    () =>
      computeDynamicDashboard(liveColumns, liveRows, {
        userPrompt: effectivePrompt,
        tableLabel: schemaTable,
        dataSourceLabel: dataSourceName,
      }),
    [liveColumns, liveRows, effectivePrompt, layoutApplyTick, schemaTable, dataSourceName]
  );

  const recommendedCoPilotUseCases = useMemo(() => {
    const fromSchema = parseTableLabelsFromSchemaTable(schemaTable);
    const extras: string[] = [];
    if (excelSnap?.sheetLabel) {
      extras.push(excelSnap.sheetLabel);
    }
    if (excelSnap?.fileLabel) {
      extras.push(excelSnap.fileLabel);
    }
    const tableLabels = [...new Set([...fromSchema, ...extras].filter(Boolean))];
    const colNames = liveColumns.map((c) => c.name);
    const multiTable =
      (schemaTable?.includes('+') ?? false) ||
      tableLabels.length > 1 ||
      colNames.some((n) => n === '_source');
    return buildRecommendedDataUseCases({
      connectorType: buildContext?.connectorType,
      tableLabels: tableLabels.length ? tableLabels : fromSchema,
      columnNames: colNames,
      multiTable,
      dataSourceHint: dataSourceName,
    });
  }, [
    schemaTable,
    excelSnap?.sheetLabel,
    excelSnap?.fileLabel,
    liveColumns,
    buildContext?.connectorType,
    dataSourceName,
  ]);

  const defaultDashboardTitle = useMemo(() => {
    const fromCtx = buildContext?.dashboardTitle?.trim();
    if (fromCtx) {
      return fromCtx;
    }
    if (schemaTable?.trim()) {
      return `Dashboard · ${schemaTable.trim()}`;
    }
    const xl = excelSnap?.fileLabel?.trim() || excelSnap?.sheetLabel?.trim();
    if (xl) {
      return `Dashboard · ${xl}`;
    }
    return 'Dashboard';
  }, [buildContext?.dashboardTitle, schemaTable, excelSnap?.fileLabel, excelSnap?.sheetLabel]);

  const displayTitle = titleDraft !== null ? titleDraft : defaultDashboardTitle;

  const savedDashboards = useMemo(() => listSavedDashboards(), [savedListTick]);

  const excelKeyFromBuildContext = useCallback(
    (ctx: DashboardBuildContext | null | undefined) => {
      const emb = ctx?.embeddedDashboardData;
      if (emb?.rows?.length) {
        const cols = (emb.columns ?? []).map((c) => c.name).join('\0');
        return `emb:${cols}:${emb.rows.length}`;
      }
      const snap = ctx?.excelDashboardSnapshot;
      if (!snap?.rows?.length) {
        return '';
      }
      const cols = (snap.columns ?? []).map((c) => c.name).join('\0');
      return `x:${cols}:${snap.rows.length}`;
    },
    []
  );

  const dataSourceComparableKey = useMemo(
    () => `${connId ?? ''}|${schemaTable ?? ''}|${excelDataKey}|${embeddedDataKey}`,
    [connId, schemaTable, excelDataKey, embeddedDataKey]
  );

  const handleSaveCurrentDashboard = useCallback(() => {
    if (!buildContext) {
      return;
    }
    const listName = saveNameInput.trim() || displayTitle.trim() || 'Untitled dashboard';
    const snapshot: DashboardBuildContext = {
      ...buildContext,
      prompt: effectivePrompt || undefined,
      dashboardTitle: displayTitle.trim() || undefined,
      llmProvider: copilotLlmProvider,
      llmModel: copilotModel,
      dataSourceName: buildContext.dataSourceName ?? dataSourceName,
    };
    const res = addSavedDashboard({
      name: listName,
      buildContext: snapshot,
      dismissedPanelIds: [...dismissedPanels],
    });
    if (res.ok) {
      setSaveNameInput('');
      setSavedListTick((n) => n + 1);
    } else {
      window.alert(res.error);
    }
  }, [
    buildContext,
    saveNameInput,
    displayTitle,
    effectivePrompt,
    copilotLlmProvider,
    copilotModel,
    dataSourceName,
    dismissedPanels,
  ]);

  const handleLoadSavedDashboard = useCallback(
    (r: SavedDashboardRecord) => {
      const nextKey = `${r.buildContext.schemaConnectionId ?? ''}|${r.buildContext.schemaTable ?? ''}|${excelKeyFromBuildContext(r.buildContext)}`;
      if (nextKey === dataSourceComparableKey) {
        setDismissedPanels(new Set(r.dismissedPanelIds as DashboardPanelId[]));
      } else {
        pendingDismissedRef.current = r.dismissedPanelIds as DashboardPanelId[];
      }
      onBuildDashboard?.(r.buildContext);
    },
    [dataSourceComparableKey, excelKeyFromBuildContext, onBuildDashboard]
  );

  const handleDeleteSavedDashboard = useCallback((id: string) => {
    deleteSavedDashboard(id);
    setSavedListTick((n) => n + 1);
  }, []);

  const truncateCell = (s: string, max = 56) => {
    const t = String(s ?? '');
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };

  useEffect(() => {
    if (!buildContext || !copilotSessionKey) {
      return;
    }
    const p = buildContext.llmProvider as CopilotLlmProviderId | undefined;
    if (p && COPILOT_LLM_PROVIDERS.some((x) => x.id === p)) {
      setCopilotLlmProvider(p);
    }
    if (buildContext.llmModel) {
      setCopilotModel(buildContext.llmModel);
    }
    setCopilotNlPrompt(buildContext.prompt?.trim() ?? '');
    setTitleDraft(null);
  }, [copilotSessionKey, buildContext]);

  useEffect(() => {
    const models = COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider];
    if (!models.some((m) => m.value === copilotModel)) {
      setCopilotModel(models[0]?.value ?? copilotModel);
    }
  }, [copilotLlmProvider, copilotModel]);

  useEffect(() => {
    return () => {
      for (const a of designAttachments) {
        URL.revokeObjectURL(a.previewUrl);
      }
    };
  }, [designAttachments]);

  const handleDesignFiles = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!picked.length) {
      return;
    }
    setDesignAttachments((prev) => {
      const next = [...prev];
      for (const f of picked) {
        next.push({ file: f, previewUrl: URL.createObjectURL(f) });
      }
      return next;
    });
  };

  const removeDesignAttachment = (index: number) => {
    setDesignAttachments((prev) => {
      const target = prev[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearDesignLayout = () => {
    setDesignAttachments((prev) => {
      for (const a of prev) {
        URL.revokeObjectURL(a.previewUrl);
      }
      return [];
    });
    if (designInputRef.current) {
      designInputRef.current.value = '';
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read design image.'));
      reader.readAsDataURL(file);
    });

  const emitBuildDashboard = (ctx: DashboardBuildContext) => {
    onBuildDashboard?.(ctx);
  };

  const handleBuildDashboardClick = () => {
    const promptText = copilotNlPrompt.trim();
    const base: DashboardBuildContext = {
      prompt: promptText || undefined,
      dashboardTitle: displayTitle.trim() || undefined,
      llmProvider: copilotLlmProvider,
      llmModel: copilotModel,
      dataSourceName,
      schemaConnectionId: buildContext?.schemaConnectionId,
      connectorType: buildContext?.connectorType,
      schemaTable: buildContext?.schemaTable,
      excelDashboardSnapshot: buildContext?.excelDashboardSnapshot,
      embeddedDashboardData: buildContext?.embeddedDashboardData,
    };
    if (designAttachments.length === 0) {
      emitBuildDashboard(base);
      return;
    }
    void (async () => {
      const items = await Promise.all(
        designAttachments.map(async (a) => ({
          name: a.file.name,
          dataUrl: await readFileAsDataUrl(a.file),
        }))
      );
      emitBuildDashboard({
        ...base,
        designLayoutFileName: items[0]?.name,
        designLayoutDataUrl: items[0]?.dataUrl,
        designLayoutFiles: items,
      });
    })();
  };

  const handleUserMenuAction = (action: DashboardUserMenuAction) => {
    setIsUserMenuOpen(false);
    if (action === 'feedback') {
      window.open('mailto:feedback@dashx.ai?subject=XeroCode.ai%20Feedback', '_blank');
      return;
    }
    onUserMenuAction?.(action);
  };

  const userMenuDropdown = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsUserMenuOpen((prev) => !prev)}
        className={`h-8 rounded-full border pl-1.5 pr-2 inline-flex items-center gap-2 ${
          isDarkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'
        }`}
        title="User menu"
      >
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-[10px] font-semibold inline-flex items-center justify-center">
          NC
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isUserMenuOpen && (
        <div
          className={`absolute right-0 top-10 w-60 rounded-xl border shadow-lg z-30 ${
            isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          }`}
        >
          <div className={`px-3 py-3 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center">
                NC
              </span>
              <div>
                <p className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>
                  Niraj Chatri
                </p>
                <p className="text-[11px] text-slate-400">nirajchatri@gmail.com</p>
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
  );

  return (
    <div
      className={`flex flex-col ${
        isEmbedded
          ? `h-full min-h-0 min-w-0 ${isDarkMode ? 'bg-black text-slate-100' : 'bg-slate-50 text-slate-900'}`
          : `min-h-screen ${isDarkMode ? 'bg-black text-slate-100' : 'bg-slate-50 text-slate-900'}`
      }`}
    >
      {!isEmbedded && (
      <header
        className={`shrink-0 flex items-center px-4 py-3 border-b lg:hidden ${
          isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-white'
        }`}
      >
        <button
          type="button"
          onClick={() => onBackToStart?.()}
          className={`text-xs flex items-center gap-1.5 transition-colors ${
            isDarkMode
              ? 'text-slate-400 hover:text-slate-100'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          Back to start
        </button>
      </header>
      )}

      {!isEmbedded && (
      <div
        className={`lg:hidden shrink-0 border-b px-4 py-3 ${
          isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <Bookmark className={`h-3.5 w-3.5 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`} />
          <p className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
            Saved dashboards
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={saveNameInput}
            onChange={(e) => setSaveNameInput(e.target.value)}
            placeholder="Save as…"
            className={`min-w-0 flex-1 rounded-md border px-2 py-1.5 text-[11px] outline-none ${
              isDarkMode
                ? 'border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600'
                : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'
            }`}
          />
          <button
            type="button"
            disabled={!buildContext}
            onClick={handleSaveCurrentDashboard}
            className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
        <div className="mt-2 max-h-28 overflow-auto space-y-1">
          {savedDashboards.length === 0 ? (
            <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>No saves.</p>
          ) : (
            savedDashboards.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${
                  isDarkMode ? 'border-slate-800' : 'border-slate-200'
                }`}
              >
                <span
                  className={`min-w-0 truncate text-[10px] font-medium ${
                    isDarkMode ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  {s.name}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => handleLoadSavedDashboard(s)}
                    className="text-[10px] font-medium text-violet-500"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSavedDashboard(s.id)}
                    className="text-[10px] text-slate-500"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      )}

      <div className={`flex flex-1 min-h-0 ${isEmbedded ? 'min-w-0 flex-col' : 'flex-col lg:flex-row'}`}>
        {/* Desktop: saved dashboards + Co-Pilot */}
        {!isEmbedded && (
        <div
          className={`hidden lg:flex shrink-0 min-h-0 border-r ${
            isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-white'
          }`}
        >
          <aside
            className={`flex w-[15rem] shrink-0 flex-col border-r min-h-0 ${
              isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-white'
            }`}
          >
            <div
              className={`flex h-12 shrink-0 items-center gap-1.5 px-3 border-b ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              <Bookmark className={`h-3.5 w-3.5 shrink-0 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`} />
              <span
                className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
              >
                Saved dashboards
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-auto p-3 min-h-0">
              <p
                className={`text-[10px] leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}
              >
                Stored in this browser. Saves data source, layout prompt, hidden panels, and display name.
              </p>
              <input
                type="text"
                value={saveNameInput}
                onChange={(e) => setSaveNameInput(e.target.value)}
                placeholder="Name for this save…"
                className={`w-full rounded-md border px-2 py-1.5 text-[11px] outline-none ${
                  isDarkMode
                    ? 'border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600'
                    : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'
                }`}
              />
              <button
                type="button"
                disabled={!buildContext}
                onClick={handleSaveCurrentDashboard}
                className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-40 ${
                  isDarkMode
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'bg-violet-600 text-white hover:bg-violet-500'
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                Save current
              </button>
              <ul className="min-h-0 flex-1 space-y-2 overflow-auto">
                {savedDashboards.length === 0 ? (
                  <li
                    className={`rounded-lg border border-dashed px-2 py-3 text-center text-[10px] ${
                      isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-500'
                    }`}
                  >
                    No saves yet.
                  </li>
                ) : (
                  savedDashboards.map((s) => (
                    <li
                      key={s.id}
                      className={`rounded-lg border p-2 ${
                        isDarkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50/80'
                      }`}
                    >
                      <p
                        className={`truncate text-[11px] font-medium ${
                          isDarkMode ? 'text-slate-200' : 'text-slate-800'
                        }`}
                        title={s.name}
                      >
                        {s.name}
                      </p>
                      <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        {new Date(s.savedAt).toLocaleString()}
                      </p>
                      <div className="mt-1.5 flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleLoadSavedDashboard(s)}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                            isDarkMode
                              ? 'bg-slate-800 text-violet-300 hover:bg-slate-700'
                              : 'bg-violet-100 text-violet-800 hover:bg-violet-200'
                          }`}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedDashboard(s.id)}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                            isDarkMode
                              ? 'text-slate-400 hover:bg-rose-950/50 hover:text-rose-300'
                              : 'text-slate-500 hover:bg-rose-50 hover:text-rose-700'
                          }`}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </aside>

          <aside
            className={`flex w-[21rem] shrink-0 flex-col min-h-0 min-w-0 ${
              isDarkMode ? 'bg-black' : 'bg-white'
            }`}
          >
          <div
            className={`flex h-12 shrink-0 items-center px-4 border-b ${
              isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-white'
            }`}
          >
            <button
              type="button"
              onClick={() => onBackToStart?.()}
              className={`text-xs flex items-center gap-1.5 transition-colors ${
                isDarkMode
                  ? 'text-slate-400 hover:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Back to start</span>
            </button>
          </div>

          <div
            className={`px-4 py-3 border-b ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <p
              className={`text-[11px] uppercase tracking-wide mb-1 ${
                isDarkMode ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              Code assistant
            </p>
            <p
              className={`text-xs font-medium line-clamp-3 ${
                isDarkMode ? 'text-slate-200' : 'text-slate-800'
              }`}
            >
              {sessionDescription}
            </p>
            <p
              className={`text-[11px] mt-1 line-clamp-2 ${
                isDarkMode ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {sessionMeta}
            </p>
          </div>

          <div className="flex-1 overflow-auto px-4 py-3 min-h-0">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles
                  className={`h-3.5 w-3.5 shrink-0 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`}
                />
                <p
                  className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
                >
                  AI Dashboard Assistant
                </p>
              </div>
              <p
                className={`mt-1 text-[10px] leading-relaxed ${
                  isDarkMode ? 'text-slate-500' : 'text-slate-500'
                }`}
              >
                The layout prompt adjusts charts and tables in the preview. Optionally attach a layout image.
              </p>

              <div className="mt-3 space-y-3">
                <div>
                  <p
                    className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      isDarkMode ? 'text-slate-500' : 'text-slate-500'
                    }`}
                  >
                    LLM providers
                  </p>
                  <div className="relative">
                    <select
                      value={copilotLlmProvider}
                      onChange={(e) => setCopilotLlmProvider(e.target.value as CopilotLlmProviderId)}
                      className={`h-9 w-full appearance-none rounded-md border px-2.5 pr-8 text-[11px] outline-none ${
                        isDarkMode
                          ? 'border-slate-800 bg-slate-950 text-slate-200'
                          : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      {COPILOT_LLM_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                        isDarkMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <p
                    className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      isDarkMode ? 'text-slate-500' : 'text-slate-500'
                    }`}
                  >
                    Model
                  </p>
                  <div className="relative">
                    <select
                      value={copilotModel}
                      onChange={(e) => setCopilotModel(e.target.value)}
                      className={`h-9 w-full appearance-none rounded-md border px-2.5 pr-8 text-[11px] outline-none ${
                        isDarkMode
                          ? 'border-slate-800 bg-slate-950 text-slate-200'
                          : 'border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      {COPILOT_MODELS_BY_PROVIDER[copilotLlmProvider].map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                        isDarkMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <p
                    className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      isDarkMode ? 'text-slate-500' : 'text-slate-500'
                    }`}
                  >
                    Natural language prompt
                  </p>
                  <input
                    ref={designInputRef}
                    type="file"
                    multiple
                    accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                    className="hidden"
                    onChange={(e) => {
                      handleDesignFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <div className="relative">
                    {designAttachments.length > 0 && (
                      <div className="absolute left-2 top-2 z-10 flex max-w-[85%] items-center gap-1 overflow-x-auto rounded-md border border-slate-700/60 bg-black/40 p-1">
                        {designAttachments.map((a, i) => (
                          <div key={`${a.file.name}-${i}`} className="relative shrink-0">
                            <img src={a.previewUrl} alt="Attached design" className="h-8 w-8 rounded object-cover" />
                            <button
                              type="button"
                              onClick={() => removeDesignAttachment(i)}
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
                      onChange={(e) => onNlPromptChange(e.target.value)}
                      rows={4}
                      placeholder="e.g. Revenue trend, KPI cards, and a transactions table filtered by region…"
                      className={`w-full resize-none rounded-md border px-2.5 pb-9 pr-10 text-[11px] leading-relaxed outline-none ${
                        designAttachments.length > 0 ? 'pt-12' : 'pt-2'
                      } ${
                        isDarkMode
                          ? 'border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600'
                          : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => designInputRef.current?.click()}
                      className={`absolute bottom-2 right-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
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
                  <p
                    className={`mt-1.5 text-[10px] leading-relaxed ${
                      isDarkMode ? 'text-slate-500' : 'text-slate-500'
                    }`}
                  >
                    Layout reacts to phrases like <span className="font-medium">line chart</span>,{' '}
                    <span className="font-medium">donut</span>, <span className="font-medium">histogram</span>,{' '}
                    <span className="font-medium">hide KPIs</span>, <span className="font-medium">compare</span>.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={applyLayoutFromPrompt}
                    className={`h-9 w-full rounded-lg border text-xs font-semibold shadow-sm ${
                      isDarkMode
                        ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    Apply layout from prompt
                  </button>
                  <button
                    type="button"
                    onClick={handleBuildDashboardClick}
                    className="h-9 w-full rounded-lg bg-violet-600 text-xs font-semibold text-white shadow-sm hover:bg-violet-500"
                  >
                    Build Dashboard
                  </button>
                </div>

                <div
                  className={`border-t pt-4 ${isDarkMode ? 'border-slate-800/80' : 'border-slate-200'}`}
                >
                  <p
                    className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                      isDarkMode ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Dashboard templates
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {DASHBOARD_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          onNlPromptChange(tpl.prompt);
                          setTitleDraft(`${tpl.title} Dashboard`);
                          applyLayoutFromPrompt();
                        }}
                        className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          isDarkMode
                            ? 'border-slate-800 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900'
                            : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                        }`}
                        title={tpl.summary}
                      >
                        <p className={`text-[11px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {tpl.title}
                        </p>
                        <p className={`mt-0.5 text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                          {tpl.summary}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className={`border-t pt-4 ${isDarkMode ? 'border-slate-800/80' : 'border-slate-200'}`}
                >
                  <p
                    className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                      isDarkMode ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Recommended dashboard use case
                  </p>
                  <ul className="mt-2 space-y-2">
                    {recommendedCoPilotUseCases.map((item) => (
                      <li key={item.title}>
                        <button
                          type="button"
                          onClick={() => onNlPromptChange(`${item.title}: ${item.body}`)}
                          className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            isDarkMode
                              ? 'border-slate-800 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900'
                              : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                          }`}
                        >
                          <p
                            className={`text-[11px] font-semibold ${
                              isDarkMode ? 'text-slate-200' : 'text-slate-800'
                            }`}
                          >
                            {item.title}
                          </p>
                          <p
                            className={`mt-0.5 text-[10px] leading-relaxed ${
                              isDarkMode ? 'text-slate-500' : 'text-slate-600'
                            }`}
                          >
                            {item.body}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </aside>
        </div>
        )}

        {/* Main dashboard area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!isEmbedded && (
          <header
            className={`flex h-12 shrink-0 items-center justify-end px-6 lg:px-10 border-b ${
              isDarkMode ? 'border-slate-800 bg-black' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                className={
                  isDarkMode
                    ? 'text-slate-400 hover:text-slate-100'
                    : 'text-slate-500 hover:text-slate-900'
                }
              >
                Device
              </button>
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
              {userMenuDropdown}
            </div>
          </header>
          )}

          <main
            className={`min-h-0 flex-1 overflow-auto px-4 py-6 lg:px-10 ${
              isDarkMode ? 'bg-black' : 'bg-slate-50'
            } ${isEmbedded ? 'pt-4' : ''}`}
          >
            <div className="max-w-6xl mx-auto">
              {dataLoading && !!connId && (
                <div
                  className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-900 text-slate-300'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-80" />
                  Loading data from your connection…
                </div>
              )}
              {dataError && (
                <div
                  className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
                    isDarkMode
                      ? 'border-rose-500/40 bg-rose-950/40 text-rose-200'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {dataError}
                </div>
              )}

              {!isEmbedded && (
              <div
                className={`lg:hidden mb-5 rounded-xl border p-3 ${
                  isDarkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles
                    className={`h-3.5 w-3.5 shrink-0 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`}
                  />
                  <p
                    className={`text-xs font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
                  >
                    Dashboard prompt
                  </p>
                </div>
                <p
                  className={`mb-2 text-[10px] leading-relaxed ${
                    isDarkMode ? 'text-slate-500' : 'text-slate-600'
                  }`}
                >
                  Charts and tables update from this text as you type (line chart, donut, histogram, hide KPIs,
                  etc.).
                </p>
                <div className="relative mb-2">
                  {designAttachments.length > 0 && (
                    <div className="absolute left-2 top-2 z-10 flex max-w-[85%] items-center gap-1 overflow-x-auto rounded-md border border-slate-700/60 bg-black/40 p-1">
                      {designAttachments.map((a, i) => (
                        <div key={`${a.file.name}-m-${i}`} className="relative shrink-0">
                          <img src={a.previewUrl} alt="Attached design" className="h-8 w-8 rounded object-cover" />
                          <button
                            type="button"
                            onClick={() => removeDesignAttachment(i)}
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
                    onChange={(e) => onNlPromptChange(e.target.value)}
                    rows={4}
                    placeholder="e.g. Line chart for trend, donut for categories, comparison table…"
                    className={`w-full resize-none rounded-md border px-2.5 pb-9 pr-10 text-[11px] leading-relaxed outline-none ${
                      designAttachments.length > 0 ? 'pt-12' : 'pt-2'
                    } ${
                      isDarkMode
                        ? 'border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600'
                        : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => designInputRef.current?.click()}
                    className={`absolute bottom-2 right-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
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
                <button
                  type="button"
                  onClick={applyLayoutFromPrompt}
                  className={`mb-2 h-9 w-full rounded-lg border text-xs font-semibold shadow-sm ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Apply layout from prompt
                </button>
                <button
                  type="button"
                  onClick={handleBuildDashboardClick}
                  className="h-9 w-full rounded-lg bg-violet-600 text-xs font-semibold text-white shadow-sm hover:bg-violet-500"
                >
                  Build Dashboard
                </button>
              </div>
              )}

              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs leading-relaxed line-clamp-3 ${
                      isDarkMode ? 'text-slate-500' : 'text-slate-600'
                    }`}
                  >
                    {dashboardView.subtitle}
                  </p>
                  {dashboardView.promptIterations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {dashboardView.promptIterations.map((line) => (
                        <span
                          key={line}
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            isDarkMode
                              ? 'border-violet-500/40 bg-violet-950/50 text-violet-200'
                              : 'border-violet-200 bg-violet-50 text-violet-800'
                          }`}
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {dashboardView.showKpiRow &&
              dashboardView.kpis.length > 0 &&
              !dismissedPanels.has('kpis') ? (
                <RemovableDashboardPanel
                  panelId="kpis"
                  isDarkMode={isDarkMode}
                  onRemove={dismissPanel}
                  className="mb-5"
                >
                  <div
                    className={`grid gap-4 pr-8 pt-1 ${
                      dashboardView.kpis.length <= 2
                        ? 'sm:grid-cols-2'
                        : dashboardView.kpis.length <= 4
                          ? 'sm:grid-cols-2 lg:grid-cols-4'
                          : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
                    }`}
                  >
                    {dashboardView.kpis.map((card) => (
                      <div
                        key={card.label}
                        className={`flex flex-col justify-between rounded-2xl border p-4 ${
                          isDarkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <p
                          className={`mb-1 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
                        >
                          {card.label}
                        </p>
                        <p
                          className={`text-base font-semibold ${
                            isDarkMode ? 'text-slate-100' : 'text-slate-900'
                          }`}
                        >
                          {card.value}
                        </p>
                        {card.subtitle ? (
                          <p
                            className={`mt-2 text-[11px] leading-snug ${
                              isDarkMode ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {card.subtitle}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </RemovableDashboardPanel>
              ) : null}

              {(() => {
                const showTrend = !dismissedPanels.has('trend');
                const showCategory = !dismissedPanels.has('category');
                if (!showTrend && !showCategory) {
                  return null;
                }
                const both = showTrend && showCategory;
                return (
                  <div className={`mb-6 grid gap-4 ${both ? 'lg:grid-cols-3' : ''}`}>
                    {showTrend && (
                      <RemovableDashboardPanel
                        panelId="trend"
                        isDarkMode={isDarkMode}
                        onRemove={dismissPanel}
                        className={both ? 'lg:col-span-2' : ''}
                      >
                        <div
                          className={`h-full rounded-2xl border p-4 ${
                            isDarkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="mb-3 pr-7">
                            <p
                              className={`text-xs font-semibold ${
                                isDarkMode ? 'text-slate-100' : 'text-slate-800'
                              }`}
                            >
                              {dashboardView.trendTitle}
                            </p>
                            <p
                              className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                            >
                              {dashboardView.trendSubtitle}
                            </p>
                          </div>
                          {dashboardView.trendBars.length > 0 ? (
                            dashboardView.trendRenderMode === 'bars' ? (
                              <BarTrendChart bars={dashboardView.trendBars} isDarkMode={isDarkMode} />
                            ) : (
                              <SvgTrendChart
                                points={dashboardView.trendLinePoints}
                                mode={dashboardView.trendRenderMode === 'area' ? 'area' : 'line'}
                                isDarkMode={isDarkMode}
                              />
                            )
                          ) : (
                            <div
                              className={`flex h-44 items-center justify-center rounded-xl border border-dashed text-xs ${
                                isDarkMode
                                  ? 'border-slate-700 bg-slate-950/50 text-slate-500'
                                  : 'border-slate-200 bg-slate-50 text-slate-400'
                              }`}
                            >
                              Add a numeric column in your data to see a bar snapshot
                            </div>
                          )}
                        </div>
                      </RemovableDashboardPanel>
                    )}
                    {showCategory && (
                      <RemovableDashboardPanel
                        panelId="category"
                        isDarkMode={isDarkMode}
                        onRemove={dismissPanel}
                        className=""
                      >
                        <div
                          className={`h-full rounded-2xl border p-4 ${
                            isDarkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="mb-3 flex items-center justify-between pr-7">
                            <p
                              className={`text-xs font-semibold ${
                                isDarkMode ? 'text-slate-100' : 'text-slate-800'
                              }`}
                            >
                              {dashboardView.categoryTitle}
                            </p>
                            <MoreHorizontal
                              className={`h-4 w-4 shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                            />
                          </div>
                          {dashboardView.categorySegments.length > 0 ? (
                            dashboardView.categoryAsDonut ? (
                              <CategoryDonut
                                segments={dashboardView.categorySegments}
                                isDarkMode={isDarkMode}
                              />
                            ) : (
                              <div className="space-y-2.5">
                                {dashboardView.categorySegments.map((s) => (
                                  <div key={s.label}>
                                    <div className="mb-0.5 flex justify-between gap-2 text-[11px]">
                                      <span
                                        className={`min-w-0 truncate ${
                                          isDarkMode ? 'text-slate-300' : 'text-slate-700'
                                        }`}
                                      >
                                        {s.label}
                                      </span>
                                      <span className={isDarkMode ? 'text-slate-500' : 'text-slate-500'}>
                                        {s.pct}%
                                      </span>
                                    </div>
                                    <div
                                      className={`h-1.5 overflow-hidden rounded-full ${
                                        isDarkMode ? 'bg-slate-800' : 'bg-slate-100'
                                      }`}
                                    >
                                      <div
                                        className="h-full rounded-full bg-violet-500"
                                        style={{ width: `${Math.min(100, s.pct)}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            <div
                              className={`flex min-h-[10rem] items-center justify-center text-center text-xs ${
                                isDarkMode ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              No categorical breakdown (need a text column with a few distinct values)
                            </div>
                          )}
                        </div>
                      </RemovableDashboardPanel>
                    )}
                  </div>
                );
              })()}

              {dashboardView.histogram && !dismissedPanels.has('histogram') ? (
                <RemovableDashboardPanel
                  panelId="histogram"
                  isDarkMode={isDarkMode}
                  onRemove={dismissPanel}
                  className="mb-6"
                >
                  <div
                    className={`rounded-2xl border p-4 ${
                      isDarkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="mb-3 pr-7">
                      <p
                        className={`text-xs font-semibold ${
                          isDarkMode ? 'text-slate-100' : 'text-slate-800'
                        }`}
                      >
                        {dashboardView.histogram.title}
                      </p>
                      <p
                        className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        {dashboardView.histogram.subtitle}
                      </p>
                    </div>
                    <HistogramBars bars={dashboardView.histogram.bars} isDarkMode={isDarkMode} />
                  </div>
                </RemovableDashboardPanel>
              ) : null}

              {dashboardView.secondaryChart && !dismissedPanels.has('secondary') ? (
                <RemovableDashboardPanel
                  panelId="secondary"
                  isDarkMode={isDarkMode}
                  onRemove={dismissPanel}
                  className="mb-6"
                >
                  <NumericChartBlock
                    title={dashboardView.secondaryChart.title}
                    subtitle={dashboardView.secondaryChart.subtitle}
                    mode={dashboardView.secondaryChart.mode}
                    bars={dashboardView.secondaryChart.bars}
                    linePoints={dashboardView.secondaryChart.linePoints}
                    isDarkMode={isDarkMode}
                  />
                </RemovableDashboardPanel>
              ) : null}

              {dashboardView.comparisonTable && !dismissedPanels.has('comparison') ? (
                <RemovableDashboardPanel
                  panelId="comparison"
                  isDarkMode={isDarkMode}
                  onRemove={dismissPanel}
                  className="mb-6"
                >
                  <section
                    className={`rounded-2xl border p-4 ${
                      isDarkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="mb-3 pr-7">
                      <p
                        className={`text-xs font-semibold ${
                          isDarkMode ? 'text-slate-100' : 'text-slate-800'
                        }`}
                      >
                        {dashboardView.comparisonTable.title}
                      </p>
                      <p
                        className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                      >
                        Aggregates from your data (prompt: compare / group by)
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead
                          className={`border-b ${
                            isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'
                          }`}
                        >
                          <tr>
                            {dashboardView.comparisonTable.headers.map((h) => (
                              <th key={h} className="py-2 pr-4 text-left font-medium">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody
                          className={
                            isDarkMode ? 'divide-y divide-slate-800' : 'divide-y divide-slate-100'
                          }
                        >
                          {dashboardView.comparisonTable.rows.map((row, ri) => (
                            <tr key={ri}>
                              {row.map((cell, ci) => (
                                <td
                                  key={ci}
                                  className={`py-2 pr-4 ${
                                    isDarkMode ? 'text-slate-300' : 'text-slate-700'
                                  }`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </RemovableDashboardPanel>
              ) : null}

              {dashboardView.showDataTable && !dismissedPanels.has('dataTable') ? (
              <RemovableDashboardPanel
                panelId="dataTable"
                isDarkMode={isDarkMode}
                onRemove={dismissPanel}
                className=""
              >
              <section
                className={`rounded-2xl border p-4 ${
                  isDarkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="mb-3 pr-7">
                  <p
                    className={`text-xs font-semibold ${
                      isDarkMode ? 'text-slate-100' : 'text-slate-800'
                    }`}
                  >
                    Data preview
                  </p>
                  <p
                    className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                  >
                    First rows from your datasource (up to {dashboardView.tableRowLimit})
                  </p>
                </div>
                <div className="overflow-x-auto">
                  {dashboardView.tableColumns.length > 0 ? (
                    <table className="min-w-full text-xs">
                      <thead
                        className={`border-b text-[11px] ${
                          isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'
                        }`}
                      >
                        <tr>
                          {dashboardView.tableColumns.map((col) => (
                            <th key={col} className="py-2 pr-3 text-left font-medium">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody
                        className={
                          isDarkMode ? 'divide-y divide-slate-800' : 'divide-y divide-slate-100'
                        }
                      >
                        {dashboardView.tableRows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className={`max-w-[14rem] py-2 pr-3 ${
                                  isDarkMode ? 'text-slate-300' : 'text-slate-700'
                                }`}
                              >
                                {truncateCell(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p
                      className={`py-8 text-center text-xs ${
                        isDarkMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      No columns to show. Connect a table or Excel sheet in XeroCode.ai, then build again.
                    </p>
                  )}
                </div>
              </section>
              </RemovableDashboardPanel>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
